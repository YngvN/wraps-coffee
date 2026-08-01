import { validateMessageBoardPostDraft } from '../../../src/lib/assistantValidation'
import type { MessageBoard, MessageBoardPost } from '../../../src/types/messageBoard'
import { MESSAGE_BOARD_BODY_MAX_LENGTH, MESSAGE_BOARD_TITLE_MAX_LENGTH } from '../../../src/types/messageBoard'
import * as store from '../../store'
import type { LookupQueryField, LookupQueryRecord } from '../lookupQuery'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

/** A post's own expiry, computed here rather than left to the model — same "a date comparison shouldn't be re-derived per call" reasoning as `event.ts`'s own `hasOccurred`. */
function isExpired(post: MessageBoardPost): boolean {
  return Boolean(post.expiresAt) && new Date(post.expiresAt as string).getTime() < Date.now()
}

function livePosts(): MessageBoardPost[] {
  return (store.get('admin.messageBoardPosts')?.value as MessageBoardPost[] | undefined) ?? []
}

function liveBoards(): MessageBoard[] {
  return (store.get('admin.messageBoards')?.value as MessageBoard[] | undefined) ?? []
}

interface MessageBoardPostFields {
  boardId?: string
  title: string | null
  body: string | null
  pinned: boolean | null
  expiresAt: string | null
}

export const messageBoardPostEntity: AssistantEntity<MessageBoardPost> = {
  key: 'messageBoardPost',
  supportedActions: ['create', 'update', 'delete'],
  section: 'messageboard',
  imageField: 'imageUrl',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    const contentProperties = {
      title: nullable({ type: 'string', description: `The post's title, up to ${MESSAGE_BOARD_TITLE_MAX_LENGTH} characters.` }),
      body: nullable({ type: 'string', description: `The post's body text, up to ${MESSAGE_BOARD_BODY_MAX_LENGTH} characters.` }),
      pinned: nullable({ type: 'boolean', description: 'Pinned posts always sort first.' }),
      expiresAt: nullable({ type: 'string', description: 'ISO date (yyyy-mm-dd) after which this post stops showing on screens, or null to never expire.' }),
    }
    if (action === 'create') {
      const boardIds = liveBoards().map((board) => board.id)
      return {
        type: 'object',
        properties: { boardId: { type: 'string', enum: boardIds, description: 'Which board this new post is created on.' }, ...contentProperties },
        required: ['boardId', 'title', 'body', 'pinned', 'expiresAt'],
        additionalProperties: false,
      }
    }
    return { type: 'object', properties: contentProperties, required: ['title', 'body', 'pinned', 'expiresAt'], additionalProperties: false }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const boards = liveBoards()
    const matches = livePosts().filter((post) => !needle || post.title.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((post) => {
      const boardName = boards.find((board) => board.id === post.boardId)?.name ?? post.boardId
      return { id: post.id, label: `${post.title} (${boardName})` }
    })
  },

  async getCurrent(id: string): Promise<MessageBoardPost | null> {
    return livePosts().find((post) => post.id === id) ?? null
  },

  /** A brand-new post has no sane default board — worth a clarifying question rather than silently landing on whichever board happens to be first. */
  async clarifiableFields(action, _context, fields) {
    if (action !== 'create' || (fields as unknown as MessageBoardPostFields).boardId != null) return []
    return [{ field: 'boardId', questionKey: 'admin.assistant.clarify.messageBoardPostBoard', options: liveBoards().map((board) => ({ id: board.id, label: board.name })) }]
  },

  mergeDraft(action, current, rawFields, context: AssistantFillContext): MessageBoardPost {
    const fields = rawFields as MessageBoardPostFields
    const now = new Date().toISOString()
    const base: MessageBoardPost =
      current ?? {
        id: `msgboard-${Date.now()}`,
        boardId: fields.boardId ?? '',
        title: '',
        body: '',
        authorUsername: context.session.username,
        createdAt: now,
        pinned: false,
      }
    return {
      ...base,
      title: fields.title ?? base.title,
      body: fields.body ?? base.body,
      pinned: fields.pinned ?? base.pinned,
      expiresAt: typeof fields.expiresAt === 'string' ? (fields.expiresAt ? new Date(`${fields.expiresAt}T23:59:59`).toISOString() : undefined) : base.expiresAt,
      updatedAt: action === 'update' ? now : base.updatedAt,
    }
  },

  validate(_action, draft: MessageBoardPost): AssistantValidationIssue[] {
    return validateMessageBoardPostDraft(draft, liveBoards())
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  async listAll(): Promise<MessageBoardPost[]> {
    return livePosts()
  },

  async lookupQueryFields(): Promise<LookupQueryField[]> {
    return [
      { key: 'pinned', label: 'Pinned', type: 'boolean' },
      { key: 'isExpired', label: 'Expired', type: 'boolean', description: 'Whether this post\'s own expiry date has already passed — already computed for you, never work this out yourself from `expiresAt`.' },
      { key: 'boardName', label: 'Board', type: 'string' },
      { key: 'body', label: 'Body text', type: 'string' },
      { key: 'expiresAt', label: 'Expires at', type: 'string' },
    ]
  },

  async listQueryableRecords(): Promise<LookupQueryRecord[]> {
    const boards = liveBoards()
    return livePosts().map((post) => {
      const boardName = boards.find((board) => board.id === post.boardId)?.name ?? post.boardId
      return {
        id: post.id,
        label: `${post.title} (${boardName})`,
        fields: {
          pinned: Boolean(post.pinned),
          isExpired: isExpired(post),
          boardName,
          body: post.body,
          expiresAt: post.expiresAt ?? null,
        },
      }
    })
  },
}
