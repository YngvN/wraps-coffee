/**
 * A shared stack of in-app "back levels" (a sub-view, a nested modal
 * panel) backed by real browser history, so the browser's own back action
 * — a mouse's back button, Alt+←, a trackpad/touch swipe-back gesture —
 * closes exactly one level at a time, the same way an explicit in-app Back
 * button already does (see `useBackLevel`, the React-facing wrapper around
 * this). Framework-agnostic on purpose: every level anywhere in the app
 * shares this one stack and one `popstate` listener, rather than each
 * screen reinventing its own.
 */

type BackHandler = () => void

interface StackEntry {
  onBack: BackHandler
  /** Set once this entry has already been resolved some other way (an explicit Back button click, a Cancel/Save, unmounting) — see `release` — so the `popstate` that eventually catches up to it (consuming the history slot `pushBackLevel` created) doesn't call `onBack` a second time. */
  handled: boolean
}

const stack: StackEntry[] = []
let listening = false

function handlePopState() {
  const entry = stack.pop()
  if (entry && !entry.handled) entry.onBack()
}

function ensureListening() {
  if (listening) return
  window.addEventListener('popstate', handlePopState)
  listening = true
}

export interface BackLevel {
  /** Consumes this level's own history entry without re-running `onBack` — call when it closes some way other than going back (Cancel, Save, an unrelated unmount) so a later, unrelated back press isn't silently swallowed by a stray leftover entry. */
  release: () => void
}

/**
 * Pushes one level onto the stack and a matching browser-history entry —
 * call once when that level opens (a sub-view, a nested panel). `onBack` is
 * the level's real close logic (e.g. the `setState` that returns to its
 * parent view) and fires exactly once, however this level actually closes:
 * the browser's own back action, or an explicit in-app Back button wired to
 * the module's own `goBack` (both end up going through the exact same
 * `popstate` path, so they behave identically). If it closes some other
 * way instead (Cancel, Save, an unrelated unmount), call the returned
 * `release()` instead of leaving the pushed entry dangling.
 */
export function pushBackLevel(onBack: BackHandler): BackLevel {
  ensureListening()
  window.history.pushState({ backLevel: true }, '')
  const entry: StackEntry = { onBack, handled: false }
  stack.push(entry)
  return {
    release: () => {
      entry.handled = true
      window.history.back()
    },
  }
}

/** Closes the deepest currently-open back level, exactly the way the browser's own back action would — wire this up as every level's own explicit Back button, instead of calling that level's close function directly. */
export function goBack() {
  window.history.back()
}
