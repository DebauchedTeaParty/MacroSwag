const { app, BrowserWindow, ipcMain, shell, globalShortcut, dialog } = require('electron');
const axios = require('axios');
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
    height: 700,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true
    },
    // icon: path.join(__dirname, 'assets', 'icon.png'), // Uncomment when icon is added
    show: false,
    focusable: true // Ensure window can receive keyboard input
  });

  mainWindow.loadFile('index.html');

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

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

ipcMain.on('maximize-app', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
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
    folderMacros: store.folderMacros || {},
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
    if (payload.folderMacros && typeof payload.folderMacros === 'object') {
      store.folderMacros = payload.folderMacros;
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
        // Library widgets don't execute, they just display (except IFTTT)
        if (macro.config?.widgetType === 'ifttt') {
          // Handle IFTTT library widget
          const eventName = macro.config?.event;
          const webhookKey = macro.webhookKey; // Passed from renderer
          if (!eventName) {
            return { success: false, error: 'No event name provided' };
          }
          if (!webhookKey) {
            return { success: false, error: 'No IFTTT webhook key configured. Please set it in Settings.' };
          }

          const url = `https://maker.ifttt.com/trigger/${encodeURIComponent(eventName)}/with/key/${encodeURIComponent(webhookKey)}`;
          
          // Build request body with optional values
          const body = {};
          if (macro.config?.value1) body.value1 = macro.config.value1;
          if (macro.config?.value2) body.value2 = macro.config.value2;
          if (macro.config?.value3) body.value3 = macro.config.value3;

          try {
            const response = await axios.post(url, Object.keys(body).length > 0 ? body : undefined, {
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 10000, // 10 second timeout
            });
            return { success: true, response: response.data };
          } catch (error) {
            console.error('IFTTT webhook error:', error);
            return { success: false, error: error.message || 'Failed to trigger IFTTT webhook' };
          }
        }
        // Other library widgets don't execute, they just display
        return { success: true };
      }

      case 'ifttt': {
        // Legacy support for old IFTTT macros (shouldn't happen now)
        const eventName = macro.config?.event;
        const webhookKey = macro.webhookKey; // Passed from renderer
        if (!eventName) {
          return { success: false, error: 'No event name provided' };
        }
        if (!webhookKey) {
          return { success: false, error: 'No IFTTT webhook key configured. Please set it in Settings.' };
        }

        const url = `https://maker.ifttt.com/trigger/${encodeURIComponent(eventName)}/with/key/${encodeURIComponent(webhookKey)}`;
        
        // Build request body with optional values
        const body = {};
        if (macro.config?.value1) body.value1 = macro.config.value1;
        if (macro.config?.value2) body.value2 = macro.config.value2;
        if (macro.config?.value3) body.value3 = macro.config.value3;

        try {
          const response = await axios.post(url, Object.keys(body).length > 0 ? body : undefined, {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 second timeout
          });
          return { success: true, response: response.data };
        } catch (error) {
          console.error('IFTTT webhook error:', error);
          return { success: false, error: error.message || 'Failed to trigger IFTTT webhook' };
        }
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

function getDiskUsage(diskLetter = 'C:') {
  return new Promise((resolve) => {
    // Use PowerShell with Get-PSDrive (more reliable)
    const driveLetter = diskLetter.replace(':', '').trim();
    // Use single quotes to avoid escaping issues
    const psCommand = `$disk = Get-PSDrive -Name '${driveLetter}' -ErrorAction SilentlyContinue; if ($disk) { $size = ($disk.Used + $disk.Free); $free = $disk.Free; $used = $disk.Used; Write-Output ($size.ToString() + '|' + $free.ToString() + '|' + $used.ToString()) } else { Write-Output '0|0|0' }`;
    
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (error, stdout, stderr) => {
      if (error || !stdout || stdout.trim() === '0|0|0') {
        console.error('Error getting disk usage with Get-PSDrive:', error, stderr);
        resolve({ total: 0, used: 0, free: 0, percentage: 0, disk: diskLetter });
        return;
      }

      // Parse Get-PSDrive output: size|free|used (in bytes)
      const parts = stdout.trim().split('|');
      if (parts.length === 3) {
        const total = parseFloat(parts[0]) || 0;
        const free = parseFloat(parts[1]) || 0;
        const used = parseFloat(parts[2]) || 0;
        
        if (total === 0) {
          console.error('Disk total is 0, output was:', stdout);
          resolve({ total: 0, used: 0, free: 0, percentage: 0, disk: diskLetter });
          return;
        }
        
        const result = {
          total: total,
          used: used,
          free: free,
          percentage: total > 0 ? (used / total) * 100 : 0,
          disk: diskLetter
        };
        
        console.log(`Disk ${diskLetter} usage:`, result);
        resolve(result);
      } else {
        console.error('Failed to parse disk output, got:', stdout);
        resolve({ total: 0, used: 0, free: 0, percentage: 0, disk: diskLetter });
      }
    });
  });
}

function getAvailableDisks() {
  return new Promise((resolve) => {
    exec('wmic logicaldisk get caption', (error, stdout) => {
      if (error) {
        resolve(['C:']);
        return;
      }

      const disks = [];
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Caption'));
      for (const line of lines) {
        const match = line.match(/([A-Z]:)/);
        if (match) {
          disks.push(match[1]);
        }
      }
      resolve(disks.length > 0 ? disks : ['C:']);
    });
  });
}

function getGpuUsage() {
  return new Promise((resolve) => {
    // Use nvidia-smi for NVIDIA GPUs or wmic for other GPUs
    exec('nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', (error, stdout) => {
      if (!error && stdout) {
        // Parse NVIDIA GPU data
        const lines = stdout.split('\n').filter(line => line.trim());
        const gpus = [];
        lines.forEach((line, index) => {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 5) {
            gpus.push({
              index: parseInt(parts[0]) || index,
              name: parts[1] || `GPU ${index}`,
              usage: parseInt(parts[2]) || 0,
              memoryUsed: parseInt(parts[3]) || 0,
              memoryTotal: parseInt(parts[4]) || 0,
              memoryPercentage: parts[4] > 0 ? (parts[3] / parts[4]) * 100 : 0
            });
          }
        });
        if (gpus.length > 0) {
          resolve(gpus);
          return;
        }
      }
      
      // Fallback: Try to get GPU info via wmic (less detailed)
      exec('wmic path win32_VideoController get name,AdapterRAM', (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        
        const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Name'));
        const gpus = [];
        lines.forEach((line, index) => {
          const parts = line.trim().split(/\s{2,}/);
          if (parts.length >= 1) {
            gpus.push({
              index: index,
              name: parts[0] || `GPU ${index}`,
              usage: 0, // Can't get usage via wmic
              memoryUsed: 0,
              memoryTotal: parseInt(parts[1]) || 0,
              memoryPercentage: 0
            });
          }
        });
        resolve(gpus);
      });
    });
  });
}

function getAvailableGpus() {
  return new Promise((resolve) => {
    // Try nvidia-smi first
    exec('nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits', (error, stdout) => {
      if (!error && stdout) {
        const lines = stdout.split('\n').filter(line => line.trim());
        const gpus = [];
        lines.forEach((line, index) => {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            gpus.push({
              index: parseInt(parts[0]) || index,
              name: parts[1] || `GPU ${index}`
            });
          }
        });
        if (gpus.length > 0) {
          resolve(gpus);
          return;
        }
      }
      
      // Fallback: wmic
      exec('wmic path win32_VideoController get name', (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }
        
        const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Name'));
        const gpus = [];
        lines.forEach((line, index) => {
          if (line.trim()) {
            gpus.push({
              index: index,
              name: line.trim()
            });
          }
        });
        resolve(gpus);
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

async function getAllSystemStats(diskLetter = 'C:', gpuIndex = 0) {
  const [cpu, memory, disk, network, gpu] = await Promise.all([
    getCpuUsage(),
    Promise.resolve(getMemoryUsage()),
    getDiskUsage(diskLetter),
    getNetworkBandwidth(),
    getGpuUsage().then(gpus => gpus[gpuIndex] || { index: 0, name: 'Unknown', usage: 0, memoryUsed: 0, memoryTotal: 0, memoryPercentage: 0 })
  ]);

  return {
    cpu,
    memory,
    disk,
    network,
    gpu
  };
}

// IPC handler for system stats
ipcMain.handle('get-system-stats', async (event, { diskLetter, gpuIndex } = {}) => {
  return await getAllSystemStats(diskLetter || 'C:', gpuIndex || 0);
});

// IPC handler for getting available disks
ipcMain.handle('get-available-disks', async () => {
  return await getAvailableDisks();
});

// IPC handler for getting available GPUs
ipcMain.handle('get-available-gpus', async () => {
  return await getAvailableGpus();
});

// IPC handler for Crypto API
ipcMain.handle('fetch-crypto-price', async (event, { apiKey, symbol }) => {
  try {
    if (!apiKey || !symbol) {
      throw new Error('API Key and Symbol are required');
    }

    const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey
      },
      params: {
        symbol: symbol,
        convert: 'USD'
      }
    });

    const data = response.data.data[symbol];
    if (!data) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    return {
      name: data.name,
      symbol: data.symbol,
      price: data.quote.USD.price,
      percent_change_24h: data.quote.USD.percent_change_24h
    };
  } catch (error) {
    console.error('Error fetching crypto price:', error.message);
    // Return error structure rather than throwing to avoid crashing renderer
    return { error: error.response?.data?.status?.error_message || error.message };
  }
});

ipcMain.handle('fetch-stock-price', async (event, { apiKey, symbol }) => {
  try {
    if (!apiKey || !symbol) {
      throw new Error('API Key and Symbol are required');
    }

    // Alpha Vantage Global Quote endpoint
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: symbol,
        apikey: apiKey
      }
    });

    if (response.data['Error Message']) {
      throw new Error(response.data['Error Message']);
    }

    if (response.data['Note']) {
      throw new Error('API call frequency limit reached. Please try again later.');
    }

    const quote = response.data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    const price = parseFloat(quote['05. price']);
    const previousClose = parseFloat(quote['08. previous close']);
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: quote['01. symbol'],
      price: price,
      change: change,
      changePercent: changePercent,
      previousClose: previousClose
    };
  } catch (error) {
    console.error('Error fetching stock price:', error.message);
    // Return error structure rather than throwing to avoid crashing renderer
    return { error: error.response?.data?.error || error.message };
  }
});

// IPC handler for city search (geocoding)
ipcMain.handle('search-city', async (event, query) => {
  try {
    if (!query || query.length < 2) {
      return [];
    }

    // Open-Meteo Geocoding API
    const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: {
        name: query,
        count: 10,
        language: 'en',
        format: 'json'
      }
    });

    if (!response.data.results) {
      return [];
    }

    return response.data.results.map(city => ({
      name: city.name,
      country: city.country,
      admin1: city.admin1, // State/Province
      latitude: city.latitude,
      longitude: city.longitude
    }));
  } catch (error) {
    console.error('Error searching cities:', error.message);
    return [];
  }
});

// IPC handler for weather data
ipcMain.handle('fetch-weather', async (event, { latitude, longitude }) => {
  try {
    if (!latitude || !longitude) {
      throw new Error('Latitude and Longitude are required');
    }

    // Open-Meteo Forecast API
    const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: latitude,
        longitude: longitude,
        current: 'temperature_2m,weather_code',
        timezone: 'auto'
      }
    });

    if (response.data.error) {
      throw new Error(response.data.reason || 'Weather data not available');
    }

    const current = response.data.current;
    return {
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      time: current.time
    };
  } catch (error) {
    console.error('Error fetching weather:', error.message);
    return { error: error.response?.data?.reason || error.message };
  }
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

// IPC Handlers - Shell
ipcMain.handle('open-external', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

// IPC Handlers - Audio Control
ipcMain.handle('get-audio-applications', async () => {
  return new Promise((resolve) => {
    // Use C# helper executable for reliable WASAPI access
    const helperPath = path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe');
    
    exec(`"${helperPath}" getaudiosessions`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error getting audio applications:', error);
        console.error('stderr:', stderr);
        resolve([]);
        return;
      }
      if (!stdout || stdout.trim() === '') {
        console.error('Error getting audio applications: No output');
        resolve([]);
        return;
      }

      try {
        const output = stdout.trim();
        const apps = JSON.parse(output);
        console.log('Parsed audio applications:', apps.length, 'apps found');
        resolve(Array.isArray(apps) ? apps : []);
      } catch (e) {
        console.error('Error parsing audio applications:', e);
        console.error('Raw output:', stdout.substring(0, 500));
        resolve([]);
      }
    });
  });
});

ipcMain.handle('set-application-volume', async (event, processId, volume) => {
  return new Promise((resolve) => {
    const helperPath = path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe');
    exec(`"${helperPath}" setaudiovolume ${processId} ${volume}`, (error, stdout) => {
      if (error) {
        console.error('Error setting application volume:', error);
        resolve({ success: false });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        console.error('Error parsing set volume response:', e);
        resolve({ success: false });
      }
    });
  });
});

ipcMain.handle('set-application-mute', async (event, processId, isMuted) => {
  return new Promise((resolve) => {
    const helperPath = path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe');
    exec(`"${helperPath}" setaudiomute ${processId} ${isMuted}`, (error, stdout) => {
      if (error) {
        console.error('Error setting application mute:', error);
        resolve({ success: false });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        console.error('Error parsing set mute response:', e);
        resolve({ success: false });
      }
    });
  });
});

ipcMain.handle('mute-all-audio', async () => {
  return new Promise((resolve) => {
    const helperPath = path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe');
    exec(`"${helperPath}" muteallaudio true`, (error, stdout) => {
      if (error) {
        console.error('Error muting all audio:', error);
        resolve({ success: false });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        console.error('Error parsing mute all response:', e);
        resolve({ success: false });
      }
    });
  });
});

ipcMain.handle('unmute-all-audio', async () => {
  return new Promise((resolve) => {
    const helperPath = path.join(__dirname, 'MediaControllerHelper', 'bin', 'Release', 'net10.0-windows10.0.22000.0', 'MediaControllerHelper.exe');
    exec(`"${helperPath}" muteallaudio false`, (error, stdout) => {
      if (error) {
        console.error('Error unmuting all audio:', error);
        resolve({ success: false });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        console.error('Error parsing unmute all response:', e);
        resolve({ success: false });
      }
    });
  });
});

// IPC handler for fetching favicon
ipcMain.handle('fetch-favicon', async (event, url) => {
  try {
    if (!url) {
      return { success: false, error: 'URL is required' };
    }

    // Extract domain from URL
    let domain;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (e) {
      // If URL parsing fails, try to extract domain manually
      domain = url.replace(/^https?:\/\//, '').split('/')[0];
    }

    // Try Google's favicon service first (most reliable)
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    
    try {
      const response = await axios.get(faviconUrl, {
        responseType: 'arraybuffer',
        timeout: 5000
      });
      
      // Convert to base64 data URL
      const base64 = Buffer.from(response.data).toString('base64');
      const mimeType = response.headers['content-type'] || 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64}`;
      
      return { success: true, dataUrl };
    } catch (error) {
      // Fallback: try to fetch from website directly
      try {
        const fallbackUrl = `https://${domain}/favicon.ico`;
        const response = await axios.get(fallbackUrl, {
          responseType: 'arraybuffer',
          timeout: 5000
        });
        
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/x-icon';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        return { success: true, dataUrl };
      } catch (fallbackError) {
        console.error('Error fetching favicon:', fallbackError);
        return { success: false, error: 'Failed to fetch favicon' };
      }
    }
  } catch (error) {
    console.error('Error in fetch-favicon:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for extracting application icon
ipcMain.handle('extract-app-icon', async (event, exePath) => {
  return new Promise((resolve) => {
    if (!exePath || !fs.existsSync(exePath)) {
      resolve({ success: false, error: 'Invalid or missing executable path' });
      return;
    }

    // Use PowerShell to extract icon from .exe file
    // Escape the path properly for PowerShell
    const escapedPath = exePath.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\$/g, '`$');
    const psScript = `Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escapedPath}'); if ($icon) { $bitmap = $icon.ToBitmap(); $ms = New-Object System.IO.MemoryStream; $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bytes = $ms.ToArray(); $base64 = [Convert]::ToBase64String($bytes); Write-Output $base64; $icon.Dispose(); $bitmap.Dispose(); $ms.Dispose() } else { Write-Output 'ERROR' }`;

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
      if (error || stdout.trim() === 'ERROR' || !stdout.trim()) {
        console.error('Error extracting app icon:', error || stderr);
        resolve({ success: false, error: 'Failed to extract icon' });
        return;
      }

      try {
        const base64 = stdout.trim();
        const dataUrl = `data:image/png;base64,${base64}`;
        resolve({ success: true, dataUrl });
      } catch (e) {
        console.error('Error processing icon data:', e);
        resolve({ success: false, error: 'Failed to process icon' });
      }
    });
  });
});
