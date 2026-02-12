const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Media controls
  getMediaInfo: () => ipcRenderer.invoke('get-media-info'),
  playPause: () => ipcRenderer.invoke('play-pause'),
  nextTrack: () => ipcRenderer.invoke('next-track'),
  previousTrack: () => ipcRenderer.invoke('previous-track'),
  seekToPosition: (percentage) => ipcRenderer.invoke('seek-to-position', percentage),

  // Window controls
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  focusWindow: () => ipcRenderer.send('focus-window'),

  // Macro + settings APIs
  getMacrosAndSettings: () => ipcRenderer.invoke('get-macros-and-settings'),
  saveMacrosAndSettings: (payload) => ipcRenderer.invoke('save-macros-and-settings', payload),
  executeMacro: (macro) => ipcRenderer.invoke('execute-macro', macro),

  // Event subscriptions
  onBackendError: (callback) => ipcRenderer.on('backend-error', callback),
  onMediaUpdate: (callback) => ipcRenderer.on('media-update', callback),
  onPlaySound: (callback) => ipcRenderer.on('play-sound', callback),

  // Keyboard recording
  startKeyRecording: () => ipcRenderer.invoke('start-key-recording'),
  stopKeyRecording: () => ipcRenderer.invoke('stop-key-recording'),
  onKeyRecorded: (callback) => ipcRenderer.on('key-recorded', callback),

  // System stats for widgets
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),

  // File dialog
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

