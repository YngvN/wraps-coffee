import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Alert, Button, Spinner } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useCatalogues } from '../../../hooks/useCatalogues'
import { useEvents } from '../../../hooks/useEvents'
import { useProducts } from '../../../hooks/useProducts'
import { useLanguage } from '../../../i18n'
import { createUser, deleteUser, resetUserPassword, SessionExpiredError } from '../../../lib/localServer'
import { dismissUpload, startUpload, useUpload } from '../../../lib/uploadManager'
import type { EventRecord } from '../../../types/event'
import type { Product } from '../../../types/product'
import type { AdminRole, DashboardSection } from '../../../types/sync'
import { EventForm } from '../events/EventForm'
import { AdminRightPanel } from '../layout/AdminRightPanel'
import { ProductForm } from '../products/ProductForm'
import { ResetPasswordForm } from '../users/ResetPasswordForm'
import { UserForm } from '../users/UserForm'
import { AssistantTypingIndicator } from './AssistantTypingIndicator'
import { type AssistantEntityKey, useAssistantFlow } from './useAssistantFlow'
import './AssistantPanel.scss'

interface AssistantPanelProps {
  open: boolean
  onClose: () => void
}

const IMAGE_FIELD: Partial<Record<AssistantEntityKey, string>> = { product: 'image', event: 'imageUrl' }

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
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const flow = useAssistantFlow()
  const [products, setProducts] = useProducts()
  const [events, setEvents] = useEvents()
  const [catalogues] = useCatalogues()
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
              defaultCategoryId={productDraft.category || (allCategories[0]?.id ?? '')}
              catalogueCategories={allCategories}
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
    }

    if (flow.state.status === 'reviewingDestructive') {
      const { entity, itemID, label } = flow.state
      const requiredPhrase = label
      const matches = confirmPhrase.trim() === requiredPhrase.trim()
      return (
        <div className="assistant-panel__destructive">
          <Alert variant="error" title={t('admin.assistant.title')}>
            {t('admin.assistant.actions.delete')} {roleLabelFor(entity)}: <strong>{label}</strong>
          </Alert>
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
              disabled={!matches}
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
