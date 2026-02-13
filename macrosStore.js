const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  settings: {
    theme: 'default',
  },
  macros: [],
  folderMacros: {},
};

function getStorePath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'macroswag-macros.json');
}

function getOldStorePath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'streamdeck-macros.json');
}

function loadStore() {
  try {
    const filePath = getStorePath();
    const oldFilePath = getOldStorePath();
    
    let data = { ...DEFAULT_DATA };
    
    // Load from new file if it exists
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        data = {
          settings: parsed.settings || { ...DEFAULT_DATA.settings },
          macros: Array.isArray(parsed.macros) ? parsed.macros : [],
          folderMacros: (parsed.folderMacros && typeof parsed.folderMacros === 'object') ? parsed.folderMacros : {},
        };
      } catch (e) {
        console.error('Failed to parse new macro file:', e);
      }
    }
    
    // Check for old file and migrate if it exists and has macros
    if (fs.existsSync(oldFilePath)) {
      try {
        const oldRaw = fs.readFileSync(oldFilePath, 'utf8');
        const oldParsed = JSON.parse(oldRaw);
        const oldMacros = Array.isArray(oldParsed.macros) ? oldParsed.macros : [];
        
        // If old file has macros and new file doesn't, or new file is empty, migrate
        if (oldMacros.length > 0 && (data.macros.length === 0 || !fs.existsSync(filePath))) {
          console.log('Migrating macros from old file location...');
          data.macros = oldMacros;
          data.settings = oldParsed.settings || data.settings;
          // Preserve folderMacros if they exist in old file, otherwise use default
          if (oldParsed.folderMacros && typeof oldParsed.folderMacros === 'object') {
            data.folderMacros = oldParsed.folderMacros;
          }
          // Save to new location
          saveStore(data);
          console.log(`Migrated ${oldMacros.length} macros successfully`);
        }
      } catch (migrateError) {
        console.error('Failed to migrate old macros:', migrateError);
      }
    }
    
    return data;
  } catch (e) {
    console.error('Failed to load macro store:', e);
    return { ...DEFAULT_DATA };
  }
}

function saveStore(data) {
  try {
    const filePath = getStorePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const toWrite = {
      settings: data.settings || { ...DEFAULT_DATA.settings },
      macros: Array.isArray(data.macros) ? data.macros : [],
      folderMacros: (data.folderMacros && typeof data.folderMacros === 'object') ? data.folderMacros : {},
    };
    fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save macro store:', e);
    return false;
  }
}

module.exports = {
  loadStore,
  saveStore,
};


