import { useLanguage } from '../../i18n'
import { FastForwardIcon } from './FastForwardIcon'
import { NextStepIcon } from './NextStepIcon'
import { PauseIcon } from './PauseIcon'
import { PlayIcon } from './PlayIcon'
import { PreviousStepIcon } from './PreviousStepIcon'
import './StagePlaybackControls.scss'

interface StagePlaybackControlsProps {
  stageCount: number
  /** The stage currently shown (natural rotation, or a forced one — the caller resolves which). */
  stage: number
  /** Drags/snaps straight to a specific stage, independent of `playing` — the timer (if running) just continues advancing from there next. */
  onScrub: (stage: number) => void
  playing: boolean
  onTogglePlaying: () => void
  /** Whether stages are currently advancing every 2 seconds instead of the screen's own configured duration. */
  fastForward: boolean
  onToggleFastForward: () => void
  /** Disables every control here — e.g. while a slot's editor has already forced the display to one specific stage, where scrubbing/playing would just be fighting that override. */
  disabled?: boolean
}

/**
 * The live display's own stage transport controls: a previous/next-stage
 * button pair (wrapping around at either end of the sequence, matching how
 * the shared rotation itself loops back to stage 1 after the last one), a
 * snapping slider that jumps straight to any stage, a play/pause toggle for
 * the shared rotation timer, and a fast-forward toggle that swaps the
 * screen's own configured `slideDurationSeconds` for a fixed 2 seconds
 * while it's on (clicking it again restores the configured speed). Shown in
 * `ScreenToolbar` next to the stage indicator, only while `screen.useStages`
 * is on with more than one stage — with just one stage there's nothing to
 * transport between.
 */
export function StagePlaybackControls({ stageCount, stage, onScrub, playing, onTogglePlaying, fastForward, onToggleFastForward, disabled }: StagePlaybackControlsProps) {
  const { t } = useLanguage()

  return (
    <div className="stage-playback-controls">
      <button
        type="button"
        className="screen-toolbar__button screen-toolbar__button--icon"
        onClick={() => onScrub(stage === 1 ? stageCount : stage - 1)}
        disabled={disabled}
        aria-label={t('screenDisplay.previousStage')}
        title={t('screenDisplay.previousStage')}
      >
        <PreviousStepIcon />
      </button>
      <button
        type="button"
        className="screen-toolbar__button screen-toolbar__button--icon"
        onClick={onTogglePlaying}
        disabled={disabled}
        aria-label={playing ? t('screenDisplay.pauseStages') : t('screenDisplay.playStages')}
        title={playing ? t('screenDisplay.pauseStages') : t('screenDisplay.playStages')}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        className="screen-toolbar__button screen-toolbar__button--icon"
        onClick={() => onScrub(stage === stageCount ? 1 : stage + 1)}
        disabled={disabled}
        aria-label={t('screenDisplay.nextStage')}
        title={t('screenDisplay.nextStage')}
      >
        <NextStepIcon />
      </button>
      <input
        type="range"
        className="stage-playback-controls__scrubber"
        min={1}
        max={stageCount}
        step={1}
        value={stage}
        disabled={disabled}
        onChange={(event) => onScrub(Number(event.target.value))}
        aria-label={t('screenDisplay.stageScrubberLabel')}
      />
      <button
        type="button"
        className={`screen-toolbar__button screen-toolbar__button--icon${fastForward ? ' screen-toolbar__button--active' : ''}`}
        onClick={onToggleFastForward}
        disabled={disabled}
        aria-pressed={fastForward}
        aria-label={t('screenDisplay.fastForwardStages')}
        title={t('screenDisplay.fastForwardStages')}
      >
        <FastForwardIcon />
      </button>
    </div>
  )
}
