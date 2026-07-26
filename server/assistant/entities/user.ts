import { validateUserDraft } from '../../../src/lib/assistantValidation'
import { DASHBOARD_SECTIONS, type DashboardSection } from '../../../src/types/sync'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/**
 * What the assistant can propose for a user account. Deliberately narrower
 * than `AdminUserSummary`: `role` never includes `'admin'` — creating or
 * promoting to admin is never reachable through the assistant at all, a
 * stricter rule than the manual `/users` route itself (which does let an
 * `admin` session create another admin) — see the plan's User guardrail.
 */
export interface AssistantUserDraft {
  id?: string
  username: string
  password: string
  role: 'subadmin' | 'limited'
  allowedSections?: DashboardSection[]
}

export const userEntity: AssistantEntity<AssistantUserDraft> = {
  key: 'user',
  supportedActions: ['create', 'delete', 'resetPassword'],
  // No DashboardSection covers Users at all (by design — see src/types/sync.ts):
  // `section: null` means both `admin` and `subadmin` sessions can reach this
  // entity, `limited` never can, matching the real `/users` route's own gate.
  section: null,
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action === 'resetPassword') {
      return { type: 'object', properties: { password: { type: 'string' } }, required: ['password'], additionalProperties: false }
    }
    // 'create' — role never offers 'admin', full stop, regardless of the calling session's own role.
    return {
      type: 'object',
      properties: {
        username: nullable({ type: 'string' }),
        password: nullable({ type: 'string' }),
        role: nullable({ type: 'string', enum: ['subadmin', 'limited'] }),
        allowedSections: nullable({ type: 'array', items: { type: 'string', enum: DASHBOARD_SECTIONS }, description: 'Only meaningful when role is "limited".' }),
      },
      required: ['username', 'password', 'role', 'allowedSections'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    // Hard guardrail, enforced here (not just the tool schema): every admin-role
    // account, and the calling session's own account, are unconditionally
    // excluded — the model is never even offered them as choices.
    const eligible = store.listUsers().filter((user) => user.role !== 'admin' && user.username !== context.session.username)
    const matches = eligible.filter((user) => !needle || user.username.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((user) => ({ id: user.id, label: `${user.username} (${user.role})` }))
  },

  async getCurrent(id: string): Promise<AssistantUserDraft | null> {
    const user = store.listUsers().find((candidate) => candidate.id === id)
    if (!user) return null
    // Password never round-trips through the assistant — resetPassword's own
    // draft only ever carries a fresh value the admin/model just proposed.
    return { id: user.id, username: user.username, password: '', role: user.role === 'admin' ? 'subadmin' : user.role, allowedSections: user.allowedSections }
  },

  mergeDraft(action, current, rawFields): AssistantUserDraft {
    if (action === 'resetPassword') {
      const fields = rawFields as { password: string }
      return { ...(current as AssistantUserDraft), password: fields.password }
    }
    const fields = rawFields as { username: string | null; password: string | null; role: 'subadmin' | 'limited' | null; allowedSections: DashboardSection[] | null }
    return {
      username: fields.username ?? '',
      password: fields.password ?? '',
      role: fields.role ?? 'limited',
      allowedSections: fields.allowedSections ?? undefined,
    }
  },

  validate(action, draft: AssistantUserDraft): AssistantValidationIssue[] {
    if (action === 'delete') return []
    const existingUsernames = store.listUsers().map((user) => user.username)
    return validateUserDraft(draft, action === 'create' ? existingUsernames : [])
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },
}
