# MacroSwag

A modern virtual macro controller with integrated media player controls for Windows. Create custom macros for keyboard shortcuts, applications, websites, and system widgets - perfect for touchscreen monitors or as a desktop macro pad.

![MacroSwag Screenshot](https://i.ibb.co/C5c2mXS2/updated-UI.png)

## Features

- 🎮 **Macro Grid** - Customizable buttons for shortcuts, apps, and websites
- 📊 **Widget Library** - Real-time system monitors and information widgets
- 🎵 **Media Controller** - Control Spotify, Apple Music, Windows Media Player, and more
- 🎨 **Beautiful Themes** - Multiple gradient themes with smooth animations
- 🖼️ **Album Art** - Displays now-playing artwork from your media player
- ⚡ **Real-time Updates** - Widgets and media info update automatically
- 📁 **Folders** - Organize macros into folders for better organization

## Macro Types

- **Keyboard Shortcut** - Record and execute keyboard combinations
- **Application** - Launch programs with optional command-line arguments
- **Website** - Quick access to your favorite URLs

*More macro types are in development.*

## Library Widgets

### System Monitors
- **CPU Usage** - Real-time CPU utilization
- **Memory Usage** - RAM usage and available memory
- **Disk Usage** - Disk space and activity level
- **Network Bandwidth** - Upload/download throughput
- **GPU Usage** - GPU utilization and memory usage

### Information Widgets
- **Clock** - Digital system time
- **Weather** - Current weather conditions and temperature
- **RSS Feed** - Scroll through RSS headlines and images
- **Stock Ticker** - Live stock prices via Alpha Vantage
- **Cryptoticker** - Live crypto prices via CoinMarketCap

### Productivity Widgets
- **Pomodoro Timer** - 25-minute work intervals with breaks
- **IFTTT Webhook** - Trigger IFTTT automations and applets
- **Text to Speech** - Convert text to speech using Deepgram API

### Organization
- **Folder** - Organise macros into folders

*More widgets are in development.*

## Installation

### Requirements

- Windows 10/11
- Node.js 18+ and npm
- .NET SDK (optional, for improved media detection)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the C# helper (recommended for reliable media detection):**
   ```bash
   cd MediaControllerHelper
   dotnet build -c Release
   cd ..
   ```
   
   *Note: If you don't have .NET SDK, the app will fall back to PowerShell, but media detection may be less reliable.*

3. **Run the app:**
   ```bash
   npm start
   ```

## Usage

### Adding Macros

1. Click **"Add Macro"** or right-click an empty slot
2. Choose a macro type (Keyboard Shortcut, Website, Application)
3. Fill in the details and optionally upload a custom icon
4. Click **"Save"**

### Adding Widgets

1. Click **"Library"** to open the widget library
2. Drag a widget to any slot, or click to configure and add
3. Some widgets require configuration (API keys, settings, etc.)
4. Widgets automatically update with real-time system data

### Editing Macros

1. Click **"Edit Mode"** to enable editing
2. Click any macro to edit it
3. Right-click for quick access to Edit/Delete options
4. Drag macros to reorder them

### Media Controls

The media player automatically detects when music is playing from supported apps. Use the play/pause, next, and previous buttons to control playback.

## Project Structure

```
.
├── main.js              # Electron main process
├── preload.js           # Secure IPC bridge
├── index.html           # Main UI
├── styles.css           # Styling and themes
├── renderer.js          # Frontend logic
├── mediaController.js   # Windows media control
├── macrosStore.js       # Persistent storage
├── MediaControllerHelper/  # C# helper for media detection
└── package.json         # Dependencies
```

## Building for Distribution

```bash
npm run build
```

This creates a distributable package in the `dist` folder.

## Troubleshooting

### Windows Security / Antivirus Warnings

**Why does Windows Defender flag this app?**

MacroSwag uses global keyboard hooks to record keyboard shortcuts. This is necessary to capture the Windows key and other system-level shortcuts. Windows Defender may flag this behavior as potentially malicious because keyloggers use similar techniques.

**This is safe because:**
- The keyboard listener is **only active when you're recording a shortcut** (when the recording modal is open)
- It's **completely disabled** when not recording
- No keyboard data is stored or transmitted anywhere - it's only used to create your macros
- The app is open source and you can review the code

**To allow the app:**
1. When Windows Defender shows a warning, click "More info"
2. Click "Run anyway"
3. Or add an exclusion in Windows Security settings:
   - Open Windows Security
   - Go to Virus & threat protection
   - Click "Manage settings" under Virus & threat protection settings
   - Scroll down to Exclusions and add the app folder

### Media Not Detected

- Make sure your media player is actually playing (not just open)
- Verify you're using Windows 10 (1809+) or Windows 11
- Check the console for error messages (View > Toggle Developer Tools)

### Macros Not Saving

- Check that the app has write permissions in the user data directory
- Look for error messages in the console

## License

MIT
