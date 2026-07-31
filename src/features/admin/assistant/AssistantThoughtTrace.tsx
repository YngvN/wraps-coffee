import { useState } from 'react'
import { AnimatedDetails, ChevronRightIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { AssistantTraceEntry } from '../../../lib/localServer'
import { AssistantTypingIndicator } from './AssistantTypingIndicator'
import { formatCostUsd, formatThoughtDuration, sumUsage, traceStepLabel } from './assistantTraceFormat'
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
