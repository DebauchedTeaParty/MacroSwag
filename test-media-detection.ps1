# Test script to verify Windows Media Control API access
# Run this in PowerShell to test if media detection works

Write-Host "Testing Windows Media Control API..." -ForegroundColor Cyan

# Load Windows Runtime types
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

# Helper function using Runspace to properly handle async operations
function Wait-ForAsyncOperation {
    param($asyncOp)
    
    $runspace = [RunspaceFactory]::CreateRunspace()
    $runspace.Open()
    $runspace.SessionStateProxy.SetVariable("asyncOp", $asyncOp)
    
    $ps = [PowerShell]::Create()
    $ps.Runspace = $runspace
    
    $script = @"
        `$result = `$null
        `$completed = `$false
        `$error = `$null
        
        `$handler = {
            param(`$sender, `$args)
            try {
                `$script:result = `$sender.GetResults()
                `$script:completed = `$true
            } catch {
                `$script:error = `$_.Exception.Message
                `$script:completed = `$true
            }
        }
        
        `$asyncOp.Completed = `$handler
        
        # Wait for completion (with timeout)
        `$timeout = (Get-Date).AddSeconds(2)
        while (-not `$completed -and (Get-Date) -lt `$timeout) {
            Start-Sleep -Milliseconds 50
        }
        
        if (`$error) {
            Write-Output "ERROR:`$error"
        } elseif (`$completed) {
            Write-Output "SUCCESS"
        } else {
            Write-Output "TIMEOUT"
        }
"@
    
    $ps.AddScript($script) | Out-Null
    $output = $ps.Invoke()
    $ps.Dispose()
    $runspace.Close()
    
    if ($output -and $output[0] -eq "SUCCESS") {
        return $asyncOp.GetResults()
    } elseif ($output -and $output[0] -like "ERROR:*") {
        Write-Host $output[0] -ForegroundColor Red
        return $null
    } else {
        Write-Host "Async operation timeout or failed" -ForegroundColor Red
        return $null
    }
}

try {
    Write-Host "Requesting session manager..." -ForegroundColor Yellow
    $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $sessionManager = Wait-ForAsyncOperation $asyncOp
    
    if ($null -eq $sessionManager) {
        Write-Host "ERROR: Failed to get session manager" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Session manager obtained successfully!" -ForegroundColor Green
    
    # Get all sessions
    $sessions = $sessionManager.GetSessions()
    Write-Host "`nTotal sessions: $($sessions.Size)" -ForegroundColor Cyan
    
    if ($sessions.Size -eq 0) {
        Write-Host "No media sessions found. Make sure Spotify or another media player is running and playing music." -ForegroundColor Yellow
        exit 0
    }
    
    # List all sessions
    Write-Host "`nListing all sessions:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $sessions.Size; $i++) {
        try {
            $session = $sessions.GetAt($i)
            $appId = $session.SourceAppUserModelId
            $playbackInfo = $session.GetPlaybackInfo()
            $status = if ($playbackInfo) { $playbackInfo.PlaybackStatus.Value__ } else { "Unknown" }
            
            Write-Host "  Session $i : $appId (Status: $status)" -ForegroundColor White
            
            if ($playbackInfo -and ($status -eq 3 -or $status -eq 4)) {
                Write-Host "    -> This session is playing or paused!" -ForegroundColor Green
                
                try {
                    $propsAsync = $session.TryGetMediaPropertiesAsync()
                    $props = Wait-ForAsyncOperation $propsAsync
                    
                    if ($props) {
                        Write-Host "    Title: $($props.Title)" -ForegroundColor White
                        Write-Host "    Artist: $($props.Artist)" -ForegroundColor White
                        Write-Host "    Album: $($props.AlbumTitle)" -ForegroundColor White
                    }
                } catch {
                    Write-Host "    Error getting media properties: $_" -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host "    Error reading session $i : $_" -ForegroundColor Red
        }
    }
    
    # Try current session
    Write-Host "`nCurrent session:" -ForegroundColor Cyan
    $currentSession = $sessionManager.GetCurrentSession()
    if ($currentSession) {
        Write-Host "  App: $($currentSession.SourceAppUserModelId)" -ForegroundColor Green
    } else {
        Write-Host "  No current session (this is normal if multiple apps are playing)" -ForegroundColor Yellow
    }
    
    Write-Host "`nTest completed successfully!" -ForegroundColor Green
    
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host $_.Exception -ForegroundColor Red
    exit 1
}

