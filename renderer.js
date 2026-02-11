// Renderer process script
let updateInterval = null;
let isPlaying = false;
let macros = [];
let settings = { theme: 'default' };
let editMode = false;
let activeMacroId = null;

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
}

// --- Macros + settings ---
async function loadMacrosAndSettings() {
    try {
        const data = await window.electronAPI.getMacrosAndSettings();
        settings = data.settings || { theme: 'default' };
        macros = Array.isArray(data.macros) ? data.macros : [];
        applyTheme(settings.theme || 'default', false);
        renderDeckGrid();
        activateThemeChips();
    } catch (error) {
        console.error('Error loading macros/settings:', error);
    }
}

function saveMacrosAndSettings() {
    window.electronAPI.saveMacrosAndSettings({
        settings,
        macros,
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
    grid.innerHTML = '';

    const totalSlots = 12; // 4 x 3 grid
    const filled = Math.min(macros.length, totalSlots);

    for (let i = 0; i < totalSlots; i++) {
        const macro = macros[i];
        const key = document.createElement('div');
        key.classList.add('deck-key');

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
                
                widgetContent.appendChild(widgetIcon);
                widgetContent.appendChild(widgetLabel);
                widgetContent.appendChild(widgetValue);
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
                key.dataset.macroIndex = i;
                
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

                    // Check if this is a library widget being dragged from the library modal
                    const libraryData = e.dataTransfer.getData('application/json');
                    if (libraryData) {
                        try {
                            const data = JSON.parse(libraryData);
                            if (data.type === 'library' && data.widgetType) {
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
                    
                    // Regular macro reordering
                    const sourceIndexStr = e.dataTransfer.getData('text/plain');
                    if (!sourceIndexStr) return false;
                    
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
                    
                    // Remove from source
                    macros.splice(sourceIndex, 1);
                    
                    // Insert at target (adjust index if source was before target)
                    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
                    macros.splice(insertIndex, 0, macroToMove);
                    
                    // Ensure array doesn't exceed 12 slots
                    if (macros.length > 12) {
                        macros = macros.slice(0, 12);
                    }
                    
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
                    openMacroModal(macro);
                } else {
                    // Widgets don't execute, they just display
                    if (macro.type !== 'library') {
                        executeMacro(macro);
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
                
                // Check if this is a library widget being dragged from library modal
                const libraryData = e.dataTransfer.getData('application/json');
                if (libraryData) {
                    try {
                        const data = JSON.parse(libraryData);
                        if (data.type === 'library' && data.widgetType) {
                            // Add widget to this empty slot
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
                
                // Regular macro move to empty slot (only in edit mode)
                if (!editMode) return false;
                
                const sourceIndexStr = e.dataTransfer.getData('text/plain');
                if (!sourceIndexStr) return false;
                
                const sourceIndex = parseInt(sourceIndexStr);
                const targetIndex = i;
                
                console.log('Drop to empty slot:', { sourceIndex, targetIndex, macrosLength: macros.length });
                
                if (isNaN(sourceIndex) || isNaN(targetIndex)) {
                    console.error('Invalid indices:', { sourceIndex, targetIndex });
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
                
                // Remove from source
                macros.splice(sourceIndex, 1);
                
                // Insert at target
                macros.splice(targetIndex, 0, macroToMove);
                
                // Ensure array doesn't exceed 12 slots
                if (macros.length > 12) {
                    macros = macros.slice(0, 12);
                }
                
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
    const keysInput = document.getElementById('macro-keys');
    const urlInput = document.getElementById('macro-url');
    const appPathInput = document.getElementById('macro-app-path');
    const appArgsInput = document.getElementById('macro-app-args');
    const iconInput = document.getElementById('macro-icon');

    if (!labelInput || !typeSelect || !keysInput || !urlInput || !appPathInput || !appArgsInput || !iconInput) {
        console.error('One or more macro modal form elements are missing', {
            labelInput: !!labelInput,
            typeSelect: !!typeSelect,
            keysInput: !!keysInput,
            urlInput: !!urlInput,
            appPathInput: !!appPathInput,
            appArgsInput: !!appArgsInput,
            iconInput: !!iconInput,
        });
        return;
    }

    labelInput.value = macro?.label || '';
    const type = macro?.type || 'keyboard';
    typeSelect.value = type;
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

    if (keyboardRow) keyboardRow.style.display = type === 'keyboard' ? '' : 'none';
    if (websiteRow) websiteRow.style.display = type === 'website' ? '' : 'none';
    if (appRow) appRow.style.display = type === 'app' ? '' : 'none';
}

async function saveMacroFromModal() {
    console.log('saveMacroFromModal called');
    const label = document.getElementById('macro-label').value.trim() || 'Macro';
    const type = document.getElementById('macro-type').value;
    console.log('Saving macro:', { label, type, activeMacroId });

    const config = {};
    if (type === 'keyboard') {
        config.keys = document.getElementById('macro-keys').value.trim();
    } else if (type === 'website') {
        config.url = document.getElementById('macro-url').value.trim();
    } else if (type === 'app') {
        config.path = document.getElementById('macro-app-path').value.trim();
        config.args = document.getElementById('macro-app-args').value.trim();
    }

    // Handle icon upload - use cropped version if available, otherwise use file
    let iconData = null;
    if (currentCropImage) {
        iconData = currentCropImage;
    } else {
        const iconInput = document.getElementById('macro-icon');
        if (iconInput.files && iconInput.files[0]) {
            iconData = await readFileAsDataURL(iconInput.files[0]);
        }
    }

    if (activeMacroId) {
        const idx = macros.findIndex((m) => m.id === activeMacroId);
        if (idx >= 0) {
            macros[idx] = {
                ...macros[idx],
                label,
                type,
                config,
                iconData: iconData || macros[idx].iconData,
            };
        }
    } else {
        const id = 'macro-' + Date.now();
        macros.push({
            id,
            label,
            type,
            config,
            iconData,
        });
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
                openMacroModal(macro);
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
                const idx = macros.findIndex((m) => m.id === macroId);
                if (idx >= 0) {
                    macros.splice(idx, 1);
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
        clock: '🕐'
    };
    return icons[widgetType] || '📊';
}

function getWidgetLabel(widgetType) {
    const labels = {
        cpu: 'CPU',
        memory: 'Memory',
        disk: 'Disk',
        bandwidth: 'Network',
        clock: 'Clock'
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
    macros.forEach(macro => {
        if (macro.type === 'library') {
            const widgetValueEl = document.getElementById(`widget-value-${macro.id}`);
            if (!widgetValueEl) return;
            
            const widgetType = macro.config?.widgetType || 'cpu';
            let displayValue = '';
            
            switch (widgetType) {
                case 'cpu':
                    if (systemStats) {
                        displayValue = `${Math.round(systemStats.cpu)}%`;
                    }
                    break;
                case 'memory':
                    if (systemStats) {
                        displayValue = `${Math.round(systemStats.memory.percentage)}%`;
                    }
                    break;
                case 'disk':
                    if (systemStats) {
                        displayValue = `${Math.round(systemStats.disk.percentage)}%`;
                    }
                    break;
                case 'bandwidth':
                    if (systemStats) {
                        const downSpeed = systemStats.network.downloadSpeed || 0;
                        const upSpeed = systemStats.network.uploadSpeed || 0;
                        displayValue = `↓${formatSpeed(downSpeed)} ↑${formatSpeed(upSpeed)}`;
                    }
                    break;
                case 'clock':
                    const now = new Date();
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const seconds = String(now.getSeconds()).padStart(2, '0');
                    displayValue = `${hours}:${minutes}:${seconds}`;
                    break;
            }
            
            widgetValueEl.textContent = displayValue;
        }
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

function startWidgetUpdates() {
    // Check if there are any library widgets
    const hasWidgets = macros.some(m => m.type === 'library');
    if (!hasWidgets) return;
    
    // Initial update
    updateWidgets();
    
    // Fetch system stats if there are system monitoring widgets
    const hasSystemWidgets = macros.some(m => 
        m.type === 'library' && 
        ['cpu', 'memory', 'disk', 'bandwidth'].includes(m.config?.widgetType)
    );
    
    if (hasSystemWidgets) {
        fetchSystemStats();
        // Fetch system stats every 2 seconds (only create one interval)
        if (window.systemStatsInterval) {
            clearInterval(window.systemStatsInterval);
        }
        window.systemStatsInterval = setInterval(fetchSystemStats, 2000);
    }
    
    // Update all widgets every second (clock needs this)
    if (widgetUpdateInterval) {
        clearInterval(widgetUpdateInterval);
    }
    widgetUpdateInterval = setInterval(() => {
        updateWidgets();
    }, 1000);
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
        
        // Click to add
        preview.addEventListener('click', () => {
            addWidgetToDeck(widget.type);
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
    // Find first empty slot or add to end
    let targetIndex = macros.length;
    for (let i = 0; i < 12; i++) {
        if (!macros[i]) {
            targetIndex = i;
            break;
        }
    }
    
    if (targetIndex >= 12) {
        alert('Deck is full! Remove a macro first.');
        return;
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
});

