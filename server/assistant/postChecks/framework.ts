import type { AssistantTraceEntry } from '../client'
import { isCheckEnabled } from './registry'

/**
 * What a single `PostCheck` decides about a step's already-parsed structured
 * output — deterministic code, never another model call (see the plan behind
 * this feature: verify-pass sampling from the same distribution as the draft
 * is exactly the failure mode this framework replaces). `'auto-fix'` repairs
 * the output in place and moves on; `'reject-retry'` re-runs the same
 * produce() call once more; `'reject-clarify'` aborts the whole turn via
 * `PostCheckClarificationRequired`, the honest alternative to silently
 * guessing.
 */
export type PostCheckVerdict<T> =
  | { ok: true }
  | { ok: false; reason: string; action: 'auto-fix'; autoFix: (output: T) => T }
  | { ok: false; reason: string; action: 'reject-retry' }
  | { ok: false; reason: string; action: 'reject-clarify' }

/** One deterministic sanity check against a step's output — `context` carries whatever that step's own check family needs (the message, entity metadata, candidate lists, etc.), never anything a check must ask a model for. */
export interface PostCheck<TOutput, TContext> {
  /** Stable identifier — doubles as the `CHECK_ENABLED` registry key and the name stamped onto `AssistantTraceEntry.checks`. */
  name: string
  check: (output: TOutput, context: TContext) => PostCheckVerdict<TOutput>
}

export interface PostCheckRunResult<T> {
  output: T
  /** Names of checks that still failed after their one retry — surfaced to the caller so it can flag the result (e.g. `FillFieldsResult.flaggedChecks`) rather than silently using an output a check couldn't confirm. Never mutated onto `output` itself: every real `T` here is a concrete typed interface (`LookupQuerySpec`, `{ itemID: string | null }`, ...), not a bag that should grow an ad-hoc property. */
  flaggedChecks: string[]
}

/**
 * Thrown for a `reject-clarify` verdict. Every assistant HTTP route already
 * falls through any non-`AssistantNotConfiguredError`/`AssistantLocalProviderError`
 * to a plain `400 { error: message }` (see `server/index.ts`), which the chat
 * UI already renders as an inline error — so this needs no new route wiring
 * to surface honestly instead of silently guessing.
 */
export class PostCheckClarificationRequired extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'PostCheckClarificationRequired'
  }
}

/**
 * Runs `produce()` once, then every enabled check in `checks` against its
 * output, in order — an `'auto-fix'` verdict repairs the output and moves to
 * the next check; a `'reject-retry'` verdict re-runs `produce()` exactly
 * once more (never a loop) and re-checks only that one check against the
 * retry, flagging it if the retry still fails; a `'reject-clarify'` verdict
 * aborts immediately. `produce` is a thunk rather than this function owning
 * the `generateThenVerify`-vs-`callToolOnce` choice itself — whether a step
 * uses the draft+verify pass or a single call is an orthogonal decision (see
 * `AssistantModelCapability.useVerifyPass`); a post-check runs on the parsed
 * output regardless of which path produced it.
 */
export async function runStepWithChecks<T, C>(
  checks: PostCheck<T, C>[],
  produce: () => Promise<T>,
  context: C,
  trace: AssistantTraceEntry[],
  toolName: string,
): Promise<PostCheckRunResult<T>> {
  let { output, entries: attemptEntries } = await stampedProduce(produce, trace, toolName)
  const flaggedChecks: string[] = []

  for (const check of checks) {
    if (!isCheckEnabled(check.name)) continue
    const verdict = check.check(output, context)
    stampCheckResult(attemptEntries, 1, check.name, verdict)
    if (verdict.ok) continue

    if (verdict.action === 'auto-fix') {
      output = verdict.autoFix(output)
      continue
    }
    if (verdict.action === 'reject-clarify') {
      throw new PostCheckClarificationRequired(verdict.reason)
    }

    // 'reject-retry' — exactly one retry, never a loop.
    const retry = await stampedProduce(produce, trace, toolName)
    const retryVerdict = check.check(retry.output, context)
    stampCheckResult(retry.entries, 2, check.name, retryVerdict)
    output = retry.output
    attemptEntries = retry.entries
    if (!retryVerdict.ok) flaggedChecks.push(check.name)
  }

  return { output, flaggedChecks }
}

/** Calls `produce()` and returns its output alongside exactly the `trace` entries *this* call pushed (isolated by array length before/after, then filtered by `toolName`) — so a retry's own checks get stamped onto the retry's entries specifically, never re-stamped onto the first attempt's. */
async function stampedProduce<T>(produce: () => Promise<T>, trace: AssistantTraceEntry[], toolName: string): Promise<{ output: T; entries: AssistantTraceEntry[] }> {
  const startLength = trace.length
  const output = await produce()
  const entries = trace.slice(startLength).filter((entry) => entry.toolName === toolName)
  return { output, entries }
}

/**
 * Applies `checks` to an already-produced output with no retry capability —
 * for the rarer integration point where a check needs to run post-hoc on a
 * routing decision already made via more than one possible call path (e.g.
 * `selectIntent`'s own Claude-single-pass-vs-local-cascade branch), rather
 * than wrapping one specific tool call `runStepWithChecks` could re-invoke.
 * A `'reject-retry'` verdict is treated the same as `'reject-clarify'` here —
 * there's no single call left to retry. Known gap: no trace stamping (that
 * needs `produce()` to push fresh entries `runStepWithChecks` can isolate;
 * an already-completed call has none left to attribute a verdict to) —
 * acceptable since every check registered against this helper today only
 * ever uses `'auto-fix'`/`'reject-clarify'`, never `'reject-retry'`.
 */
export function applyChecksNoRetry<T, C>(checks: PostCheck<T, C>[], output: T, context: C): T {
  let result = output
  for (const check of checks) {
    if (!isCheckEnabled(check.name)) continue
    const verdict = check.check(result, context)
    if (verdict.ok) continue
    if (verdict.action === 'auto-fix') {
      result = verdict.autoFix(result)
      continue
    }
    throw new PostCheckClarificationRequired(verdict.reason)
  }
  return result
}

/** Attaches this check's verdict to this specific attempt's own trace entries (a `generateThenVerify` step pushes two, `draft`+`verify`; a `callToolOnce` step pushes one — both get the same stamp, mirroring how `steps.ts` already stamps `shape`/`resolvedFields` across every entry of one call rather than picking just one). */
function stampCheckResult<T>(entries: AssistantTraceEntry[], attempt: 1 | 2, checkName: string, verdict: PostCheckVerdict<T>): void {
  const event = verdict.ok
    ? { name: checkName, ok: true as const, attempt }
    : { name: checkName, ok: false as const, reason: verdict.reason, action: verdict.action, attempt }
  for (const entry of entries) {
    entry.checks = [...(entry.checks ?? []), event]
  }
}
