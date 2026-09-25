import type { ClockFormat } from '../../../hooks/useClockFormatPreference'
import type { DateFormat } from '../../../hooks/useDateFormatPreference'
import { availableLanguages, type LanguageCode } from '../../../i18n'
import type { FieldConfidence } from '../../../lib/localServer'
import type { AppearanceTheme, AppearanceThemeColor } from '../../../types/appearanceTheme'
import type { Catalogue, Category } from '../../../types/category'
import type { ContactInfo, DayHours } from '../../../types/contactInfo'
import type { CustomFieldDefinition } from '../../../types/customFields'
import type { DisplayMaxImagePx, DisplayRenderWidth } from '../../../types/displayMachine'
import type { EventRecord } from '../../../types/event'
import type { MessageBoard, MessageBoardPost } from '../../../types/messageBoard'
import { NEWS_SOURCES } from '../../../types/news'
import { DEFAULT_RAW_PRINTER_PORT, type PrinterDraft } from '../../../types/printer'
import type { OrderRecord } from '../../../types/order'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag, type Discount, type Price, type Product } from '../../../types/product'
import type { PreviewAspectRatio, ScreenConfig } from '../../../types/screen'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import type { StoreSettings } from '../../../types/storeSettings'
import { resolveBilingualField } from '../../../utils/bilingual'
import { formatPrice } from '../../../utils/price'
import { NAV_ITEMS } from '../layout/adminNavItems'

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

/** Combines the confidence of several underlying schema fields that together produce one displayed row (e.g. a product's price is built from `priceMode` + `flatPrice`/`takeawayPrice`/`eatInPrice`) — worst-of-the-set, so a row showing any unknown/inferred contributor never reads as fully verbatim. `undefined` (no styling) when `fieldConfidence` itself wasn't passed, or none of the given keys are in it. Callers must only pass keys that are actually active for the mode in play (see `priceConfidenceKeys`/`discountConfidenceKeys`) — an unused sibling field (e.g. `takeawayPrice` in flat-price mode) is legitimately null/`'unknown'` and must never be included, or it drags an otherwise-solid row down to "Fill this in". */
function worstConfidence(fieldConfidence: Record<string, FieldConfidence> | undefined, ...keys: string[]): FieldConfidence | undefined {
  if (!fieldConfidence) return undefined
  const values = keys.map((key) => fieldConfidence[key]).filter((value): value is FieldConfidence => value !== undefined)
  if (values.length === 0) return undefined
  if (values.includes('unknown')) return 'unknown'
  if (values.includes('inferred')) return 'inferred'
  return 'verbatim'
}

/** Which of `flatPrice`/`takeawayPrice`/`eatInPrice` is actually relevant, inferred from the proposed price's own shape rather than a separately-tracked mode field — mirrors the same shape-based branching already used in `product.ts`/`category.ts`'s own `mergeDraft` and `ProductForm.tsx`'s field-disabling. */
function priceConfidenceKeys(price: Price | undefined): string[] {
  if (typeof price === 'number') return ['flatPrice']
  if (price !== undefined) return ['takeawayPrice', 'eatInPrice']
  return []
}

/** Same idea as `priceConfidenceKeys`, for `discountPercentage`/`discountAmount`. */
function discountConfidenceKeys(discount: Discount | undefined): string[] {
  if (discount?.type === 'percentage') return ['discountPercentage']
  if (discount?.type === 'amount') return ['discountAmount']
  return []
}

function bilingual(value: { no: string; en: string } | undefined, language: LanguageCode): string {
  return resolveBilingualField(value, language)
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
  if (product.category) return resolveBilingualField(categories.find((category) => category.id === product.category)?.name, language)
  if (product.catalogueId) return resolveBilingualField(catalogues.find((catalogue) => catalogue.id === product.catalogueId)?.name, language)
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
    worstConfidence(fieldConfidence, 'priceMode', ...priceConfidenceKeys(draft.price)),
  )
  pushRow(
    rows,
    t('admin.products.discountLabel'),
    isCreate ? null : formatDiscountValue(t, current.discount),
    formatDiscountValue(t, draft.discount),
    worstConfidence(fieldConfidence, 'discountMode', ...discountConfidenceKeys(draft.discount)),
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
  pushRow(rows, t('admin.products.readyToServeLabel'), isCreate ? null : formatBoolean(t, current.readyToServe), formatBoolean(t, draft.readyToServe), fieldConfidence?.readyToServe)
  pushRow(rows, t('admin.products.barcodeLabel'), isCreate ? null : (current.barcode ?? ''), draft.barcode ?? '', fieldConfidence?.barcode)

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

export function buildEventChangeRows(
  t: Translate,
  reviewLanguage: LanguageCode,
  current: EventRecord | null,
  draft: EventRecord,
  /** Only ever set for an ingestion draft — keyed by the raw `EventFields` schema property names (`title`/`description`/`category`/`date`/`time`/`endTime`/`locationAddress`/`capacity`/`price`/`repeatsWeekly`/`dayOfWeek`/`status`/`postponedNewDate`/`postponedNewTime`/`postponedNewEndTime`) — every row here maps 1:1 onto one of those, unlike product's merged `location`/price fields. Omitted for a manually-edited draft. */
  fieldConfidence?: Record<string, FieldConfidence>,
): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null

  pushRow(rows, t('admin.events.titleLabel'), isCreate ? null : bilingual(current.title, reviewLanguage), bilingual(draft.title, reviewLanguage), fieldConfidence?.title)
  pushRow(
    rows,
    t('admin.events.descriptionLabel'),
    isCreate ? null : bilingual(current.description, reviewLanguage),
    bilingual(draft.description, reviewLanguage),
    fieldConfidence?.description,
  )
  pushRow(rows, t('admin.events.categoryLabel'), isCreate ? null : current.category, draft.category, fieldConfidence?.category)
  pushRow(rows, t('admin.events.dateLabel'), isCreate ? null : current.date, draft.date, fieldConfidence?.date)
  pushRow(rows, t('admin.events.timeLabel'), isCreate ? null : current.time, draft.time, fieldConfidence?.time)
  pushRow(rows, t('admin.events.endTimeLabel'), isCreate ? null : current.endTime, draft.endTime, fieldConfidence?.endTime)
  pushRow(
    rows,
    t('admin.events.locationAddressLabel'),
    isCreate ? null : current.location.address,
    draft.location.address,
    fieldConfidence?.locationAddress,
  )
  pushRow(rows, t('admin.events.capacityLabel'), isCreate ? null : String(current.capacity), String(draft.capacity), fieldConfidence?.capacity)
  pushRow(
    rows,
    t('admin.events.priceLabel'),
    isCreate ? null : t('menu.price', { price: current.price }),
    t('menu.price', { price: draft.price }),
    fieldConfidence?.price,
  )
  pushRow(
    rows,
    t('admin.events.repeatsWeeklyLabel'),
    isCreate ? null : formatBoolean(t, current.recurring),
    formatBoolean(t, draft.recurring),
    fieldConfidence?.repeatsWeekly,
  )
  if (draft.recurring || current?.recurring) {
    pushRow(
      rows,
      t('admin.events.dayOfWeekLabel'),
      isCreate ? null : String(current.recurrence?.dayOfWeek ?? ''),
      String(draft.recurrence?.dayOfWeek ?? ''),
      fieldConfidence?.dayOfWeek,
    )
  }
  pushRow(
    rows,
    t('admin.events.statusLabel'),
    isCreate ? null : t(EVENT_STATUS_LABEL_KEYS[current.status]),
    t(EVENT_STATUS_LABEL_KEYS[draft.status]),
    fieldConfidence?.status,
  )
  if (draft.status === 'postponed') {
    pushRow(
      rows,
      t('admin.events.postponedNewDateLabel'),
      isCreate ? null : current.postponedDetails.newDate ?? '',
      draft.postponedDetails.newDate ?? '',
      fieldConfidence?.postponedNewDate,
    )
    pushRow(
      rows,
      t('admin.events.postponedNewTimeLabel'),
      isCreate ? null : current.postponedDetails.newTime ?? '',
      draft.postponedDetails.newTime ?? '',
      fieldConfidence?.postponedNewTime,
    )
    pushRow(
      rows,
      t('admin.events.postponedNewEndTimeLabel'),
      isCreate ? null : current.postponedDetails.newEndTime ?? '',
      draft.postponedDetails.newEndTime ?? '',
      fieldConfidence?.postponedNewEndTime,
    )
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
      worstConfidence(fieldConfidence, 'priceMode', ...priceConfidenceKeys(draft.defaultPrice)),
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

/** Where a printer is, as one review value: its address (with the port only when it isn't the standard one) or its print queue. */
function printerLocation(t: Translate, printer: PrinterDraft): string {
  if (printer.transport === 'system') return `${t('admin.settings.printers.transport.system')}: ${printer.systemName ?? ''}`
  const port = printer.port && printer.port !== DEFAULT_RAW_PRINTER_PORT ? `:${printer.port}` : ''
  return `${printer.host ?? ''}${port}`
}

/** Review rows for a receipt printer (Settings → Printers): name, where it is, paper width, and whether it's the default. */
export function buildPrinterChangeRows(t: Translate, current: PrinterDraft | null, draft: PrinterDraft): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  pushRow(rows, t('admin.settings.printers.name'), current === null ? null : current.name, draft.name)
  pushRow(rows, t('admin.settings.printers.connection'), current === null ? null : printerLocation(t, current), printerLocation(t, draft))
  pushRow(rows, t('admin.settings.printers.paperWidth'), current === null ? null : `${current.paperWidthMm} mm`, `${draft.paperWidthMm} mm`)
  pushRow(rows, t('admin.settings.printers.cashDrawer'), current === null ? null : formatBoolean(t, current.cashDrawer), formatBoolean(t, draft.cashDrawer))
  pushRow(rows, t('admin.settings.printers.default'), current === null ? null : formatBoolean(t, current.isDefault), formatBoolean(t, draft.isDefault))
  return rows
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
  pushRow(rows, t('admin.contact.temporarilyClosedLabel'), isCreate ? null : formatBoolean(t, current.temporarilyClosed ?? false), formatBoolean(t, draft.temporarilyClosed ?? false))
  if (draft.temporarilyClosed) {
    pushRow(rows, t('admin.contact.temporarilyClosedReasonLabel'), isCreate ? null : current.temporarilyClosedReason ?? '', draft.temporarilyClosedReason ?? '')
  }
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

/** The bundled draft shape for the `settings` assistant entity — mirrors `server/assistant/entities/settings.ts`'s own `SettingsDraft`, four independently-synced-keyed preferences treated as one record for review purposes. */
export interface SettingsDraft {
  clockFormat: ClockFormat
  dateFormat: DateFormat
  paneLanguage: LanguageCode
  hiddenSidebarItems: ToggleableSidebarItem[]
}

function sidebarItemLabel(t: Translate, item: ToggleableSidebarItem): string {
  const navItem = NAV_ITEMS.find((entry) => entry.to === item)
  return navItem ? t(navItem.id) : item
}

function formatHiddenSidebarItems(t: Translate, hiddenItems: ToggleableSidebarItem[]): string {
  return hiddenItems.length === 0 ? EMPTY_VALUE : hiddenItems.map((item) => sidebarItemLabel(t, item)).join(', ')
}

const PREVIEW_ASPECT_RATIO_LABELS: Record<string, PreviewAspectRatio> = {
  '16:9': { width: 16, height: 9 },
  '9:16': { width: 9, height: 16 },
  '4:3': { width: 4, height: 3 },
  '3:4': { width: 3, height: 4 },
  '21:9': { width: 21, height: 9 },
}

function aspectRatioLabel(ratio: PreviewAspectRatio | undefined): string {
  if (!ratio) return ''
  const match = Object.entries(PREVIEW_ASPECT_RATIO_LABELS).find(([, value]) => value.width === ratio.width && value.height === ratio.height)
  return match?.[0] ?? `${ratio.width}:${ratio.height}`
}

function formatTextSizes(sizes: ScreenConfig['textSizes']): string {
  if (!sizes) return EMPTY_VALUE
  return `${sizes.heading}/${sizes.itemTitle}/${sizes.description}/${sizes.price}/${sizes.itemPrice}`
}

/** Only the whole-screen/global fields `ScreenForm.tsx`'s own tabbed dashboard form writes — never `layout`/`paneSlots`, which only the in-place screen editor changes (see `screenEntity`'s own doc comment, `server/assistant/entities/screen.ts`). */
export function buildScreenChangeRows(t: Translate, current: ScreenConfig | null, draft: ScreenConfig): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const isCreate = current === null
  pushRow(rows, t('admin.screens.nameLabel'), isCreate ? null : current.name, draft.name)
  pushRow(rows, t('admin.screens.previewRatioLabel'), isCreate ? null : aspectRatioLabel(current.previewAspectRatio), aspectRatioLabel(draft.previewAspectRatio))
  pushRow(rows, t('admin.screens.useStagesLabel'), isCreate ? null : formatBoolean(t, current.useStages), formatBoolean(t, draft.useStages))
  if (draft.useStages) pushRow(rows, t('admin.screens.stageCountLabel'), isCreate ? null : String(current.stageCount ?? 1), String(draft.stageCount ?? 1))
  pushRow(rows, t('admin.screens.slideDurationLabel'), isCreate ? null : String(current.slideDurationSeconds), String(draft.slideDurationSeconds))
  pushRow(
    rows,
    t('admin.screens.transitionStyleLabel'),
    isCreate ? null : t(current.transitionStyle === 'fade' ? 'admin.screens.transitionFadeLabel' : 'admin.screens.transitionSlideLabel'),
    t(draft.transitionStyle === 'fade' ? 'admin.screens.transitionFadeLabel' : 'admin.screens.transitionSlideLabel'),
  )
  pushRow(
    rows,
    t('admin.screens.paneGrowthFallbackLabel'),
    isCreate ? null : t(current.paneGrowthFallback === 'fade' ? 'admin.screens.paneGrowthFadeLabel' : 'admin.screens.paneGrowthScreenEdgeLabel'),
    t(draft.paneGrowthFallback === 'fade' ? 'admin.screens.paneGrowthFadeLabel' : 'admin.screens.paneGrowthScreenEdgeLabel'),
  )
  pushRow(rows, t('admin.screens.showSlotBordersLabel'), isCreate ? null : formatBoolean(t, current.showSlotBorders), formatBoolean(t, draft.showSlotBorders))
  if (draft.showSlotBorders) pushRow(rows, t('admin.screens.borderColorLabel'), isCreate ? null : current.borderColor ?? t('admin.screens.autoBorderColorLabel'), draft.borderColor ?? t('admin.screens.autoBorderColorLabel'))
  pushRow(rows, t('admin.screens.hideScrollbarLabel'), isCreate ? null : formatBoolean(t, current.hideScrollbar), formatBoolean(t, draft.hideScrollbar))
  pushRow(rows, t('admin.screens.useScreensaverLabel'), isCreate ? null : formatBoolean(t, current.useScreensaver), formatBoolean(t, draft.useScreensaver))
  pushRow(rows, t('admin.screens.backgroundLabel'), isCreate ? null : current.backgroundColor ?? '', draft.backgroundColor ?? '')
  if (draft.backgroundImage) pushRow(rows, t('admin.screens.backgroundLabel'), isCreate ? null : current.backgroundImage?.imageUrl ?? '', draft.backgroundImage.imageUrl)
  pushRow(rows, t('admin.screens.editTextSize'), isCreate ? null : formatTextSizes(current.textSizes), formatTextSizes(draft.textSizes))
  return rows
}

/** Client-side mirror of `server/assistant/entities/screenPane.ts`'s own `ScreenPaneDraft` — deliberately duplicated rather than imported (client code never imports from `server/`, same "structurally identical, separately declared" posture this file's own `DisplayManagerDraft` below already uses for the same reason). */
export interface ScreenPaneDraft {
  screen: ScreenConfig
  paneId: string
  stage: number
}

/** Maps a content kind to its own closest existing label key (`SlideFields.tsx`'s own content-kind dropdown) — `event`/`transit` fall back to their own base variant since a review row doesn't need the sub-mode split that dropdown offers. */
const CONTENT_KIND_LABEL_KEYS: Record<string, string> = {
  none: 'admin.screens.slotNoneLabel',
  catalogue: 'admin.screens.slotCatalogueLabel',
  event: 'admin.screens.slotEventCalendarLabel',
  image: 'admin.screens.slotImageLabel',
  video: 'admin.screens.slotVideoLabel',
  qrcode: 'admin.screens.slotQrCodeLabel',
  transit: 'admin.screens.slotTransitRuterLabel',
  weather: 'admin.screens.slotWeatherLabel',
  news: 'admin.screens.slotNewsLabel',
  time: 'admin.screens.slotTimeLabel',
  messageboard: 'admin.screens.slotMessageBoardLabel',
  orders: 'admin.screens.slotOrdersGroupLabel',
  announcement: 'admin.screens.slotAnnouncementLabel',
}

function contentKindLabel(t: Translate, kind: string): string {
  const key = CONTENT_KIND_LABEL_KEYS[kind]
  return key ? t(key) : kind
}

/** Plain text rows alongside the visual before/after preview (`AssistantPanel.tsx`'s own `screenPane` branch) — `customCss`/`customHtml` are always in scope; the content-kind row only appears when it actually differs (the assistant may not have touched it at all, e.g. a pure styling request). */
export function buildScreenPaneChangeRows(t: Translate, current: ScreenPaneDraft, draft: ScreenPaneDraft): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const currentSlot = current.screen.paneSlots[current.paneId]
  const draftSlot = draft.screen.paneSlots[draft.paneId]
  pushRow(rows, t('admin.screens.paneCustomContent.cssLabel'), currentSlot?.customCss ?? '', draftSlot.customCss ?? '')
  pushRow(rows, t('admin.screens.paneCustomContent.htmlLabel'), currentSlot?.customHtml ?? '', draftSlot.customHtml ?? '')
  const currentContent = currentSlot?.content[current.stage]
  const draftContent = draftSlot.content[draft.stage]
  if (draftContent) pushRow(rows, t('admin.screens.paneContentKindLabel'), currentContent ? contentKindLabel(t, currentContent.kind) : null, contentKindLabel(t, draftContent.kind))
  return rows
}

export interface MediaLibraryDraft {
  filename: string
  displayName?: string
}

export function buildMediaLibraryChangeRows(t: Translate, current: MediaLibraryDraft | null, draft: MediaLibraryDraft): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  pushRow(rows, t('admin.mediaLibrary.renameLabel'), current?.displayName ?? current?.filename ?? null, draft.displayName || draft.filename)
  return rows
}

export interface DisplayManagerDraft {
  machineID: string
  monitorId: string
  monitorLabel: string
  machineLabel: string
  assignedScreenID: string | null
  maxImagePx?: DisplayMaxImagePx
  renderWidthPx?: DisplayRenderWidth
}

export function buildDisplayManagerChangeRows(t: Translate, current: DisplayManagerDraft, draft: DisplayManagerDraft, screens: ScreenConfig[]): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  const screenName = (id: string | null) => (id ? (screens.find((screen) => screen.screenID === id)?.name ?? id) : t('admin.displayManager.unassignedOption'))
  pushRow(rows, t('admin.displayManager.machineLabelLabel'), current.machineLabel, draft.machineLabel)
  pushRow(rows, t('admin.displayManager.assignedScreenLabel'), screenName(current.assignedScreenID), screenName(draft.assignedScreenID))
  const capLabel = (cap: DisplayMaxImagePx | undefined) =>
    !cap || cap === 'auto' ? t('admin.displayManager.maxImagePxAuto') : t('admin.displayManager.maxImagePxValue', { px: String(cap) })
  pushRow(rows, t('admin.displayManager.maxImagePxLabel'), capLabel(current.maxImagePx), capLabel(draft.maxImagePx))
  const renderWidthLabel = (width: DisplayRenderWidth | undefined) =>
    !width || width === 'auto' ? t('admin.displayManager.renderWidthAuto') : t(`admin.displayManager.renderWidth${width}`)
  pushRow(rows, t('admin.displayManager.renderWidthLabel'), renderWidthLabel(current.renderWidthPx), renderWidthLabel(draft.renderWidthPx))
  return rows
}

export function buildOrdersChangeRows(t: Translate, current: OrderRecord, draft: OrderRecord): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  pushRow(rows, t('admin.orders.statusLabel'), t(`admin.orders.status.${current.status}`), t(`admin.orders.status.${draft.status}`))
  return rows
}

export function buildSettingsChangeRows(t: Translate, current: SettingsDraft, draft: SettingsDraft): ReviewChangeRow[] {
  const rows: ReviewChangeRow[] = []
  pushRow(rows, t('admin.settings.clockFormatLabel'), t(current.clockFormat === '24h' ? 'admin.settings.clockFormat24hLabel' : 'admin.settings.clockFormat12hLabel'), t(draft.clockFormat === '24h' ? 'admin.settings.clockFormat24hLabel' : 'admin.settings.clockFormat12hLabel'))
  pushRow(rows, t('admin.settings.dateFormatLabel'), t(current.dateFormat === 'dmy' ? 'admin.settings.dateFormatDmyLabel' : 'admin.settings.dateFormatMdyLabel'), t(draft.dateFormat === 'dmy' ? 'admin.settings.dateFormatDmyLabel' : 'admin.settings.dateFormatMdyLabel'))
  const languageLabel = (code: LanguageCode) => availableLanguages.find((language) => language.code === code)?.label ?? code
  pushRow(rows, t('admin.settings.paneLanguageLabel'), languageLabel(current.paneLanguage), languageLabel(draft.paneLanguage))
  pushRow(rows, t('admin.settings.sidebarItemsTitle'), formatHiddenSidebarItems(t, current.hiddenSidebarItems), formatHiddenSidebarItems(t, draft.hiddenSidebarItems))
  return rows
}
