; Inno Setup script for the Wraps & Coffee kiosk PC installer.
; Build with Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php):
;   ISCC.exe wraps-coffee.iss
; produces Output\WrapsCoffeeSetup.exe. See the project's chat/README notes
; for the full build + install + uninstall walkthrough.
;
; Before compiling, download the Node.js LTS Windows x64 installer from
; https://nodejs.org/en/download and place it next to this file renamed to
; node-lts-x64.msi (not committed to the repo — it's a large third-party binary).

#define AppName "Wraps & Coffee"
#define AppExeName "start-wraps-coffee.bat"
; Keep this in sync with package.json's own "version" field (also what the
; running app reports at GET /server-info and shows in Settings -> About) -
; the two are separate files with no automated link between them, so a
; version bump needs both edited together.
#define AppVersion "0.1"

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
AppVersion={#AppVersion}
AppPublisher=Wraps & Coffee
DefaultDirName=C:\WrapsCoffee
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=WrapsCoffeeSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

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
Source: "start-wraps-coffee.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "open-in-browser.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "print-qr.cjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "node-lts-x64.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not NodeIsInstalled

; Ensure these exist even though their gitignored contents are excluded above —
; the local server writes into them on first boot (see server/store.ts / uploads.ts).
[Dirs]
Name: "{app}\server\data"
Name: "{app}\server\uploads"

[Code]
function NodeIsInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Node.js');
end;

// Stops this app's own running processes so neither an in-place update/repair
// nor a full uninstall runs into locked files - scoped to the app's own ports
// (4000 = the sync server, 4173 = vite preview) rather than a blanket "kill
// every node.exe on this machine", which would also take down unrelated Node
// processes. Tries a plain Stop-Process first (lets the server's own
// SIGTERM-equivalent graceful shutdown - see server/index.ts's shutdown() -
// run) and only falls back to -Force if something's still listening a moment
// later. Also used by [UninstallRun] below (as plain commands there, since
// that section can't call into this script's own Pascal procedures).
procedure StopRunningProcesses();
var
  ResultCode: Integer;
begin
  Exec('powershell.exe',
    '-NoProfile -Command "' +
    '$ids = Get-NetTCPConnection -LocalPort 4000,4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; ' +
    'foreach ($procId in $ids) { Stop-Process -Id $procId -ErrorAction SilentlyContinue }; ' +
    'Start-Sleep -Milliseconds 1500; ' +
    '$ids = Get-NetTCPConnection -LocalPort 4000,4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; ' +
    'foreach ($procId in $ids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM electron.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// Runs before the wizard even shows its first page. Without this, running the
// installer again just overwrites the existing install's files in place with
// no warning - which is fine for the app files themselves (ignoreversion), but
// silently re-runs the full "install Node/npm install/npm build" sequence
// every time and gives no chance to cleanly remove a previous install first,
// or to stop the running app before touching its own files.
function InitializeSetup(): Boolean;
var
  UninstallString: String;
  InstalledVersion: String;
  ResultCode: Integer;
begin
  Result := True;
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}_is1', 'UninstallString', UninstallString) then
  begin
    if not RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}_is1', 'DisplayVersion', InstalledVersion) then
      InstalledVersion := 'an unknown version';

    case MsgBox('Wraps & Coffee ' + InstalledVersion + ' is already installed. This installer is version {#AppVersion}.' + #13#10 + #13#10 +
      'Click Yes to update in place (keeps your data, stops the running app first - recommended), ' +
      'No to uninstall completely and install fresh, or Cancel to stop.',
      mbConfirmation, MB_YESNOCANCEL) of
      IDYES:
        // Update in place - stop whatever's running so files aren't locked,
        // then fall through to the normal install steps below
        // (CurStepChanged), which already overwrite [Files] (ignoreversion)
        // and re-run npm install / npm run build. Data (server\data,
        // server\uploads) is excluded from [Files], so it's untouched.
        // Tick the "repair" task (see [Tasks] below) on the next wizard page
        // for a clean node_modules/dist wipe too, if a plain update alone
        // doesn't fix a broken install.
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

// Node install / npm install / npm run build / scheduled-task registration
// used to be plain [Run] entries, but Inno's [Run] section does not check
// exit codes - if any of these failed, Setup silently moved on and reported
// "completed successfully" regardless, leaving an install with no dist/ and
// no node_modules and no way to tell why. Running them here via Exec lets
// each one's exit code actually be checked and surfaced.
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NpmCmd: String;
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

    // Opt-in (see [Tasks] below) - for when a plain update-in-place doesn't
    // fix a broken install (corrupted node_modules, a stale/half-built
    // dist). Deleted before npm install/build below so both regenerate
    // from scratch; harmless no-op on a fresh install where neither exists yet.
    if WizardIsTaskSelected('repair') then
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

    // See [Tasks] below - "autostart" is checked by default (it's the whole
    // point of this installer), but left visible/optional rather than always
    // silently registering a logon task.
    if WizardIsTaskSelected('autostart') then
    begin
      if not Exec('schtasks.exe', '/Create /TN "WrapsCoffeeLauncher" /TR "\"' + ExpandConstant('{app}') +
        '\start-wraps-coffee.bat\"" /SC ONLOGON /RL HIGHEST /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
        MsgBox('Could not register the auto-start task (exit code ' + IntToStr(ResultCode) + '). ' +
          'Wraps & Coffee is installed and can still be launched manually, but won''t start automatically on restart.',
          mbInformation, MB_OK);
    end;
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
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Wraps & Coffee"" dir=in action=allow protocol=TCP localport=4000,4173 profile=any"; Flags: runhidden

; Same reasoning as above, but for mDNS (UDP 5353) - the port bonjour-service
; needs both to advertise this machine's own "<store name>.local" screen
; address (see server/mdns.ts) and to browse for a server's presence during
; first-run role setup (see electron/roleSetup.cjs). Without this rule the
; multicast traffic is silently dropped and .local names never publish or
; resolve, even though the app-level feature itself is otherwise working.
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Wraps & Coffee (mDNS)"" dir=in action=allow protocol=UDP localport=5353 profile=any"; Flags: runhidden

; Offer to launch right away, without waiting for a restart. "nowait" is
; required here: the script's own watchdog loop never returns, so waiting
; for it to exit would leave the wizard's Finish page open forever.
Filename: "{app}\start-wraps-coffee.bat"; Description: "Launch Wraps & Coffee now"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
; Stop the running app first - same reasoning and port-scoped approach as
; StopRunningProcesses in [Code] above (this section can't call into that
; Pascal procedure directly, so the same commands are repeated here as plain
; entries). Without this, the [UninstallDelete] section below can fail to
; remove node_modules/dist/etc. while the server/kiosk window still has them
; open, and the app itself would keep running even though its scheduled task
; is gone until the next reboot.
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""$ids = Get-NetTCPConnection -LocalPort 4000,4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $ids) {{ Stop-Process -Id $procId -ErrorAction SilentlyContinue }}; Start-Sleep -Milliseconds 1500; $ids = Get-NetTCPConnection -LocalPort 4000,4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $ids) {{ Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }}"""; Flags: runhidden
Filename: "taskkill.exe"; Parameters: "/F /IM electron.exe"; Flags: runhidden
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""WrapsCoffeeLauncher"" /F"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Wraps & Coffee"""; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Wraps & Coffee (mDNS)"""; Flags: runhidden
; Harmless no-op if the "defenderexclusion" task was never selected at install time.
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Remove-MpPreference -ExclusionPath '{app}'; Remove-MpPreference -ExclusionPath '{localappdata}\npm-cache'"""; Flags: runhidden

[UninstallDelete]
; Removes everything npm install / npm run build / the running app generated
; that isn't tracked in [Files], so nothing is left behind in {app}.
; Node.js itself is deliberately left installed — it's a shared system
; runtime, not something this app owns.
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\server\data"
Type: filesandordirs; Name: "{app}\server\uploads"

[Tasks]
; No "unchecked" flag - Inno checks a task by default unless told otherwise,
; so this is on by default (it's the whole point of installing this on a
; kiosk PC) while still being a visible, untickable choice rather than a
; silent unconditional action.
Name: "autostart"; Description: "Launch automatically when Windows starts (recommended)"; GroupDescription: "Additional shortcuts:"
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "defenderexclusion"; Description: "Add a Windows Defender exclusion for the install folder (helps avoid install failures caused by antivirus interference, e.g. ""corrupted tarball"" errors during npm install)"; GroupDescription: "Troubleshooting:"; Flags: unchecked
Name: "repair"; Description: "Force a clean reinstall (delete node_modules and dist before reinstalling - use if updating doesn't fix a broken install)"; GroupDescription: "Troubleshooting:"; Flags: unchecked

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\start-wraps-coffee.bat"
Name: "{autoprograms}\{#AppName} (Open in Browser)"; Filename: "{app}\open-in-browser.bat"
Name: "{autoprograms}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start-wraps-coffee.bat"; Tasks: desktopicon
