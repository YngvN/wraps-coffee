import { Alert, Badge, Button, HelpTip, Input, Modal, Spinner, StatusDot } from '../../../components'
import { useLanguage } from '../../../i18n'
import {
  DISPLAY_MAX_IMAGE_PX_OPTIONS,
  DISPLAY_RENDER_WIDTH_OPTIONS,
  type DisplayMachine,
  type DisplayScreenOverride,
} from '../../../types/displayMachine'
import type { ScreenConfig } from '../../../types/screen'
import type { DisplayConnectionStatus } from '../../../utils/displayConnection'
import { connectionBadgeId } from './connectionBadge'
import { connectionStatusDot } from './connectionStatusDot'
import { DisplayScreenPreview } from './DisplayScreenPreview'
import { resolveDisplayedScreen } from './resolveDisplayedScreen'
import './DisplayDetailsModal.scss'

/** Everything the update section of this modal needs to render, resolved by `DisplayManagerView` (which owns the hub status and the in-flight progress list) and passed down so this component stays presentational. */
export interface DisplayUpdatePanel {
  /** Plain-language state line, e.g. "Up to date". */
  stateText: string
  /** Extra sentence shown only when the device's own capability changes what the admin must do — a Tier 3 confirmation tap, or a USB service visit. `null` for the common cases. */
  capabilityNote: string | null
  /** `true` while this display has an update in flight. */
  busy: boolean
  /** Set when this display's last update attempt failed, with the reason to show. */
  failedText: string | null
  /** Absent when there is nothing to do (already current, offline, or no publishable target). */
  onUpdate?: () => void
  /** Clears a stuck `update-failed` entry, which otherwise only clears on a later successful run. */
  onDismissFailure?: () => void
}

interface DisplayDetailsModalProps {
  machine: DisplayMachine
  screens: ScreenConfig[]
  overrides: DisplayScreenOverride[]
  connectionStatus: DisplayConnectionStatus
  lastSeenText: string
  /** The remote override's own `setAt`, preformatted by the caller against the store's date/clock preferences. `null` when there is no override. */
  overrideSetAtText: string | null
  versionText: string | null
  updatePanel: DisplayUpdatePanel | null
  onClose: () => void
  onLabelChange: (customLabel: string) => void
  onAssign: (monitorId: string, screenId: string) => void
  onMaxImagePxChange: (value: string) => void
  onRenderWidthPxChange: (value: string) => void
  onReturnToAssigned: () => void
  onRemove: () => void
}

/**
 * One display's full detail sheet — everything that used to sit expanded on
 * its card in the old vertical list: its name, a preview and screen
 * selector per monitor, the two per-unit resolution ceilings, the remote
 * screen override, the update action and Remove.
 *
 * Reached by clicking a `DisplayCard`, and directly via the
 * `?updateMachineId=` deep link (see `DisplayManagerView`). Every field
 * writes immediately — there is no Save button, matching the synced-key
 * posture the rest of this view has always had.
 */
export function DisplayDetailsModal({
  machine,
  screens,
  overrides,
  connectionStatus,
  lastSeenText,
  overrideSetAtText,
  versionText,
  updatePanel,
  onClose,
  onLabelChange,
  onAssign,
  onMaxImagePxChange,
  onRenderWidthPxChange,
  onReturnToAssigned,
  onRemove,
}: DisplayDetailsModalProps) {
  const { t } = useLanguage()
  const { dot, labelId } = connectionStatusDot(connectionStatus)
  const name = machine.customLabel ?? machine.label
  const override = overrides.find((entry) => entry.machineID === machine.machineID)
  const overrideScreenName = override ? (screens.find((screen) => screen.screenID === override.screenId)?.name ?? override.screenId) : null

  return (
    <Modal open onClose={onClose} title={name} route={t('admin.displayManager.title')}>
      <div className="display-details">
        <div className="display-details__status">
          <StatusDot status={dot} label={t(labelId)} />
          <span>{connectionStatus === 'online' ? t(labelId) : `${t(labelId)} · ${lastSeenText}`}</span>
          <Badge variant="neutral">{t(connectionBadgeId(machine.connectionType))}</Badge>
        </div>

        <label className="display-details__field" htmlFor={`machine-label-${machine.machineID}`}>
          <span className="display-details__field-label">{t('admin.displayManager.machineLabelLabel')}</span>
          <Input id={`machine-label-${machine.machineID}`} value={name} onChange={(event) => onLabelChange(event.target.value)} />
        </label>

        <section className="display-details__monitors">
          <h3 className="display-details__section-title">{t('admin.displayManager.assignedScreenLabel')}</h3>
          {machine.monitors.map((monitor) => (
            <div key={monitor.id} className="display-details__monitor">
              <div className="display-details__monitor-preview">
                <DisplayScreenPreview screen={resolveDisplayedScreen(machine, monitor, screens, overrides)} dimmed={connectionStatus !== 'online'} />
              </div>
              <label className="display-details__field" htmlFor={`monitor-${machine.machineID}-${monitor.id}`}>
                <span className="display-details__field-label">{monitor.label}</span>
                <select
                  id={`monitor-${machine.machineID}-${monitor.id}`}
                  className="display-details__select"
                  value={monitor.assignedScreenID ?? ''}
                  onChange={(event) => onAssign(monitor.id, event.target.value)}
                >
                  <option value="">{t('admin.displayManager.unassignedOption')}</option>
                  {screens.map((screen) => (
                    <option key={screen.screenID} value={screen.screenID}>
                      {screen.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </section>

        {override && (
          <div className="display-details__override">
            <div className="display-details__override-summary">
              <Badge variant="warning">{t('admin.displayManager.overriddenBadge')}</Badge>
              <span className="display-details__override-text">
                {t('admin.displayManager.overriddenTo', { screenName: overrideScreenName ?? '', date: overrideSetAtText ?? '' })}{' '}
                <HelpTip text={t('admin.displayManager.overriddenHint')} />
              </span>
            </div>
            <Button type="button" variant="secondary" onClick={onReturnToAssigned}>
              {t('admin.displayManager.returnToAssignedButton')}
            </Button>
          </div>
        )}

        {updatePanel && (
          <section className="display-details__update">
            <h3 className="display-details__section-title">{t('admin.displayManager.updateSectionLabel')}</h3>
            {versionText && <p className="display-details__version">{versionText}</p>}
            <div className="display-details__update-row">
              {updatePanel.busy && <Spinner size="sm" />}
              <span>{updatePanel.stateText}</span>
              {updatePanel.onUpdate && (
                <Button type="button" onClick={updatePanel.onUpdate} disabled={updatePanel.busy}>
                  {t('admin.displayManager.updateButton')}
                </Button>
              )}
            </div>
            {updatePanel.capabilityNote && <p className="display-details__capability-note">{updatePanel.capabilityNote}</p>}
            {updatePanel.failedText && (
              <Alert variant="error">
                {updatePanel.failedText}
                {updatePanel.onDismissFailure && (
                  <Button type="button" variant="secondary" onClick={updatePanel.onDismissFailure}>
                    {t('admin.displayManager.updateDismissFailure')}
                  </Button>
                )}
              </Alert>
            )}
          </section>
        )}

        <section className="display-details__advanced">
          <label className="display-details__field" htmlFor={`machine-max-image-${machine.machineID}`}>
            <span className="display-details__field-label">
              {t('admin.displayManager.maxImagePxLabel')} <HelpTip text={t('admin.displayManager.maxImagePxHint')} />
            </span>
            <select
              id={`machine-max-image-${machine.machineID}`}
              className="display-details__select"
              value={String(machine.maxImagePx ?? 'auto')}
              onChange={(event) => onMaxImagePxChange(event.target.value)}
            >
              {DISPLAY_MAX_IMAGE_PX_OPTIONS.map((option) => (
                <option key={String(option)} value={String(option)}>
                  {option === 'auto' ? t('admin.displayManager.maxImagePxAuto') : t('admin.displayManager.maxImagePxValue', { px: String(option) })}
                </option>
              ))}
            </select>
          </label>

          <label className="display-details__field" htmlFor={`machine-render-width-${machine.machineID}`}>
            <span className="display-details__field-label">
              {t('admin.displayManager.renderWidthLabel')} <HelpTip text={t('admin.displayManager.renderWidthHint')} />
            </span>
            <select
              id={`machine-render-width-${machine.machineID}`}
              className="display-details__select"
              value={String(machine.renderWidthPx ?? 'auto')}
              onChange={(event) => onRenderWidthPxChange(event.target.value)}
            >
              {DISPLAY_RENDER_WIDTH_OPTIONS.map((option) => (
                <option key={String(option)} value={String(option)}>
                  {option === 'auto' ? t('admin.displayManager.renderWidthAuto') : t(`admin.displayManager.renderWidth${option}`)}
                </option>
              ))}
            </select>
          </label>
        </section>

        <Button type="button" variant="danger" onClick={onRemove}>
          {t('admin.common.delete')}
        </Button>
      </div>
    </Modal>
  )
}
