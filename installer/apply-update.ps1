# Applies an already-built ADHDisplay update and brings the kiosk back up.
#
# Spawned detached by server/appUpdate/apply.ts as the server's final act, and
# runs from a COPY in the update root - never from {app}, because Windows
# refuses to rename a directory that is any running process's working
# directory, and this script is about to rename most of {app}.
#
# Everything expensive already happened: the new tree in <UpdateRoot>\next is
# complete and has already compiled. All that is left is a handful of
# same-volume renames, which take about a second. That ordering is the whole
# safety argument - a broken commit fails during the build, while the kiosk is
# still happily serving the old one, and this script never runs at all.
#
# Progress is written to <UpdateRoot>\state.json rather than reported to the
# server, because this script exists precisely during the window when there is
# no server running to report to.

param(
    [Parameter(Mandatory = $true)][string]$AppDir,
    [Parameter(Mandatory = $true)][string]$UpdateRoot
)

$ErrorActionPreference = 'Stop'

$NextDir     = Join-Path $UpdateRoot 'next'
$PreviousDir = Join-Path $UpdateRoot 'previous'
$StateFile   = Join-Path $UpdateRoot 'state.json'
$LogFile     = Join-Path $UpdateRoot 'apply.log'

# The directories that are swapped wholesale. Deliberately NOT the {app} root
# launcher scripts (start-adhdisplay.bat and friends): cmd.exe re-reads a
# running batch file from disk by byte offset on every pass of its
# :server_watchdog loop, so replacing one underneath the running shell makes
# the next `goto` land at an arbitrary offset and execute whatever fragment is
# there. On a kiosk that is a brick. Script changes need the installer.
$SwapDirs  = @('src', 'server', 'public', 'electron', 'dist')
$SwapFiles = @('package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'index.html')

# Directories that belong to the machine, not the repository. Moved out of the
# old tree and into the new one rather than being replaced: server\data holds
# every product, screen and user plus the machine-specific display-role.json,
# server\uploads holds gigabytes of media, and public\fonts is 41 MB of
# gitignored files the build copies into dist.
$CarryForward = @(
    @{ Dir = 'server'; Child = 'data' },
    @{ Dir = 'server'; Child = 'uploads' },
    @{ Dir = 'server'; Child = 'news-image-cache' },
    @{ Dir = 'public'; Child = 'fonts' }
)

function Write-Log([string]$Message) {
    "$([DateTime]::UtcNow.ToString('o'))  $Message" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

# Merges a patch into state.json via a temp file + move, so the admin UI - which
# polls this file every couple of seconds - can never read a half-written one.
function Set-State([hashtable]$Patch) {
    try {
        $state = Get-Content -Raw -Path $StateFile | ConvertFrom-Json
        foreach ($key in $Patch.Keys) {
            $state | Add-Member -NotePropertyName $key -NotePropertyValue $Patch[$key] -Force
        }
        $state.updatedAt = [DateTime]::UtcNow.ToString('o')
        $temp = "$StateFile.tmp"
        $state | ConvertTo-Json -Depth 8 | Out-File -FilePath $temp -Encoding utf8
        Move-Item -Path $temp -Destination $StateFile -Force
    } catch {
        Write-Log "state write failed: $_"
    }
}

function Move-Tree([string]$From, [string]$To) {
    if (Test-Path -LiteralPath $From) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $To) | Out-Null
        Move-Item -LiteralPath $From -Destination $To -Force
    }
}

# Let the HTTP 202 reach the admin's browser before the server dies under it.
Start-Sleep -Seconds 2
Write-Log "apply starting; AppDir=$AppDir UpdateRoot=$UpdateRoot"
Set-State @{ step = 'swapping'; percent = 92 }

$AppDirNoSlash = $AppDir.TrimEnd('\')
$Control = Join-Path $AppDir 'adhdisplay-control.ps1'

# Everything from here to the `finally` runs with the app stopped. The stop
# calls are INSIDE the try for a reason: from the moment the watchdog is killed,
# nothing on this machine will restart the app except this script's own
# `finally` block. A failure between the stop and the swap - an execution
# policy blocking adhdisplay-control.ps1, a locked directory - would otherwise
# exit the script silently and leave a dead kiosk that only a reboot recovers.
try {
    # Watchdog first, then the server. Stopping the server first lets the
    # watchdog resurrect it a few seconds later - the exact bug
    # adhdisplay-control.ps1's own StopAll comment documents. StopWatchdog ends
    # the scheduled task instance and kills the cmd.exe running
    # start-adhdisplay.bat.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Control -Action StopWatchdog -AppDir $AppDirNoSlash 2>&1 | Out-Null
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Control -Action StopServer  -AppDir $AppDirNoSlash 2>&1 | Out-Null
    Write-Log 'watchdog and server stopped'

    # The kiosk window is deliberately left running: it keeps showing the
    # update page, and killing it would put the bare Windows desktop on a
    # customer-facing TV. It holds node_modules\electron\dist\electron.exe
    # open, which is fine - node_modules is never renamed here.

    # Remove the junctions into the live install BEFORE anything moves.
    # rmdir without /s removes the link and refuses to follow it; a recursive
    # delete here would walk into the target and destroy the live node_modules
    # or every installed font.
    foreach ($link in @('node_modules', 'public\fonts')) {
        $linkPath = Join-Path $NextDir $link
        if (Test-Path -LiteralPath $linkPath) {
            & cmd.exe /c rmdir "$linkPath" 2>&1 | Out-Null
            Write-Log "removed junction $link"
        }
    }

    if (Test-Path -LiteralPath $PreviousDir) { Remove-Item -LiteralPath $PreviousDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $PreviousDir | Out-Null

    # 1. Old tree out.
    foreach ($dir in $SwapDirs) { Move-Tree (Join-Path $AppDir $dir) (Join-Path $PreviousDir $dir) }
    foreach ($file in $SwapFiles) {
        $source = Join-Path $AppDir $file
        if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination (Join-Path $PreviousDir $file) -Force }
    }
    Write-Log 'old tree moved aside'

    # 2. Machine-owned state out of the old tree and into the new one. A move,
    #    not a copy - server\uploads can be gigabytes of video.
    foreach ($entry in $CarryForward) {
        Move-Tree (Join-Path $PreviousDir "$($entry.Dir)\$($entry.Child)") (Join-Path $NextDir "$($entry.Dir)\$($entry.Child)")
    }
    Write-Log 'data, uploads and fonts carried forward'

    # 3. New tree in.
    foreach ($dir in $SwapDirs) { Move-Tree (Join-Path $NextDir $dir) (Join-Path $AppDir $dir) }
    foreach ($file in $SwapFiles) {
        $source = Join-Path $NextDir $file
        if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination (Join-Path $AppDir $file) -Force }
    }
    Write-Log 'new tree installed'

    # 4. Verify the swap produced something bootable before handing the kiosk
    #    back. Each of these has been a real failure mode: a build that emitted
    #    no dist, a dist with no fonts, a data directory left behind.
    $checks = @(
        (Join-Path $AppDir 'dist\index.html'),
        (Join-Path $AppDir 'server\index.ts'),
        (Join-Path $AppDir 'package.json'),
        (Join-Path $AppDir 'server\data')
    )
    foreach ($check in $checks) {
        if (-not (Test-Path -LiteralPath $check)) { throw "post-swap check failed: $check is missing" }
    }
    Write-Log 'post-swap checks passed'
} catch {
    Write-Log "swap failed: $_ - rolling back"
    Set-State @{ step = 'swapping'; error = "Applying the update failed, so the previous version was restored. $_" }
    # Roll back: new tree out, old tree back in, carrying the machine-owned
    # directories along with it so no state is stranded in the failed tree.
    foreach ($dir in $SwapDirs)  { Move-Tree (Join-Path $AppDir $dir) (Join-Path $UpdateRoot "failed\$dir") }
    foreach ($entry in $CarryForward) {
        Move-Tree (Join-Path $UpdateRoot "failed\$($entry.Dir)\$($entry.Child)") (Join-Path $PreviousDir "$($entry.Dir)\$($entry.Child)")
    }
    foreach ($dir in $SwapDirs)  { Move-Tree (Join-Path $PreviousDir $dir) (Join-Path $AppDir $dir) }
    foreach ($file in $SwapFiles) {
        $source = Join-Path $PreviousDir $file
        if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination (Join-Path $AppDir $file) -Force }
    }
    Set-State @{ status = 'failed'; step = 'done'; percent = 100 }
} finally {
    # ALWAYS relaunch, whatever happened above. This block is the only thing
    # standing between a failed swap and a kiosk that stays dark until someone
    # drives to the cafe: StopWatchdog killed the shell that would otherwise
    # have noticed, so there is no watchdog, no scheduled task until next
    # logon, and no sentinel anyone is left to read.
    #
    # Note the sentinel file {app}\logs\.restart-requested is deliberately NOT
    # used here - it is only ever read by start-adhdisplay.bat's own watchdog
    # loop, which no longer exists at this point. Start the launcher directly,
    # the same target the ADHDisplayLauncher scheduled task uses at logon.
    Set-State @{ step = 'restarting'; percent = 97 }
    Write-Log 'relaunching start-adhdisplay.bat'
    try {
        Start-Process -FilePath (Join-Path $AppDir 'start-adhdisplay.bat') -WorkingDirectory $AppDir -WindowStyle Minimized
    } catch {
        Write-Log "relaunch failed: $_"
    }

    # Wait for the server to actually answer, so the admin UI's "restarting"
    # state ends on evidence rather than on a timer.
    $deadline = (Get-Date).AddMinutes(4)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        try {
            $response = Invoke-WebRequest -Uri 'http://localhost:4000/server-info' -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
    }

    if ($healthy) {
        Write-Log 'server healthy after update'
        # On success, leave state.json alone: the restarted server's own
        # reconcileAfterRestart() compares the running version against the
        # target and writes the terminal record, which is a stronger check than
        # this script asking whether a port answered.
    } else {
        # The server never came back, so reconcileAfterRestart() will never run
        # and nothing else would ever move state.json off 'running' - the admin
        # UI would spin forever. Write the terminal record here instead.
        Write-Log 'server did not come back within 4 minutes'
        Set-State @{ status = 'failed'; step = 'done'; percent = 100; error = 'The update was applied but the server did not come back within four minutes. The tree from before the update is kept in the ADHDisplayUpdate\previous folder.' }
    }
}
