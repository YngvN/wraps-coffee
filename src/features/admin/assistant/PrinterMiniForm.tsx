import { useState, type ReactNode } from 'react'
import { Button } from '../../../components'
import { useLanguage } from '../../../i18n'
import { DEFAULT_RAW_PRINTER_PORT, type PrinterDraft, type PrinterTransport } from '../../../types/printer'

interface PrinterMiniFormProps {
  draft: PrinterDraft
  /** The draft's validation issues, already rendered by `AssistantPanel`'s own `renderIssues`. */
  issues: ReactNode
  onSave: (printer: PrinterDraft) => void
  onCancel: () => void
}

/**
 * Editing an assistant-proposed receipt printer before saving it. Settings → Printers has no single
 * printer form to reuse (rows are edited inline, new ones come from search or a separate add form), so
 * this mirrors those fields: name, connection (address + port, or print queue), paper width, default.
 * Kept out of `AssistantPanel.tsx` itself, which is already very large; it only renders the issues and
 * calls back, the same contract as that file's own mini forms.
 */
export function PrinterMiniForm({ draft, issues, onSave, onCancel }: PrinterMiniFormProps) {
  const { t } = useLanguage()
  const [printer, setPrinter] = useState(draft)
  const set = (changes: Partial<PrinterDraft>) => setPrinter((current) => ({ ...current, ...changes }))

  return (
    <>
      {issues}
      <label className="assistant-panel__field">
        <span>{t('admin.settings.printers.name')}</span>
        <input value={printer.name} onChange={(event) => set({ name: event.target.value })} />
      </label>
      <label className="assistant-panel__field">
        <span>{t('admin.settings.printers.connection')}</span>
        <select value={printer.transport} onChange={(event) => set({ transport: event.target.value as PrinterTransport })}>
          <option value="network">{t('admin.settings.printers.transport.network')}</option>
          <option value="system">{t('admin.settings.printers.transport.system')}</option>
        </select>
      </label>
      {printer.transport === 'network' ? (
        <>
          <label className="assistant-panel__field">
            <span>{t('admin.settings.printers.address')}</span>
            <input value={printer.host ?? ''} placeholder="192.168.0.50" onChange={(event) => set({ host: event.target.value })} />
          </label>
          <label className="assistant-panel__field">
            <span>{t('admin.settings.printers.port')}</span>
            <input type="number" min={1} max={65535} value={printer.port ?? DEFAULT_RAW_PRINTER_PORT} onChange={(event) => set({ port: Number(event.target.value) })} />
          </label>
        </>
      ) : (
        <label className="assistant-panel__field">
          <span>{t('admin.settings.printers.queueName')}</span>
          <input value={printer.systemName ?? ''} onChange={(event) => set({ systemName: event.target.value })} />
        </label>
      )}
      <label className="assistant-panel__field">
        <span>{t('admin.settings.printers.paperWidth')}</span>
        <select value={printer.paperWidthMm} onChange={(event) => set({ paperWidthMm: Number(event.target.value) === 58 ? 58 : 80 })}>
          <option value={80}>80 mm</option>
          <option value={58}>58 mm</option>
        </select>
      </label>
      <label className="assistant-panel__field assistant-panel__field--inline">
        <input type="checkbox" checked={printer.isDefault} onChange={(event) => set({ isDefault: event.target.checked })} />
        <span>{t('admin.settings.printers.default')}</span>
      </label>
      <div className="assistant-panel__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="button" onClick={() => onSave(printer)}>
          {t('admin.common.save')}
        </Button>
      </div>
    </>
  )
}
