# MacroSwag

A modern virtual macro controller with integrated media player controls for Windows. Create custom macros for keyboard shortcuts, applications, websites, and system widgets - perfect for touchscreen monitors or as a desktop macro pad.

![MacroSwag Screenshot](https://i.ibb.co/1GcYMQ3x/Screenshot-2026-02-11-145805.png)

## What is MacroSwag?

MacroSwag combines a **virtual stream deck** with **media player controls** in one beautiful application. It features:

- 🎮 **Macro Grid** - 12 customizable buttons for your shortcuts, apps, and websites
- 📊 **Widget Library** - Built-in system monitors (CPU, Memory, Disk, Network, Clock)
- 🎵 **Media Controller** - Control Spotify, Apple Music, Windows Media Player, and more
- 🎨 **Beautiful Themes** - Multiple gradient themes with smooth animations
- 🖼️ **Album Art** - Displays now-playing artwork from your media player
- ⚡ **Real-time Updates** - Widgets and media info update automatically

## Features

### Macro Types

- **Keyboard Shortcuts** - Record and execute keyboard combinations
- **Applications** - Launch programs with a single click
- **Websites** - Quick access to your favorite URLs
- **Library Widgets** - System resource monitors that update in real-time

### Media Controls

- Play/Pause, Next, Previous track controls
- Displays track title, artist, album, and source app
- Shows album artwork (fetched from Last.fm)
- Wavy animated progress bar

### Customization

- Drag and drop to reorder macros in Edit Mode
- Custom icons with image cropping
- Multiple gradient themes (Default, Ocean, Sunset, Neon, Dark)
- Persistent storage - all macros and settings saved automatically

## Installation

### Requirements

- Windows 10/11
- Node.js 18+ and npm

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
2. Drag a widget to any slot, or click to add to the first available slot
3. Widgets automatically update with real-time system data

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

### Media Not Detected

- Make sure your media player is actually playing (not just open)
- Verify you're using Windows 10 (1809+) or Windows 11
- Check the console for error messages (View > Toggle Developer Tools)

### Macros Not Saving

- Check that the app has write permissions in the user data directory
- Look for error messages in the console

## License

MIT
