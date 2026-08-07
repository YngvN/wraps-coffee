# Shared process-control script for ADHDisplay's Windows installer/launcher.
#
# One implementation instead of the same Get-NetTCPConnection/Win32_Process
# matching logic duplicated across adhdisplay.iss's [Code] section, the
# start-adhdisplay.bat watchdog, and tray-helper.ps1's Restart/Quit menu
# actions. Always invoked as:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File adhdisplay-control.ps1 -Action <name> -AppDir <path>
# (-ExecutionPolicy Bypass matters here: -File is subject to the machine's
# execution policy, unlike an inline -Command string, so a locked-down policy
# would otherwise make every stop action silently no-op.)
#
# Exit code is 0 on a normal run, 1 if the action name itself is invalid — the
# individual Stop-* functions are already best-effort (matching processes that
# may not exist is not an error), so callers should treat a non-zero ResultCode
# from the Exec/Start-Process call as "the script itself failed to run"
# (e.g. execution policy blocked it), not "nothing was running."

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('StopServer', 'StopWatchdog', 'StopKioskWindow', 'StopTray', 'StopAll')]
    [string]$Action,
    # The app's real install root ({app}) - deliberately a required parameter
    # rather than inferred from $PSScriptRoot, since this script also runs
    # from a {tmp} copy during the installer's own ssInstall step (see
    # adhdisplay.iss's ExtractTemporaryFile usage), before {app} exists in its
    # final form. $PSScriptRoot would silently resolve to {tmp} in that case,
    # making Stop-KioskWindow look for node_modules\electron\... in the wrong
    # place at exactly the point it matters most.
    [Parameter(Mandatory = $true)]
    [string]$AppDir
)

$ErrorActionPreference = 'SilentlyContinue'

function Wait-PortsFree {
    param([int[]]$Ports, [int]$TimeoutSeconds = 20)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $listening = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue
        if (-not $listening) { return $true }
        Start-Sleep -Milliseconds 500
    }
    $stillListening = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue
    return -not $stillListening
}

# Kills whatever owns ports 4000 (sync/API server) and 4173 (Vite preview) -
# scoped to these specific ports rather than a blanket "every node.exe",
# which would also take down unrelated Node processes on the same machine.
# Tries a plain Stop-Process first (lets server/index.ts's own SIGTERM-style
# graceful shutdown run), then -Force if anything's still listening a moment
# later, then polls until the ports are actually confirmed free (not just
# until the kill command was issued) - callers that need to relaunch
# immediately after (e.g. the tray's "Restart Server") depend on this being a
# real guarantee, not a fixed sleep.
function Stop-Server {
    $ports = @(4000, 4173)
    $ids = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $ids) { Stop-Process -Id $procId -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
    $ids = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $ids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
    $portsFree = Wait-PortsFree -Ports $ports -TimeoutSeconds 20
    if (-not $portsFree) {
        Write-Warning 'adhdisplay-control: ports 4000/4173 still in use after 20s'
    }
    return $portsFree
}

# Ends the ADHDisplayLauncher scheduled task's *running instance* (does not
# delete the task definition - see [UninstallRun] for that) and terminates the
# specific cmd.exe process(es) running start-adhdisplay.bat, which is what
# actually stops the :server_watchdog loop from resurrecting the server a few
# seconds after Stop-Server runs.
#
# Deliberately NOT a `/T` tree-kill: the important descendants of that cmd.exe
# (the npm/concurrently/tsx server tree, the tray helper) are already handled
# independently above/below by port- and command-line-based matching, not by
# walking this process's child tree. A plain, non-tree kill of just the
# matched cmd.exe PID(s) means this is safe to call even when the *caller*
# (e.g. the tray helper's "Quit" handler, itself a descendant of this same
# cmd.exe) needs to keep running afterward to finish Stop-Server/
# Stop-KioskWindow/Stop-Tray - a `/T` kill would recursively take the caller's
# own process down mid-action, since taskkill's tree-walk still reaches a
# descendant even through an already-exited intermediate hop (e.g. the
# run-hidden.vbs shim).
function Stop-Watchdog {
    Start-Process -FilePath "$env:WINDIR\System32\schtasks.exe" `
        -ArgumentList '/End', '/TN', 'ADHDisplayLauncher' `
        -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null

    $matches = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*start-adhdisplay.bat*' }
    foreach ($p in $matches) {
        Start-Process -FilePath "$env:WINDIR\System32\taskkill.exe" `
            -ArgumentList '/PID', $p.ProcessId, '/F' `
            -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null
    }
}

# Electron matched by this app's own binary path, not by image name alone -
# the ADHDisplay Companion app uses the exact same unbranded electron.exe, so
# an unscoped kill here would also take down a running Companion window if
# both apps are installed on the same machine. Edge kiosk fallback matched by
# command line (--kiosk + the content port), since that's the only signal
# distinguishing it from any other Edge window a user might have open.
function Stop-KioskWindow {
    $electronPath = Join-Path $AppDir 'node_modules\electron\dist\electron.exe'
    Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $electronPath } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*--kiosk*' -and $_.CommandLine -like '*4173*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# Matched by command line rather than image name, since every PowerShell
# process is powershell.exe. Never matches the currently-running
# adhdisplay-control.ps1 process itself (its own command line references this
# file, not tray-helper.ps1), so no self-exclusion is needed here - unlike
# Stop-Watchdog, which had to specifically avoid a `/T` tree-kill for exactly
# that reason.
function Stop-Tray {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*tray-helper.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

switch ($Action) {
    'StopServer' { Stop-Server | Out-Null }
    'StopWatchdog' { Stop-Watchdog }
    'StopKioskWindow' { Stop-KioskWindow }
    'StopTray' { Stop-Tray }
    'StopAll' {
        # Watchdog first: with Stop-Watchdog no longer doing a tree-kill, this
        # ordering is safe for every caller (the installer's own StopAll calls,
        # and the tray's Quit/Restart-adjacent calls alike) - stopping the
        # server before the watchdog is what let it resurrect the server a few
        # seconds later in the original bug.
        Stop-Watchdog
        Stop-Server | Out-Null
        Stop-KioskWindow
        Stop-Tray
    }
}

exit 0
