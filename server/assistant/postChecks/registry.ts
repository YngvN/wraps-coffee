/**
 * Per-check enable/disable — a plain code-level toggle, same style as
 * `ASSISTANT_MODEL_CAPABILITIES` (`steps.ts`). No feature-flag mechanism
 * exists anywhere else in `server/` (no env toggles, no DB-backed flags), and
 * this app has no synced-settings/UI-facing toggle precedent to build on
 * either — disabling a check means a code change + deploy, consistent with
 * every other engineering-level knob in this codebase. Every check defaults
 * to `true`; flip a specific one to `false` here if a QA regression pass
 * finds it firing on real, correct output (false positives are the
 * exception, not the rule, for this initial inventory — see the plan behind
 * this feature).
 */
const CHECK_ENABLED: Record<string, boolean> = {
  'filter-field-exists': true,
  'filter-not-brand-name': true,
  'filter-op-shape-mismatch': true,
  'no-fabricated-selection': true,
  'real-ambiguity-forces-clarify': true,
  'entity-action-consistency': true,
  'entity-searchtext-consistency': true,
  'pronoun-not-searchtext': true,
  'no-hallucinated-values-in-safe-mode': true,
  'input-mentioned-values-only': true,
  'dual-price-both-fields': true,
  'catalogueId-context-consistency': true,
}

/** Unknown check names default to enabled — a check that forgot to register itself here should still run, rather than silently never firing. */
export function isCheckEnabled(name: string): boolean {
  return CHECK_ENABLED[name] ?? true
}
