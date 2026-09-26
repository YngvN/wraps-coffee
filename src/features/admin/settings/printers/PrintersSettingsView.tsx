import { useState } from 'react'
import { Button, Card, HelpTip, Input } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { usePrinterSettings } from '../../../../hooks/usePrinterSettings'
import { availableLanguages, useLanguage } from '../../../../i18n'
import { testPrinter } from '../../../../lib/localServer'
import { resolveReceiptLanguage } from '../../../../lib/receipt'
import type { ConfiguredPrinter, DiscoveredPrinter, PrinterSettings } from '../../../../types/printer'
import { generateId } from '../../../../utils/id'
import { ManualPrinterForm } from './ManualPrinterForm'
import { PrinterDiscovery } from './PrinterDiscovery'
import './PrintersSettingsView.scss'

/** Same printer as a discovery result — by address for network printers, by queue name for system ones. */
function isSamePrinter(printer: ConfiguredPrinter, found: DiscoveredPrinter): boolean {
  return (
    printer.transport === found.transport &&
    (printer.transport === 'network' ? printer.host === found.host && (printer.port ?? 9100) === found.port : printer.systemName === found.systemName)
  )
}

/**
 * Settings → Printers: the language receipts print in (Norwegian unless changed here), and the receipt
 * printers order boards and registers can print to (`admin.printers`). Printers are
 * found with a network/print-queue search or added by hand; each can be renamed, set to 58 or 80 mm
 * paper, test-printed, made the default, or removed. Every change saves at once, like other synced
 * settings. A printer plugged into a tablet by USB isn't set up here — that tablet picks it in the
 * order board's own ⚙ menu, since only it can reach it.
 */
export function PrintersSettingsView() {
  const { t, language } = useLanguage()
  const { session } = useAdminSession()
  const [settings, setSettings] = usePrinterSettings()
  const [testState, setTestState] = useState<Record<string, { ok: boolean; message: string } | 'printing'>>({})

  const update = (printers: ConfiguredPrinter[], defaultPrinterId = settings.defaultPrinterId) => {
    // The default always points at a printer that exists; the first one added becomes it automatically.
    const validDefault = printers.some((printer) => printer.id === defaultPrinterId) ? defaultPrinterId : (printers[0]?.id ?? null)
    setSettings({ printers, defaultPrinterId: validDefault })
  }

  const add = (printer: Omit<ConfiguredPrinter, 'id'>) => update([...settings.printers, { ...printer, id: `printer-${generateId()}` }])

  const addFound = (found: DiscoveredPrinter) =>
    add({ name: found.name, transport: found.transport, host: found.host, port: found.port, systemName: found.systemName, paperWidthMm: 80 })

  const patch = (id: string, changes: Partial<ConfiguredPrinter>) => update(settings.printers.map((printer) => (printer.id === id ? { ...printer, ...changes } : printer)))

  const runTest = (printer: ConfiguredPrinter) => {
    if (!session) return
    setTestState((current) => ({ ...current, [printer.id]: 'printing' }))
    testPrinter(session.token, printer, language)
      .then(() => setTestState((current) => ({ ...current, [printer.id]: { ok: true, message: t('admin.settings.printers.testSent') } })))
      .catch((error: unknown) => setTestState((current) => ({ ...current, [printer.id]: { ok: false, message: error instanceof Error ? error.message : String(error) } })))
  }

  return (
    <div className="printers-settings">
      <Card title={t('admin.settings.printers.receiptLanguageTitle')}>
        <label className="printers-settings__language">
          <span>{t('admin.settings.printers.receiptLanguageLabel')}</span>
          <select value={resolveReceiptLanguage(settings)} onChange={(event) => setSettings({ ...settings, receiptLanguage: event.target.value as PrinterSettings['receiptLanguage'] })}>
            {availableLanguages.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="printers-settings__muted">{t('admin.settings.printers.receiptLanguageHint')}</p>
      </Card>

      <Card title={t('admin.settings.printers.configuredTitle')}>
        {settings.printers.length === 0 ? (
          <p className="printers-settings__muted">{t('admin.settings.printers.noPrinters')}</p>
        ) : (
          <ul className="printers-settings__list">
            {settings.printers.map((printer) => {
              const test = testState[printer.id]
              return (
                <li key={printer.id} className="printers-settings__row printers-settings__row--configured">
                  <div className="printers-settings__row-main">
                    <Input
                      id={`printer-name-${printer.id}`}
                      aria-label={t('admin.settings.printers.name')}
                      value={printer.name}
                      onChange={(event) => patch(printer.id, { name: event.target.value })}
                    />
                    <span className="printers-settings__muted">
                      {printer.transport === 'network' ? `${printer.host}:${printer.port ?? 9100}` : `${t('admin.settings.printers.onThisServer')} — ${printer.systemName}`}
                    </span>
                    {test && test !== 'printing' && <span className={test.ok ? 'printers-settings__ok' : 'printers-settings__error'}>{test.message}</span>}
                  </div>
                  <div className="printers-settings__row-controls">
                    <select
                      aria-label={t('admin.settings.printers.paperWidth')}
                      value={printer.paperWidthMm}
                      onChange={(event) => patch(printer.id, { paperWidthMm: Number(event.target.value) === 58 ? 58 : 80 })}
                    >
                      <option value={80}>80 mm</option>
                      <option value={58}>58 mm</option>
                    </select>
                    <label className="printers-settings__default">
                      <input type="checkbox" checked={Boolean(printer.cashDrawer)} onChange={(event) => patch(printer.id, { cashDrawer: event.target.checked || undefined })} />
                      {t('admin.settings.printers.cashDrawer')} <HelpTip text={t('admin.settings.printers.cashDrawerHint')} />
                    </label>
                    {printer.cashDrawer && printer.transport === 'network' && (
                      <label className="printers-settings__default">
                        {t('admin.settings.printers.drawerSensor')} <HelpTip text={t('admin.settings.printers.drawerSensorHint')} />
                        <select
                          value={printer.drawerSensor ?? 'off'}
                          onChange={(event) => patch(printer.id, { drawerSensor: event.target.value === 'off' ? undefined : (event.target.value as 'openWhenHigh' | 'openWhenLow') })}
                        >
                          <option value="off">{t('admin.settings.printers.drawerSensorOff')}</option>
                          <option value="openWhenHigh">{t('admin.settings.printers.drawerSensorHigh')}</option>
                          <option value="openWhenLow">{t('admin.settings.printers.drawerSensorLow')}</option>
                        </select>
                      </label>
                    )}
                    <label className="printers-settings__default">
                      <input type="radio" name="default-printer" checked={settings.defaultPrinterId === printer.id} onChange={() => update(settings.printers, printer.id)} />
                      {t('admin.settings.printers.default')}
                    </label>
                    <Button type="button" variant="secondary" onClick={() => runTest(printer)} disabled={test === 'printing'}>
                      {test === 'printing' ? t('admin.settings.printers.testing') : t('admin.settings.printers.test')}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => update(settings.printers.filter((candidate) => candidate.id !== printer.id))}>
                      {t('admin.settings.printers.remove')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="printers-settings__muted">{t('admin.settings.printers.usbTabletHint')}</p>
      </Card>

      <Card
        title={
          <>
            {t('admin.settings.printers.findTitle')} <HelpTip text={t('admin.settings.printers.findHint')} />
          </>
        }
      >
        <PrinterDiscovery isAdded={(found) => settings.printers.some((printer) => isSamePrinter(printer, found))} onAdd={addFound} />
      </Card>

      <Card title={t('admin.settings.printers.manualTitle')}>
        <ManualPrinterForm onAdd={add} />
      </Card>
    </div>
  )
}
