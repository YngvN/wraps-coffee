import { useState } from 'react'
import { Badge, Button, Spinner } from '../../../../components'
import { useAdminSession } from '../../../../hooks/useAdminSession'
import { useLanguage } from '../../../../i18n'
import { discoverPrinters } from '../../../../lib/localServer'
import type { DiscoveredPrinter } from '../../../../types/printer'

interface PrinterDiscoveryProps {
  /** Whether a found printer is already in the list, so its Add button can show that instead. */
  isAdded: (printer: DiscoveredPrinter) => boolean
  onAdd: (printer: DiscoveredPrinter) => void
}

/** Where a found printer is, in words: its network address, or "on this server" for an OS print queue. */
function discoveredLocation(printer: DiscoveredPrinter, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return printer.transport === 'network' ? `${printer.host}:${printer.port}` : t('admin.settings.printers.onThisServer')
}

/**
 * "Search for printers": asks the server to scan the network for printers accepting raw receipt jobs
 * (mDNS plus port 9100 across the subnet) and to list the server machine's own print queues, then
 * offers each result with an Add button. Receipt-looking printers are sorted first and badged, but
 * every result is offered — plenty of receipt printers have unhelpful names.
 */
export function PrinterDiscovery({ isAdded, onAdd }: PrinterDiscoveryProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [state, setState] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const [found, setFound] = useState<DiscoveredPrinter[]>([])
  const [error, setError] = useState<string | null>(null)

  const search = () => {
    if (!session) return
    setState('searching')
    setError(null)
    discoverPrinters(session.token)
      .then((printers) => {
        setFound(printers)
        setState('done')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setState('error')
      })
  }

  return (
    <div className="printers-settings__discovery">
      <div className="printers-settings__actions">
        <Button type="button" onClick={search} disabled={state === 'searching'}>
          {t('admin.settings.printers.search')}
        </Button>
        {state === 'searching' && (
          <span className="printers-settings__muted">
            <Spinner size="sm" /> {t('admin.settings.printers.searching')}
          </span>
        )}
      </div>
      {state === 'error' && <p className="printers-settings__error">{error}</p>}
      {state === 'done' && found.length === 0 && <p className="printers-settings__muted">{t('admin.settings.printers.noneFound')}</p>}
      {found.length > 0 && (
        <ul className="printers-settings__list">
          {found.map((printer) => (
            <li key={`${printer.transport}:${printer.host ?? printer.systemName}`} className="printers-settings__row">
              <div className="printers-settings__row-main">
                <span className="printers-settings__name">
                  {printer.name} {printer.likelyReceipt && <Badge variant="success">{t('admin.settings.printers.receiptBadge')}</Badge>}
                </span>
                <span className="printers-settings__muted">{discoveredLocation(printer, t)}</span>
              </div>
              <Button type="button" variant="secondary" onClick={() => onAdd(printer)} disabled={isAdded(printer)}>
                {isAdded(printer) ? t('admin.settings.printers.added') : t('admin.settings.printers.add')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
