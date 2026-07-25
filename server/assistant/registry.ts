import { eventEntity } from './entities/event'
import { productEntity } from './entities/product'
import { userEntity } from './entities/user'
import type { AssistantEntity, AssistantSession } from './types'

/**
 * Every entity the assistant can operate on. Adding one is: write the
 * adapter file (see `AssistantEntity` in `types.ts`), import it, and add it
 * here — nothing else in this module, the routes, or the client UI needs to
 * change. Per this repo's CLAUDE.md: whenever new interactive dashboard
 * functionality is added, add/update the matching entry here in the same
 * change.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ASSISTANT_ENTITIES: AssistantEntity<any>[] = [productEntity, eventEntity, userEntity]

/** Whether `session` is allowed to use `entity` at all — `section: null` entities (Users, credentials, backup, cleanup) require `role !== 'limited'`; section-scoped entities require that section in `allowedSections` when the session is `limited`. */
export function sessionCanUseEntity(entity: AssistantEntity<unknown>, session: AssistantSession): boolean {
  if (session.role !== 'limited') return true
  if (entity.section === null) return false
  return Boolean(session.allowedSections?.includes(entity.section))
}

/** Every entity `session` is allowed to use — this is what builds `select_intent`'s own `entity` enum (see `steps.ts`), so a restricted session can't receive a disallowed entity even in principle. */
export function allowedEntitiesFor(session: AssistantSession): AssistantEntity<unknown>[] {
  return ASSISTANT_ENTITIES.filter((entity) => sessionCanUseEntity(entity, session))
}

export function findEntity(key: string): AssistantEntity<unknown> | undefined {
  return ASSISTANT_ENTITIES.find((entity) => entity.key === key)
}
