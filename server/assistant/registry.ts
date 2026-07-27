import { appearanceThemeColorEntity } from './entities/appearanceThemeColor'
import { catalogueEntity } from './entities/catalogue'
import { categoryEntity } from './entities/category'
import { categoryCustomFieldEntity } from './entities/categoryCustomField'
import { contactInfoEntity } from './entities/contactInfo'
import { eventEntity } from './entities/event'
import { integrationToggleEntity } from './entities/integrationToggle'
import { messageBoardEntity } from './entities/messageBoard'
import { messageBoardPostEntity } from './entities/messageBoardPost'
import { productEntity } from './entities/product'
import { storeSettingsEntity } from './entities/storeSettings'
import { themeEntity } from './entities/theme'
import { userEntity } from './entities/user'
import type { AssistantEntity, AssistantSession } from './types'

/**
 * Every entity the assistant can operate on. Adding one is: write the
 * adapter file (see `AssistantEntity` in `types.ts`), import it, and add it
 * here — nothing else in this module, the routes, or the client UI needs to
 * change. Per this repo's CLAUDE.md: whenever new interactive dashboard
 * functionality is added, add/update the matching entry here in the same
 * change.
 *
 * Beyond the CRUD contract (`fillFieldsSchema`/`mergeDraft`/`validate`/etc.),
 * an entity can also opt into `listAll` — its full current live data, used
 * only by `steps.ts`'s `answerLookup` to answer informational Q&A ("what
 * message boards exist?") grounded in real data, entirely separate from the
 * create/update/delete flow above. Not every entity implements it — a
 * sub-resource with no identity of its own outside its parent (e.g.
 * `categoryCustomField`/`appearanceThemeColor`) omits it rather than
 * duplicate its parent's own `listAll` data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ASSISTANT_ENTITIES: AssistantEntity<any>[] = [
  productEntity,
  eventEntity,
  userEntity,
  catalogueEntity,
  categoryEntity,
  categoryCustomFieldEntity,
  messageBoardEntity,
  messageBoardPostEntity,
  appearanceThemeColorEntity,
  themeEntity,
  storeSettingsEntity,
  contactInfoEntity,
  integrationToggleEntity,
]

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
