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
  maximizeApp: () => ipcRenderer.send('maximize-app'),
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
  onAutoStopRecording: (callback) => ipcRenderer.on('auto-stop-recording', callback),

  // System stats for widgets
  getSystemStats: (options) => ipcRenderer.invoke('get-system-stats', options),
  getAvailableDisks: () => ipcRenderer.invoke('get-available-disks'),
  getAvailableGpus: () => ipcRenderer.invoke('get-available-gpus'),

  // File dialog
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Crypto API
  fetchCryptoPrice: (apiKey, symbol) => ipcRenderer.invoke('fetch-crypto-price', { apiKey, symbol }),

  // Stock API
  fetchStockPrice: (apiKey, symbol) => ipcRenderer.invoke('fetch-stock-price', { apiKey, symbol }),

  // Weather API
  searchCity: (query) => ipcRenderer.invoke('search-city', query),
  fetchWeather: (latitude, longitude) => ipcRenderer.invoke('fetch-weather', { latitude, longitude }),

  // Audio Control
  getAudioApplications: () => ipcRenderer.invoke('get-audio-applications'),
  setApplicationVolume: (processId, volume) => ipcRenderer.invoke('set-application-volume', processId, volume),
  setApplicationMute: (processId, isMuted) => ipcRenderer.invoke('set-application-mute', processId, isMuted),
  muteAllAudio: () => ipcRenderer.invoke('mute-all-audio'),
  unmuteAllAudio: () => ipcRenderer.invoke('unmute-all-audio'),

  // Icon fetching
  fetchFavicon: (url) => ipcRenderer.invoke('fetch-favicon', url),
  extractAppIcon: (exePath) => ipcRenderer.invoke('extract-app-icon', exePath)
});

