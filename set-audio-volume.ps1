param(
    [int]$ProcessId,
    [float]$Volume
)

$ErrorActionPreference = "Continue"

try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCBFB335-AB07-4D86-9AC7-30517B9D2764"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISimpleAudioVolume {
    int SetMasterVolume(float fLevel, System.Guid EventContext);
    int GetMasterVolume(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid EventContext);
    int GetMute(out bool pbMute);
}

[ComImport, Guid("24962ACF-4A5B-4EF5-A702-3D8D7F4B5EF9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl2 {
    int NotImpl1();
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, System.Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, System.Guid EventContext);
    int GetGroupingParam(out System.Guid pRetVal);
    int SetGroupingParam(System.Guid Override, System.Guid EventContext);
    int NotImpl2();
    int GetState(out int pRetVal);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetProcessId(out uint pRetVal);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
}

[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionEnumerator {
    int GetCount(out int SessionCount);
    int GetSession(int SessionCount, out IAudioSessionControl2 Session);
}

[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionManager2 {
    int NotImpl1();
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
    int RegisterSessionNotification(IntPtr pNewNotifications);
    int UnregisterSessionNotification(IntPtr pNewNotifications);
    int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionID, IntPtr pNewNotifications);
    int UnregisterDuckNotification(IntPtr pNotifications);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref System.Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    int GetState(out int pdwState);
}

[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumerator {
}
"@

    $enumerator = New-Object -ComObject MMDeviceEnumerator
    $deviceEnumerator = [IMMDeviceEnumerator]$enumerator
    $device = $null
    $hr = $deviceEnumerator.GetDefaultAudioEndpoint(0, 0, [ref]$device)
    if ($hr -ne 0) { 
        Write-Output "ERROR"
        exit
    }
    
    $IID_IAudioSessionManager2 = [System.Guid]::Parse("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")
    $sessionManager = $null
    $hr = $device.Activate([ref]$IID_IAudioSessionManager2, 0, [IntPtr]::Zero, [ref]$sessionManager)
    if ($hr -ne 0) { 
        Write-Output "ERROR"
        exit
    }
    
    $sessionMgr = [IAudioSessionManager2]$sessionManager
    $sessionEnum = $null
    $hr = $sessionMgr.GetSessionEnumerator([ref]$sessionEnum)
    if ($hr -ne 0) { 
        Write-Output "ERROR"
        exit
    }
    
    $enum = [IAudioSessionEnumerator]$sessionEnum
    $count = 0
    $hr = $enum.GetCount([ref]$count)
    if ($hr -ne 0) { 
        Write-Output "ERROR"
        exit
    }
    
    $found = $false
    for ($i = 0; $i -lt $count; $i++) {
        try {
            $sessionCtrl = $null
            $hr = $enum.GetSession($i, [ref]$sessionCtrl)
            if ($hr -ne 0 -or $sessionCtrl -eq $null) { continue }
            
            $sessionCtrl2 = [IAudioSessionControl2]$sessionCtrl
            $pid = 0
            $hr = $sessionCtrl2.GetProcessId([ref]$pid)
            if ($hr -ne 0) { continue }
            
            if ($pid -eq $ProcessId) {
                $IID_ISimpleAudioVolume = [System.Guid]::Parse("BCBFB335-AB07-4D86-9AC7-30517B9D2764")
                
                $unkPtr = [System.Runtime.InteropServices.Marshal]::GetIUnknownForObject($sessionCtrl)
                $volPtr = [IntPtr]::Zero
                $hr = [System.Runtime.InteropServices.Marshal]::QueryInterface($unkPtr, [ref]$IID_ISimpleAudioVolume, [ref]$volPtr)
                [System.Runtime.InteropServices.Marshal]::Release($unkPtr) | Out-Null
                
                if ($hr -eq 0 -and $volPtr -ne [IntPtr]::Zero) {
                    $simpleVol = [System.Runtime.InteropServices.Marshal]::GetObjectForIUnknown($volPtr)
                    [System.Runtime.InteropServices.Marshal]::Release($volPtr) | Out-Null
                    
                    if ($simpleVol -ne $null) {
                        $vol = [ISimpleAudioVolume]$simpleVol
                        $vol.SetMasterVolume($Volume, [System.Guid]::Empty) | Out-Null
                        $found = $true
                        break
                    }
                }
            }
        } catch {
            continue
        }
    }
    
    if ($found) {
        Write-Output "OK"
    } else {
        Write-Output "ERROR"
    }
} catch {
    Write-Output "ERROR"
}

