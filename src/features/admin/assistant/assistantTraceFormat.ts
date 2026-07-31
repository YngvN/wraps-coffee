import type { AssistantTraceEntry } from '../../../lib/localServer'
import type { AssistantEntityKey } from './useAssistantFlow'

/** `Ns` under a minute, `Nm Ss` under an hour, `Nh Nm` above — plain number formatting, not a translatable string (see the plan's own note on why this isn't a set of i18n keys). Shared by `AssistantThoughtTrace` (the live/collapsed UI) and `AssistantPanel`'s "copy conversation" plain-text export, so both read consistently. */
export function formatThoughtDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Friendly, glance-level label for one trace entry — the raw `toolName`/input/output stays available underneath, in `AssistantThoughtTrace`'s own nested `AnimatedDetails` (and verbatim in `AssistantPanel`'s "copy conversation" export). */
export function traceStepLabel(entry: AssistantTraceEntry, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (entry.toolName) {
    case 'select_intent':
      return t('admin.assistant.thoughtStep.selectIntent')
    case 'select_item':
      return t('admin.assistant.thoughtStep.selectItem')
    case 'lookup_batch':
      return t('admin.assistant.thoughtStep.lookupBatch')
    case 'answer_lookup':
      return t('admin.assistant.thoughtStep.answerLookup')
    case 'compact_history':
      return t('admin.assistant.thoughtStep.compactHistory')
    default: {
      if (entry.toolName.startsWith('fill_fields_')) {
        const entityKey = entry.toolName.slice('fill_fields_'.length) as AssistantEntityKey
        return t('admin.assistant.thoughtStep.fillFields', { entity: t(`admin.assistant.entities.${entityKey}`) })
      }
      return entry.toolName
    }
  }
}

/** Sums every entry's own token usage/cost estimate, omitting a total cost figure entirely if any entry has no `estimatedCostUsd` (e.g. the `'local'` provider, which has nothing real to bill). */
export function sumUsage(trace: AssistantTraceEntry[]): { inputTokens: number; outputTokens: number; costUsd?: number } {
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let hasCost = false
  for (const entry of trace) {
    if (!entry.usage) continue
    inputTokens += entry.usage.inputTokens
    outputTokens += entry.usage.outputTokens
    if (entry.usage.estimatedCostUsd !== undefined) {
      costUsd += entry.usage.estimatedCostUsd
      hasCost = true
    }
  }
  return { inputTokens, outputTokens, costUsd: hasCost ? costUsd : undefined }
}

/** Formats a small USD estimate — always rough (the `~` prefix says so), never shown as an exact figure. */
export function formatCostUsd(costUsd: number): string {
  if (costUsd < 0.01) return `~$${costUsd.toFixed(4)}`
  return `~$${costUsd.toFixed(2)}`
}
