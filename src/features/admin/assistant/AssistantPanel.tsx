import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Alert, Button, Checkbox, ImageUploadField, Input, Spinner } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useAppearanceThemes } from '../../../hooks/useAppearanceThemes'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useCategoryPrices } from '../../../hooks/useCategoryPrices'
import { useContactInfo } from '../../../hooks/useContactInfo'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useEvents } from '../../../hooks/useEvents'
import { useIntegrationsConfig } from '../../../hooks/useIntegrationsConfig'
import { useMessageBoardPosts } from '../../../hooks/useMessageBoardPosts'
import { useMessageBoards } from '../../../hooks/useMessageBoards'
import { useProducts } from '../../../hooks/useProducts'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import { createUser, deleteUser, resetUserPassword, SessionExpiredError } from '../../../lib/localServer'
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
import { AssistantTypingIndicator } from './AssistantTypingIndicator'
import { type AssistantEntityKey, useAssistantFlow } from './useAssistantFlow'
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
  const flow = useAssistantFlow()
  const [products, setProducts] = useProducts()
  const [events, setEvents] = useEvents()
  const [catalogues, setCatalogues] = useCatalogues()
  const [categoryPrices, setCategoryPrices] = useCategoryPrices()
  const [boards, setBoards] = useMessageBoards()
  const [posts, setPosts] = useMessageBoardPosts()
  const [appearanceSettings, setAppearanceSettings] = useAppearanceThemes()
  const [, setStoreSettings] = useStoreSettings()
  const [, setContactInfo] = useContactInfo()
  const [integrationsConfig, setIntegrationsConfig] = useIntegrationsConfig()
  const [message, setMessage] = useState('')
  const [uploadId, setUploadId] = useState<string | undefined>()
  const [pendingImageBase64, setPendingImageBase64] = useState<{ mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64Data: string } | undefined>()
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tracked = useUpload(uploadId)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [flow.transcript, flow.state])

  useEffect(() => {
    queueMicrotask(() => setConfirmPhrase(''))
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
  }

  const handleSend = () => {
    if (!message.trim()) return
    void flow.sendMessage(message, pendingImageBase64)
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
        return (
          <>
            {renderIssues(issues)}
            <ProductForm
              product={itemID ? productDraft : { ...productDraft, itemID: productDraft.itemID }}
              catalogueId={resolveProductCatalogue(productDraft, catalogues)?.catalogue.id ?? catalogues[0]?.id ?? ''}
              defaultCategoryId={productDraft.category || (allCategories[0]?.id ?? '')}
              catalogueCategories={allCategories}
              forceLanguage={reviewLanguage}
              onSave={(product) => {
                const exists = products.some((existing) => existing.itemID === product.itemID)
                setProducts(exists ? products.map((existing) => (existing.itemID === product.itemID ? product : existing)) : [...products, product])
                flow.onCommitted()
              }}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'event') {
        const eventDraft = draftWithImage as EventRecord
        return (
          <>
            {renderIssues(issues)}
            <EventForm
              event={eventDraft}
              forceLanguage={reviewLanguage}
              onSave={(event) => {
                const exists = events.some((existing) => existing.eventID === event.eventID)
                setEvents(exists ? events.map((existing) => (existing.eventID === event.eventID ? event : existing)) : [...events, event])
                flow.onCommitted()
              }}
              onCancel={flow.cancel}
            />
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
        return (
          <>
            {renderIssues(issues)}
            <CatalogueForm
              catalogue={catalogueDraft}
              forceLanguage={reviewLanguage}
              onSave={(catalogue) => {
                const exists = catalogues.some((existing) => existing.id === catalogue.id)
                setCatalogues(exists ? catalogues.map((existing) => (existing.id === catalogue.id ? catalogue : existing)) : [...catalogues, catalogue])
                flow.onCommitted()
              }}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'category') {
        const categoryDraft = draftWithImage as Category & { catalogueId: string; defaultPrice?: Price }
        return (
          <>
            {renderIssues(issues)}
            {categoryDraft.defaultPrice !== undefined && (
              <Alert variant="info">{t('admin.assistant.suggestedDefaultPrice', { price: JSON.stringify(categoryDraft.defaultPrice) })}</Alert>
            )}
            <CategoryForm
              category={categoryDraft}
              forceLanguage={reviewLanguage}
              onSave={(category) => {
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
              }}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'categoryCustomField') {
        const customFieldDraft = draft as { categoryId: string; categoryLabel: string; fields: CustomFieldDefinition[] }
        return (
          <CategoryCustomFieldReview
            draft={customFieldDraft}
            issues={issues}
            renderIssues={renderIssues}
            onSave={(fields) => {
              setCatalogues(
                catalogues.map((catalogue) => ({
                  ...catalogue,
                  categories: catalogue.categories.map((existing) => (existing.id === customFieldDraft.categoryId ? { ...existing, customFields: fields } : existing)),
                })),
              )
              flow.onCommitted()
            }}
            onCancel={flow.cancel}
          />
        )
      }

      if (entity === 'messageBoard') {
        const boardDraft = draft as MessageBoard
        return (
          <MessageBoardMiniForm
            name={boardDraft.name}
            issues={issues}
            renderIssues={renderIssues}
            onSave={(name) => {
              const board = { ...boardDraft, name }
              const exists = boards.some((existing) => existing.id === board.id)
              setBoards(exists ? boards.map((existing) => (existing.id === board.id ? board : existing)) : [...boards, board])
              flow.onCommitted()
            }}
            onCancel={flow.cancel}
          />
        )
      }

      if (entity === 'messageBoardPost') {
        const postDraft = draftWithImage as MessageBoardPost
        return (
          <>
            {renderIssues(issues)}
            <MessageBoardPostForm
              post={itemID ? postDraft : null}
              boardId={postDraft.boardId}
              authorUsername={postDraft.authorUsername}
              onSave={(post) => {
                const exists = posts.some((existing) => existing.id === post.id)
                setPosts(exists ? posts.map((existing) => (existing.id === post.id ? post : existing)) : [post, ...posts])
                flow.onCommitted()
              }}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'appearanceThemeColor') {
        const colorDraft = draft as { themeId: string; themeName: string; colors: AppearanceThemeColor[] }
        return (
          <AppearanceThemeColorReview
            draft={colorDraft}
            issues={issues}
            renderIssues={renderIssues}
            onSave={(colors) => {
              setAppearanceSettings({
                ...appearanceSettings,
                themes: appearanceSettings.themes.map((theme) => (theme.id === colorDraft.themeId ? { ...theme, colors } : theme)),
              })
              flow.onCommitted()
            }}
            onCancel={flow.cancel}
          />
        )
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
        return (
          <>
            {renderIssues(issues)}
            <ThemeEditorForm
              theme={themeDraft}
              onSave={(theme) => {
                const exists = appearanceSettings.themes.some((existing) => existing.id === theme.id)
                setAppearanceSettings({
                  ...appearanceSettings,
                  themes: exists ? appearanceSettings.themes.map((existing) => (existing.id === theme.id ? theme : existing)) : [...appearanceSettings.themes, theme],
                })
                flow.onCommitted()
              }}
              onCancel={flow.cancel}
            />
          </>
        )
      }

      if (entity === 'storeSettings') {
        const storeSettingsDraft = draftWithImage as StoreSettings
        return (
          <StoreSettingsMiniForm
            draft={storeSettingsDraft}
            issues={issues}
            renderIssues={renderIssues}
            onSave={(next) => {
              setStoreSettings(next)
              flow.onCommitted()
            }}
            onCancel={flow.cancel}
          />
        )
      }

      if (entity === 'contactInfo') {
        const contactInfoDraft = draft as ContactInfo
        return (
          <ContactInfoMiniForm
            draft={contactInfoDraft}
            issues={issues}
            renderIssues={renderIssues}
            onSave={(next) => {
              setContactInfo(next)
              flow.onCommitted()
            }}
            onCancel={flow.cancel}
          />
        )
      }

      if (entity === 'integrationToggle') {
        const toggleDraft = draft as { integration: 'weather' | 'transit' | 'entur' | 'news'; enabled: boolean; sourceIds?: string[] }
        return (
          <IntegrationToggleMiniForm
            draft={toggleDraft}
            issues={issues}
            renderIssues={renderIssues}
            onSave={(next) => {
              setIntegrationsConfig({
                ...integrationsConfig,
                [next.integration]: {
                  ...integrationsConfig[next.integration],
                  enabled: next.enabled,
                  ...(next.integration === 'news' ? { enabledSourceIds: next.sourceIds ?? [] } : {}),
                },
              })
              flow.onCommitted()
            }}
            onCancel={flow.cancel}
          />
        )
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

  return (
    <AdminRightPanel open={open} onClose={onClose} title={t('admin.assistant.title')} width="wide">
      <div className="assistant-panel">
        {allCategories.length === 0 && null}
        {flow.allowedEntities.length === 0 ? (
          <Alert variant="info">{t('admin.assistant.noAccess')}</Alert>
        ) : (
          <>
            <div className="assistant-panel__transcript">
              {flow.transcript.map((line) => (
                <div key={line.id} className={`assistant-panel__line assistant-panel__line--${line.role}`}>
                  {line.text}
                </div>
              ))}

              {flow.state.status === 'noMatch' && <Alert variant="info">{t('admin.assistant.noMatchFound')}</Alert>}
              {flow.state.status === 'error' && <Alert variant="error">{flow.state.message || t('admin.assistant.errorGeneric')}</Alert>}

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

              {isBusy && <AssistantTypingIndicator label={flow.state.status === 'busy' && flow.state.phase === 'verifying' ? t('admin.assistant.doubleChecking') : t('admin.assistant.thinking')} />}
              <div ref={transcriptEndRef} />
            </div>

            <div className="assistant-panel__composer">
              {pendingImageBase64 && (
                <div className="assistant-panel__attachment">
                  {tracked?.status === 'uploading' ? <Spinner /> : null}
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
            {flow.state.status !== 'idle' && (
              <div className="assistant-panel__footer-actions">
                <button type="button" onClick={flow.startOver}>
                  {t('admin.assistant.startOver')}
                </button>
              </div>
            )}
          </>
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
