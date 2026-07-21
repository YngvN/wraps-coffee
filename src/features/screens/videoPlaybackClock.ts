/**
 * Lets every `VideoSlide` instance showing the same `videoUrl` — whether
 * that's the same pane whose own identity changed underneath it, or two (or
 * more) genuinely different panes at once, e.g. right after a split
 * duplicates a pane's content into both new halves — agree on where in the
 * video "now" actually is, instead of each independently starting over at
 * 0. A fresh `<video>` DOM node (a brand-new pane, or this same pane after
 * losing and regaining its identity) has no memory of its own of how long
 * this video's been playing; this module is that memory, kept centrally
 * rather than on any one pane's own state, since the whole point is for it
 * to survive past any single pane's lifetime. Deliberately a plain
 * wall-clock anchor (real elapsed time since first play), not a
 * frame-accurate shared position — good enough to avoid a visible restart
 * or two simultaneous copies drifting out of sync with each other, without
 * needing any cross-instance messaging; this app's kiosk video panes are
 * always autoplaying/looping with no pause control, so "elapsed real time"
 * and "elapsed playback time" never actually diverge in practice.
 */

interface PlaybackAnchor {
  /** `Date.now()` when the first instance anywhere began playing this URL — every later joiner computes its own seek target from this same anchor. */
  startedAtMs: number
  /** How many `VideoSlide` instances are currently showing this URL — once this drops to 0, the anchor is dropped too, so a later, unrelated stage starting the same video again begins at 0 rather than resuming a stale clock. */
  instanceCount: number
}

const anchors = new Map<string, PlaybackAnchor>()

/**
 * Call once a `VideoSlide` instance is about to start playing `videoUrl` —
 * returns how many seconds into this shared timeline it should seek to
 * before playing (`0` if this is the very first instance anywhere, i.e.
 * there's nothing to join yet). Pair every call with a matching
 * `leaveVideoPlayback` once this instance stops showing `videoUrl`.
 */
export function joinVideoPlayback(videoUrl: string): number {
  const existing = anchors.get(videoUrl)
  if (existing) {
    existing.instanceCount += 1
    return (Date.now() - existing.startedAtMs) / 1000
  }
  anchors.set(videoUrl, { startedAtMs: Date.now(), instanceCount: 1 })
  return 0
}

/** Call once a `VideoSlide` instance stops showing `videoUrl` (its own unmount, or switching to a different source) — must be paired 1:1 with an earlier `joinVideoPlayback` call for the same URL. */
export function leaveVideoPlayback(videoUrl: string) {
  const existing = anchors.get(videoUrl)
  if (!existing) return
  existing.instanceCount -= 1
  if (existing.instanceCount <= 0) anchors.delete(videoUrl)
}

/**
 * Re-anchors `videoUrl`'s shared timeline to "now" — call whenever an
 * instance deliberately restarts this video from 0 itself (see
 * `VideoSlide`'s own `restartOnStageOne`), so a *later* joiner still
 * computes a correct elapsed time relative to that restart instead of the
 * original, now-stale start. Doesn't touch any other instance's own
 * already-playing `<video>` element — those simply keep playing from
 * wherever they already were; only a future joiner (or one that itself
 * re-syncs) is affected.
 */
export function resetVideoPlayback(videoUrl: string) {
  const existing = anchors.get(videoUrl)
  if (existing) existing.startedAtMs = Date.now()
}
