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
;   - StopRunningProcesses is scoped to *this app's own* electron.exe by full
;     path, not a bare "taskkill /IM electron.exe" - both this app and the
;     main ADHDisplay app use the same unbranded Electron binary name, so an
;     unscoped kill would also take down the main app's kiosk window if both
;     are ever installed on the same machine
;
; Before compiling, this expects installer\node-lts-x64.msi to already exist
; next to this file - the same download adhdisplay.iss's own build step
; produces, shared between both installers rather than downloaded twice.

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
AppVersion=0.2.9
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

[Files]
; Ships the Companion app's full source (including its own nested electron\
; wrapper) in one recursive copy - unlike adhdisplay.iss, which lists several
; sibling directories separately, everything Companion needs already lives
; under one adhdisplay-companion\ folder.
Source: "..\adhdisplay-companion\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion; Excludes: "node_modules\*,dist\*,.expo\*,android\*"
Source: "start-adhdisplay-companion.bat"; DestDir: "{app}"; Flags: ignoreversion
; Same shared download adhdisplay.iss's own build step already produces next
; to this file - not downloaded a second time for this installer.
Source: "node-lts-x64.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not NodeIsInstalled

[Code]
function NodeIsInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Node.js');
end;

// Stops this app's own running Electron process so neither an in-place
// update/repair nor a full uninstall runs into locked files - scoped to
// *this app's own* electron.exe by full path (not a bare "taskkill /IM
// electron.exe", unlike an earlier draft) because the main ADHDisplay app
// uses the exact same unbranded Electron binary name; an unscoped kill would
// also take down that app's own kiosk window if both happen to be installed
// on the same machine. Tries a plain Stop-Process first, only falls back to
// -Force if still running a moment later - same shape as adhdisplay.iss's
// own StopRunningProcesses.
procedure StopRunningProcesses();
var
  ResultCode: Integer;
begin
  Exec('powershell.exe',
    '-NoProfile -Command "' +
    '$path = ' + #39 + ExpandConstant('{app}') + '\node_modules\electron\dist\electron.exe' + #39 + '; ' +
    '$ids = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq ' + #39 + 'electron.exe' + #39 + ' -and $_.ExecutablePath -eq $path } | Select-Object -ExpandProperty ProcessId; ' +
    'foreach ($procId in $ids) { Stop-Process -Id $procId -ErrorAction SilentlyContinue }; ' +
    'Start-Sleep -Milliseconds 1500; ' +
    '$ids = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq ' + #39 + 'electron.exe' + #39 + ' -and $_.ExecutablePath -eq $path } | Select-Object -ExpandProperty ProcessId; ' +
    'foreach ($procId in $ids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// Same "already installed?" Yes/No/Cancel prompt as adhdisplay.iss, looked
// up against this installer's own GUID's uninstall registry key so it never
// confuses itself with the main app's install.
function InitializeSetup(): Boolean;
var
  UninstallString: String;
  ResultCode: Integer;
begin
  Result := True;
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{11D26BBC-4C01-4994-9555-1231DA65E57D}_is1', 'UninstallString', UninstallString) then
  begin
    case MsgBox('ADHDisplay Companion is already installed.' + #13#10 + #13#10 +
      'Click Yes to uninstall the existing version first (recommended), or No to install over it as-is.',
      mbConfirmation, MB_YESNOCANCEL) of
      IDYES:
        StopRunningProcesses();
      IDNO:
        begin
          UninstallString := RemoveQuotes(UninstallString);
          Exec(UninstallString, '/SILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
        end;
      IDCANCEL:
        Result := False;
    end;
  end;
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

// Same exit-code-checked Exec() reasoning as adhdisplay.iss's own
// CurStepChanged - plain [Run] entries don't check exit codes, which used to
// let a failed step silently report "completed successfully".
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NpmCmd: String;
  NpxCmd: String;
begin
  if CurStep = ssPostInstall then
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

    // Opt-in (see [Tasks] below) - deletes node_modules/dist/.expo before
    // reinstalling, for when a plain update-in-place doesn't fix a broken
    // install. Harmless no-op on a fresh install.
    if WizardIsTaskSelected('repair') then
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

[Run]
; No firewall rules here, unlike adhdisplay.iss - Companion only ever calls
; out to an existing ADHDisplay server on the LAN; its own Electron shell
; serves its web export from disk (no listening socket), so there's nothing
; for another device to need to reach on this machine.
Filename: "{app}\start-adhdisplay-companion.bat"; Description: "Launch ADHDisplay Companion now"; Flags: postinstall shellexec nowait skipifsilent

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
Name: "defenderexclusion"; Description: "Add a Windows Defender exclusion for the install folder (helps avoid install failures caused by antivirus interference, e.g. ""corrupted tarball"" errors during npm install)"; GroupDescription: "Troubleshooting:"; Flags: unchecked
Name: "repair"; Description: "Force a clean reinstall (delete node_modules, dist and .expo before reinstalling - use if updating doesn't fix a broken install)"; GroupDescription: "Troubleshooting:"; Flags: unchecked

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\start-adhdisplay-companion.bat"
Name: "{autoprograms}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start-adhdisplay-companion.bat"; Tasks: desktopicon
