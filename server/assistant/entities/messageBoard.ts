import { validateMessageBoardDraft } from '../../../src/lib/assistantValidation'
import type { MessageBoard } from '../../../src/types/messageBoard'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveBoards(): MessageBoard[] {
  return (store.get('admin.messageBoards')?.value as MessageBoard[] | undefined) ?? []
}

interface MessageBoardFields {
  name: string | null
}

export const messageBoardEntity: AssistantEntity<MessageBoard> = {
  key: 'messageBoard',
  supportedActions: ['create', 'update', 'delete'],
  section: 'messageboard',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    return {
      type: 'object',
      properties: { name: nullable({ type: 'string', description: 'The board\'s name (e.g. "General", "Staff notices").' }) },
      required: ['name'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveBoards().filter((board) => !needle || board.name.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((board) => ({ id: board.id, label: board.name }))
  },

  async getCurrent(id: string): Promise<MessageBoard | null> {
    return liveBoards().find((board) => board.id === id) ?? null
  },

  mergeDraft(_action, current, rawFields): MessageBoard {
    const fields = rawFields as MessageBoardFields
    const base: MessageBoard = current ?? { id: `board-${Date.now()}`, name: '' }
    return { ...base, name: fields.name ?? base.name }
  },

  validate(_action, draft: MessageBoard): AssistantValidationIssue[] {
    return validateMessageBoardDraft(draft)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  async listAll(): Promise<MessageBoard[]> {
    return liveBoards()
  },
}
