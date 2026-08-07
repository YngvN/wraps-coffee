# Shared process-control script for ADHDisplay Companion's Windows
# installer/launcher. Deliberately a separate file from the main app's
# adhdisplay-control.ps1 - not shared via a common script - matching this
# installer's own established convention (see adhdisplay-companion.iss's
# header comment) of duplicating rather than risking the working main
# installer through shared logic.
#
# Always invoked as:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File adhdisplay-companion-control.ps1 -Action <name> -AppDir <path>
# (-ExecutionPolicy Bypass matters here: -File is subject to the machine's
# execution policy, unlike an inline -Command string, so a locked-down policy
# would otherwise make every stop action silently no-op.)
#
# Companion has no separate server/ports - Electron itself is the only
# process, launched inline (not via `start`) by start-adhdisplay-companion.bat's
# :launch_loop, which blocks on it and relaunches ~3s after any exit. That
# shape makes stop-*ordering* load-bearing in a way the main app's script
# didn't need: killing Electron before the launcher's cmd.exe is stopped
# doesn't prevent a relaunch, it *causes* one (the loop's blocking command
# just returns and retries). StopAll therefore always stops the launcher
# first.

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('StopLauncher', 'StopElectron', 'StopTray', 'StopAll')]
    [string]$Action,
    # The app's real install root ({app}) - required rather than inferred
    # from $PSScriptRoot, since this script also runs from a {tmp} copy
    # during the installer's own ssInstall step, before {app} exists in its
    # final form.
    [Parameter(Mandatory = $true)]
    [string]$AppDir,
    # Only meaningful for StopElectron (and StopAll, which always passes it) -
    # gates the bounded wait for node_modules\electron\dist\electron.exe to
    # actually become writable, not just for the kill command to have been
    # issued. Deliberately NOT passed by the tray's "Restart Companion" action:
    # nothing is about to overwrite the file there, and waiting anyway would
    # mean polling a file that :launch_loop's own ~3s retry re-opens (as a new
    # process) while the poll is still running, blocking for the full timeout
    # on a handle that was never going to close - making Restart appear to
    # hang for ~20s even though the app is actually back up within 3.
    [switch]$WaitForRelease
)

$ErrorActionPreference = 'SilentlyContinue'
$ElectronPath = Join-Path $AppDir 'node_modules\electron\dist\electron.exe'

function Wait-FileReleased {
    param([string]$Path, [int]$TimeoutSeconds = 20)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-Path $Path)) { return $true }
        try {
            $stream = [System.IO.File]::Open($Path, 'Open', 'ReadWrite', 'None')
            $stream.Close()
            return $true
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return -not (Test-Path $Path)
}

# Ends the ADHDisplayCompanionLauncher scheduled task's *running instance*
# (does not delete the task definition - see [UninstallRun] for that) and
# terminates the specific cmd.exe process(es) running
# start-adhdisplay-companion.bat. The schtasks /End half only matters when the
# running instance was launched by the scheduled task itself; when launched
# via the desktop/Start Menu shortcut instead, that call is a no-op and the
# cmd.exe command-line match below is the sole mechanism - both launch paths
# execute the same start-adhdisplay-companion.bat, so the wildcard match
# covers either.
#
# Deliberately NOT a `/T` tree-kill, for the same self-kill-avoidance reason
# as the main app's Stop-Watchdog: the tray helper (and whatever spawned it)
# can itself be a descendant of this cmd.exe, and a tree-kill would take a
# caller needing to keep running (e.g. mid-StopAll) down with it.
function Stop-Launcher {
    Start-Process -FilePath "$env:WINDIR\System32\schtasks.exe" `
        -ArgumentList '/End', '/TN', 'ADHDisplayCompanionLauncher' `
        -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null

    $matches = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*start-adhdisplay-companion.bat*' }
    foreach ($p in $matches) {
        Start-Process -FilePath "$env:WINDIR\System32\taskkill.exe" `
            -ArgumentList '/PID', $p.ProcessId, '/F' `
            -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null
    }
}

# Matched by this app's own binary path, not by image name alone - the main
# ADHDisplay app uses the exact same unbranded electron.exe, so an unscoped
# kill would also take down that app's own kiosk window if both are installed
# on the same machine. Re-queries after the kill attempt and warns if a match
# still exists, rather than only relying on Wait-FileReleased's own timeout to
# indirectly imply a problem - an exact ExecutablePath string match can
# legitimately miss (a mapped drive, a junction, an 8.3 short path, or a prior
# instance still running from a *different* install directory than -AppDir
# resolves to this run), and a plain timeout would otherwise read as "slow
# handle release" when the real cause was "never matched it at all."
function Stop-Electron {
    param([switch]$WaitForRelease)

    $matched = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $ElectronPath }
    foreach ($p in $matched) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 500
    $stillRunning = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $ElectronPath }
    if ($stillRunning) {
        Write-Warning "adhdisplay-companion-control: electron.exe at $ElectronPath still running after kill attempt"
    }

    if ($WaitForRelease) {
        $released = Wait-FileReleased -Path $ElectronPath -TimeoutSeconds 20
        if (-not $released) {
            Write-Warning "adhdisplay-companion-control: $ElectronPath still locked after 20s"
        }
    }
}

# Matched by command line rather than image name, since every PowerShell
# process is powershell.exe. Never matches the currently-running
# adhdisplay-companion-control.ps1 process itself (its own command line
# references this file, not companion-tray-helper.ps1).
function Stop-Tray {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*companion-tray-helper.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

switch ($Action) {
    'StopLauncher' { Stop-Launcher }
    'StopElectron' { Stop-Electron -WaitForRelease:$WaitForRelease }
    'StopTray' { Stop-Tray }
    'StopAll' {
        # Launcher first: killing Electron before the launcher's cmd.exe is
        # stopped doesn't prevent :launch_loop's relaunch, it causes one -
        # the blocking command in the loop returns the instant Electron dies
        # and retries in ~3s regardless of what killed it. Only once the
        # launcher is stopped is the in-flight (now-orphaned) Electron child
        # safe to kill, since nothing is left that would relaunch it.
        Stop-Launcher
        Stop-Electron -WaitForRelease
        Stop-Tray
    }
}

exit 0
