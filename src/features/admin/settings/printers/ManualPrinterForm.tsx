import { useState, type FormEvent } from 'react'
import { Button, Input, NumberInput } from '../../../../components'
import { useLanguage } from '../../../../i18n'
import { DEFAULT_RAW_PRINTER_PORT, type ConfiguredPrinter, type PrinterTransport } from '../../../../types/printer'

interface ManualPrinterFormProps {
  onAdd: (printer: Omit<ConfiguredPrinter, 'id'>) => void
}

/** Adds a printer the search didn't find — a network printer by address (on another subnet, or asleep during the scan), or a print queue on the server machine by its exact name. */
export function ManualPrinterForm({ onAdd }: ManualPrinterFormProps) {
  const { t } = useLanguage()
  const [transport, setTransport] = useState<PrinterTransport>('network')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(DEFAULT_RAW_PRINTER_PORT)
  const [systemName, setSystemName] = useState('')

  const valid = transport === 'network' ? host.trim().length > 0 : systemName.trim().length > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    const fallbackName = transport === 'network' ? host.trim() : systemName.trim()
    onAdd(
      transport === 'network'
        ? { name: name.trim() || fallbackName, transport, host: host.trim(), port, paperWidthMm: 80 }
        : { name: name.trim() || fallbackName, transport, systemName: systemName.trim(), paperWidthMm: 80 },
    )
    setName('')
    setHost('')
    setSystemName('')
    setPort(DEFAULT_RAW_PRINTER_PORT)
  }

  return (
    <form className="printers-settings__manual" onSubmit={submit}>
      <label className="printers-settings__field">
        <span>{t('admin.settings.printers.connection')}</span>
        <select value={transport} onChange={(event) => setTransport(event.target.value as PrinterTransport)}>
          <option value="network">{t('admin.settings.printers.transport.network')}</option>
          <option value="system">{t('admin.settings.printers.transport.system')}</option>
        </select>
      </label>
      <Input id="printer-manual-name" label={t('admin.settings.printers.name')} value={name} onChange={(event) => setName(event.target.value)} />
      {transport === 'network' ? (
        <div className="printers-settings__inline">
          <Input id="printer-manual-host" label={t('admin.settings.printers.address')} placeholder="192.168.0.50" value={host} onChange={(event) => setHost(event.target.value)} />
          <NumberInput id="printer-manual-port" label={t('admin.settings.printers.port')} min={1} max={65535} value={port} onChange={setPort} />
        </div>
      ) : (
        <Input id="printer-manual-queue" label={t('admin.settings.printers.queueName')} value={systemName} onChange={(event) => setSystemName(event.target.value)} />
      )}
      <Button type="submit" variant="secondary" disabled={!valid}>
        {t('admin.settings.printers.add')}
      </Button>
    </form>
  )
}
