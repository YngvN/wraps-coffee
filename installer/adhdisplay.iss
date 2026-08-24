; Inno Setup script for the ADHDisplay kiosk PC installer.
; Build with Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php):
;   ISCC.exe adhdisplay.iss
; produces Output\ADHDisplaySetup.exe. See the project's chat/README notes
; for the full build + install + uninstall walkthrough.
;
; Before compiling, download the Node.js LTS Windows x64 installer from
; https://nodejs.org/en/download and place it next to this file renamed to
; node-lts-x64.msi (not committed to the repo — it's a large third-party binary).
; Same for Ollama's own Windows installer: download it from
; https://ollama.com/download/OllamaSetup.exe and place it next to this file
; as OllamaSetup.exe (also not committed — see .gitignore). Bundling it this
; way (rather than downloading it at install time, as this used to do) means
; a machine with a slow connection isn't stuck waiting on it mid-install; the
; [Files] entry below is still gated on the "Install Ollama" task so it's
; only extracted onto machines that actually selected it. build-installer.yml
; downloads a fresh copy of both installers right before every CI build, so
; a CI-built ADHDisplaySetup.exe always bundles the current Ollama release;
; a local build via build-with-apk.ps1 uses whatever copy was manually placed
; here, same as node-lts-x64.msi today.
;
; The AI assistant's default text model (qwen3:4b, ~2.5 GB) is bundled too, as
; a pre-seeded copy of Ollama's own model store under ollama-models\ - run
; `npm run ollama:fetch` (scripts\fetch-ollama-model.mts) before compiling, or
; let build-installer.yml / build-with-apk.ps1 do it, exactly as they do for
; public\fonts. Not committed either (see .gitignore). Without it a fresh kiosk
; can't use the assistant until an admin finds Settings -> Integrations ->
; Ollama and waits out the same download over the cafe's connection. The vision
; model (qwen2.5vl:3b) is deliberately NOT bundled: both together exceed Inno's
; 4,200,000,000-byte single-file limit and would force DiskSpanning, splitting
; ADHDisplaySetup.exe into .exe plus .bin slices that must stay together.
;
; The [Files] section below also embeds the Companion app's Android TV APK
; (built from ../adhdisplay-companion via `npm run build:tv`, then committed
; straight into ../adhdisplay-companion/dist — see that project's own
; .gitignore and README "Building a release APK for Android TV" section) so
; it ships inside the {app}\android-apk folder, ready to copy to a USB stick
; per ../docs/INSTALL-TV.md. Committed rather than built by ISCC's own callers
; (build-installer.yml, build-with-apk.ps1) because a full Android/Gradle
; build is slow — a full Android SDK/JDK toolchain is only needed when the
; Companion app itself changes and its committed APK needs regenerating, not
; on every installer compile. Since Inno resolves that [Files] glob at
; compile time, whatever APK is currently committed there is what ships —
; keep it in sync with adhdisplay-companion's own version.

#define AppName "ADHDisplay"
#define AppExeName "start-adhdisplay.bat"
; The model bundled under ollama-models\ (see the header comment above), split
; the way Ollama's own store path does (library\qwen3\4b) and joined as
; "qwen3:4b" for display - the same tag server\store.ts's DEFAULT_OLLAMA_CONFIG
; names as thinkingModel. Declared once since the [Files] entries, the detection
; page and the uninstaller all have to talk about the same model.
#define BundledModelName "qwen3"
#define BundledModelTag "4b"
#define BundledModelRef BundledModelName + ":" + BundledModelTag

[Setup]
; Fixed GUID (not the app name) so the uninstall registry key stays the same
; across rebuilds/versions - that's what InitializeSetup below looks up to
; detect an existing install, and what lets a future version upgrade cleanly
; instead of installing side-by-side. Hardcoded (not via #define) since Inno's
; own "{{ = literal {" escaping and the preprocessor's "{#name}" substitution
; don't compose safely - the same raw GUID is repeated as a plain string
; (no escaping needed there) in InitializeSetup below.
AppId={{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}
AppName={#AppName}
; Must stay in sync with the root package.json's own "version" field (see
; CLAUDE.md's Versioning rule) - bumped together, in the same change, on
; every completed change.
AppVersion=0.2.96
AppPublisher=ADHDisplay
DefaultDirName=C:\ADHDisplay
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=ADHDisplaySetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=adhdisplay.ico
UninstallDisplayIcon={uninstallexe}
; ~1.54 GB on top of the source files Inno's own estimate already covers, for
; node_modules + dist (neither is shipped in [Files] - both are generated on
; the target machine by npm install / npm run build below).
; Includes a further ~40 MB because `npm run build` copies public\fonts into
; dist\fonts: Inno's own estimate covers the [Files] copy under {app}\public,
; but not the second copy Vite makes at build time on the target machine.
ExtraDiskSpaceRequired=1652555776

[Files]
Source: "..\src\*"; DestDir: "{app}\src"; Flags: recursesubdirs ignoreversion
Source: "..\server\*"; DestDir: "{app}\server"; Flags: recursesubdirs ignoreversion; Excludes: "data\*,uploads\*"
; Also carries public\fonts - ~36 MB of self-hosted Google Fonts woff2 plus the
; generated stylesheet, covering every family in src\data\googleFonts.json (see
; scripts\fetch-google-fonts.mts). Not committed to the repo: build-installer.yml
; runs `npm run fonts:fetch` before ISCC, exactly as it downloads the Node.js and
; Ollama installers, and build-with-apk.ps1 does the same for a local build. This
; glob picks up whatever is on disk at compile time, so a build that skipped that
; step still succeeds - it just produces an installer whose displays fall back to
; system fonts, which is why both build paths run the fetch for you.
Source: "..\public\*"; DestDir: "{app}\public"; Flags: recursesubdirs ignoreversion
Source: "..\electron\*"; DestDir: "{app}\electron"; Flags: recursesubdirs ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\vite.config.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\tsconfig.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\tsconfig.app.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\tsconfig.node.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-adhdisplay.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "open-in-browser.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "print-qr.cjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "run-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch-server.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch-ollama.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch-tray.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "pull-ollama-models.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "tray-helper.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "adhdisplay.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "node-lts-x64.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not NodeIsInstalled
; Gated on the task rather than on "not already installed" (unlike the msi
; line above) - CurStepChanged below always runs this installer when the
; task is selected, even over an existing Ollama, so an outdated install
; gets updated rather than silently left alone. See the header comment for
; where this file comes from.
Source: "OllamaSetup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WizardIsTaskSelected('installOllama')
; The pre-seeded Ollama model store (see the header comment). Written straight
; into Ollama's own default location rather than staged under {app} and copied
; afterwards, which would mean 2.5 GB on disk twice and a multi-minute copy.
;
; {%USERPROFILE} resolves to whoever ran Setup - the same assumption the Ollama
; install step and the uninstaller below already make (Ollama's own installer is
; per-user, into {localappdata}), so this adds no new limitation. An admin who
; elevates with a *different* account than the kiosk user seeds the wrong
; profile; the wizard page below is what makes that visible rather than silent.
;
; onlyifdoesntexist is safe precisely because blobs are content-addressed - a
; file named sha256-<hex> is byte-identical to any other file of that name, by
; definition - so an upgrade, a re-run, or a machine where the admin already
; pulled qwen3:4b by hand keeps the copy that's there rather than rewriting
; 2.5 GB. (INFERRED that this also saves the *decompression*: SolidCompression
; above makes the payload one sequential stream, so Setup may still have to read
; through it either way. Confirm by timing a second install over the first.)
;
; nocompression skips compressing an already-quantised GGUF, which buys a percent
; or two at best for a long compile. INFERRED that it still applies under
; SolidCompression=yes - Inno's docs don't state how the two interact, and being
; wrong here costs only compile time, not correctness.
;
; Follows the public\fonts precedent rather than the APK one below: no
; skipifsourcedoesntexist needed since these are globs, so a build that skipped
; `npm run ollama:fetch` still compiles - it just produces an installer whose
; kiosks fall back to the existing on-demand download in Settings.
Source: "ollama-models\blobs\*"; DestDir: "{code:OllamaStoreDir}\blobs"; Flags: onlyifdoesntexist nocompression; Check: ShouldInstallBundledModel
Source: "ollama-models\manifests\*"; DestDir: "{code:OllamaStoreDir}\manifests"; Flags: recursesubdirs ignoreversion; Check: ShouldInstallBundledModel
; Read back by CurUninstallStepChanged to remove exactly what was seeded, and
; shipped because Apache-2.0 requires the licence to travel with the weights.
Source: "ollama-models\seeded-files.txt"; DestDir: "{app}"; Flags: ignoreversion; Check: ShouldInstallBundledModel
Source: "ollama-models\LICENSES.md"; DestDir: "{app}"; DestName: "OLLAMA-MODEL-LICENSES.md"; Flags: ignoreversion; Check: ShouldInstallBundledModel
; Two entries for the same source: the {app} copy is what the batch watchdog
; and tray helper call at runtime once installed; the {tmp}/dontcopy one is
; pulled on demand via ExtractTemporaryFile from [Code] at CurStepChanged's
; ssInstall step, since that runs *before* Inno's own automatic extraction of
; the {app} copy above - without this, there'd be nothing on disk yet (fresh
; install) or only the previous version's copy (upgrade) for that early stop
; call to actually run.
Source: "adhdisplay-control.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "adhdisplay-control.ps1"; DestDir: "{tmp}"; Flags: dontcopy
; Signed release build, glob-matched since the filename embeds the exact
; version/versionCode (see adhdisplay-companion/scripts/build-tv-apk.js) - not
; committed to the repo, must be built locally first (see the header comment
; above and build-with-apk.ps1). Deliberately no skipifsourcedoesntexist: a
; missing APK should fail this compile loudly, not silently ship without it.
Source: "..\adhdisplay-companion\dist\adhdisplay-companion-*.apk"; DestDir: "{app}\android-apk"; Flags: ignoreversion

; Ensure these exist even though their gitignored contents are excluded above —
; the local server writes into them on first boot (see server/store.ts / uploads.ts).
[Dirs]
Name: "{app}\server\data"
Name: "{app}\server\uploads"

[InstallDelete]
; Cleans up shortcuts left over from before the {autoprograms} -> {group} fix
; below (an "Update" install no longer invokes the old uninstaller - see the
; corrected InitializeSetup/CurStepChanged split - which used to be the only
; thing that would have removed these on an upgrade).
Type: files; Name: "{autoprograms}\{#AppName}.lnk"
Type: files; Name: "{autoprograms}\{#AppName} (Open in Browser).lnk"
Type: files; Name: "{autoprograms}\Uninstall {#AppName}.lnk"
Type: files; Name: "{autodesktop}\{#AppName}.lnk"

[Code]
var
  PriorInstallDetected: Boolean;
  PriorDisplayVersion: String;
  UpdateChoicePage: TInputOptionWizardPage;
  OllamaStatusPage: TOutputMsgMemoWizardPage;

function NodeIsInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Node.js');
end;

// Used to call npm/node by full path rather than relying on PATH, since a
// Node install performed earlier in this same installer run hasn't refreshed
// this process's environment yet.
function NodeBinDir(Param: String): String;
var
  Path: String;
begin
  if RegQueryStringValue(HKLM, 'SOFTWARE\Node.js', 'InstallPath', Path) then
  begin
    if (Length(Path) > 0) and (Path[Length(Path)] <> '\') then
      Path := Path + '\';
    Result := Path;
  end
  else
    Result := ExpandConstant('{pf}') + '\nodejs\';
end;

// INFERRED default per-user install location for Ollama's own Windows
// installer - not independently confirmed against a real OllamaSetup.exe run;
// confirm during implementation/testing and adjust here (and in
// pull-ollama-models.bat, and in CurUninstallStepChanged below) if it turns
// out different.
function OllamaBinDir: String;
begin
  Result := ExpandConstant('{localappdata}') + '\Programs\Ollama\';
end;

function OllamaIsInstalled: Boolean;
var
  ResultCode: Integer;
begin
  Result := FileExists(OllamaBinDir + 'ollama.exe');
  if not Result then
    Result := Exec('where.exe', 'ollama.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function OllamaWasInstalledByADHDisplay: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\.ollama-installed-by-adhdisplay'));
end;

// Ollama's own default model store. Referenced from [Files] above as
// {code:OllamaStoreDir} so the seeded blobs, the detection page below and the
// uninstaller can never drift apart onto different paths. Takes the unused
// Param the {code:...} constant syntax requires (same as NodeBinDir above).
//
// Deliberately not overridden with OLLAMA_MODELS: setting that machine-wide
// would relocate the store for everything on the box, making any model an
// admin had already pulled into the default location appear to vanish.
function OllamaStoreDir(Param: String): String;
begin
  Result := ExpandConstant('{%USERPROFILE}') + '\.ollama\models';
end;

// Lists what Ollama already has, as newline-separated "model:tag" entries.
//
// Reads the store's own manifests directory rather than shelling out to
// `ollama list`: that command talks to the Ollama HTTP daemon, which may well
// not be running during Setup (and on a machine where Ollama isn't installed
// at all there is nothing to ask), plus Inno's Exec cannot capture stdout
// without redirecting to a temp file first. The directory layout is
// manifests\<registry>\<namespace>\<model>\<tag>, confirmed byte-for-byte
// against a real `ollama pull` store - which is exactly the layout [Files]
// seeds, so this function and the seeding cannot disagree about what "installed"
// means.
function InstalledOllamaModels: String;
var
  LibraryDir: String;
  ModelRec: TFindRec;
  TagRec: TFindRec;
begin
  Result := '';
  // Only the default registry/namespace is enumerated - a model pulled from
  // somewhere else still works, it just isn't listed here, which is acceptable
  // for an informational page.
  LibraryDir := OllamaStoreDir('') + '\manifests\registry.ollama.ai\library';
  if not DirExists(LibraryDir) then
    Exit;

  if FindFirst(LibraryDir + '\*', ModelRec) then
  begin
    try
      repeat
        if ((ModelRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0) and (ModelRec.Name <> '.') and (ModelRec.Name <> '..') then
        begin
          // Each file inside a model's folder is one tag, named after the tag
          // itself with no extension.
          if FindFirst(LibraryDir + '\' + ModelRec.Name + '\*', TagRec) then
          begin
            try
              repeat
                if (TagRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) = 0 then
                  Result := Result + ModelRec.Name + ':' + TagRec.Name + #13#10;
              until not FindNext(TagRec);
            finally
              FindClose(TagRec);
            end;
          end;
        end;
      until not FindNext(ModelRec);
    finally
      FindClose(ModelRec);
    end;
  end;
end;

// True when a model:tag is already in the store - i.e. when the bundled copy
// would be skipped by its onlyifdoesntexist flag. The surrounding CRLFs make
// this an exact whole-entry match, so "qwen3:4b" is never satisfied by
// "qwen3:4b-instruct".
function OllamaModelIsInstalled(Reference: String): Boolean;
begin
  Result := Pos(#13#10 + Reference + #13#10, #13#10 + InstalledOllamaModels) > 0;
end;

// Both tasks, ANDed - which the [Files] "Tasks:" parameter cannot express,
// since listing two task names there ORs them. Nothing about the bundled model
// makes sense on a machine that declined Ollama itself.
function ShouldInstallBundledModel: Boolean;
begin
  Result := WizardIsTaskSelected('installOllama') and WizardIsTaskSelected('bundledModel');
end;

// Best-effort reachability probe so a machine with no internet connection
// finds out before the multi-minute npm install / npm run build / Ollama
// download steps, rather than discovering it only after one of them fails.
// Warns rather than aborting, since npm install can in rare cases still
// succeed off a local cache.
function HasInternetConnection: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('powershell.exe',
    '-NoProfile -Command "try { Invoke-WebRequest -Uri ''https://nodejs.org'' -UseBasicParsing -TimeoutSec 5 -Method Head | Out-Null; exit 0 } catch { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// Pulls one dot-separated numeric part off the front of S (mutating S to the
// remainder) and returns it as an integer, defaulting to 0 for a missing/
// non-numeric part - used by CompareVersions below.
function ExtractVersionPart(var S: String): Integer;
var
  DotPos: Integer;
  PartStr: String;
begin
  DotPos := Pos('.', S);
  if DotPos > 0 then
  begin
    PartStr := Copy(S, 1, DotPos - 1);
    S := Copy(S, DotPos + 1, Length(S) - DotPos);
  end
  else
  begin
    PartStr := S;
    S := '';
  end;
  Result := StrToIntDef(PartStr, 0);
end;

// Simple dot-separated numeric version compare for this project's own
// "0.x.n" scheme - no generic semver library needed. Returns -1 if V1 < V2,
// 0 if equal, 1 if V1 > V2. A shorter version string is treated as
// zero-padded (e.g. "1.2" < "1.2.1").
function CompareVersions(V1, V2: String): Integer;
var
  N1, N2: Integer;
begin
  Result := 0;
  while (Result = 0) and ((V1 <> '') or (V2 <> '')) do
  begin
    N1 := ExtractVersionPart(V1);
    N2 := ExtractVersionPart(V2);
    if N1 < N2 then
      Result := -1
    else if N1 > N2 then
      Result := 1;
  end;
end;

// Only detects a prior install and reads its version - deliberately does
// nothing else (no page creation, since the wizard doesn't exist yet at this
// point; no process stopping, since [Files] under {app} haven't been touched
// yet either; no invoking the old uninstaller, removed entirely - see the new
// wizard page below for why). Both moved to where they actually belong:
// InitializeWizard (page creation) and CurStepChanged's ssInstall step
// (stopping running processes, right before the file copy that needs them
// stopped).
function InitializeSetup(): Boolean;
begin
  Result := True;
  PriorInstallDetected := RegKeyExists(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}_is1');
  if PriorInstallDetected then
  begin
    RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}_is1', 'DisplayVersion', PriorDisplayVersion);
    if (PriorDisplayVersion <> '') and (CompareVersions('{#SetupSetting("AppVersion")}', PriorDisplayVersion) < 0) and not WizardSilent() then
    begin
      if MsgBox('The version being installed ({#SetupSetting("AppVersion")}) is older than the version already installed (' + PriorDisplayVersion + ').' + #13#10 + #13#10 +
        'Continuing will downgrade ADHDisplay. If that is not what you intended, click Cancel and use the current installer instead.',
        mbConfirmation, MB_OKCANCEL) = IDCANCEL then
        Result := False;
    end;
  end;

  if Result and not HasInternetConnection() and not WizardSilent() then
    MsgBox('No internet connection was detected. ADHDisplay needs internet access during installation to download Node.js and its dependencies. ' +
      'Ollama and the assistant''s text model ({#BundledModelRef}) are both bundled in this installer and don''t need a connection; only the image-reading model (qwen2.5vl:3b) is still downloaded separately later, on demand, from Settings -> Integrations -> Ollama.' + #13#10 + #13#10 +
      'Setup will continue, but may fail partway through if the connection isn''t restored.',
      mbInformation, MB_OK);
end;

// Replaces the old MsgBox-based Yes/No/Cancel prompt (whose Yes/No labels
// were actually backwards from what the code did - see CLAUDE.md-tracked plan
// notes) with a real wizard page offering an unambiguous choice. Neither
// choice invokes the old installed uninstaller - the existing ignoreversion
// file overwrite already handles a clean update, and "Clean reinstall" already
// handles the deeper case by wiping node_modules/dist (formerly the separate
// "repair" task, now driven by this page's own selection - see
// WantsCleanReinstall below).
procedure InitializeWizard();
var
  Models: String;
  Summary: String;
begin
  UpdateChoicePage := CreateInputOptionPage(wpSelectDir,
    'Existing Installation Found',
    'ADHDisplay version ' + PriorDisplayVersion + ' is already installed on this machine.',
    'Choose how you want to proceed, then click Next.',
    True, False);
  UpdateChoicePage.Add('Update (recommended) - keep your data, refresh the app files');
  UpdateChoicePage.Add('Clean reinstall - also rebuild node_modules and dist from scratch');
  UpdateChoicePage.SelectedValueIndex := 0;

  // Setup used to decide everything about Ollama silently, so an admin had no
  // way to tell what was already on the machine or what the ~2.5 GB bundled
  // model would actually do here. Created after UpdateChoicePage (custom pages
  // are ordered by creation, and both anchor to wpSelectDir) so it lands second
  // - and still ahead of wpSelectTasks, which is the point: it informs the
  // "Include the offline AI model" checkbox rather than trailing it.
  //
  // Read-only: it reports state, it doesn't ask anything. The choices it feeds
  // are the tasks page's own checkboxes.
  //
  // Content is computed once, here, rather than in CurPageChanged - nothing can
  // install or remove Ollama between now and the tasks page.
  Models := InstalledOllamaModels;
  if not OllamaIsInstalled then
    Summary := 'Ollama is not installed on this machine.' + #13#10 + #13#10 +
      'Setup will install it, together with the AI model "{#BundledModelRef}" that is bundled inside ' +
      'this installer - so the assistant works straight away, with no download and no internet connection.'
  else if Models = '' then
    Summary := 'Ollama is already installed on this machine, but has no AI models yet.' + #13#10 + #13#10 +
      'Setup will add the bundled model "{#BundledModelRef}" to it, and will re-run Ollama''s own installer ' +
      'so an outdated copy is updated in place.'
  else
  begin
    Summary := 'Ollama is already installed on this machine, with these AI models:' + #13#10 + #13#10 + Models + #13#10;
    if OllamaModelIsInstalled('{#BundledModelRef}') then
      Summary := Summary + 'The bundled model "{#BundledModelRef}" is already among them, so Setup will keep the ' +
        'copy you already have - nothing is downloaded, and nothing is overwritten.'
    else
      Summary := Summary + 'Setup will add the bundled model "{#BundledModelRef}" alongside these. Your existing ' +
        'models are left untouched.';
  end;
  Summary := Summary + #13#10 + #13#10 +
    'The assistant''s image-reading model (qwen2.5vl:3b) is not bundled and is still downloaded on demand, ' +
    'from Settings -> Integrations -> Ollama inside the app.';

  OllamaStatusPage := CreateOutputMsgMemoPage(wpSelectDir,
    'AI Assistant',
    'What is already installed on this machine',
    'Setup checked this machine for Ollama and its AI models. You can change what gets installed on the next page.',
    Summary);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = UpdateChoicePage.ID then
    // Defaults to "Update" and skips the page entirely under /SILENT or
    // /VERYSILENT, so a scripted/fleet redeploy never blocks waiting for
    // input it can't provide - matching Finding 7's original diagnosis, now
    // relocated onto this page instead of the old MsgBox.
    Result := (not PriorInstallDetected) or WizardSilent();
  // Purely informational, so there is nobody to inform during a scripted/fleet
  // redeploy - same guard as above rather than relying on silent mode never
  // showing custom pages.
  if PageID = OllamaStatusPage.ID then
    Result := WizardSilent();
end;

// The "repair" task (see [Tasks] below) still exists for /TASKS="repair"
// scripted fleet redeploys wanting a forced clean reinstall even under
// /VERYSILENT, where the page above is skipped - this is the single place
// both paths (the interactive page's own selection, and the silent-mode task)
// feed into.
function WantsCleanReinstall: Boolean;
begin
  if WizardSilent() then
    Result := WizardIsTaskSelected('repair')
  else if PriorInstallDetected then
    Result := (UpdateChoicePage.SelectedValueIndex = 1)
  else
    Result := False;
end;

// Node install / npm install / npm run build / Ollama install / scheduled-task
// registration used to be plain [Run] entries, but Inno's [Run] section does
// not check exit codes - if any of these failed, Setup silently moved on and
// reported "completed successfully" regardless. Running them here via Exec
// lets each one's exit code actually be checked and surfaced.
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NpmCmd: String;
  ControlScriptTemp: String;
  OllamaWasInstalled: Boolean;
begin
  if CurStep = ssInstall then
  begin
    // Stop everything from a prior running instance *before* Inno's own
    // automatic file copy begins (which happens right after this step, not
    // controlled by this script) - closing the multi-minute window between
    // the wizard's own dir/tasks pages and the actual npm steps, during which
    // the watchdog used to get a chance to resurrect the server mid-install.
    // {app}\adhdisplay-control.ps1 isn't on disk yet at this point (fresh
    // install) or is still the *previous* version's copy (upgrade) - pulling
    // it fresh to {tmp} via ExtractTemporaryFile (see the dontcopy [Files]
    // entry above) sidesteps both cases.
    ExtractTemporaryFile('adhdisplay-control.ps1');
    ControlScriptTemp := ExpandConstant('{tmp}\adhdisplay-control.ps1');
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ControlScriptTemp + '" -Action StopAll -AppDir "' + ExpandConstant('{app}') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end
  else if CurStep = ssPostInstall then
  begin
    if not NodeIsInstalled then
    begin
      WizardForm.StatusLabel.Caption := 'Installing Node.js...';
      if not Exec('msiexec.exe', '/i "' + ExpandConstant('{tmp}\node-lts-x64.msi') + '" /qn /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      begin
        MsgBox('Installing Node.js failed (exit code ' + IntToStr(ResultCode) + '). Setup cannot continue.', mbError, MB_OK);
        Abort;
      end;
    end;

    // Opt-in (see [Tasks] below) - antivirus real-time scanning interfering with
    // npm's file writes mid-extraction is a real cause of the "corrupted tarball
    // data" errors npm install can report. Best-effort: if Defender isn't the
    // active AV or this is managed by group policy, it just fails silently and
    // npm install proceeds as it would have anyway.
    if WizardIsTaskSelected('defenderexclusion') then
    begin
      WizardForm.StatusLabel.Caption := 'Adding a Windows Defender exclusion...';
      Exec('powershell.exe',
        '-NoProfile -Command "Add-MpPreference -ExclusionPath ' + #39 + ExpandConstant('{app}') + #39 +
        '; Add-MpPreference -ExclusionPath ' + #39 + ExpandConstant('{localappdata}') + '\npm-cache' + #39 + '"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;

    if WantsCleanReinstall then
    begin
      WizardForm.StatusLabel.Caption := 'Removing node_modules and dist for a clean reinstall...';
      DelTree(ExpandConstant('{app}\node_modules'), True, True, True);
      DelTree(ExpandConstant('{app}\dist'), True, True, True);
    end;

    NpmCmd := NodeBinDir('') + 'npm.cmd';

    WizardForm.StatusLabel.Caption := 'Installing dependencies (this can take several minutes)...';
    if not Exec(NpmCmd, 'install', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      MsgBox('npm install failed (exit code ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
        'Setup cannot continue. Check this machine''s internet connection and try again, or open a Command ' +
        'Prompt in ' + ExpandConstant('{app}') + ' and run "npm install" manually to see the full error.',
        mbError, MB_OK);
      Abort;
    end;

    WizardForm.StatusLabel.Caption := 'Building the app...';
    if not Exec(NpmCmd, 'run build', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      MsgBox('npm run build failed (exit code ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
        'Setup cannot continue. Open a Command Prompt in ' + ExpandConstant('{app}') +
        ' and run "npm run build" manually to see the full error.', mbError, MB_OK);
      Abort;
    end;

    // Opt-in (see [Tasks] below), checked by default. Ollama's own installer
    // is bundled in [Files] (OllamaSetup.exe, only extracted to {tmp} when
    // this task is selected - see the header comment for where it comes
    // from) rather than downloaded here, so this step has no network
    // dependency and takes only as long as running the installer itself.
    // Run unconditionally (even over an already-installed Ollama) rather
    // than only "if not installed" - Ollama's own installer is, per its
    // public behaviour, also Inno-Setup-based, and silently re-running an
    // Inno installer over an existing install is how those normally update
    // in place (same as this app's own installer does on re-run), so this
    // is what keeps an outdated existing install current rather than
    // leaving it alone. Deliberately does NOT pull any models over the
    // network - that used to happen automatically here (a multi-GB
    // background download). The default text model is instead seeded
    // straight into Ollama's store by the [Files] entries above, from a copy
    // bundled inside this installer, and the vision model is pulled on
    // demand from Settings -> Integrations -> Ollama, so nothing in this
    // step ever waits on a connection.
    if WizardIsTaskSelected('installOllama') then
    begin
      OllamaWasInstalled := OllamaIsInstalled;
      WizardForm.StatusLabel.Caption := 'Installing Ollama...';
      // INFERRED silent-install flags (confirm against a real download
      // during implementation/testing) and INFERRED that re-running this
      // silently over an existing install is safe/updates in place rather
      // than erroring or reinstalling from scratch - confirm during
      // implementation/testing and fall back to only running when
      // "not OllamaWasInstalled" here if it turns out not to be.
      if not Exec(ExpandConstant('{tmp}\OllamaSetup.exe'), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
        MsgBox('Installing Ollama failed (exit code ' + IntToStr(ResultCode) + '). ADHDisplay will still work, just without local AI models. You can install Ollama manually later from ollama.com.',
          mbInformation, MB_OK);

      // Only written when we're the one who newly installed it (wasn't
      // present before, is present now) - uninstall reads this back to
      // decide whether it's safe to offer removing Ollama too (never
      // touching a copy that was already there independently, including one
      // this step merely updated rather than installed from scratch).
      if not OllamaWasInstalled and OllamaIsInstalled then
        SaveStringToFile(ExpandConstant('{app}\.ollama-installed-by-adhdisplay'), 'installed by ADHDisplay setup', False);
    end;

    // See [Tasks] below - "autostart" is checked by default (it's the whole
    // point of this installer), but left visible/optional rather than always
    // silently registering a logon task.
    if WizardIsTaskSelected('autostart') then
    begin
      if not Exec('schtasks.exe', '/Create /TN "ADHDisplayLauncher" /TR "\"' + ExpandConstant('{app}') +
        '\start-adhdisplay.bat\"" /SC ONLOGON /RL HIGHEST /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
        MsgBox('Could not register the auto-start task (exit code ' + IntToStr(ResultCode) + '). ' +
          'ADHDisplay is installed and can still be launched manually, but won''t start automatically on restart.',
          mbInformation, MB_OK);
    end;
  end;
end;

// Inno's own StringChangeEx mutates its argument and returns a count, so this
// wraps it as an ordinary expression for use inline below.
function ReplaceAll(Value, FromStr, ToStr: String): String;
begin
  Result := Value;
  StringChangeEx(Result, FromStr, ToStr, True);
end;

// Concatenates every manifest still present under Dir (recursing into the
// registry/namespace/model folders). Each manifest names the blob digests it
// needs, so a substring search over the result answers "is any model still
// using this blob?" without parsing JSON in Pascal.
procedure AppendManifestText(Dir: String; var Accumulated: String);
var
  Rec: TFindRec;
  Lines: TArrayOfString;
  I: Integer;
begin
  if not FindFirst(Dir + '\*', Rec) then
    Exit;
  try
    repeat
      if (Rec.Name <> '.') and (Rec.Name <> '..') then
      begin
        if (Rec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
          AppendManifestText(Dir + '\' + Rec.Name, Accumulated)
        else if LoadStringsFromFile(Dir + '\' + Rec.Name, Lines) then
          for I := 0 to GetArrayLength(Lines) - 1 do
            Accumulated := Accumulated + Lines[I];
      end;
    until not FindNext(Rec);
  finally
    FindClose(Rec);
  end;
end;

// Deletes exactly the files [Files] seeded into Ollama's model store, reading
// the list scripts\fetch-ollama-model.mts generated at build time.
//
// A blob is only removed once no *other* manifest still references it: Ollama
// deduplicates blobs by content, so a machine that also has, say, qwen3:8b can
// legitimately share a layer with the bundled qwen3:4b. At these sizes a plain
// "delete everything we listed" would be a data-loss bug on exactly the
// machines that use the assistant most.
procedure RemoveSeededOllamaModels;
var
  ListPath, StoreDir, ManifestText, RelativePath, Digest: String;
  Lines: TArrayOfString;
  I: Integer;
begin
  ListPath := ExpandConstant('{app}\seeded-files.txt');
  if not FileExists(ListPath) then
    Exit;
  if not LoadStringsFromFile(ListPath, Lines) then
    Exit;

  if MsgBox('ADHDisplay installed an AI model ({#BundledModelRef}, about 2.5 GB) into Ollama''s model folder.' + #13#10 + #13#10 +
    'Remove it? Ollama itself, and any other models you''ve downloaded, are kept either way.', mbConfirmation, MB_YESNO) <> IDYES then
    Exit;

  StoreDir := OllamaStoreDir('');

  // Manifests first, so the blob pass below reads a store that no longer claims
  // to contain the model being removed - otherwise every one of its blobs would
  // look "still referenced" by its own manifest and nothing would be freed.
  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    RelativePath := Trim(Lines[I]);
    if (RelativePath <> '') and (Pos('manifests/', RelativePath) = 1) then
      DeleteFile(StoreDir + '\' + ReplaceAll(RelativePath, '/', '\'));
  end;

  ManifestText := '';
  AppendManifestText(StoreDir + '\manifests', ManifestText);

  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    RelativePath := Trim(Lines[I]);
    if (RelativePath <> '') and (Pos('blobs/', RelativePath) = 1) then
    begin
      // blobs\sha256-<hex> on disk is written "sha256:<hex>" inside a manifest.
      Digest := ReplaceAll(Copy(RelativePath, Length('blobs/') + 1, Length(RelativePath)), 'sha256-', 'sha256:');
      if Pos(Digest, ManifestText) = 0 then
        DeleteFile(StoreDir + '\' + ReplaceAll(RelativePath, '/', '\'));
    end;
  end;
end;

// Doesn't exist prior to this change - uninstall used to stop nothing before
// [UninstallDelete] tried to remove node_modules/dist/server\data/
// server\uploads, which is why a still-running watchdog-resurrected server
// could hold locks on those files during an uninstall.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    // {app}\adhdisplay-control.ps1 is still on disk here - Inno's own
    // uninstall engine removes [Files]-tracked files *after* this step fires,
    // not before, so no ExtractTemporaryFile-style workaround is needed on
    // the uninstall side the way it was for ssInstall above.
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\adhdisplay-control.ps1') + '" -Action StopAll -AppDir "' + ExpandConstant('{app}') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // Only offered if ADHDisplay's own installer is what installed Ollama
    // (see the marker file written above) - never touches a copy of Ollama
    // that was already on this machine independently.
    if OllamaWasInstalledByADHDisplay then
    begin
      // No fixed size claim here - the bundled model is a known ~2.5 GB, but
      // how much this frees up in total also depends on whatever the admin has
      // pulled from Settings since install.
      if MsgBox('Also remove Ollama and its AI models (including the one bundled with ADHDisplay)?', mbConfirmation, MB_YESNO) = IDYES then
      begin
        // INFERRED uninstall path for Ollama's own Windows installer -
        // confirm the exact location during implementation/testing.
        if FileExists(OllamaBinDir + 'unins000.exe') then
          Exec(OllamaBinDir + 'unins000.exe', '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        DelTree(ExpandConstant('{localappdata}') + '\Programs\Ollama', True, True, True);
        DelTree(ExpandConstant('{%USERPROFILE}') + '\.ollama', True, True, True);
      end;
    end
    // The other case: Ollama was already here independently, so the branch
    // above (rightly) won't touch it - but this installer still seeded ~2.5 GB
    // of weights into its store, and leaving that orphaned after an uninstall
    // is exactly the kind of thing nobody ever finds again. Removes only the
    // files it put there, listed by scripts\fetch-ollama-model.mts at build
    // time, so an admin's own models are never at risk.
    else
      RemoveSeededOllamaModels;
  end
  else if CurUninstallStep = usPostUninstall then
  begin
    // A post-uninstall question rather than an install-time-style checkbox,
    // matching how most uninstallers behave.
    if MsgBox('ADHDisplay has been uninstalled. Restart Windows now?', mbConfirmation, MB_YESNO) = IDYES then
      Exec('shutdown.exe', '/r /t 5', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

[Run]
; Open the ports the local server and preview server listen on, so other
; devices on the cafe's LAN (kiosk screens, a second admin's phone) can
; reach this machine without a firewall prompt with nobody there to click
; "Allow". profile=any is deliberate: this machine is expected to stay on
; one trusted network, not roam between networks like a laptop would.
; Left as a plain best-effort [Run] entry (unlike the steps above) since a
; failure here only affects LAN reachability, not whether the app runs at all.
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""ADHDisplay"" dir=in action=allow protocol=TCP localport=4000,4173 profile=any"; Flags: runhidden

; Same reasoning as above, but for mDNS (UDP 5353) - the port bonjour-service
; needs both to advertise this machine's own "<store name>.local" screen
; address (see server/mdns.ts) and to browse for a server's presence during
; first-run role setup (see electron/roleSetup.cjs). Without this rule the
; multicast traffic is silently dropped and .local names never publish or
; resolve, even though the app-level feature itself is otherwise working.
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""ADHDisplay (mDNS)"" dir=in action=allow protocol=UDP localport=5353 profile=any"; Flags: runhidden

; Offer to launch right away, without waiting for a restart. "nowait" is
; required here: the script's own watchdog loop never returns, so waiting
; for it to exit would leave the wizard's Finish page open forever. Skipped
; if "restart" is selected below - launching the kiosk just to immediately
; reboot it doesn't make sense (Inno's own Finish page likely already
; suppresses this when a restart is pending, but this is kept as free
; belt-and-braces insurance either way).
Filename: "{app}\start-adhdisplay.bat"; Description: "Launch ADHDisplay now"; Flags: postinstall shellexec nowait skipifsilent; Check: not WizardIsTaskSelected('restart')

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""ADHDisplayLauncher"" /F"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""ADHDisplay"""; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""ADHDisplay (mDNS)"""; Flags: runhidden
; Harmless no-op if the "defenderexclusion" task was never selected at install time.
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Remove-MpPreference -ExclusionPath '{app}'; Remove-MpPreference -ExclusionPath '{localappdata}\npm-cache'"""; Flags: runhidden

[UninstallDelete]
; Removes everything npm install / npm run build / the running app generated
; that isn't tracked in [Files], so nothing is left behind in {app}.
; Node.js and Ollama themselves are deliberately left installed by default —
; they're shared system runtimes, not something this app owns (Ollama's own
; removal is instead offered as an explicit, opt-in question during uninstall
; — see CurUninstallStepChanged above — and only when ADHDisplay's own
; installer is what put it there).
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\server\data"
Type: filesandordirs; Name: "{app}\server\uploads"
Type: files; Name: "{app}\.ollama-installed-by-adhdisplay"

[Tasks]
; No "unchecked" flag - Inno checks a task by default unless told otherwise,
; so this is on by default (it's the whole point of installing this on a
; kiosk PC) while still being a visible, untickable choice rather than a
; silent unconditional action.
Name: "autostart"; Description: "Launch automatically when Windows starts (recommended)"; GroupDescription: "Additional shortcuts:"
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "restart"; Description: "Restart Windows when finished"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "installOllama"; Description: "Install Ollama, which runs the AI assistant's local/offline models (recommended)"; GroupDescription: "AI features:"
; Also checked by default: the whole point of bundling the weights is that a new
; kiosk works offline without anyone waiting on a 2.5 GB download. Unticking
; saves that space on this machine, not download size - the model is inside this
; installer either way - and leaves the model to be fetched on demand from
; Settings -> Integrations -> Ollama instead. Has no effect unless "Install
; Ollama" above is also ticked (see ShouldInstallBundledModel).
Name: "bundledModel"; Description: "Include the bundled AI model ({#BundledModelRef}, ~2.5 GB) so no download is needed"; GroupDescription: "AI features:"
Name: "defenderexclusion"; Description: "Add a Windows Defender exclusion for the install folder (helps avoid install failures caused by antivirus interference, e.g. ""corrupted tarball"" errors during npm install)"; GroupDescription: "Troubleshooting:"; Flags: unchecked
; No longer shown on this page interactively - the new "Existing Installation
; Found" wizard page above covers the same Update-vs-Clean-reinstall decision
; when a prior install is detected. Kept declared (INFERRED: Check: WizardSilent
; should exclude it from the interactive page while still allowing
; /TASKS="repair" for scripted/fleet redeploys under /VERYSILENT - confirm
; this exact mechanism during implementation) so silent installs retain a way
; to force a clean reinstall without needing the page.
Name: "repair"; Description: "Force a clean reinstall (delete node_modules and dist before reinstalling)"; GroupDescription: "Troubleshooting:"; Flags: unchecked; Check: WizardSilent

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\start-adhdisplay.bat"
Name: "{group}\{#AppName} (Open in Browser)"; Filename: "{app}\open-in-browser.bat"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start-adhdisplay.bat"; Tasks: desktopicon
