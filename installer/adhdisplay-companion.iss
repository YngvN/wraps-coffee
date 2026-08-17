; Inno Setup script for the ADHDisplay Companion kiosk installer - the
; Windows counterpart to installer/adhdisplay.iss, but for the separate
; adhdisplay-companion/ Expo app instead of the main dashboard/server.
; Build with Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php):
;   ISCC.exe adhdisplay-companion.iss
; produces Output\ADHDisplayCompanionSetup.exe.
;
; Mirrors adhdisplay.iss section-for-section (see that file's own comments
; for the full rationale behind each pattern) but is deliberately
; self-contained rather than sharing an #include, so this file can never risk
; the working main installer. Structural differences from adhdisplay.iss:
;   - its own AppId GUID, so the two installers/uninstall entries never collide
;   - installs into C:\ADHDisplayCompanion, not C:\ADHDisplay
;   - "npx expo export -p web" in place of "npm run build" (there's no tsc/vite
;     build here - this is an Expo web export)
;   - registers ADHDisplayCompanionLauncher, not ADHDisplayLauncher
;   - no firewall rules - Companion is a pure LAN client (it only ever calls
;     out to an existing ADHDisplay server; the local Electron shell serves
;     its own web export from disk via a custom "app://" protocol handler,
;     see electron/main.cjs - there's no listening socket to open a port for)
;   - StopElectron (in adhdisplay-companion-control.ps1) is scoped to *this
;     app's own* electron.exe by full path, not a bare "taskkill /IM
;     electron.exe" - both this app and the main ADHDisplay app use the same
;     unbranded Electron binary name, so an unscoped kill would also take
;     down the main app's kiosk window if both are ever installed on the same
;     machine
;   - a separate installer/adhdisplay-companion-control.ps1 (not shared with
;     the main app's adhdisplay-control.ps1), matching the same "duplicate
;     rather than risk-share" convention this whole file follows - see that
;     script's own header comment for the process-stop-ordering reasoning
;     specific to Companion's single-Electron-process, blocking-crash-respawn
;     architecture
;   - a tray icon (companion-tray-helper.ps1) offering Restart/Quit only - no
;     "Open Dashboard", since Companion has no web UI of its own to open
;
; Before compiling, this expects installer\node-lts-x64.msi to already exist
; next to this file - the same download adhdisplay.iss's own build step
; produces, shared between both installers rather than downloaded twice.
; installer\adhdisplay.ico is also shared as-is (same physical file, reused
; rather than duplicated - a deliberate decision, not an oversight: it's a
; static, logic-free asset, not the kind of shared Inno Setup/Pascal logic the
; no-#include convention above is protecting against).

#define AppName "ADHDisplay Companion"
#define AppExeName "start-adhdisplay-companion.bat"

[Setup]
; Fresh GUID, distinct from the main app's {{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}
; - see this file's own header comment for why. Hardcoded for the same reason
; as adhdisplay.iss: Inno's own "{{ = literal {" escaping and the
; preprocessor's "{#name}" substitution don't compose safely, and the same
; raw GUID is repeated as a plain string in InitializeSetup below.
AppId={{11D26BBC-4C01-4994-9555-1231DA65E57D}
AppName={#AppName}
; Must stay in sync with the root package.json's own "version" field, along
; with adhdisplay.iss's own AppVersion, adhdisplay-companion/package.json's
; "version", and adhdisplay-companion/app.json's "expo.version" - see
; CLAUDE.md's Versioning rule. All five are bumped together, in the same
; change, on every completed change.
AppVersion=0.2.80
AppPublisher=ADHDisplay
DefaultDirName=C:\ADHDisplayCompanion
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=ADHDisplayCompanionSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=adhdisplay.ico
UninstallDisplayIcon={uninstallexe}
; An Expo project's node_modules plus the Electron binary npm downloads
; during npm install (from GitHub release assets, independent of {app} - see
; HasElectronDownloadAccess below) plus .expo and the web export plausibly
; exceeds the main app's own ~1.5GB estimate, not undercuts it - erring high
; here since the whole point is preventing a mid-install disk-full failure.
; Measure a real install during implementation and adjust upward if needed.
ExtraDiskSpaceRequired=2147483648

[Files]
; Ships the Companion app's full source (including its own nested electron\
; wrapper) in one recursive copy - unlike adhdisplay.iss, which lists several
; sibling directories separately, everything Companion needs already lives
; under one adhdisplay-companion\ folder.
Source: "..\adhdisplay-companion\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion; Excludes: "node_modules\*,dist\*,.expo\*,android\*"
Source: "start-adhdisplay-companion.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "run-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch-companion-tray.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "companion-tray-helper.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "adhdisplay.ico"; DestDir: "{app}"; Flags: ignoreversion
; Same shared download adhdisplay.iss's own build step already produces next
; to this file - not downloaded a second time for this installer.
Source: "node-lts-x64.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not NodeIsInstalled
; Two entries for the same source, same reasoning as adhdisplay.iss: the
; {app} copy is what the launcher/tray call at runtime once installed; the
; {tmp}/dontcopy one is pulled on demand via ExtractTemporaryFile at
; CurStepChanged's ssInstall step, since that runs before Inno's own
; automatic extraction of the {app} copy above.
Source: "adhdisplay-companion-control.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "adhdisplay-companion-control.ps1"; DestDir: "{tmp}"; Flags: dontcopy

[InstallDelete]
; Cleans up shortcuts left over from before the {autoprograms} -> {group} fix
; below - an "Update" install no longer invokes the old uninstaller (see the
; corrected InitializeSetup/CurStepChanged split), which used to be the only
; thing that would have removed these on an upgrade.
Type: files; Name: "{autoprograms}\{#AppName}.lnk"
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

// Same "call npm/node by full path" reasoning as adhdisplay.iss - a Node
// install performed earlier in this same run hasn't refreshed PATH yet.
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

// Companion's build needs the npm registry, same as the main app.
function HasInternetConnection: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('powershell.exe',
    '-NoProfile -Command "try { Invoke-WebRequest -Uri ''https://registry.npmjs.org'' -UseBasicParsing -TimeoutSec 5 -Method Head | Out-Null; exit 0 } catch { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// A second, distinct check - the "electron" npm package's own postinstall
// step downloads its prebuilt binary from GitHub release assets, a different
// host than the npm registry and a common corporate-proxy failure point,
// before npx expo export -p web even runs. One generic reachability check
// isn't a reliable stand-in for both hosts.
function HasElectronDownloadAccess: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('powershell.exe',
    '-NoProfile -Command "try { Invoke-WebRequest -Uri ''https://github.com'' -UseBasicParsing -TimeoutSec 5 -Method Head | Out-Null; exit 0 } catch { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// Pulls one dot-separated numeric part off the front of S (mutating S to the
// remainder) and returns it as an integer, defaulting to 0 for a missing/
// non-numeric part - used by CompareVersions below. Duplicated from
// adhdisplay.iss per this file's own no-shared-code convention.
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
// "0.x.n" scheme - no generic semver library needed.
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

// Only detects a prior install and reads its version - no page creation
// (wizard doesn't exist yet), no process stopping ([Files] under {app}
// haven't been touched yet either), no invoking the old uninstaller (removed
// entirely - see the new wizard page below for why). Both moved to where
// they actually belong: InitializeWizard (page creation) and
// CurStepChanged's ssInstall step (stopping running processes, right before
// the file copy that needs them stopped).
function InitializeSetup(): Boolean;
begin
  Result := True;
  PriorInstallDetected := RegKeyExists(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{11D26BBC-4C01-4994-9555-1231DA65E57D}_is1');
  if PriorInstallDetected then
  begin
    RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{11D26BBC-4C01-4994-9555-1231DA65E57D}_is1', 'DisplayVersion', PriorDisplayVersion);
    if (PriorDisplayVersion <> '') and (CompareVersions('{#SetupSetting("AppVersion")}', PriorDisplayVersion) < 0) and not WizardSilent() then
    begin
      if MsgBox('The version being installed ({#SetupSetting("AppVersion")}) is older than the version already installed (' + PriorDisplayVersion + ').' + #13#10 + #13#10 +
        'Continuing will downgrade ADHDisplay Companion. If that is not what you intended, click Cancel and use the current installer instead.',
        mbConfirmation, MB_OKCANCEL) = IDCANCEL then
        Result := False;
    end;
  end;

  if Result and not WizardSilent() then
  begin
    if not HasInternetConnection() then
      MsgBox('No internet connection was detected. ADHDisplay Companion needs internet access during installation to download Node.js and its dependencies. Setup will continue, but may fail partway through if the connection isn''t restored.',
        mbInformation, MB_OK)
    else if not HasElectronDownloadAccess() then
      MsgBox('The npm registry is reachable, but github.com is not. ADHDisplay Companion''s Electron dependency downloads its own binary from GitHub release assets during "npm install" - a separate host from the npm registry, and a common corporate-proxy failure point. Setup will continue, but may fail partway through if this isn''t reachable when it gets there.',
        mbInformation, MB_OK);
  end;
end;

// Replaces the old MsgBox-based Yes/No/Cancel prompt (whose Yes/No labels
// were actually backwards from what the code did, same bug as adhdisplay.iss
// originally had) with a real wizard page offering an unambiguous choice.
// Neither choice invokes the old installed uninstaller - the existing
// ignoreversion file overwrite already handles a clean update, and "Clean
// reinstall" already handles the deeper case by wiping node_modules/dist/
// .expo (formerly the separate "repair" task, now driven by this page's own
// selection - see WantsCleanReinstall below).
procedure InitializeWizard();
begin
  UpdateChoicePage := CreateInputOptionPage(wpSelectDir,
    'Existing Installation Found',
    'ADHDisplay Companion version ' + PriorDisplayVersion + ' is already installed on this machine.',
    'Choose how you want to proceed, then click Next.',
    True, False);
  UpdateChoicePage.Add('Update (recommended) - refresh the app files');
  UpdateChoicePage.Add('Clean reinstall - also rebuild node_modules, dist and .expo from scratch');
  UpdateChoicePage.SelectedValueIndex := 0;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = UpdateChoicePage.ID then
    // Defaults to "Update" and skips the page entirely under /SILENT or
    // /VERYSILENT, so a scripted/fleet redeploy never blocks waiting for
    // input it can't provide.
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

// Same exit-code-checked Exec() reasoning as adhdisplay.iss's own
// CurStepChanged - plain [Run] entries don't check exit codes, which used to
// let a failed step silently report "completed successfully".
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NpmCmd: String;
  NpxCmd: String;
  ControlScriptTemp: String;
begin
  if CurStep = ssInstall then
  begin
    // Stop everything from a prior running instance *before* Inno's own
    // automatic file copy begins - closing the multi-minute window between
    // the wizard's own dir/tasks pages and the actual npm/expo steps, during
    // which a still-running launcher used to get a chance to hold files open
    // right through the file copy. {app}\adhdisplay-companion-control.ps1
    // isn't on disk yet at this point (fresh install) or is still the
    // *previous* version's copy (upgrade) - pulling it fresh to {tmp} via
    // ExtractTemporaryFile (see the dontcopy [Files] entry above) sidesteps
    // both cases.
    ExtractTemporaryFile('adhdisplay-companion-control.ps1');
    ControlScriptTemp := ExpandConstant('{tmp}\adhdisplay-companion-control.ps1');
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

    // Opt-in (see [Tasks] below) - same antivirus-interference rationale as
    // adhdisplay.iss's own defenderexclusion task.
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
      WizardForm.StatusLabel.Caption := 'Removing node_modules, dist and .expo for a clean reinstall...';
      DelTree(ExpandConstant('{app}\node_modules'), True, True, True);
      DelTree(ExpandConstant('{app}\dist'), True, True, True);
      DelTree(ExpandConstant('{app}\.expo'), True, True, True);
    end;

    NpmCmd := NodeBinDir('') + 'npm.cmd';
    NpxCmd := NodeBinDir('') + 'npx.cmd';

    WizardForm.StatusLabel.Caption := 'Installing dependencies (this can take several minutes)...';
    if not Exec(NpmCmd, 'install', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      MsgBox('npm install failed (exit code ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
        'Setup cannot continue. Check this machine''s internet connection and try again, or open a Command ' +
        'Prompt in ' + ExpandConstant('{app}') + ' and run "npm install" manually to see the full error.',
        mbError, MB_OK);
      Abort;
    end;

    // Pins the exact dependency versions compatible with whatever Expo SDK
    // is current at build time - see adhdisplay-companion/README.md's own
    // "Dev run" section, which already calls this out as a required
    // once-per-clone step.
    WizardForm.StatusLabel.Caption := 'Pinning Expo-compatible dependency versions...';
    if not Exec(NpxCmd, 'expo install --fix', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      MsgBox('npx expo install --fix failed (exit code ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
        'Setup cannot continue. Open a Command Prompt in ' + ExpandConstant('{app}') +
        ' and run "npx expo install --fix" manually to see the full error.', mbError, MB_OK);
      Abort;
    end;

    // Companion's analog of adhdisplay.iss's own "npm run build" - an Expo
    // web export (adhdisplay-companion/dist/) rather than a Vite/tsc build,
    // served at runtime by electron/main.cjs's own "app://" protocol handler.
    WizardForm.StatusLabel.Caption := 'Building the app...';
    if not Exec(NpxCmd, 'expo export -p web', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
    begin
      MsgBox('npx expo export -p web failed (exit code ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
        'Setup cannot continue. Open a Command Prompt in ' + ExpandConstant('{app}') +
        ' and run "npx expo export -p web" manually to see the full error.', mbError, MB_OK);
      Abort;
    end;

    // See [Tasks] below - "autostart" is checked by default, but left
    // visible/optional rather than always silently registering a logon task.
    if WizardIsTaskSelected('autostart') then
    begin
      if not Exec('schtasks.exe', '/Create /TN "ADHDisplayCompanionLauncher" /TR "\"' + ExpandConstant('{app}') +
        '\start-adhdisplay-companion.bat\"" /SC ONLOGON /RL HIGHEST /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
        MsgBox('Could not register the auto-start task (exit code ' + IntToStr(ResultCode) + '). ' +
          'ADHDisplay Companion is installed and can still be launched manually, but won''t start automatically on restart.',
          mbInformation, MB_OK);
    end;
  end;
end;

// Doesn't exist prior to this change - uninstall used to stop nothing before
// [UninstallDelete] tried to remove node_modules/dist/.expo, which is why a
// still-running Electron process (kept alive by :launch_loop's own
// crash-respawn retry) could hold locks on those files during an uninstall.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    // {app}\adhdisplay-companion-control.ps1 is still on disk here - Inno's
    // own uninstall engine removes [Files]-tracked files *after* this step
    // fires, not before, so no ExtractTemporaryFile-style workaround is
    // needed on the uninstall side the way it was for ssInstall above.
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\adhdisplay-companion-control.ps1') + '" -Action StopAll -AppDir "' + ExpandConstant('{app}') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end
  else if CurUninstallStep = usPostUninstall then
  begin
    // A post-uninstall question rather than an install-time-style checkbox,
    // matching how most uninstallers behave.
    if MsgBox('ADHDisplay Companion has been uninstalled. Restart Windows now?', mbConfirmation, MB_YESNO) = IDYES then
      Exec('shutdown.exe', '/r /t 5', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

[Run]
; No firewall rules here, unlike adhdisplay.iss - Companion only ever calls
; out to an existing ADHDisplay server on the LAN; its own Electron shell
; serves its web export from disk (no listening socket), so there's nothing
; for another device to need to reach on this machine. Skipped if "restart" is
; selected below - launching the kiosk just to immediately reboot it doesn't
; make sense (Inno's own Finish page likely already suppresses this when a
; restart is pending, but this is kept as free belt-and-braces insurance
; either way).
Filename: "{app}\start-adhdisplay-companion.bat"; Description: "Launch ADHDisplay Companion now"; Flags: postinstall shellexec nowait skipifsilent; Check: not WizardIsTaskSelected('restart')

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""ADHDisplayCompanionLauncher"" /F"; Flags: runhidden
; Harmless no-op if the "defenderexclusion" task was never selected at install time.
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Remove-MpPreference -ExclusionPath '{app}'; Remove-MpPreference -ExclusionPath '{localappdata}\npm-cache'"""; Flags: runhidden

[UninstallDelete]
; Removes everything npm install / npx expo export / the running app
; generated that isn't tracked in [Files]. Node.js itself is deliberately
; left installed, same as adhdisplay.iss. No server\data/uploads equivalent
; to clean up here - Companion has no server-side persisted state of its own;
; its pairing/connection state lives in the Electron renderer's own local
; storage, not touched by uninstall (same as leaving Node.js installed - not
; something this app owns).
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\.expo"
Type: filesandordirs; Name: "{app}\logs"

[Tasks]
Name: "autostart"; Description: "Launch automatically when Windows starts (recommended)"; GroupDescription: "Additional shortcuts:"
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "restart"; Description: "Restart Windows when finished"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "defenderexclusion"; Description: "Add a Windows Defender exclusion for the install folder (helps avoid install failures caused by antivirus interference, e.g. ""corrupted tarball"" errors during npm install)"; GroupDescription: "Troubleshooting:"; Flags: unchecked
; No longer shown on this page interactively - the new "Existing Installation
; Found" wizard page above covers the same Update-vs-Clean-reinstall decision
; when a prior install is detected. Kept declared (INFERRED: Check:
; WizardSilent should exclude it from the interactive page while still
; allowing /TASKS="repair" for scripted/fleet redeploys under /VERYSILENT -
; confirm this exact mechanism during implementation, same caveat as
; adhdisplay.iss's own equivalent) so silent installs retain a way to force a
; clean reinstall without needing the page.
Name: "repair"; Description: "Force a clean reinstall (delete node_modules, dist and .expo before reinstalling)"; GroupDescription: "Troubleshooting:"; Flags: unchecked; Check: WizardSilent

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\start-adhdisplay-companion.bat"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start-adhdisplay-companion.bat"; Tasks: desktopicon
