import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Badge, Button, Checkbox, ChevronLeftIcon, ClockIcon, CopyIcon, ImageUploadField, Input, KebabIcon, NewChatIcon, NumberInput, Spinner } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useAppearanceThemes } from '../../../hooks/useAppearanceThemes'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useEvents } from '../../../hooks/useEvents'
import { useIntegrationsConfig } from '../../../hooks/useIntegrationsConfig'
import { useLocalStorage } from '../../../hooks/useLocalStorage'
import { useMessageBoardPosts } from '../../../hooks/useMessageBoardPosts'
import { useMessageBoards } from '../../../hooks/useMessageBoards'
import { useProducts } from '../../../hooks/useProducts'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import { createUser, deleteUser, getAssistantCredentialStatus, resetUserPassword, SessionExpiredError, type AssistantModel, type ChunkSizePreference } from '../../../lib/localServer'
import { dismissUpload, startUpload, useUpload } from '../../../lib/uploadManager'
import type { AppearanceTheme, AppearanceThemeColor } from '../../../types/appearanceTheme'
import type { Catalogue, Category } from '../../../types/category'
import type { ContactInfo } from '../../../types/contactInfo'
import type { CustomFieldDefinition } from '../../../types/customFields'
import type { EventRecord } from '../../../types/event'
import type { MessageBoard, MessageBoardPost } from '../../../types/messageBoard'
import { NEWS_SOURCES } from '../../../types/news'
import type { Price, Product } from '../../../types/product'
import type { StoreSettings } from '../../../types/storeSettings'
import type { AdminRole, DashboardSection } from '../../../types/sync'
import { formatDateTime } from '../../../utils/clockFormat'
import { resolveProductCatalogue } from '../../../utils/productCatalogue'
import { EventForm } from '../events/EventForm'
import { AdminRightPanel } from '../layout/AdminRightPanel'
import { MessageBoardPostForm } from '../messageBoard/MessageBoardPostForm'
import { CatalogueForm } from '../products/CatalogueForm'
import { CategoryForm } from '../products/CategoryForm'
import { CustomFieldListEditor } from '../products/CustomFieldListEditor'
import { ProductForm } from '../products/ProductForm'
import { LogoListEditor } from '../store/LogoListEditor'
import { ThemeColorListEditor } from '../store/ThemeColorListEditor'
import { ThemeEditorForm } from '../store/ThemeEditorForm'
import { ResetPasswordForm } from '../users/ResetPasswordForm'
import { UserForm } from '../users/UserForm'
import { AssistantReviewSummary } from './AssistantReviewSummary'
import { AssistantThoughtTrace } from './AssistantThoughtTrace'
import { formatCostUsd, formatThoughtDuration, sumUsage, traceStepLabel } from './assistantTraceFormat'
import {
  buildAppearanceThemeColorChangeRows,
  buildCatalogueChangeRows,
  buildCategoryChangeRows,
  buildCategoryCustomFieldChangeRows,
  buildContactInfoChangeRows,
  buildEventChangeRows,
  buildIntegrationToggleChangeRows,
  buildMessageBoardChangeRows,
  buildMessageBoardPostChangeRows,
  buildProductChangeRows,
  buildStoreSettingsChangeRows,
  buildThemeChangeRows,
} from './reviewChangeRows'
import { type AssistantEntityKey, type AssistantImageMode, type TranscriptLine, useAssistantFlow } from './useAssistantFlow'
import './AssistantPanel.scss'

interface AssistantPanelProps {
  open: boolean
  onClose: () => void
}

const IMAGE_FIELD: Partial<Record<AssistantEntityKey, string>> = {
  product: 'image',
  event: 'imageUrl',
  category: 'image',
  messageBoardPost: 'imageUrl',
  storeSettings: 'favicon',
}

/** Same three models Settings → Integrations' own "Claude" model picker offers (see `IntegrationsView.tsx`) — reused here for the per-chat override menu's own option list and i18n labels (`admin.integrations.assistantModel.<model>.label`), rather than duplicating fresh copy for the same three names. */
const MODEL_OVERRIDE_OPTIONS: AssistantModel[] = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5']

const CHUNK_SIZE_OPTIONS: ChunkSizePreference[] = ['auto', 'small', 'medium', 'large', 'custom']

/** Shown in the "Custom" numeric field before the admin has ever set a value of their own — a reasonable starting point, not a hidden default the server falls back to (that's `server/assistant/steps.ts`'s own per-model capability profile). */
const DEFAULT_CUSTOM_CHUNK_RECORD_COUNT = 25

/** Delete-time validation issues that are hard guards (mirroring a real disabled Delete button in the manual UI) rather than soft warnings the admin can proceed past — the confirm button stays disabled while any of these are present. */
const BLOCKING_DELETE_ISSUE_CODES = new Set(['themeDeleteActive', 'themeDeleteLast'])

/** Reads a `File` as base64 (no `data:` prefix) — the shape `server/assistant/client.ts` expects for vision input. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Plain-text export of the entire current conversation — every message plus
 * every "thought" step's own raw tool call (not just the friendly label; the
 * truncated input/output JSON and token/cost usage too) and the model that
 * answered it, for a true admin to paste elsewhere when troubleshooting or
 * reporting a bad response (see the header kebab menu's own "Copy
 * conversation" button, `admin`-role only). Reuses `AssistantThoughtTrace`'s
 * own formatting helpers so this plain-text version reads consistently with
 * what's already shown expanded in the chat itself.
 */
function buildConversationClipboardText(transcript: TranscriptLine[], modelLabel: string | null, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const header = ['Wraps & Coffee — AI assistant conversation export', modelLabel ? `Model: ${modelLabel}` : null].filter(Boolean).join('\n')

  const body = transcript
    .map((line) => {
      if (line.role === 'thought') {
        const usage = sumUsage(line.trace)
        const usageSuffix =
          usage.inputTokens > 0 || usage.outputTokens > 0
            ? ` (${usage.inputTokens} in / ${usage.outputTokens} out${usage.costUsd !== undefined ? ` · ${formatCostUsd(usage.costUsd)}` : ''})`
            : ''
        const summary = `Thought for ${formatThoughtDuration(line.durationMs)}${usageSuffix}:`
        const steps = line.trace.map((entry, index) => {
          const entryUsage = entry.usage
          const entryUsageSuffix = entryUsage ? ` — ${entryUsage.inputTokens} in / ${entryUsage.outputTokens} out${entryUsage.estimatedCostUsd !== undefined ? ` · ${formatCostUsd(entryUsage.estimatedCostUsd)}` : ''}` : ''
          return [
            `  ${index + 1}. ${traceStepLabel(entry, t)}${entry.pass ? ` (${entry.pass})` : ''} [${entry.toolName}, ${formatThoughtDuration(entry.durationMs)}]${entryUsageSuffix}`,
            `     Input: ${entry.input}`,
            `     Output: ${entry.output}`,
          ].join('\n')
        })
        return [summary, ...steps].join('\n')
      }
      const speaker = line.role === 'user' ? 'Admin' : 'Assistant'
      return `${speaker}${line.variant === 'error' ? ' (error)' : ''}: ${line.text}`
    })
    .join('\n\n')

  return [header, body].filter(Boolean).join('\n\n')
}

/**
 * The assistant chatbox — always rendered inside the right sidebar
 * (`AdminRightPanel`), never a separate modal/panel: the chat log, composer,
 * and every review step (a real form, or a destructive-action summary) all
 * live in this one drawer. See `useAssistantFlow` for the state machine and
 * `server/assistant/*` for the Claude-backed steps behind it — this
 * component's own job is purely to render that state and, on an explicit
 * Save/Confirm click, perform the *real* write through the same path a
 * manual edit already uses (never through the assistant's own routes,
 * which are read-only — see the plan's hard invariant).
 */
export function AssistantPanel({ open, onClose }: AssistantPanelProps) {
  const { t, language } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  // The language the admin was just chatting with the assistant in, falling back to the cafe's
  // own default pane content language, and finally English — so a reviewed form never shows every
  // language a product/event/etc. happens to already have content in, just the one relevant here.
  const reviewLanguage = language ?? defaultPaneLanguage ?? 'en'
  const { session } = useAdminSession()
  // Per-device (plain `localStorage`, never synced — see `useLocalStorage`'s own posture on a
  // key that isn't in `SYNCED_KEYS`), sticky preference: which Claude model this one browser's
  // chat should use instead of the shared, admin-configured default (Settings → Integrations'
  // own "Claude" model picker). `null` means "no override, use that shared default" — never
  // written back to it, so switching models here never affects any other admin/device.
  const [modelOverride, setModelOverride] = useLocalStorage<AssistantModel | null>('admin.assistantModelOverride', null)
  // Same per-device, never-synced posture as `modelOverride` above — controls how much data a
  // lookup answer (e.g. "how many products are over 100kr?") processes per call at once. `'auto'`
  // just means "use the active model/provider's own default"; `customChunkRecordCount` is only
  // read when the preference is `'custom'`, letting an admin on unusually capable (or unusually
  // constrained) hardware set an exact records-per-batch value the fixed presets don't cover.
  const [chunkSizePreference, setChunkSizePreference] = useLocalStorage<ChunkSizePreference>('admin.assistantChunkSizePreference', 'auto')
  const [customChunkRecordCount, setCustomChunkRecordCount] = useLocalStorage<number | null>('admin.assistantChunkSizeCustomValue', null)
  const flow = useAssistantFlow(modelOverride ?? undefined, chunkSizePreference, customChunkRecordCount ?? undefined)
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  // Slides in from the right over the chat, same as `logView` below — see the model-menu
  // branch of the main `AnimatePresence` for why these two are mutually exclusive.
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  // The shared, admin-configured default model (Settings → Integrations' own "Claude" model
  // picker) — only needed to label the header subtitle when this device has no `modelOverride`
  // of its own. Admin/subadmin only; a `limited` account gets a 403 here (same posture as
  // `IntegrationsView`'s own identical fetch) and the subtitle just falls back to showing
  // nothing rather than a guessed model name.
  const [defaultModel, setDefaultModel] = useState<AssistantModel | null>(null)
  // Which provider is actually active (see `AssistantProviderSection` in Settings) — used only to
  // hide the model-menu's "which Claude model" section below when it's `'local'`: there's nothing
  // to override there, since the Ollama path routes deterministically by call shape instead of a
  // per-message model choice (see `server/assistant/ollamaClient.ts`).
  const [assistantProvider, setAssistantProviderState] = useState<'local' | 'claude'>('claude')
  useEffect(() => {
    if (!session) return
    getAssistantCredentialStatus(session.token)
      .then(({ model, provider }) => {
        setDefaultModel(model)
        setAssistantProviderState(provider)
      })
      .catch(() => {
        // Expected for a `limited` account — leave the subtitle without a specific model name.
      })
  }, [session])
  // `null` means the live chat is showing; `{ mode: 'list' }` is the conversation log's own
  // list of past conversations, and `{ mode: 'entry', id }` is one archived conversation's
  // read-only transcript — see `useAssistantConversationLog`'s own doc comment for why these
  // are snapshots rather than resumable drafts.
  const [logView, setLogView] = useState<{ mode: 'list' } | { mode: 'entry'; id: string } | null>(null)
  // Transient "Copied!" feedback for the model menu's own admin-only "Copy conversation" button
  // — same 2s-timeout pattern as `ScreensView`'s own URL-copy feedback.
  const [conversationCopied, setConversationCopied] = useState(false)
  // Bumped by the "New chat" button — used purely as an `AnimatePresence` key so the outgoing
  // (old) chat content plays its own exit-slide before the fresh, empty one mounts.
  const [chatKey, setChatKey] = useState(0)
  const [products, setProducts] = useProducts()
  const [events, setEvents] = useEvents()
  const [catalogues, setCatalogues] = useCatalogues()
  const [categoryPrices, setCategoryPrices] = useCategoryPrices()
  const [boards, setBoards] = useMessageBoards()
  const [posts, setPosts] = useMessageBoardPosts()
  const [appearanceSettings, setAppearanceSettings] = useAppearanceThemes()
  const [storeSettings, setStoreSettings] = useStoreSettings()
  const [contactInfo, setContactInfo] = useContactInfo()
  const [integrationsConfig, setIntegrationsConfig] = useIntegrationsConfig()
  const [message, setMessage] = useState('')
  const [uploadId, setUploadId] = useState<string | undefined>()
  const [pendingImageBase64, setPendingImageBase64] = useState<{ mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64Data: string } | undefined>()
  /** The admin's own choice of what to do with the attached photo (see `AssistantImageMode`) — only ever shown/meaningful while `pendingImageBase64` is set, reset back to the default whenever the attachment is cleared or a message is sent. */
  const [imageMode, setImageMode] = useState<AssistantImageMode>('fillForm')
  const [confirmPhrase, setConfirmPhrase] = useState('')
  // Every new review (including a corrected draft from a follow-up chat message) starts back on
  // the compact change-summary view, not stuck in the full-form edit view from a previous draft.
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tracked = useUpload(uploadId)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [flow.transcript, flow.state])

  useEffect(() => {
    queueMicrotask(() => {
      setConfirmPhrase('')
      setIsEditingDraft(false)
    })
  }, [flow.state])

  const allCategories = catalogues.flatMap((catalogue) => catalogue.categories)

  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !session) return
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    const base64Data = await readFileAsBase64(file)
    setPendingImageBase64({ mediaType, base64Data })
    setUploadId(startUpload(file, 'image', session.token))
  }

  const clearAttachedImage = () => {
    if (tracked && tracked.status !== 'uploading' && tracked.status !== 'processing') dismissUpload(tracked.id)
    setUploadId(undefined)
    setPendingImageBase64(undefined)
    setImageMode('fillForm')
  }

  const handleSend = () => {
    if (!message.trim()) return
    void flow.sendMessage(message, pendingImageBase64, imageMode)
    setMessage('')
    clearAttachedImage()
  }

  const isBusy = flow.state.status === 'busy'

  const roleLabelFor = (entity: AssistantEntityKey) => t(`admin.assistant.entities.${entity}`)

  const renderIssues = (issues: { code: string; params?: Record<string, string> }[]) => {
    if (issues.length === 0) return null
    return (
      <Alert variant="warning" title={t('admin.assistant.title')}>
        <ul className="assistant-panel__issues">
          {issues.map((issue, index) => (
            <li key={index}>{t(`admin.assistant.validation.${issue.code}`, issue.params)}</li>
          ))}
        </ul>
      </Alert>
    )
  }

  const renderReview = () => {
    if (flow.state.status === 'reviewingForm') {
      const { entity, action, itemID, draft, issues } = flow.state
      const imageField = IMAGE_FIELD[entity]
      const uploadedUrl = tracked?.status === 'ready' ? tracked.result?.url : undefined
      const draftWithImage = imageField && uploadedUrl ? { ...(draft as Record<string, unknown>), [imageField]: uploadedUrl } : draft

      if (entity === 'product') {
        const productDraft = draftWithImage as Product
        const currentProduct = itemID ? products.find((existing) => existing.itemID === itemID) ?? null : null
        const saveProduct = (product: Product) => {
          const exists = products.some((existing) => existing.itemID === product.itemID)
          setProducts(exists ? products.map((existing) => (existing.itemID === product.itemID ? product : existing)) : [...products, product])
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildProductChangeRows(t, reviewLanguage, currentProduct, productDraft, allCategories, catalogues)}
                onConfirm={() => saveProduct(productDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return (
          <>
            {renderIssues(issues)}
            <ProductForm
              product={itemID ? productDraft : { ...productDraft, itemID: productDraft.itemID }}
              catalogueId={resolveProductCatalogue(productDraft, catalogues)?.catalogue.id ?? catalogues[0]?.id ?? ''}
              defaultCategoryId={productDraft.category || (allCategories[0]?.id ?? '')}
              catalogueCategories={allCategories}
              forceLanguage={reviewLanguage}
              onSave={saveProduct}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'event') {
        const eventDraft = draftWithImage as EventRecord
        const currentEvent = itemID ? events.find((existing) => existing.eventID === itemID) ?? null : null
        const saveEvent = (event: EventRecord) => {
          const exists = events.some((existing) => existing.eventID === event.eventID)
          setEvents(exists ? events.map((existing) => (existing.eventID === event.eventID ? event : existing)) : [...events, event])
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildEventChangeRows(t, reviewLanguage, currentEvent, eventDraft)}
                onConfirm={() => saveEvent(eventDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return (
          <>
            {renderIssues(issues)}
            <EventForm event={eventDraft} forceLanguage={reviewLanguage} onSave={saveEvent} onCancel={flow.cancel} />
          </>
        )
      }

      if (entity === 'user') {
        if (action === 'resetPassword' && itemID) {
          return (
            <>
              {renderIssues(issues)}
              <ResetPasswordForm
                onSave={(password) => {
                  if (!session) return
                  resetUserPassword(session.token, itemID, password)
                    .then(flow.onCommitted)
                    .catch((error) => {
                      if (!(error instanceof SessionExpiredError)) console.error(error)
                    })
                }}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        // `UserForm` is create-only with no initial-value prop (see UsersView's own doc
        // comment — there is no general "edit user" form to pre-fill either), so the
        // assistant's suggested values are shown as a hint rather than pre-filled.
        const userDraft = draft as { username: string; password: string; role: 'subadmin' | 'limited'; allowedSections?: DashboardSection[] }
        const availableRoles: AdminRole[] = session?.role === 'admin' ? ['admin', 'subadmin', 'limited'] : ['subadmin', 'limited']
        return (
          <>
            {renderIssues(issues)}
            {userDraft.username && (
              <Alert variant="info">
                {t('admin.users.usernameLabel')}: {userDraft.username} · {t('admin.users.roleLabel')}: {t(`admin.users.roles.${userDraft.role}`)}
              </Alert>
            )}
            <UserForm
              availableRoles={availableRoles}
              onSave={(input) => {
                if (!session) return
                createUser(session.token, input)
                  .then(flow.onCommitted)
                  .catch((error) => {
                    if (!(error instanceof SessionExpiredError)) console.error(error)
                  })
              }}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'catalogue') {
        const catalogueDraft = draft as Catalogue
        const currentCatalogue = itemID ? catalogues.find((existing) => existing.id === itemID) ?? null : null
        const saveCatalogue = (catalogue: Catalogue) => {
          const exists = catalogues.some((existing) => existing.id === catalogue.id)
          setCatalogues(exists ? catalogues.map((existing) => (existing.id === catalogue.id ? catalogue : existing)) : [...catalogues, catalogue])
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildCatalogueChangeRows(t, reviewLanguage, currentCatalogue, catalogueDraft)}
                onConfirm={() => saveCatalogue(catalogueDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return (
          <>
            {renderIssues(issues)}
            <CatalogueForm catalogue={catalogueDraft} forceLanguage={reviewLanguage} onSave={saveCatalogue} onCancel={flow.cancel} />
          </>
        )
      }

      if (entity === 'category') {
        const categoryDraft = draftWithImage as Category & { catalogueId: string; defaultPrice?: Price }
        const currentCategory = itemID ? allCategories.find((existing) => existing.id === itemID) ?? null : null
        const currentDefaultPrice = itemID ? categoryPrices[itemID] : undefined
        const saveCategory = (category: Category) => {
          setCatalogues(
            catalogues.map((catalogue) => {
              if (catalogue.id !== categoryDraft.catalogueId) return catalogue
              const exists = catalogue.categories.some((existing) => existing.id === category.id)
              return {
                ...catalogue,
                categories: exists
                  ? catalogue.categories.map((existing) => (existing.id === category.id ? category : existing))
                  : [...catalogue.categories, category],
              }
            }),
          )
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildCategoryChangeRows(t, reviewLanguage, currentCategory, categoryDraft, currentDefaultPrice)}
                onConfirm={() => saveCategory(categoryDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return (
          <>
            {renderIssues(issues)}
            {categoryDraft.defaultPrice !== undefined && (
              <Alert variant="info">{t('admin.assistant.suggestedDefaultPrice', { price: JSON.stringify(categoryDraft.defaultPrice) })}</Alert>
            )}
            <CategoryForm category={categoryDraft} forceLanguage={reviewLanguage} onSave={saveCategory} onCancel={flow.cancel} />
          </>
        )
      }

      if (entity === 'categoryCustomField') {
        const customFieldDraft = draft as { categoryId: string; categoryLabel: string; fields: CustomFieldDefinition[] }
        const currentFields = allCategories.find((category) => category.id === customFieldDraft.categoryId)?.customFields ?? []
        const saveCustomFields = (fields: CustomFieldDefinition[]) => {
          setCatalogues(
            catalogues.map((catalogue) => ({
              ...catalogue,
              categories: catalogue.categories.map((existing) => (existing.id === customFieldDraft.categoryId ? { ...existing, customFields: fields } : existing)),
            })),
          )
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildCategoryCustomFieldChangeRows(t, reviewLanguage, currentFields, customFieldDraft)}
                onConfirm={() => saveCustomFields(customFieldDraft.fields)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return <CategoryCustomFieldReview draft={customFieldDraft} issues={issues} renderIssues={renderIssues} onSave={saveCustomFields} onCancel={flow.cancel} />
      }

      if (entity === 'messageBoard') {
        const boardDraft = draft as MessageBoard
        const currentBoard = itemID ? boards.find((existing) => existing.id === itemID) ?? null : null
        const saveBoardName = (name: string) => {
          const board = { ...boardDraft, name }
          const exists = boards.some((existing) => existing.id === board.id)
          setBoards(exists ? boards.map((existing) => (existing.id === board.id ? board : existing)) : [...boards, board])
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildMessageBoardChangeRows(t, currentBoard, boardDraft)}
                onConfirm={() => saveBoardName(boardDraft.name)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return <MessageBoardMiniForm name={boardDraft.name} issues={issues} renderIssues={renderIssues} onSave={saveBoardName} onCancel={flow.cancel} />
      }

      if (entity === 'messageBoardPost') {
        const postDraft = draftWithImage as MessageBoardPost
        const currentPost = itemID ? posts.find((existing) => existing.id === itemID) ?? null : null
        const boardName = boards.find((board) => board.id === postDraft.boardId)?.name ?? postDraft.boardId
        const savePost = (post: MessageBoardPost) => {
          const exists = posts.some((existing) => existing.id === post.id)
          setPosts(exists ? posts.map((existing) => (existing.id === post.id ? post : existing)) : [post, ...posts])
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildMessageBoardPostChangeRows(t, currentPost, postDraft, boardName)}
                onConfirm={() => savePost(postDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return (
          <>
            {renderIssues(issues)}
            <MessageBoardPostForm post={itemID ? postDraft : null} boardId={postDraft.boardId} authorUsername={postDraft.authorUsername} onSave={savePost} onCancel={flow.cancel} />
          </>
        )
      }

      if (entity === 'appearanceThemeColor') {
        const colorDraft = draft as { themeId: string; themeName: string; colors: AppearanceThemeColor[] }
        const currentColors = appearanceSettings.themes.find((existing) => existing.id === colorDraft.themeId)?.colors ?? []
        const saveColors = (colors: AppearanceThemeColor[]) => {
          setAppearanceSettings({
            ...appearanceSettings,
            themes: appearanceSettings.themes.map((theme) => (theme.id === colorDraft.themeId ? { ...theme, colors } : theme)),
          })
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildAppearanceThemeColorChangeRows(t, currentColors, colorDraft)}
                onConfirm={() => saveColors(colorDraft.colors)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return <AppearanceThemeColorReview draft={colorDraft} issues={issues} renderIssues={renderIssues} onSave={saveColors} onCancel={flow.cancel} />
      }

      if (entity === 'theme') {
        const themeDraft = draft as AppearanceTheme
        if (action === 'trigger') {
          return (
            <div className="assistant-panel__destructive">
              {renderIssues(issues)}
              <Alert variant="info" title={t('admin.assistant.title')}>
                {t('admin.assistant.setActiveThemeConfirm', { name: themeDraft.name })}
              </Alert>
              <div className="assistant-panel__actions">
                <Button type="button" variant="secondary" onClick={flow.cancel}>
                  {t('admin.assistant.cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setAppearanceSettings({ ...appearanceSettings, activeThemeId: themeDraft.id })
                    flow.onCommitted()
                  }}
                >
                  {t('admin.assistant.confirmButton')}
                </Button>
              </div>
            </div>
          )
        }
        const currentTheme = itemID ? appearanceSettings.themes.find((existing) => existing.id === itemID) ?? null : null
        const saveTheme = (theme: AppearanceTheme) => {
          const exists = appearanceSettings.themes.some((existing) => existing.id === theme.id)
          setAppearanceSettings({
            ...appearanceSettings,
            themes: exists ? appearanceSettings.themes.map((existing) => (existing.id === theme.id ? theme : existing)) : [...appearanceSettings.themes, theme],
          })
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildThemeChangeRows(t, currentTheme, themeDraft)}
                onConfirm={() => saveTheme(themeDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return (
          <>
            {renderIssues(issues)}
            <ThemeEditorForm theme={themeDraft} onSave={saveTheme} onCancel={flow.cancel} />
          </>
        )
      }

      if (entity === 'storeSettings') {
        const storeSettingsDraft = draftWithImage as StoreSettings
        const saveStoreSettings = (next: StoreSettings) => {
          setStoreSettings(next)
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildStoreSettingsChangeRows(t, storeSettings, storeSettingsDraft)}
                onConfirm={() => saveStoreSettings(storeSettingsDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return <StoreSettingsMiniForm draft={storeSettingsDraft} issues={issues} renderIssues={renderIssues} onSave={saveStoreSettings} onCancel={flow.cancel} />
      }

      if (entity === 'contactInfo') {
        const contactInfoDraft = draft as ContactInfo
        const saveContactInfo = (next: ContactInfo) => {
          setContactInfo(next)
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildContactInfoChangeRows(t, contactInfo, contactInfoDraft)}
                onConfirm={() => saveContactInfo(contactInfoDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return <ContactInfoMiniForm draft={contactInfoDraft} issues={issues} renderIssues={renderIssues} onSave={saveContactInfo} onCancel={flow.cancel} />
      }

      if (entity === 'integrationToggle') {
        const toggleDraft = draft as { integration: 'weather' | 'transit' | 'entur' | 'news'; enabled: boolean; sourceIds?: string[] }
        const currentToggle = {
          enabled: integrationsConfig[toggleDraft.integration].enabled,
          sourceIds: toggleDraft.integration === 'news' ? integrationsConfig.news.enabledSourceIds : undefined,
        }
        const saveToggle = (next: { integration: 'weather' | 'transit' | 'entur' | 'news'; enabled: boolean; sourceIds?: string[] }) => {
          setIntegrationsConfig({
            ...integrationsConfig,
            [next.integration]: {
              ...integrationsConfig[next.integration],
              enabled: next.enabled,
              ...(next.integration === 'news' ? { enabledSourceIds: next.sourceIds ?? [] } : {}),
            },
          })
          flow.onCommitted()
        }
        if (!isEditingDraft) {
          return (
            <>
              {renderIssues(issues)}
              <AssistantReviewSummary
                rows={buildIntegrationToggleChangeRows(t, currentToggle, toggleDraft, t(`admin.integrations.${toggleDraft.integration}Label`))}
                onConfirm={() => saveToggle(toggleDraft)}
                onEdit={() => setIsEditingDraft(true)}
                onCancel={flow.cancel}
              />
            </>
          )
        }
        return <IntegrationToggleMiniForm draft={toggleDraft} issues={issues} renderIssues={renderIssues} onSave={saveToggle} onCancel={flow.cancel} />
      }
    }

    if (flow.state.status === 'reviewingDestructive') {
      const { entity, itemID, label, issues } = flow.state
      const requiredPhrase = label
      const matches = confirmPhrase.trim() === requiredPhrase.trim()
      const hasBlockingIssue = issues.some((issue) => BLOCKING_DELETE_ISSUE_CODES.has(issue.code))
      return (
        <div className="assistant-panel__destructive">
          <Alert variant="error" title={t('admin.assistant.title')}>
            {t('admin.assistant.actions.delete')} {roleLabelFor(entity)}: <strong>{label}</strong>
          </Alert>
          {renderIssues(issues)}
          <label className="assistant-panel__field">
            <span>{t('admin.assistant.typeToConfirmLabel', { phrase: requiredPhrase })}</span>
            <input value={confirmPhrase} onChange={(event) => setConfirmPhrase(event.target.value)} />
          </label>
          <div className="assistant-panel__actions">
            <Button type="button" variant="secondary" onClick={flow.cancel}>
              {t('admin.assistant.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!matches || hasBlockingIssue}
              onClick={() => {
                if (!session || !itemID) return
                if (entity === 'user') {
                  deleteUser(session.token, itemID)
                    .then(flow.onCommitted)
                    .catch((error) => {
                      if (!(error instanceof SessionExpiredError)) console.error(error)
                    })
                } else if (entity === 'product') {
                  setProducts(products.filter((existing) => existing.itemID !== itemID))
                  flow.onCommitted()
                } else if (entity === 'event') {
                  setEvents(events.filter((existing) => existing.eventID !== itemID))
                  flow.onCommitted()
                } else if (entity === 'catalogue') {
                  // Matches `ProductsView.tsx`'s own real delete: a naive top-level filter, no cascade — see `catalogue.ts`'s own `validate()` soft warning for why that's a known, honestly-surfaced gap rather than one this commit silently repeats differently.
                  setCatalogues(catalogues.filter((existing) => existing.id !== itemID))
                  flow.onCommitted()
                } else if (entity === 'category') {
                  // Replicates `CategoriesView.tsx`'s real 3-part cascade: remove from the parent catalogue's `categories[]`, drop every product in it, clear its default-price entry.
                  setCatalogues(catalogues.map((catalogue) => ({ ...catalogue, categories: catalogue.categories.filter((existing) => existing.id !== itemID) })))
                  setProducts(products.filter((existing) => existing.category !== itemID))
                  setCategoryPrices({ ...categoryPrices, [itemID]: undefined })
                  flow.onCommitted()
                } else if (entity === 'messageBoard') {
                  // Replicates `MessageBoardView.tsx`'s own `handleDeleteBoard`: remove the board and every post on it.
                  setBoards(boards.filter((existing) => existing.id !== itemID))
                  setPosts(posts.filter((existing) => existing.boardId !== itemID))
                  flow.onCommitted()
                } else if (entity === 'messageBoardPost') {
                  setPosts(posts.filter((existing) => existing.id !== itemID))
                  flow.onCommitted()
                } else if (entity === 'theme') {
                  setAppearanceSettings({ ...appearanceSettings, themes: appearanceSettings.themes.filter((existing) => existing.id !== itemID) })
                  flow.onCommitted()
                }
              }}
            >
              {t('admin.assistant.confirmButton')}
            </Button>
          </div>
        </div>
      )
    }

    return null
  }

  const selectedLogEntry = logView?.mode === 'entry' ? flow.conversationLog.entries.find((entry) => entry.id === logView.id) : undefined

  // The model actually answering this chat right now: this device's own override if it has one,
  // otherwise the shared default fetched above (`null` for a `limited` account, which can't read
  // that endpoint — the subtitle below just omits a model name in that case rather than guessing).
  // Reuses `MODEL_OVERRIDE_OPTIONS`' own translated label rather than a separate short-name key —
  // every one of those labels is "<name> — <descriptor>", so the name alone is everything before it.
  const activeModel = modelOverride ?? defaultModel
  // `activeModel` is a Claude-only concept (see `MODEL_OVERRIDE_OPTIONS`) — suppressed when the
  // active provider is `'local'`, same reasoning as hiding the model-menu section above: there's no
  // real per-message model to name on the Ollama path.
  const modelSubtitle = assistantProvider !== 'local' && flow.allowedEntities.length > 0 && activeModel ? t(`admin.integrations.assistantModel.${activeModel}.label`).split(' — ')[0] : undefined

  /** Copies the whole current conversation (every message, every thought step's raw trace, and the model that answered it) as plain text — see `buildConversationClipboardText`. */
  const handleCopyConversation = () => {
    const modelLabel = assistantProvider !== 'local' && activeModel ? t(`admin.integrations.assistantModel.${activeModel}.label`) : null
    navigator.clipboard.writeText(buildConversationClipboardText(flow.transcript, modelLabel, t)).then(() => {
      setConversationCopied(true)
      setTimeout(() => setConversationCopied(false), 2000)
    })
  }

  const modelMenuButton = flow.allowedEntities.length > 0 && (
    <button
      type="button"
      className="admin-right-panel__header-action"
      onClick={() => {
        setModelMenuOpen((current) => !current)
        setLogView(null)
      }}
      aria-label={t('admin.assistant.modelMenuTitle')}
      title={t('admin.assistant.modelMenuTitle')}
    >
      <KebabIcon />
    </button>
  )

  const headerActions = flow.allowedEntities.length > 0 && (
    <>
      <button
        type="button"
        className="admin-right-panel__header-action"
        onClick={() => {
          setLogView((current) => (current ? null : { mode: 'list' }))
          setModelMenuOpen(false)
        }}
        aria-label={t('admin.assistant.conversationLog')}
        title={t('admin.assistant.conversationLog')}
      >
        <ClockIcon />
      </button>
      <button
        type="button"
        className="admin-right-panel__header-action"
        onClick={() => {
          flow.newChat()
          setLogView(null)
          setModelMenuOpen(false)
          setChatKey((key) => key + 1)
        }}
        aria-label={t('admin.assistant.newChat')}
        title={t('admin.assistant.newChat')}
      >
        <NewChatIcon />
      </button>
    </>
  )

  return (
    <AdminRightPanel
      open={open}
      onClose={onClose}
      title={t('admin.assistant.title')}
      subtitle={modelSubtitle}
      width="wide"
      headerStart={modelMenuButton}
      headerEnd={headerActions}
    >
      <div className="assistant-panel">
        {allCategories.length === 0 && null}
        {flow.allowedEntities.length === 0 ? (
          <Alert variant="info">{t('admin.assistant.noAccess')}</Alert>
        ) : (
          <AnimatePresence mode="wait">
            {modelMenuOpen ? (
              // Same slide-in/out-from-the-right treatment as the log view below.
              <motion.div
                key="model-menu"
                className="assistant-panel__log"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <button type="button" className="assistant-panel__log-back" onClick={() => setModelMenuOpen(false)}>
                  <ChevronLeftIcon />
                  {t('admin.common.back')}
                </button>
                {assistantProvider !== 'local' && (
                  <>
                    <div className="assistant-panel__log-entry-header">
                      <span className="assistant-panel__log-title">{t('admin.assistant.modelMenuTitle')}</span>
                    </div>
                    <ul className="assistant-panel__log-list">
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setModelOverride(null)
                            setModelMenuOpen(false)
                          }}
                        >
                          <span className={`assistant-panel__log-title${modelOverride === null ? ' assistant-panel__model-menu-option--selected' : ''}`}>
                            {t('admin.assistant.modelDefaultOption')}
                          </span>
                        </button>
                      </li>
                      {MODEL_OVERRIDE_OPTIONS.map((model) => (
                        <li key={model}>
                          <button
                            type="button"
                            onClick={() => {
                              setModelOverride(model)
                              setModelMenuOpen(false)
                            }}
                          >
                            <span className={`assistant-panel__log-title${modelOverride === model ? ' assistant-panel__model-menu-option--selected' : ''}`}>
                              {t(`admin.integrations.assistantModel.${model}.label`)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="assistant-panel__log-entry-header">
                  <span className="assistant-panel__log-title">{t('admin.assistant.chunkSizeMenuTitle')}</span>
                </div>
                <p className="assistant-panel__model-menu-description">{t('admin.assistant.chunkSizeDescription')}</p>
                <ul className="assistant-panel__log-list">
                  {CHUNK_SIZE_OPTIONS.map((option) => (
                    <li key={option}>
                      <button
                        type="button"
                        onClick={() => {
                          setChunkSizePreference(option)
                          // "Custom" needs the menu to stay open so the numeric field below is reachable — every other option closes it, same as the model list above.
                          if (option !== 'custom') setModelMenuOpen(false)
                        }}
                      >
                        <span className={`assistant-panel__log-title${chunkSizePreference === option ? ' assistant-panel__model-menu-option--selected' : ''}`}>
                          {t(`admin.assistant.chunkSizeOption.${option}`)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {chunkSizePreference === 'custom' && (
                  <NumberInput
                    id="assistant-chunk-size-custom"
                    label={t('admin.assistant.chunkSizeCustomLabel')}
                    value={customChunkRecordCount ?? DEFAULT_CUSTOM_CHUNK_RECORD_COUNT}
                    onChange={setCustomChunkRecordCount}
                    min={1}
                    max={1000}
                  />
                )}
                {session?.role === 'admin' && (
                  <>
                    <div className="assistant-panel__log-entry-header">
                      <span className="assistant-panel__log-title">{t('admin.assistant.copyConversationSectionTitle')}</span>
                    </div>
                    <ul className="assistant-panel__log-list">
                      <li>
                        <button type="button" onClick={handleCopyConversation} disabled={flow.transcript.length === 0}>
                          <span className="assistant-panel__log-title-row">
                            <CopyIcon />
                            <span className="assistant-panel__log-title">
                              {conversationCopied ? t('admin.assistant.copyConversationCopied') : t('admin.assistant.copyConversation')}
                            </span>
                          </span>
                        </button>
                      </li>
                    </ul>
                  </>
                )}
              </motion.div>
            ) : logView ? (
              // Slides in/out from the right, like navigating into a sub-page of the panel.
              <motion.div
                key="log"
                className="assistant-panel__log"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {logView.mode === 'entry' ? (
                  <>
                    <button type="button" className="assistant-panel__log-back" onClick={() => setLogView({ mode: 'list' })}>
                      <ChevronLeftIcon />
                      {t('admin.common.back')}
                    </button>
                    <div className="assistant-panel__log-entry-header">
                      <span className="assistant-panel__log-title">{selectedLogEntry?.title}</span>
                      {selectedLogEntry?.hadError && <Badge variant="error">{t('admin.assistant.conversationErrorTag')}</Badge>}
                    </div>
                    <div className="assistant-panel__transcript assistant-panel__transcript--readonly">
                      {selectedLogEntry?.transcript.map((line) =>
                        line.role === 'thought' ? (
                          <AssistantThoughtTrace key={line.id} trace={line.trace} durationMs={line.durationMs} />
                        ) : (
                          <div key={line.id} className={`assistant-panel__line assistant-panel__line--${line.role}${line.variant ? ` assistant-panel__line--${line.variant}` : ''}`}>
                            {line.text}
                          </div>
                        ),
                      )}
                    </div>
                  </>
                ) : flow.conversationLog.entries.length === 0 ? (
                  <Alert variant="info">{t('admin.assistant.noConversations')}</Alert>
                ) : (
                  <ul className="assistant-panel__log-list">
                    {flow.conversationLog.entries.map((entry) => (
                      <li key={entry.id}>
                        <button type="button" onClick={() => setLogView({ mode: 'entry', id: entry.id })}>
                          <span className="assistant-panel__log-title-row">
                            <span className="assistant-panel__log-title">{entry.title}</span>
                            {entry.hadError && <Badge variant="error">{t('admin.assistant.conversationErrorTag')}</Badge>}
                          </span>
                          <span className="assistant-panel__log-date">{formatDateTime(new Date(entry.createdAt), language, clockFormat, dateFormat)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            ) : (
              // Keyed by `chatKey` so "New chat" (which bumps it) plays this exact exit
              // animation for the outgoing conversation before the fresh, empty one mounts.
              <motion.div
                key={`chat-${chatKey}`}
                className="assistant-panel__chat"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: '-100%' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <div className="assistant-panel__transcript">
                  {flow.transcript.map((line) =>
                    line.role === 'thought' ? (
                      <motion.div key={line.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                        <AssistantThoughtTrace trace={line.trace} durationMs={line.durationMs} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key={line.id}
                        className={`assistant-panel__line assistant-panel__line--${line.role}${line.variant ? ` assistant-panel__line--${line.variant}` : ''}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                      >
                        {line.text}
                      </motion.div>
                    ),
                  )}

                  {flow.state.status === 'confirmItem' && (
                    <div className="assistant-panel__confirm-item">
                      <p>{t('admin.assistant.confirmMatchQuestion')}</p>
                      <ul>
                        {(flow.state.showAll ? flow.state.candidates : flow.state.candidates.slice(0, 1)).map((candidate) => (
                          <li key={candidate.id}>
                            <button type="button" onClick={() => void flow.pickCandidate(candidate.id)}>
                              {candidate.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {!flow.state.showAll && (
                        <div className="assistant-panel__actions">
                          <Button type="button" onClick={() => void flow.confirmItemMatch()}>
                            {t('admin.assistant.confirmMatchYes')}
                          </Button>
                          <Button type="button" variant="secondary" onClick={flow.showOtherCandidates}>
                            {t('admin.assistant.confirmMatchShowOthers')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {flow.state.status === 'clarifying' && (
                    <div className="assistant-panel__confirm-item">
                      {flow.state.clarifications.map((clarification) => (
                        <div key={clarification.field}>
                          <p>{t(clarification.questionKey)}</p>
                          <ul>
                            {clarification.options.map((option) => {
                              const selected = flow.state.status === 'clarifying' && flow.state.resolvedFields[clarification.field] === option.id
                              return (
                                <li key={option.id}>
                                  <button
                                    type="button"
                                    className={selected ? 'assistant-panel__clarify-option--selected' : undefined}
                                    onClick={() => void flow.answerClarification(clarification.field, option.id)}
                                  >
                                    {option.label}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {(flow.state.status === 'reviewingForm' || flow.state.status === 'reviewingDestructive') && <div className="assistant-panel__review">{renderReview()}</div>}

                  {isBusy && (
                    <AssistantThoughtTrace
                      live
                      trace={flow.currentTrace}
                      typingLabel={flow.state.status === 'busy' && flow.state.phase === 'verifying' ? t('admin.assistant.doubleChecking') : t('admin.assistant.thinking')}
                    />
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                <AnimatePresence>
                  {flow.transcript.length === 0 && (
                    <motion.p
                      key="composer-hint"
                      className="assistant-panel__composer-hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {t('admin.assistant.composerHint')}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="assistant-panel__composer">
                  {pendingImageBase64 && (
                    <div className="assistant-panel__attachment">
                      {tracked?.status === 'uploading' ? <Spinner /> : null}
                      <div className="assistant-panel__image-mode-toggle" role="radiogroup" aria-label={t('admin.assistant.imageModeFillForm')}>
                        <button type="button" className={imageMode === 'fillForm' ? 'is-active' : ''} aria-pressed={imageMode === 'fillForm'} onClick={() => setImageMode('fillForm')}>
                          {t('admin.assistant.imageModeFillForm')}
                        </button>
                        <button type="button" className={imageMode === 'transcribeOnly' ? 'is-active' : ''} aria-pressed={imageMode === 'transcribeOnly'} onClick={() => setImageMode('transcribeOnly')}>
                          {t('admin.assistant.imageModeTranscribeOnly')}
                        </button>
                      </div>
                      <button type="button" onClick={clearAttachedImage} aria-label={t('admin.common.cancel')}>
                        ×
                      </button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleFileChange(event)} />
                  <button type="button" className="assistant-panel__attach-button" onClick={handleAttachClick} title={t('admin.assistant.attachImage')}>
                    📎
                  </button>
                  <textarea
                    value={message}
                    placeholder={t('admin.assistant.composerPlaceholder')}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        handleSend()
                      }
                    }}
                  />
                  <Button type="button" onClick={handleSend} disabled={!message.trim()}>
                    {t('admin.assistant.send')}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </AdminRightPanel>
  )
}

type AssistantIssue = { code: string; params?: Record<string, string> }
type RenderIssues = (issues: AssistantIssue[]) => ReactNode

interface MiniFormActionsProps {
  onCancel: () => void
  onSave: () => void
}

/** Shared Cancel/Save action row for the small inline review forms below — none of these singleton/nested settings has its own dedicated admin form component to reuse (they're edited live, field-by-field, straight off their own hook — see each mini-form's own doc comment), so this is the one bit of UI shape worth sharing between them instead of repeating. */
function MiniFormActions({ onCancel, onSave }: MiniFormActionsProps) {
  const { t } = useLanguage()
  return (
    <div className="assistant-panel__actions">
      <Button type="button" variant="secondary" onClick={onCancel}>
        {t('admin.common.cancel')}
      </Button>
      <Button type="button" onClick={onSave}>
        {t('admin.common.save')}
      </Button>
    </div>
  )
}

interface MessageBoardMiniFormProps {
  name: string
  issues: AssistantIssue[]
  renderIssues: RenderIssues
  onSave: (name: string) => void
  onCancel: () => void
}

/** `MessageBoardView.tsx` itself has no standalone board-name form component — it's a single inline `Input` inside that view's own rename/create Modal — so this mirrors that shape rather than reusing a component that doesn't exist. */
function MessageBoardMiniForm({ name, issues, renderIssues, onSave, onCancel }: MessageBoardMiniFormProps) {
  const { t } = useLanguage()
  const [value, setValue] = useState(name)
  return (
    <>
      {renderIssues(issues)}
      <label className="assistant-panel__field">
        <span>{t('admin.messageBoard.boardNameLabel')}</span>
        <input value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <MiniFormActions onCancel={onCancel} onSave={() => onSave(value)} />
    </>
  )
}

interface CategoryCustomFieldReviewProps {
  draft: { categoryId: string; categoryLabel: string; fields: CustomFieldDefinition[] }
  issues: AssistantIssue[]
  renderIssues: RenderIssues
  onSave: (fields: CustomFieldDefinition[]) => void
  onCancel: () => void
}

/** Reviews the one new field proposed for an existing category (see `categoryCustomField.ts`'s own doc comment — a field has no identity of its own outside the category it lives on) by reusing `CustomFieldListEditor` bound to local state seeded with the category's current schema plus the one proposed addition. Edits in whichever language the admin's own dashboard is currently set to — the same one the model was told to fill in — with no separate language switcher in this narrow review. */
function CategoryCustomFieldReview({ draft, issues, renderIssues, onSave, onCancel }: CategoryCustomFieldReviewProps) {
  const { t, language } = useLanguage()
  const [fields, setFields] = useState(draft.fields)
  return (
    <>
      {renderIssues(issues)}
      <Alert variant="info">{t('admin.assistant.categoryCustomFieldTarget', { name: draft.categoryLabel })}</Alert>
      <CustomFieldListEditor fields={fields} selectedLanguage={language} onChange={setFields} />
      <MiniFormActions onCancel={onCancel} onSave={() => onSave(fields)} />
    </>
  )
}

interface AppearanceThemeColorReviewProps {
  draft: { themeId: string; themeName: string; colors: AppearanceThemeColor[] }
  issues: AssistantIssue[]
  renderIssues: RenderIssues
  onSave: (colors: AppearanceThemeColor[]) => void
  onCancel: () => void
}

/** Reviews the one new color proposed for an existing theme (see `appearanceThemeColor.ts`'s own doc comment — a color has no identity of its own outside a theme) by reusing `ThemeColorListEditor` bound to local state seeded from the proposed palette, so the admin can also tweak/remove it before confirming. */
function AppearanceThemeColorReview({ draft, issues, renderIssues, onSave, onCancel }: AppearanceThemeColorReviewProps) {
  const { t } = useLanguage()
  const [colors, setColors] = useState(draft.colors)
  return (
    <>
      {renderIssues(issues)}
      <Alert variant="info">{t('admin.assistant.themeColorTarget', { name: draft.themeName })}</Alert>
      <ThemeColorListEditor colors={colors} onChange={setColors} />
      <MiniFormActions onCancel={onCancel} onSave={() => onSave(colors)} />
    </>
  )
}

interface StoreSettingsMiniFormProps {
  draft: StoreSettings
  issues: AssistantIssue[]
  renderIssues: RenderIssues
  onSave: (next: StoreSettings) => void
  onCancel: () => void
}

/** `StoreSettingsView.tsx` writes each field straight to `useStoreSettings()` on every change, with no Save/Cancel step of its own — so this mirrors its field set but stages edits locally until the admin explicitly confirms, same as every other assistant review. */
function StoreSettingsMiniForm({ draft, issues, renderIssues, onSave, onCancel }: StoreSettingsMiniFormProps) {
  const { t } = useLanguage()
  const [name, setName] = useState(draft.name)
  const [slogan, setSlogan] = useState(draft.slogan ?? '')
  const [logos, setLogos] = useState(draft.logos)
  const [favicon, setFavicon] = useState(draft.favicon ?? '')
  return (
    <>
      {renderIssues(issues)}
      <Input id="assistant-store-name" label={t('admin.store.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />
      <Input id="assistant-store-slogan" label={t('admin.store.sloganLabel')} value={slogan} onChange={(event) => setSlogan(event.target.value)} />
      <LogoListEditor logos={logos} onChange={setLogos} />
      <label className="assistant-panel__field">
        <span>{t('admin.store.faviconCardTitle')}</span>
        <ImageUploadField id="assistant-store-favicon" value={favicon} onChange={setFavicon} />
      </label>
      <MiniFormActions
        onCancel={onCancel}
        onSave={() => onSave({ name, slogan: slogan || undefined, logos, favicon: favicon || undefined })}
      />
    </>
  )
}

interface ContactInfoMiniFormProps {
  draft: ContactInfo
  issues: AssistantIssue[]
  renderIssues: RenderIssues
  onSave: (next: ContactInfo) => void
  onCancel: () => void
}

const WEEKDAY_KEYS: (keyof ContactInfo['hours'])[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Mirrors `ContactInfoView.tsx`'s own field set (phone/email/address + per-weekday hours), staged locally until confirmed — that view itself writes straight to `useContactInfo()` on every change, with no Save step of its own. */
function ContactInfoMiniForm({ draft, issues, renderIssues, onSave, onCancel }: ContactInfoMiniFormProps) {
  const { t } = useLanguage()
  const [contactInfo, setContactInfo] = useState(draft)

  const updateDay = (day: keyof ContactInfo['hours'], patch: Partial<ContactInfo['hours'][typeof day]>) => {
    setContactInfo({ ...contactInfo, hours: { ...contactInfo.hours, [day]: { ...contactInfo.hours[day], ...patch } } })
  }

  return (
    <>
      {renderIssues(issues)}
      <Input id="assistant-contact-phone" label={t('admin.contact.phoneLabel')} value={contactInfo.phone} onChange={(event) => setContactInfo({ ...contactInfo, phone: event.target.value })} />
      <Input id="assistant-contact-email" label={t('admin.contact.emailLabel')} value={contactInfo.email} onChange={(event) => setContactInfo({ ...contactInfo, email: event.target.value })} />
      <Input
        id="assistant-contact-address"
        label={t('admin.contact.addressLabel')}
        value={contactInfo.address}
        onChange={(event) => setContactInfo({ ...contactInfo, address: event.target.value })}
      />
      <ul className="contact-info-view__hours">
        {WEEKDAY_KEYS.map((day) => {
          const dayHours = contactInfo.hours[day]
          return (
            <li key={day}>
              <span className="contact-info-view__day-label">{t(`footer.hours.${day}`)}</span>
              <Checkbox
                id={`assistant-contact-closed-${day}`}
                label={t('admin.contact.closedLabel')}
                checked={dayHours.closed}
                onChange={(event) => updateDay(day, { closed: event.target.checked })}
              />
              {!dayHours.closed && (
                <>
                  <label className="contact-info-view__time">
                    <span>{t('admin.contact.openLabel')}</span>
                    <input type="time" value={dayHours.open ?? ''} onChange={(event) => updateDay(day, { open: event.target.value })} />
                  </label>
                  <label className="contact-info-view__time">
                    <span>{t('admin.contact.closeLabel')}</span>
                    <input type="time" value={dayHours.close ?? ''} onChange={(event) => updateDay(day, { close: event.target.value })} />
                  </label>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <MiniFormActions onCancel={onCancel} onSave={() => onSave(contactInfo)} />
    </>
  )
}

interface IntegrationToggleMiniFormProps {
  draft: { integration: 'weather' | 'transit' | 'entur' | 'news'; enabled: boolean; sourceIds?: string[] }
  issues: AssistantIssue[]
  renderIssues: RenderIssues
  onSave: (next: { integration: 'weather' | 'transit' | 'entur' | 'news'; enabled: boolean; sourceIds?: string[] }) => void
  onCancel: () => void
}

/** Mirrors `IntegrationsView.tsx`'s own enabled toggle per integration card, plus (news only) which sources are on — that view writes straight to `useIntegrationsConfig()` per click, so this stages the same edit locally until confirmed. */
function IntegrationToggleMiniForm({ draft, issues, renderIssues, onSave, onCancel }: IntegrationToggleMiniFormProps) {
  const { t } = useLanguage()
  const [enabled, setEnabled] = useState(draft.enabled)
  const [sourceIds, setSourceIds] = useState<string[]>(draft.sourceIds ?? [])

  const toggleSource = (id: string) => {
    setSourceIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]))
  }

  return (
    <>
      {renderIssues(issues)}
      <Checkbox
        id={`assistant-integration-enabled-${draft.integration}`}
        label={t('admin.assistant.entities.integrationToggle')}
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      {draft.integration === 'news' && (
        <ul className="assistant-panel__news-sources">
          {NEWS_SOURCES.map((source) => (
            <li key={source.id}>
              <Checkbox
                id={`assistant-news-source-${source.id}`}
                label={source.name}
                checked={sourceIds.includes(source.id)}
                onChange={() => toggleSource(source.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <MiniFormActions onCancel={onCancel} onSave={() => onSave({ integration: draft.integration, enabled, sourceIds: draft.integration === 'news' ? sourceIds : undefined })} />
    </>
  )
}
