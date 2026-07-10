/** A named collection of message-board posts (e.g. "Staff", "Customers") — a screen slot always shows exactly one board. */
export interface MessageBoard {
  id: string
  name: string
  /**
   * Admin/subadmin-only. When true, this board's non-expired posts are
   * pushed to the public website via the Neon bridge (see
   * `server/neonBridge.ts`'s `computePublicMessageBoardPosts`). Defaults to
   * false/absent — a board is private until explicitly published, so an
   * internal-only board (e.g. "Staff") can never leak externally by
   * accident.
   */
  publishToWebsite?: boolean
}

/** One message-board post, written by an authenticated dashboard user and optionally shown on a kiosk display. */
export interface MessageBoardPost {
  id: string
  /** The `MessageBoard.id` this post belongs to. */
  boardId: string
  title: string
  body: string
  imageUrl?: string
  /** Username of whoever posted this — never reassigned, even when a moderator edits the post. */
  authorUsername: string
  /** ISO date-time this post was created. */
  createdAt: string
  /** ISO date-time this post was last edited, if ever. */
  updatedAt?: string
  /** When true, this post always sorts first, in both the admin list and every screen display mode. */
  pinned?: boolean
  /** ISO date-time after which this post stops appearing on screens (it stays visible, marked "Expired", in the admin list). */
  expiresAt?: string
}

/** Max length enforced (via `maxLength`, with a live counter) on a post's title in the composer. */
export const MESSAGE_BOARD_TITLE_MAX_LENGTH = 80

/** Max length enforced (via `maxLength`, with a live counter) on a post's body in the composer. */
export const MESSAGE_BOARD_BODY_MAX_LENGTH = 500
