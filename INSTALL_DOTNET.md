# Installing .NET SDK

The C# helper requires .NET 6.0 SDK or later for reliable Windows Media Control API access.

## Quick Install

1. **Download .NET SDK**:
   - Go to: https://dotnet.microsoft.com/download
   - Download .NET 6.0 SDK or later (recommended: .NET 8.0 SDK)
   - Run the installer

2. **Verify Installation**:
   ```powershell
   dotnet --version
   ```
   Should show version 6.0.0 or higher

3. **Build the Helper**:
   ```powershell
   cd MediaControllerHelper
   dotnet build -c Release
   cd ..
   ```

## Alternative: Use PowerShell Fallback

If you don't want to install .NET SDK, the app will automatically fall back to PowerShell. However, PowerShell has limitations with Windows Runtime async operations, so media detection may be unreliable.

You can still try running the app:
```bash
npm start
```

The app will attempt to use PowerShell if the C# helper isn't found, but you may encounter the async operation issues we've been troubleshooting.

## Why .NET SDK?

- Native Windows Runtime API support
- Proper async/await handling
- More reliable than PowerShell for this use case
- Inspired by the [WindowsMediaController](https://github.com/DubyaDude/WindowsMediaController) library approach

