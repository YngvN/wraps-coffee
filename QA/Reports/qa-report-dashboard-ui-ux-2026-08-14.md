# QA Report — Admin dashboard UI/UX (navigation, layout width, terminology) — 2026-08-14

**Template shape:** adapted from `QA/templates/base/qa-test-report-base.md` (header block / Methodology / lettered finding sections / Key findings), following the same precedent `QA/Reports/qa-report-display-pairing-2026-08-06.md` set for a non-assistant feature. None of the base template's model/provider/session-policy methodology applies here, so the Methodology below is written from scratch.

**One deliberate departure from the base template:** this is a *design audit*, not a pass/fail functional cycle. A layout or wording choice isn't "FAIL", it's more or less costly to the person using it. So each finding carries a **Severity** (High / Medium / Low) instead of a PASS/FAIL status. Two genuine functional defects turned up along the way and are graded as defects explicitly (A4, B5).

**Scope:** the whole admin dashboard — every top-level nav section, every flyout sub-view, and the create/edit surfaces reachable from them. Not any single functional flow.
**Environment:** the app's own **production build** (`npm run build` → `npm run preview`, http://localhost:4173), branch `main`, real local data. See Methodology #2 for why the production build, not `npm run dev`, is what this report is graded against.
**Interface language:** English (`setDashboardLanguage(page, 'English')`), since the reported phrasing concerns are about the English copy. Norwegian was checked separately for the same terms — see C3, where it materially changes the conclusion.
**Execution method:** headed (visible) Chromium via Playwright, driving the real app. Scripts: `QA/scratchpad/qa/ui-ux-walk.mts` (nav walk + per-view measurement), `ui-ux-verify-deeplinks.mts`, `ui-ux-measure.mts` — scratchpad only, not committed, and read-only (they navigate and measure; they never write app data). Screenshots in `QA/dashboard-ui-ux-screenshots-2026-08-14/` — 27 captures covering all 10 top-level views, all 8 flyout/query-param sub-views, 3 screen-editor tabs, all 3 flyouts plus the tier-3 submenu, and Products at 1280/1920/2560px. Findings below cite the relevant ones; the rest are coverage evidence.

## Methodology notes — read before the findings

1. **Every measurement is read from the live DOM, not eyeballed from a screenshot.** Widths, row gaps and computed `max-width` values were read via `getBoundingClientRect()`/`getComputedStyle()` in the running page. Where this report cites a pixel number, that number came off the real rendered element.
2. **The first pass was run against `npm run dev` and had to be thrown away and re-run against a production build.** In dev, all five Settings flyout destinations (Store settings, Integrations, Advanced, Backup, For developers) rendered the plain Settings index instead of the requested sub-view — both by direct URL *and* by clicking the flyout row. That looked like a serious navigation bug. It isn't: `SettingsView.tsx:50-65` seeds its sub-view from `?view=` in a `useState` lazy initializer and then strips the param in a mount effect, so React's StrictMode double-mount (enabled at `src/main.tsx:77`) re-runs the initializer after the param is already gone. Against the production build every one of those five destinations resolves correctly. **The dev-only breakage is not reported as a user-facing finding** — it's recorded as A4 for the developer-experience cost it carries instead. This is exactly the harness-vs-reality cross-check the base template asks for, and it changed a would-be top finding into a non-finding.
3. **Fixture noise is excluded from the findings.** This install's real data contains leftover QA/diagnostic records (`Diagnostic (as-is)`, `[usage test] all panes (3)`, four `Usage test post` entries, `Screen 3 (verify)`). They make the screenshots untidy but they're test residue, not a UI defect, and nothing below is graded on them. The one exception is B5, where a *fixture* value (a catalogue with no English name) exposes a *real* rendering gap in how the app handles that value.
4. **Terminology findings are grounded in `src/i18n/languages.json`, not just in what a screenshot happened to show.** Every string cited below was pulled from the file by key, so the finding survives the copy moving to a different line.
5. **No app code, data, or configuration was changed.** `npm run build` wrote to `dist/` (gitignored); nothing else on disk was touched.

**Tally:** 15 findings — 4 High, 7 Medium, 4 Low. Two are outright defects (A4 dev-only, B5 user-facing); the rest are design/consistency findings.

---

## A. Navigation & information architecture

**A1 — The primary nav is icon-only at rest, and three sections have no icon-level distinction from the seven that behave differently** · Severity: **Medium**
- **What was measured:** The desktop rail renders 10 `NAV_ITEMS` (`adminNavItems.ts:23-41`) plus two non-route buttons — "Assistant" and "Search" — as unlabeled icons until the rail is hovered, at which point it expands to show labels (`23-flyout-screens.png`).
- **What this costs:** Three of those rows (Products, Screens, Settings — `FLYOUT_RAIL_ITEMS`, `AdminSidebarNav.tsx:19`) open a submenu; seven navigate directly; two open a side panel and don't navigate at all. At rest, all twelve look identical — a column of same-weight icons. The chevron that distinguishes a flyout row only appears once the rail is already expanded. So the answer to "can I get to X from here, and what happens if I click?" is only available *after* committing to a hover.
- **Screenshots:** `01-overview.png` (rail at rest), `23-flyout-screens.png` (rail expanded).

**A2 — Three whole sections exist only as rows inside the Settings flyout, with no presence in the nav itself** · Severity: **High**
- **What was measured:** `DASHBOARD_SECTIONS` (`src/types/sync.ts`) includes `store`, `integrations` and `displaymanager`, but none is a `NAV_ITEMS` entry. Store settings and Integrations are reachable only via Settings' flyout (or a card on the Settings page); Display Manager only via the Screens flyout or a card on Screens.
- **What this costs:** Display Manager is the entire physical-device surface of this product — pairing a TV, assigning which Screen a monitor shows, per-unit image resolution — and it is a second-level row under "Screens", a section whose own name suggests content layout, not hardware. Nothing at the top level of the dashboard indicates a device-management surface exists at all. The same applies to Integrations (transit, weather, news, delivery platforms), which is buried under a section named "Settings".
- **Screenshots:** `24-flyout-settings.png`, `16-screens-displaymanager.png`.

**A3 — No sub-view of Settings or Store settings has its own URL** · Severity: **High**
- **What was measured:** Navigating to Store settings — by URL *or* by clicking the flyout row — leaves the address at `/admin/dashboard/settings`. Verified directly: the page heading reads "Store settings" while `location.pathname + location.search` reads `/admin/dashboard/settings`, because `SettingsView.tsx:57-65` deliberately strips `?view=` once consumed. Store settings then nests further still — "Edit contact info" and "Edit appearance" (`11-settings-store.png`) are a *third* level, also with no URL of their own.
- **What this costs:** Three levels deep, one address. You cannot bookmark Store settings, share a link to Backup, or reload the page without being thrown back to the Settings index. Browser Back only works because a custom shim (`useBackLevel`, `SettingsView.tsx:95`) re-implements it by hand — a workaround for state that the URL should have been carrying in the first place. See Section D for the proposed fix.

**A4 — The Settings flyout is completely broken in `npm run dev`, and correct in production** · Severity: **Medium** *(developer-experience defect; not user-facing)*
- **What happened:** As detailed in Methodology #2 — in dev, all five Settings flyout destinations render the Settings index instead. Root cause: `useState` lazy initializer reads `?view=` (`SettingsView.tsx:50-53`), a mount effect deletes the param (`:57-65`), and StrictMode's double-mount re-runs the initializer after the param is gone.
- **Why it still matters despite being dev-only:** every person developing, QA'ing or demoing this app does so in `npm run dev`. A whole flyout that silently does nothing there is a standing trap — this audit lost a full capture pass to it and very nearly filed it as a top-severity user-facing bug. Making the param survive the second mount (or driving the sub-view from the route, per Section D) removes the divergence.

**A5 — The Screens flyout mixes four different kinds of thing in one undifferentiated list** · Severity: **Medium**
- **What was measured:** The flyout's rows, in order: `Display Manager` (a different section), the five screen records, `Add screen` (a create action), then a `RECENTLY OPENED` group (`23-flyout-screens.png`).
- **What this costs:** A navigation destination, a record list, a create action and a history list are stacked as visually identical rows. Only the screen records carry a chevron. "Add screen" in particular reads as a sixth screen named "Add screen" until you notice it has no chevron.

**A6 — "Recently opened" re-lists an item already visible four rows above it** · Severity: **Low**
- **What was measured:** The Screens flyout lists `Skjerm 1` as a screen record and again under `RECENTLY OPENED` (`23-flyout-screens.png`); the harness read both rows in the same capture: `["Display Manager","Screen 2","Screen 3 (verify)","Test screen","Skjerm 1","[usage test] all panes (3)","Add screen","Skjerm 1"]`.
- **What this costs:** With only five screens, the whole list already fits, so the recents group adds a duplicate and no shortcut. It earns its place once the record count exceeds what the flyout can show; below that it should be suppressed.

---

## B. Visual layout & width consistency

This is the section that most directly matches the "sometimes full width or not wide enough" complaint. The measurements say the answer is **always full width, and nothing is constrained** — the perception of inconsistency comes from that single rule producing wildly different results depending on what a view happens to contain.

**B1 — There is no content max-width anywhere in the dashboard** · Severity: **High**
- **What was measured:** The one shared wrapper, `.admin-dashboard__content` (`AdminDashboard.scss:74-79`), is `flex: 1; padding: …; min-width: 0; overflow-x: hidden` — no `max-width`. A grep for `max-width` across `src/features/admin/**/*.scss` returns only the assistant panel's bubbles (85%), `PublishApkControl.scss:61` (420px), `AdminLogin.scss:13` (360px) and media-query breakpoints. **No admin view constrains its own content width.**
- **What this costs:** Every view stretches to whatever the display is. Line lengths, form fields and list rows all scale without limit, which is what produces B2 and B3 below. This one missing rule is the root cause of most of this section.

**B2 — Form controls stretch to ~1750px to hold a dozen characters** · Severity: **High**
- **What was measured** (1920px viewport, exact `getBoundingClientRect()` widths):
  - Store settings → "Store name": a **1750px** `input` holding `Wraps & Coffee`.
  - Store settings → "Slogan": a **1750px** empty `input`.
  - Display Manager → "Max image resolution": **1750px** `select` per display, ×5 displays.
- **What this costs:** The field's size stops communicating anything about the expected input, and the label at the far left is ~1700px from the value's right edge. Compare the same page's own "Screen assignment" select, which sits at a sane **297px** — so the page already contains both treatments side by side.
- **Screenshots:** `11-settings-store.png`, `16-screens-displaymanager.png`.

**B3 — List rows put the name and its actions at opposite ends of the display, and the gap grows with the monitor** · Severity: **High**
- **What was measured** — horizontal gap between the end of the item's name and the start of its first action button, on the Products catalogue list, same row (`Food menu`), three viewports:

  | Viewport | Row width | Gap from name to "Edit" |
  | --- | --- | --- |
  | 1280px | 1144px | **831px** |
  | 1920px | 1784px | **1471px** |
  | 2560px | 2424px | **2111px** |

  Users shows the same shape: **1419px** between `admin` and "Reset password" at 1920px.
- **What this costs:** The gap scales linearly with the display — a bigger monitor makes the UI measurably harder to use, not easier, because reading a row means traversing the full width to connect a name to its buttons. This is the concrete mechanism behind "not so easy to navigate" on a wide screen.
- **Screenshots:** `03-products.png` (1920), `26-products-1280.png`, `27-products-2560.png`, `09-users.png`.

**B4 — Destructive actions are styled identically to safe ones** · Severity: **Medium**
- **What was measured:** On Products, "Delete" renders in the same green outlined treatment as "Edit" (`03-products.png`). On Users, "Delete" matches "Reset password" (`09-users.png`). On Message board, a board's "Edit" and "Delete" are both small underlined text links of identical size and weight (`07-messageboard.png`).
- **What this costs:** Nothing in the visual hierarchy distinguishes an irreversible action from a reversible one. Message board is the sharpest case: the delete affordance for an entire board is a ~40px underlined micro-link sitting directly beneath the board's tab.

**B5 — A record with no English name renders as a blank, unidentifiable row that still offers Edit and Delete** · Severity: **Medium** *(real defect)*
- **What was measured:** With the interface in English, the Products list shows an empty second row — name area blank, chevron, Edit and Delete all present and functional (`03-products.png`, `27-products-2560.png`). The record is the `AutoDeler` catalogue, whose `name.en` is `""` while `name.no` is `"AutoDeler"`.
- **Why this is a real finding and not fixture noise:** the fixture supplies the empty value, but the *app* chooses to render it as nothing. A missing translation should fall back to the other language, or to an explicit placeholder — not produce an anonymous row whose Delete button the admin cannot safely identify. Any store that adds a catalogue/category while in one language and later views the dashboard in the other reproduces this.

**B6 — Three different affordances for "create", two of them on the same page** · Severity: **Medium**
- **What was measured:** Products/Users/Events use a filled green button, top-right (`Add catalogue`, `Add user`). Display Manager uses a plain `+ Add display` text link, inline under the description. Message board uses **both at once**: `+ New board` as a text link, then `+ New post` as a filled green button, roughly 130px apart vertically.
- **What this costs:** The visual weight of a create action carries no consistent meaning, so it can't be learned. Message board demonstrates the problem within a single screenshot.
- **Screenshots:** `03-products.png`, `16-screens-displaymanager.png`, `07-messageboard.png`.

**B7 — Sparse views stretch a handful of controls across the full width, leaving very large empty regions** · Severity: **Low**
- **What was measured:** Overview renders three stat cards (~580px each) and one "Top sellers" card spanning the full 1780px to hold a single italic sentence, with roughly 600px of empty page below (`01-overview.png`). Settings renders each setting as a full-width 1780px card whose actual content is a 180px button or a pair of toggle chips (`10-settings.png`). Users at 1920px is one row on an otherwise empty page (`09-users.png`).
- **What this costs:** This is the "not wide enough / too wide" feeling from the other direction — the content isn't too small, the container is unbounded, so sparse pages read as unfinished.

**B8 — The "Add screen" form gives its largest visual element to a preview and leaves its aspect-ratio control unlabeled** · Severity: **Low**
- **What was measured:** `17-screens-new.png` — heading "Add screen", a full-width Name input, then an unlabeled row of five chips (`16:9`, `9:16`, `4:3`, `3:4`, `21:9`), then a very large live preview, then four full-width navigation rows (Steps / Transitions / Screen saver / Other settings), then Cancel/Save pinned bottom-right.
- **What this costs:** The five chips have no label or legend explaining that they set the screen's aspect ratio. The four bottom rows are the form's remaining sections but look like unrelated list items.

---

## C. Terminology & phrasing consistency

**C1 — The create verb is "Add" in 14 places, "New" in 2, and "Create" in 1** · Severity: **Medium**
- **What was measured** — every English label that opens a create flow, by i18n key:

  | Verb | Keys | English label |
  | --- | --- | --- |
  | **Add** (dominant) | `admin.products.addProduct` / `.addCatalogue` / `.addCategory` / `.addCustomField`, `admin.events.addEvent`, `admin.store.addLogo`, `admin.appearance.addTheme` / `.addColor`, `admin.screens.addScreen`, `admin.displayManager.addDisplayButton`, `admin.common.addLanguage`, `admin.mediaLibrary.addButton`, `admin.users.addUser`, `screenDisplay.addStageButton` | "Add product", "Add catalogue", "Add screen", "Add user", "Add display", … |
  | **New** | `admin.messageBoard.addBoard`, `admin.messageBoard.addPost` | "New board", "New post" |
  | **Create** | `admin.settings.backup.createTitle` / `.createButton` | "Create backup" |
- **On the specific "Add Screen" → "Create Screen" preference:** the concern is well-founded, and the reason is sharper than style. "Add" is the right verb for attaching an existing thing to a collection (add a logo, add an image, add a language, add a display that has registered itself). It is the *wrong* verb for bringing a new configured object into existence, which is what `admin.screens.addScreen` actually does — it opens an empty form to author a screen. The same argument applies to `addProduct`, `addCatalogue`, `addCategory`, `addEvent`, `addUser`, `addTheme`. Note that the two keys named `addBoard`/`addPost` already display "New", so the key names have drifted from the labels regardless.
- **Recommendation:** use **Create** for authoring a new record (Create screen, Create product, Create event, Create user), and keep **Add** only where something existing is being attached (Add logo, Add image/video, Add language, Add display). Then rename the keys to match so the two stop diverging.

**C2 — At least six different nouns are in play for the physical display, five of them in one sentence** · Severity: **High**
- **What was measured** — the Display Manager description (`admin.displayManager.description`, `languages.json:1151`) reads:
  > "Every **machine** or browser **tab** that's registered itself as a **display**, and which **Screen** (if any) each of its **monitors** currently shows. A Companion app appears below for approval a few seconds after it's opened on the **TV**."

  Six terms for two underlying concepts, in two sentences. The same page then labels a registered device's badge `admin.displayManager.electronBadge` = **"Kiosk machine"** while the field naming that same device is **"Display name"**.
- **Across the rest of the English copy**, for the same concept:

  | Term | Example key(s) |
  | --- | --- |
  | "kiosk displays" | `admin.screens.description` ("the fullscreen kiosk displays around the store") |
  | "kiosk screens" | `admin.store.description`, `admin.messageBoard.description`, `admin.settings.backup.restoreHint`, `admin.integrations.weatherSearchDescription` / `.transitSearchDescription` |
  | "kiosk screen" (singular) | `admin.settings.developerDocs.keyScreens`, several `admin.integrations.*` descriptions |
  | "kiosk display" (singular) | `admin.integrations.newsIntro`, `admin.settings.advanced.windowLaunchMethodText`, `.launchMethodLegend` |
  | "screen displays" | `admin.appearance.description` ("fonts for the screen displays") |
  | "Screen-display" | `admin.store.appearanceHint`, `admin.settings.developerDocs.keyAppearanceThemes` |
  | "the TV" / "TV remote" / "Android TV displays" | `admin.displayManager.description`, `.keyDisplayScreenOverride`, `.updateChannelIntro` |
- **Why this one is High:** this app has **two genuinely distinct concepts** that need distinct names — a *Screen* (a saved content configuration) and a *Display* (a physical machine/monitor showing one). The current copy uses "screen" and "display" for both, in both directions, which means the terminology actively obscures the product's central distinction rather than merely being untidy.
- **Recommendation:** fix the concepts first, then the words. Reserve **Screen** exclusively for the content configuration and **Display** exclusively for the physical device; replace every "kiosk display"/"kiosk screen"/"screen display"/"Screen-display"/"kiosk machine"/"the TV" with whichever of those two it actually means.

**C3 — "Step" and "Stage" are used interchangeably in English for the same feature — and Norwegian gets it right** · Severity: **High**
- **What was measured** — the same underlying concept (a screen's rotating content stages), in English:

  | Says "step" | Says "stage" |
  | --- | --- |
  | `admin.screens.stagesLabel` "Steps" | `admin.screens.applyToEveryStageButton` "Apply to every stage" |
  | `admin.screens.useStagesLabel` "Use steps" | `admin.screens.videoAdvanceStageOnEndLabel` "Advance to next stage when this video ends" |
  | `admin.screens.stageCountLabel` "Number of steps" | `admin.screens.videoRestartOnStageOneLabel` "Restart when back at stage 1" |
  | `admin.screens.stageCountBadge` "{{count}} steps" | `screenDisplay.previousStage` "Previous stage" / `screenDisplay.nextStage` "Next stage" |
  | `screenDisplay.stageIndicator` "Step {{current}} of {{total}}" | `admin.screens.paneCustomContent.cssScopeHint` "…regardless of which stage is showing" |
  | `screenDisplay.addStageButton` "Add step", `screenDisplay.stageScrubberLabel` "Jump to step", `screenDisplay.textSizeEditor.stageTabLabel` "Step {{number}}" | `admin.screens.videoAdvanceStageOnEndHint`, `.videoRestartOnStageOneHint` |
- **The decisive detail:** Norwegian uses **"steg"** for every one of these keys, with no drift at all. `screenDisplay.nextStage` is "Neste steg", `applyToEveryStageButton` is "Bruk på hvert steg", `stagesLabel` is "Steg". So this is purely English copy drift from the internal `stage` identifier — a UI editor sees "Steps" in the section header and "Previous stage" on the control inside it, describing the same thing.
- **Recommendation:** pick one English word (the visible labels already lean "Step") and apply it to all ~18 keys. Leave the code identifiers alone — the Norwegian side proves the internal name doesn't have to leak.

**C4 — The exact same Norwegian string labels two different actions** · Severity: **High**
- **What was measured:**
  - `admin.screens.addScreen` → EN "Add screen" / NO **"Legg til skjerm"** — creates a *Screen* (a content configuration).
  - `admin.displayManager.addDisplayButton` → EN "Add display" / NO **"Legg til skjerm"** — registers a *Display* (a physical device).
- **What this costs:** English at least distinguishes them ("screen" vs "display"). Norwegian does not distinguish them **at all** — two byte-identical labels for two unrelated operations in two different sections. A Norwegian-language admin has no way to tell from the button which one they're about to do. This is C2's concept collision, made total by translation.
- **Recommendation:** settle C2's Screen/Display distinction, then give the Norwegian side two distinct words (e.g. *skjermoppsett* / *skjermenhet*, or keep *skjerm* for one concept and use *enhet*/*visningsenhet* for the other).

**C5 — A nav item and the page it opens have different names** · Severity: **Low**
- **What was measured:** `admin.nav.media` is **"Media"**; the page it opens is headed `admin.mediaLibrary.title` = **"Media library"**. (Checked across the other nine: Overview, Messages, Products, Events, Orders, Screens, Message board, Users, Settings all match their headings; Media is the only mismatch.)

---

## D. Proposed navigation & routing changes

Offered as options, not decisions — each addresses a specific finding above.

**D1 — Give every sub-view a real route.** Today one address, `/admin/dashboard/settings`, serves the Settings index, five sub-views and two third-level editors (A3), with `?view=` stripped on arrival and Back re-implemented by hand. Proposed:

| Today | Proposed |
| --- | --- |
| `/admin/dashboard/settings` + stripped `?view=store` | `/admin/dashboard/settings/store` |
| …then "Edit contact info" (no URL) | `/admin/dashboard/settings/store/contact` |
| …then "Edit appearance" (no URL) | `/admin/dashboard/settings/store/appearance` |
| `?view=integrations` / `advanced` / `backup` / `developers` | `/admin/dashboard/settings/{integrations,advanced,backup,developers}` |
| `screens?displayManager=1` | `/admin/dashboard/displays` (see D2) |
| `screens?screenId=X&tab=stages` | `/admin/dashboard/screens/:screenId/steps` |
| `products?catalogueId=X&categoryId=Y` | `/admin/dashboard/products/:catalogueId/:categoryId` |

This makes every view bookmarkable and shareable, lets refresh land where the admin was, removes the need for the `useBackLevel` shim, enables real breadcrumbs, and dissolves A4 entirely (a route can't be lost to a double-mount the way a stripped query param can). It is the largest change proposed here and would touch each deep-linkable view plus `useGlobalSearchIndex`, which builds its result URLs to match what each view's effect expects.

**D2 — Promote Displays to a top-level nav item**, separate from Screens (A2). Two top-level entries — **Screens** (content configurations) and **Displays** (physical devices) — mirror the product's actual two concepts and would reinforce the C2 vocabulary fix rather than fighting it. Integrations similarly reads as a top-level concern rather than a Settings row.

**D3 — Separate the flyout's row types** (A5): keep record lists as the flyout's body, move "Add screen" to a visually distinct footer action, and move "Display Manager" out entirely once D2 lands. Suppress "Recently opened" when the full list already fits (A6).

**D4 — Add one content max-width and one row-layout rule** (B1–B3). A `max-width` on `.admin-dashboard__content` (~1200–1400px for reading/forming views, with list-heavy views free to opt out) plus a cap on how far a list row's actions drift from its label would resolve B2, B3 and B7 together, at one shared rule rather than per view. This is the highest ratio of perceived improvement to code touched of anything in this report.

---

## Key findings summary

1. **One missing CSS rule causes most of the "layout feels wrong" complaint.** `.admin-dashboard__content` (`AdminDashboard.scss:74-79`) sets no `max-width`, and no admin view sets its own. Confirmed by B1, and it is the direct mechanism behind B2 (1750px inputs holding 14 characters), B3 (a name-to-button gap that grows from 831px to 2111px as the monitor gets wider) and B7 (sparse pages reading as unfinished). **Suspected root cause:** the shared wrapper was written to fill available space with no upper bound, so every view inherits "as wide as the monitor" as its layout. Fixing it once (D4) addresses four findings.
2. **The product has two concepts — a Screen and a Display — and the copy does not consistently distinguish them.** Confirmed by C2 (six nouns, five in one sentence), C4 (identical Norwegian label for both actions), and structurally by A2 (Display Manager filed as a sub-row of Screens). **Suspected root cause:** "screen" and "display" entered the vocabulary as synonyms before the two concepts had separated in the product, and the copy was never revisited afterward. This is a vocabulary decision to settle first, then apply to `languages.json` and to the nav (D2) — not a set of independent wording nits.
3. **The English copy drifts where the Norwegian copy does not.** C3 finds ~18 keys split between "Step" and "Stage" for one feature while Norwegian uses "steg" throughout; C1 finds Add/New/Create split 14/2/1. **Suspected root cause:** English strings were written incrementally alongside the code and absorbed internal identifiers (`stage`, `add`), while the Norwegian strings were translated in passes against the visible UI and stayed uniform. Worth noting that the *translated* language is the more consistent one here.
4. **Navigation depth is unaddressable and partly invisible.** A2 (three sections with no nav presence), A3 (three levels sharing one URL), A5/A6 (four kinds of row in one flyout). **Suspected root cause:** sub-views were built as local component state with query params bolted on afterward, rather than as routes — which is also why A4's dev-only breakage was possible at all.
5. **Action styling doesn't encode consequence.** B4 (Delete styled identically to Edit across three sections; a board's Delete is an underlined micro-link) and B6 (three different create affordances, two on one page). Low individually, but together they mean visual weight can't be trusted to mean anything.
6. **What held up well, independent of the above.** No view had horizontal overflow at 1280px, 1920px or 2560px (`overflow=false` on all 23 captures). Every top-level nav destination resolved correctly. Deep links other than Settings' (`?displayManager=1`, `?screenId=&tab=`, `?catalogueId=&allProducts=1`) worked on direct load. Nine of ten nav labels match their page headings. The tier-2/tier-3 flyout mechanism itself — scrim, hover timing, expand/collapse — behaved correctly throughout, including the tier-3 per-screen submenu.

## Cleanup performed

None required — this audit was read-only. No app data, code, or configuration was modified; the three Playwright scripts only navigate, measure and screenshot. `npm run build` wrote to `dist/` (gitignored). The dev server started for the first pass was stopped when the run moved to `npm run preview`.

**Note on B5:** the blank Products row is caused by the pre-existing `AutoDeler` fixture's empty `name.en`. It was left in place deliberately — it is the reproduction case for that finding, and the standing QA convention is to keep the seed fixture rather than tear it down.
