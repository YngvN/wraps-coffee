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
        # Deliberately NOT 'StopAll' - StopAll includes Stop-Tray, which
        # matches any powershell.exe process whose command line contains
        # tray-helper.ps1, including *this currently-running instance*. A
        # forced Stop-Process on itself would bypass this script's own
        # graceful shutdown (the finally block below) entirely -
        # NotifyIcon.Dispose() never runs, leaving a ghost icon in the
        # notification area until the user happens to hover over it. Stopping
        # the server, watchdog, and kiosk window individually here (skipping
        # StopTray) leaves this instance alone to shut itself down cleanly via
        # Application.Exit() below instead. Deliberately does not stop Ollama
        # either - it commonly runs its own separate tray app/lifecycle
        # independent of ADHDisplay, so quitting this app shouldn't reach into
        # that.
        Invoke-Control -Action 'StopWatchdog'
        Invoke-Control -Action 'StopServer'
        Invoke-Control -Action 'StopKioskWindow'
        # Nothing else here - Application.Exit() isn't guaranteed to block
        # until Application.Run() has fully unwound, so code after it in this
        # handler isn't a safe place to assume the message loop has already
        # stopped. Icon/mutex cleanup lives solely in the finally block below.
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
#
# Cleanup lives in this one finally block - not inside the Quit click handler
# - for two reasons: (1) a single release path, so the mutex is never released
# twice regardless of which exit path triggered shutdown; (2) thread affinity
# - Mutex.ReleaseMutex() must be called from the same thread that acquired it
# (unlike a Semaphore), and this finally block, wrapped directly around
# Run() at script scope, is guaranteed to execute on the same thread that
# called $mutex.WaitOne() at startup - relying on a click handler to also run
# on that exact thread isn't a guarantee worth depending on.
try {
    [System.Windows.Forms.Application]::Run()
}
finally {
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    if ($mutex) {
        $mutex.ReleaseMutex()
    }
}
