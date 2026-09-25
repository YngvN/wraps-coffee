import { validatePrinterDraft } from '../../../src/lib/assistantValidation'
import { DEFAULT_PRINTER_SETTINGS, DEFAULT_RAW_PRINTER_PORT, type PrinterDraft, type PrinterSettings } from '../../../src/types/printer'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveSettings(): PrinterSettings {
  return (store.get('admin.printers')?.value as PrinterSettings | undefined) ?? DEFAULT_PRINTER_SETTINGS
}

/** Every configured printer as a draft, `isDefault` filled in from the settings' own `defaultPrinterId`. */
function liveDrafts(): PrinterDraft[] {
  const settings = liveSettings()
  return settings.printers.map((printer) => ({ ...printer, isDefault: printer.id === settings.defaultPrinterId }))
}

interface PrinterFields {
  name: string | null
  transport: 'network' | 'system' | null
  host: string | null
  port: number | null
  systemName: string | null
  paperWidthMm: 58 | 80 | null
  cashDrawer: boolean | null
  isDefault: boolean | null
}

/**
 * A receipt printer in Settings → Printers (`admin.printers`) — the assistant can add one (by network
 * address or server print queue), rename it, change its paper width or address, make it the default,
 * or remove it. Discovery and test prints stay in the Settings page itself: they need the server to
 * scan the network or talk to the printer, which the assistant's draft-only flow never does.
 *
 * `host` and `systemName` are confabulation risks — a real IP address or queue name the message has to
 * name exactly — so a weaker model under the `'safe'` posture never sees them and can't invent one;
 * renaming, paper width and the default stay available to it.
 */
export const printerEntity: AssistantEntity<PrinterDraft> = {
  key: 'printer',
  supportedActions: ['create', 'update', 'delete'],
  section: 'store',
  destructive: (action) => action === 'delete',
  confabulationRiskFields: ['host', 'systemName'],

  fillFieldsSchema(action): AssistantJsonSchema {
    if (action === 'delete') return { type: 'object', properties: {}, required: [], additionalProperties: false }
    return {
      type: 'object',
      properties: {
        name: nullable({ type: 'string', description: 'What staff see in the order board\'s printer list, e.g. "Kitchen" or "Counter".' }),
        transport: nullable({ type: 'string', enum: ['network', 'system'], description: 'network — a printer on the LAN reached by IP address; system — a print queue installed on the server machine (typically a USB printer plugged into it).' }),
        host: nullable({ type: 'string', description: 'network only — the printer\'s IP address exactly as the message states it. Never guess one.' }),
        port: nullable({ type: 'number', description: `network only — the raw printing port. Leave null for the standard ${DEFAULT_RAW_PRINTER_PORT}.` }),
        systemName: nullable({ type: 'string', description: 'system only — the print queue\'s exact name as the message states it. Never guess one.' }),
        paperWidthMm: nullable({ type: 'number', enum: [58, 80], description: 'Receipt paper width in millimetres.' }),
        cashDrawer: nullable({ type: 'boolean', description: "Whether a cash drawer is plugged into this printer's drawer port, so the register may open it. Leave null unless the message says so." }),
        isDefault: nullable({ type: 'boolean', description: 'Whether order boards print to this printer unless a tablet picked another.' }),
      },
      required: ['name', 'transport', 'host', 'port', 'systemName', 'paperWidthMm', 'cashDrawer', 'isDefault'],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, _context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveDrafts().filter((printer) => !needle || [printer.name, printer.host, printer.systemName].some((value) => value?.toLowerCase().includes(needle)))
    return matches.slice(0, 30).map((printer) => ({ id: printer.id, label: printer.name }))
  },

  async getCurrent(id: string): Promise<PrinterDraft | null> {
    return liveDrafts().find((printer) => printer.id === id) ?? null
  },

  mergeDraft(_action, current, rawFields): PrinterDraft {
    const fields = rawFields as PrinterFields
    const base: PrinterDraft = current ?? {
      id: `printer-${Date.now()}`,
      name: '',
      transport: 'network',
      paperWidthMm: 80,
      // The first printer added becomes the default, same as adding one in Settings → Printers.
      isDefault: liveSettings().printers.length === 0,
    }
    const transport = fields.transport ?? base.transport
    return {
      ...base,
      name: fields.name ?? base.name,
      transport,
      // Only the fields of the chosen transport are kept, so switching a printer from network to a
      // queue doesn't leave a stale address behind (or the other way round).
      host: transport === 'network' ? (fields.host ?? base.host) : undefined,
      port: transport === 'network' ? (fields.port ?? base.port) : undefined,
      systemName: transport === 'system' ? (fields.systemName ?? base.systemName) : undefined,
      paperWidthMm: fields.paperWidthMm ?? base.paperWidthMm,
      cashDrawer: fields.cashDrawer ?? base.cashDrawer,
      isDefault: fields.isDefault ?? base.isDefault,
    }
  },

  validate(_action, draft: PrinterDraft): AssistantValidationIssue[] {
    return validatePrinterDraft(draft)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },

  async listAll(): Promise<PrinterDraft[]> {
    return liveDrafts()
  },
}
