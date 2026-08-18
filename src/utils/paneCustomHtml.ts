import sanitizeHtml from 'sanitize-html'
import { MAX_PANE_CUSTOM_HTML_LENGTH } from '../types/screen'
import type { PaneCustomContentPosture } from './paneCustomCss'

/**
 * The HTML half of a pane's own `customCss`/`customHtml` "framework" — see `paneCustomCss.ts` for the
 * CSS half. Kept in its own file deliberately: `sanitize-html` is built on `htmlparser2` (a real HTML
 * parser, confirmed dependency-free of any DOM/jsdom requirement, so still safe to run both server-side
 * and in the browser) but is a CJS module (`export = sanitize`), which bundlers can't tree-shake — any
 * file that imports it pulls in the whole thing regardless of which of its own exports actually get
 * used. `customHtml` is never re-validated/re-sanitized at render time (the render path trusts the
 * already-clean stored string, see `PaneVisual.tsx`), so nothing on the kiosk display's own render path
 * (`LayoutPane.tsx`/`PaneVisual.tsx`/`usePaneCustomContent.ts`) ever needs to import *this* file — only
 * the admin dashboard's own `PaneEditor.tsx` (live editor validation) and the server (the real
 * write-time gate) do.
 *
 * **Checked directly, not assumed: this app's `main.tsx` currently has no route-based code splitting
 * at all** (every `react-router-dom` route is a plain static import, no `React.lazy`) — so today, this
 * file's own `sanitize-html`/`htmlparser2` weight still ends up in the one single bundle every route
 * loads, kiosk display included, same as every other admin-only dependency already in this app (not a
 * regression this change introduces). Actually splitting the admin dashboard from the kiosk display
 * route via `React.lazy` would be a real, separate, broader change to this app's own routing/loading
 * behavior — out of scope here. This module split from `paneCustomCss.ts` (which the kiosk render path
 * *does* need, for `scopePaneCustomCss`) is still worth keeping regardless: it's what would let a
 * *future* code-splitting pass actually keep this dependency out of the kiosk bundle, without needing
 * to first untangle which functions in a combined file were render-safe. **Must stay DOM-free** — same
 * reasoning as `paneCustomCss.ts`'s own doc comment.
 */

const ADMIN_HTML_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'strong', 'em', 'b', 'i', 'br']
/** Assistant posture — the same rich-text subset minus `a`/`img`: the AI can format/structure text but can't author links or embed images. */
const ASSISTANT_HTML_TAGS = ADMIN_HTML_TAGS.filter((tag) => tag !== 'a' && tag !== 'img')

function allowedHtmlTags(posture: PaneCustomContentPosture): string[] {
  return posture === 'admin' ? ADMIN_HTML_TAGS : ASSISTANT_HTML_TAGS
}

/** Every allowed HTML tag for `posture` — for the editor's own hint text. */
export function listAllowedHtmlTags(posture: PaneCustomContentPosture): string[] {
  return allowedHtmlTags(posture)
}

function hasExplicitUrlScheme(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url.trim())
}

/** `href` sanitized to `http(s)`/relative, never `javascript:`/`data:`/any other scheme. */
function isAcceptableHref(href: string | undefined): boolean {
  if (!href) return false
  const trimmed = href.trim()
  if (!hasExplicitUrlScheme(trimmed)) return true
  return /^https?:/i.test(trimmed)
}

/**
 * Same loopback/mDNS `.local`/private-LAN-range allowlist as `src/lib/localServer.ts`'s own
 * `isLocalServerHostname` — reimplemented here (rather than imported) since that file uses
 * `window.location`, and this module must stay DOM-free (see this file's own doc comment).
 */
function isLikelyLocalServerHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true
  if (hostname.endsWith('.local')) return true
  if (/^10\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  return false
}

/**
 * Whether `src` looks like one of this app's own `/uploads/...` files — mirrors
 * `isOwnUploadUrl`/`normalizeUploadUrl` in `src/lib/localServer.ts` (see `ADMIN_HTML_TAGS`'s own doc
 * comment for why `customHtml`'s `img` is deliberately restricted to own-upload images only, never
 * arbitrary external URLs — an exfiltration/tracking-pixel risk otherwise). Returns a *normalized*,
 * host-stripped relative path (`/uploads/<file>[?query]`) on success — storing it relative rather than
 * rewriting at every render is what lets the render path trust `customHtml` as-is with zero
 * re-processing: a relative URL resolves against whichever host actually loaded the page,
 * automatically, with no `normalizeUploadUrl`-style rewrite ever needed at render time.
 */
function normalizeUploadImageSrc(src: string | undefined): string | null {
  if (!src) return null
  const trimmed = src.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed, 'http://pane-custom-content.invalid')
  } catch {
    return null
  }
  if (!parsed.pathname.startsWith('/uploads/')) return null
  if (!hasExplicitUrlScheme(trimmed)) return `${parsed.pathname}${parsed.search}`
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!isLikelyLocalServerHostname(parsed.hostname)) return null
  return `${parsed.pathname}${parsed.search}`
}

function transformTagsFor(posture: PaneCustomContentPosture, onProblem?: (code: string) => void): sanitizeHtml.IOptions['transformTags'] {
  if (posture !== 'admin') return undefined
  return {
    a: (_tagName, attribs): sanitizeHtml.Tag => {
      if (!isAcceptableHref(attribs.href)) {
        onProblem?.('htmlDisallowedHref')
        return { tagName: 'span', attribs: {} }
      }
      return { tagName: 'a', attribs: { href: attribs.href, rel: 'noopener noreferrer', target: '_blank' } }
    },
    img: (_tagName, attribs): sanitizeHtml.Tag => {
      const normalized = normalizeUploadImageSrc(attribs.src)
      if (!normalized) {
        onProblem?.('htmlDisallowedImgSrc')
        return { tagName: 'img', attribs: {} }
      }
      return { tagName: 'img', attribs: { src: normalized } }
    },
  }
}

/**
 * The options used to actually *produce* the stored/rendered output — a real `allowedTags`/
 * `allowedAttributes` gate, exactly the standard way this library is normally used. Only ever run on
 * input `validatePaneCustomHtml` already confirmed has zero problems (see `sanitizePaneCustomHtml`),
 * so what this gate would strip is never actually exercised in the real write path — but it's kept as
 * a real, independent gate regardless (defense in depth), not just trusted to be a no-op.
 */
function buildOutputSanitizeOptions(posture: PaneCustomContentPosture): sanitizeHtml.IOptions {
  return {
    allowedTags: allowedHtmlTags(posture),
    // `rel`/`target` have to be allowed here too, not just returned from `transformTags.a` below —
    // sanitize-html re-filters a transform's own returned attributes against this same allowlist
    // afterward, so omitting them here would silently strip right back out the very attributes the
    // transform just forced on.
    allowedAttributes: posture === 'admin' ? { a: ['href', 'rel', 'target'], img: ['src'] } : {},
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: transformTagsFor(posture),
  }
}

/**
 * The options used purely to *detect* problems, never to produce real output. `allowedTags: false`
 * disables sanitize-html's own outer tag gate entirely (confirmed in its source: `tagAllowed` returns
 * `true` unconditionally when `allowedTags === false`) — needed because that outer gate's own default
 * `disallowedTagsMode: 'discard'` handling short-circuits *before* `exclusiveFilter` ever runs for a
 * disallowed tag (confirmed directly: a `<script>` tag never reached `exclusiveFilter` at all when it
 * was excluded by the normal `allowedTags` list, so a hard-reject-worthy tag would have silently
 * passed validation as "no problems found"). Disabling that outer gate and relying purely on
 * `exclusiveFilter` — which still removes the entire disallowed subtree from its own output via a
 * `result.substring` truncation, see sanitize-html's own `onclosetag` handler — makes every tag
 * actually reach the one check that matters here, `onProblem`.
 */
function buildValidationSanitizeOptions(posture: PaneCustomContentPosture, onProblem: (code: string) => void): sanitizeHtml.IOptions {
  const tags = allowedHtmlTags(posture)
  return {
    allowedTags: false,
    allowedAttributes: false,
    // Silences sanitize-html's own console.warn about `script`/`style` being "in allowedTags" —
    // misleading here specifically, since `allowedTags: false` isn't actually granting them anything;
    // `exclusiveFilter` below is the real (and only) enforcement for this validation-only pass.
    allowVulnerableTags: true,
    transformTags: transformTagsFor(posture, onProblem),
    exclusiveFilter: (frame) => {
      if (!tags.includes(frame.tag)) {
        onProblem('htmlTagNotAllowed')
        return true
      }
      return false
    },
  }
}

/** Validates `html` against `posture`'s own tag/attribute allowlist. Returns problem codes — empty means valid, hard-reject otherwise (never silently strip and save the rest — see `SP.15` in `screenPane.qa-scenarios.md`). Doesn't mutate/store anything itself; a caller with an empty result should call `sanitizePaneCustomHtml` to get the actual value to store. */
export function validatePaneCustomHtml(html: string, posture: PaneCustomContentPosture): string[] {
  if (html.length > MAX_PANE_CUSTOM_HTML_LENGTH) return ['htmlTooLong']
  if (html.trim().length === 0) return []
  const problems = new Set<string>()
  try {
    sanitizeHtml(html, buildValidationSanitizeOptions(posture, (code) => problems.add(code)))
  } catch {
    return ['htmlMalformed']
  }
  return [...problems]
}

/** The actual value to store — only ever called after `validatePaneCustomHtml` returned no problems, so this is expected to be a clean, structural no-op transform plus the `img`/`a` normalization described in `normalizeUploadImageSrc`'s own doc comment. */
export function sanitizePaneCustomHtml(html: string, posture: PaneCustomContentPosture): string {
  if (html.trim().length === 0) return ''
  return sanitizeHtml(html, buildOutputSanitizeOptions(posture))
}

/** Bump whenever `ADMIN_HTML_TAGS`/the sanitizer's attribute allowlist changes — see `ScreenSlot.customHtmlPolicyVersion`'s own doc comment. */
export const PANE_CUSTOM_HTML_POLICY_VERSION = 1
