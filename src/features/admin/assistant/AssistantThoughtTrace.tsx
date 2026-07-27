import { useState } from 'react'
import { AnimatedDetails, ChevronRightIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { AssistantTraceEntry } from '../../../lib/localServer'
import { AssistantTypingIndicator } from './AssistantTypingIndicator'
import type { AssistantEntityKey } from './useAssistantFlow'
import './AssistantThoughtTrace.scss'

interface AssistantThoughtTraceProps {
  trace: AssistantTraceEntry[]
  /** Only set once the operation has finished — omitted while `live` is true. */
  durationMs?: number
  /** Whether the operation this trace belongs to is still in flight — shows the pulsing typing indicator as the summary instead of a finalized "Thought for Xs" label. */
  live?: boolean
  /** Only meaningful while `live` — the current phase label (e.g. "Thinking…"/"Double-checking…") shown next to the dots. */
  typingLabel?: string
  /** Whether this trace starts expanded — defaults to collapsed everywhere it's used. */
  defaultOpen?: boolean
}

/** `Ns` under a minute, `Nm Ss` under an hour, `Nh Nm` above — plain number formatting, not a translatable string (see the plan's own note on why this isn't a set of i18n keys). */
function formatThoughtDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Friendly, glance-level label for one trace entry — the raw `toolName`/input/output stays available underneath, in each entry's own nested `AnimatedDetails`. */
function traceStepLabel(entry: AssistantTraceEntry, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (entry.toolName) {
    case 'select_intent':
      return t('admin.assistant.thoughtStep.selectIntent')
    case 'select_item':
      return t('admin.assistant.thoughtStep.selectItem')
    case 'lookup_batch':
      return t('admin.assistant.thoughtStep.lookupBatch')
    case 'answer_lookup':
      return t('admin.assistant.thoughtStep.answerLookup')
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
function sumUsage(trace: AssistantTraceEntry[]): { inputTokens: number; outputTokens: number; costUsd?: number } {
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
function formatCostUsd(costUsd: number): string {
  if (costUsd < 0.01) return `~$${costUsd.toFixed(4)}`
  return `~$${costUsd.toFixed(2)}`
}

/**
 * The assistant's own "thought process" for one operation — collapsed by
 * default behind either a live typing indicator (while the operation is
 * still running, see `live`) or a finalized "Thought for Xs" toggle (once
 * it's done), expanding to show each internal step/tool call in order, for
 * troubleshooting and — per the request that led to this component — "for
 * fun." Each step's own friendly label (`traceStepLabel`) can itself expand
 * further into the raw `toolName` plus truncated input/output JSON.
 */
export function AssistantThoughtTrace({ trace, durationMs, live, typingLabel, defaultOpen }: AssistantThoughtTraceProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [openStepId, setOpenStepId] = useState<number | null>(null)
  const usage = sumUsage(trace)

  const summary = live ? (
    <AssistantTypingIndicator label={typingLabel ?? t('admin.assistant.thinking')} />
  ) : (
    <span className="assistant-thought-trace__summary-label">
      <ChevronRightIcon />
      <span>{t('admin.assistant.thoughtDuration', { duration: formatThoughtDuration(durationMs ?? 0) })}</span>
      {(usage.inputTokens > 0 || usage.outputTokens > 0) && (
        <span className="assistant-thought-trace__summary-usage">
          {t('admin.assistant.thoughtTokens', { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens })}
          {usage.costUsd !== undefined && ` · ${formatCostUsd(usage.costUsd)}`}
        </span>
      )}
    </span>
  )

  return (
    <AnimatedDetails
      open={open}
      onToggle={() => setOpen((current) => !current)}
      summary={summary}
      className="assistant-thought-trace"
      summaryClassName="assistant-thought-trace__summary"
      bodyClassName="assistant-thought-trace__body"
    >
      {trace.length === 0 ? (
        <p className="assistant-thought-trace__empty">{t('admin.assistant.thoughtEmpty')}</p>
      ) : (
        <ul className="assistant-thought-trace__steps">
          {trace.map((entry, index) => {
            const entryUsage = entry.usage
            return (
              <li key={index} className="assistant-thought-trace__step">
                <AnimatedDetails
                  open={openStepId === index}
                  onToggle={() => setOpenStepId((current) => (current === index ? null : index))}
                  summary={
                    <span className="assistant-thought-trace__step-summary-label">
                      <ChevronRightIcon />
                      <span>{traceStepLabel(entry, t)}</span>
                      {entry.pass && <span className="assistant-thought-trace__step-pass">({entry.pass})</span>}
                      {entryUsage && (
                        <span className="assistant-thought-trace__step-usage">
                          {t('admin.assistant.thoughtTokens', { inputTokens: entryUsage.inputTokens, outputTokens: entryUsage.outputTokens })}
                          {entryUsage.estimatedCostUsd !== undefined && ` · ${formatCostUsd(entryUsage.estimatedCostUsd)}`}
                        </span>
                      )}
                    </span>
                  }
                  className="assistant-thought-trace__step-details"
                  summaryClassName="assistant-thought-trace__step-summary"
                  bodyClassName="assistant-thought-trace__step-body"
                >
                  <div className="assistant-thought-trace__step-raw">
                    <div>
                      <span className="assistant-thought-trace__step-raw-label">{entry.toolName}</span>
                      <span className="assistant-thought-trace__step-raw-duration">{formatThoughtDuration(entry.durationMs)}</span>
                    </div>
                    <pre>{entry.input}</pre>
                    <pre>{entry.output}</pre>
                  </div>
                </AnimatedDetails>
              </li>
            )
          })}
        </ul>
      )}
    </AnimatedDetails>
  )
}
