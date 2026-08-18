import { appearanceThemeColorEntity } from './entities/appearanceThemeColor'
import { catalogueEntity } from './entities/catalogue'
import { categoryEntity } from './entities/category'
import { categoryCustomFieldEntity } from './entities/categoryCustomField'
import { contactInfoEntity } from './entities/contactInfo'
import { eventEntity } from './entities/event'
import { integrationToggleEntity } from './entities/integrationToggle'
import { displayManagerEntity } from './entities/displayManager'
import { mediaLibraryEntity } from './entities/mediaLibrary'
import { messageBoardEntity } from './entities/messageBoard'
import { messageBoardPostEntity } from './entities/messageBoardPost'
import { ordersEntity } from './entities/orders'
import { productEntity } from './entities/product'
import { screenEntity } from './entities/screen'
import { screenPaneEntity } from './entities/screenPane'
import { settingsEntity } from './entities/settings'
import { storeSettingsEntity } from './entities/storeSettings'
import { themeEntity } from './entities/theme'
import { userEntity } from './entities/user'
import type { AssistantEntity, AssistantSession } from './types'

/**
 * Every entity the assistant can operate on. Per this repo's CLAUDE.md:
 * whenever new interactive dashboard functionality is added, add/update the
 * matching entry here in the same change.
 *
 * Adding a new entity is **not** just "write the adapter file, import it,
 * add it here" — despite that once being this comment's own claim, every
 * existing entity also needs matching updates in several other files (confirm
 * by grepping for an existing entity's own key, e.g. `contactInfo`, across
 * `src/features/admin/assistant/` before assuming this list is exhaustive
 * for a future addition):
 * 1. This file — import + add to `ASSISTANT_ENTITIES` below.
 * 2. `server/assistant/steps.ts` — an `ENTITY_DESCRIPTIONS` entry (its own
 *    doc comment says to keep this in sync with the array below).
 * 3. `src/features/admin/assistant/useAssistantFlow.ts` — add the key to the
 *    `AssistantEntityKey` union, `ENTITY_SECTIONS` (client-side mirror of
 *    `sessionCanUseEntity` below), and `SINGLETON_ENTITIES`/`BATCH_CAPABLE_ENTITIES`
 *    if applicable.
 * 4. `src/features/admin/assistant/AssistantPanel.tsx` — a new
 *    `if (entity === '<key>') { ... }` branch in the review-form mount
 *    (reuse a real form component via `'existingForm'`, or build a small
 *    "MiniForm" like `ContactInfoMiniForm`/`StoreSettingsMiniForm` when none
 *    exists) wired to the actual commit, and — only if the entity supports
 *    `delete` — another branch in the destructive-delete confirm handler.
 * 5. `src/features/admin/assistant/reviewChangeRows.ts` — a new
 *    `build<Entity>ChangeRows` function.
 * 6. `src/i18n/languages.json` — an `admin.assistant.entities.<key>` label,
 *    both languages, plus any new field labels the entity's own MiniForm
 *    needs.
 * 7. `server/assistant/entities/<key>.qa-scenarios.md` — this entity's own QA
 *    scenario bank (see `QA/templates/project/qa-test-plan-project.md`'s
 *    "Per-entity scenario files" table, which needs a matching new row too).
 *    Keeping this alongside the entity's own code, not buried in a shared
 *    template, is what let five other entities' scenario banks survive that
 *    template being split apart without any of them getting lost.
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
  settingsEntity,
  mediaLibraryEntity,
  screenEntity,
  screenPaneEntity,
  displayManagerEntity,
  ordersEntity,
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
