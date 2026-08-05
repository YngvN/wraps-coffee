import { randomUUID } from 'node:crypto'
import type { Product } from '../../src/types/product'
import { levenshteinDistance } from '../../src/lib/levenshtein'
import { fold, FOLD_VERSION } from '../../src/lib/textFold'
import { resolveBilingualField } from '../../src/utils/bilingual'
import * as store from '../store'
import { callToolOnce, currentDateInstruction, languageInstruction, type AssistantTraceEntry } from './client'
import type { DialogFocusUpdate } from './dialogFocus'
import { productLocationLabel, resolveProductEffectivePrice } from './entities/product'
import { executeLookupQuery, type LookupQueryField, type LookupQueryFilterInput, type LookupQueryRecord } from './lookupQuery'
import { nullable, type AssistantCandidate, type AssistantFillContext, type AssistantJsonSchema, type AssistantListItem, type AssistantReplyList } from './types'

function liveProducts(): Product[] {
  return (store.get('admin.products')?.value as Product[] | undefined) ?? []
}

/** Up to 3 candidates ever shown in a "did you mean...?" prompt, per the spec — a longer list defeats the point of asking a quick yes/no-shaped question. */
const MAX_CANDIDATES_SHOWN = 3

interface ProductNameCandidate {
  id: string
  label: string
  category: string
}

function toCandidates(products: Product[], uiLanguage: 'no' | 'en'): ProductNameCandidate[] {
  return products.slice(0, MAX_CANDIDATES_SHOWN).map((product) => ({ id: product.itemID, label: resolveBilingualField(product.name, uiLanguage), category: productLocationLabel(product, uiLanguage) }))
}

/**
 * Result of resolving a free-text product-name query through the deterministic ladder (tiers 1-3,
 * always an exact/query-language match) and, when those all miss, the fuzzy tiers (4: Levenshtein,
 * 5: model pick — see `pickCandidateViaModel` below). `'hit'` renders directly, no confirmation.
 * `'suggest'`/`'ambiguous'` (tiers 3's multi-match case, and every tier-4/5 result) always route
 * through an admin confirmation prompt before being treated as an answer — "guessing is worse than
 * asking" for anything that isn't an exact or query-language match. `'miss'` is a genuine no-match.
 */
export type ProductNameResolution =
  | { kind: 'hit'; products: Product[] }
  | { kind: 'suggest' | 'ambiguous'; tier: '3' | '4' | '5'; candidates: ProductNameCandidate[]; presentationId: string }
  | { kind: 'miss' }

/** Returns the generated row's own `presentationId` — the caller threads it into a `'suggest'`/`'ambiguous'` result's `clarifyItem.aliasHarvest` so `confirmProductNameAlias` can later write a correlated `confirmed: true` row (see `ProductNameResolutionLogEntry`'s own doc comment). */
function logResolutionAttempt(query: string, foldedQuery: string, tier: string, resolvedProductId: string | null): string {
  const presentationId = randomUUID()
  store.appendProductNameResolutionLogEntry({ query, foldedQuery, tier, resolvedProductId, confirmed: false, timestamp: new Date().toISOString(), presentationId })
  return presentationId
}

/**
 * Send the model *only* `{id, name, category}` per candidate — never a full `Product` (no price,
 * stock, images) — and require an explicit `null` escape hatch, or a weaker model reliably picks
 * something even when nothing genuinely matches (this is the one non-negotiable constraint from the
 * spec). The returned id is validated against the exact set sent below by the caller
 * (`resolveProductName`) — an id outside that set is a hard failure, logged and treated as a miss,
 * never rendered; this function itself never trusts its own output blindly either, it just proposes.
 *
 * At the catalog's current size (~69 products, ~550 tokens) every product is sent unfiltered. Above
 * ~300 products this would need a prefilter (by category if the intent carried one, otherwise by
 * folded first letter) — deliberately not built yet per the spec's own "don't over-engineer" note;
 * revisit once the catalog is actually large enough for it to matter.
 */
async function pickCandidateViaModel(
  query: string,
  products: Product[],
  context: AssistantFillContext,
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
  signal: AbortSignal | undefined,
): Promise<string | null> {
  if (products.length === 0) return null

  const candidates = products.map((product) => ({ id: product.itemID, name: resolveBilingualField(product.name, context.uiLanguage), category: productLocationLabel(product, context.uiLanguage) }))

  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      productId: nullable({
        type: 'string',
        enum: candidates.map((candidate) => candidate.id),
        description: "The id of the one candidate that genuinely matches the admin's query — or null. Returning null is the correct, expected answer whenever nothing in the list genuinely matches; never guess just to pick something.",
      }),
    },
    required: ['productId'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(context.uiLanguage),
    currentDateInstruction(),
    "The admin asked about a product using text that doesn't exactly match any product name in this cafe's catalog (every deterministic spelling/typo check already failed). Pick the ONE candidate below that the admin's own query most plausibly refers to — a synonym, a description, a partial/rephrased name — or return null if none of them genuinely match. Never invent a match; null is correct and expected when nothing fits.",
    `Admin's query: "${query}"`,
    `Candidates (id, name, category):\n${JSON.stringify(candidates)}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const { productId } = await callToolOnce<{ productId: string | null }>({
    systemPrompt,
    userText: query,
    toolName: 'pick_product_name_candidate',
    toolDescription: "Pick which candidate product (if any) the admin's query refers to.",
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
    signal,
  })

  if (productId === null) return null
  if (!candidates.some((candidate) => candidate.id === productId)) {
    console.warn(`[productNameResolution] tier 5 model returned an id outside the sent candidate set (${productId}) — treating as a miss`)
    return null
  }
  return productId
}

/**
 * The product-name resolution ladder — see this feature's own spec for the full tier-by-tier
 * rationale. Tiers 1/1.5/2 are exact matches (by real name, confirmed alias, or orthographic fold);
 * tier 3 is a folded substring match; tier 4 is a single-edit Levenshtein match; tier 5 is a model
 * pick over the full candidate list. Every tier-2-and-below attempt is logged (`store.
 * appendProductNameResolutionLogEntry`) as the measurement surface for the whole ladder — tiers 1/1.5
 * aren't, since they're the trivial/already-solved cases, not signal about the ladder's own health.
 *
 * Only ever called after the deterministic `lookup_query` filter (built by a real model call) already
 * ran and returned zero matches — this ladder resolves the *name* alone, so a caller combining it with
 * other simultaneous filters (e.g. "on sale") must re-apply those to this function's own `'hit'`
 * products itself (see `renderProductNameQuery`'s own survivor-filtering) rather than trusting a hit
 * here as the final answer.
 */
export async function resolveProductName(
  query: string,
  context: AssistantFillContext,
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
  signal: AbortSignal | undefined,
): Promise<ProductNameResolution> {
  const products = liveProducts()
  const lowerQuery = query.trim().toLowerCase()
  const foldedQuery = fold(query)

  // Tier 1 — exact match on the real name, either language. Several real products legitimately
  // share a name across categories (e.g. "Tandoori" in Salater/Baguetter/Wraps/Nachos) — returning
  // every match is correct, complete behavior here, not ambiguity.
  //
  // Not dead code even though this ladder only ever runs after the original `contains` filter (which
  // would already have caught any exact substring match) returned zero: `listQueryableRecords` builds
  // `fields.name` as `"${no} ${en}".trim()` (both languages concatenated into one string), so an
  // `'equals'` op on that field never matches a bilingual record even when the admin's query is a
  // real, exact, single-language name (a separate, pre-existing latent bug in the deterministic filter
  // engine, not something this ladder introduces or should paper over further). Whenever the model
  // picks `equals` instead of `contains` for a `name` filter, tier 1 here is what actually catches it.
  const exactNameMatches = products.filter((product) => product.name.no.toLowerCase() === lowerQuery || product.name.en.toLowerCase() === lowerQuery)
  if (exactNameMatches.length > 0) return { kind: 'hit', products: exactNameMatches }

  if (!foldedQuery) return { kind: 'miss' }

  // Tier 1.5 — a previously admin-confirmed alias for this exact folded query. A stale-fold-version
  // row is treated as absent (never actively migrated) — a real re-confirmation naturally repopulates it.
  // Note this still costs one real `lookup_query` model call to build the filter that ran before this
  // ladder was ever reached — tier 1.5 skips tiers 2-5's extra work, not the whole request.
  const aliasedProductIds = new Set(
    store.getProductNameAliases()
      .filter((alias) => alias.foldedQuery === foldedQuery && alias.foldVersion === FOLD_VERSION)
      .map((alias) => alias.productId),
  )
  if (aliasedProductIds.size > 0) {
    const aliasMatches = products.filter((product) => aliasedProductIds.has(product.itemID))
    if (aliasMatches.length > 0) return { kind: 'hit', products: aliasMatches }
  }

  // Tier 2 — exact match on the folded name, either language.
  const foldedExactMatches = products.filter((product) => product.nameFolded && (product.nameFolded.no === foldedQuery || product.nameFolded.en === foldedQuery))
  if (foldedExactMatches.length > 0) {
    logResolutionAttempt(query, foldedQuery, '2', foldedExactMatches[0].itemID)
    return { kind: 'hit', products: foldedExactMatches }
  }

  // Tier 3 — folded name contains the folded query (a query-language substring match, same
  // deterministic character as tier 1/2 despite the >1 case still asking rather than guessing).
  const containsMatches = products.filter((product) => product.nameFolded && (product.nameFolded.no.includes(foldedQuery) || product.nameFolded.en.includes(foldedQuery)))
  if (containsMatches.length === 1) {
    logResolutionAttempt(query, foldedQuery, '3', containsMatches[0].itemID)
    return { kind: 'hit', products: containsMatches }
  }
  if (containsMatches.length > 1) {
    const presentationId = logResolutionAttempt(query, foldedQuery, '3', null)
    return { kind: 'ambiguous', tier: '3', candidates: toCandidates(containsMatches, context.uiLanguage), presentationId }
  }

  // Tier 4 — single-edit Levenshtein match on the folded name, either language. Inexact by
  // construction, so both the single-match ("suggest") and multi-match ("ambiguous") cases always
  // route through admin confirmation before being treated as an answer.
  const levenshteinMatches = products.filter(
    (product) => product.nameFolded && (levenshteinDistance(product.nameFolded.no, foldedQuery) <= 1 || levenshteinDistance(product.nameFolded.en, foldedQuery) <= 1),
  )
  if (levenshteinMatches.length === 1) {
    const presentationId = logResolutionAttempt(query, foldedQuery, '4', levenshteinMatches[0].itemID)
    return { kind: 'suggest', tier: '4', candidates: toCandidates(levenshteinMatches, context.uiLanguage), presentationId }
  }
  if (levenshteinMatches.length > 1) {
    const presentationId = logResolutionAttempt(query, foldedQuery, '4', null)
    return { kind: 'ambiguous', tier: '4', candidates: toCandidates(levenshteinMatches, context.uiLanguage), presentationId }
  }

  // Tier 5 — model candidate pick, structurally optional (one admin-facing checkbox, see
  // `store.getProductNameCandidateSuggestionsEnabled`) and never auto-applied regardless of setting.
  if (store.getProductNameCandidateSuggestionsEnabled()) {
    const pickedId = await pickCandidateViaModel(query, products, context, modelOverride, providerOverride, localModelOverride, trace, signal)
    const pickedProduct = pickedId ? products.find((product) => product.itemID === pickedId) : undefined
    if (pickedProduct) {
      const presentationId = logResolutionAttempt(query, foldedQuery, '5', pickedProduct.itemID)
      return { kind: 'suggest', tier: '5', candidates: toCandidates([pickedProduct], context.uiLanguage), presentationId }
    }
  }

  logResolutionAttempt(query, foldedQuery, '6', null)
  return { kind: 'miss' }
}

/** Writes the confirmed alias + its harvest-log companion row — called once an admin taps a tier 4/5 suggestion (see `steps.ts`'s `answerLookupForItem`). Never called for a tier-3 "ambiguous" pick: a folded-substring match (e.g. "kaffe" matching several coffee products) isn't a stable 1:1 mapping worth memorizing globally, unlike a genuine misspelling/typo. `presentationId` is the same id the generating `resolveProductName` call logged — see `ProductNameResolutionLogEntry`'s own doc comment for why this row is appended (not merged into the original) under that shared id. */
export function confirmProductNameAlias(query: string, tier: '4' | '5', productId: string, presentationId: string) {
  const foldedQuery = fold(query)
  const now = new Date().toISOString()
  store.addProductNameAlias({ foldedQuery, productId, sourceTier: tier, confirmedAt: now, foldVersion: FOLD_VERSION })
  store.appendProductNameResolutionLogEntry({ query, foldedQuery, tier, resolvedProductId: productId, confirmed: true, timestamp: now, presentationId })
}

/** Norwegian-only existence-question phrasing ("Har vi mokka?") — plain string matching, no model call. Only ever checked when the admin's own UI language is Norwegian; there's no defined English-language existence-reply shape in the spec this implements. Exported so `steps.ts` can gate the render shape on a *direct* filter hit too (a correctly-spelled "Har vi Mocha?"), not only the zero-result path this module's own ladder handles. */
export function isExistenceQuestion(message: string, uiLanguage: 'no' | 'en'): boolean {
  return uiLanguage === 'no' && /\b(har vi|finnes det|har dere)\b/i.test(message)
}

function formatPriceKr(product: Product): string | null {
  const effective = resolveProductEffectivePrice(product)
  if (!effective) return null
  const price = effective.discounted ?? effective.original
  return typeof price === 'number' ? `${price} kr` : `${price.takeaway} / ${price.eatIn} kr`
}

export interface ProductNameQueryRenderResult {
  templatedReply?: string
  templatedList?: AssistantReplyList
  focusUpdate?: DialogFocusUpdate
  /** Set only for a tier-3/4/5 `'suggest'`/`'ambiguous'` result — see `AnswerLookupResult`'s own `clarifyItem.aliasHarvest` doc comment for how this reaches `confirmProductNameAlias` once the admin picks. */
  clarifyItem?: { candidates: AssistantCandidate[]; aliasHarvest?: { query: string; tier: '4' | '5'; presentationId: string } }
}

/** `'existence'` — "Har vi X?"; `'plain'` — every other lookup shape (a "which/list" question, or an existence question in a UI language this ladder doesn't detect existence phrasing for). Threaded through explicitly (never re-detected downstream) so the direct-hit and zero-result-ladder paths in `steps.ts` render identically regardless of which one resolved the name. */
type ReplyShape = 'existence' | 'plain'

function renderExistenceReply(products: Product[], uiLanguage: 'no' | 'en'): ProductNameQueryRenderResult {
  const firstName = resolveBilingualField(products[0].name, uiLanguage)
  const sameName = products.every((product) => resolveBilingualField(product.name, uiLanguage) === firstName)

  if (products.length === 1) {
    const product = products[0]
    const category = productLocationLabel(product, uiLanguage)
    const price = formatPriceKr(product)
    return {
      templatedReply: `Ja — ${firstName} (${category})${price ? `, ${price}` : ''}.`,
      focusUpdate: { kind: 'item', entity: 'product', id: product.itemID, label: `${firstName} (${category})` },
    }
  }

  const items: AssistantListItem[] = products.map((product) => ({ label: resolveBilingualField(product.name, uiLanguage), sublabel: productLocationLabel(product, uiLanguage) }))
  const ids = products.map((product) => product.itemID)
  const focusUpdate: DialogFocusUpdate = { kind: 'set', entity: 'product', filter: [], ids, label: uiLanguage === 'no' ? 'produkter' : 'products' }

  // Same name across every match (the spec's own "Tandoori" case) — the "finnes i N varianter" shape.
  // A `contains` match can also legitimately return several genuinely *different*-named products (e.g.
  // "kaffe" matching both "Kaffe Latte" and "Iskaffe") — that's not "N variants of X", so it falls back
  // to a plain "here's what matches" list instead of misnaming the group after just the first result.
  if (sameName) {
    const categories = products.map((product) => productLocationLabel(product, uiLanguage))
    return { templatedReply: `Ja — ${firstName} finnes i ${products.length} varianter: ${categories.join(', ')}`, templatedList: { style: 'bullet', items }, focusUpdate }
  }
  return { templatedReply: `Ja — her er ${products.length} produkter som matcher:`, templatedList: { style: 'bullet', items }, focusUpdate }
}

function renderPlainList(products: Product[], uiLanguage: 'no' | 'en'): ProductNameQueryRenderResult {
  const items: AssistantListItem[] = products.map((product) => ({ label: resolveBilingualField(product.name, uiLanguage), sublabel: productLocationLabel(product, uiLanguage) }))
  const ids = products.map((product) => product.itemID)
  if (products.length === 1) {
    const sublabelPart = items[0].sublabel ? ` (${items[0].sublabel})` : ''
    return {
      templatedReply: uiLanguage === 'no' ? `Det er bare ${items[0].label}${sublabelPart}.` : `There's only ${items[0].label}${sublabelPart}.`,
      focusUpdate: { kind: 'item', entity: 'product', id: ids[0], label: items[0].sublabel ? `${items[0].label} (${items[0].sublabel})` : items[0].label },
    }
  }
  return {
    templatedReply: uiLanguage === 'no' ? `Her er ${products.length} produkter:` : `Here are ${products.length} products:`,
    templatedList: { style: 'bullet', items },
    focusUpdate: { kind: 'set', entity: 'product', filter: [], ids, label: uiLanguage === 'no' ? 'produkter' : 'products' },
  }
}

function renderProducts(products: Product[], uiLanguage: 'no' | 'en', shape: ReplyShape): ProductNameQueryRenderResult {
  return shape === 'existence' ? renderExistenceReply(products, uiLanguage) : renderPlainList(products, uiLanguage)
}

/**
 * Renders a direct filter hit (`matches.length > 0` from the original deterministic `lookup_query`
 * filter, e.g. a correctly-spelled "Har vi Mocha?") — only ever called to apply the `'existence'` reply
 * shape, since every non-existence direct hit already renders correctly via `buildEntityQueryDataBlock`'s
 * own pre-existing matches.length===1/N logic (which also handles other simultaneous filters' own
 * `filterPhrase` suffix, e.g. " på tilbud" — reusing that unchanged avoids regressing it).
 */
export function renderDirectHitExistenceReply(matches: LookupQueryRecord[], uiLanguage: 'no' | 'en'): ProductNameQueryRenderResult {
  const matchedIds = new Set(matches.map((record) => record.id))
  const products = liveProducts().filter((product) => matchedIds.has(product.itemID))
  return renderExistenceReply(products, uiLanguage)
}

/**
 * The zero-result entry point `steps.ts`'s `buildEntityQueryDataBlock` calls once a product-name
 * filter comes back with no direct matches — resolves the ladder, re-applies any *other* simultaneous
 * filters (e.g. "on sale") to a ladder `'hit'`'s own products (the ladder itself only ever resolves the
 * name), then shapes the result into exactly the pieces `EntityDataBlockResult` needs.
 */
export async function renderProductNameQuery(
  query: string,
  uiLanguage: 'no' | 'en',
  shape: ReplyShape,
  context: AssistantFillContext,
  otherFilters: LookupQueryFilterInput[],
  records: LookupQueryRecord[],
  fields: LookupQueryField[],
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
  signal: AbortSignal | undefined,
): Promise<ProductNameQueryRenderResult> {
  const resolution = await resolveProductName(query, context, modelOverride, providerOverride, localModelOverride, trace, signal)

  if (resolution.kind === 'hit') {
    let survivors = resolution.products
    if (otherFilters.length > 0) {
      const resolvedIds = new Set(resolution.products.map((product) => product.itemID))
      const resolvedRecords = records.filter((record) => resolvedIds.has(record.id))
      const survivorRecords = executeLookupQuery(resolvedRecords, { filters: otherFilters, reportField: null }, fields)
      const survivorIds = new Set(survivorRecords.map((record) => record.id))
      survivors = resolution.products.filter((product) => survivorIds.has(product.itemID))
      if (survivors.length === 0) {
        // The name resolved, but nothing left matches the *other* conditions the admin also asked for
        // — genuinely different from "no such product", and worse to conflate: silently answering as
        // if the name filter were the whole question would misreport a real product's other attributes
        // (e.g. reporting "no products on sale" for a misspelled name when the resolved product exists
        // but simply isn't discounted, rather than reporting on the product that actually exists).
        const name = resolveBilingualField(resolution.products[0].name, uiLanguage)
        return {
          templatedReply:
            uiLanguage === 'no' ? `${name} finnes, men ingen av variantene matcher de andre kriteriene.` : `${name} exists, but none of the variants match the other criteria.`,
        }
      }
    }
    return renderProducts(survivors, uiLanguage, shape)
  }

  if (resolution.kind === 'suggest' || resolution.kind === 'ambiguous') {
    const candidates: AssistantCandidate[] = resolution.candidates.map((candidate) => ({ id: candidate.id, label: `${candidate.label} (${candidate.category})` }))
    const single = resolution.candidates.length === 1 ? resolution.candidates[0] : undefined
    const templatedReply = single
      ? uiLanguage === 'no'
        ? `Mente du ${single.label} (${single.category})?`
        : `Did you mean ${single.label} (${single.category})?`
      : uiLanguage === 'no'
        ? 'Mente du en av disse?'
        : 'Did you mean one of these?'
    return {
      templatedReply,
      clarifyItem: {
        candidates,
        aliasHarvest: resolution.tier === '4' || resolution.tier === '5' ? { query, tier: resolution.tier, presentationId: resolution.presentationId } : undefined,
      },
    }
  }

  // miss
  if (shape === 'existence') return { templatedReply: `Nei — fant ingen produkter som matcher «${query}».` }
  return { templatedReply: uiLanguage === 'no' ? `Fant ingen produkter som matcher «${query}».` : `Found no products matching "${query}".` }
}
