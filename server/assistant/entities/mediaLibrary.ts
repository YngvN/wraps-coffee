import { listUploads } from '../../uploads'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** `listUploads` needs a `host` to build absolute URLs — never consulted by anything in this
 * entity's own flow (candidates/drafts only ever carry `filename`/`displayName`; the real commit,
 * `renameUpload`/`deleteUpload` in `AssistantPanel.tsx`, addresses a file by filename directly), so
 * any placeholder value is fine here. */
const PLACEHOLDER_HOST = 'localhost'

export interface MediaLibraryDraft {
  filename: string
  displayName?: string
}

interface MediaLibraryFields {
  displayName: string | null
}

/**
 * Rename/delete only — no `create` (uploads only ever happen via the file-picker/drag-drop
 * `uploadManager` transfer, a binary transfer a chat message can't meaningfully originate).
 * `section: null` — no `DashboardSection` exists for Media Library today (see `DASHBOARD_SECTIONS`
 * in `src/types/sync.ts`); adding one purely to gate this entity is broader than warranted, so this
 * uses the same `section: null` convention as `user` (both `admin` and `subadmin` reach it,
 * `limited` never does).
 */
export const mediaLibraryEntity: AssistantEntity<MediaLibraryDraft> = {
  key: 'mediaLibrary',
  supportedActions: ['update', 'delete'],
  section: null,
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    return {
      type: 'object',
      properties: { displayName: nullable({ type: 'string', description: 'The new label to show for this file instead of its raw filename — pass "" to clear a previous label back to the filename.' }) },
      required: ['displayName'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = listUploads(PLACEHOLDER_HOST).filter(
      (upload) => !needle || upload.filename.toLowerCase().includes(needle) || (upload.displayName ?? '').toLowerCase().includes(needle),
    )
    return matches.slice(0, 30).map((upload) => ({ id: upload.filename, label: upload.displayName || upload.filename }))
  },

  async getCurrent(id: string): Promise<MediaLibraryDraft | null> {
    const upload = listUploads(PLACEHOLDER_HOST).find((candidate) => candidate.filename === id)
    return upload ? { filename: upload.filename, displayName: upload.displayName } : null
  },

  mergeDraft(_action, current, rawFields): MediaLibraryDraft {
    const fields = rawFields as MediaLibraryFields
    const base = current ?? { filename: '' }
    return { ...base, displayName: fields.displayName ?? base.displayName }
  },

  validate(): AssistantValidationIssue[] {
    return []
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },
}
