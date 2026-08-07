# ADHDisplay server installer — end-to-end reference

Scope: the **ADHDisplay server** installer only (the kiosk-PC admin dashboard +
local server app). The separate "ADHDisplay Companion" installer
(`installer/adhdisplay-companion.iss`, `installer/start-adhdisplay-companion.bat`,
`.github/workflows/build-companion-installers.yml`) is a structurally parallel but
independent installer for a different app and is out of scope, except where it
shares a resource or a risk with this one (noted inline).

Read-only analysis. No installer files were modified and nothing was executed —
every behavioural claim is either backed by a `file:line` citation or explicitly
marked **INFERRED**, with what would confirm it.

## Installer surface (all files read in full)

| File | Lines | Role |
|---|---|---|
| `installer/adhdisplay.iss` | 299 | Main Inno Setup script — build recipe + install/uninstall logic |
| `installer/start-adhdisplay.bat` | 151 | Logon-time watchdog: starts Ollama + the server, opens the kiosk window, restarts the server if it stops responding |
| `installer/open-in-browser.bat` | 15 | Start Menu shortcut target — opens the admin login page in the default browser |
| `installer/print-qr.cjs` | 13 | Node/CJS helper invoked by `start-adhdisplay.bat` to print a terminal QR code of the LAN admin URL |
| `.github/workflows/build-installer.yml` | 41 | CI pipeline that compiles `adhdisplay.iss` into `ADHDisplaySetup.exe` |
| `installer/linux/install.sh` | 154 | Linux/Raspberry Pi counterpart (bash, not Inno Setup) |
| `installer/linux/uninstall.sh` | 77 | Linux counterpart uninstaller |
| `installer/node-lts-x64.msi` | — | Third-party binary, deliberately **not committed** (`adhdisplay.iss:7-9`); downloaded fresh by CI or a developer before compiling |

Not present anywhere in this surface: WiX/MSI sources, electron-builder/forge
config, PowerShell-based bootstrappers, nssm/node-windows/winsw service wrappers,
or any Node post-install script beyond `print-qr.cjs` (a QR-printing utility, not
an installer step).

---

## 1. Installer topology

**Technology:** Inno Setup **6.3+** (`adhdisplay.iss:2`), a script-driven Windows
installer compiler. No custom Pascal wizard pages are used — only the two built-in
Scripting Events `InitializeSetup` and `CurStepChanged` (`adhdisplay.iss:111`,
`:167`).

**Build pipeline (source → `ADHDisplaySetup.exe`):**
1. A developer/CI checks out the repo and places `node-lts-x64.msi` next to
   `adhdisplay.iss` (`adhdisplay.iss:7-9`).
2. `.github/workflows/build-installer.yml` — manually triggered
   (`workflow_dispatch`, `build-installer.yml:10-11`), runs on `windows-latest`:
   - `choco install innosetup` (`build-installer.yml:21`)
   - downloads the current Node LTS x64 MSI from `nodejs.org/dist/index.json`
     into `installer/node-lts-x64.msi` (`build-installer.yml:23-30`)
   - `ISCC.exe installer\adhdisplay.iss` (`build-installer.yml:32-34`)
   - uploads `installer/Output/ADHDisplaySetup.exe` as a CI artifact
     (`build-installer.yml:36-40`)
3. No `npm run`-level script invokes ISCC — the compile step exists only in this
   one workflow (confirmed by searching `package.json` and the repo root for any
   other build/package script).

**Important architectural point that shapes almost everything below:** this app is
**not bundled**. `npm run build` (`package.json`'s `build` script) only builds the
Vite frontend into `dist/` — there is no server bundling step. The server always
runs from TypeScript source via `tsx` (`package.json`'s `preview`/`preview:kiosk`
scripts run `tsx server/index.ts`). Consequently the installer's `[Files]` section
ships raw source (`src/`, `server/`, `electron/`, `public/`, `package.json`,
`vite.config.ts`, etc.) and the **installer itself runs `npm install` and
`npm run build` on the target machine** (`adhdisplay.iss:209-228`) rather than
shipping a pre-built artifact.

**Execution order (chronological, build → first launch):**

| Phase | When | What runs |
|---|---|---|
| Build time | Developer/CI, before `ADHDisplaySetup.exe` exists | Inno Setup compiler (`ISCC.exe`) packages `[Files]` + embeds the `[Code]` Pascal script |
| Setup start | User double-clicks the built `.exe` | UAC elevation (`PrivilegesRequired=admin`, `adhdisplay.iss:32`) → `InitializeSetup` (existing-install check, `:111`) → wizard pages (dir picker, `[Tasks]` checkboxes) |
| `ssPostInstall` step | After files are copied, before Finish page | `CurStepChanged`: install Node.js if missing → optional Defender exclusion → optional `repair` wipe → `npm install` → `npm run build` → optional `schtasks.exe` autostart registration (`:167-241`) |
| `[Run]` | Immediately after `ssPostInstall`, still inside Setup | Firewall rules opened (`:252`, `:260`); `start-adhdisplay.bat` launched via `shellexec nowait` if the user leaves "Launch ADHDisplay now" ticked (`:265`) |
| First/every logon | Every subsequent Windows logon (if `autostart` was selected) | Task Scheduler fires `ADHDisplayLauncher` → `start-adhdisplay.bat` → Ollama (best-effort) → `npm run preview:kiosk` (the actual server + frontend) → kiosk window (Electron or Edge) → infinite health-check watchdog |

---

## 2. Function inventory

### `installer/adhdisplay.iss` — Pascal `[Code]` section

| Function/procedure | file:line | Invoked by | What it does | Side effects | Failure behaviour / idempotency |
|---|---|---|---|---|---|
| `NodeIsInstalled` | `adhdisplay.iss:64-67` | `[Files]`'s `Check:` on the MSI entry (`:55`); `CurStepChanged` (`:174`) | Returns whether `HKLM\SOFTWARE\Node.js` exists | None (read-only registry query) | N/A — pure query, idempotent |
| `StopRunningProcesses` | `adhdisplay.iss:85-103` | `InitializeSetup`'s `IDYES` branch (`:132`) | Kills whatever owns TCP 4000/4173 (graceful `Stop-Process`, then `-Force` after 1.5s), and separately force-kills this app's own `electron.exe` by matching full executable path | Terminates running processes; no files/registry touched | Best-effort — every `Stop-Process` call uses `-ErrorAction SilentlyContinue`, so it never throws even if nothing is running. Idempotent: safe to call with nothing listening. |
| `InitializeSetup` | `adhdisplay.iss:111-142` | Inno Setup itself, automatically, before the first wizard page | Looks up the fixed AppId's uninstall registry key; if found, prompts Yes/No/Cancel — Yes stops running processes and falls through to a normal in-place update, No silently re-launches the *existing* uninstaller with `/SILENT /NORESTART /SUPPRESSMSGBOXES` then continues installing over it, Cancel aborts Setup | Reads registry (`RegQueryStringValue`); on No, executes the old uninstaller as a side effect before continuing | Not idempotent in the sense that re-running Setup always re-triggers this prompt on any existing install — but each of the three branches is itself safe to repeat. Only checks *presence* of the uninstall key, not the installed version, so it cannot distinguish an upgrade from a downgrade or reinstall of the same version (see Findings §6). |
| `NodeBinDir` | `adhdisplay.iss:147-159` | `CurStepChanged` (`:209`) | Resolves npm's full path from `HKLM\SOFTWARE\Node.js\InstallPath`, falling back to `{pf}\nodejs\` | None (read-only) | Falls back safely if the registry key is absent; not itself capable of failing (no `Exec`/`Abort`) |
| `CurStepChanged` | `adhdisplay.iss:167-242` | Inno Setup itself, automatically, once per step; body only runs `if CurStep = ssPostInstall` | Installs Node.js via silent `msiexec` if missing; optionally adds a Defender exclusion; optionally wipes `node_modules`/`dist` (`repair` task); runs `npm install`; runs `npm run build`; optionally registers the `ADHDisplayLauncher` scheduled task | Installs Node.js system-wide; deletes `{app}\node_modules`/`{app}\dist` if `repair` ticked; writes Defender exclusion prefs; runs arbitrary `npm` lifecycle scripts; creates a Task Scheduler task | **Aborts** Setup (`Abort` + `MsgBox mbError`) if Node install, `npm install`, or `npm run build` fail (checks `ResultCode <> 0` explicitly — the script's own comment at `:161-166` notes this exists specifically because plain `[Run]` entries don't check exit codes). Defender-exclusion failure and autostart-task-registration failure are **not** fatal — only a `mbInformation`/silent best-effort. Re-running `npm install`/`npm run build` on an already-built tree is idempotent by npm's own semantics; `repair`'s `DelTree` is explicitly a no-op if the target doesn't exist (`:201`). |

### `installer/start-adhdisplay.bat` — batch labels

| Label | file:line | Invoked by | What it does | Side effects | Failure behaviour |
|---|---|---|---|---|---|
| (top-level script body) | `:1-35` | Task Scheduler (`ADHDisplayLauncher`, `ONLOGON`) or the installer's own `[Run]` "Launch ADHDisplay now" | Orchestrates the boot sequence: start Ollama, start server, wait healthy, read `window-launch-method`, launch the kiosk window, print LAN URL/QR | Spawns child processes; reads `%APPDIR%\logs` | No error handling around the top-level sequence itself — relies on each `call`ed label's own behaviour |
| `:launch_window` | `:84-95` | Top-level body (`:35`) | Branches to Electron or Edge-kiosk based on `LAUNCH_METHOD` (from `GET /window-launch-method`) or, if unset/unreachable, whether `node_modules\electron\dist\electron.exe` exists | None beyond the branch itself | N/A |
| `:launch_window_electron` | `:97-100` | `:launch_window` | `start`s `npm run start:electron`, logging to `logs\electron.log` | Spawns a detached window | Not verified to succeed — fire-and-forget `start` |
| `:launch_window_edge` | `:102-109` | `:launch_window` | Launches `msedge --kiosk` in fullscreen kiosk mode | Spawns a detached window | Not verified to succeed |
| `:start_ollama` | `:111-125` | Top-level body (`:22`) | Best-effort: skips if `localhost:11434/api/tags` already responds; skips if `ollama` isn't on `PATH`; otherwise starts `ollama serve` in the background | Spawns a background process, writes `logs\ollama.log` | Silent no-op if Ollama isn't installed — by design (`:117-118`) |
| `:start_server` | `:127-133` | Top-level body (`:23`); `:server_watchdog` on restart (`:78`) | Starts `npm run preview:kiosk` (i.e. `vite preview --host` + `tsx server/index.ts` via `concurrently --kill-others`) in the background | Spawns a background process, writes `logs\server.log`; binds TCP 4000 and 4173 | Fire-and-forget `start` — no immediate success check (that's what `:wait_until_healthy`/`:check_health` are for) |
| `:wait_until_healthy` | `:135-141` | Top-level body (`:26`); `:server_watchdog` (`:79`) | Polls `:check_health` every 2s until it succeeds | None | Loops forever — no timeout/give-up path |
| `:check_health` | `:143-151` | `:wait_until_healthy`, `:server_watchdog` | HTTP GET on `http://localhost:4173/admin/login` via PowerShell, 3s timeout | None (read-only probe) | Returns the PowerShell process's exit code as this label's own; no logging of *why* a check failed |
| `:server_watchdog` | `:61-82` | Falls through from the top-level body after startup (`:60-61`) | Infinite loop: every 10s, `:check_health`; on **two consecutive** failures (5s apart), force-kills whatever owns ports 4000/4173 and calls `:start_server` + `:wait_until_healthy` again | Kills processes, restarts the server | Never exits — this is the app's entire "keep it running" mechanism in place of a real Windows service's recovery settings |

### Other scripts

| Script | file:line | Invoked by | What it does | Side effects |
|---|---|---|---|---|
| `installer/open-in-browser.bat` | 1-15 | Start Menu shortcut "`ADHDisplay (Open in Browser)`" (`adhdisplay.iss:297`) | Queries `GET localhost:4000/server-info` for the LAN IP, opens `http://<lanIp-or-localhost>:4173/admin/login` in the default browser | Spawns the default browser |
| `installer/print-qr.cjs` | 1-13 | `start-adhdisplay.bat:54` (`node print-qr.cjs <url>`) | Prints a terminal QR code of the given URL via the `qrcode-terminal` package | stdout only |

---

## 3. Option inventory

| Option | Type | Default | Presented at | Consumed at | Effect | Silent/unattended equivalent |
|---|---|---|---|---|---|---|
| Install directory | Wizard dir-picker | `C:\ADHDisplay` (`DefaultDirName`, `adhdisplay.iss:29`) | Wizard's Select Destination page (`DisableDirPage=no`, `:30`) | Every `{app}`-prefixed path in `[Files]`/`[Dirs]`/`[Code]`/`[Run]`/`[UninstallDelete]` | Root of the install; also indirectly determines where the sibling `ADHDisplayBackup` folder resolves to (see §5/§6) | INNO SEMANTIC: settable unattended via `/DIR="X:\path"` on the command line — not defined in this script but a built-in Inno Setup switch. Not exercised anywhere in this repo. |
| `autostart` task | Checkbox | **Checked** (no `unchecked` flag, `adhdisplay.iss:290`) | `[Tasks]` wizard page | `CurStepChanged` (`:233-239`, registers `schtasks.exe ... ADHDisplayLauncher`) | Whether the app launches automatically at every Windows logon | INNO SEMANTIC: `/TASKS="autostart"` or `/TASKS="!autostart"` on the command line. Not otherwise configurable (no env var/config file). |
| `desktopicon` task | Checkbox | Unchecked (`Flags: unchecked`, `:291`) | `[Tasks]` wizard page | `[Icons]`'s last entry (`:299`, `Tasks: desktopicon`) | Whether a desktop shortcut to `start-adhdisplay.bat` is created | Same `/TASKS=` mechanism |
| `defenderexclusion` task | Checkbox | Unchecked (`:292`) | `[Tasks]` wizard page | `CurStepChanged` (`:189-196`) | Adds `Add-MpPreference -ExclusionPath` for `{app}` and `%localappdata%\npm-cache` | Same `/TASKS=` mechanism |
| `repair` task | Checkbox | Unchecked (`:293`) | `[Tasks]` wizard page | `CurStepChanged` (`:202-207`) | Deletes `node_modules`/`dist` before reinstalling, forcing a from-scratch `npm install`/`npm run build` | Same `/TASKS=` mechanism |
| Existing-install prompt (Yes/No/Cancel) | `MsgBox` | N/A — always shown when a prior install is detected | `InitializeSetup` (`:120-122`) | Same function | Governs uninstall-first vs. install-over vs. abort | **No silent equivalent exists in this script.** See Finding in §6 — `MsgBox` is not gated behind any `WizardSilent()`/`UsePreviousData`-style check, which is a real gap for unattended installs on a machine with a prior install present. |
| "Launch ADHDisplay now" | `[Run]` postinstall checkbox | Checked by default (Inno semantic: `postinstall` entries default to checked unless `unchecked` is added) | Finish page | `[Run]:265` | Whether Setup launches `start-adhdisplay.bat` immediately after install | `Flags: ... skipifsilent` already means this step is automatically skipped (not defaulted) under `/SILENT`/`/VERYSILENT` — the app simply won't auto-launch post-install in a silent run; the scheduled task (if `autostart` was selected) still launches it at next logon |
| `WS_PORT` | Env var | `4000` (`server/index.ts:45`) | Not exposed by the installer at all — an app-level override | `server/index.ts:45`, `httpServer.listen(PORT, ...)` | Overrides the sync/API port | Settable only by hand-editing how the server process is launched (e.g. editing `start-adhdisplay.bat` or the scheduled task's environment) — **the installer exposes no UI or task for this.** Flagged in §6 as an option that exists at the app layer but is unreachable from the installer surface. |
| `CONTENT_PORT` | Hardcoded constant | `4173` (`server/index.ts:47`) | N/A — not an option | Vite preview / firewall rule (`adhdisplay.iss:252`) | The port screens/content links point at | Not configurable at all, by installer or env var — hardcoded end to end |
| `NEON_DATABASE_URL` | Env var | `null` (`server/store.ts:369`) | Not exposed by the installer | `server/store.ts:356-369` | Overrides the app's own editable Neon connection-string setting | Same gap as `WS_PORT` — app-level only, no installer surface |
| `WEATHER_USER_AGENT` | Env var | `'adhdisplay-kiosk (self-hosted cafe display)'` (`server/integrations.ts:8`) | Not exposed by the installer | `server/integrations.ts:243`, MET Norway API calls | Identifies the app to the weather API | Same gap |
| Window launch method | Dashboard setting (`Settings → Advanced`), read via `GET /window-launch-method` | `"auto"` (`server/index.ts:1758-1761`, `DEFAULT_WINDOW_LAUNCH_SETTINGS`) | Admin dashboard UI, **not** the installer | `installer/start-adhdisplay.bat:32-33`, `:launch_window` (`:84-95`) | Whether the kiosk boots into the Electron window or an Edge kiosk window | This is the one "installer-adjacent" option that **is** settable post-install without touching the installer — via the running app's own Settings UI. Not present at install time at all (Electron-vs-Edge is auto-detected on first boot per `:94`). |

**Flagged — defined but effectively unreachable:** `WS_PORT`, `NEON_DATABASE_URL`,
`WEATHER_USER_AGENT` are real, functioning env-var overrides in the server code,
but the installer provides no UI, task, `.ini` file, or documented mechanism to set
them — a deployer would have to manually edit `start-adhdisplay.bat`'s `start
"ADHDisplayServer" ... cmd /c "npm run preview:kiosk ..."` line (`:132`) or the
`schtasks.exe` task definition to inject them.

**Is a fully silent/unattended install currently possible?** **No**, for a machine
with a prior ADHDisplay install already registered — `InitializeSetup`'s `MsgBox`
(`:120-122`) has no silent-mode guard (INFERRED: per Inno Setup's own documented
semantics, `MsgBox` calls in `[Code]` are shown regardless of `/SILENT`/
`/VERYSILENT` unless the script itself checks `WizardSilent()` and skips the call
— this repo's script does not perform that check; confirming this would require
running the compiled installer with `/VERYSILENT` against a machine with a prior
install and observing whether it blocks on the dialog). On a genuinely fresh
machine, the rest of the flow (elevation aside) appears silent-install-compatible:
`[Tasks]` are settable via `/TASKS=`, `[Dirs]`/`[Files]` need no interaction, and
`CurStepChanged`'s own `MsgBox` calls only fire on failure paths.

---

## 4. System surface

**Install paths / data directories:**
- Install root: `{app}` = `C:\ADHDisplay` by default (`adhdisplay.iss:29`), user-changeable via the wizard's dir page.
- App source (`src/`, `server/`, `public/`, `electron/`, plus root config files) lives directly under `{app}` (`adhdisplay.iss:41-51`).
- `{app}\server\data` and `{app}\server\uploads` — created empty by `[Dirs]` (`:60-61`) since their real (gitignored) contents are excluded from `[Files]` (`:42`'s `Excludes: "data\*,uploads\*"`); populated at runtime by `server/store.ts:16-20` and `server/uploads.ts:10-12`, which resolve these paths relative to the server module's own location — i.e. **inside the install root**, not `%APPDATA%`/`%LOCALAPPDATA%`.
- `{app}\node_modules`, `{app}\dist` — generated by `npm install`/`npm run build` at install time (`adhdisplay.iss:209-228`), not shipped in `[Files]`.
- `{app}\logs` — created on demand by `start-adhdisplay.bat:17` (`if not exist logs mkdir logs`); holds `server.log`, `electron.log`, `ollama.log`.
- **Persists outside the install root:** the backup mirror at `<parent of {app}>\ADHDisplayBackup` (e.g. `C:\ADHDisplayBackup` for the default install dir) — a live, near-real-time (debounced ≤1s, `server/backup.ts:80`) copy of `server\data`/`server\uploads`, resolved as a sibling of `{app}` by `server/backup.ts:19-20` specifically so deleting the install folder can't take the backup with it. A legacy `WrapsCoffeeBackup` sibling folder is also read as a fallback for pre-rename installs (`server/backup.ts:30-33`).

**Registry keys:**
- `HKLM\SOFTWARE\Node.js` — read-only, queried by `NodeIsInstalled`/`NodeBinDir` (`adhdisplay.iss:64-67`, `:147-159`); never written by this installer (Node's own MSI installer writes it).
- `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}_is1` — Inno Setup's own standard uninstall-registration key (read explicitly by `InitializeSetup`, `:118`; written/removed by Inno Setup itself as part of its own install/uninstall machinery — INNO SEMANTIC, not this script's own code).

**Environment variables / PATH:** No `Environment`-section entries or PATH modification appear anywhere in `adhdisplay.iss` — Node's own MSI installer (run silently via `msiexec /qn`, `:177`) is what would add `node`/`npm` to PATH, not this script. `NodeBinDir` (`:147-159`) deliberately calls `npm.cmd` by full resolved path rather than relying on PATH, specifically because a PATH update from Node's own MSI wouldn't be visible to the current process yet (`:144-146`).

**Windows service:** **None exists.** There is no `sc.exe create`, nssm, node-windows, or winsw usage anywhere in this surface (confirmed by exhaustive search of `installer/` and `server/`). Autostart is implemented as a **Task Scheduler logon task** instead:
- Name: `ADHDisplayLauncher` (`adhdisplay.iss:235`)
- Trigger: `/SC ONLOGON` — fires at interactive logon, not at boot/before any logon
- Run level: `/RL HIGHEST` — elevated
- Action: runs `start-adhdisplay.bat` from `{app}`
- No "account" (it runs as whichever user logs on), no start-type, no recovery/restart-on-failure settings (Task Scheduler concepts that don't apply to a plain `ONLOGON` task) — the app's own `:server_watchdog` loop inside the batch script is what stands in for service-style recovery.
- Removed on uninstall via `schtasks.exe /Delete /TN "ADHDisplayLauncher" /F` (`:268`).

**Ports bound / firewall rules:**
- TCP 4000 (sync/API server) and TCP 4173 (Vite preview / content) — firewall rule `"ADHDisplay"`, `dir=in action=allow protocol=TCP localport=4000,4173 profile=any` (`adhdisplay.iss:252`).
- UDP 5353 (mDNS/Bonjour) — firewall rule `"ADHDisplay (mDNS)"`, same `profile=any` (`:260`).
- Both rules use `profile=any`, i.e. **not scoped to the private/LAN network category** — they apply regardless of whether Windows classifies the current network as Domain/Private/Public. The script's own comment (`:248-249`) justifies this by assuming the kiosk PC stays on one trusted network permanently, rather than scoping to `profile=private`.
- Both rules removed on uninstall (`:269-270`).

**Elevation:** `PrivilegesRequired=admin` (`adhdisplay.iss:32`) — the entire installer runs elevated, including steps that don't strictly need admin rights on their own merits (e.g. the Defender-exclusion PowerShell call, which does need admin, and the firewall/`schtasks` calls, which do) — no step is identified that runs with *more* privilege than its own action requires; the elevation is applied uniformly to the whole installer rather than per-step, which is standard Inno Setup behaviour (INNO SEMANTIC: `PrivilegesRequired=admin` elevates the entire installer process, not individual `[Code]`/`[Run]` steps — Inno Setup has no per-step elevation mechanism).

---

## 5. Lifecycle behaviour

**Fresh install (no prior registration found):** `InitializeSetup` finds no matching uninstall registry key and returns `True` immediately (`:117-141`, the `if RegQueryStringValue` body is skipped entirely) → wizard proceeds normally → `CurStepChanged` installs Node if needed, runs `npm install`/`npm run build`, optionally registers the logon task → `[Run]` opens firewall ports and offers to launch. On first server boot, `restoreFromSiblingBackupIfFresh()` (`server/index.ts:2405`, `server/backup.ts:164-171`) runs before `store.load()`: if `server\data` has no `.json` files yet *and* a sibling `ADHDisplayBackup` (or legacy `WrapsCoffeeBackup`) folder exists, it auto-restores from that folder. This means a "fresh" install onto a machine that still has a backup folder from a prior install is not actually data-empty — see the reinstall/uninstall interaction below.

**Upgrade over an existing install:** Triggered by `InitializeSetup` finding the uninstall registry key and the user choosing **Yes** (`:123-132`) — `StopRunningProcesses()` stops whatever owns ports 4000/4173 and this app's own `electron.exe`, then the normal `ssPostInstall` sequence runs: `[Files]` overwrite in place (`ignoreversion` flag on every entry, `:41-54`, meaning Inno never compares versions/timestamps — every file is unconditionally replaced every run), `server\data`/`server\uploads` are **excluded** from `[Files]` (`:42`) so untouched by this step, `npm install`/`npm run build` re-run. **No version comparison happens anywhere** — `InitializeSetup` only checks whether the uninstall key exists, not what version it points to, so "upgrade," "reinstall of the same version," and "downgrade to an older build" are all handled identically (see Findings §6).

**Repair:** Not a distinct Inno Setup "Repair" mode (this script defines no `[Setup]` support for one) — instead, the opt-in `repair` **task** checkbox (`:293`) is offered on top of the same upgrade flow: if selected, `CurStepChanged` deletes `{app}\node_modules` and `{app}\dist` (`:202-207`) before the same `npm install`/`npm run build` steps, forcing a from-scratch dependency/build regeneration. Data directories are never touched by this path either.

**Choosing "No" (install over the existing copy without uninstalling first):** `InitializeSetup` silently re-invokes the *existing* installed uninstaller with `/SILENT /NORESTART /SUPPRESSMSGBOXES` (`:135-136`) and then **still continues** into the normal install flow afterward — i.e. this is not actually "install over it as-is" as the dialog text (`:121`) describes; it always runs the old uninstaller first regardless of Yes or No, with Yes additionally calling `StopRunningProcesses()` first. The practical difference between Yes and No is therefore only whether running processes are stopped *before* the old uninstall runs (Yes) or not (No) — worth noting as a discrepancy between the dialog's wording and its actual effect (see §6).

**Uninstall:** `[UninstallRun]` deletes the scheduled task, removes both firewall rules, and best-effort removes the Defender exclusions (`:267-272`, harmless no-op if that task was never selected). `[UninstallDelete]` then removes `node_modules`, `dist`, `logs`, **and `server\data`/`server\uploads`** (`:279-283`) — everything under `{app}` that wasn't tracked by `[Files]`. Node.js itself is deliberately left installed (`:277-278` comment) as a shared system runtime.

**What's preserved vs. destroyed, precisely:**
- **Destroyed by uninstall:** the *live* copies of `server\data`/`server\uploads` under `{app}` — genuinely gone from the install root.
- **Preserved, outside the install root:** the sibling `ADHDisplayBackup` folder — `[UninstallDelete]` only lists paths under `{app}`, and `ADHDisplayBackup` resolves one level *above* `{app}` (`server/backup.ts:19-20`), so nothing in this installer touches it. Combined with `restoreFromSiblingBackupIfFresh()` (above), a subsequent reinstall **to the same directory** will auto-restore data/uploads from this surviving backup the first time the server boots — provided the mirror was caught up (writes mirror within ≤1s, `MIRROR_DEBOUNCE_MS`, `server/backup.ts:80`) at the moment of uninstall, and provided the reinstall lands at the same `{app}` (so the sibling path resolves to the same folder). If a user (a) picks a different install directory on reinstall, or (b) manually deletes the `ADHDisplayBackup` folder as part of "cleaning up," the data is genuinely unrecoverable through this mechanism. This nuance is developed further in Findings §6.

**Rollback:** None of `[Files]` copying, `npm install`, or `npm run build` has any rollback path if a later step fails. `CurStepChanged` `Abort`s on Node-install/`npm install`/`npm run build` failure (`:180-181`, `:218-219`, `:227-228`), which stops the wizard from reaching the Finish page, but **already-copied files, an already-run partial `npm install`, and an already-installed Node.js MSI are left in place** — there is no `DelTree`/uninstall-on-abort step. A user who hits an aborted install is left with a half-built `{app}` directory that a subsequent Setup run would detect as an existing install (registry key already written by Inno Setup's own bookkeeping once files begin copying — INNO SEMANTIC) and offer to upgrade/repair over.

**Version detection and downgrade handling:** As noted above, `InitializeSetup` performs no version comparison at all — it only checks for the presence of the fixed-GUID uninstall key (`:118`, `:22`). Running an **older** `ADHDisplaySetup.exe` against a newer installed version would present the identical "already installed" Yes/No/Cancel prompt and, on Yes, would overwrite newer files with older ones and re-run `npm install`/`npm run build` against the older `package.json` — there is no guard against this. `server/index.ts:49-50`'s own `APP_VERSION` (read from `package.json` at runtime) is the only place version actually matters after install, purely for display (`GET /server-info`) — it plays no role in the installer's own upgrade logic.

---

## 6. Findings

Ordered by severity. Each is labelled **confirmed bug**, **smell**, or **works but undocumented**.

1. **Smell — no version comparison, so "upgrade" also silently permits downgrade/reinstall.** `InitializeSetup` (`adhdisplay.iss:111-142`) only checks *presence* of the fixed-AppId uninstall key (`:118`), never the installed `AppVersion`. Running an older `ADHDisplaySetup.exe` over a newer install presents the same Yes/No/Cancel prompt and, on Yes, overwrites newer app files and `node_modules`/`dist` state with older ones via the identical `npm install`/`npm run build` path used for genuine upgrades. Concrete consequence: a support technician who runs an old `ADHDisplaySetup.exe` they still have lying around (e.g. from a shared folder) can silently downgrade a kiosk PC with no warning that this is what's happening. Scoped fix: compare `GetVersionNumbersString` of the target install's `AppVersion` (or a version file under `{app}`) against this compiled installer's own `{#SetupSetting("AppVersion")}` inside `InitializeSetup`, and adjust the prompt/behaviour when the installer being run is not newer.

2. **Smell — the Yes/No prompt text ("install over it as-is") doesn't match Yes/No's actual shared behaviour.** Both branches of `InitializeSetup`'s Yes/No choice (`:123-137`) end up invoking the *existing* installed uninstaller — Yes calls `StopRunningProcesses()` first, No does not, but both then continue into the same post-uninstall install flow. The dialog text (`:120-121`) implies No means "skip removing the old version and just overwrite" (i.e., no uninstall runs at all), which isn't what the code does. Concrete consequence: an admin who deliberately picks "No" expecting a raw overwrite (e.g. because the app is mid-troubleshooting and they don't want the previous uninstaller's side effects to run) gets the previous version's `[UninstallRun]`/`[UninstallDelete]` steps run anyway. Scoped fix: either change the dialog text to accurately describe that the prior uninstaller always runs, or change No's actual behaviour to skip invoking the old uninstaller.

3. **Smell — no rollback on a failed `npm install`/`npm run build`, leaving a half-built, registry-registered install.** `CurStepChanged` aborts on failure (`:180-181`, `:218-219`, `:227-228`) but performs no cleanup of already-copied `[Files]`, an already-run partial `npm install`, or an already-installed Node MSI. Concrete consequence: a network hiccup during `npm install` leaves `{app}` in a state that a subsequent Setup run treats as "already installed" (Inno's own uninstall-key registration, an INNO SEMANTIC not confirmed against this specific abort path but standard Inno behaviour once file copying begins) and offers to "upgrade" over — which is likely the intended recovery path, but it's implicit, not documented anywhere in the script or in user-facing error text. Scoped fix: mention in the `MsgBox` failure text that re-running Setup will offer to retry over the partial install, so the recovery path is explicit rather than assumed.

4. **Smell — firewall rules use `profile=any` rather than scoping to the private/LAN profile.** Both `netsh advfirewall` rules (`adhdisplay.iss:252`, `:260`) apply regardless of Windows's network-location classification (Domain/Private/Public), justified by an inline comment assuming the kiosk PC never roams (`:246-249`). Concrete consequence: if the machine's network is ever misclassified as Public (a known Windows quirk on some routers/VPNs) or the PC is temporarily connected to an untrusted network, ports 4000/4173/5353 remain open to it too — a mismatch between the stated LAN-trust assumption and what the rule actually enforces. Scoped fix: change `profile=any` to `profile=private` if the "stays on one trusted network" assumption is meant to be enforced, not just assumed.

5. **Works but undocumented — `WS_PORT`/`NEON_DATABASE_URL`/`WEATHER_USER_AGENT` env-var overrides exist at the app layer but have no installer-level surface.** Confirmed real and functioning (`server/index.ts:45`, `server/store.ts:369`, `server/integrations.ts:8`), but the installer exposes no `[Tasks]` entry, `.ini`/config file, or documented mechanism to set them for a deployed kiosk — a deployer must hand-edit `start-adhdisplay.bat`'s `npm run preview:kiosk` invocation (`:132`) or the `schtasks.exe` task's environment. Not a bug (these are legitimate escape hatches, e.g. for port conflicts), but a gap between what the app supports and what the installer lets an operator configure without editing shipped scripts.

6. **Works but undocumented — data survives an uninstall in practice, via a mechanism entirely outside the installer's own code.** `[UninstallDelete]` unconditionally deletes `{app}\server\data`/`{app}\server\uploads` (`:282-283`) with no confirmation prompt — read in isolation this looks like a data-loss bug. In practice, `server/backup.ts`'s always-on mirror to the sibling `ADHDisplayBackup` folder (outside `{app}`, therefore untouched by `[UninstallDelete]`) plus `restoreFromSiblingBackupIfFresh()` (`server/index.ts:2405`) auto-restoring on the next fresh server boot means a same-directory reinstall recovers the data automatically. This safety net is real but silent — nothing in the installer's uninstall confirmation, `[UninstallRun]`, or user-facing text mentions that a backup folder will be left behind or that it's what makes reinstalling safe. An operator who (reasonably) deletes `C:\ADHDisplayBackup` as part of "fully removing" the app, or who reinstalls to a different directory than before, loses data with no warning either way. Scoped fix: either surface the backup folder's existence/location in the uninstaller's confirmation text, or add an explicit warning if `[UninstallDelete]` is about to remove `server\data` while no sibling backup is present to fall back on.

7. **Works but undocumented — likely no fully silent/unattended install path when a prior install exists.** `InitializeSetup`'s `MsgBox` (`:120-122`) has no `WizardSilent()` guard. INFERRED from Inno Setup's own documented semantics that a plain `MsgBox` call in `[Code]` is not automatically suppressed by `/SILENT`/`/VERYSILENT` — confirming this fully would require actually running the compiled installer with `/VERYSILENT` on a machine with a prior install and observing whether it blocks. If confirmed, this is a real gap for any unattended/fleet-deployment scenario reinstalling over existing kiosks. Scoped fix: wrap the `MsgBox` call in a `WizardSilent()` check with a sensible default action (e.g. always treat silent+existing-install as "Yes, upgrade") so scripted redeployment doesn't hang.

8. **Works but undocumented — `[Run]`/`[UninstallRun]` entries do not check exit codes, by Inno Setup's own semantic.** Acknowledged directly in the script's own comment (`adhdisplay.iss:161-166`), which is *why* the higher-stakes steps (Node install, `npm install`, `npm run build`, autostart registration) were deliberately moved into `CurStepChanged`'s explicit `Exec`/`ResultCode` checks instead. The remaining plain `[Run]`/`[UninstallRun]` entries (firewall rules, `schtasks /Delete`, Defender-exclusion removal) are left as fire-and-forget by deliberate design (their own inline comments state failure here only affects LAN reachability or leftover exclusions, not whether the app runs) — this is intentional and reasonably scoped, not a bug, but worth recording as a known, accepted gap rather than an oversight.

No confirmed data-destroying bugs were found once the backup/auto-restore mechanism (Finding 6) is accounted for; the most significant *confirmed* defect is the missing version comparison (Finding 1), which is a correctness gap in the upgrade/downgrade logic rather than a data-loss risk.
