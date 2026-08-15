; Inno Setup script for the ADHDisplay kiosk PC installer.
; Build with Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php):
;   ISCC.exe adhdisplay.iss
; produces Output\ADHDisplaySetup.exe. See the project's chat/README notes
; for the full build + install + uninstall walkthrough.
;
; Before compiling, download the Node.js LTS Windows x64 installer from
; https://nodejs.org/en/download and place it next to this file renamed to
; node-lts-x64.msi (not committed to the repo — it's a large third-party binary).
; Ollama's own installer is NOT bundled the same way — it's downloaded to {tmp}
; at install time instead (see CurStepChanged), since embedding it in [Files]
; would ship it inside ADHDisplaySetup.exe for every downloader regardless of
; whether the "Install Ollama" task ends up selected.
;
; The [Files] section below also embeds the Companion app's Android TV APK
; (built from ../adhdisplay-companion via `npm run build:tv`, not committed to
; the repo either — see that project's own README "Building a release APK for
; Android TV" section) so it ships inside the {app}\android-apk folder, ready
; to copy to a USB stick per ../docs/INSTALL-TV.md. Since Inno resolves that
; [Files] glob at compile time, the APK must already exist in
; ../adhdisplay-companion/dist before running ISCC — run build-with-apk.ps1
; (next to this file) instead of invoking ISCC directly to handle both steps
; in one command.

#define AppName "ADHDisplay"
#define AppExeName "start-adhdisplay.bat"

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
AppVersion=0.2.52
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
; ~1.5 GB on top of the source files Inno's own estimate already covers, for
; node_modules + dist (neither is shipped in [Files] - both are generated on
; the target machine by npm install / npm run build below).
ExtraDiskSpaceRequired=1610612736

[Files]
Source: "..\src\*"; DestDir: "{app}\src"; Flags: recursesubdirs ignoreversion
Source: "..\server\*"; DestDir: "{app}\server"; Flags: recursesubdirs ignoreversion; Excludes: "data\*,uploads\*"
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
    MsgBox('No internet connection was detected. ADHDisplay needs internet access during installation to download Node.js and its dependencies' + #13#10 + #13#10 +
      '(and, if selected, Ollama and its AI models). Setup will continue, but may fail partway through if the connection isn''t restored.',
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
begin
  UpdateChoicePage := CreateInputOptionPage(wpSelectDir,
    'Existing Installation Found',
    'ADHDisplay version ' + PriorDisplayVersion + ' is already installed on this machine.',
    'Choose how you want to proceed, then click Next.',
    True, False);
  UpdateChoicePage.Add('Update (recommended) - keep your data, refresh the app files');
  UpdateChoicePage.Add('Clean reinstall - also rebuild node_modules and dist from scratch');
  UpdateChoicePage.SelectedValueIndex := 0;
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
  OllamaSetupPath: String;
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
    if WizardIsTaskSelected('installOllama') and WizardIsTaskSelected('restart') then
      MsgBox('Both "Install Ollama and its models" and "Restart Windows when finished" are selected.' + #13#10 + #13#10 +
        'Model downloads continue in the background after Setup finishes and can take a while - restarting Windows now will interrupt them. ' +
        'You can re-download them later from Settings -> Integrations -> Ollama if that happens.',
        mbInformation, MB_OK);

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

    // Opt-in (see [Tasks] below), checked by default. Ollama itself is
    // downloaded to {tmp} at install time rather than bundled in [Files] -
    // see the header comment - so a machine that never selects this task
    // never downloads it at all. Model pulls run in the background (via
    // pull-ollama-models.bat, hidden through run-hidden.vbs) rather than
    // blocking here, since two ~3B models is a multi-GB download that would
    // otherwise freeze the wizard for a long, unpredictable time with no
    // progress or cancel.
    if WizardIsTaskSelected('installOllama') then
    begin
      OllamaWasInstalled := OllamaIsInstalled;
      if not OllamaWasInstalled then
      begin
        WizardForm.StatusLabel.Caption := 'Downloading Ollama...';
        OllamaSetupPath := ExpandConstant('{tmp}\OllamaSetup.exe');
        Exec('powershell.exe',
          '-NoProfile -Command "try { Invoke-WebRequest -Uri ''https://ollama.com/download/OllamaSetup.exe'' -OutFile ''' + OllamaSetupPath + ''' -UseBasicParsing; exit 0 } catch { exit 1 }"',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        if (ResultCode = 0) and FileExists(OllamaSetupPath) then
        begin
          WizardForm.StatusLabel.Caption := 'Installing Ollama...';
          // INFERRED silent-install flags (Ollama's Windows installer is,
          // per its own public behaviour, also Inno-Setup-based) - confirm
          // against a real download during implementation/testing.
          if not Exec(OllamaSetupPath, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
            MsgBox('Installing Ollama failed (exit code ' + IntToStr(ResultCode) + '). ADHDisplay will still work, just without local AI models. You can install Ollama manually later from ollama.com.',
              mbInformation, MB_OK);
        end
        else
          MsgBox('Downloading Ollama failed. ADHDisplay will still work, just without local AI models. You can install Ollama manually later from ollama.com.',
            mbInformation, MB_OK);

        // Only written when we're the one who installed it - uninstall reads
        // this back to decide whether it's safe to offer removing Ollama too
        // (never touching a copy that was already there independently).
        if OllamaIsInstalled then
          SaveStringToFile(ExpandConstant('{app}\.ollama-installed-by-adhdisplay'), 'installed by ADHDisplay setup', False);
      end;

      if OllamaIsInstalled then
      begin
        WizardForm.StatusLabel.Caption := 'Starting the AI model download in the background (check Settings -> Integrations -> Ollama for progress)...';
        Exec('wscript.exe', '//B "' + ExpandConstant('{app}\run-hidden.vbs') + '" "' + ExpandConstant('{app}\pull-ollama-models.bat') + '"',
          ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode);
      end;
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
      if MsgBox('Also remove Ollama and its downloaded models (roughly 4 GB)?', mbConfirmation, MB_YESNO) = IDYES then
      begin
        // INFERRED uninstall path for Ollama's own Windows installer -
        // confirm the exact location during implementation/testing.
        if FileExists(OllamaBinDir + 'unins000.exe') then
          Exec(OllamaBinDir + 'unins000.exe', '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        DelTree(ExpandConstant('{localappdata}') + '\Programs\Ollama', True, True, True);
        DelTree(ExpandConstant('{%USERPROFILE}') + '\.ollama', True, True, True);
      end;
    end;
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
Name: "installOllama"; Description: "Install Ollama and the AI assistant's local models (recommended)"; GroupDescription: "AI features:"
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
