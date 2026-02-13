using System;
using System.Text.Json;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using Windows.Media.Control;
using Windows.Foundation;

// P/Invoke for COM initialization
static class NativeMethods
{
    [DllImport("ole32.dll")]
    public static extern int CoInitialize(IntPtr pvReserved);
    
    [DllImport("ole32.dll")]
    public static extern void CoUninitialize();
    
    [DllImport("ole32.dll")]
    public static extern int CoCreateInstance(
        [MarshalAs(UnmanagedType.LPStruct)] ref Guid rclsid,
        IntPtr pUnkOuter,
        uint dwClsContext,
        [MarshalAs(UnmanagedType.LPStruct)] ref Guid riid,
        [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
}

// WASAPI COM Interfaces
[ComImport]
[Guid("BCBFB335-AB07-4D86-9AC7-30517B9D2764")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume
{
    [PreserveSig]
    int SetMasterVolume(float fLevel, Guid EventContext);
    [PreserveSig]
    int GetMasterVolume(out float pfLevel);
    [PreserveSig]
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid EventContext);
    [PreserveSig]
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
}

[ComImport]
[Guid("24962ACF-4A5B-4EF5-A702-3D8D7F4B5EF9")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2
{
    [PreserveSig]
    int NotImpl1();
    [PreserveSig]
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
    [PreserveSig]
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
    [PreserveSig]
    int GetGroupingParam(out Guid pRetVal);
    [PreserveSig]
    int SetGroupingParam(Guid Override, Guid EventContext);
    [PreserveSig]
    int NotImpl2();
    [PreserveSig]
    int GetState(out int pRetVal);
    [PreserveSig]
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetProcessId(out uint pRetVal);
    [PreserveSig]
    int IsSystemSoundsSession();
    [PreserveSig]
    int SetDuckingPreference(bool optOut);
}

[ComImport]
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator
{
    [PreserveSig]
    int GetCount(out int SessionCount);
    [PreserveSig]
    int GetSession(int SessionCount, out IAudioSessionControl2 Session);
}

[ComImport]
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2
{
    [PreserveSig]
    int NotImpl1();
    [PreserveSig]
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
    [PreserveSig]
    int RegisterSessionNotification(IntPtr pNewNotifications);
    [PreserveSig]
    int UnregisterSessionNotification(IntPtr pNewNotifications);
    [PreserveSig]
    int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionID, IntPtr pNewNotifications);
    [PreserveSig]
    int UnregisterDuckNotification(IntPtr pNotifications);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    [PreserveSig]
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    [PreserveSig]
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    [PreserveSig]
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    [PreserveSig]
    int GetState(out int pdwState);
}

[ComImport]
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    [PreserveSig]
    int NotImpl1();
    [PreserveSig]
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    [PreserveSig]
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    [PreserveSig]
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
    [PreserveSig]
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    [PreserveSig]
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator
{
}

class Program
{
    [STAThread]
    static async Task Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("Usage: MediaControllerHelper <command> [args]");
            Environment.Exit(1);
        }

        string command = args[0];

        try
        {
            // Audio session commands (WASAPI) - run on STA thread for COM interop
            if (command.ToLower() == "getaudiosessions")
            {
                // Ensure we're on an STA thread for COM interop
                if (Thread.CurrentThread.GetApartmentState() != ApartmentState.STA)
                {
                    // Run on STA thread
                    var tcs = new TaskCompletionSource<object>();
                    var thread = new Thread(() =>
                    {
                        try
                        {
                            GetAudioSessions();
                            tcs.SetResult(null);
                        }
                        catch (Exception ex)
                        {
                            tcs.SetException(ex);
                        }
                    });
                    thread.SetApartmentState(ApartmentState.STA);
                    thread.Start();
                    await tcs.Task;
                }
                else
                {
                    GetAudioSessions();
                }
                return;
            }
            else if (command.ToLower() == "setaudiovolume")
            {
                if (args.Length < 3)
                {
                    Console.WriteLine("{\"success\":false,\"error\":\"Usage: setaudiovolume <processId> <volume>\"}");
                    Environment.Exit(1);
                }
                uint processId = uint.Parse(args[1]);
                float volume = float.Parse(args[2]);
                SetAudioVolume(processId, volume);
                return;
            }
            else if (command.ToLower() == "setaudiomute")
            {
                if (args.Length < 3)
                {
                    Console.WriteLine("{\"success\":false,\"error\":\"Usage: setaudiomute <processId> <mute>\"}");
                    Environment.Exit(1);
                }
                uint processId = uint.Parse(args[1]);
                bool mute = bool.Parse(args[2]);
                SetAudioMute(processId, mute);
                return;
            }
            else if (command.ToLower() == "muteallaudio")
            {
                MuteAllAudio(bool.Parse(args.Length > 1 ? args[1] : "true"));
                return;
            }

            // Media control commands (Windows Runtime)
            var sessionManager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();

            switch (command.ToLower())
            {
                case "getinfo":
                    await GetMediaInfo(sessionManager);
                    break;
                case "playpause":
                    await ExecuteCommand(sessionManager, "TogglePlayPause");
                    break;
                case "next":
                    await ExecuteCommand(sessionManager, "SkipNext");
                    break;
                case "previous":
                    await ExecuteCommand(sessionManager, "SkipPrevious");
                    break;
                default:
                    Console.WriteLine($"{{\"error\":\"Unknown command: {command}\"}}");
                    Environment.Exit(1);
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"{{\"error\":\"{ex.Message}\"}}");
            Environment.Exit(1);
        }
    }

    static async Task GetMediaInfo(GlobalSystemMediaTransportControlsSessionManager sessionManager)
    {
        var result = new
        {
            title = "No media playing",
            artist = "",
            album = "",
            app = "",
            playback_status = 0,
            position = 0.0,
            duration = 0.0
        };

        var session = sessionManager.GetCurrentSession();

        // If no current session, try all sessions
        if (session == null)
        {
            var sessions = sessionManager.GetSessions();
            for (int i = 0; i < sessions.Count; i++)
            {
                try
                {
                    var testSession = sessions[i];
                    var playbackInfo = testSession.GetPlaybackInfo();
                    if (playbackInfo != null)
                    {
                        var status = playbackInfo.PlaybackStatus;
                        // 3 = Playing, 4 = Paused
                        if (status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing ||
                            status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)
                        {
                            session = testSession;
                            break;
                        }
                    }
                }
                catch
                {
                    continue;
                }
            }
        }

        if (session != null)
        {
            try
            {
                var props = await session.TryGetMediaPropertiesAsync();
                var playbackInfo = session.GetPlaybackInfo();
                var timeline = session.GetTimelineProperties();

                result = new
                {
                    title = props?.Title ?? "Unknown Title",
                    artist = props?.Artist ?? "Unknown Artist",
                    album = props?.AlbumTitle ?? "Unknown Album",
                    app = session.SourceAppUserModelId ?? "Unknown App",
                    playback_status = (int)(playbackInfo?.PlaybackStatus ?? GlobalSystemMediaTransportControlsSessionPlaybackStatus.Closed),
                    position = timeline?.Position.TotalSeconds ?? 0.0,
                    duration = timeline != null ? (timeline.EndTime - timeline.StartTime).TotalSeconds : 0.0
                };
            }
            catch (Exception ex)
            {
                result = new
                {
                    title = "Error",
                    artist = ex.Message,
                    album = "",
                    app = "",
                    playback_status = 0,
                    position = 0.0,
                    duration = 0.0
                };
            }
        }

        var json = JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = false });
        Console.WriteLine(json);
    }

    static async Task ExecuteCommand(GlobalSystemMediaTransportControlsSessionManager sessionManager, string command)
    {
        var session = sessionManager.GetCurrentSession();

        // If no current session, try all sessions
        if (session == null)
        {
            var sessions = sessionManager.GetSessions();
            for (int i = 0; i < sessions.Count; i++)
            {
                try
                {
                    var testSession = sessions[i];
                    var playbackInfo = testSession.GetPlaybackInfo();
                    if (playbackInfo != null)
                    {
                        var status = playbackInfo.PlaybackStatus;
                        if (status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing ||
                            status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)
                        {
                            session = testSession;
                            break;
                        }
                    }
                }
                catch
                {
                    continue;
                }
            }
        }

        if (session == null)
        {
            Console.WriteLine("{\"success\":false,\"error\":\"No active session\"}");
            return;
        }

        bool success = false;
        try
        {
            switch (command)
            {
                case "TogglePlayPause":
                    success = await session.TryTogglePlayPauseAsync();
                    break;
                case "SkipNext":
                    success = await session.TrySkipNextAsync();
                    break;
                case "SkipPrevious":
                    success = await session.TrySkipPreviousAsync();
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"{{\"success\":false,\"error\":\"{ex.Message}\"}}");
            return;
        }

        Console.WriteLine($"{{\"success\":{success.ToString().ToLower()}}}");
    }

    static void GetAudioSessions()
    {
        var sessions = new List<object>();
        int hr;

        Console.Error.WriteLine("[DEBUG] GetAudioSessions called");
        Console.Error.WriteLine($"[DEBUG] Thread apartment state: {Thread.CurrentThread.GetApartmentState()}");

        try
        {
            // Initialize COM if needed
            hr = NativeMethods.CoInitialize(IntPtr.Zero);
            // RPC_E_CHANGED_MODE (0x80010106) means already initialized, which is fine
            if (hr != 0 && hr != unchecked((int)0x80010106))
            {
                Console.Error.WriteLine($"[DEBUG] CoInitialize failed: 0x{hr:X8}");
            }
            
            // Use Type.GetTypeFromProgID which works better for registered COM objects
            Type comType = Type.GetTypeFromProgID("MMDeviceEnumerator");
            if (comType == null)
            {
                Console.Error.WriteLine("[DEBUG] GetTypeFromProgID returned null, trying CLSID");
                // Fallback to CLSID
                Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
                comType = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
                if (comType == null)
                {
                    Console.Error.WriteLine("[DEBUG] GetTypeFromCLSID also returned null");
                    Console.WriteLine("[]");
                    return;
                }
            }
            
            object comObject = Activator.CreateInstance(comType);
            if (comObject == null)
            {
                Console.Error.WriteLine("[DEBUG] Activator.CreateInstance returned null");
                Console.WriteLine("[]");
                return;
            }
            
            // Use Marshal to get the interface
            Guid IID_IMMDeviceEnumerator = new Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E");
            IntPtr unkPtr = Marshal.GetIUnknownForObject(comObject);
            IntPtr enumPtr;
            hr = Marshal.QueryInterface(unkPtr, ref IID_IMMDeviceEnumerator, out enumPtr);
            Marshal.Release(unkPtr);
            
            IMMDeviceEnumerator deviceEnumerator;
            if (hr != 0 || enumPtr == IntPtr.Zero)
            {
                Console.Error.WriteLine($"[DEBUG] QueryInterface for IMMDeviceEnumerator failed: 0x{hr:X8}, trying direct cast");
                // Try direct cast as fallback
                try
                {
                    deviceEnumerator = (IMMDeviceEnumerator)comObject;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[DEBUG] Direct cast also failed: {ex.Message}");
                    Console.WriteLine("[]");
                    return;
                }
            }
            else
            {
                deviceEnumerator = (IMMDeviceEnumerator)Marshal.GetObjectForIUnknown(enumPtr);
                Marshal.Release(enumPtr);
            }
            
            IMMDevice device;
            hr = deviceEnumerator.GetDefaultAudioEndpoint(0, 0, out device);
            if (hr != 0)
            {
                Console.Error.WriteLine($"[DEBUG] GetDefaultAudioEndpoint failed: 0x{hr:X8}");
                Console.WriteLine("[]");
                return;
            }
            
            if (device == null)
            {
                Console.Error.WriteLine("[DEBUG] GetDefaultAudioEndpoint returned null device");
                Console.WriteLine("[]");
                return;
            }
            
            Console.Error.WriteLine("[DEBUG] Default audio endpoint found successfully");

            Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            object sessionManagerObj;
            hr = device.Activate(ref IID_IAudioSessionManager2, 0, IntPtr.Zero, out sessionManagerObj);
            if (hr != 0)
            {
                Console.Error.WriteLine($"[DEBUG] Activate failed: 0x{hr:X8}");
                Console.WriteLine("[]");
                return;
            }

            var sessionManager = (IAudioSessionManager2)sessionManagerObj;
            IAudioSessionEnumerator sessionEnum;
            hr = sessionManager.GetSessionEnumerator(out sessionEnum);
            if (hr != 0)
            {
                Console.Error.WriteLine($"[DEBUG] GetSessionEnumerator failed: 0x{hr:X8}");
                Console.WriteLine("[]");
                return;
            }

            int count;
            hr = sessionEnum.GetCount(out count);
            if (hr != 0)
            {
                Console.Error.WriteLine($"[DEBUG] GetCount failed: 0x{hr:X8}");
                Console.WriteLine("[]");
                return;
            }
            
            if (count == 0)
            {
                Console.Error.WriteLine("[DEBUG] No audio sessions found (count is 0)");
                Console.Error.WriteLine("[DEBUG] This usually means no applications are currently using audio");
                Console.WriteLine("[]");
                return;
            }
            
            Console.Error.WriteLine($"[DEBUG] Found {count} audio sessions, processing...");

            for (int i = 0; i < count; i++)
            {
                try
                {
                    IAudioSessionControl2 sessionCtrl;
                    hr = sessionEnum.GetSession(i, out sessionCtrl);
                    if (hr != 0 || sessionCtrl == null) continue;

                    uint processId;
                    hr = sessionCtrl.GetProcessId(out processId);
                    if (hr != 0 || processId == 0) continue;

                    try
                    {
                        var proc = Process.GetProcessById((int)processId);
                        string procName = proc.ProcessName;

                        // Query for ISimpleAudioVolume
                        Guid IID_ISimpleAudioVolume = new Guid("BCBFB335-AB07-4D86-9AC7-30517B9D2764");
                        IntPtr sessionUnkPtr = Marshal.GetIUnknownForObject(sessionCtrl);
                        IntPtr volPtr;
                        hr = Marshal.QueryInterface(sessionUnkPtr, ref IID_ISimpleAudioVolume, out volPtr);
                        Marshal.Release(sessionUnkPtr);

                        if (hr == 0 && volPtr != IntPtr.Zero)
                        {
                            var simpleVol = (ISimpleAudioVolume)Marshal.GetObjectForIUnknown(volPtr);
                            Marshal.Release(volPtr);

                            float volume;
                            bool muted;
                            simpleVol.GetMasterVolume(out volume);
                            simpleVol.GetMute(out muted);

                            sessions.Add(new
                            {
                                processId = processId,
                                name = procName,
                                volume = volume,
                                isMuted = muted
                            });
                        }
                    }
                    catch
                    {
                        continue;
                    }
                }
                catch
                {
                    continue;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DEBUG] Exception in GetAudioSessions: {ex.GetType().Name}: {ex.Message}");
            Console.Error.WriteLine($"[DEBUG] Stack trace: {ex.StackTrace}");
            Console.WriteLine("[]");
            return;
        }

        var json = JsonSerializer.Serialize(sessions, new JsonSerializerOptions { WriteIndented = false });
        Console.WriteLine(json);
    }

    static void SetAudioVolume(uint processId, float volume)
    {
        int hr;
        try
        {
            Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
            Type comType = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
            object comObject = Activator.CreateInstance(comType);
            var deviceEnumerator = (IMMDeviceEnumerator)comObject;

            IMMDevice device;
            hr = deviceEnumerator.GetDefaultAudioEndpoint(0, 0, out device);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            object sessionManagerObj;
            hr = device.Activate(ref IID_IAudioSessionManager2, 0, IntPtr.Zero, out sessionManagerObj);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            var sessionManager = (IAudioSessionManager2)sessionManagerObj;
            IAudioSessionEnumerator sessionEnum;
            hr = sessionManager.GetSessionEnumerator(out sessionEnum);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            int count;
            hr = sessionEnum.GetCount(out count);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            for (int i = 0; i < count; i++)
            {
                IAudioSessionControl2 sessionCtrl;
                hr = sessionEnum.GetSession(i, out sessionCtrl);
                if (hr != 0 || sessionCtrl == null) continue;

                uint pid;
                hr = sessionCtrl.GetProcessId(out pid);
                if (hr != 0 || pid != processId) continue;

                Guid IID_ISimpleAudioVolume = new Guid("BCBFB335-AB07-4D86-9AC7-30517B9D2764");
                IntPtr unkPtr = Marshal.GetIUnknownForObject(sessionCtrl);
                IntPtr volPtr;
                hr = Marshal.QueryInterface(unkPtr, ref IID_ISimpleAudioVolume, out volPtr);
                Marshal.Release(unkPtr);

                if (hr == 0 && volPtr != IntPtr.Zero)
                {
                    var simpleVol = (ISimpleAudioVolume)Marshal.GetObjectForIUnknown(volPtr);
                    Marshal.Release(volPtr);

                    simpleVol.SetMasterVolume(volume, Guid.Empty);
                    Console.WriteLine("{\"success\":true}");
                    return;
                }
            }

            Console.WriteLine("{\"success\":false}");
        }
        catch
        {
            Console.WriteLine("{\"success\":false}");
        }
    }

    static void SetAudioMute(uint processId, bool mute)
    {
        int hr;
        try
        {
            Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
            Type comType = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
            object comObject = Activator.CreateInstance(comType);
            var deviceEnumerator = (IMMDeviceEnumerator)comObject;

            IMMDevice device;
            hr = deviceEnumerator.GetDefaultAudioEndpoint(0, 0, out device);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            object sessionManagerObj;
            hr = device.Activate(ref IID_IAudioSessionManager2, 0, IntPtr.Zero, out sessionManagerObj);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            var sessionManager = (IAudioSessionManager2)sessionManagerObj;
            IAudioSessionEnumerator sessionEnum;
            hr = sessionManager.GetSessionEnumerator(out sessionEnum);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            int count;
            hr = sessionEnum.GetCount(out count);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            for (int i = 0; i < count; i++)
            {
                IAudioSessionControl2 sessionCtrl;
                hr = sessionEnum.GetSession(i, out sessionCtrl);
                if (hr != 0 || sessionCtrl == null) continue;

                uint pid;
                hr = sessionCtrl.GetProcessId(out pid);
                if (hr != 0 || pid != processId) continue;

                Guid IID_ISimpleAudioVolume = new Guid("BCBFB335-AB07-4D86-9AC7-30517B9D2764");
                IntPtr unkPtr = Marshal.GetIUnknownForObject(sessionCtrl);
                IntPtr volPtr;
                hr = Marshal.QueryInterface(unkPtr, ref IID_ISimpleAudioVolume, out volPtr);
                Marshal.Release(unkPtr);

                if (hr == 0 && volPtr != IntPtr.Zero)
                {
                    var simpleVol = (ISimpleAudioVolume)Marshal.GetObjectForIUnknown(volPtr);
                    Marshal.Release(volPtr);

                    simpleVol.SetMute(mute, Guid.Empty);
                    Console.WriteLine("{\"success\":true}");
                    return;
                }
            }

            Console.WriteLine("{\"success\":false}");
        }
        catch
        {
            Console.WriteLine("{\"success\":false}");
        }
    }

    static void MuteAllAudio(bool mute)
    {
        int hr;
        try
        {
            Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
            Type comType = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
            object comObject = Activator.CreateInstance(comType);
            var deviceEnumerator = (IMMDeviceEnumerator)comObject;

            IMMDevice device;
            hr = deviceEnumerator.GetDefaultAudioEndpoint(0, 0, out device);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            object sessionManagerObj;
            hr = device.Activate(ref IID_IAudioSessionManager2, 0, IntPtr.Zero, out sessionManagerObj);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            var sessionManager = (IAudioSessionManager2)sessionManagerObj;
            IAudioSessionEnumerator sessionEnum;
            hr = sessionManager.GetSessionEnumerator(out sessionEnum);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            int count;
            hr = sessionEnum.GetCount(out count);
            if (hr != 0)
            {
                Console.WriteLine("{\"success\":false}");
                return;
            }

            int mutedCount = 0;
            for (int i = 0; i < count; i++)
            {
                try
                {
                    IAudioSessionControl2 sessionCtrl;
                    hr = sessionEnum.GetSession(i, out sessionCtrl);
                    if (hr != 0 || sessionCtrl == null) continue;

                    Guid IID_ISimpleAudioVolume = new Guid("BCBFB335-AB07-4D86-9AC7-30517B9D2764");
                    IntPtr unkPtr = Marshal.GetIUnknownForObject(sessionCtrl);
                    IntPtr volPtr;
                    hr = Marshal.QueryInterface(unkPtr, ref IID_ISimpleAudioVolume, out volPtr);
                    Marshal.Release(unkPtr);

                    if (hr == 0 && volPtr != IntPtr.Zero)
                    {
                        var simpleVol = (ISimpleAudioVolume)Marshal.GetObjectForIUnknown(volPtr);
                        Marshal.Release(volPtr);

                        simpleVol.SetMute(mute, Guid.Empty);
                        mutedCount++;
                    }
                }
                catch
                {
                    continue;
                }
            }

            Console.WriteLine($"{{\"success\":true,\"count\":{mutedCount}}}");
        }
        catch
        {
            Console.WriteLine("{\"success\":false}");
        }
    }
}

