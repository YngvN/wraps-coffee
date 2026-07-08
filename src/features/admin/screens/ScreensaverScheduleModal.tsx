import { Button, Modal, TimeField } from '../../../components'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useScreensaverSchedule } from '../../../hooks/useScreensaverSchedule'
import { useLanguage } from '../../../i18n'
import './ScreensaverScheduleModal.scss'

interface ScreensaverScheduleModalProps {
  open: boolean
  onClose: () => void
}

/** Default window offered the first time a schedule's set — late evening through early morning, a reasonable starting guess for a cafe's own closed hours. */
const DEFAULT_START = '22:00'
const DEFAULT_END = '06:00'

/**
 * Sets (or clears) the shared daily window any screen with its own "Use
 * screensaver" checkbox on goes black during (see `useScreensaverSchedule`)
 * — live-written straight to the two time fields as they're changed, same
 * as the rest of this admin form's own fields, so there's no separate save
 * step. Clearing it removes the "Use screensaver" checkbox from every
 * screen's own editor entirely, not just turns it off. The 24h/12h toggle
 * only changes how the two `TimeField`s below it are entered/displayed —
 * the persisted schedule itself is always plain 24-hour `"HH:MM"`, so
 * switching the toggle back and forth never changes the actual times.
 */
export function ScreensaverScheduleModal({ open, onClose }: ScreensaverScheduleModalProps) {
  const { t } = useLanguage()
  const [schedule, setSchedule] = useScreensaverSchedule()
  const [clockFormat, setClockFormat] = useClockFormatPreference()
  const start = schedule?.start ?? DEFAULT_START
  const end = schedule?.end ?? DEFAULT_END

  return (
    <Modal open={open} onClose={onClose} title={t('admin.screens.screensaverTitle')}>
      <div className="screensaver-schedule-modal">
        <p>{t('admin.screens.screensaverDescription')}</p>
        <div className="screensaver-schedule-modal__clock-format" role="group" aria-label={t('admin.screens.clockFormatLabel')}>
          <button
            type="button"
            className={`screensaver-schedule-modal__clock-format-option${clockFormat === '24h' ? ' screensaver-schedule-modal__clock-format-option--active' : ''}`}
            onClick={() => setClockFormat('24h')}
          >
            {t('admin.screens.clockFormat24hLabel')}
          </button>
          <button
            type="button"
            className={`screensaver-schedule-modal__clock-format-option${clockFormat === '12h' ? ' screensaver-schedule-modal__clock-format-option--active' : ''}`}
            onClick={() => setClockFormat('12h')}
          >
            {t('admin.screens.clockFormat12hLabel')}
          </button>
        </div>
        <TimeField
          id="screensaver-start"
          format={clockFormat}
          label={t('admin.screens.screensaverStartLabel')}
          value={start}
          onChange={(next) => setSchedule({ start: next, end })}
        />
        <TimeField
          id="screensaver-end"
          format={clockFormat}
          label={t('admin.screens.screensaverEndLabel')}
          value={end}
          onChange={(next) => setSchedule({ start, end: next })}
        />
        <div className="screensaver-schedule-modal__actions">
          {schedule && (
            <Button type="button" variant="secondary" onClick={() => setSchedule(null)}>
              {t('admin.screens.screensaverClear')}
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {t('admin.common.done')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
