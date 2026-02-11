/**
 * Node.js Windows Media Controller
 * Uses a C# helper executable for reliable Windows Runtime API access
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

class MediaController {
    constructor() {
        this.sessionManager = null;
        this.currentSession = null;
        this.updateInterval = null;
        this.currentInfo = {
            title: 'No media playing',
            artist: '',
            album: '',
            app: '',
            artwork: null,
            position: 0,
            duration: 0,
            playback_status: 0
        };
    }

    async initialize() {
        // For now, we'll use a PowerShell script to access Windows Runtime APIs
        // In production, you'd want to use a native Node.js addon
        console.log('Initializing Windows Media Controller...');
        return true;
    }

    async getMediaInfo() {
        try {
            // Use C# helper executable if available, otherwise fall back to PowerShell
            // Try multiple possible paths for different .NET versions
            const possiblePaths = [
                path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.dll'),
                path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe'),
                path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net8.0-windows10.0.22000.0', 'MediaControllerHelper.dll'),
                path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net8.0-windows10.0.22000.0', 'MediaControllerHelper.exe'),
                path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net6.0-windows10.0.22000.0', 'MediaControllerHelper.exe'),
            ];
            
            let helperPath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    helperPath = p;
                    break;
                }
            }
            
            if (helperPath) {
                // If it's a .dll, run it with dotnet, otherwise run directly
                const isDll = helperPath.endsWith('.dll');
                // Use absolute path and ensure dotnet is in PATH
                const absolutePath = path.resolve(helperPath);
                const command = isDll 
                    ? `dotnet "${absolutePath}" getinfo`
                    : `"${absolutePath}" getinfo`;
                
                console.log('Using C# helper:', absolutePath);
                
                return new Promise((resolve) => {
                    exec(command, 
                        { maxBuffer: 1024 * 1024, encoding: 'utf8', shell: true }, 
                        (error, stdout, stderr) => {
                            if (!error && stdout && stdout.trim()) {
                                try {
                                    const output = stdout.trim();
                                    const info = JSON.parse(output);
                                    const hasMedia = info.title && 
                                                   info.title !== 'No media playing' && 
                                                   info.title !== 'Unknown Title' &&
                                                   (info.playback_status === 3 || info.playback_status === 4);
                                    
                                    this.currentInfo = {
                                        ...this.currentInfo,
                                        ...info,
                                        status: hasMedia ? 'detected' : 'no_media'
                                    };
                                    
                                    if (hasMedia) {
                                        console.log('Media detected:', info.title, '-', info.artist, 'from', info.app);
                                        
                                        // Fetch album art from Last.fm if not provided by Windows
                                        if (!info.artwork_base64 && info.artist && info.album) {
                                            this.fetchLastFmArtwork(info.artist, info.album).then(artwork => {
                                                if (artwork) {
                                                    info.artwork_base64 = artwork;
                                                    this.currentInfo.artwork_base64 = artwork;
                                                    // Trigger update with new artwork
                                                    if (this.updateCallback) {
                                                        this.updateCallback(this.currentInfo);
                                                    }
                                                }
                                            }).catch(err => {
                                                console.log('Last.fm artwork fetch failed:', err.message);
                                            });
                                        }
                                    }
                                    
                                    resolve(this.currentInfo);
                                    return;
                                } catch (e) {
                                    console.error('Parse error from C# helper:', e.message);
                                    console.error('Raw output:', stdout);
                                }
                            } else {
                                if (error) {
                                    console.error('C# helper error:', error.message);
                                    if (stderr) console.error('C# helper stderr:', stderr);
                                }
                            }
                            
                            // If we get here, C# helper failed, try PowerShell fallback
                            console.log('C# helper failed, trying PowerShell fallback...');
                            this.getMediaInfoPowerShell().then(resolve).catch(() => resolve(this.currentInfo));
                        }
                    );
                });
            }
            
            // Fallback to PowerShell if C# helper not available
            return this.getMediaInfoPowerShell();
        } catch (error) {
            console.error('Error getting media info:', error);
            return this.currentInfo;
        }
    }

    async getMediaInfoPowerShell() {
        const scriptPath = path.join(os.tmpdir(), 'media_control.ps1');
        
        const script = `Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Foundation.AsyncStatus, Windows.Foundation, ContentType = WindowsRuntime]

function Wait-ForAsyncOperation {
    param($asyncOp)
    
    Start-Sleep -Milliseconds 100
    
    $maxRetries = 10
    $retry = 0
    
    while ($retry -lt $maxRetries) {
        try {
            return $asyncOp.GetResults()
        } catch {
            $retry++
            if ($retry -lt $maxRetries) {
                Start-Sleep -Milliseconds 50
            } else {
                return $null
            }
        }
    }
    
    return $null
}

$ErrorActionPreference = "Stop"
$result = @{
    title = "No media playing"
    artist = ""
    album = ""
    app = ""
    playback_status = 0
    position = 0
    duration = 0
}

try {
    $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $sessionManager = Wait-ForAsyncOperation $asyncOp
    
    if ($null -eq $sessionManager) {
        $result | ConvertTo-Json -Compress
        exit
    }
    
    # Try to get current session first
    $session = $sessionManager.GetCurrentSession()
    
    # If no current session, try all sessions
    if ($null -eq $session) {
        $sessions = $sessionManager.GetSessions()
        if ($sessions -and $sessions.Size -gt 0) {
            for ($i = 0; $i -lt $sessions.Size; $i++) {
                try {
                    $testSession = $sessions.GetAt($i)
                    $playbackInfo = $testSession.GetPlaybackInfo()
                    if ($playbackInfo) {
                        $status = $playbackInfo.PlaybackStatus
                        # 3 = Playing, 4 = Paused
                        if ($status.Value__ -eq 3 -or $status.Value__ -eq 4) {
                            $session = $testSession
                            break
                        }
                    }
                } catch {
                    continue
                }
            }
        }
    }
    
    if ($null -ne $session) {
        try {
            $propsAsync = $session.TryGetMediaPropertiesAsync()
            $props = Wait-ForAsyncOperation $propsAsync
            
            if ($props) {
                $result.title = if ($props.Title) { $props.Title } else { "Unknown Title" }
                $result.artist = if ($props.Artist) { $props.Artist } else { "Unknown Artist" }
                $result.album = if ($props.AlbumTitle) { $props.AlbumTitle } else { "Unknown Album" }
                $result.app = $session.SourceAppUserModelId
                
                $playback = $session.GetPlaybackInfo()
                if ($playback) {
                    $result.playback_status = $playback.PlaybackStatus.Value__
                }
                
                # Get position and duration
                try {
                    $timeline = $session.GetTimelineProperties()
                    if ($timeline) {
                        $result.position = [math]::Round($timeline.Position.TotalSeconds, 0)
                        $duration = $timeline.EndTime.Subtract($timeline.StartTime)
                        $result.duration = [math]::Round($duration.TotalSeconds, 0)
                    }
                } catch {
                    $result.position = 0
                    $result.duration = 0
                }
            }
        } catch {
            # Session exists but couldn't get properties
        }
    }
    
    $result | ConvertTo-Json -Compress
} catch {
    $result | ConvertTo-Json -Compress
}`;

            fs.writeFileSync(scriptPath, script, 'utf8');

            return new Promise((resolve) => {
                exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, 
                    { maxBuffer: 1024 * 1024, encoding: 'utf8' }, 
                    (error, stdout, stderr) => {
                        // Clean up temp file
                        try { fs.unlinkSync(scriptPath); } catch (e) {}
                        
                        if (stderr) {
                            console.error('PowerShell stderr:', stderr);
                        }
                        
                        if (error) {
                            console.error('PowerShell error:', error.message);
                            if (stdout) console.log('PowerShell output:', stdout);
                            resolve(this.currentInfo);
                            return;
                        }
                        
                        try {
                            const output = stdout.trim();
                            if (!output) {
                                console.log('No output from PowerShell');
                                resolve(this.currentInfo);
                                return;
                            }
                            
                            // Remove any BOM or extra characters
                            const cleanOutput = output.replace(/^\uFEFF/, '').trim();
                            
                            const info = JSON.parse(cleanOutput);
                            
                            // Check if we have valid media
                            const hasMedia = info.title && 
                                           info.title !== 'No media playing' && 
                                           info.title !== 'Unknown Title' &&
                                           (info.playback_status === 3 || info.playback_status === 4);
                            
                            this.currentInfo = {
                                ...this.currentInfo,
                                ...info,
                                status: hasMedia ? 'detected' : 'no_media'
                            };
                            
                            if (hasMedia) {
                                console.log('Media detected:', info.title, '-', info.artist, 'from', info.app);
                                
                                // Fetch album art from Last.fm if not provided by Windows
                                if (!info.artwork_base64 && info.artist && info.album) {
                                    this.fetchLastFmArtwork(info.artist, info.album).then(artwork => {
                                        if (artwork) {
                                            info.artwork_base64 = artwork;
                                            this.currentInfo.artwork_base64 = artwork;
                                            // Trigger update with new artwork
                                            if (this.updateCallback) {
                                                this.updateCallback(this.currentInfo);
                                            }
                                        }
                                    }).catch(err => {
                                        console.log('Last.fm artwork fetch failed:', err.message);
                                    });
                                }
                            }
                            
                            resolve(this.currentInfo);
                        } catch (e) {
                            console.error('Parse error:', e.message);
                            console.error('Raw output:', stdout);
                            resolve(this.currentInfo);
                        }
                    }
                );
            });
    }

    async playPause() {
        return this.executeMediaCommand('playpause');
    }

    async nextTrack() {
        return this.executeMediaCommand('next');
    }

    async previousTrack() {
        return this.executeMediaCommand('previous');
    }

    async seekToPosition(percentage) {
        // Seek functionality would go here
        console.log('Seek to:', percentage);
    }

    executeMediaCommand(command) {
        // Use C# helper executable if available
        const possiblePaths = [
            path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.dll'),
            path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe'),
            path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net8.0-windows10.0.22000.0', 'MediaControllerHelper.dll'),
            path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net8.0-windows10.0.22000.0', 'MediaControllerHelper.exe'),
            path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net6.0-windows10.0.22000.0', 'MediaControllerHelper.exe'),
        ];
        
        let helperPath = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                helperPath = p;
                break;
            }
        }
        
        if (helperPath) {
            // If it's a .dll, run it with dotnet, otherwise run directly
            const isDll = helperPath.endsWith('.dll');
            const execCommand = isDll 
                ? `dotnet "${helperPath}" ${command}`
                : `"${helperPath}" ${command}`;
            
            return new Promise((resolve) => {
                exec(execCommand, 
                    { encoding: 'utf8' },
                    (error, stdout) => {
                        if (error) {
                            console.error('C# helper error:', error);
                            resolve({ success: false });
                            return;
                        }
                        
                        try {
                            const result = JSON.parse(stdout.trim());
                            resolve({ success: result.success === true });
                        } catch (e) {
                            console.error('Parse error:', e);
                            resolve({ success: false });
                        }
                    }
                );
            });
        }
        
        // Fallback to PowerShell (not implemented for commands, but structure is here)
        return Promise.resolve({ success: false, error: 'C# helper not available' });
    }

    startUpdateLoop(callback) {
        this.updateCallback = callback;
        this.updateInterval = setInterval(async () => {
            const info = await this.getMediaInfo();
            if (callback) {
                callback(info);
            }
        }, 1000);
    }

    async fetchLastFmArtwork(artist, album) {
        const LASTFM_API_KEY = '09f18809dc5da041e1af60c30b7f9a40';
        
        try {
            // Last.fm API call to get album info
            const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
                params: {
                    method: 'album.getinfo',
                    api_key: LASTFM_API_KEY,
                    artist: artist,
                    album: album,
                    format: 'json'
                },
                timeout: 3000
            });
            
            if (response.data && response.data.album && response.data.album.image) {
                // Get the largest image (usually index 3 or 4)
                const images = response.data.album.image;
                let imageUrl = null;
                
                // Try to find large or extralarge image
                for (let i = images.length - 1; i >= 0; i--) {
                    if (images[i] && images[i]['#text'] && images[i]['#text'].length > 0) {
                        imageUrl = images[i]['#text'];
                        break;
                    }
                }
                
                if (imageUrl) {
                    // Fetch the image and convert to base64
                    const imageResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 3000
                    });
                    
                    const imageBuffer = Buffer.from(imageResponse.data);
                    const base64 = imageBuffer.toString('base64');
                    return base64;
                }
            }
        } catch (error) {
            // Silently fail - artwork is optional
            console.log('Last.fm artwork fetch error:', error.message);
        }
        
        return null;
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.updateCallback = null;
    }
}

module.exports = MediaController;

