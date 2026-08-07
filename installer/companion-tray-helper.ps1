# System tray icon for ADHDisplay Companion. Unlike the main app's
# tray-helper.ps1, there's no "server can run without the window open"
# justification here - Companion is a single Electron process, and
# start-adhdisplay-companion.bat's :launch_loop immediately reopens the
# window if it closes regardless. This exists for a narrower, more direct
# reason: there is otherwise no clean way to quit Companion at all - closing
# the window just triggers a relaunch, and stopping it requires Task Manager
# or ending the scheduled task by hand. No "Open Dashboard" item - Companion
# has no web UI of its own to open.
#
# Requires STA (Single-Threaded Apartment) - see launch-companion-tray.bat's
# own `powershell -STA` invocation.

param()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = $PSScriptRoot
$ControlScript = Join-Path $ScriptDir 'adhdisplay-companion-control.ps1'
$IconPath = Join-Path $ScriptDir 'adhdisplay.ico'

# Single-instance guard, own mutex name distinct from the main app's tray
# (Global\ADHDisplayTrayHelper) so both can run simultaneously on a machine
# with both apps installed without colliding.
$mutex = New-Object System.Threading.Mutex($false, 'Global\ADHDisplayCompanionTrayHelper')
if (-not $mutex.WaitOne(0, $false)) {
    exit 0
}

# Runs adhdisplay-companion-control.ps1 as a separate hidden process rather
# than dot-sourcing its functions in-process - keeps one well-tested
# implementation shared with the installer/uninstaller and the launcher,
# invoked identically everywhere (-NoProfile -ExecutionPolicy Bypass -File).
function Invoke-Control {
    param(
        [Parameter(Mandatory = $true)][string]$Action,
        [switch]$WaitForRelease
    )
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ControlScript`" -Action $Action -AppDir `"$ScriptDir`""
    if ($WaitForRelease) { $arguments += ' -WaitForRelease' }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = $arguments
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit()
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
$notifyIcon.Text = 'ADHDisplay Companion'
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$restartItem = $menu.Items.Add('Restart Companion')
$restartItem.add_Click({
        $notifyIcon.Text = 'ADHDisplay Companion - restarting...'
        # No -WaitForRelease: nothing is about to overwrite the file here,
        # and waiting would race :launch_loop's own ~3s retry (which reopens
        # the same path as a new process while the poll is still running),
        # making Restart appear to hang for ~20s even though the app is back
        # up within 3. No StopLauncher either - :launch_loop's own retry is
        # exactly what's supposed to relaunch it.
        Invoke-Control -Action 'StopElectron'
    })

$quitItem = $menu.Items.Add('Quit Companion')
$quitItem.add_Click({
        # Deliberately NOT 'StopAll' - StopAll includes StopTray, which
        # matches any powershell.exe process whose command line contains
        # companion-tray-helper.ps1, including this currently-running
        # instance. A forced Stop-Process on itself would bypass this
        # script's own graceful shutdown (the finally block below) entirely -
        # NotifyIcon.Dispose() never runs, leaving a ghost icon in the
        # notification area. StopLauncher must run before StopElectron -
        # :launch_loop runs Electron inline and blocks on it, so killing
        # Electron first doesn't prevent a relaunch, it causes one (the
        # blocking command just returns and the loop retries in ~3s
        # regardless of what killed it).
        Invoke-Control -Action 'StopLauncher'
        Invoke-Control -Action 'StopElectron'
        # Nothing else here - Application.Exit() isn't guaranteed to block
        # until Application.Run() has fully unwound, so code after it in this
        # handler isn't a safe place to assume the message loop has already
        # stopped. Icon/mutex cleanup lives solely in the finally block below.
        [System.Windows.Forms.Application]::Exit()
    })

$notifyIcon.ContextMenuStrip = $menu

# No main form - a NotifyIcon-only app is a standard use of Application.Run()
# with no argument, keeping the message loop (and therefore menu clicks)
# alive until Application.Exit() is called above.
#
# Cleanup lives in this one finally block - not inside the Quit click handler
# - for two reasons: (1) a single release path, so the mutex is never
# released twice regardless of which exit path triggered shutdown; (2) thread
# affinity - Mutex.ReleaseMutex() must be called from the same thread that
# acquired it (unlike a Semaphore), and this finally block, wrapped directly
# around Run() at script scope, is guaranteed to execute on the same thread
# that called $mutex.WaitOne() at startup - relying on a click handler to
# also run on that exact thread isn't a guarantee worth depending on.
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
