# Media Controller Helper

A C# console application that provides reliable access to Windows Media Control APIs.

## Building

1. Make sure you have .NET 6.0 SDK installed
2. Navigate to this directory
3. Run: `dotnet build -c Release`

The executable will be in: `bin/Release/net6.0-windows10.0.22000.0/MediaControllerHelper.exe`

## Usage

The helper is called automatically by the Node.js media controller. Commands:

- `getinfo` - Get current media information (returns JSON)
- `playpause` - Toggle play/pause
- `next` - Skip to next track
- `previous` - Skip to previous track

## Why C#?

C# has native support for Windows Runtime APIs and handles async operations properly, making it much more reliable than PowerShell for this use case.

