import { forwardRef } from 'react'
import { Badge, StatusDot } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { ScreenConfig } from '../../../types/screen'
import type { DisplayMachine } from '../../../types/displayMachine'
import type { DisplayConnectionStatus } from '../../../utils/displayConnection'
import { connectionBadgeId } from './connectionBadge'
import { connectionStatusDot } from './connectionStatusDot'
import { DisplayScreenPreview } from './DisplayScreenPreview'
import './DisplayCard.scss'

interface DisplayCardProps {
  machine: DisplayMachine
  connectionStatus: DisplayConnectionStatus
  /** The screen this display's first monitor is actually showing — `null` for the standby screensaver. */
  displayedScreen: ScreenConfig | null
  /** "last seen" text, already formatted by the caller against the store's own date/clock preferences. Shown only when the display isn't online — for a live display the green dot already says everything. */
  lastSeenText: string
  /** A short update-state line ("Up to date", "Update available", …), or `null` when this display has no update state worth showing (every non-`mobile` display, and any machine the hub can't resolve yet). */
  updateStateText: string | null
  onOpenDetails: () => void
}

/**
 * One display's own card in the Displays grid: a miniature of what it is
 * currently showing, over a compact footer with its connection dot, name,
 * connection type, the screen it is showing and its update state.
 *
 * Everything editable — the name, per-monitor screen assignment, the two
 * resolution ceilings, the update action and Remove — lives in
 * `DisplayDetailsModal` instead, which is what makes a whole fleet fit on
 * one scannable page. The entire card is the button that opens it.
 *
 * Forwards its ref because `useScrollToAndHighlight` registers it for the
 * `?pendingMachineId=`/`?updateMachineId=` deep links.
 */
export const DisplayCard = forwardRef<HTMLDivElement, DisplayCardProps>(function DisplayCard(
  { machine, connectionStatus, displayedScreen, lastSeenText, updateStateText, onOpenDetails },
  ref,
) {
  const { t } = useLanguage()
  const { dot, labelId } = connectionStatusDot(connectionStatus)
  const name = machine.customLabel ?? machine.label
  const extraMonitors = machine.monitors.length - 1

  return (
    <div ref={ref} className="display-card">
      <div className="display-card__preview">
        <DisplayScreenPreview screen={displayedScreen} dimmed={connectionStatus !== 'online'} />
        {extraMonitors > 0 && <span className="display-card__monitor-count">{t('admin.displayManager.extraMonitors', { count: extraMonitors })}</span>}
      </div>

      <div className="display-card__body">
        <div className="display-card__title-row">
          <StatusDot status={dot} label={t(labelId)} />
          <span className="display-card__name">{name}</span>
          <Badge variant="neutral">{t(connectionBadgeId(machine.connectionType))}</Badge>
        </div>

        <span className="display-card__screen">{displayedScreen?.name ?? t('admin.displayManager.previewStandby')}</span>

        {/* A green dot already says "online" — repeating a timestamp next to it is noise. Off/reconnecting is exactly when the last-seen time matters. */}
        <span className="display-card__meta">{connectionStatus === 'online' ? t(labelId) : `${t(labelId)} · ${lastSeenText}`}</span>

        {updateStateText && <span className="display-card__update-state">{updateStateText}</span>}
      </div>

      {/* The click target is an overlay rather than the card element itself: the preview renders
          `div`s, and a `div` inside a `button` is invalid content model. This keeps real button
          semantics (focus, Enter/Space, one accessible name) over the whole card area. */}
      <button
        type="button"
        className="display-card__hit"
        onClick={onOpenDetails}
        aria-label={t('admin.displayManager.openDetailsLabel', { name })}
      />
    </div>
  )
})
