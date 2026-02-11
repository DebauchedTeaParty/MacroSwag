using System;
using System.Text.Json;
using Windows.Media.Control;
using Windows.Foundation;

class Program
{
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
}

