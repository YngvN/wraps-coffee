import type { Client } from 'pg'
import type { OrderRecord } from '../src/types/order'
import type { AllergenCode, CategoryPrices, Price, Product } from '../src/types/product'
import type { ContactInfo } from '../src/types/contactInfo'
import type { ContactMessage } from '../src/types/message'
import type { EventRecord } from '../src/types/event'
import type { MessageBoardPost } from '../src/types/messageBoard'

/**
 * Row ↔ app-type mapping and the push/pull SQL for every key the Neon bridge
 * touches (see `neonBridge.ts`) — kept in its own file since it's pure
 * plumbing, distinct from the bridge's own connection/LISTEN/reconcile
 * orchestration. Column names and shapes here are hand-matched against
 * `Website/db/schema.sql` and that project's own `netlify/functions/*.ts` —
 * there is no shared type package between the two repos, so a schema change
 * on either side needs a matching update here.
 */

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
}

export async function pullProducts(client: Client): Promise<Product[]> {
  const { rows } = await client.query<ProductRow>(
    `select item_id, category, name_no, name_en, description_no, description_en, price, price_takeaway, price_eat_in, allergens, available
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
  }))
}

export async function pushProducts(client: Client, products: Product[]): Promise<void> {
  await client.query('begin')
  try {
    await client.query('delete from products')
    for (const product of products) {
      const cols = priceColumns(product.price)
      await client.query(
        `insert into products (item_id, category, name_no, name_en, description_no, description_en, price, price_takeaway, price_eat_in, allergens, available)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
  await client.query('begin')
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
}

export async function pullContactInfo(client: Client): Promise<ContactInfo | null> {
  const { rows } = await client.query<ContactInfoRow>('select phone, email, address, hours from contact_info where id = $1', ['main'])
  const row = rows[0]
  return row ? { phone: row.phone, email: row.email, address: row.address, hours: row.hours } : null
}

export async function pushContactInfo(client: Client, info: ContactInfo): Promise<void> {
  await client.query(
    `insert into contact_info (id, phone, email, address, hours, updated_at) values ('main', $1, $2, $3, $4::jsonb, now())
     on conflict (id) do update set phone = $1, email = $2, address = $3, hours = $4::jsonb, updated_at = now()`,
    [info.phone, info.email, info.address, JSON.stringify(info.hours)],
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
  await client.query('begin')
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
  await client.query('begin')
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
