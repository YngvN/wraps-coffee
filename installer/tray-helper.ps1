# System tray icon for ADHDisplay, tied to the server's own lifecycle rather
# than either kiosk window mode (Electron or Edge) - the server can keep
# running even after the kiosk window is closed, so the tray shouldn't be
# owned by either window mode. Launched once from start-adhdisplay.bat's
# top-level body (via launch-tray.bat), independent of :start_server, so it
# survives a server restart and keeps running even if the kiosk window is
# later closed manually.
#
# Requires STA (Single-Threaded Apartment) - see launch-tray.bat's own
# `powershell -STA` invocation.

param()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = $PSScriptRoot
$ControlScript = Join-Path $ScriptDir 'adhdisplay-control.ps1'
$IconPath = Join-Path $ScriptDir 'adhdisplay.ico'
$LogsDir = Join-Path $ScriptDir 'logs'
$SentinelPath = Join-Path $LogsDir '.restart-requested'
$DashboardUrl = 'http://localhost:4173/admin/login'
$HealthUrl = 'http://localhost:4173/admin/login'

# Single-instance guard: a second launch (e.g. the desktop/Start Menu
# shortcut used manually while the scheduled task's own instance is already
# running) exits immediately rather than creating a duplicate tray icon.
# "Global\" scope so this holds regardless of which session launched it.
$mutex = New-Object System.Threading.Mutex($false, 'Global\ADHDisplayTrayHelper')
if (-not $mutex.WaitOne(0, $false)) {
    exit 0
}

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# Runs adhdisplay-control.ps1 as a separate hidden process rather than
# dot-sourcing its functions in-process - keeps one well-tested
# implementation shared with the installer/uninstaller and the watchdog,
# invoked identically everywhere (-NoProfile -ExecutionPolicy Bypass -File).
function Invoke-Control {
    param([Parameter(Mandatory = $true)][string]$Action)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ControlScript`" -Action $Action -AppDir `"$ScriptDir`""
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit()
}

function Test-ServerHealthy {
    try {
        Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

try {
    $icon = New-Object System.Drawing.Icon($IconPath)
}
catch {
    # Best-effort fallback so a missing/corrupted icon file doesn't take the
    # whole tray helper down - a generic system icon still gives the user a
    # working menu.
    $icon = [System.Drawing.SystemIcons]::Application
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $icon
$notifyIcon.Text = 'ADHDisplay'
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add('Open Dashboard')
$openItem.add_Click({
        Start-Process $DashboardUrl
    })

$restartItem = $menu.Items.Add('Restart Server')
$restartItem.add_Click({
        $notifyIcon.Text = 'ADHDisplay - restarting...'
        # StopServer already polls until ports 4000/4173 are confirmed free
        # before returning (see adhdisplay-control.ps1) - only after that
        # succeeds is the sentinel written below, so the watchdog's own
        # relaunch (triggered by seeing this file - see start-adhdisplay.bat's
        # :server_watchdog) never races a still-bound port. Relaunching itself
        # stays the watchdog's sole responsibility - if this also relaunched
        # the server directly, the watchdog would notice the same health-check
        # failure a few seconds later and relaunch it *again*, two
        # `npm run preview:kiosk` trees fighting over the same ports.
        Invoke-Control -Action 'StopServer'
        New-Item -ItemType File -Path $SentinelPath -Force | Out-Null
    })

$quitItem = $menu.Items.Add('Quit ADHDisplay')
$quitItem.add_Click({
        $notifyIcon.Visible = $false
        # Stops the server, the watchdog (and, with it, the scheduled task
        # instance - otherwise the watchdog just relaunches everything a few
        # seconds later), the kiosk window, and this tray helper itself.
        # Deliberately does not stop Ollama - it commonly runs its own
        # separate tray app/lifecycle independent of ADHDisplay, so quitting
        # this app shouldn't reach into that.
        Invoke-Control -Action 'StopAll'
        # Mutex release happens once, in the single cleanup path after
        # Application.Run() returns below - Exit() causes Run() to return
        # right into that same cleanup, so releasing it here too would throw
        # (a mutex this thread no longer owns can't be released twice).
        [System.Windows.Forms.Application]::Exit()
    })

$notifyIcon.ContextMenuStrip = $menu

# Reflects server status in the tooltip - a WinForms Timer runs on the same
# UI thread as the Application.Run() message loop below, so no extra
# synchronization is needed around $notifyIcon.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.add_Tick({
        if (Test-ServerHealthy) {
            $notifyIcon.Text = 'ADHDisplay - running'
        }
        else {
            $notifyIcon.Text = 'ADHDisplay - not responding'
        }
    })
$timer.Start()

# No main form - a NotifyIcon-only app is a standard use of Application.Run()
# with no argument, keeping the message loop (and therefore menu clicks and
# the timer) alive until Application.Exit() is called above.
[System.Windows.Forms.Application]::Run()

$notifyIcon.Visible = $false
$notifyIcon.Dispose()
if ($mutex) {
    $mutex.ReleaseMutex()
}
