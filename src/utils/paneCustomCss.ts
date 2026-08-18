import { compile, serialize, stringify, COMMENT, DECLARATION, MEDIA, RULESET, SUPPORTS, type Element } from 'stylis'
import { MAX_PANE_CUSTOM_CSS_LENGTH } from '../types/screen'

/**
 * The CSS half of a pane's own `customCss`/`customHtml` "framework" — see `paneCustomHtml.ts` for the
 * HTML half and the shared module-pair doc comment on why they're two separate files rather than one:
 * `scopePaneCustomCss` runs at *render* time (on the kiosk display bundle too, not just the admin
 * dashboard), so this file only ever pulls in `stylis` — a pure ESM CSS compiler/serializer, confirmed
 * dependency-free of any DOM/jsdom requirement. **Must stay DOM-free** — this runs both in the browser
 * and from `server/assistant/entities/screenPane.ts` (server-side, no DOM lib — see that entity's own
 * file for the exact same constraint `screen.ts`'s `generateLocalId` comment already documents for
 * anything transitively pulling in browser-only code).
 */
export type PaneCustomContentPosture = 'admin' | 'assistant'

const MARGIN_PROPERTIES = ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']
const PADDING_PROPERTIES = ['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']
const BORDER_PROPERTIES = [
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-style',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  // Deliberately NOT `border-image`/`border-image-source`/etc — those accept a `url()`, the one way
  // a "border" property could otherwise fetch an arbitrary external resource.
]
const BORDER_RADIUS_PROPERTIES = ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']

const TYPOGRAPHY_PROPERTIES = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'text-align', 'text-decoration', 'text-transform', 'line-height', 'letter-spacing']

/**
 * Admin posture — color/typography, spacing/box, restricted layout/alignment, and `transform`/
 * `transform-origin`. `position`/`z-index` are excluded entirely, every posture: `position: fixed` is
 * the one value that bypasses `.split-layout__pane`'s own `overflow: hidden` containment (confirmed
 * directly against this app's own DOM structure, not assumed), and an uncapped `z-index` could still
 * visually stack over a neighboring pane under a shared parent grid. `position: relative`/`absolute`
 * are effectively still reachable via the `transform` allowlist entry's own containing-block side
 * effect and `.split-layout__pane`'s own already-`position: relative` — an `absolute`-positioned
 * descendant stays contained within the pane's own box, not the whole page. Any `--custom-property`
 * declaration and any `!important` are rejected regardless of property name, every posture — see
 * `walkCssNodes`'s own comments for why.
 */
const ADMIN_CSS_PROPERTIES = new Set([
  ...TYPOGRAPHY_PROPERTIES,
  ...MARGIN_PROPERTIES,
  ...PADDING_PROPERTIES,
  ...BORDER_PROPERTIES,
  ...BORDER_RADIUS_PROPERTIES,
  'gap',
  'box-shadow',
  'opacity',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'align-self',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'overflow',
  'transform',
  'transform-origin',
])

/** Assistant posture — color/typography/spacing only. Deliberately excludes `opacity` too, alongside the plan's own explicit "no border/box-shadow/layout" — narrower than strictly specified, kept simple: an admin can always add it manually. */
const ASSISTANT_CSS_PROPERTIES = new Set([...TYPOGRAPHY_PROPERTIES, ...MARGIN_PROPERTIES, ...PADDING_PROPERTIES, 'gap'])

/** Properties whose value is further restricted to a small safe set, on top of being allowed at all. */
const CSS_VALUE_RESTRICTIONS: Record<string, string[]> = {
  display: ['flex', 'grid', 'block', 'inline-block', 'none'],
  overflow: ['hidden', 'auto', 'visible'],
}

function allowedCssProperties(posture: PaneCustomContentPosture): ReadonlySet<string> {
  return posture === 'admin' ? ADMIN_CSS_PROPERTIES : ASSISTANT_CSS_PROPERTIES
}

/** Every allowed CSS property for `posture`, sorted — for the editor's own hint text. */
export function listAllowedCssProperties(posture: PaneCustomContentPosture): string[] {
  return [...allowedCssProperties(posture)].sort()
}

function declarationValue(rawValue: string, property: string): string {
  // `rawValue` is the full "prop:value;" (or "prop:value!important;") string stylis hands each decl
  // node — strip the leading property name/colon and trailing semicolon/`!important` to get just the
  // value, for the small set of properties that also need their *value* restricted.
  return rawValue
    .replace(new RegExp(`^${property}\\s*:`, 'i'), '')
    .replace(/!important/i, '')
    .replace(/;\s*$/, '')
    .trim()
}

function walkCssNodes(nodes: Element[], posture: PaneCustomContentPosture, problems: Set<string>) {
  const allowed = allowedCssProperties(posture)
  for (const node of nodes) {
    if (node.type === RULESET) {
      // A nested selector (e.g. `&:hover { ... }`, or a bare `.foo { ... }`) — stylis already
      // composes it under our own wrapping selector at compile time (see this module's own
      // `scopePaneCustomCss`), so it can never select outside the pane's own scoped subtree; only
      // the declarations inside still need the same property allowlist.
      walkCssNodes(node.children as Element[], posture, problems)
    } else if (node.type === MEDIA || node.type === SUPPORTS) {
      walkCssNodes(node.children as Element[], posture, problems)
    } else if (node.type === DECLARATION) {
      const property = (Array.isArray(node.props) ? node.props[0] : node.props) as string
      const rawValue = typeof node.value === 'string' ? node.value : ''
      if (property.startsWith('--')) {
        problems.add('cssCustomPropertyNotAllowed')
        continue
      }
      if (/!important/i.test(rawValue)) problems.add('cssImportantNotAllowed')
      const propertyLower = property.toLowerCase()
      if (!allowed.has(propertyLower)) {
        problems.add('cssPropertyNotAllowed')
        continue
      }
      const restriction = CSS_VALUE_RESTRICTIONS[propertyLower]
      if (restriction && !restriction.includes(declarationValue(rawValue, property).toLowerCase())) {
        problems.add('cssValueNotAllowed')
      }
    } else if (node.type === COMMENT) {
      // Harmless, ignored.
    } else {
      // Default-reject by node type: `@import`/`@font-face`/`@keyframes`/`@layer`/`@charset`/any
      // other at-rule not explicitly recursed into above (only `@media`/`@supports` are).
      problems.add('cssDisallowedAtRule')
    }
  }
}

/** A placeholder wrapper selector for validation only — the real, per-instance selector is only ever needed at render time (`scopePaneCustomCss`), since validation just walks declaration/at-rule *types*, never the selector text itself. */
const VALIDATION_WRAPPER_SELECTOR = '.__pane_custom_css_validate__'

/** Validates `css` (the raw, unscoped text an admin/the assistant typed) against `posture`'s own property allowlist. Returns problem codes — empty means valid. Never mutates/sanitizes; a caller with an empty result stores `css` exactly as given (the render path never re-validates, see `scopePaneCustomCss`'s own doc comment). */
export function validatePaneCustomCss(css: string, posture: PaneCustomContentPosture): string[] {
  if (css.length > MAX_PANE_CUSTOM_CSS_LENGTH) return ['cssTooLong']
  if (css.trim().length === 0) return []
  let tree: Element[]
  try {
    tree = compile(`${VALIDATION_WRAPPER_SELECTOR} { ${css} }`)
  } catch {
    return ['cssMalformed']
  }
  const problems = new Set<string>()
  walkCssNodes(tree, posture, problems)
  return [...problems]
}

/**
 * Scopes already-validated `css` to one specific render instance, wrapping it as
 * `[data-pane-scope="<scopeId>"] .split-layout__pane-content-inner { ...css... }` — nests one level
 * inside the content box, never the layout-critical `.split-layout__pane` wrapper itself (see
 * `LayoutPane.tsx`'s own doc comment on why: that wrapper carries `position: relative`/
 * `overflow: hidden`/`container-type: size`, and a bare admin rule landing directly on it could break
 * pane geometry using nothing but allowlisted properties). Runs at render time regardless of
 * validation, since scoping is inherently per-instance (`scopeId` is not always `paneId` — see
 * `LayoutPane.tsx`) — this is also why this function alone (not the rest of this module) is imported
 * by the render path/kiosk bundle. Wrapped in try/catch — malformed input (e.g. a hand-edited backup
 * restore that bypassed validation) must never throw during a real render; the final output also
 * defensively strips any literal `</style` as a last-resort backstop, even though this only ever runs
 * on already-validated input in the normal write path.
 */
export function scopePaneCustomCss(css: string, scopeId: string): string {
  if (!css || css.trim().length === 0) return ''
  try {
    const escapedScopeId = scopeId.replace(/"/g, '\\"')
    const selector = `[data-pane-scope="${escapedScopeId}"] .split-layout__pane-content-inner`
    const tree = compile(`${selector} { ${css} }`)
    const output = serialize(tree, stringify)
    return output.replace(/<\/style/gi, '')
  } catch {
    return ''
  }
}

/** Bump whenever `ADMIN_CSS_PROPERTIES`/`ASSISTANT_CSS_PROPERTIES`/`CSS_VALUE_RESTRICTIONS` change — see `ScreenSlot.customCssPolicyVersion`'s own doc comment for why. */
export const PANE_CUSTOM_CSS_POLICY_VERSION = 1
