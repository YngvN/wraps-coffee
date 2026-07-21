import { useEffect, useRef, useState } from 'react'
import { useCachedVideoSrc } from '../../hooks/useCachedVideoSrc'
import { useLanguage } from '../../i18n'
import type { ImageFit } from '../../types/screen'
import { getThumbnailUrl } from '../../utils/responsiveImage'
import { joinVideoPlayback, leaveVideoPlayback, resetVideoPlayback } from './videoPlaybackClock'
import './VideoSlide.scss'

interface VideoSlideProps {
  videoUrl: string
  /** 'contain' (the default) shrinks the video to fit without cropping; 'cover' scales it to fill the entire slide edge to edge, cropping as needed. */
  fit?: ImageFit
  /** Live mute toggle, not a transcode-time change — falls back to `false` (audio plays); if the browser blocks unmuted autoplay, this component falls back to a muted play plus a "tap for sound" affordance (see the effect below). */
  removeAudio?: boolean
  /** 0-1, falls back to `1`. Only relevant while `removeAudio` is `false`. */
  volume?: number
  /** When true, plays once (no loop) and calls `onRequestStageAdvance` the moment it ends, instead of looping for as long as this checkpoint is showing. */
  advanceStageOnEnd?: boolean
  onRequestStageAdvance?: () => void
  /** The screen's current 1-indexed stage — only consulted while `restartOnStageOne` is on, to detect the moment the shared rotation transitions back to stage 1. */
  stage: number
  /** Restarts this video from 0 the moment `stage` transitions back to 1 (not merely while it's sitting at 1 — e.g. not on this component's own first mount, if that happens to already be at stage 1). Falls back to `false`. */
  restartOnStageOne?: boolean
}

/**
 * Fullscreen slide showing a single looping (or, with `advanceStageOnEnd`,
 * play-once) video — no text, no controls. The one stable `<video>` DOM
 * node here is never remounted by a stage transition, pane resize, or
 * sibling re-render (no content-identity `key`, unlike `NewsSlide`/
 * `QrCodeSlide`'s own `<img>`/`<QRCodeSVG>`, which deliberately DO re-key
 * on content change to avoid a stale-bitmap flash — the opposite of what a
 * playing video needs). Its `src` is only ever (re)assigned, and playback
 * only ever (re)started, when `useCachedVideoSrc` hands back a genuinely
 * new resolved source — everything else just leaves the element alone.
 *
 * That guarantee only covers *this one* DOM node, though — it says nothing
 * about a genuinely different `<video>` node (a different pane, or this
 * same pane after losing and regaining its own identity) picking up the
 * very same video mid-playback. `videoPlaybackClock.ts` covers that case:
 * every instance showing the same `videoUrl` shares one real-time anchor,
 * so a pane that starts showing this video while another pane (or a
 * moment ago, this same pane) is already partway through it seeks straight
 * to the correct elapsed position instead of restarting at 0 — and two
 * panes that end up showing the same video at once (e.g. right after a
 * split duplicates one pane's content into both new halves) both derive
 * their seek position from that same shared anchor, so they stay in sync
 * with each other rather than each starting fresh independently.
 *
 * The one deliberate exception to "never restart" is `restartOnStageOne`:
 * an admin opt-in for a video meant to tell its own story alongside the
 * stage rotation, reset back to its own beginning exactly when the whole
 * sequence starts over, rather than sitting wherever it naturally got to.
 */
export function VideoSlide({ videoUrl, fit = 'contain', removeAudio, volume = 1, advanceStageOnEnd, onRequestStageAdvance, stage, restartOnStageOne }: VideoSlideProps) {
  const { t } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const src = useCachedVideoSrc(videoUrl)
  // Seeded from the current `stage` (not `1`) so a pane that happens to
  // first mount already sitting at stage 1 doesn't immediately "restart" a
  // video that only just started — the whole point is reacting to a
  // transition *back* to 1, not merely being there.
  const previousStageRef = useRef(stage)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !src || el.src === src) return

    // Joins this video's own shared timeline (see `videoPlaybackClock.ts`)
    // instead of always starting at 0 — matters whenever this exact
    // `<video>` node is new but the video itself isn't: a pane that just
    // gained this content (its own identity changed underneath it, or a
    // split just duplicated the same video into two brand-new panes at
    // once) should pick up wherever the video already logically is, not
    // restart it or drift out of sync with a sibling pane showing the same
    // thing. Keyed by `videoUrl` (the stable, admin-configured value), not
    // `src` (a fresh `URL.createObjectURL` blob every time any pane's own
    // `useCachedVideoSrc` resolves it, even for this same underlying video).
    const elapsedSeconds = joinVideoPlayback(videoUrl)

    el.src = src
    el.muted = Boolean(removeAudio)
    // Seeking happens once metadata is available — `duration` (needed for
    // the loop-wraparound calculation below) isn't known before then.
    const handleLoadedMetadata = () => {
      if (elapsedSeconds <= 0 || !Number.isFinite(el.duration) || el.duration <= 0) return
      el.currentTime = advanceStageOnEnd ? Math.min(elapsedSeconds, el.duration) : elapsedSeconds % el.duration
    }
    el.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
    el.load()

    // Autoplay with sound is blocked by default in a plain browser-tab
    // display (no Electron autoplay-policy flag to rely on there) — try
    // honoring `removeAudio` faithfully first, and only fall back to a
    // muted play if the browser actually rejects the unmuted one, surfacing
    // a "tap for sound" affordance so a real user gesture can unlock audio.
    void el.play().catch(() => {
      if (removeAudio) return
      el.muted = true
      setAudioBlocked(true)
      void el.play().catch(() => {
        // Nothing more to try — leave the poster-frame-adjacent black frame
        // showing rather than retrying in a loop.
      })
    })

    return () => {
      el.removeEventListener('loadedmetadata', handleLoadedMetadata)
      leaveVideoPlayback(videoUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `removeAudio` intentionally excluded: read fresh here only for the very first play/fallback decision on a genuinely new `src`; its own live updates afterward are handled by the separate, restart-free effect below. Including it would reassign `.src`/call `.load()` again (restarting playback) on every mute toggle, exactly what this component exists to avoid.
  }, [src, videoUrl, advanceStageOnEnd])

  // Live DOM properties, not attributes — take effect on the
  // already-playing element immediately, no reload/restart. `loop` lives
  // here (not the src-change effect above) specifically so toggling
  // `advanceStageOnEnd` alone — e.g. a live admin edit, with no new video
  // URL involved — still actually takes effect; that effect's own
  // `el.src === src` guard would otherwise skip it entirely whenever the
  // source itself hasn't changed.
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = !advanceStageOnEnd
  }, [advanceStageOnEnd])

  // Detects a transition *back* to stage 1 (not just sitting at it — see
  // `previousStageRef`'s own comment) and, only then, seeks this video back
  // to its own beginning — a deliberate reset distinct from every other
  // stage transition, which this component otherwise always plays straight
  // through untouched. Re-anchors the shared playback clock too, so a pane
  // that joins this same video later computes its own seek position
  // relative to this restart rather than the original, now-stale start.
  useEffect(() => {
    const previousStage = previousStageRef.current
    previousStageRef.current = stage
    const el = videoRef.current
    if (!el || !el.src || !restartOnStageOne || stage !== 1 || previousStage === 1) return
    el.currentTime = 0
    resetVideoPlayback(videoUrl)
  }, [stage, restartOnStageOne, videoUrl])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = Boolean(removeAudio)
    setAudioBlocked(false)
  }, [removeAudio])

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const el = videoRef.current
    if (!el || !advanceStageOnEnd) return
    const handleEnded = () => onRequestStageAdvance?.()
    el.addEventListener('ended', handleEnded)
    return () => el.removeEventListener('ended', handleEnded)
  }, [advanceStageOnEnd, onRequestStageAdvance])

  const handleTapForSound = () => {
    const el = videoRef.current
    if (!el) return
    el.muted = false
    setAudioBlocked(false)
  }

  return (
    <div className={`video-slide${fit === 'cover' ? ' video-slide--cover' : ''}`}>
      {!src && videoUrl && <img className="video-slide__poster" src={getThumbnailUrl(videoUrl)} alt="" aria-hidden="true" />}
      <video ref={videoRef} className="video-slide__video" playsInline autoPlay aria-hidden="true" />
      {audioBlocked && (
        <button type="button" className="video-slide__unmute" onClick={handleTapForSound}>
          {t('screenDisplay.videoTapForSound')}
        </button>
      )}
    </div>
  )
}
