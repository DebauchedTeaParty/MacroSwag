// Renderer process script
let updateInterval = null;
let isPlaying = false;
let macros = [];
let settings = { theme: 'default', numPages: 1 };
let editMode = false;
let activeMacroId = null;
let currentPage = 0;
const SLOTS_PER_PAGE = 30;

// Helper function to check if a slot is truly available (not occupied and not covered by a multi-slot macro)
function isSlotAvailable(slotIndex) {
    if (slotIndex < 0) return false;
    
    // Check if slot is occupied
    if (macros[slotIndex]) return false;
    
    // Check if slot is covered by a previous multi-slot macro
    // Check immediate left (slotIndex-1) for size >= 2
    if (slotIndex > 0 && macros[slotIndex - 1] && (macros[slotIndex - 1].size || 1) >= 2) {
        return false;
    }
    // Check 2 slots left (slotIndex-2) for size >= 3
    if (slotIndex >= 2 && macros[slotIndex - 2] && (macros[slotIndex - 2].size || 1) >= 3) {
        return false;
    }
    
    return true;
}

// Helper function to find the first available slot
function findFirstAvailableSlot(startIndex = 0) {
    const numPages = settings.numPages || 1;
    const totalSlots = SLOTS_PER_PAGE * numPages;
    
    // Ensure macros array is large enough
    while (macros.length < totalSlots) {
        macros.push(undefined);
    }
    
    for (let i = startIndex; i < totalSlots; i++) {
        if (isSlotAvailable(i)) {
            return i;
        }
    }
    
    return -1; // No available slot found
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupContextMenu(); // Initialize context menu handlers
    loadMacrosAndSettings();
    startMediaUpdates();
    setupIconCropping();
    setupCropBoxInteraction();
    startWidgetUpdates();
});

function setupEventListeners() {
    // Window controls
    document.getElementById('close-btn').addEventListener('click', () => {
        window.electronAPI.closeApp();
    });

    document.getElementById('maximize-btn').addEventListener('click', () => {
        window.electronAPI.maximizeApp();
    });

    document.getElementById('minimize-btn').addEventListener('click', () => {
        window.electronAPI.minimizeApp();
    });

    // Media controls
    document.getElementById('play-pause-btn').addEventListener('click', async () => {
        try {
            await window.electronAPI.playPause();
            // Toggle play/pause icon
            isPlaying = !isPlaying;
            updatePlayPauseIcon();
        } catch (error) {
            console.error('Error toggling play/pause:', error);
        }
    });

    document.getElementById('next-btn').addEventListener('click', async () => {
        try {
            await window.electronAPI.nextTrack();
        } catch (error) {
            console.error('Error skipping next:', error);
        }
    });

    document.getElementById('prev-btn').addEventListener('click', async () => {
        try {
            await window.electronAPI.previousTrack();
        } catch (error) {
            console.error('Error skipping previous:', error);
        }
    });

    // Backend error handler
    window.electronAPI.onBackendError((event, error) => {
        updateStatus('Backend error: ' + error, false);
    });

    // Progress bar interaction
    const progressBar = document.getElementById('wavy-progress-bar');
    progressBar.addEventListener('click', handleProgressBarClick);
    progressBar.addEventListener('mousemove', handleProgressBarHover);

    // Sound playback handler
    window.electronAPI.onPlaySound((event, soundData) => {
        playSoundClip(soundData);
    });

    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
        openSettingsModal();
    });
    document.getElementById('settings-modal-close').addEventListener('click', closeSettingsModal);

    // Theme chips
    document.querySelectorAll('.theme-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const theme = chip.getAttribute('data-theme');
            applyTheme(theme);
            saveMacrosAndSettings();
        });
    });


    // Macro UI buttons
    document.getElementById('toggle-edit-mode').addEventListener('click', toggleEditMode);
    const addMacroBtn = document.getElementById('add-macro-btn');
    if (addMacroBtn) {
        addMacroBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Add Macro button clicked');
            openMacroModal();
        });
    } else {
        console.error('Add Macro button not found!');
    }

    // Library button
    const libraryBtn = document.getElementById('library-btn');
    if (libraryBtn) {
        libraryBtn.addEventListener('click', () => {
            openLibraryModal();
        });
    }

    // Library modal
    const libraryModalClose = document.getElementById('library-modal-close');
    if (libraryModalClose) {
        libraryModalClose.addEventListener('click', closeLibraryModal);
    }
    const libraryModalBackdrop = document.getElementById('library-modal-backdrop');
    if (libraryModalBackdrop) {
        libraryModalBackdrop.addEventListener('click', (e) => {
            if (e.target.id === 'library-modal-backdrop') {
                closeLibraryModal();
            }
        });
    }

    // RSS Config modal
    const rssConfigClose = document.getElementById('rss-config-modal-close');
    const rssConfigCancel = document.getElementById('rss-config-cancel-btn');
    const rssConfigAdd = document.getElementById('rss-config-add-btn');
    const rssConfigBackdrop = document.getElementById('rss-config-modal-backdrop');

    if (rssConfigClose) {
        rssConfigClose.addEventListener('click', closeRssConfigModal);
    }

    if (rssConfigCancel) {
        rssConfigCancel.addEventListener('click', closeRssConfigModal);
    }

    if (rssConfigAdd) {
        rssConfigAdd.addEventListener('click', saveRssConfig);
    }

    if (rssConfigBackdrop) {
        rssConfigBackdrop.addEventListener('click', (e) => {
            if (e.target.id === 'rss-config-modal-backdrop') {
                closeRssConfigModal();
            }
        });
    }

    // Crypto Config modal
    const cryptoConfigClose = document.getElementById('crypto-config-modal-close');
    const cryptoConfigCancel = document.getElementById('crypto-config-cancel-btn');
    const cryptoConfigAdd = document.getElementById('crypto-config-add-btn');
    const cryptoConfigBackdrop = document.getElementById('crypto-config-modal-backdrop');

    if (cryptoConfigClose) {
        cryptoConfigClose.addEventListener('click', closeCryptoConfigModal);
    }

    if (cryptoConfigCancel) {
        cryptoConfigCancel.addEventListener('click', closeCryptoConfigModal);
    }

    if (cryptoConfigAdd) {
        cryptoConfigAdd.addEventListener('click', saveCryptoConfig);
    }

    if (cryptoConfigBackdrop) {
        cryptoConfigBackdrop.addEventListener('click', (e) => {
            if (e.target.id === 'crypto-config-modal-backdrop') {
                closeCryptoConfigModal();
            }
        });
    }

    // Macro modal
    document.getElementById('macro-modal-close').addEventListener('click', closeMacroModal);
    document.getElementById('cancel-macro-btn').addEventListener('click', closeMacroModal);
    document.getElementById('save-macro-btn').addEventListener('click', saveMacroFromModal);
    document.getElementById('delete-macro-btn').addEventListener('click', deleteActiveMacro);

    // Close modal when clicking backdrop
    document.getElementById('macro-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'macro-modal-backdrop') {
            closeMacroModal();
        }
    });

    // Change macro type sections
    document.getElementById('macro-type').addEventListener('change', updateMacroTypeVisibility);

    // Browse button for application path
    const browseAppBtn = document.getElementById('browse-app-btn');
    if (browseAppBtn) {
        browseAppBtn.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.showOpenDialog({
                    properties: ['openFile'],
                    filters: [
                        { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'msi'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    title: 'Select Application'
                });

                if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                    const appPathInput = document.getElementById('macro-app-path');
                    if (appPathInput) {
                        appPathInput.value = result.filePaths[0];
                    }
                }
            } catch (error) {
                console.error('Error opening file dialog:', error);
            }
        });
    }

    // Keyboard shortcut recording
    setupKeyboardRecorder();

    // Pagination controls
    const pagePrevBtn = document.getElementById('page-prev-btn');
    const pageNextBtn = document.getElementById('page-next-btn');
    if (pagePrevBtn) {
        pagePrevBtn.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                renderDeckGrid();
            }
        });
    }
    if (pageNextBtn) {
        pageNextBtn.addEventListener('click', () => {
            const numPages = settings.numPages || 1;
            if (currentPage < numPages - 1) {
                currentPage++;
                renderDeckGrid();
            }
        });
    }

    // Number of pages input
    const numPagesInput = document.getElementById('num-pages-input');
    if (numPagesInput) {
        numPagesInput.addEventListener('change', (e) => {
            const newNumPages = parseInt(e.target.value) || 1;
            if (newNumPages >= 1 && newNumPages <= 10) {
                const oldNumPages = settings.numPages || 1;
                settings.numPages = newNumPages;
                
                // If reducing pages, make sure current page is valid
                if (currentPage >= newNumPages) {
                    currentPage = Math.max(0, newNumPages - 1);
                }
                
                // Expand or contract macros array as needed
                const totalSlots = SLOTS_PER_PAGE * newNumPages;
                const oldTotalSlots = SLOTS_PER_PAGE * oldNumPages;
                
                if (newNumPages > oldNumPages) {
                    // Expanding - add empty slots
                    while (macros.length < totalSlots) {
                        macros.push(undefined);
                    }
                } else if (newNumPages < oldNumPages) {
                    // Contracting - trim excess slots (but warn if there are macros)
                    const hasMacrosInRemovedPages = macros.slice(totalSlots, oldTotalSlots).some(m => m);
                    if (hasMacrosInRemovedPages) {
                        if (!confirm(`Reducing pages will remove macros on pages ${newNumPages + 1}-${oldNumPages}. Continue?`)) {
                            e.target.value = oldNumPages;
                            settings.numPages = oldNumPages;
                            return;
                        }
                    }
                    macros = macros.slice(0, totalSlots);
                }
                
                saveMacrosAndSettings();
                renderDeckGrid();
            }
        });
    }
}

// --- Macros + settings ---
async function loadMacrosAndSettings() {
    try {
        const data = await window.electronAPI.getMacrosAndSettings();
        console.log('Loaded data:', { 
            settings: data.settings, 
            macrosLength: data.macros?.length,
            macrosSample: data.macros?.slice(0, 5)
        });
        
        settings = data.settings || { theme: 'default', numPages: 1 };
        const loadedMacros = Array.isArray(data.macros) ? data.macros : [];

        console.log('Loaded macros array length:', loadedMacros.length);
        console.log('Loaded macros (first 10):', loadedMacros.slice(0, 10));

        // Load ALL macros from saved data first (preserve everything)
        // Convert to slot-based array (preserve positions)
        // JSON null values become undefined for empty slots
        macros = [];
        
        // Count how many actual macros we have
        let macroCount = 0;
        let highestIndex = -1;
        
        // Load all macros, finding the highest index with a macro
        for (let i = 0; i < loadedMacros.length; i++) {
            const macro = (loadedMacros[i] !== null && loadedMacros[i] !== undefined) ? loadedMacros[i] : undefined;
            macros[i] = macro;
            if (macro) {
                macroCount++;
                highestIndex = i;
            }
        }

        console.log(`Loaded ${macroCount} macros into slots 0-${highestIndex} (array length: ${macros.length})`);
        
        // If we found macros, ensure the array is at least as long as the highest index
        if (highestIndex >= 0 && macros.length <= highestIndex) {
            console.warn(`Array length (${macros.length}) is less than highest macro index (${highestIndex}), expanding...`);
            while (macros.length <= highestIndex) {
                macros.push(undefined);
            }
        }

        // Calculate total slots based on number of pages
        const numPages = settings.numPages || 1;
        const totalSlots = SLOTS_PER_PAGE * numPages;

        // Ensure we have at least enough slots for the configured number of pages
        // But don't truncate if we have more macros than that (preserve existing data)
        while (macros.length < totalSlots) {
            macros.push(undefined);
        }
        
        // If we have more macros than the current numPages allows, auto-expand numPages
        const actualSlotsNeeded = Math.ceil(macros.length / SLOTS_PER_PAGE);
        if (actualSlotsNeeded > numPages) {
            console.log(`Auto-expanding pages from ${numPages} to ${actualSlotsNeeded} to preserve existing macros`);
            settings.numPages = actualSlotsNeeded;
        }

        // Ensure current page is valid
        const finalNumPages = settings.numPages || 1;
        if (currentPage >= finalNumPages || currentPage < 0) {
            currentPage = Math.max(0, finalNumPages - 1);
            console.log(`Adjusted current page to ${currentPage} (valid range: 0-${finalNumPages - 1})`);
        }

        console.log(`Final state: ${macros.length} total slots, ${finalNumPages} pages, current page: ${currentPage}`);
        console.log(`Macros in current page range (${currentPage * SLOTS_PER_PAGE}-${(currentPage + 1) * SLOTS_PER_PAGE - 1}):`, 
            macros.slice(currentPage * SLOTS_PER_PAGE, (currentPage + 1) * SLOTS_PER_PAGE).filter(m => m).map(m => ({ id: m.id, label: m.label })));

        // Update settings modal with current numPages value (use settings.numPages in case it was auto-expanded)
        const numPagesInput = document.getElementById('num-pages-input');
        if (numPagesInput) {
            numPagesInput.value = settings.numPages || 1;
        }

        applyTheme(settings.theme || 'default', false);
        renderDeckGrid();
        activateThemeChips();
    } catch (error) {
        console.error('Error loading macros/settings:', error);
    }
}

function saveMacrosAndSettings() {
    // Save ALL macros (preserve everything, not just current numPages)
    // Convert to slot-based array before saving
    // Pad with null (JSON-compatible) to preserve slot positions
    const slotBasedMacros = [];
    
    // Find the highest index with a macro to determine how many slots to save
    let maxIndex = -1;
    for (let i = 0; i < macros.length; i++) {
        if (macros[i] !== undefined && macros[i] !== null) {
            maxIndex = i;
        }
    }
    
    // Save all slots up to the highest macro, plus ensure we have at least numPages worth
    const numPages = settings.numPages || 1;
    const minSlots = SLOTS_PER_PAGE * numPages;
    const slotsToSave = Math.max(maxIndex + 1, minSlots);
    
    for (let i = 0; i < slotsToSave; i++) {
        slotBasedMacros[i] = (macros[i] !== undefined && macros[i] !== null) ? macros[i] : null;
    }

    window.electronAPI.saveMacrosAndSettings({
        settings,
        macros: slotBasedMacros,
    }).catch((e) => console.error('Error saving macros/settings:', e));
}

function applyTheme(theme, persist = true) {
    const container = document.querySelector('.app-container');
    container.classList.remove('theme-default', 'theme-ocean', 'theme-sunset', 'theme-neon', 'theme-dark');
    container.classList.add(`theme-${theme}`);
    settings.theme = theme;
    activateThemeChips();
    if (persist) {
        saveMacrosAndSettings();
    }
}

function activateThemeChips() {
    const current = settings.theme || 'default';
    document.querySelectorAll('.theme-chip').forEach((chip) => {
        const theme = chip.getAttribute('data-theme');
        chip.classList.toggle('active', theme === current);
    });
}

function openSettingsModal() {
    // Update num pages input with current value
    const numPagesInput = document.getElementById('num-pages-input');
    if (numPagesInput) {
        numPagesInput.value = settings.numPages || 1;
    }
    document.getElementById('settings-modal-backdrop').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settings-modal-backdrop').style.display = 'none';
}

function toggleEditMode() {
    editMode = !editMode;
    const btn = document.getElementById('toggle-edit-mode');
    btn.classList.toggle('primary', editMode);
    btn.textContent = editMode ? 'Edit Mode: On' : 'Edit Mode';
    renderDeckGrid();
}

function renderDeckGrid() {
    // Clear any existing widget update intervals before rendering
    if (widgetUpdateInterval) {
        clearInterval(widgetUpdateInterval);
        widgetUpdateInterval = null;
    }
    const grid = document.getElementById('deck-grid');
    if (!grid) {
        console.error('deck-grid element not found!');
        return;
    }
    grid.innerHTML = '';

    const numPages = settings.numPages || 1;
    const startIndex = currentPage * SLOTS_PER_PAGE;
    const endIndex = startIndex + SLOTS_PER_PAGE;

    console.log(`Rendering page ${currentPage + 1}/${numPages}, slots ${startIndex}-${endIndex - 1}`);
    console.log(`Macros array length: ${macros.length}, macros in range:`, macros.slice(startIndex, endIndex).filter(m => m).length);

    // Update pagination controls
    updatePaginationControls();

    for (let i = startIndex; i < endIndex; i++) {
        // Calculate relative index for this page (0-29)
        const pageRelativeIndex = i - startIndex;
        
        // Skip rendering if this slot is covered by a previous large macro
        // Only check within the current page to avoid cross-page issues
        if (pageRelativeIndex > 0) {
            // Check previous slots to see if any extend into this one
            let covered = false;
            // Check immediate left (i-1) for size >= 2
            if (i > 0 && macros[i - 1] && (macros[i - 1].size || 1) >= 2) covered = true;
            // Check 2 slots left (i-2) for size >= 3
            if (i >= 2 && macros[i - 2] && (macros[i - 2].size || 1) >= 3) covered = true;

            if (covered) continue;
        }

        const macro = macros[i];
        const key = document.createElement('div');
        key.classList.add('deck-key');

        // Apply size class if macro exists, capping it to available columns
        if (macro && macro.size > 1) {
            const colIndex = pageRelativeIndex % 5; // 0-4
            const availableCols = 5 - colIndex;
            const effectiveSize = Math.min(macro.size, availableCols);

            if (effectiveSize > 1) {
                key.classList.add(`span-${effectiveSize}`);
            }
        }

        if (macro) {
            if (editMode) key.classList.add('edit-mode');

            // Render widgets differently
            if (macro.type === 'library') {
                key.classList.add('deck-widget');
                key.dataset.widgetType = macro.config?.widgetType || 'cpu';
                key.dataset.macroId = macro.id;

                const widgetContent = document.createElement('div');
                widgetContent.classList.add('widget-content');

                const widgetIcon = document.createElement('div');
                widgetIcon.classList.add('widget-icon');
                widgetIcon.textContent = getWidgetIcon(macro.config?.widgetType || 'cpu');

                const widgetLabel = document.createElement('div');
                widgetLabel.classList.add('widget-label');
                widgetLabel.textContent = macro.label || getWidgetLabel(macro.config?.widgetType || 'cpu');

                const widgetValue = document.createElement('div');
                widgetValue.classList.add('widget-value');
                widgetValue.id = `widget-value-${macro.id}`;
                widgetValue.textContent = '...';

                // Special handling for RSS feed - add URL display and background image
                if (macro.config?.widgetType === 'rss') {
                    const widgetUrl = document.createElement('div');
                    widgetUrl.classList.add('widget-url');
                    widgetUrl.id = `widget-url-${macro.id}`;
                    widgetUrl.textContent = '';
                    widgetContent.appendChild(widgetUrl);

                    // Set background image if available
                    if (macro.rssCurrentImage) {
                        key.style.backgroundImage = `url(${macro.rssCurrentImage})`;
                        key.style.backgroundSize = 'cover';
                        key.style.backgroundPosition = 'center';
                        key.style.backgroundRepeat = 'no-repeat';
                    }
                }

                // Special handling for Pomodoro timer - add buttons and phase display
                if (macro.config?.widgetType === 'pomodoro') {
                    // Initialize pomodoro state if not exists
                    if (!macro.pomodoroState) {
                        macro.pomodoroState = {
                            timeRemaining: 25 * 60, // 25 minutes in seconds
                            phase: 'work', // 'work', 'shortBreak', 'longBreak'
                            isRunning: false,
                            pomodoroCount: 0,
                            startTime: null,
                            pausedTime: 25 * 60
                        };
                    }

                    // Get effective size for responsive styling
                    const effectiveSize = Math.min(macro.size || 1, 3);
                    const isSingleBlock = effectiveSize === 1;

                    // Adjust widget value font size based on block size (reduced for height)
                    widgetValue.style.fontSize = isSingleBlock ? '16px' : effectiveSize === 2 ? '20px' : '24px';
                    widgetValue.style.fontWeight = '700';
                    widgetValue.style.lineHeight = '1.1';
                    widgetValue.style.marginBottom = '0';
                    widgetValue.style.marginTop = '0';

                    // Make label smaller for pomodoro
                    widgetLabel.style.fontSize = isSingleBlock ? '8px' : '9px';
                    widgetLabel.style.marginBottom = '0';
                    widgetLabel.style.marginTop = '0';

                    // Make icon smaller for pomodoro
                    widgetIcon.style.fontSize = isSingleBlock ? '18px' : '20px';
                    widgetIcon.style.marginBottom = '0';
                    widgetIcon.style.marginTop = '0';

                    // Reduce widget-content gap for pomodoro
                    widgetContent.style.gap = isSingleBlock ? '1px' : '2px';

                    const phaseDisplay = document.createElement('div');
                    phaseDisplay.classList.add('pomodoro-phase');
                    phaseDisplay.id = `pomodoro-phase-${macro.id}`;
                    phaseDisplay.style.fontSize = isSingleBlock ? '8px' : '9px';
                    phaseDisplay.style.color = 'var(--text-secondary)';
                    phaseDisplay.style.marginTop = '0';
                    phaseDisplay.style.marginBottom = '0';
                    phaseDisplay.style.textAlign = 'center';
                    phaseDisplay.style.whiteSpace = 'nowrap';
                    phaseDisplay.style.overflow = 'hidden';
                    phaseDisplay.style.textOverflow = 'ellipsis';
                    phaseDisplay.style.width = '100%';
                    phaseDisplay.style.lineHeight = '1.1';

                    const pomodoroControls = document.createElement('div');
                    pomodoroControls.classList.add('pomodoro-controls');
                    pomodoroControls.style.display = 'flex';
                    pomodoroControls.style.gap = isSingleBlock ? '4px' : '6px';
                    pomodoroControls.style.marginTop = isSingleBlock ? '2px' : '3px';
                    pomodoroControls.style.marginBottom = '0';
                    pomodoroControls.style.justifyContent = 'center';
                    pomodoroControls.style.flexWrap = 'wrap';
                    pomodoroControls.style.width = '100%';

                    const startPauseBtn = document.createElement('button');
                    startPauseBtn.classList.add('pomodoro-btn');
                    startPauseBtn.id = `pomodoro-start-pause-${macro.id}`;
                    startPauseBtn.textContent = macro.pomodoroState.isRunning ? 'Pause' : 'Start';
                    startPauseBtn.style.padding = isSingleBlock ? '3px 8px' : '4px 10px';
                    startPauseBtn.style.fontSize = isSingleBlock ? '9px' : '10px';
                    startPauseBtn.style.border = '1px solid var(--border-color)';
                    startPauseBtn.style.borderRadius = '4px';
                    startPauseBtn.style.background = 'var(--bg-secondary)';
                    startPauseBtn.style.color = 'var(--text-primary)';
                    startPauseBtn.style.cursor = 'pointer';
                    startPauseBtn.style.whiteSpace = 'nowrap';
                    startPauseBtn.style.flex = isSingleBlock ? '1' : '0 1 auto';
                    startPauseBtn.style.minWidth = '0';

                    const resetBtn = document.createElement('button');
                    resetBtn.classList.add('pomodoro-btn');
                    resetBtn.id = `pomodoro-reset-${macro.id}`;
                    resetBtn.textContent = 'Reset';
                    resetBtn.style.padding = isSingleBlock ? '3px 8px' : '4px 10px';
                    resetBtn.style.fontSize = isSingleBlock ? '9px' : '10px';
                    resetBtn.style.border = '1px solid var(--border-color)';
                    resetBtn.style.borderRadius = '4px';
                    resetBtn.style.background = 'var(--bg-secondary)';
                    resetBtn.style.color = 'var(--text-primary)';
                    resetBtn.style.cursor = 'pointer';
                    resetBtn.style.whiteSpace = 'nowrap';
                    resetBtn.style.flex = isSingleBlock ? '1' : '0 1 auto';
                    resetBtn.style.minWidth = '0';

                    pomodoroControls.appendChild(startPauseBtn);
                    pomodoroControls.appendChild(resetBtn);

                    // Store references for later appending in correct order
                    widgetContent._pomodoroPhase = phaseDisplay;
                    widgetContent._pomodoroControls = pomodoroControls;

                    // Add click handlers
                    startPauseBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        togglePomodoro(macro);
                    });

                    resetBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        resetPomodoro(macro);
                    });
                }

                // Append elements in correct order: icon, label, value first
                widgetContent.appendChild(widgetIcon);
                widgetContent.appendChild(widgetLabel);
                widgetContent.appendChild(widgetValue);
                
                // Then append pomodoro-specific elements if this is a pomodoro widget
                if (macro.config?.widgetType === 'pomodoro' && widgetContent._pomodoroPhase && widgetContent._pomodoroControls) {
                    widgetContent.appendChild(widgetContent._pomodoroPhase);
                    widgetContent.appendChild(widgetContent._pomodoroControls);
                    delete widgetContent._pomodoroPhase;
                    delete widgetContent._pomodoroControls;
                }
                key.appendChild(widgetContent);
            } else {
                // Regular macro rendering
                const icon = document.createElement('div');
                icon.classList.add('deck-key-icon');
                if (macro.iconData) {
                    const img = document.createElement('img');
                    img.src = macro.iconData;
                    icon.appendChild(img);
                } else {
                    icon.innerHTML = '<span>★</span>';
                }

                const label = document.createElement('div');
                label.classList.add('deck-key-label');
                label.textContent = macro.label || 'Macro';

                const type = document.createElement('div');
                type.classList.add('deck-key-type');
                type.textContent = macro.type || 'macro';

                key.appendChild(icon);
                key.appendChild(label);
                key.appendChild(type);
            }

            // Drag and drop for reordering in edit mode
            if (editMode) {
                key.draggable = true;
                key.dataset.macroIndex = i; // Use absolute index, not page-relative

                key.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', i.toString());
                    key.classList.add('dragging');
                });

                key.addEventListener('dragend', (e) => {
                    key.classList.remove('dragging');
                    // Remove drag-over class from all keys
                    document.querySelectorAll('.deck-key').forEach(k => {
                        k.classList.remove('drag-over');
                    });
                });

                key.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // If dragging from the library, show copy cursor, otherwise move
                    if (e.dataTransfer.types.includes('application/json')) {
                        e.dataTransfer.dropEffect = 'copy';
                    } else {
                        e.dataTransfer.dropEffect = 'move';
                    }
                    key.classList.add('drag-over');
                    return false;
                });

                key.addEventListener('dragleave', (e) => {
                    key.classList.remove('drag-over');
                });

                key.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    key.classList.remove('drag-over');

                    // Check for existing macro move first (text/plain data takes priority)
                    const sourceIndexStr = e.dataTransfer.getData('text/plain');
                    if (sourceIndexStr) {
                        // This is an existing macro being moved - handle the swap
                        const sourceIndex = parseInt(sourceIndexStr);
                        const targetIndex = i;

                        console.log('Drop event:', { sourceIndex, targetIndex, macrosLength: macros.length });

                        if (isNaN(sourceIndex) || isNaN(targetIndex)) {
                            console.error('Invalid indices:', { sourceIndex, targetIndex });
                            return false;
                        }

                        if (sourceIndex === targetIndex) {
                            console.log('Same index, no move needed');
                            return false;
                        }

                        if (sourceIndex < 0 || sourceIndex >= macros.length) {
                            console.error('Source index out of bounds:', sourceIndex);
                            return false;
                        }

                        // Get the macro to move
                        const macroToMove = macros[sourceIndex];
                        if (!macroToMove) {
                            console.error('No macro at source index:', sourceIndex);
                            return false;
                        }

                        // Ensure macros array has enough slots (pad with undefined if needed)
                        const numPages = settings.numPages || 1;
                        const totalSlots = SLOTS_PER_PAGE * numPages;
                        while (macros.length < totalSlots) {
                            macros.push(undefined);
                        }

                        // If target slot is occupied, move the existing widget to the next available slot
                        const existingAtTarget = macros[targetIndex];
                        if (existingAtTarget) {
                            // Find next available slot for the existing widget (starting after target)
                            const nextAvailableSlot = findFirstAvailableSlot(targetIndex + 1);
                            if (nextAvailableSlot !== -1) {
                                macros[nextAvailableSlot] = existingAtTarget;
                                console.log(`Moved existing widget from slot ${targetIndex} to slot ${nextAvailableSlot}`);
                            } else {
                                // No available slot found, do a swap instead
                                macros[sourceIndex] = existingAtTarget;
                                console.log('No available slot found, swapping instead');
                            }
                        }
                        
                        // Always clear the source slot and place the dragged macro at the target
                        macros[sourceIndex] = undefined;
                        macros[targetIndex] = macroToMove;

                        console.log('Macros after reorder:', macros.map((m, idx) => ({ idx, id: m?.id, label: m?.label })));

                        // Save and re-render
                        saveMacrosAndSettings();
                        renderDeckGrid();

                        return false;
                    }

                    // Only check for library widget if no existing macro is being moved
                    const libraryData = e.dataTransfer.getData('application/json');
                    if (libraryData) {
                        try {
                            const data = JSON.parse(libraryData);
                            if (data.type === 'library' && data.widgetType) {
                                // If target slot is occupied, move the existing widget to the next available slot
                                const existingAtTarget = macros[i];
                                if (existingAtTarget) {
                                    const nextAvailableSlot = findFirstAvailableSlot(i + 1);
                                    if (nextAvailableSlot !== -1) {
                                        macros[nextAvailableSlot] = existingAtTarget;
                                        console.log(`Moved existing widget from slot ${i} to slot ${nextAvailableSlot}`);
                                    } else {
                                        alert('Deck is full! Cannot move existing widget. Remove a macro first or add more pages in settings.');
                                        return false;
                                    }
                                }
                                
                                // Add the new library widget to the target slot
                                const id = 'macro-' + Date.now();
                                macros[i] = {
                                    id,
                                    label: getWidgetLabel(data.widgetType),
                                    type: 'library',
                                    config: {
                                        widgetType: data.widgetType
                                    },
                                    iconData: null
                                };
                                saveMacrosAndSettings();
                                renderDeckGrid();
                                return false;
                            }
                        } catch (err) {
                            console.error('Error parsing library drag data (occupied slot):', err);
                        }
                    }

                    return false;

                    const sourceIndex = parseInt(sourceIndexStr);
                    const targetIndex = i;

                    console.log('Drop event:', { sourceIndex, targetIndex, macrosLength: macros.length });

                    if (isNaN(sourceIndex) || isNaN(targetIndex)) {
                        console.error('Invalid indices:', { sourceIndex, targetIndex });
                        return false;
                    }

                    if (sourceIndex === targetIndex) {
                        console.log('Same index, no move needed');
                        return false;
                    }

                    if (sourceIndex < 0 || sourceIndex >= macros.length) {
                        console.error('Source index out of bounds:', sourceIndex);
                        return false;
                    }

                    // Get the macro to move
                    const macroToMove = macros[sourceIndex];
                    if (!macroToMove) {
                        console.error('No macro at source index:', sourceIndex);
                        return false;
                    }

                    // Ensure macros array has enough slots (pad with undefined if needed)
                    const numPages = settings.numPages || 1;
                    const totalSlots = SLOTS_PER_PAGE * numPages;
                    while (macros.length < totalSlots) {
                        macros.push(undefined);
                    }

                    // Swap: exchange macros between source and target slots
                    const existingAtTarget = macros[targetIndex];
                    macros[sourceIndex] = existingAtTarget; // Put target's macro (or undefined) at source
                    macros[targetIndex] = macroToMove; // Put source macro at target

                    console.log('Macros after reorder:', macros.map((m, idx) => ({ idx, id: m?.id, label: m?.label })));

                    // Save and re-render
                    saveMacrosAndSettings();
                    renderDeckGrid();

                    return false;
                });
            }

            key.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't open modal if context menu is showing
                const contextMenu = document.getElementById('context-menu');
                if (contextMenu && contextMenu.style.display === 'block') {
                    return;
                }
                if (editMode) {
                    console.log('Opening macro modal from click, macro:', macro);
                    editMacro(macro);
                } else {
                    // Widgets don't execute, they just display
                    if (macro.type !== 'library') {
                        executeMacro(macro);
                    } else if (macro.config && macro.config.widgetType === 'rss') {
                        console.log('RSS widget clicked, checking for link...');
                        if (macro.rssItems && macro.rssItems[macro.rssCurrentIndex]) {
                            const link = macro.rssItems[macro.rssCurrentIndex].link;
                            console.log('Opening RSS link:', link);
                            if (link) {
                                window.electronAPI.openExternal(link);
                            }
                        }
                    }
                }
            });

            // Right-click context menu
            key.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showMacroContextMenu(e, macro);
            });
        } else {
            key.classList.add('empty');
            const span = document.createElement('span');
            span.textContent = editMode ? 'Add macro' : '';
            key.appendChild(span);

            // Drag and drop for empty slots (always allow library widgets, edit mode for macros)
            key.addEventListener('dragover', (e) => {
                // Always allow library widgets to be dropped
                if (e.dataTransfer.types.includes('application/json')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    key.classList.add('drag-over');
                    return false;
                }
                // Only allow macro reordering in edit mode
                if (editMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    key.classList.add('drag-over');
                    return false;
                }
            });

            key.addEventListener('dragleave', (e) => {
                key.classList.remove('drag-over');
            });

            key.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                key.classList.remove('drag-over');

                // Check for existing macro move first (text/plain data takes priority)
                const sourceIndexStr = e.dataTransfer.getData('text/plain');
                if (sourceIndexStr) {
                    // Regular macro move to empty slot (only in edit mode)
                    if (!editMode) return false;

                    const sourceIndex = parseInt(sourceIndexStr);
                    const targetIndex = i;

                    console.log('Drop to empty slot:', { sourceIndex, targetIndex, macrosLength: macros.length });

                    if (isNaN(sourceIndex) || isNaN(targetIndex)) {
                        console.error('Invalid indices:', { sourceIndex, targetIndex });
                        return false;
                    }

                    const numPages = settings.numPages || 1;
                    const totalSlots = SLOTS_PER_PAGE * numPages;
                    if (sourceIndex < 0 || sourceIndex >= totalSlots || targetIndex < 0 || targetIndex >= totalSlots) {
                        console.error('Index out of bounds:', { sourceIndex, targetIndex, totalSlots });
                        return false;
                    }

                    // Get the macro to move
                    const macroToMove = macros[sourceIndex];
                    if (!macroToMove) {
                        console.error('No macro at source index:', sourceIndex);
                        return false;
                    }

                    // Ensure macros array has enough slots (pad with undefined if needed)
                    // numPages and totalSlots already declared above
                    while (macros.length < totalSlots) {
                        macros.push(undefined);
                    }

                    // Direct slot assignment: move macro from source to target
                    macros[sourceIndex] = undefined; // Clear source slot
                    macros[targetIndex] = macroToMove; // Set target slot

                    console.log('Macros after move to empty:', macros.map((m, idx) => ({ idx, id: m?.id, label: m?.label })));

                    // Save and re-render
                    saveMacrosAndSettings();
                    renderDeckGrid();

                    return false;
                }

                // Only check for library widget if no existing macro is being moved
                const libraryData = e.dataTransfer.getData('application/json');
                if (libraryData) {
                    try {
                        const data = JSON.parse(libraryData);
                        if (data.type === 'library' && data.widgetType) {
                            // For RSS and Crypto, open config modal instead of adding directly
                            if (data.widgetType === 'rss') {
                                openRssConfigModal();
                                return false;
                            } else if (data.widgetType === 'crypto') {
                                openCryptoConfigModal();
                                return false;
                            }
                            
                            // Add widget to this empty slot for other widget types
                            const id = 'macro-' + Date.now();
                            macros[i] = {
                                id,
                                label: getWidgetLabel(data.widgetType),
                                type: 'library',
                                config: {
                                    widgetType: data.widgetType
                                },
                                iconData: null
                            };
                            saveMacrosAndSettings();
                            renderDeckGrid();
                            return false;
                        }
                    } catch (err) {
                        console.error('Error parsing library drag data:', err);
                    }
                }

                return false;

                const sourceIndex = parseInt(sourceIndexStr);
                const targetIndex = i;

                console.log('Drop to empty slot:', { sourceIndex, targetIndex, macrosLength: macros.length });

                if (isNaN(sourceIndex) || isNaN(targetIndex)) {
                    console.error('Invalid indices:', { sourceIndex, targetIndex });
                    return false;
                }

                const numPages = settings.numPages || 1;
                const totalSlots = SLOTS_PER_PAGE * numPages;
                if (sourceIndex < 0 || sourceIndex >= totalSlots || targetIndex < 0 || targetIndex >= totalSlots) {
                    console.error('Index out of bounds:', { sourceIndex, targetIndex, totalSlots });
                    return false;
                }

                // Get the macro to move
                const macroToMove = macros[sourceIndex];
                if (!macroToMove) {
                    console.error('No macro at source index:', sourceIndex);
                    return false;
                }

                // Ensure macros array has enough slots (pad with undefined if needed)
                // numPages and totalSlots already declared above
                while (macros.length < totalSlots) {
                    macros.push(undefined);
                }

                // Direct slot assignment: move macro from source to target
                macros[sourceIndex] = undefined; // Clear source slot
                macros[targetIndex] = macroToMove; // Set target slot

                console.log('Macros after move to empty:', macros.map((m, idx) => ({ idx, id: m?.id, label: m?.label })));

                // Save and re-render
                saveMacrosAndSettings();
                renderDeckGrid();

                return false;
            });

            // Left-click to add macro in edit mode
            key.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't open modal if context menu is showing
                const contextMenu = document.getElementById('context-menu');
                if (contextMenu && contextMenu.style.display === 'block') {
                    return;
                }
                if (editMode) {
                    console.log('Opening new macro modal from empty slot click');
                    openMacroModal();
                }
            });

            // Right-click context menu for empty slots
            key.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (editMode) {
                    showMacroContextMenu(e, null); // null means "add new"
                }
            });
        }

        grid.appendChild(key);
    }

    // Restart widget updates after rendering
    setTimeout(() => {
        if (widgetUpdateInterval) {
            clearInterval(widgetUpdateInterval);
            widgetUpdateInterval = null;
        }
        startWidgetUpdates();
    }, 100);
}

function updatePaginationControls() {
    const numPages = settings.numPages || 1;
    const prevBtn = document.getElementById('page-prev-btn');
    const nextBtn = document.getElementById('page-next-btn');
    const indicator = document.getElementById('page-indicator');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 0 || numPages <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= numPages - 1 || numPages <= 1;
    }
    if (indicator) {
        indicator.textContent = numPages > 0 ? `Page ${currentPage + 1} of ${numPages}` : 'Page 1 of 1';
    }
}

function openMacroModal(macro) {
    console.log('openMacroModal called with:', macro);
    activeMacroId = macro ? macro.id : null;

    const backdrop = document.getElementById('macro-modal-backdrop');
    if (!backdrop) {
        console.error('Macro modal backdrop not found!');
        return;
    }

    const titleEl = document.getElementById('macro-modal-title');
    if (titleEl) {
        titleEl.textContent = macro ? 'Edit Macro' : 'New Macro';
    } else {
        console.error('Macro modal title element not found!');
        return;
    }

    // Reset fields safely (guard against missing elements)
    const labelInput = document.getElementById('macro-label');
    const typeSelect = document.getElementById('macro-type');
    const sizeSelect = document.getElementById('macro-size');
    const keysInput = document.getElementById('macro-keys');
    const urlInput = document.getElementById('macro-url');
    const appPathInput = document.getElementById('macro-app-path');
    const appArgsInput = document.getElementById('macro-app-args');
    const cryptoApiKeyInput = document.getElementById('macro-crypto-api-key');
    const cryptoSymbolInput = document.getElementById('macro-crypto-symbol');
    const iconInput = document.getElementById('macro-icon');

    if (!labelInput || !typeSelect || !keysInput || !urlInput || !appPathInput || !appArgsInput || !cryptoApiKeyInput || !cryptoSymbolInput || !iconInput) {
        console.error('One or more macro modal form elements are missing');
        return;
    }

    labelInput.value = macro?.label || '';
    const type = macro?.type || 'keyboard';

    // Create temporary option for library if needed to ensure value can be set
    if (type === 'library' && !typeSelect.querySelector('option[value="library"]')) {
        const opt = document.createElement('option');
        opt.value = 'library';
        opt.text = 'Library Widget';
        opt.disabled = true;
        opt.hidden = true;
        typeSelect.appendChild(opt);
    }

    typeSelect.value = type;

    // Disable type selector for library widgets
    typeSelect.disabled = (type === 'library');
    const size = macro?.size || 1;
    if (sizeSelect) sizeSelect.value = size;
    const keysValue = macro?.config?.keys || '';
    keysInput.value = keysValue;

    // Show recorded display if there's a value
    const recordedDisplay = document.getElementById('recorded-shortcut-display');
    const recordedText = document.getElementById('recorded-keys-text');
    if (recordedDisplay && recordedText) {
        if (keysValue) {
            recordedText.textContent = formatSendKeysToDisplay(keysValue);
            recordedDisplay.style.display = 'block';
        } else {
            recordedDisplay.style.display = 'none';
        }
    }
    urlInput.value = macro?.config?.url || '';
    appPathInput.value = macro?.config?.path || '';
    appArgsInput.value = macro?.config?.args || '';

    // Crypto config
    cryptoApiKeyInput.value = macro?.config?.apiKey || '';
    cryptoSymbolInput.value = macro?.config?.symbol || '';

    iconInput.value = '';

    // Reset icon preview
    currentCropImage = null;
    const iconPreviewContainer = document.getElementById('icon-preview-container');
    const iconPreview = document.getElementById('icon-preview');
    if (macro?.iconData) {
        iconPreview.src = macro.iconData;
        iconPreviewContainer.style.display = 'block';
        currentCropImage = macro.iconData;
    } else {
        iconPreviewContainer.style.display = 'none';
    }

    updateMacroTypeVisibility();

    // Hide type and icon fields for library widgets (they should only show Label and Size)
    const typeRow = typeSelect.closest('.form-row');
    const iconRow = iconInput.closest('.form-row');
    const libraryConfigRow = document.getElementById('macro-config-library');
    
    if (type === 'library') {
        // Hide type field for library widgets
        if (typeRow) typeRow.style.display = 'none';
        // Hide icon field for library widgets
        if (iconRow) iconRow.style.display = 'none';
        // Hide library widget type selector (they're already configured)
        if (libraryConfigRow) libraryConfigRow.style.display = 'none';
    } else {
        // Show type and icon fields for regular macros
        if (typeRow) typeRow.style.display = '';
        if (iconRow) iconRow.style.display = '';
    }

    // Delete button visibility
    const deleteBtn = document.getElementById('delete-macro-btn');
    if (deleteBtn) {
        deleteBtn.style.display = macro ? 'inline-flex' : 'none';
    }

    // Show the modal backdrop - force visibility
    // Remove inline style that might be blocking
    backdrop.removeAttribute('style');
    backdrop.style.display = 'flex';
    backdrop.style.visibility = 'visible';
    backdrop.style.opacity = '1';
    backdrop.style.zIndex = '10000';
    console.log('Modal backdrop displayed, z-index:', window.getComputedStyle(backdrop).zIndex);
    console.log('Backdrop computed display:', window.getComputedStyle(backdrop).display);

    // Force a reflow to ensure the display change takes effect
    void backdrop.offsetHeight;

    // Double-check it's visible
    setTimeout(() => {
        const isVisible = window.getComputedStyle(backdrop).display !== 'none';
        console.log('Modal visibility check:', isVisible);
        if (!isVisible) {
            console.error('Modal still not visible! Forcing display again...');
            backdrop.style.display = 'flex !important';
        }
    }, 10);
}

function closeMacroModal() {
    document.getElementById('macro-modal-backdrop').style.display = 'none';
    const typeSelect = document.getElementById('macro-type');
    if (typeSelect) typeSelect.disabled = false;
    activeMacroId = null;
    currentCropImage = null;
}

function updateMacroTypeVisibility() {
    const typeSelect = document.getElementById('macro-type');
    if (!typeSelect) {
        console.error('macro-type select not found');
        return;
    }

    const type = typeSelect.value;

    const keyboardRow = document.getElementById('macro-config-keyboard');
    const websiteRow = document.getElementById('macro-config-website');
    const appRow = document.getElementById('macro-config-app');
    const libraryRow = document.getElementById('macro-config-library');
    const cryptoRow = document.getElementById('macro-config-crypto');

    if (keyboardRow) keyboardRow.style.display = type === 'keyboard' ? '' : 'none';
    if (websiteRow) websiteRow.style.display = type === 'website' ? '' : 'none';
    if (appRow) appRow.style.display = type === 'app' ? '' : 'none';

    // Library widget specific configs
    if (type === 'library') {
        const widgetType = document.getElementById('macro-widget-type').value; // This might be hidden if we are editing? 
        // Actually for library widgets we largely hide the type selector in the main modal
        // But if we are editing a library widget, we might show specific configs based on widget type

        // However, the current modal structure separates library widget *selection* (Library Modal) from *configuration* (Edit Modal)
        // In Edit Modal for a library widget, we typically just show Label, Size, Icon

        // BUT for Crypto, we DO need to show configuration in the Edit Modal
        if (activeMacroId) {
            const macro = macros.find(m => m && m.id === activeMacroId);
            if (macro && macro.config && macro.config.widgetType === 'crypto') {
                if (cryptoRow) cryptoRow.style.display = '';
            } else {
                if (cryptoRow) cryptoRow.style.display = 'none';
            }
        } else {
            if (cryptoRow) cryptoRow.style.display = 'none';
        }

        // Hide standard library dropdown in edit mode as we don't change widget type there
        if (libraryRow) libraryRow.style.display = 'none';
    } else {
        if (libraryRow) libraryRow.style.display = 'none';
        if (cryptoRow) cryptoRow.style.display = 'none';
    }
}

async function saveMacroFromModal() {
    console.log('saveMacroFromModal called');
    const label = document.getElementById('macro-label').value.trim() || 'Macro';
    const type = document.getElementById('macro-type').value;
    const size = parseInt(document.getElementById('macro-size').value) || 1;
    console.log('Saving macro:', { label, type, size, activeMacroId });

    const config = {};
    if (type === 'keyboard') {
        config.keys = document.getElementById('macro-keys').value.trim();
    } else if (type === 'website') {
        config.url = document.getElementById('macro-url').value.trim();
    } else if (type === 'app') {
        config.path = document.getElementById('macro-app-path').value.trim();
        config.args = document.getElementById('macro-app-args').value.trim();
    } else if (type === 'library') {
        // For library widgets, we preserve the existing config (widgetType)
        // Since we can't change widget type here
        if (activeMacroId) {
            const existing = macros.find(m => m && m.id === activeMacroId);
            if (existing && existing.config) {
                Object.assign(config, existing.config);

                // If it's a crypto widget, save specific config
                if (existing.config.widgetType === 'crypto') {
                    config.apiKey = document.getElementById('macro-crypto-api-key').value.trim();
                    config.symbol = document.getElementById('macro-crypto-symbol').value.trim().toUpperCase();
                    // Reset cache so we fetch new data immediately
                    delete existing.cryptoData;
                    delete existing.lastCryptoUpdate;
                }
            }
        }
    }

    // Handle icon upload - use cropped version if available, otherwise use file
    // Don't allow icon upload for library widgets
    let iconData = null;
    if (type !== 'library') {
        if (currentCropImage) {
            iconData = currentCropImage;
        } else {
            const iconInput = document.getElementById('macro-icon');
            if (iconInput.files && iconInput.files[0]) {
                iconData = await readFileAsDataURL(iconInput.files[0]);
            }
        }
    }

    if (activeMacroId) {
        // Find macro by ID (could be at any slot index)
        const idx = macros.findIndex((m) => m && m.id === activeMacroId);
        if (idx >= 0) {
            macros[idx] = {
                ...macros[idx],
                label,
                type,
                size,
                config,
                // Only update iconData for non-library widgets
                iconData: type !== 'library' ? (iconData || macros[idx].iconData) : macros[idx].iconData,
            };
        }
    } else {
        // Find first available slot across all pages
        const targetSlot = findFirstAvailableSlot(0);

        if (targetSlot === -1) {
            alert('Deck is full! Remove a macro first or add more pages in settings.');
            return;
        }

        // Switch to the page where the macro is being added
        const targetPage = Math.floor(targetSlot / SLOTS_PER_PAGE);
        if (targetPage !== currentPage) {
            currentPage = targetPage;
        }

        const id = 'macro-' + Date.now();
        macros[targetSlot] = {
            id,
            label,
            type,
            size,
            config,
            iconData,
        };
    }

    console.log('Macros before save:', macros.length);
    saveMacrosAndSettings();
    renderDeckGrid();
    closeMacroModal();
    console.log('Macro saved successfully');
}

function deleteActiveMacro() {
    if (!activeMacroId) return;
    macros = macros.filter((m) => m.id !== activeMacroId);
    saveMacrosAndSettings();
    renderDeckGrid();
    closeMacroModal();
    hideContextMenu();
}

let contextMenuMacro = null;

function showMacroContextMenu(event, macro) {
    event.preventDefault();
    event.stopPropagation();
    contextMenuMacro = macro;
    const menu = document.getElementById('context-menu');
    if (!menu) {
        console.error('Context menu not found!');
        return;
    }

    // Update context menu items based on whether there's a macro
    const editBtn = document.getElementById('context-edit');
    const deleteBtn = document.getElementById('context-delete');

    if (editBtn) {
        // Allow editing for all macros and widgets
        // Library widgets can be edited to change size, and RSS/Crypto can change config
        editBtn.textContent = macro ? 'Edit' : 'Add Macro';
        editBtn.style.display = 'block';
    }

    if (deleteBtn) {
        deleteBtn.style.display = macro ? 'block' : 'none';
    }

    menu.style.display = 'block';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    // Close menu when clicking elsewhere (but not on menu items)
    // Use a longer delay to ensure menu items can be clicked
    setTimeout(() => {
        const clickHandler = (e) => {
            // Don't close if clicking on the menu itself
            if (!menu.contains(e.target)) {
                hideContextMenu();
            }
        };
        // Remove any existing handlers first
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('contextmenu', clickHandler);
        // Add new handlers
        document.addEventListener('click', clickHandler, { once: true });
        document.addEventListener('contextmenu', clickHandler, { once: true });
    }, 100);
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'none';
    contextMenuMacro = null;
}

function setupContextMenu() {
    const editBtn = document.getElementById('context-edit');
    const deleteBtn = document.getElementById('context-delete');

    if (!editBtn || !deleteBtn) {
        console.error('Context menu buttons not found!');
        return;
    }

    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Context edit clicked, macro:', contextMenuMacro);
        const macro = contextMenuMacro ? { ...contextMenuMacro } : null; // Copy to avoid reference issues
        hideContextMenu();
        // Small delay to ensure menu is hidden before opening modal
        setTimeout(() => {
            console.log('Opening modal with macro:', macro);
            try {
                editMacro(macro);
            } catch (error) {
                console.error('Error opening macro modal from context menu:', error);
                alert('Error opening macro modal. Check console for details.');
            }
        }, 150);
    });

    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Context delete clicked, macro:', contextMenuMacro);
        if (contextMenuMacro) {
            const macroId = contextMenuMacro.id;
            hideContextMenu();
            // Small delay to ensure menu is hidden before deleting
            setTimeout(() => {
                // Find macro by ID and clear its slot (don't use splice, maintain slot positions)
                const idx = macros.findIndex((m) => m && m.id === macroId);
                if (idx >= 0) {
                    macros[idx] = undefined; // Clear the slot, maintain position
                    saveMacrosAndSettings();
                    renderDeckGrid();
                }
            }, 100);
        }
    });
}

async function executeMacro(macro) {
    try {
        await window.electronAPI.executeMacro(macro);
    } catch (error) {
        console.error('Error executing macro:', error);
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Icon cropping functionality
let currentCropImage = null;
let cropState = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    isResizing: false,
    resizeHandle: null
};

function setupIconCropping() {
    const iconInput = document.getElementById('macro-icon');
    const iconPreviewContainer = document.getElementById('icon-preview-container');
    const iconPreview = document.getElementById('icon-preview');
    const cropIconBtn = document.getElementById('crop-icon-btn');

    iconInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const dataURL = await readFileAsDataURL(file);
            iconPreview.src = dataURL;
            iconPreviewContainer.style.display = 'block';
            currentCropImage = dataURL;
        }
    });

    cropIconBtn.addEventListener('click', () => {
        if (currentCropImage) {
            openCropModal(currentCropImage);
        }
    });

    // Crop modal handlers
    document.getElementById('crop-modal-close').addEventListener('click', closeCropModal);
    document.getElementById('crop-cancel-btn').addEventListener('click', closeCropModal);
    document.getElementById('crop-apply-btn').addEventListener('click', applyCrop);

    // Setup sound file upload
    const soundInput = document.getElementById('macro-sound-file');
    const soundPreviewContainer = document.getElementById('sound-preview-container');
    const soundPreview = document.getElementById('sound-preview');
    const testSoundBtn = document.getElementById('test-sound-btn');

    if (soundInput && soundPreviewContainer && soundPreview && testSoundBtn) {
        soundInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const dataURL = await readFileAsDataURL(file);
                soundPreview.src = dataURL;
                soundPreviewContainer.style.display = 'block';

                // Store in a temporary variable to save when macro is saved
                window.currentSoundData = dataURL;

                // Also update the config if we're editing
                if (activeMacroId) {
                    const idx = macros.findIndex((m) => m.id === activeMacroId);
                    if (idx >= 0 && macros[idx].config) {
                        macros[idx].config.soundData = dataURL;
                    }
                }
            }
        });

        testSoundBtn.addEventListener('click', () => {
            if (soundPreview.src) {
                soundPreview.currentTime = 0;
                soundPreview.play().catch(err => console.error('Error playing sound:', err));
            }
        });
    }
}

function openCropModal(imageSrc) {
    const canvas = document.getElementById('crop-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
        // Set canvas size to fit image
        const maxWidth = 500;
        const maxHeight = 400;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Initialize crop box (centered, square, 60% of canvas)
        const size = Math.min(width, height) * 0.6;
        cropState.width = size;
        cropState.height = size;
        cropState.x = (width - size) / 2;
        cropState.y = (height - size) / 2;

        updateCropBox();
        updateCropPreview();

        document.getElementById('crop-modal-backdrop').style.display = 'flex';
    };

    img.src = imageSrc;
}

function closeCropModal() {
    document.getElementById('crop-modal-backdrop').style.display = 'none';
}

function updateCropBox() {
    const cropBox = document.getElementById('crop-box');
    cropBox.style.left = cropState.x + 'px';
    cropBox.style.top = cropState.y + 'px';
    cropBox.style.width = cropState.width + 'px';
    cropBox.style.height = cropState.height + 'px';
}

function updateCropPreview() {
    const canvas = document.getElementById('crop-canvas');
    const previewImg = document.getElementById('crop-preview-img');

    // Create a temporary canvas for cropping
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = cropState.width;
    tempCanvas.height = cropState.height;

    // Draw the cropped portion
    tempCtx.drawImage(
        canvas,
        cropState.x, cropState.y, cropState.width, cropState.height,
        0, 0, cropState.width, cropState.height
    );

    previewImg.src = tempCanvas.toDataURL();
}

function applyCrop() {
    const previewImg = document.getElementById('crop-preview-img');
    if (previewImg.src) {
        // Update the icon preview in the macro modal
        document.getElementById('icon-preview').src = previewImg.src;
        currentCropImage = previewImg.src;
        closeCropModal();
    }
}

// Setup crop box dragging
function setupCropBoxInteraction() {
    const cropBox = document.getElementById('crop-box');
    const canvas = document.getElementById('crop-canvas');

    cropBox.addEventListener('mousedown', (e) => {
        e.preventDefault();
        cropState.isDragging = true;
        const rect = cropBox.getBoundingClientRect();
        cropState.dragStart.x = e.clientX - rect.left;
        cropState.dragStart.y = e.clientY - rect.top;
    });

    document.addEventListener('mousemove', (e) => {
        if (cropState.isDragging) {
            const canvasRect = canvas.getBoundingClientRect();
            const newX = e.clientX - canvasRect.left - cropState.dragStart.x;
            const newY = e.clientY - canvasRect.top - cropState.dragStart.y;

            // Constrain to canvas bounds
            cropState.x = Math.max(0, Math.min(newX, canvas.width - cropState.width));
            cropState.y = Math.max(0, Math.min(newY, canvas.height - cropState.height));

            updateCropBox();
            updateCropPreview();
        }
    });

    document.addEventListener('mouseup', () => {
        cropState.isDragging = false;
    });

    // Allow resizing by dragging corners (simplified - just scale from center)
    cropBox.addEventListener('dblclick', () => {
        // Toggle between square and full canvas
        if (cropState.width === cropState.height && cropState.width < Math.min(canvas.width, canvas.height)) {
            const size = Math.min(canvas.width, canvas.height) * 0.9;
            cropState.width = size;
            cropState.height = size;
            cropState.x = (canvas.width - size) / 2;
            cropState.y = (canvas.height - size) / 2;
            updateCropBox();
            updateCropPreview();
        }
    });
}

function startMediaUpdates() {
    // Update immediately
    updateMediaInfo();

    // Then update every second
    updateInterval = setInterval(updateMediaInfo, 1000);
}

async function updateMediaInfo() {
    try {
        const info = await window.electronAPI.getMediaInfo();

        if (info.error) {
            updateStatus('Connection error', false);
            return;
        }

        // Update track info
        document.getElementById('track-title').textContent = info.title || 'No media playing';
        document.getElementById('track-artist').textContent = info.artist || '';
        document.getElementById('track-album').textContent = info.album || '';

        // Update app name
        let appName = info.app || '';
        if (appName) {
            appName = appName.split('!').pop();
            appName = appName.replace('.exe', '').replace(/\.[^.]*$/, '');
            appName = appName.split(/(?=[A-Z])/).join(' ');
        }
        document.getElementById('track-app').textContent = appName ? `Playing from: ${appName}` : '';

        // Update artwork
        const albumArtContainer = document.getElementById('album-art');
        if (info.artwork_base64) {
            albumArtContainer.innerHTML = `<img src="data:image/jpeg;base64,${info.artwork_base64}" alt="Album Art">`;
        } else {
            albumArtContainer.innerHTML = `
                <div class="album-art-placeholder">
                    <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 18V5l12-2v13"></path>
                        <circle cx="6" cy="18" r="3"></circle>
                        <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                </div>
            `;
        }

        // Update status
        const hasMedia = info.status === 'detected' && info.title && info.title !== 'No media playing';
        updateStatus(
            hasMedia ? 'Media detected' : 'No media detected - Start playing music',
            hasMedia
        );

        // Update progress bar
        if (info.position !== undefined && info.duration !== undefined && info.duration > 0) {
            const progress = (info.position / info.duration) * 100;
            updateProgressBar(progress);
            updateTimeDisplay(info.position, info.duration);
        } else {
            updateProgressBar(0);
            updateTimeDisplay(0, 0);
        }

        // Update play/pause state
        if (info.playback_status !== undefined) {
            isPlaying = info.playback_status === 3; // 3 = Playing
            updatePlayPauseIcon();
        }

    } catch (error) {
        console.error('Error updating media info:', error);
        updateStatus('Error fetching media info', false);
    }
}

function updateStatus(text, active) {
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('.status-dot');

    statusText.textContent = text;

    if (active) {
        statusDot.classList.add('active');
    } else {
        statusDot.classList.remove('active');
    }
}

function updatePlayPauseIcon() {
    const playIcon = document.querySelector('.play-icon');
    const pauseIcon = document.querySelector('.pause-icon');

    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

function updateProgressBar(percentage) {
    const progressPath = document.getElementById('wavy-progress-path');
    const progressThumb = document.getElementById('progress-thumb');
    const progressBar = document.getElementById('wavy-progress-bar');

    percentage = Math.max(0, Math.min(100, percentage));

    if (progressPath) {
        // Calculate the path length and set stroke-dashoffset
        const pathLength = progressPath.getTotalLength();
        const offset = pathLength - (pathLength * percentage / 100);
        progressPath.style.strokeDashoffset = offset;
    }

    if (progressThumb && progressBar) {
        const barWidth = progressBar.offsetWidth;
        progressThumb.style.left = (barWidth * percentage / 100) + 'px';
    }
}

function updateTimeDisplay(current, total) {
    document.getElementById('current-time').textContent = formatTime(current);
    document.getElementById('total-time').textContent = formatTime(total);
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function handleProgressBarClick(event) {
    const progressBar = document.getElementById('wavy-progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;

    // Seek to position
    window.electronAPI.seekToPosition?.(percentage);
}

function handleProgressBarHover(event) {
    const progressBar = document.getElementById('wavy-progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const hoverX = event.clientX - rect.left;
    const percentage = (hoverX / rect.width) * 100;

    // Update thumb position on hover
    const progressThumb = document.getElementById('progress-thumb');
    progressThumb.style.left = percentage + '%';
}

// Sound playback function
function playSoundClip(soundData) {
    const audio = new Audio(soundData);
    audio.volume = 1.0;
    audio.play().catch(err => {
        console.error('Error playing sound clip:', err);
    });
}

// Cleanup on page unload
// --- Keyboard Shortcut Recorder ---
let isRecording = false;
let recordedKeys = [];
let keyModifiers = { ctrl: false, alt: false, shift: false, meta: false };

function setupKeyboardRecorder() {
    const recordBtn = document.getElementById('record-shortcut-btn');
    const stopBtn = document.getElementById('stop-recording-btn');
    const cancelBtn = document.getElementById('cancel-recording-btn');
    const overlay = document.getElementById('recording-overlay');

    if (!recordBtn || !overlay) return;

    recordBtn.addEventListener('click', () => {
        startRecording();
    });

    stopBtn.addEventListener('click', () => {
        stopRecording(true);
    });

    cancelBtn.addEventListener('click', () => {
        stopRecording(false);
    });

    // Handle Escape key to cancel recording
    document.addEventListener('keydown', (e) => {
        if (isRecording && e.key === 'Escape') {
            stopRecording(false);
        }
    });

    // Set up the key recorded listener once (not inside startRecording)
    window.electronAPI.onKeyRecorded((event, keyData) => {
        if (!isRecording) return;

        console.log('Key recorded:', keyData); // Debug log

        // Only handle keydown events
        if (keyData.type && keyData.type !== 'keyDown') return;

        // Ignore Escape
        if (keyData.key === 'Escape') {
            stopRecording(false);
            return;
        }

        // Treat pure modifiers as state, not full shortcuts
        if (['Control', 'Alt', 'Shift', 'Meta', 'Super'].includes(keyData.key)) {
            keyModifiers.ctrl = keyData.ctrl;
            keyModifiers.alt = keyData.alt;
            keyModifiers.shift = keyData.shift;
            keyModifiers.meta = keyData.meta;
            updateRecordingDisplay();
            return;
        }

        // Record the key combination including modifiers
        const keyCombo = {
            key: keyData.key,
            ctrl: keyData.ctrl || keyModifiers.ctrl,
            alt: keyData.alt || keyModifiers.alt,
            shift: keyData.shift || keyModifiers.shift,
            meta: keyData.meta || keyModifiers.meta,
            code: keyData.code
        };

        // Only add if not already recorded
        const exists = recordedKeys.some(k =>
            k.key === keyCombo.key &&
            k.ctrl === keyCombo.ctrl &&
            k.alt === keyCombo.alt &&
            k.shift === keyCombo.shift &&
            k.meta === keyCombo.meta
        );

        if (!exists) {
            recordedKeys.push(keyCombo);
            updateRecordingDisplay();
        }
    });
}

function startRecording() {
    isRecording = true;
    recordedKeys = [];
    keyModifiers = { ctrl: false, alt: false, shift: false, meta: false };

    const overlay = document.getElementById('recording-overlay');
    const display = document.getElementById('recorded-keys-display');

    if (overlay) overlay.style.display = 'flex';
    if (display) display.textContent = 'Waiting for key press...';

    // Start recording in main process (captures system shortcuts)
    window.electronAPI.startKeyRecording().then(() => {
        console.log('Key recording started in main process');
        // Ensure window has focus to receive keyboard events
        if (window.electronAPI.focusWindow) {
            window.electronAPI.focusWindow();
        }
    }).catch(err => {
        console.error('Error starting key recording:', err);
    });
}

function stopRecording(save) {
    isRecording = false;

    // Stop recording in main process
    window.electronAPI.stopKeyRecording();

    const overlay = document.getElementById('recording-overlay');
    if (overlay) overlay.style.display = 'none';

    if (save && recordedKeys.length > 0) {
        const sendKeysFormat = convertToSendKeys(recordedKeys);
        const keysInput = document.getElementById('macro-keys');
        const recordedDisplay = document.getElementById('recorded-shortcut-display');
        const recordedText = document.getElementById('recorded-keys-text');

        if (keysInput) {
            keysInput.value = sendKeysFormat;
        }
        if (recordedText) {
            recordedText.textContent = formatKeyDisplay(recordedKeys);
        }
        if (recordedDisplay) {
            recordedDisplay.style.display = 'block';
        }
    }

    recordedKeys = [];
    keyModifiers = { ctrl: false, alt: false, shift: false, meta: false };
}

function handleKeyDown(e) {
    if (!isRecording) return;

    // Ignore modifier keys themselves, we track them separately
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        if (e.key === 'Control') keyModifiers.ctrl = true;
        if (e.key === 'Alt') keyModifiers.alt = true;
        if (e.key === 'Shift') keyModifiers.shift = true;
        if (e.key === 'Meta') keyModifiers.meta = true;
        updateRecordingDisplay();
        return;
    }

    // Ignore Escape (handled separately)
    if (e.key === 'Escape') return;

    // Prevent default to avoid typing in inputs
    e.preventDefault();
    e.stopPropagation();

    // Record the key combination
    const keyCombo = {
        key: e.key,
        ctrl: e.ctrlKey || keyModifiers.ctrl,
        alt: e.altKey || keyModifiers.alt,
        shift: e.shiftKey || keyModifiers.shift,
        meta: e.metaKey || keyModifiers.meta,
        code: e.code
    };

    // Only add if not already recorded (avoid duplicates from key repeat)
    const exists = recordedKeys.some(k =>
        k.key === keyCombo.key &&
        k.ctrl === keyCombo.ctrl &&
        k.alt === keyCombo.alt &&
        k.shift === keyCombo.shift &&
        k.meta === keyCombo.meta
    );

    if (!exists) {
        recordedKeys.push(keyCombo);
        updateRecordingDisplay();
    }
}

function handleKeyUp(e) {
    if (!isRecording) return;

    if (e.key === 'Control') keyModifiers.ctrl = false;
    if (e.key === 'Alt') keyModifiers.alt = false;
    if (e.key === 'Shift') keyModifiers.shift = false;
    if (e.key === 'Meta') keyModifiers.meta = false;
}

function updateRecordingDisplay() {
    const display = document.getElementById('recorded-keys-display');
    if (recordedKeys.length === 0) {
        display.textContent = 'Waiting for key press...';
    } else {
        display.textContent = formatKeyDisplay(recordedKeys);
    }
}

function formatKeyDisplay(keys) {
    return keys.map(k => {
        const parts = [];
        if (k.ctrl) parts.push('Ctrl');
        if (k.alt) parts.push('Alt');
        if (k.shift) parts.push('Shift');
        if (k.meta) parts.push('Win');

        let keyName = k.key;
        // Format special keys
        if (keyName === ' ') keyName = 'Space';
        else if (keyName.length > 1) {
            // Capitalize first letter of special keys
            keyName = keyName.charAt(0).toUpperCase() + keyName.slice(1).toLowerCase();
        } else {
            keyName = keyName.toUpperCase();
        }

        parts.push(keyName);
        return parts.join(' + ');
    }).join(', ');
}

function convertToSendKeys(keys) {
    // SendKeys format: ^ = Ctrl, % = Alt, + = Shift, # = Win
    // For multiple key combinations, we'll use the first one
    if (keys.length === 0) return '';

    const k = keys[0];
    let result = '';

    if (k.ctrl) result += '^';
    if (k.alt) result += '%';
    if (k.shift) result += '+';
    if (k.meta) result += '#';

    // Convert key to SendKeys format
    let keyChar = k.key;
    if (keyChar === ' ') keyChar = ' ';
    else if (keyChar.length === 1) {
        // Single character - use as is (SendKeys will handle case)
        keyChar = keyChar;
    } else {
        // Special key - convert to SendKeys format
        const keyMap = {
            'Enter': '{ENTER}',
            'Escape': '{ESC}',
            'Tab': '{TAB}',
            'Backspace': '{BS}',
            'Delete': '{DEL}',
            'ArrowUp': '{UP}',
            'ArrowDown': '{DOWN}',
            'ArrowLeft': '{LEFT}',
            'ArrowRight': '{RIGHT}',
            'Home': '{HOME}',
            'End': '{END}',
            'PageUp': '{PGUP}',
            'PageDown': '{PGDN}',
            'Insert': '{INS}',
            'F1': '{F1}',
            'F2': '{F2}',
            'F3': '{F3}',
            'F4': '{F4}',
            'F5': '{F5}',
            'F6': '{F6}',
            'F7': '{F7}',
            'F8': '{F8}',
            'F9': '{F9}',
            'F10': '{F10}',
            'F11': '{F11}',
            'F12': '{F12}'
        };
        keyChar = keyMap[keyChar] || keyChar;
    }

    result += keyChar;
    return result;
}

function formatSendKeysToDisplay(sendKeys) {
    // Convert SendKeys format back to human-readable format
    // ^ = Ctrl, % = Alt, + = Shift, # = Win
    if (!sendKeys) return '';

    let display = sendKeys;
    const parts = [];

    if (display.includes('^')) {
        parts.push('Ctrl');
        display = display.replace('^', '');
    }
    if (display.includes('%')) {
        parts.push('Alt');
        display = display.replace('%', '');
    }
    if (display.includes('+')) {
        parts.push('Shift');
        display = display.replace('+', '');
    }
    if (display.includes('#')) {
        parts.push('Win');
        display = display.replace('#', '');
    }

    // Handle special keys in braces
    const specialKeyMap = {
        '{ENTER}': 'Enter',
        '{ESC}': 'Escape',
        '{TAB}': 'Tab',
        '{BS}': 'Backspace',
        '{DEL}': 'Delete',
        '{UP}': 'Up',
        '{DOWN}': 'Down',
        '{LEFT}': 'Left',
        '{RIGHT}': 'Right',
        '{HOME}': 'Home',
        '{END}': 'End',
        '{PGUP}': 'Page Up',
        '{PGDN}': 'Page Down',
        '{INS}': 'Insert',
        '{F1}': 'F1',
        '{F2}': 'F2',
        '{F3}': 'F3',
        '{F4}': 'F4',
        '{F5}': 'F5',
        '{F6}': 'F6',
        '{F7}': 'F7',
        '{F8}': 'F8',
        '{F9}': 'F9',
        '{F10}': 'F10',
        '{F11}': 'F11',
        '{F12}': 'F12'
    };

    for (const [key, value] of Object.entries(specialKeyMap)) {
        if (display.includes(key)) {
            parts.push(value);
            display = display.replace(key, '');
            break;
        }
    }

    // Add remaining character (if any)
    if (display.trim()) {
        parts.push(display.trim().toUpperCase());
    }

    return parts.join(' + ') || sendKeys;
}


// --- Widget Functions ---
let widgetUpdateInterval = null;
let systemStats = null;

function getWidgetIcon(widgetType) {
    const icons = {
        cpu: '⚡',
        // Use a RAM-style emoji for memory to better represent RAM
        memory: '🧠',
        disk: '💿',
        bandwidth: '📡',
        clock: '🕐',
        rss: '📰',
        crypto: '💰',
        pomodoro: '🍅'
    };
    return icons[widgetType] || '📊';
}

function getWidgetLabel(widgetType) {
    const labels = {
        cpu: 'CPU',
        memory: 'Memory',
        disk: 'Disk',
        bandwidth: 'Network',
        clock: 'Clock',
        rss: 'RSS Feed',
        crypto: 'Cryptoticker',
        pomodoro: 'Pomodoro Timer'
    };
    return labels[widgetType] || 'Widget';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + '/s';
}

function updateWidgets() {
    // Filter out undefined/null macros and only process library widgets
    macros.filter(m => m && m.type === 'library').forEach(macro => {
        const widgetValueEl = document.getElementById(`widget-value-${macro.id}`);
        if (!widgetValueEl) {
            // Element not found - might be because DOM was just re-rendered
            // This is okay, it will be found on the next update cycle
            return;
        }

        const widgetType = macro.config?.widgetType || 'cpu';
        let displayValue = '';

        switch (widgetType) {
            case 'cpu':
                if (systemStats) {
                    displayValue = `${Math.round(systemStats.cpu)}%`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'memory':
                if (systemStats) {
                    displayValue = `${Math.round(systemStats.memory.percentage)}%`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'disk':
                if (systemStats) {
                    displayValue = `${Math.round(systemStats.disk.percentage)}%`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'bandwidth':
                if (systemStats) {
                    const downSpeed = systemStats.network.downloadSpeed || 0;
                    const upSpeed = systemStats.network.uploadSpeed || 0;
                    displayValue = `↓${formatSpeed(downSpeed)} ↑${formatSpeed(upSpeed)}`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'clock':
                const now = new Date();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                displayValue = `${hours}:${minutes}:${seconds}`;
                break;
            case 'rss':
                // RSS feeds are handled separately with cycling
                if (macro.rssItems && macro.rssItems.length > 0) {
                    const currentItem = macro.rssItems[macro.rssCurrentIndex || 0];
                    if (currentItem) {
                        displayValue = currentItem.title || 'RSS Feed';
                    } else {
                        displayValue = 'Loading...';
                    }
                } else {
                    displayValue = 'Loading...';
                }
                break;
            case 'crypto':
                if (macro.cryptoData) {
                    const price = macro.cryptoData.price;
                    const change = macro.cryptoData.percent_change_24h;
                    // Format price
                    let formattedPrice = '$' + price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    if (price < 1) formattedPrice = '$' + price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

                    const arrow = change >= 0 ? '↑' : '↓';
                    displayValue = `${macro.config.symbol || ''} ${formattedPrice} ${arrow}${Math.abs(change).toFixed(1)}%`;
                } else if (macro.cryptoError) {
                    displayValue = 'Error';
                } else {
                    displayValue = 'Loading...';
                }
                break;
            case 'pomodoro':
                // Initialize state if needed
                if (!macro.pomodoroState) {
                    macro.pomodoroState = {
                        timeRemaining: 25 * 60,
                        phase: 'work',
                        isRunning: false,
                        pomodoroCount: 0,
                        startTime: null,
                        pausedTime: 25 * 60
                    };
                }

                const state = macro.pomodoroState;
                
                // Update timer if running
                if (state.isRunning && state.startTime) {
                    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
                    const newTime = state.pausedTime - elapsed;
                    
                    if (newTime <= 0) {
                        // Timer finished - move to next phase
                        state.timeRemaining = 0;
                        completePomodoroPhase(macro);
                    } else {
                        state.timeRemaining = newTime;
                    }
                } else {
                    // Not running, use pausedTime or timeRemaining
                    if (state.pausedTime !== null) {
                        state.timeRemaining = state.pausedTime;
                    }
                }

                // Format time as MM:SS
                const pomodoroMinutes = Math.floor(state.timeRemaining / 60);
                const pomodoroSeconds = state.timeRemaining % 60;
                displayValue = `${String(pomodoroMinutes).padStart(2, '0')}:${String(pomodoroSeconds).padStart(2, '0')}`;

                // Update phase display
                const phaseEl = document.getElementById(`pomodoro-phase-${macro.id}`);
                if (phaseEl) {
                    let phaseText = '';
                    if (state.phase === 'work') {
                        phaseText = `Work • ${state.pomodoroCount}/4`;
                    } else if (state.phase === 'shortBreak') {
                        phaseText = 'Short Break';
                    } else if (state.phase === 'longBreak') {
                        phaseText = 'Long Break';
                    }
                    phaseEl.textContent = phaseText;
                }

                // Update button text
                const startPauseBtn = document.getElementById(`pomodoro-start-pause-${macro.id}`);
                if (startPauseBtn) {
                    startPauseBtn.textContent = state.isRunning ? 'Pause' : 'Start';
                }
                break;
            default:
                displayValue = '...';
        }

        widgetValueEl.textContent = displayValue;
    });
}

async function fetchSystemStats() {
    try {
        if (window.electronAPI && window.electronAPI.getSystemStats) {
            systemStats = await window.electronAPI.getSystemStats();
            updateWidgets();
        }
    } catch (error) {
        console.error('Error fetching system stats:', error);
    }
}

// Pomodoro Timer Functions
function togglePomodoro(macro) {
    if (!macro.pomodoroState) {
        macro.pomodoroState = {
            timeRemaining: 25 * 60,
            phase: 'work',
            isRunning: false,
            pomodoroCount: 0,
            startTime: null,
            pausedTime: 25 * 60
        };
    }

    const state = macro.pomodoroState;

    if (state.isRunning) {
        // Pause: save current time remaining
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        state.pausedTime = Math.max(0, state.pausedTime - elapsed);
        state.timeRemaining = state.pausedTime;
        state.isRunning = false;
        state.startTime = null;
    } else {
        // Start: record start time
        state.isRunning = true;
        state.startTime = Date.now();
        if (state.pausedTime === null || state.pausedTime === undefined) {
            state.pausedTime = state.timeRemaining;
        }
    }

    saveMacrosAndSettings();
    updateWidgets();
}

function resetPomodoro(macro) {
    if (!macro.pomodoroState) {
        macro.pomodoroState = {
            timeRemaining: 25 * 60,
            phase: 'work',
            isRunning: false,
            pomodoroCount: 0,
            startTime: null,
            pausedTime: 25 * 60
        };
    }

    const state = macro.pomodoroState;
    
    // Reset to initial work state based on current phase
    if (state.phase === 'work') {
        state.timeRemaining = 25 * 60;
        state.pausedTime = 25 * 60;
    } else if (state.phase === 'shortBreak') {
        state.timeRemaining = 5 * 60;
        state.pausedTime = 5 * 60;
    } else if (state.phase === 'longBreak') {
        state.timeRemaining = 15 * 60;
        state.pausedTime = 15 * 60;
    }
    
    state.isRunning = false;
    state.startTime = null;
    // Keep pomodoroCount and phase - user might want to reset just the timer

    saveMacrosAndSettings();
    updateWidgets();
}

function completePomodoroPhase(macro) {
    if (!macro.pomodoroState) return;

    const state = macro.pomodoroState;

    if (state.phase === 'work') {
        state.pomodoroCount++;
        
        // After 4 pomodoros, take a long break
        if (state.pomodoroCount >= 4) {
            state.phase = 'longBreak';
            state.timeRemaining = 15 * 60; // 15 minutes
            state.pausedTime = 15 * 60;
            state.pomodoroCount = 0; // Reset count after long break
        } else {
            state.phase = 'shortBreak';
            state.timeRemaining = 5 * 60; // 5 minutes
            state.pausedTime = 5 * 60;
        }
    } else if (state.phase === 'shortBreak' || state.phase === 'longBreak') {
        // Break finished, back to work
        state.phase = 'work';
        state.timeRemaining = 25 * 60; // 25 minutes
        state.pausedTime = 25 * 60;
    }

    state.isRunning = false;
    state.startTime = null;

    saveMacrosAndSettings();
    updateWidgets();
}

function startWidgetUpdates() {
    // Check if there are any library widgets (filter out undefined)
    const hasWidgets = macros.some(m => m && m.type === 'library');
    if (!hasWidgets) {
        // Clear intervals if no widgets
        if (widgetUpdateInterval) {
            clearInterval(widgetUpdateInterval);
            widgetUpdateInterval = null;
        }
        if (window.systemStatsInterval) {
            clearInterval(window.systemStatsInterval);
            window.systemStatsInterval = null;
        }
        return;
    }

    // Clear existing intervals before starting new ones
    if (widgetUpdateInterval) {
        clearInterval(widgetUpdateInterval);
        widgetUpdateInterval = null;
    }
    if (window.systemStatsInterval) {
        clearInterval(window.systemStatsInterval);
        window.systemStatsInterval = null;
    }

    // Initial update (give DOM a moment to be ready)
    setTimeout(() => {
        updateWidgets();
    }, 50);

    // Fetch system stats if there are system monitoring widgets
    const hasSystemWidgets = macros.some(m =>
        m && m.type === 'library' &&
        ['cpu', 'memory', 'disk', 'bandwidth'].includes(m.config?.widgetType)
    );

    if (hasSystemWidgets) {
        fetchSystemStats();
        // Fetch system stats every 2 seconds
        window.systemStatsInterval = setInterval(fetchSystemStats, 2000);
    }

    // Update all widgets every second (clock needs this, and all widgets benefit from regular updates)
    widgetUpdateInterval = setInterval(() => {
        updateWidgets();
    }, 1000);

    // Start RSS updates for any RSS widgets
    macros.filter(m => m && m.type === 'library' && m.config?.widgetType === 'rss').forEach(macro => {
        // If RSS items haven't been loaded yet, fetch them
        if (!macro.rssItems || macro.rssItems.length === 0) {
            if (macro.config?.feedUrls && macro.config.feedUrls.length > 0) {
                fetchRssFeeds(macro.config.feedUrls).then(items => {
                    macro.rssItems = items;
                    if (items.length > 0) {
                        macro.rssCurrentIndex = 0;
                        const firstItem = items[0];
                        if (firstItem.image) {
                            macro.rssCurrentImage = firstItem.image;
                        }
                        updateWidgets();
                        renderDeckGrid(); // Re-render to show background image
                    }
                    updateWidgets();
                });
            }
        }
        startRssUpdates(macro);
    });

    // Update Crypto widgets
    macros.filter(m => m && m.type === 'library' && m.config?.widgetType === 'crypto').forEach(macro => {
        const now = Date.now();
        // Update every 60 seconds or if no data
        if (!macro.lastCryptoUpdate || (now - macro.lastCryptoUpdate > 60000)) {
            fetchCryptoData(macro).then(() => {
                updateWidgets();
            });
        }
    });
}

async function fetchCryptoData(macro) {
    if (!macro.config?.apiKey || !macro.config?.symbol) {
        macro.cryptoError = 'Config missing';
        return;
    }

    try {
        macro.lastCryptoUpdate = Date.now();
        const data = await window.electronAPI.fetchCryptoPrice(macro.config.apiKey, macro.config.symbol);

        if (data.error) {
            console.error('Crypto API Error:', data.error);
            macro.cryptoError = data.error;
            macro.cryptoData = null;
        } else {
            macro.cryptoData = data;
            macro.cryptoError = null;
        }
    } catch (err) {
        console.error('Error fetching crypto:', err);
        macro.cryptoError = err.message;
    }
}

// Widget updates are restarted in renderDeckGrid itself

// --- Library Modal Functions ---
const AVAILABLE_WIDGETS = [
    {
        type: 'cpu',
        label: 'CPU Usage',
        icon: '⚡',
        description: 'Live CPU load percentage.'
    },
    {
        type: 'memory',
        label: 'Memory Usage',
        icon: '🧠',
        description: 'RAM usage as a percentage.'
    },
    {
        type: 'disk',
        label: 'Disk Usage',
        icon: '💿',
        description: 'Disk space or activity level.'
    },
    {
        type: 'bandwidth',
        label: 'Network Bandwidth',
        icon: '📡',
        description: 'Upload / download throughput.'
    },
    {
        type: 'clock',
        label: 'Clock',
        icon: '🕐',
        description: 'Digital system time.'
    },
    {
        type: 'rss',
        label: 'RSS Feed',
        icon: '📰',
        description: 'Scroll through RSS headlines and images.'
    },
    {
        type: 'crypto',
        label: 'Cryptoticker',
        icon: '💰',
        description: 'Live crypto prices via CoinMarketCap.'
    },
    {
        type: 'pomodoro',
        label: 'Pomodoro Timer',
        icon: '🍅',
        description: '25-minute work intervals with breaks.'
    }
];

function openLibraryModal() {
    const backdrop = document.getElementById('library-modal-backdrop');
    const grid = document.getElementById('library-grid');

    if (!backdrop || !grid) return;

    grid.innerHTML = '';

    AVAILABLE_WIDGETS.forEach(widget => {
        const preview = document.createElement('div');
        preview.classList.add('library-widget-preview', 'deck-widget');
        preview.dataset.widgetType = widget.type;
        preview.draggable = true;

        const widgetContent = document.createElement('div');
        widgetContent.classList.add('widget-content');

        const widgetIcon = document.createElement('div');
        widgetIcon.classList.add('widget-icon');
        widgetIcon.textContent = widget.icon;

        const widgetLabel = document.createElement('div');
        widgetLabel.classList.add('widget-label');
        widgetLabel.textContent = widget.label;

        const widgetDescription = document.createElement('div');
        widgetDescription.classList.add('widget-description');
        widgetDescription.textContent = widget.description || '';

        const widgetValue = document.createElement('div');
        widgetValue.classList.add('widget-value');
        widgetValue.textContent = widget.type === 'clock' ? getCurrentTime() : '...';

        widgetContent.appendChild(widgetIcon);
        widgetContent.appendChild(widgetLabel);
        if (widget.description) {
            widgetContent.appendChild(widgetDescription);
        }
        widgetContent.appendChild(widgetValue);
        preview.appendChild(widgetContent);

        // Drag start
        preview.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'library',
                widgetType: widget.type
            }));
            preview.classList.add('dragging');
        });

        preview.addEventListener('dragend', (e) => {
            preview.classList.remove('dragging');
        });

        // Right-click to add
        preview.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            addWidgetToDeck(widget.type);
        });

        // Click to add (or configure for RSS/Crypto)
        preview.addEventListener('click', () => {
            if (widget.type === 'rss') {
                openRssConfigModal();
            } else if (widget.type === 'crypto') {
                openCryptoConfigModal();
            } else {
                addWidgetToDeck(widget.type);
            }
        });

        grid.appendChild(preview);
    });

    // Update library modal widgets
    updateLibraryModalWidgets();

    // Set up interval to update library modal widgets
    if (window.libraryModalInterval) {
        clearInterval(window.libraryModalInterval);
    }
    window.libraryModalInterval = setInterval(() => {
        updateLibraryModalWidgets();
    }, 1000);

    backdrop.style.display = 'flex';
}

function updateLibraryModalWidgets() {
    const grid = document.getElementById('library-grid');
    if (!grid) return;

    const previews = grid.querySelectorAll('.library-widget-preview');
    previews.forEach(preview => {
        const widgetType = preview.dataset.widgetType;
        const valueEl = preview.querySelector('.widget-value');
        if (!valueEl) return;

        let displayValue = '';

        switch (widgetType) {
            case 'cpu':
                if (systemStats) {
                    displayValue = `${Math.round(systemStats.cpu)}%`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'memory':
                if (systemStats) {
                    displayValue = `${Math.round(systemStats.memory.percentage)}%`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'disk':
                if (systemStats) {
                    displayValue = `${Math.round(systemStats.disk.percentage)}%`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'bandwidth':
                if (systemStats) {
                    const downSpeed = systemStats.network.downloadSpeed || 0;
                    const upSpeed = systemStats.network.uploadSpeed || 0;
                    displayValue = `↓${formatSpeed(downSpeed)} ↑${formatSpeed(upSpeed)}`;
                } else {
                    displayValue = '...';
                }
                break;
            case 'clock':
                displayValue = getCurrentTime();
                break;
            case 'pomodoro':
                // Find the macro for this pomodoro widget
                const pomodoroMacro = macros.find(m => m && m.type === 'library' && m.config?.widgetType === 'pomodoro');
                if (pomodoroMacro && pomodoroMacro.pomodoroState) {
                    const state = pomodoroMacro.pomodoroState;
                    const pomodoroMinutes = Math.floor(state.timeRemaining / 60);
                    const pomodoroSeconds = state.timeRemaining % 60;
                    displayValue = `${String(pomodoroMinutes).padStart(2, '0')}:${String(pomodoroSeconds).padStart(2, '0')}`;
                } else {
                    displayValue = '25:00';
                }
                break;
        }

        valueEl.textContent = displayValue;
    });

    // Fetch system stats if needed
    const hasSystemWidgets = Array.from(previews).some(p =>
        ['cpu', 'memory', 'disk', 'bandwidth'].includes(p.dataset.widgetType)
    );
    if (hasSystemWidgets && !systemStats) {
        fetchSystemStats();
    }
}

function closeLibraryModal() {
    const backdrop = document.getElementById('library-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'none';
    }
    if (window.libraryModalInterval) {
        clearInterval(window.libraryModalInterval);
        window.libraryModalInterval = null;
    }
}

function closeLibraryModal() {
    const backdrop = document.getElementById('library-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'none';
    }
}

function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function addWidgetToDeck(widgetType) {
    // Find first available slot across all pages
    const targetIndex = findFirstAvailableSlot(0);

    if (targetIndex === -1) {
        alert('Deck is full! Remove a macro first or add more pages in settings.');
        return;
    }

    // Switch to the page where the widget is being added
    const targetPage = Math.floor(targetIndex / SLOTS_PER_PAGE);
    if (targetPage !== currentPage) {
        currentPage = targetPage;
    }

    const id = 'macro-' + Date.now();
    const newMacro = {
        id,
        label: getWidgetLabel(widgetType),
        type: 'library',
        config: {
            widgetType: widgetType
        },
        iconData: null
    };

    macros[targetIndex] = newMacro;
    saveMacrosAndSettings();
    renderDeckGrid();
    closeLibraryModal();
    return newMacro;
}

// --- RSS Feed Functions ---
let rssUpdateIntervals = {}; // Store intervals per RSS widget

function openRssConfigModal() {
    const backdrop = document.getElementById('rss-config-modal-backdrop');
    const feedsInput = document.getElementById('rss-feeds-input');
    const intervalInput = document.getElementById('rss-update-interval');

    if (!backdrop || !feedsInput || !intervalInput) return;

    // Clear previous values
    feedsInput.value = '';
    intervalInput.value = '5';

    backdrop.style.display = 'flex';
}

function closeRssConfigModal() {
    const backdrop = document.getElementById('rss-config-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'none';
    }
}

async function parseRssFeed(url) {
    try {
        // Use a CORS proxy or fetch from main process
        // For now, we'll try direct fetch (may need CORS proxy)
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();

        // Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        // Check for parsing errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Failed to parse RSS feed');
        }

        // Extract items
        const items = xmlDoc.querySelectorAll('item');
        const rssItems = [];

        items.forEach(item => {
            const title = item.querySelector('title')?.textContent || '';
            const link = item.querySelector('link')?.textContent || '';
            const description = item.querySelector('description')?.textContent || '';

            // Try to find image - check multiple possible locations
            let image = null;
            const mediaContent = item.querySelector('media\\:content, media\\:thumbnail, content, enclosure');
            if (mediaContent) {
                // Check url attribute first, then href (some feeds use href for enclosure)
                image = mediaContent.getAttribute('url') || mediaContent.getAttribute('href');
            }

            // Try to extract image from description (HTML)
            if (!image && description) {
                const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (imgMatch) {
                    image = imgMatch[1];
                }
            }

            // Try content:encoded or other fields
            if (!image) {
                const contentEncoded = item.querySelector('content\\:encoded, encoded');
                if (contentEncoded) {
                    const imgMatch = contentEncoded.textContent.match(/<img[^>]+src=["']([^"']+)["']/i);
                    if (imgMatch) {
                        image = imgMatch[1];
                    }
                }
            }

            rssItems.push({
                title: title.trim(),
                link: link.trim(),
                description: description.trim(),
                image: image
            });
        });

        return rssItems;
    } catch (error) {
        console.error('Error parsing RSS feed:', url, error);
        return [];
    }
}

async function fetchRssFeeds(feedUrls) {
    const allItems = [];

    for (const url of feedUrls) {
        if (!url || !url.trim()) continue;
        try {
            const items = await parseRssFeed(url.trim());
            allItems.push(...items);
        } catch (error) {
            console.error('Error fetching RSS feed:', url, error);
        }
    }

    // Sort by date if available, otherwise keep order
    return allItems;
}

function startRssUpdates(macro) {
    if (!macro || macro.config?.widgetType !== 'rss') return;

    // Clear existing interval for this macro
    if (rssUpdateIntervals[macro.id]) {
        clearInterval(rssUpdateIntervals[macro.id]);
    }

    const updateInterval = macro.config?.updateInterval || 5; // seconds

    // Cycle through RSS items
    rssUpdateIntervals[macro.id] = setInterval(() => {
        if (macro.rssItems && macro.rssItems.length > 0) {
            macro.rssCurrentIndex = (macro.rssCurrentIndex || 0) + 1;
            if (macro.rssCurrentIndex >= macro.rssItems.length) {
                macro.rssCurrentIndex = 0;
            }

            const currentItem = macro.rssItems[macro.rssCurrentIndex];
            if (currentItem) {
                // Update widget display
                const widgetValueEl = document.getElementById(`widget-value-${macro.id}`);
                const widgetUrlEl = document.getElementById(`widget-url-${macro.id}`);
                const keyEl = document.querySelector(`[data-macro-id="${macro.id}"]`);

                if (widgetValueEl) {
                    widgetValueEl.textContent = currentItem.title || 'RSS Feed';
                }

                if (widgetUrlEl) {
                    widgetUrlEl.textContent = currentItem.link || '';
                }

                // Update background image
                if (keyEl && currentItem.image) {
                    macro.rssCurrentImage = currentItem.image;
                    keyEl.style.backgroundImage = `url(${currentItem.image})`;
                    keyEl.style.backgroundSize = 'cover';
                    keyEl.style.backgroundPosition = 'center';
                    keyEl.style.backgroundRepeat = 'no-repeat';
                } else if (keyEl) {
                    keyEl.style.backgroundImage = '';
                }
            }
        }
    }, updateInterval * 1000);
}

window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    if (widgetUpdateInterval) {
        clearInterval(widgetUpdateInterval);
    }
    if (window.systemStatsInterval) {
        clearInterval(window.systemStatsInterval);
    }
    if (window.libraryModalInterval) {
        clearInterval(window.libraryModalInterval);
    }
    // Clear all RSS update intervals
    Object.values(rssUpdateIntervals).forEach(interval => {
        clearInterval(interval);
    });
});

// --- RSS Config Functions ---

function openRssConfigModal(macro) {
    activeMacroId = macro ? macro.id : null;

    const feedsInput = document.getElementById('rss-feeds-input');
    const intervalInput = document.getElementById('rss-update-interval');

    if (macro && macro.config) {
        if (macro.config.feedUrls) {
            feedsInput.value = Array.isArray(macro.config.feedUrls) ? macro.config.feedUrls.join('\n') : macro.config.feedUrls;
        } else {
            feedsInput.value = '';
        }

        intervalInput.value = macro.config.updateInterval || 5;
        const sizeSelect = document.getElementById('rss-size');
        if (sizeSelect) sizeSelect.value = macro.size || 1;
    } else {
        feedsInput.value = '';
        intervalInput.value = 5;
        const sizeSelect = document.getElementById('rss-size');
        if (sizeSelect) sizeSelect.value = 1;
    }

    const backdrop = document.getElementById('rss-config-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'flex';
    }
}

function closeRssConfigModal() {
    const backdrop = document.getElementById('rss-config-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'none';
    }
    activeMacroId = null;
}

async function saveRssConfig() {
    const feedsInput = document.getElementById('rss-feeds-input');
    const intervalInput = document.getElementById('rss-update-interval');

    if (!feedsInput || !intervalInput) return;

    const feedUrls = feedsInput.value.split('\n').filter(url => url.trim());
    const updateInterval = parseInt(intervalInput.value) || 5;
    const size = parseInt(document.getElementById('rss-size').value) || 1;

    if (feedUrls.length === 0) {
        alert('Please enter at least one RSS feed URL');
        return;
    }

    let targetSlot = -1;
    let newMacro = null;

    if (activeMacroId) {
        // Updating existing macro
        const idx = macros.findIndex(m => m && m.id === activeMacroId);
        if (idx >= 0) {
            targetSlot = idx;
            // Get existing macro to preserve other props if needed
            const existing = macros[idx];
            newMacro = {
                ...existing,
                size,
                config: {
                    ...existing.config,
                    widgetType: 'rss',
                    feedUrls,
                    updateInterval
                }
            };
        }
    } else {
        // Creating new macro
        // Find first available slot across all pages
        targetSlot = findFirstAvailableSlot(0);

        if (targetSlot === -1) {
            alert('Deck is full! Remove a macro first or add more pages in settings.');
            return;
        }

        // Switch to the page where the macro is being added
        const targetPage = Math.floor(targetSlot / SLOTS_PER_PAGE);
        if (targetPage !== currentPage) {
            currentPage = targetPage;
        }

        const id = 'macro-' + Date.now();
        newMacro = {
            id,
            label: 'RSS Feed',
            type: 'library',
            size,
            config: {
                widgetType: 'rss',
                feedUrls: feedUrls,
                updateInterval: updateInterval
            },
            iconData: null,
            rssItems: [],
            rssCurrentIndex: 0,
            rssCurrentImage: null
        };
    }

    if (targetSlot !== -1 && newMacro) {
        macros[targetSlot] = newMacro;

        // Fetch RSS feeds immediately
        try {
            const items = await fetchRssFeeds(feedUrls);
            newMacro.rssItems = items;
            if (items.length > 0) {
                newMacro.rssCurrentIndex = 0;
                const firstItem = items[0];
                if (firstItem.image) {
                    newMacro.rssCurrentImage = firstItem.image;
                }
            }
        } catch (error) {
            console.error('Error fetching RSS feeds:', error);
        }

        saveMacrosAndSettings();
        renderDeckGrid();
        closeRssConfigModal();

        // Restart updates for this macro
        startRssUpdates(newMacro);
    }
}

// --- Crypto Config Functions ---

function openCryptoConfigModal(macro) {
    activeMacroId = macro ? macro.id : null;

    const apiKeyInput = document.getElementById('crypto-api-key');
    const symbolInput = document.getElementById('crypto-symbol');

    if (macro && macro.config) {
        apiKeyInput.value = macro.config.apiKey || '';
        symbolInput.value = macro.config.symbol || '';
        const sizeSelect = document.getElementById('crypto-size');
        if (sizeSelect) sizeSelect.value = macro.size || 1;
    } else {
        apiKeyInput.value = '';
        symbolInput.value = '';
        const sizeSelect = document.getElementById('crypto-size');
        if (sizeSelect) sizeSelect.value = 1;
    }

    const backdrop = document.getElementById('crypto-config-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'flex';
    }
}

function closeCryptoConfigModal() {
    const backdrop = document.getElementById('crypto-config-modal-backdrop');
    if (backdrop) {
        backdrop.style.display = 'none';
    }
}

async function saveCryptoConfig() {
    const apiKeyInput = document.getElementById('crypto-api-key');
    const symbolInput = document.getElementById('crypto-symbol');

    if (!apiKeyInput || !symbolInput) return;

    const apiKey = apiKeyInput.value.trim();
    const symbol = symbolInput.value.trim().toUpperCase();
    const size = parseInt(document.getElementById('crypto-size').value) || 1;

    if (!apiKey || !symbol) {
        alert('Please enter both API Key and Asset Symbol');
        return;
    }

    let targetSlot = -1;
    let newMacro = null;

    if (activeMacroId) {
        // Updating existing macro
        const idx = macros.findIndex(m => m && m.id === activeMacroId);
        if (idx >= 0) {
            targetSlot = idx;
            // Get existing macro to preserve other props if needed
            const existing = macros[idx];
            newMacro = {
                ...existing,
                size,
                config: {
                    ...existing.config,
                    widgetType: 'crypto',
                    apiKey,
                    symbol
                }
            };
            // Reset cache so we fetch new data immediately
            delete existing.cryptoData;
            delete existing.lastCryptoUpdate;
        }
    } else {
        // Creating new macro
        // Find first available slot across all pages
        targetSlot = findFirstAvailableSlot(0);

        if (targetSlot === -1) {
            alert('Deck is full! Remove a macro first or add more pages in settings.');
            return;
        }

        // Switch to the page where the macro is being added
        const targetPage = Math.floor(targetSlot / SLOTS_PER_PAGE);
        if (targetPage !== currentPage) {
            currentPage = targetPage;
        }

        const id = 'macro-' + Date.now();
        newMacro = {
            id,
            label: 'Cryptoticker',
            type: 'library',
            size,
            config: {
                widgetType: 'crypto',
                apiKey: apiKey,
                symbol: symbol
            },
            iconData: null
        };
    }

    if (targetSlot !== -1 && newMacro) {
        macros[targetSlot] = newMacro;

        saveMacrosAndSettings();
        renderDeckGrid();
        closeCryptoConfigModal();
    }
}

// --- Central Edit Logic ---

function editMacro(macro) {
    if (!macro) return;

    // Switch to the page where this macro is located
    const macroIndex = macros.findIndex(m => m && m.id === macro.id);
    if (macroIndex >= 0) {
        const macroPage = Math.floor(macroIndex / SLOTS_PER_PAGE);
        if (macroPage !== currentPage) {
            currentPage = macroPage;
        }
    }

    if (macro.type === 'library') {
        if (macro.config && macro.config.widgetType === 'rss') {
            openRssConfigModal(macro);
        } else if (macro.config && macro.config.widgetType === 'crypto') {
            openCryptoConfigModal(macro);
        } else {
            // Other library widgets use the standard modal (restricted view)
            openMacroModal(macro);
        }
    } else {
        // Standard macro editing
        openMacroModal(macro);
    }
}

