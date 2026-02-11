const { app, BrowserWindow, ipcMain, shell, globalShortcut, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const MediaController = require('./mediaController');
const { loadStore, saveStore } = require('./macrosStore');

let mainWindow;
let mediaController = null;
let macroStore = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // icon: path.join(__dirname, 'assets', 'icon.png'), // Uncomment when icon is added
    show: false,
    focusable: true // Ensure window can receive keyboard input
  });

  mainWindow.loadFile('index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // DevTools toggle and key recording handled in setupKeyRecording()

  // Handle window controls
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeMediaController() {
    mediaController = new MediaController();
    mediaController.initialize().then(() => {
        console.log('Media controller initialized');
        
        // Test media detection immediately
        mediaController.getMediaInfo().then((info) => {
            console.log('Initial media check:', info);
            if (mainWindow) {
                mainWindow.webContents.send('media-update', info);
            }
        });
        
        // Start update loop
        mediaController.startUpdateLoop((info) => {
            if (mainWindow) {
                mainWindow.webContents.send('media-update', info);
            }
        });
    }).catch((error) => {
        console.error('Failed to initialize media controller:', error);
        if (mainWindow) {
            mainWindow.webContents.send('backend-error', error.message);
        }
    });
}

// --- Macro store helpers ---
function ensureMacroStore() {
  if (!macroStore) {
    macroStore = loadStore();
  }
  return macroStore;
}

function persistMacroStore() {
  if (macroStore) {
    saveStore(macroStore);
  }
}

// IPC Handlers - Media
ipcMain.handle('get-media-info', async () => {
  try {
    if (!mediaController) {
      return { error: 'Media controller not initialized' };
    }
    return await mediaController.getMediaInfo();
  } catch (error) {
    console.error('Error fetching media info:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('play-pause', async () => {
  try {
    if (!mediaController) {
      return { error: 'Media controller not initialized' };
    }
    return await mediaController.playPause();
  } catch (error) {
    console.error('Error toggling play/pause:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('next-track', async () => {
  try {
    if (!mediaController) {
      return { error: 'Media controller not initialized' };
    }
    return await mediaController.nextTrack();
  } catch (error) {
    console.error('Error skipping next:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('previous-track', async () => {
  try {
    if (!mediaController) {
      return { error: 'Media controller not initialized' };
    }
    return await mediaController.previousTrack();
  } catch (error) {
    console.error('Error skipping previous:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('seek-to-position', async (event, percentage) => {
  try {
    if (!mediaController) {
      return { error: 'Media controller not initialized' };
    }
    return await mediaController.seekToPosition(percentage);
  } catch (error) {
    console.error('Error seeking:', error.message);
    return { error: error.message };
  }
});

// IPC Handlers - Window / App
ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('minimize-app', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('focus-window', () => {
  if (mainWindow) {
    mainWindow.focus();
    mainWindow.show();
  }
});

// IPC Handlers - Macros and settings
ipcMain.handle('get-macros-and-settings', () => {
  const store = ensureMacroStore();
  return {
    settings: store.settings,
    macros: store.macros,
  };
});

ipcMain.handle('save-macros-and-settings', (event, payload) => {
  const store = ensureMacroStore();
  if (payload && typeof payload === 'object') {
    if (payload.settings) {
      store.settings = {
        ...store.settings,
        ...payload.settings,
      };
    }
    if (Array.isArray(payload.macros)) {
      store.macros = payload.macros;
    }
    persistMacroStore();
  }
  return { success: true };
});

ipcMain.handle('execute-macro', async (event, macro) => {
  try {
    if (!macro || !macro.type) {
      return { success: false, error: 'Invalid macro' };
    }

    switch (macro.type) {
      case 'keyboard': {
        // Use PowerShell + Windows.Forms SendKeys so we avoid native addons
        const sequence = macro.config?.keys || '';
        if (!sequence) {
          return { success: false, error: 'No key sequence provided' };
        }
        const ps = [
          '$sig = @"',
          'using System;',
          'using System.Windows.Forms;',
          '"@',
          'Add-Type -TypeDefinition $sig -ReferencedAssemblies System.Windows.Forms',
          `[System.Windows.Forms.SendKeys]::SendWait("${sequence.replace(/"/g, '""')}")`,
        ].join('\n');

        await new Promise((resolve, reject) => {
          exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/\n/g, '`n').replace(/"/g, '\\"')}"`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        return { success: true };
      }

      case 'website': {
        const url = macro.config?.url;
        if (!url) return { success: false, error: 'No URL provided' };
        await shell.openExternal(url);
        return { success: true };
      }

      case 'app': {
        const exePath = macro.config?.path;
        const args = macro.config?.args || '';
        if (!exePath) return { success: false, error: 'No application path provided' };
        exec(`start "" "${exePath}" ${args}`, (err) => {
          if (err) console.error('App macro error:', err);
        });
        return { success: true };
      }

      case 'library': {
        // Library widgets don't execute, they just display
        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown macro type' };
    }
  } catch (error) {
    console.error('Error executing macro:', error);
    return { success: false, error: error.message };
  }
});

// Keyboard recording state
let isRecordingKeys = false;

// Handle keyboard recording
ipcMain.handle('start-key-recording', () => {
  isRecordingKeys = true;
  return { success: true };
});

ipcMain.handle('stop-key-recording', () => {
  isRecordingKeys = false;
  return { success: true };
});

// Capture keyboard input at main process level
function setupKeyRecording() {
  if (!mainWindow) return;
  
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Only intercept when recording
    if (!isRecordingKeys) {
      // F12 can still be used to toggle DevTools manually if needed
      return;
    }
    
    // Prevent default for all keys when recording (except Escape)
    if (input.key !== 'Escape') {
      event.preventDefault();
    }
    
    // Send key info to renderer - always send keydown events
    if (mainWindow && mainWindow.webContents) {
      const keyData = {
        key: input.key,
        code: input.code,
        ctrl: input.control || false,
        alt: input.alt || false,
        shift: input.shift || false,
        meta: (input.meta || input.super) || false,
        type: input.type || 'keyDown'
      };
      
      console.log('Sending key-recorded event:', keyData); // Debug log
      mainWindow.webContents.send('key-recorded', keyData);
    }
  });
}

// System monitoring functions
let cpuUsageHistory = [];
let previousCpuTimes = null;

function getCpuUsage() {
  return new Promise((resolve) => {
    const cpus = os.cpus();
    if (!previousCpuTimes) {
      previousCpuTimes = cpus.map(cpu => ({
        user: cpu.times.user,
        nice: cpu.times.nice,
        sys: cpu.times.sys,
        idle: cpu.times.idle,
        irq: cpu.times.irq
      }));
      setTimeout(() => getCpuUsage().then(resolve), 1000);
      return;
    }

    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach((cpu, i) => {
      const prev = previousCpuTimes[i];
      const idle = cpu.times.idle - prev.idle;
      const tick = (cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq) -
                   (prev.user + prev.nice + prev.sys + prev.idle + prev.irq);
      totalIdle += idle;
      totalTick += tick;
      
      previousCpuTimes[i] = {
        user: cpu.times.user,
        nice: cpu.times.nice,
        sys: cpu.times.sys,
        idle: cpu.times.idle,
        irq: cpu.times.irq
      };
    });

    const usage = 100 - ~~(100 * totalIdle / totalTick);
    resolve(Math.min(100, Math.max(0, usage)));
  });
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total,
    used,
    free,
    percentage: (used / total) * 100
  };
}

function getDiskUsage() {
  return new Promise((resolve) => {
    // Get C: drive usage on Windows
    exec('wmic logicaldisk get size,freespace,caption', (error, stdout) => {
      if (error) {
        resolve({ total: 0, used: 0, free: 0, percentage: 0 });
        return;
      }
      
      const lines = stdout.split('\n').filter(line => line.trim());
      let total = 0;
      let free = 0;
      
      for (const line of lines) {
        if (line.includes('C:')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            total = parseInt(parts[parts.length - 2]) || 0;
            free = parseInt(parts[parts.length - 1]) || 0;
          }
        }
      }
      
      const used = total - free;
      resolve({
        total,
        used,
        free,
        percentage: total > 0 ? (used / total) * 100 : 0
      });
    });
  });
}

let previousNetworkStats = null;
let networkUpdateTime = null;

function getNetworkBandwidth() {
  return new Promise((resolve) => {
    exec('powershell -Command "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json"', (error, stdout) => {
      if (error || !stdout) {
        resolve({ download: 0, upload: 0, downloadSpeed: 0, uploadSpeed: 0 });
        return;
      }
      
      try {
        const now = Date.now();
        const adapters = JSON.parse(stdout);
        const adapter = Array.isArray(adapters) ? adapters[0] : adapters;
        
        if (!adapter) {
          resolve({ download: 0, upload: 0, downloadSpeed: 0, uploadSpeed: 0 });
          return;
        }
        
        const received = adapter.ReceivedBytes || 0;
        const sent = adapter.SentBytes || 0;
        
        let downloadSpeed = 0;
        let uploadSpeed = 0;
        
        if (previousNetworkStats && networkUpdateTime) {
          const timeDiff = (now - networkUpdateTime) / 1000; // seconds
          if (timeDiff > 0) {
            downloadSpeed = (received - previousNetworkStats.received) / timeDiff;
            uploadSpeed = (sent - previousNetworkStats.sent) / timeDiff;
          }
        }
        
        previousNetworkStats = { received, sent };
        networkUpdateTime = now;
        
        resolve({
          download: received,
          upload: sent,
          downloadSpeed: Math.max(0, downloadSpeed),
          uploadSpeed: Math.max(0, uploadSpeed)
        });
      } catch (e) {
        resolve({ download: 0, upload: 0, downloadSpeed: 0, uploadSpeed: 0 });
      }
    });
  });
}

async function getAllSystemStats() {
  const [cpu, memory, disk, network] = await Promise.all([
    getCpuUsage(),
    Promise.resolve(getMemoryUsage()),
    getDiskUsage(),
    getNetworkBandwidth()
  ]);
  
  return {
    cpu,
    memory,
    disk,
    network
  };
}

// IPC handler for system stats
ipcMain.handle('get-system-stats', async () => {
  return await getAllSystemStats();
});

// IPC handler for file dialog
ipcMain.handle('show-open-dialog', async (event, options) => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// App lifecycle
app.whenReady().then(() => {
  // Initialize macro store
  ensureMacroStore();

  initializeMediaController();
  createWindow();
  setupKeyRecording();
  setupKeyRecording();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (mediaController) {
    mediaController.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (mediaController) {
    mediaController.stop();
  }
});

