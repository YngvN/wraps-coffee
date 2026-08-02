import type { LanguageCode } from '../../../i18n'
import type { FieldConfidence } from '../../../lib/localServer'
import type { AppearanceTheme, AppearanceThemeColor } from '../../../types/appearanceTheme'
import type { Catalogue, Category } from '../../../types/category'
import type { ContactInfo, DayHours } from '../../../types/contactInfo'
import type { CustomFieldDefinition } from '../../../types/customFields'
import type { EventRecord } from '../../../types/event'
import type { MessageBoard, MessageBoardPost } from '../../../types/messageBoard'
import { NEWS_SOURCES } from '../../../types/news'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag, type Discount, type Price, type Product } from '../../../types/product'
import type { StoreSettings } from '../../../types/storeSettings'
import { formatPrice } from '../../../utils/price'

type Translate = (key: string, vars?: Record<string, string | number>) => string

/** One line of the compact AI-review summary — `oldValue: null` renders without an arrow (a brand-new record, or a newly-appended item in an append-only list). `confidence` (only ever set for the ingestion entities — product/category/catalogue — that pass a `fieldConfidence` map into their own row builder) drives `AssistantReviewSummary`'s confidence styling; omitted entirely for every other entity, same as before this existed. See `AssistantReviewSummary.tsx`. */
export interface ReviewChangeRow {
  label: string
  oldValue: string | null
  newValue: string
  confidence?: FieldConfidence
}

const EMPTY_VALUE = '—'

/**
 * Adds one row, but only when there's actually something worth showing: on `update` (`oldRaw` not
 * `null`) only if the value actually changed; on `create` (`oldRaw === null`) only if a real value
 * was proposed *or* `confidence` is explicitly `'unknown'` — an ingestion draft's own genuinely
 * unset field still gets a row (rendered as an empty "fill this in" placeholder, see
 * `AssistantReviewSummary.tsx`) rather than silently vanishing, so the admin can see it exists.
 * Every caller that never passes `confidence` keeps today's exact drop-silently behavior — zero
 * change for the non-ingestion entities.
 */
function pushRow(rows: ReviewChangeRow[], label: string, oldRaw: string | null, newRaw: string, confidence?: FieldConfidence): void {
  if (oldRaw === null) {
    if (newRaw.trim() === '') {
      if (confidence !== 'unknown') return
      rows.push({ label, oldValue: null, newValue: '', confidence })
      return
    }
    rows.push({ label, oldValue: null, newValue: newRaw, confidence })
    return
  }
  if (oldRaw === newRaw) return
  rows.push({ label, oldValue: oldRaw.trim() === '' ? EMPTY_VALUE : oldRaw, newValue: newRaw.trim() === '' ? EMPTY_VALUE : newRaw, confidence })
}

/** Combines the confidence of several underlying schema fields that together produce one displayed row (e.g. a product's price is built from `priceMode` + `flatPrice`/`takeawayPrice`/`eatInPrice`) — worst-of-the-set, so a row showing any unknown/inferred contributor never reads as fully verbatim. `undefined` (no styling) when `fieldConfidence` itself wasn't passed, or none of the given keys are in it. */
function worstConfidence(fieldConfidence: Record<string, FieldConfidence> | undefined, ...keys: string[]): FieldConfidence | undefined {
  if (!fieldConfidence) return undefined
  const values = keys.map((key) => fieldConfidence[key]).filter((value): value is FieldConfidence => value !== undefined)
  if (values.length === 0) return undefined
  if (values.includes('unknown')) return 'unknown'
  if (values.includes('inferred')) return 'inferred'
  return 'verbatim'
}

function bilingual(value: { no: string; en: string } | undefined, language: LanguageCode): string {
  return value?.[language] ?? ''
}

function formatBoolean(t: Translate, value: boolean | undefined): string {
  return value ? t('admin.common.yes') : t('admin.common.no')
}

function formatPriceValue(t: Translate, price: Price | undefined): string {
  return price === undefined ? '' : formatPrice(price, t)
}

function formatDiscountValue(t: Translate, discount: Discount | undefined): string {
  if (!discount) return ''
  return discount.type === 'percentage' ? `${discount.percentage}%` : t('menu.price', { price: discount.amount })
}

function formatAllergens(t: Translate, codes: AllergenCode[]): string {
  return codes.map((code) => t(`menu.allergens.items.${ALLERGEN_OPTIONS.find((option) => option.code === code)?.i18nKey}.title`)).join(', ')
}

function formatDietaryTags(t: Translate, tags: DietaryTag[]): string {
  return DIETARY_TAG_ORDER.filter((tag) => tags.includes(tag))
    .map((tag) => t(`menu.dietaryTags.items.${tag}.title`))
    .join(', ')
}

function formatProductLocation(product: Product, categories: Category[], catalogues: Catalogue[], language: LanguageCode): string {
  if (product.category) return categories.find((category) => category.id === product.category)?.name[language] ?? ''
  if (product.catalogueId) return catalogues.find((catalogue) => catalogue.id === product.catalogueId)?.name[language] ?? ''
  return ''
}

function formatCustomFieldValue(t: Translate, field: CustomFieldDefinition, value: string | number | boolean | undefined, language: LanguageCode): string {
  if (value === undefined) return ''
  if (field.type === 'boolean') return formatBoolean(t, Boolean(value))
  if (field.type === 'select') return field.options?.find((option) => option.id === value)?.label[language] ?? String(value)
  return String(value)
}

export function buildProductChangeRows(
  t: Translate,
  reviewLanguage: LanguageCode,
  current: Product | null,
  draft: Product,
  categories: Category[],
  catalogues: Catalogue[],
  /** Only ever set for an ingestion draft (see `steps.ts`'s `fillFields`) — keyed by the raw `ProductFields` schema property names, not this file's own row labels. Omitted for a manually-edited draft, same as before this existed. */
  fieldConfidence?: Record<string, FieldConfidence>,
): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null

  pushRow(rows, t('admin.products.nameLabel'), isCreate ? null : bilingual(current.name, reviewLanguage), bilingual(draft.name, reviewLanguage), fieldConfidence?.name)
  pushRow(
    rows,
    t('admin.products.descriptionLabel'),
    isCreate ? null : bilingual(current.description, reviewLanguage),
    bilingual(draft.description, reviewLanguage),
    fieldConfidence?.description,
  )
  pushRow(
    rows,
    t('admin.products.categoryLabel'),
    isCreate ? null : formatProductLocation(current, categories, catalogues, reviewLanguage),
    formatProductLocation(draft, categories, catalogues, reviewLanguage),
    fieldConfidence?.location,
  )
  pushRow(
    rows,
    t('admin.products.priceLabel'),
    isCreate ? null : formatPriceValue(t, current.price),
    formatPriceValue(t, draft.price),
    worstConfidence(fieldConfidence, 'priceMode', 'flatPrice', 'takeawayPrice', 'eatInPrice'),
  )
  pushRow(
    rows,
    t('admin.products.discountLabel'),
    isCreate ? null : formatDiscountValue(t, current.discount),
    formatDiscountValue(t, draft.discount),
    worstConfidence(fieldConfidence, 'discountMode', 'discountPercentage', 'discountAmount'),
  )
  pushRow(rows, t('admin.products.allergensLabel'), isCreate ? null : formatAllergens(t, current.allergens), formatAllergens(t, draft.allergens), fieldConfidence?.allergens)
  pushRow(
    rows,
    t('admin.products.dietaryTagsLabel'),
    isCreate ? null : formatDietaryTags(t, current.dietaryTags),
    formatDietaryTags(t, draft.dietaryTags),
    fieldConfidence?.dietaryTags,
  )
  pushRow(rows, t('admin.products.availableLabel'), isCreate ? null : formatBoolean(t, current.available), formatBoolean(t, draft.available), fieldConfidence?.available)
  pushRow(rows, t('admin.products.outOfStockLabel'), isCreate ? null : formatBoolean(t, current.outOfStock), formatBoolean(t, draft.outOfStock), fieldConfidence?.outOfStock)
  pushRow(rows, t('admin.products.trackStockLabel'), isCreate ? null : formatBoolean(t, current.trackStock), formatBoolean(t, draft.trackStock), fieldConfidence?.trackStock)
  pushRow(
    rows,
    t('admin.products.stockQuantityLabel'),
    isCreate ? null : String(current.stockQuantity ?? ''),
    String(draft.stockQuantity ?? ''),
    fieldConfidence?.stockQuantity,
  )

  const owningCategory = categories.find((category) => category.id === draft.category)
  for (const field of owningCategory?.customFields ?? []) {
    pushRow(
      rows,
      field.label[reviewLanguage],
      isCreate ? null : formatCustomFieldValue(t, field, current.customFieldValues?.[field.id], reviewLanguage),
      formatCustomFieldValue(t, field, draft.customFieldValues?.[field.id], reviewLanguage),
    )
  }

  return rows
}

const EVENT_STATUS_LABEL_KEYS: Record<EventRecord['status'], string> = {
  scheduled: 'admin.events.statusScheduledLabel',
  postponed: 'admin.events.statusPostponedLabel',
  cancelled: 'admin.events.statusCancelledLabel',
}

export function buildEventChangeRows(t: Translate, reviewLanguage: LanguageCode, current: EventRecord | null, draft: EventRecord): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null

  pushRow(rows, t('admin.events.titleLabel'), isCreate ? null : bilingual(current.title, reviewLanguage), bilingual(draft.title, reviewLanguage))
  pushRow(rows, t('admin.events.descriptionLabel'), isCreate ? null : bilingual(current.description, reviewLanguage), bilingual(draft.description, reviewLanguage))
  pushRow(rows, t('admin.events.categoryLabel'), isCreate ? null : current.category, draft.category)
  pushRow(rows, t('admin.events.dateLabel'), isCreate ? null : current.date, draft.date)
  pushRow(rows, t('admin.events.timeLabel'), isCreate ? null : current.time, draft.time)
  pushRow(rows, t('admin.events.endTimeLabel'), isCreate ? null : current.endTime, draft.endTime)
  pushRow(rows, t('admin.events.locationAddressLabel'), isCreate ? null : current.location.address, draft.location.address)
  pushRow(rows, t('admin.events.capacityLabel'), isCreate ? null : String(current.capacity), String(draft.capacity))
  pushRow(rows, t('admin.events.priceLabel'), isCreate ? null : t('menu.price', { price: current.price }), t('menu.price', { price: draft.price }))
  pushRow(rows, t('admin.events.repeatsWeeklyLabel'), isCreate ? null : formatBoolean(t, current.recurring), formatBoolean(t, draft.recurring))
  if (draft.recurring || current?.recurring) {
    pushRow(rows, t('admin.events.dayOfWeekLabel'), isCreate ? null : String(current.recurrence?.dayOfWeek ?? ''), String(draft.recurrence?.dayOfWeek ?? ''))
  }
  pushRow(rows, t('admin.events.statusLabel'), isCreate ? null : t(EVENT_STATUS_LABEL_KEYS[current.status]), t(EVENT_STATUS_LABEL_KEYS[draft.status]))
  if (draft.status === 'postponed') {
    pushRow(rows, t('admin.events.postponedNewDateLabel'), isCreate ? null : current.postponedDetails.newDate ?? '', draft.postponedDetails.newDate ?? '')
    pushRow(rows, t('admin.events.postponedNewTimeLabel'), isCreate ? null : current.postponedDetails.newTime ?? '', draft.postponedDetails.newTime ?? '')
    pushRow(rows, t('admin.events.postponedNewEndTimeLabel'), isCreate ? null : current.postponedDetails.newEndTime ?? '', draft.postponedDetails.newEndTime ?? '')
  }
  return rows
}

export function buildCatalogueChangeRows(
  t: Translate,
  reviewLanguage: LanguageCode,
  current: Catalogue | null,
  draft: Catalogue,
  /** Only ever set for an ingestion draft — keyed by the raw catalogue schema property names (`name`/`priceMode`/`flatPrice`). Omitted for a manually-edited draft. */
  fieldConfidence?: Record<string, FieldConfidence>,
): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null
  pushRow(rows, t('admin.products.catalogueNameLabel'), isCreate ? null : bilingual(current.name, reviewLanguage), bilingual(draft.name, reviewLanguage), fieldConfidence?.name)
  pushRow(
    rows,
    t('admin.products.cataloguePriceLabel'),
    isCreate ? null : formatPriceValue(t, current.price),
    formatPriceValue(t, draft.price),
    worstConfidence(fieldConfidence, 'priceMode', 'flatPrice'),
  )
  return rows
}

export function buildCategoryChangeRows(
  t: Translate,
  reviewLanguage: LanguageCode,
  current: Category | null,
  draft: Category & { defaultPrice?: Price },
  currentDefaultPrice: Price | undefined,
  /** Only ever set for an ingestion draft — keyed by the raw category schema property names (`name`/`description`/`priceMode`/`flatPrice`/`takeawayPrice`/`eatInPrice`). Omitted for a manually-edited draft. */
  fieldConfidence?: Record<string, FieldConfidence>,
): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null

  pushRow(rows, t('admin.products.categoryNameLabel'), isCreate ? null : bilingual(current.name, reviewLanguage), bilingual(draft.name, reviewLanguage), fieldConfidence?.name)
  pushRow(
    rows,
    t('admin.products.categoryDescriptionLabel'),
    isCreate ? null : bilingual(current.description, reviewLanguage),
    bilingual(draft.description, reviewLanguage),
    fieldConfidence?.description,
  )
  if (draft.defaultPrice !== undefined) {
    pushRow(
      rows,
      t('admin.products.categoryPriceLabel'),
      isCreate ? null : formatPriceValue(t, currentDefaultPrice),
      formatPriceValue(t, draft.defaultPrice),
      worstConfidence(fieldConfidence, 'priceMode', 'flatPrice', 'takeawayPrice', 'eatInPrice'),
    )
  }
  if (isCreate) {
    for (const field of draft.customFields ?? []) {
      rows.push({ label: t('admin.products.customFieldsLabel'), oldValue: null, newValue: `${field.label[reviewLanguage]} (${field.type})` })
    }
  }
  return rows
}

/** `categoryCustomField`'s draft is "append one new field" (see its own server adapter's doc comment) — the only diff-worthy content is whichever field(s) in `draft.fields` aren't already in `current`. */
export function buildCategoryCustomFieldChangeRows(t: Translate, reviewLanguage: LanguageCode, current: CustomFieldDefinition[], draft: { fields: CustomFieldDefinition[] }): ReviewChangeRow[] {
  return draft.fields
    .filter((field) => !current.some((existing) => existing.id === field.id))
    .map((field) => ({ label: t('admin.products.customFieldsLabel'), oldValue: null, newValue: `${field.label[reviewLanguage]} (${field.type})` }))
}

export function buildMessageBoardChangeRows(t: Translate, current: MessageBoard | null, draft: MessageBoard): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  pushRow(rows, t('admin.messageBoard.boardNameLabel'), current === null ? null : current.name, draft.name)
  return rows
}

export function buildMessageBoardPostChangeRows(t: Translate, current: MessageBoardPost | null, draft: MessageBoardPost, boardName: string): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null
  // `boardId` is create-only — an update never moves a post to a different board (see the adapter's own doc comment) — so it's only ever worth showing once, as a plain informational row on create.
  if (isCreate) rows.push({ label: t('admin.messageBoard.boardNameLabel'), oldValue: null, newValue: boardName })
  pushRow(rows, t('admin.messageBoard.titleLabel'), isCreate ? null : current.title, draft.title)
  pushRow(rows, t('admin.messageBoard.bodyLabel'), isCreate ? null : current.body, draft.body)
  pushRow(rows, t('admin.messageBoard.pinnedLabel'), isCreate ? null : formatBoolean(t, current.pinned), formatBoolean(t, draft.pinned))
  pushRow(rows, t('admin.messageBoard.expiresAtLabel'), isCreate ? null : (current.expiresAt ?? '').slice(0, 10), (draft.expiresAt ?? '').slice(0, 10))
  return rows
}

/** `appearanceThemeColor`'s draft is "append one new color" — same "one appended item" shape as `categoryCustomField`. */
export function buildAppearanceThemeColorChangeRows(t: Translate, current: AppearanceThemeColor[], draft: { colors: AppearanceThemeColor[] }): ReviewChangeRow[] {
  return draft.colors
    .filter((color) => !current.some((existing) => existing.id === color.id))
    .map((color) => ({ label: t('admin.appearance.colorsLabel'), oldValue: null, newValue: color.hex }))
}

export function buildThemeChangeRows(t: Translate, current: AppearanceTheme | null, draft: AppearanceTheme): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null
  pushRow(rows, t('admin.appearance.nameLabel'), isCreate ? null : current.name, draft.name)
  pushRow(rows, t('admin.appearance.bodyFontLabel'), isCreate ? null : current.fonts.body, draft.fonts.body)
  pushRow(rows, t('admin.appearance.headingFontLabel'), isCreate ? null : current.fonts.heading, draft.fonts.heading)
  pushRow(rows, t('admin.appearance.subheadingFontLabel'), isCreate ? null : current.fonts.subheading, draft.fonts.subheading)
  return rows
}

export function buildStoreSettingsChangeRows(t: Translate, current: StoreSettings | null, draft: StoreSettings): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null
  pushRow(rows, t('admin.store.nameLabel'), isCreate ? null : current.name, draft.name)
  pushRow(rows, t('admin.store.sloganLabel'), isCreate ? null : current.slogan ?? '', draft.slogan ?? '')
  pushRow(rows, t('admin.store.faviconCardTitle'), isCreate ? null : current.favicon ?? '', draft.favicon ?? '')
  const addedLogos = draft.logos.filter((logo) => !(current?.logos ?? []).includes(logo))
  for (const logo of addedLogos) rows.push({ label: t('admin.store.logosCardTitle'), oldValue: null, newValue: logo })
  return rows
}

const CONTACT_WEEKDAYS: (keyof ContactInfo['hours'])[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function formatDayHours(t: Translate, hours: DayHours): string {
  return hours.closed ? t('admin.contact.closedLabel') : `${hours.open ?? ''}–${hours.close ?? ''}`
}

export function buildContactInfoChangeRows(t: Translate, current: ContactInfo | null, draft: ContactInfo): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null
  pushRow(rows, t('admin.contact.phoneLabel'), isCreate ? null : current.phone, draft.phone)
  pushRow(rows, t('admin.contact.emailLabel'), isCreate ? null : current.email, draft.email)
  pushRow(rows, t('admin.contact.addressLabel'), isCreate ? null : current.address, draft.address)
  for (const day of CONTACT_WEEKDAYS) {
    pushRow(rows, t(`footer.hours.${day}`), isCreate ? null : formatDayHours(t, current.hours[day]), formatDayHours(t, draft.hours[day]))
  }
  return rows
}

export function buildIntegrationToggleChangeRows(
  t: Translate,
  current: { enabled: boolean; sourceIds?: string[] },
  draft: { integration: 'weather' | 'transit' | 'entur' | 'news'; enabled: boolean; sourceIds?: string[] },
  integrationLabel: string,
): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  pushRow(rows, integrationLabel, formatBoolean(t, current.enabled), formatBoolean(t, draft.enabled))
  if (draft.integration === 'news') {
    const sourceName = (id: string) => NEWS_SOURCES.find((source) => source.id === id)?.name ?? id
    pushRow(rows, t('admin.integrations.newsSourcesLabel'), (current.sourceIds ?? []).map(sourceName).join(', '), (draft.sourceIds ?? []).map(sourceName).join(', '))
  }
  return rows
}
