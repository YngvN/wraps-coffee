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
AppVersion=1.0
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

// Runs before the wizard even shows its first page. Without this, running the
// installer again just overwrites the existing install's files in place with
// no warning - which is fine for the app files themselves (ignoreversion), but
// silently re-runs the full "install Node/npm install/npm build" sequence
// every time and gives no chance to cleanly remove a previous install first.
function InitializeSetup(): Boolean;
var
  UninstallString: String;
  ResultCode: Integer;
begin
  Result := True;
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{E4B0C442-1B1D-4B7A-9C2E-2D6D6E9E5A11}_is1', 'UninstallString', UninstallString) then
  begin
    case MsgBox('Wraps & Coffee is already installed.' + #13#10 + #13#10 +
      'Click Yes to uninstall the existing version first (recommended), or No to install over it as-is.',
      mbConfirmation, MB_YESNOCANCEL) of
      IDYES:
        begin
          UninstallString := RemoveQuotes(UninstallString);
          Exec(UninstallString, '/SILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
        end;
      IDCANCEL:
        Result := False;
      // IDNO: fall through and install over the existing copy.
    end;
  end;
end;

// Used as {code:NodeBinDir} in [Run] below to call npm/node by full path
// rather than relying on PATH, since a Node install performed earlier in this
// same installer run hasn't refreshed this process's environment yet.
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

[Run]
; 1. Install Node.js only if it isn't already present.
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\node-lts-x64.msi"" /qn /norestart"; StatusMsg: "Installing Node.js..."; Check: not NodeIsInstalled; Flags: waituntilterminated

; 2. Install dependencies (this also runs Electron's own postinstall download)
;    and build the frontend. Full path to npm.cmd — see NodeBinDir above.
Filename: "{code:NodeBinDir}npm.cmd"; Parameters: "install"; WorkingDir: "{app}"; StatusMsg: "Installing dependencies (this can take several minutes)..."; Flags: runhidden waituntilterminated
Filename: "{code:NodeBinDir}npm.cmd"; Parameters: "run build"; WorkingDir: "{app}"; StatusMsg: "Building the app..."; Flags: runhidden waituntilterminated

; 3. Open the ports the local server and preview server listen on, so other
;    devices on the cafe's LAN (kiosk screens, a second admin's phone) can
;    reach this machine without a firewall prompt with nobody there to click
;    "Allow". profile=any is deliberate: this machine is expected to stay on
;    one trusted network, not roam between networks like a laptop would.
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Wraps & Coffee"" dir=in action=allow protocol=TCP localport=4000,4173 profile=any"; Flags: runhidden

; 4. Register the real auto-start-on-restart mechanism: fires at every logon,
;    i.e. every restart of a kiosk PC that auto-logs-in one user.
Filename: "schtasks.exe"; Parameters: "/Create /TN ""WrapsCoffeeLauncher"" /TR ""\""{app}\start-wraps-coffee.bat\"""" /SC ONLOGON /RL HIGHEST /F"; Flags: runhidden

; 5. Offer to launch right away, without waiting for a restart. "nowait" is
;    required here: the script's own watchdog loop never returns, so waiting
;    for it to exit would leave the wizard's Finish page open forever.
Filename: "{app}\start-wraps-coffee.bat"; Description: "Launch Wraps & Coffee now"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""WrapsCoffeeLauncher"" /F"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Wraps & Coffee"""; Flags: runhidden

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
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\start-wraps-coffee.bat"
Name: "{autoprograms}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start-wraps-coffee.bat"; Tasks: desktopicon
