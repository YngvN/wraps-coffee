import type { Client } from 'pg'
import type { OrderRecord } from '../src/types/order'
import type { AllergenCode, CategoryPrices, Price, Product } from '../src/types/product'
import type { Catalogue } from '../src/types/category'
import type { ContactInfo } from '../src/types/contactInfo'
import type { ContactMessage } from '../src/types/message'
import type { EventRecord } from '../src/types/event'
import type { WebsiteThemeProjection } from '../src/utils/websiteTheme'
import type { MessageBoardPost } from '../src/types/messageBoard'
import { computeProductOrderRanks } from '../src/utils/productCatalogue'
import { isProductOutOfStock } from '../src/utils/productStock'

/**
 * Row ↔ app-type mapping and the push/pull SQL for every key the Neon bridge
 * touches (see `neonBridge.ts`) — kept in its own file since it's pure
 * plumbing, distinct from the bridge's own connection/LISTEN/reconcile
 * orchestration. Column names and shapes here are hand-matched against the
 * website repo's own `netlify/database/migrations/` (`../wraps-ulven`) and its
 * `netlify/functions/*.ts` — there is no shared type package between the two
 * repos, so a schema change on either side needs a matching update here.
 *
 * That repo owns the DDL; this file is authoritative for what each column
 * *means*. Adding a column here means adding it there too — as a **new**
 * migration, never an edit to an applied one, since Netlify records those as
 * done and never re-reads them.
 */

/**
 * Advisory-lock keys, one per full-replace target.
 *
 * Every "replace the whole table" push is `delete` followed by re-`insert`
 * inside one transaction, and two of those running concurrently corrupt each
 * other: neither `delete` can see the other's uncommitted rows, so both
 * proceed to insert the same primary keys and the loser fails with a duplicate
 * key violation. Concurrency is entirely possible here — a bridge restart
 * while a reconciliation is still in flight is enough.
 *
 * A transaction-scoped advisory lock makes the second one wait instead. By the
 * time it proceeds, the first has committed, so its `delete` sees those rows
 * and clears them properly. The lock is released automatically on commit or
 * rollback, so there is nothing to leak.
 *
 * Distinct keys per table so unrelated pushes don't queue behind each other,
 * and each transaction only ever takes one — no lock ordering, no deadlock.
 */
const FULL_REPLACE_LOCKS = {
  products: 4_820_001,
  categoryPrices: 4_820_002,
  events: 4_820_003,
  messageBoard: 4_820_004,
} as const

/** Opens a transaction that serialises against any other full replace of the same table. */
async function beginFullReplace(client: Client, lockKey: number): Promise<void> {
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock($1)', [lockKey])
}

function priceColumns(price: Price | undefined): { price: number | null; price_takeaway: number | null; price_eat_in: number | null } {
  if (price === undefined) return { price: null, price_takeaway: null, price_eat_in: null }
  if (typeof price === 'number') return { price, price_takeaway: null, price_eat_in: null }
  return { price: null, price_takeaway: price.takeaway, price_eat_in: price.eatIn }
}

function priceFromColumns(price: string | null, priceTakeaway: string | null, priceEatIn: string | null): Price | undefined {
  if (price !== null) return Number(price)
  if (priceTakeaway !== null && priceEatIn !== null) return { takeaway: Number(priceTakeaway), eatIn: Number(priceEatIn) }
  return undefined
}

// --- products ----------------------------------------------------------------

interface ProductRow {
  item_id: string
  category: string
  name_no: string
  name_en: string
  description_no: string
  description_en: string
  price: string | null
  price_takeaway: string | null
  price_eat_in: string | null
  allergens: string[]
  available: boolean
  /**
   * Computed at push time from *this* repo's own `trackStock`/`stockQuantity`
   * (or the plain manual `outOfStock` checkbox when stock tracking is off) —
   * see `isProductOutOfStock` in `src/utils/productStock.ts`. The website
   * only ever needs the final "can this be ordered right now" answer, not
   * the raw stock count, so no quantity column is exposed here.
   *
   * Requires a matching migration on the *separate* website repo's own
   * `products` table (e.g. `alter table products add column out_of_stock
   * boolean not null default false;`) plus its own ordering flow actually
   * checking it before checkout — this file can prepare this app's own side
   * of that, but can't make the change in that other project.
   */
  out_of_stock: boolean
}

/**
 * The website's `products` table also has `category_order`/`product_order`
 * columns, deliberately absent from `ProductRow` above: they're written on
 * every push (see `pushProducts`) and never read back, since this app's own
 * copy of that order is authoritative — it's just array position, see
 * `computeProductOrderRanks`. Same posture as `updated_at`, which
 * `pullProducts` also doesn't select.
 *
 * They exist purely so the website can reproduce the admin's own
 * catalogue → category → product arrangement; without them its own `get-menu`
 * function has nothing to sort on but the product name, alphabetically.
 */
export async function pullProducts(client: Client): Promise<Product[]> {
  const { rows } = await client.query<ProductRow>(
    `select item_id, category, name_no, name_en, description_no, description_en, price, price_takeaway, price_eat_in, allergens, available, out_of_stock
     from products order by category, item_id`,
  )
  return rows.map((row) => ({
    itemID: row.item_id,
    category: row.category,
    name: { no: row.name_no, en: row.name_en },
    description: { no: row.description_no, en: row.description_en },
    price: priceFromColumns(row.price, row.price_takeaway, row.price_eat_in),
    allergens: (row.allergens ?? []) as AllergenCode[],
    // The public website's own `products` table has no dietary-tags column yet — this repo's own value never round-trips through it.
    dietaryTags: [],
    available: row.available,
    // Pulled back in as the plain manual flag — trackStock/stockQuantity are never round-tripped through the website, only their computed answer (see the ProductRow field's own doc comment above).
    outOfStock: row.out_of_stock,
  }))
}

/**
 * Full replace of the website's own `products` table, in the admin's own
 * catalogue → category → product display order.
 *
 * @param products Every product, in their current `admin.products` order.
 * @param catalogues Every catalogue, in their current `admin.catalogues` order
 *   — needed only to rank the products (see `computeProductOrderRanks`);
 *   catalogues themselves have no table on the website and are never pushed.
 */
export async function pushProducts(client: Client, products: Product[], catalogues: Catalogue[]): Promise<void> {
  const ranks = computeProductOrderRanks(products, catalogues)
  await beginFullReplace(client, FULL_REPLACE_LOCKS.products)
  try {
    await client.query('delete from products')
    // Only products `computeProductOrderRanks` gave a rank to are pushed — that is, ones belonging to a category that actually exists. This covers two cases at once. A product with no category at all (see `Product.catalogueId`) has nothing valid to put in the website's `NOT NULL` `category` column; rather than inventing a fake category id that would corrupt that separate project's own data, it's excluded (and would fail the whole transaction below if it weren't, since every product here is inserted inside one `begin`/`commit`). Revisit once that other schema supports a category-less product. A product whose `category` id no longer resolves to any real category (orphaned by a deleted category — see `UnassignedProductsModal`) is excluded for a different reason: it would otherwise reach the public menu grouped under a category that no longer exists.
    for (const product of products) {
      const rank = ranks.get(product.itemID)
      if (!rank) continue
      const cols = priceColumns(product.price)
      await client.query(
        `insert into products (item_id, category, name_no, name_en, description_no, description_en, price, price_takeaway, price_eat_in, allergens, available, out_of_stock, category_order, product_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          product.itemID,
          product.category,
          product.name.no,
          product.name.en,
          product.description.no,
          product.description.en,
          cols.price,
          cols.price_takeaway,
          cols.price_eat_in,
          product.allergens,
          product.available,
          isProductOutOfStock(product),
          rank.categoryOrder,
          rank.productOrder,
        ],
      )
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

// --- categoryPrices ------------------------------------------------------------

interface CategoryPriceRow {
  category: string
  price: string | null
  price_takeaway: string | null
  price_eat_in: string | null
}

export async function pullCategoryPrices(client: Client): Promise<CategoryPrices> {
  const { rows } = await client.query<CategoryPriceRow>('select category, price, price_takeaway, price_eat_in from category_prices')
  const result: CategoryPrices = {}
  for (const row of rows) {
    const price = priceFromColumns(row.price, row.price_takeaway, row.price_eat_in)
    if (price !== undefined) result[row.category] = price
  }
  return result
}

export async function pushCategoryPrices(client: Client, prices: CategoryPrices): Promise<void> {
  await beginFullReplace(client, FULL_REPLACE_LOCKS.categoryPrices)
  try {
    await client.query('delete from category_prices')
    for (const [category, price] of Object.entries(prices)) {
      const cols = priceColumns(price as Price)
      await client.query('insert into category_prices (category, price, price_takeaway, price_eat_in) values ($1,$2,$3,$4)', [
        category,
        cols.price,
        cols.price_takeaway,
        cols.price_eat_in,
      ])
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

// --- contactInfo (single row, id = 'main') --------------------------------------

interface ContactInfoRow {
  phone: string
  email: string
  address: string
  hours: ContactInfo['hours']
  temporarily_closed: boolean | null
  temporarily_closed_reason: string | null
}

export async function pullContactInfo(client: Client): Promise<ContactInfo | null> {
  const { rows } = await client.query<ContactInfoRow>(
    'select phone, email, address, hours, temporarily_closed, temporarily_closed_reason from contact_info where id = $1',
    ['main'],
  )
  const row = rows[0]
  if (!row) return null
  return {
    phone: row.phone,
    email: row.email,
    address: row.address,
    hours: row.hours,
    temporarilyClosed: row.temporarily_closed ?? false,
    temporarilyClosedReason: row.temporarily_closed_reason ?? undefined,
  }
}

export async function pushContactInfo(client: Client, info: ContactInfo): Promise<void> {
  await client.query(
    `insert into contact_info (id, phone, email, address, hours, temporarily_closed, temporarily_closed_reason, updated_at)
     values ('main', $1, $2, $3, $4::jsonb, $5, $6, now())
     on conflict (id) do update set phone = $1, email = $2, address = $3, hours = $4::jsonb, temporarily_closed = $5, temporarily_closed_reason = $6, updated_at = now()`,
    [info.phone, info.email, info.address, JSON.stringify(info.hours), info.temporarilyClosed ?? false, info.temporarilyClosedReason ?? null],
  )
}

// --- events ----------------------------------------------------------------

interface EventRow {
  event_id: string
  title_no: string
  title_en: string
  category: string
  date: string
  time: string
  end_time: string
  recurring: boolean
  recurrence: EventRecord['recurrence']
  exceptions: NonNullable<EventRecord['exceptions']>
  location: EventRecord['location']
  description_no: string
  description_en: string
  capacity: number
  attendees_count: number
  price: string
  currency: string
  tags: string[]
  participants: NonNullable<EventRecord['participants']>
  contact_person: EventRecord['contactPerson'] | null
  menu_items: EventRecord['menuItems']
  status: EventRecord['status']
  postponed_details: EventRecord['postponedDetails'] | null
  image_url: string
  registration_required: boolean
}

const EVENT_COLUMNS = `event_id, title_no, title_en, category, date, time, end_time, recurring, recurrence, exceptions, location,
  description_no, description_en, capacity, attendees_count, price, currency, tags, participants, contact_person, menu_items,
  status, postponed_details, image_url, registration_required`

export async function pullEvents(client: Client): Promise<EventRecord[]> {
  const { rows } = await client.query<EventRow>(`select ${EVENT_COLUMNS} from events order by date, time`)
  return rows.map((row) => ({
    eventID: row.event_id,
    title: { no: row.title_no, en: row.title_en },
    category: row.category,
    date: row.date,
    time: row.time,
    endTime: row.end_time,
    recurring: row.recurring,
    recurrence: row.recurrence,
    exceptions: row.exceptions,
    location: row.location,
    description: { no: row.description_no, en: row.description_en },
    capacity: row.capacity,
    attendeesCount: row.attendees_count,
    price: Number(row.price),
    currency: row.currency,
    tags: row.tags,
    participants: row.participants,
    contactPerson: row.contact_person ?? undefined,
    menuItems: row.menu_items,
    status: row.status,
    postponedDetails: row.postponed_details ?? { newDate: null, newTime: null, newEndTime: null },
    imageUrl: row.image_url,
    registrationRequired: row.registration_required,
  }))
}

export async function pushEvents(client: Client, events: EventRecord[]): Promise<void> {
  await beginFullReplace(client, FULL_REPLACE_LOCKS.events)
  try {
    await client.query('delete from events')
    for (const event of events) {
      await client.query(
        `insert into events (${EVENT_COLUMNS})
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21::jsonb,$22,$23::jsonb,$24,$25)`,
        [
          event.eventID,
          event.title.no,
          event.title.en,
          event.category,
          event.date,
          event.time,
          event.endTime,
          event.recurring,
          event.recurrence ? JSON.stringify(event.recurrence) : null,
          JSON.stringify(event.exceptions ?? []),
          JSON.stringify(event.location),
          event.description.no,
          event.description.en,
          event.capacity,
          event.attendeesCount,
          event.price,
          event.currency,
          event.tags,
          JSON.stringify(event.participants ?? []),
          event.contactPerson ? JSON.stringify(event.contactPerson) : null,
          JSON.stringify(event.menuItems),
          event.status,
          JSON.stringify(event.postponedDetails),
          event.imageUrl,
          event.registrationRequired,
        ],
      )
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

// --- messages (pull-only creation; `read` pushes back) --------------------------

interface MessageRow {
  id: string
  name: string
  email: string
  subject: string
  message: string
  received_at: string
  read: boolean
}

export async function pullMessages(client: Client): Promise<ContactMessage[]> {
  const { rows } = await client.query<MessageRow>('select id, name, email, subject, message, received_at, read from messages order by received_at desc')
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    receivedAt: new Date(row.received_at).toISOString(),
    read: row.read,
  }))
}

/** Only ever `UPDATE`s the mutable `read` flag by id — never inserts/deletes, since a message's existence is Neon's (the public site's) to own. */
export async function pushMessagesReadStatus(client: Client, messages: ContactMessage[]): Promise<void> {
  for (const message of messages) {
    await client.query('update messages set read = $1 where id = $2', [message.read, message.id])
  }
}

// --- orders (pull; `status` pushes back) ------------------------------------

interface OrderRow {
  id: string
  items: OrderRecord['items']
  total_price: string
  customer_name: string
  customer_phone: string
  pickup_time: string
  notes: string | null
  status: OrderRecord['status']
  created_at: string
}

export async function pullOrders(client: Client): Promise<OrderRecord[]> {
  const { rows } = await client.query<OrderRow>(
    'select id, items, total_price, customer_name, customer_phone, pickup_time, notes, status, created_at from orders order by created_at desc',
  )
  return rows.map((row) => ({
    id: row.id,
    items: row.items,
    totalPrice: Number(row.total_price),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    pickupTime: row.pickup_time,
    notes: row.notes ?? undefined,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

/** Only ever `UPDATE`s the mutable `status` field by id — never inserts/deletes, since an order's existence and its core fields (items, customer, price) are Neon's (the public site's) to own. */
export async function pushOrdersStatus(client: Client, orders: OrderRecord[]): Promise<void> {
  for (const order of orders) {
    await client.query('update orders set status = $1, updated_at = now() where id = $2', [order.status, order.id])
  }
}

// --- message board (push-only; already-filtered to public posts) -----------------

/**
 * Full replace of the `message_board` table with `posts` — always the
 * *already-computed* public subset (see `neonBridge.ts`'s
 * `computePublicMessageBoardPosts`), never the full local dataset. This
 * table has no `board_id` column at all: it's a one-way, filtered mirror,
 * not a live copy of every board — there is deliberately no `pullMessageBoard`.
 */
export async function pushMessageBoard(client: Client, posts: MessageBoardPost[]): Promise<void> {
  await beginFullReplace(client, FULL_REPLACE_LOCKS.messageBoard)
  try {
    await client.query('delete from message_board')
    for (const post of posts) {
      await client.query(
        `insert into message_board (id, title, body, image_url, author_username, pinned, expires_at, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9, now()))`,
        [post.id, post.title, post.body, post.imageUrl ?? '', post.authorUsername, Boolean(post.pinned), post.expiresAt ?? null, post.createdAt, post.updatedAt ?? null],
      )
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

// --- site theme (push-only; the active theme, already resolved) ------------------

/**
 * Upserts the single `site_theme` row with the cafe's active appearance theme.
 *
 * A one-way, *lossy* mirror in the same spirit as `message_board`: the website
 * gets the one theme currently applied, with its `websiteRoles` already
 * resolved from palette-colour ids to hex values (see
 * `toWebsiteThemeProjection`), never the full list of themes this app manages.
 * There is deliberately no `pullSiteTheme` — pulling this back would collapse
 * every saved theme into the projection of one.
 *
 * `fonts` and `colors` go in as `jsonb` so the set of roles can grow without a
 * schema migration on a table two repos share. A role the admin hasn't mapped
 * is simply absent, and the website falls back to its own built-in value.
 *
 * @param client A connected pg client.
 * @param projection The active theme's fonts and resolved colours.
 */
export async function pushSiteTheme(client: Client, projection: WebsiteThemeProjection): Promise<void> {
  await client.query(
    `insert into site_theme (id, fonts, colors, updated_at)
     values ('main', $1::jsonb, $2::jsonb, now())
     on conflict (id) do update set fonts = $1::jsonb, colors = $2::jsonb, updated_at = now()`,
    [JSON.stringify(projection.fonts), JSON.stringify(projection.colors)],
  )
}
