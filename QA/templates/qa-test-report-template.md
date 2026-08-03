# Assistant QA Report — [Provider/Model] — [session policy, e.g. "fresh-session-by-default"] — [date]

**Provider tested:** [Local (Ollama) tag(s) for thinking/vision, or Claude model]. Ingestion posture "Ekstra forsiktig modus" left on **Automatisk** except where a scenario explicitly overrides it.
**Environment:** http://localhost:5173, dev instance, `main` branch (note any uncommitted working-tree changes relevant to what's being tested).
**Execution method:** Headed (visible) Chromium via Playwright (`QA/scratchpad/qa/[script].mts`, not committed), driving the real admin UI and chatting with the real assistant panel. Full raw evidence (every reply, every trace step, one screenshot per scenario) is in `[results path]` and `[screenshots folder]`.
**Session policy:** [one line — e.g. "every scenario starts with New chat immediately beforehand; a scenario with its own multi-turn point keeps its own turns together in that one fresh session" — link back to the plan doc for the full per-scenario classification].

## Methodology notes — read before the per-scenario results

*Carry forward whatever from the plan's own Methodology section actually shaped this run's results — don't just repeat the plan verbatim, note what was actually observed.*

1. [Environment state at start — re-seeded / reused; measured baseline counts.]
2. [Anything kept vs. torn down at the end, and why.]
3. [Any pre-existing report artifact investigated and resolved (or not) this run.]
4. [Retry-once rule applied — confirm it was, and roughly how often a retry was needed.]
5. **Overall verdict, stated up front:** [one paragraph — how did this model/config compare to the most relevant prior run? Where did the fresh-session policy (or whatever methodology changed) actually make a measurable difference vs. not?]

**Tally:** [N] PASS, [N] PARTIAL, [N] FAIL, [N] N/A, [N] ERROR, [N] CAPTURED (gate/draft mechanics confirmed correct; underlying draft content not independently re-gradable as clean pass/fail) across [N] scenarios, plus [N] ungraded diagnostic-addendum entries if run.

## A. Read/lookup pipeline

**[ID] — [short title] ("[exact message tested]")**
- **Status:** PASS / PARTIAL / FAIL / N/A / ERROR
- **What happened:** [the actual reply/outcome, quoted; what the trace shows fired; whether it matches the expected/correct answer against real current data — never trust the assistant's own self-report, verify against `server/data/*.json` or the admin UI]
- **Screenshot:** `[path]`

*(repeat per scenario in Section A)*

## B. Single-record ingestion

*(same per-scenario structure as Section A)*

## C. Batch (multi-record) ingestion

*(same per-scenario structure as Section A)*

## Key findings summary

*The cross-cutting findings, not a restatement of every scenario — usually 3-6 bullets, ranked by how many scenarios independently confirm the same underlying issue. A finding confirmed by 3+ separate scenarios (e.g. "records keep landing in the wrong catalogue") is more reportable than any single scenario's own FAIL.*

1. [Most consistent/severe finding, with a list of which scenario IDs confirm it.]
2. [Next finding.]
3. …
N. **App-level mechanics that don't depend on model quality** — [list what held up regardless of model output quality: gate buttons, posture toggle, manual-creation isolation, batch-vs-single UI gating, etc.]

## Diagnostic addendum (does not affect the grading above)

*Only include this section if the diagnostic addendum was actually run.*

[Same battery of scenarios re-run in one continuous session — quote the replies, compare against the fresh-session versions above, and state plainly whether this model shows session-length degradation or whether its failures look present from the start regardless of session length.]
**Screenshot:** `[path]`

## Cleanup performed

The seed fixture ([name], [composition]) was **kept in place**, per standing policy, so a future re-test doesn't need to re-seed. Every record an individual scenario created on top of it was removed via the real admin UI — verified against real data, not the assistant's own claims, both before and after cleanup:

| Record | Created in | Deleted via |
| --- | --- | --- |
| [name] | [scenario ID] | [admin UI / assistant chat delete] |

**Final verification:** [ground-truth counts read directly from `server/data/*.json` or the admin UI confirming the store is back to "baseline + intact seed fixture" with no scenario-created leftovers].
