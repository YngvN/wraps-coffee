<!-- Base template version: 1 (split out of the old monolithic qa-test-report-template.md, v4, on 2026-08-04. That file had no meaningfully project-specific content beyond wording — this is a light generalization pass, not a structural rewrite. Applies to future reports only — do not retrofit onto existing reports in QA/Reports/.) -->

# Assistant QA Report — [Provider/Configuration] — [session policy, e.g. "fresh-session-by-default"] — [date]

**Template version:** Base 1[ + Project N if this project's own template adds report conventions]
**Configuration tested:** [whatever this project's own configuration axis is — provider/tag, feature flags, etc.] [Any project-specific standing setting worth restating up front, e.g. a posture/mode default — see the project template.]
**Environment:** [URL/environment], `[branch]` (note any uncommitted working-tree changes relevant to what's being tested).
**Execution method:** Headed (visible) browser via [automation tool] (`[script path]`, not committed), driving the real app UI. Full raw evidence (every reply, every trace step, one screenshot per scenario) is in `[results path]` and `[screenshots folder]`.
**Session policy:** [one line — e.g. "every scenario starts with New chat immediately beforehand; a scenario with its own multi-turn point keeps its own turns together in that one fresh session" — link back to the plan doc for the full per-scenario classification].

## Methodology notes — read before the per-scenario results

*Carry forward whatever from the plan's own Methodology section actually shaped this run's results — don't just repeat the plan verbatim, note what was actually observed.*

1. [Environment state at start — re-seeded / reused; measured baseline counts.]
2. [Anything kept vs. torn down at the end, and why.]
3. [Any pre-existing report artifact investigated and resolved (or not) this run.]
4. [Retry-once rule applied — confirm it was, note which retries used an in-app affordance vs. a fresh session, per the plan's two-kind retry rule.]
5. [Any scenario re-graded after other evidence (trace/log/screenshot) overturned the harness's own DOM-read verdict — per the plan's harness-vs-reality rule. State it plainly: "harness said FAIL, other evidence showed PASS" is itself worth a line. Fix the underlying gap in the harness script itself in the same cycle when feasible (a rerun with the fix is cheap; a wrong grade sitting in a report is not), and record it in the project's own "known harness fixes" list so the next cycle inherits the fix instead of re-discovering it. Only defer the actual harness edit if the fix isn't clear yet — never defer just noting that a gap exists.]
6. **Overall verdict, stated up front:** [one paragraph — how did this configuration compare to the most relevant prior run? Where did the methodology (session policy, new checks, etc.) actually make a measurable difference vs. not?]

**Tally:** [N] PASS, [N] PARTIAL, [N] FAIL, [N] N/A, [N] N/A-pending (known deferred scenario — see plan), [N] ERROR, [N] CAPTURED (mechanics confirmed correct; underlying output not independently re-gradable as clean pass/fail) across [N] scenarios, plus [N] ungraded diagnostic-addendum entries if run.

## A. [Section name — e.g. "Read/lookup pipeline"]

**[ID] — [short title]** *(Phase: [which shipped phase this tests, or "pending" — omit if this project isn't using phase labels])*
- **Prompt:** "[exact message tested, verbatim — the literal text sent to the composer, not a paraphrase]." For a multi-message scenario, number each one in the order sent: `1: "..." · 2: "..."`, so a reader can tell which reply/trace entry below belongs to which without cross-referencing the scenario bank.
- **Status:** PASS / PARTIAL / FAIL / N/A / N/A-pending / ERROR
- **What happened:** [the actual reply/outcome, quoted; what any trace shows fired; whether it matches the expected/correct answer against real current data — never trust the assistant's own self-report, verify against the real underlying data store. If this is a FAIL where other evidence shows the pipeline itself fired correctly, check that evidence before finalizing the grade — a DOM/text read can miss content a human glance catches.]
- **Screenshot:** `[path]`

*(repeat per scenario in each section; section names/count are the project template's own choice)*

## Key findings summary

*The cross-cutting findings, not a restatement of every scenario — usually 3-6 bullets, ranked by how many scenarios independently confirm the same underlying issue. A finding confirmed by 3+ separate scenarios is more reportable than any single scenario's own FAIL.*

*For any finding confirmed by 2+ scenarios, name the **suspected root cause** — one line on what the underlying bug likely is, not a fix prescription. This is what tells a reader whether the finding is one bug surfacing repeatedly or several unrelated bugs that happen to look similar, which is exactly what determines whether follow-up work is one fix or several.*

1. [Most consistent/severe finding, with a list of which scenario IDs confirm it, plus **Suspected root cause:** one line.]
2. [Next finding, plus **Suspected root cause** if confirmed by 2+ scenarios.]
3. …
N. **Mechanics that don't depend on model/configuration quality** — [list what held up regardless of output quality: confirmation/gate mechanics, toggle round-trips, isolation between manual and automated paths, UI gating between single/batch flows, etc.]

## Diagnostic addendum (does not affect the grading above)

*Only include this section if the diagnostic addendum was actually run.*

[Same battery of scenarios re-run in one continuous session — quote the replies, compare against the fresh-session versions above, and state plainly whether this configuration shows session-length degradation or whether its failures look present from the start regardless of session length.]
**Screenshot:** `[path]`

## Cleanup performed

The seed fixture ([name], [composition]) was **kept in place**, per standing policy, so a future re-test doesn't need to re-seed. Every record an individual scenario created on top of it was removed via the real app UI — verified against real data, not the assistant's own claims, both before and after cleanup:

| Record | Created in | Deleted via |
| --- | --- | --- |
| [name] | [scenario ID] | [admin UI / assistant chat delete] |

**Final verification:** [ground-truth counts read directly from the real underlying data store confirming the store is back to "baseline + intact seed fixture" with no scenario-created leftovers].
