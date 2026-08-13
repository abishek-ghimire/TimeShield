class OptionsManager {
    constructor() {
        this.settings = {};
        this.focusBlockedSites = [];
        this.scheduledBlockedSites = [];
        this.screenTimeRefDate = new Date();
        this.syncStatus = { state: 'offline', lastSynced: null, email: null, error: null };
        this.siteCategories = this.getDefaultSiteCategories();
        this.customCategories = [];
        this.activeCategoryKey = null;

        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.populateForm();
        await this.refreshSyncStatus();
        this.startSyncStatusPolling();
        // Update badges after form is populated to ensure correct initial state
        this.updateAccordionBadges();
    }

    async loadData() {
        const result = await chrome.storage.local.get([
            'settings', 'focusBlockedSites',
            'scheduledBlocking', 'timeLimits', 'timeLimitsEnabled', 'filterLists', 'customFilters', 'globalLimit', 'sleepBlocking', 'whitelist',
            'firebaseUser', 'customFirebaseConfig', 'syncStatus', 'siteCategories', 'customCategories'
        ]);

        this.settings = result.settings || this.getDefaultSettings();
        this.focusBlockedSites = result.focusBlockedSites || [];
        this.scheduledBlockedSites = result.scheduledBlockedSites || this.getDefaultBlockedSites();
        this.scheduledBlocking = result.scheduledBlocking || this.getDefaultScheduledBlocking();
        this.timeLimits = result.timeLimits || [];
        this.timeLimitsEnabled = result.timeLimitsEnabled || false;
        this.filterLists = result.filterLists || this.getDefaultFilterLists();
        this.customFilters = result.customFilters || [];
        this.globalLimit = result.globalLimit || { enabled: false, minutes: 60, domains: [] };
        this.adBlockStats = result.adBlockStats || { adsBlocked: 0, bandwidthSaved: 0, timeSaved: 0 };
        this.sleepBlocking = result.sleepBlocking || this.getDefaultSleepBlocking();
        this.whitelist = result.whitelist || [];
        this.firebaseUser = result.firebaseUser || null;
        this.customFirebaseConfig = result.customFirebaseConfig || null;
        this.syncStatus = result.syncStatus || this.syncStatus;
        this.siteCategories = result.siteCategories || this.getDefaultSiteCategories();
        this.customCategories = result.customCategories || [];
    }

    setupEventListeners() {
        this.setupTabSwitching();
        this.setupFormListeners();
        this.setupSiteManagement();
        this.setupDataManagement();
        this.setupThemeListener();
        this.setupFooterInteractions();
        this.setupAdBlockListeners(); // NEW
        this.setupEnhancedInteractions();
        this.setupScreenTimeListeners(); // NEW
        this.setupSyncListeners();
        this.setupAccordion(); // Schedules & Limits collapsible panels
    }

    setupFooterInteractions() {
        // Report bug link
        document.getElementById('reportBug').addEventListener('click', (e) => {
            e.preventDefault();
            this.showNotification('Opening GitHub issues to report a bug...', 'success');
            setTimeout(() => {
                window.open('https://github.com/abishekgh-6/FloatingClockExtension/issues/new', '_blank');
            }, 1000);
        });

        // Request feature link
        document.getElementById('requestFeature').addEventListener('click', (e) => {
            e.preventDefault();
            this.showNotification('Opening GitHub issues to request a feature...', 'success');
            setTimeout(() => {
                window.open('https://github.com/abishekgh-6/FloatingClockExtension/issues/new?template=feature_request.md', '_blank');
            }, 1000);
        });
    }

    setupEnhancedInteractions() {
        // Add ripple effect to buttons
        document.querySelectorAll('.btn').forEach(button => {
            button.addEventListener('click', function (e) {
                const ripple = document.createElement('span');
                ripple.classList.add('ripple');
                this.appendChild(ripple);

                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;

                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = x + 'px';
                ripple.style.top = y + 'px';

                setTimeout(() => ripple.remove(), 600);
            });
        });

        // Add loading states to save buttons
        document.getElementById('saveSettings').addEventListener('click', async () => {
            const button = document.getElementById('saveSettings');
            button.classList.add('loading');
            button.textContent = 'Saving...';

            try {
                await this.saveSettings();
                this.showNotification('Settings saved successfully!', 'success');
            } catch (error) {
                this.showNotification('Error saving settings', 'error');
            } finally {
                button.classList.remove('loading');
                button.textContent = 'Save Settings';
            }
        });

        // Add confirmation for reset
        document.getElementById('resetToDefaults').addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all settings to defaults? This action cannot be undone.')) {
                this.resetToDefaults();
            }
        });

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S to save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                document.getElementById('saveSettings').click();
            }

            // Ctrl/Cmd + R to reset
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                document.getElementById('resetToDefaults').click();
            }
        });

        // Add smooth scrolling (guard against bare '#' hrefs which are invalid selectors)
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (!href || href === '#') return; // skip bare '#' links
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }

    // (duplicate removed — real setupFormListeners() is defined below)

    setupThemeListener() {
        const themeSelect = document.getElementById('theme');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.settings.theme = e.target.value;
                this.saveSettings();
                this.applyTheme();
            });
        }
    }

    setupTabSwitching() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const targetContent = document.getElementById(targetTab);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                console.log('Switched to tab:', targetTab); // Debug log
            });
        });

        const hashTarget = (window.location.hash || '').replace('#', '').toLowerCase();
        const validHash = hashTarget && document.getElementById(hashTarget);

        if (validHash) {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            const matchTab = Array.from(tabs).find(t => t.dataset.tab === hashTarget);
            if (matchTab) matchTab.classList.add('active');
            validHash.classList.add('active');
            return;
        }

        // Set first tab as active by default
        if (tabs.length > 0 && tabContents.length > 0) {
            tabs[0].classList.add('active');
            tabContents[0].classList.add('active');
        }
    }

    setupFormListeners() {
        const rangeInputs = document.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const valueDisplay = document.getElementById(e.target.id + 'Value');
                if (valueDisplay) {
                    valueDisplay.textContent = e.target.value + '%';
                }
            });
        });

        // Auto-save on change for immediate feedback
        document.querySelectorAll('input, select').forEach(element => {
            if (element.id && !['saveSettings', 'resetToDefaults', 'importFile', 'newBlockedSite', 'limitSite', 'limitMinutes', 'newFocusSite', 'newScheduledSite', 'newGlobalLimitSite', 'sleepWhitelistSite'].includes(element.id)) {
                element.addEventListener('change', () => {
                    this.saveSettings();
                });
            }
        });

        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetToDefaults').addEventListener('click', () => this.resetToDefaults());
    }

    setupSiteManagement() {
        const addCategorySiteBtn = document.getElementById('add-category-site-btn');
        const categorySiteInput = document.getElementById('category-site-input');

        if (addCategorySiteBtn) {
            addCategorySiteBtn.addEventListener('click', () => this.addCategorySite());
        }

        if (categorySiteInput) {
            categorySiteInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addCategorySite();
                }
            });
        }

        document.getElementById('addFocusSite').addEventListener('click', () => this.addFocusSite());
        document.getElementById('addScheduledSite').addEventListener('click', () => this.addScheduledSite());
        document.getElementById('addCategoryToFocus').addEventListener('click', () => this.applyCategoryToList('focus'));
        document.getElementById('addCategoryToSchedule').addEventListener('click', () => this.applyCategoryToList('schedule'));

        // Scheduled blocking toggle
        document.getElementById('scheduledBlocking').addEventListener('change', (e) => {
            this.toggleScheduledBlocking(e.target.value);
        });

        document.getElementById('blockingStartTime').addEventListener('change', () => this.saveScheduledBlocking());
        document.getElementById('blockingEndTime').addEventListener('change', () => this.saveScheduledBlocking());
        document.getElementById('scheduleSelectAllDays').addEventListener('change', (e) => {
            this.setDayGroupChecked(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], e.target.checked);
            this.saveScheduledBlocking();
        });

        // Day checkboxes
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
            document.getElementById(day).addEventListener('change', () => {
                this.updateSelectAllState('scheduleSelectAllDays', ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
                this.saveScheduledBlocking();
            });
        });

        // Sleep blocking
        document.getElementById('sleepBlocking').addEventListener('change', (e) => {
            this.toggleSleepBlocking(e.target.value);
        });

        document.getElementById('sleepStartTime').addEventListener('change', () => this.saveSleepBlocking());
        document.getElementById('sleepEndTime').addEventListener('change', () => this.saveSleepBlocking());
        document.getElementById('sleepSelectAllDays').addEventListener('change', (e) => {
            this.setDayGroupChecked(['sleepSunday', 'sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday'], e.target.checked);
            this.saveSleepBlocking();
        });

        // Sleep blocking day checkboxes
        ['sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday', 'sleepSunday'].forEach(day => {
            document.getElementById(day).addEventListener('change', () => {
                this.updateSelectAllState('sleepSelectAllDays', ['sleepSunday', 'sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday']);
                this.saveSleepBlocking();
            });
        });

        document.getElementById('sleepBlockAll').addEventListener('change', () => this.saveSleepBlocking());

        // Sleep whitelist
        document.getElementById('addSleepWhitelist').addEventListener('click', () => this.addSleepWhitelist());

        // Time limits
        document.getElementById('timeLimits').addEventListener('change', (e) => {
            this.toggleTimeLimits(e.target.value);
        });

        document.getElementById('addTimeLimit').addEventListener('click', () => this.addTimeLimit());

        document.getElementById('newFocusSite').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addFocusSite();
        });

        document.getElementById('newScheduledSite').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addScheduledSite();
        });

        // Global limits
        document.getElementById('globalLimitEnabled').addEventListener('change', (e) => this.toggleGlobalLimit(e.target.value));
        document.getElementById('globalLimitMinutes').addEventListener('change', () => this.saveGlobalLimit());
        document.getElementById('addGlobalLimitSite').addEventListener('click', () => this.addGlobalLimitSite());

        document.getElementById('newGlobalLimitSite').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addGlobalLimitSite();
        });
    }

    setupDataManagement() {
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('importData').addEventListener('click', () => this.importData());
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
        document.getElementById('clearAllData').addEventListener('click', () => this.clearAllData());
    }



    populateForm() {
        const formElements = document.querySelectorAll('input, select');
        formElements.forEach(element => {
            if (this.settings.hasOwnProperty(element.id)) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[element.id];
                } else if (element.type === 'range' || element.type === 'number') {
                    element.value = this.settings[element.id];
                } else {
                    element.value = this.settings[element.id];
                }
            }
        });

        this.updateSiteLists();
        this.populateScheduledBlocking();
        this.populateSleepBlocking();
        this.populateTimeLimits();
        this.populateGlobalLimit(); // NEW
        this.populateAdBlockSettings(); // NEW
        this.populateSyncSettings();
        this.populateSiteCategories();
        this.updateRangeDisplays();
        this.applyTheme();
    }

    getDefaultSiteCategories() {
        return {
            socialMedia: [
                'facebook.com',
                'instagram.com',
                'x.com',
                'twitter.com',
                'tiktok.com',
                'reddit.com',
                'snapchat.com',
                'linkedin.com',
                'pinterest.com',
                'threads.net',
                'discord.com',
                'youtube.com'
            ],
            entertainment: ['netflix.com', 'hulu.com', 'primevideo.com', 'disneyplus.com', 'hbomax.com', 'twitch.tv'],
            movies: ['imdb.com', 'rottentomatoes.com', 'letterboxd.com', 'fandango.com'],
            gaming: ['steamcommunity.com', 'store.steampowered.com', 'epicgames.com', 'roblox.com', 'minecraft.net', 'twitch.tv'],
            shopping: ['amazon.com', 'ebay.com', 'walmart.com', 'etsy.com', 'aliexpress.com'],
            news: ['news.google.com', 'cnn.com', 'bbc.com', 'nytimes.com', 'foxnews.com', 'reuters.com'],
            adult: ['pornhub.com', 'xvideos.com', 'xhamster.com', 'onlyfans.com']
        };
    }

    getAllCategoryEntries() {
        const presets = Object.entries(this.siteCategories || {}).map(([key, sites]) => ({
            value: `preset:${key}`,
            label: key,
            sites
        }));

        const customs = (this.customCategories || []).map((category, index) => ({
            value: `custom:${index}`,
            label: category.name,
            sites: category.sites || []
        }));

        return [...presets, ...customs];
    }

    populateSiteCategories() {
        const focusSelect = document.getElementById('categoryPreset');
        const scheduleSelect = document.getElementById('scheduleCategoryPreset');
        const customList = document.getElementById('customCategoriesList');
        const categoryTabs = document.getElementById('categoryTabs');
        const categorySitesList = document.getElementById('categorySitesList');
        const categorySiteInput = document.getElementById('category-site-input');
        const addCategorySiteBtn = document.getElementById('add-category-site-btn');
        
        const entries = this.getAllCategoryEntries();

        if (!this.activeCategoryKey || !entries.some(entry => entry.value === this.activeCategoryKey)) {
            this.activeCategoryKey = entries.length ? entries[0].value : null;
        }
        
        [focusSelect, scheduleSelect].forEach(select => {
            if (!select) return;
            select.innerHTML = '';
            entries.forEach((entry, index) => {
                const option = document.createElement('option');
                option.value = entry.value;
                option.textContent = entry.label;
                if (index === 0) option.selected = true;
                select.appendChild(option);
            });
        });

        if (categoryTabs) {
            categoryTabs.innerHTML = '';
            entries.forEach(entry => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = `category-tab${entry.value === this.activeCategoryKey ? ' active' : ''}`;
                tab.textContent = entry.label;
                tab.dataset.categoryKey = entry.value;
                tab.addEventListener('click', () => this.setActiveCategory(entry.value));
                categoryTabs.appendChild(tab);
            });
        }

        if (categorySitesList) {
            categorySitesList.innerHTML = '';
            const activeEntry = entries.find(entry => entry.value === this.activeCategoryKey);

            if (!activeEntry) {
                categorySitesList.innerHTML = '<p class="category-empty">No categories available.</p>';
                if (categorySiteInput) categorySiteInput.disabled = true;
                if (addCategorySiteBtn) addCategorySiteBtn.disabled = true;
            } else {
                if (categorySiteInput) {
                    categorySiteInput.disabled = false;
                    categorySiteInput.placeholder = `Enter domain for ${activeEntry.label}...`;
                }
                if (addCategorySiteBtn) {
                    addCategorySiteBtn.disabled = false;
                    addCategorySiteBtn.textContent = `Add Site to ${activeEntry.label}`;
                }

                const sites = this.normalizeCategorySites(activeEntry.sites);
                if (!sites.length) {
                    categorySitesList.innerHTML = '<p class="category-empty">No sites added to this category yet.</p>';
                } else {
                    sites.forEach(site => {
                        const tag = document.createElement('span');
                        tag.className = 'category-tag';
                        tag.innerHTML = `
                            <span>${site}</span>
                            <button type="button" class="category-tag-remove" aria-label="Remove ${site}">X</button>
                        `;

                        tag.querySelector('.category-tag-remove').addEventListener('click', () => {
                            this.removeCategorySite(site);
                        });

                        categorySitesList.appendChild(tag);
                    });
                }
            }
        }

        if (customList) {
            customList.innerHTML = '';
            if (!this.customCategories.length) {
                customList.innerHTML = '<p class="hint">No custom categories yet.</p>';
                return;
            }

            this.customCategories.forEach((category, index) => {
                const item = document.createElement('div');
                item.className = 'site-item';
                item.innerHTML = `
                    <span class="site-url">${category.name}</span>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span class="site-url">${(category.sites || []).length} sites</span>
                        <button class="remove-site" data-index="${index}" data-type="custom-category">Remove</button>
                    </div>
                `;
                item.querySelector('.remove-site').addEventListener('click', (e) => {
                    this.removeCustomCategory(Number(e.target.dataset.index));
                });
                customList.appendChild(item);
            });
        }
    }

    normalizeCategorySites(sites) {
        return [...new Set((sites || []).map(site => site.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean))];
    }

    setActiveCategory(categoryKey) {
        this.activeCategoryKey = categoryKey;
        this.populateSiteCategories();
    }

    async addCategorySite() {
        const input = document.getElementById('category-site-input');
        const site = this.normalizeCategorySites([input?.value || ''])[0];

        if (!site) {
            this.showNotification('Enter a valid domain first.', 'warning');
            return;
        }

        const selected = this.getAllCategoryEntries().find(entry => entry.value === this.activeCategoryKey);
        if (!selected) {
            this.showNotification('Select a category first.', 'warning');
            return;
        }

        if (selected.value.startsWith('preset:')) {
            const key = selected.value.split(':')[1];
            const currentSites = this.normalizeCategorySites(this.siteCategories[key] || []);
            this.siteCategories[key] = [...new Set([...currentSites, site])];
            await chrome.storage.local.set({ siteCategories: this.siteCategories });
        } else {
            const index = Number(selected.value.split(':')[1]);
            const category = this.customCategories[index];

            if (!category) {
                this.showNotification('Selected category is no longer available.', 'warning');
                return;
            }

            category.sites = [...new Set([...this.normalizeCategorySites(category.sites || []), site])];
            await chrome.storage.local.set({ customCategories: this.customCategories });
        }

        if (input) input.value = '';
        this.populateSiteCategories();
        this.showNotification(`Added ${site} to ${selected.label}.`, 'success');
    }

    async removeCategorySite(site) {
        const selected = this.getAllCategoryEntries().find(entry => entry.value === this.activeCategoryKey);
        if (!selected) {
            this.showNotification('Select a category first.', 'warning');
            return;
        }

        if (selected.value.startsWith('preset:')) {
            const key = selected.value.split(':')[1];
            this.siteCategories[key] = this.normalizeCategorySites(this.siteCategories[key] || []).filter(existing => existing !== site);
            await chrome.storage.local.set({ siteCategories: this.siteCategories });
        } else {
            const index = Number(selected.value.split(':')[1]);
            const category = this.customCategories[index];

            if (!category) {
                this.showNotification('Selected category is no longer available.', 'warning');
                return;
            }

            category.sites = this.normalizeCategorySites(category.sites || []).filter(existing => existing !== site);
            await chrome.storage.local.set({ customCategories: this.customCategories });
        }

        this.populateSiteCategories();
        this.showNotification(`Removed ${site} from ${selected.label}.`, 'warning');
    }

    async applyCategoryToList(target) {
        const select = document.getElementById('categoryPreset');
        if (!select) return;

        const selected = this.getAllCategoryEntries().find(entry => entry.value === select.value);
        if (!selected) {
            this.showNotification('Select a category first.', 'warning');
            return;
        }

        const sites = this.normalizeCategorySites(selected.sites);
        if (!sites.length) {
            this.showNotification('Selected category has no sites.', 'warning');
            return;
        }

        if (target === 'focus') {
            this.focusBlockedSites = [...new Set([...this.focusBlockedSites, ...sites])];
        } else {
            this.scheduledBlockedSites = [...new Set([...this.scheduledBlockedSites, ...sites])];
        }

        await this.saveSiteLists();
        this.updateSiteLists();
        this.showNotification(`Added ${selected.label} sites to ${target} block list.`, 'success');
    }

    async saveCustomCategory() {
        const nameInput = document.getElementById('customCategoryName');
        const sitesInput = document.getElementById('customCategorySites');
        const name = nameInput?.value.trim();
        const sites = this.normalizeCategorySites((sitesInput?.value || '').split(/[\n,]/));

        if (!name || !sites.length) {
            this.showNotification('Enter a category name and at least one site.', 'warning');
            return;
        }

        const existingIndex = this.customCategories.findIndex(category => category.name.toLowerCase() === name.toLowerCase());
        const category = { name, sites };
        if (existingIndex >= 0) {
            this.customCategories[existingIndex] = category;
        } else {
            this.customCategories.push(category);
        }

        await chrome.storage.local.set({ customCategories: this.customCategories });
        this.populateSiteCategories();
        if (nameInput) nameInput.value = '';
        if (sitesInput) sitesInput.value = '';
        this.showNotification('Custom category saved.', 'success');
    }

    async removeCustomCategory(index) {
        this.customCategories.splice(index, 1);
        await chrome.storage.local.set({ customCategories: this.customCategories });
        this.populateSiteCategories();
        this.showNotification('Custom category removed.', 'warning');
    }

    populateSyncSettings() {
        const apiKeyInput = document.getElementById('firebaseApiKey');
        const projectIdInput = document.getElementById('firebaseProjectId');
        const emailInput = document.getElementById('syncEmail');
        const passwordInput = document.getElementById('syncPassword');

        if (apiKeyInput) apiKeyInput.value = this.customFirebaseConfig?.apiKey || '';
        if (projectIdInput) projectIdInput.value = this.customFirebaseConfig?.projectId || '';
        if (emailInput) emailInput.value = this.firebaseUser?.email || '';
        if (passwordInput) passwordInput.value = '';

        this.renderSyncStatus(this.syncStatus);
    }

    setupSyncListeners() {
        const saveConfigButton = document.getElementById('saveSyncConfig');
        const loginButton = document.getElementById('syncLogin');
        const signUpButton = document.getElementById('syncSignUp');
        const logoutButton = document.getElementById('syncLogout');
        const syncNowButton = document.getElementById('syncNow');

        if (saveConfigButton) {
            saveConfigButton.addEventListener('click', () => this.saveSyncConfig());
        }
        if (loginButton) {
            loginButton.addEventListener('click', () => this.loginToSync());
        }
        if (signUpButton) {
            signUpButton.addEventListener('click', () => this.signUpForSync());
        }
        if (logoutButton) {
            logoutButton.addEventListener('click', () => this.logoutOfSync());
        }
        if (syncNowButton) {
            syncNowButton.addEventListener('click', () => this.syncNow());
        }

        const syncPassword = document.getElementById('syncPassword');
        if (syncPassword) {
            syncPassword.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.loginToSync();
                }
            });
        }
    }

    async refreshSyncStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getSyncStatus' });
            if (response?.syncStatus) {
                this.syncStatus = response.syncStatus;
                this.renderSyncStatus(this.syncStatus);
            }
        } catch (error) {
            this.renderSyncStatus({ state: 'offline', lastSynced: null, error: error.message || 'Sync service unavailable' });
        }
    }

    startSyncStatusPolling() {
        if (this._syncStatusTimer) clearInterval(this._syncStatusTimer);
        this._syncStatusTimer = setInterval(() => this.refreshSyncStatus(), 30000);
    }

    renderSyncStatus(status) {
        const value = document.getElementById('syncStatusValue');
        const lastSynced = document.getElementById('syncLastSyncedValue');

        if (value) {
            const labelMap = {
                syncing: 'Syncing',
                synced: 'Synced',
                offline: 'Offline',
                failed: 'Sync Failed'
            };
            value.textContent = labelMap[status?.state] || 'Offline';
        }

        if (lastSynced) {
            lastSynced.textContent = status?.lastSynced ? new Date(status.lastSynced).toLocaleString() : 'Never';
        }
    }

    async saveSyncConfig() {
        try {
            const apiKey = document.getElementById('firebaseApiKey')?.value.trim();
            const projectId = document.getElementById('firebaseProjectId')?.value.trim();

            if (!apiKey || !projectId) {
                this.showNotification('Enter both Firebase API key and project ID.', 'warning');
                return;
            }

            const response = await chrome.runtime.sendMessage({ action: 'configureFirebase', apiKey, projectId });
            if (response?.success) {
                this.customFirebaseConfig = { apiKey, projectId };
                await chrome.storage.local.set({ customFirebaseConfig: this.customFirebaseConfig });
                this.showNotification('Sync configuration saved.', 'success');
                await this.refreshSyncStatus();
            } else {
                throw new Error(response?.error || 'Failed to save sync configuration');
            }
        } catch (error) {
            this.showNotification(error.message || 'Unable to save sync configuration.', 'error');
        }
    }

    async loginToSync() {
        try {
            const email = document.getElementById('syncEmail')?.value.trim();
            const password = document.getElementById('syncPassword')?.value || '';

            if (!email || !password) {
                this.showNotification('Enter both email and password.', 'warning');
                return;
            }

            const response = await chrome.runtime.sendMessage({ action: 'login', email, password });
            if (response?.success) {
                const stored = await chrome.storage.local.get(['firebaseUser']);
                this.firebaseUser = stored.firebaseUser || null;
                this.showNotification('Signed in and syncing settings.', 'success');
                await this.refreshSyncStatus();
            } else {
                throw new Error(response?.error || 'Login failed');
            }
        } catch (error) {
            this.showNotification(error.message || 'Login failed.', 'error');
        }
    }

    async signUpForSync() {
        try {
            const email = document.getElementById('syncEmail')?.value.trim();
            const password = document.getElementById('syncPassword')?.value || '';

            if (!email || !password) {
                this.showNotification('Enter both email and password.', 'warning');
                return;
            }

            const response = await chrome.runtime.sendMessage({ action: 'signUp', email, password });
            if (response?.success) {
                const stored = await chrome.storage.local.get(['firebaseUser']);
                this.firebaseUser = stored.firebaseUser || null;
                this.showNotification('Account created and synced.', 'success');
                await this.refreshSyncStatus();
            } else {
                throw new Error(response?.error || 'Sign up failed');
            }
        } catch (error) {
            this.showNotification(error.message || 'Sign up failed.', 'error');
        }
    }

    async logoutOfSync() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'logout' });
            if (response?.success) {
                this.firebaseUser = null;
                this.syncStatus = { state: 'offline', lastSynced: this.syncStatus.lastSynced || null, email: null, error: null };
                this.renderSyncStatus(this.syncStatus);
                this.showNotification('Signed out from cloud sync.', 'success');
            } else {
                throw new Error(response?.error || 'Logout failed');
            }
        } catch (error) {
            this.showNotification(error.message || 'Logout failed.', 'error');
        }
    }

    setDayGroupChecked(dayIds, checked) {
        dayIds.forEach((id) => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = checked;
        });
    }

    updateSelectAllState(allCheckboxId, dayIds) {
        const allCheckbox = document.getElementById(allCheckboxId);
        if (!allCheckbox) return;

        allCheckbox.checked = dayIds.every((id) => document.getElementById(id)?.checked);
    }

    // NEW: Global Limits Methods
    populateGlobalLimit() {
        const select = document.getElementById('globalLimitEnabled');
        const settings = document.getElementById('globalLimitSettings');
        const minInput = document.getElementById('globalLimitMinutes');

        select.value = this.globalLimit.enabled ? 'enabled' : 'disabled';
        settings.style.display = this.globalLimit.enabled ? 'block' : 'none';
        minInput.value = this.globalLimit.minutes;

        this.updateGlobalLimitList();
    }

    updateGlobalLimitList() {
        const list = document.getElementById('globalLimitList');
        list.innerHTML = '';
        this.globalLimit.domains.forEach(domain => {
            const item = document.createElement('div');
            item.className = 'site-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = domain;

            const btnContainer = document.createElement('div');

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-danger';
            removeBtn.style.padding = '4px 8px';
            removeBtn.textContent = 'Remove';
            removeBtn.onclick = () => this.removeGlobalLimitSite(domain);

            btnContainer.appendChild(removeBtn);
            item.appendChild(nameSpan);
            item.appendChild(btnContainer);
            list.appendChild(item);
        });
    }

    toggleGlobalLimit(value) {
        this.globalLimit.enabled = (value === 'enabled');
        this.saveGlobalLimit();
        this.populateGlobalLimit();
    }

    addGlobalLimitSite() {
        const input = document.getElementById('newGlobalLimitSite');
        const site = input.value.trim().toLowerCase();
        if (site && !this.globalLimit.domains.includes(site)) {
            this.globalLimit.domains.push(site);
            this.saveGlobalLimit();
            this.populateGlobalLimit();
            input.value = '';
            this.showNotification('Site added to global pool', 'success');
        }
    }

    removeGlobalLimitSite(site) {
        const proceed = this.runProtectionSequence(`Remove ${site} from global shared limit`);
        if (!proceed) {
            return;
        }

        Promise.resolve(proceed).then((ok) => {
            if (!ok) return;
            this.globalLimit.domains = this.globalLimit.domains.filter(d => d !== site);
            this.saveGlobalLimit();
            this.populateGlobalLimit();
            this.showNotification('Site removed from global pool', 'warning');
        });
    }

    async saveGlobalLimit() {
        this.globalLimit.minutes = parseInt(document.getElementById('globalLimitMinutes').value) || 60;
        await chrome.storage.local.set({ globalLimit: this.globalLimit });
    }

    // NEW: Populate Ad Blocker Settings
    populateAdBlockSettings() {
        // Populate filter lists
        Object.entries(this.filterLists).forEach(([key, list]) => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                checkbox.checked = list.enabled;
            }
        });

        // Populate custom filters
        const customFiltersTextarea = document.getElementById('customFilters');
        if (customFiltersTextarea) {
            customFiltersTextarea.value = this.customFilters
                .map(f => f.filter || f)
                .join('\n');
        }

        // Populate whitelist
        const whitelistTextarea = document.getElementById('whitelist');
        if (whitelistTextarea) {
            whitelistTextarea.value = this.whitelist.join('\n');
        }

        // Set blocking level
        const blockingLevelSelect = document.getElementById('blockingLevel');
        if (blockingLevelSelect) {
            blockingLevelSelect.value = this.settings.blockingLevel || 'medium';
        }

        // Show last update time
        chrome.storage.local.get('lastFilterUpdate', (data) => {
            if (data.lastFilterUpdate) {
                const date = new Date(data.lastFilterUpdate);
                const lastUpdateElement = document.getElementById('lastUpdate');
                if (lastUpdateElement) {
                    lastUpdateElement.textContent = `Last updated: ${date.toLocaleString()}`;
                }
            }
        });
    }

    applyTheme() {
        const theme = this.settings.theme || 'solar';
        const body = document.body;

        // Remove all theme classes
        body.classList.remove('dark-theme', 'light-theme', 'solar-theme', 'gradient-theme', 'neon-theme', 'forest-theme');

        // Apply the correct class
        body.classList.add(`${theme}-theme`);

        // Apply to all tab contents too
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            content.classList.remove('dark-theme', 'light-theme', 'solar-theme', 'gradient-theme', 'neon-theme', 'forest-theme');
            content.classList.add(`${theme}-theme`);
        });
    }

    populateScheduledBlocking() {
        const scheduledBlockingSelect = document.getElementById('scheduledBlocking');
        const scheduledSettings = document.getElementById('scheduledBlockingSettings');

        if (this.scheduledBlocking.enabled) {
            scheduledBlockingSelect.value = 'enabled';
            scheduledSettings.style.display = 'block';
        } else {
            scheduledBlockingSelect.value = 'disabled';
            scheduledSettings.style.display = 'none';
        }

        // Populate time inputs
        document.getElementById('blockingStartTime').value = this.scheduledBlocking.startTime || '09:00';
        document.getElementById('blockingEndTime').value = this.scheduledBlocking.endTime || '17:00';

        // Populate day checkboxes
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        days.forEach(day => {
            document.getElementById(day).checked = this.scheduledBlocking.days && this.scheduledBlocking.days.includes(parseInt(day === 'sunday' ? 0 : day === 'monday' ? 1 : day === 'tuesday' ? 2 : day === 'wednesday' ? 3 : day === 'thursday' ? 4 : day === 'friday' ? 5 : 6));
        });
        this.updateSelectAllState('scheduleSelectAllDays', days);
    }

    populateSleepBlocking() {
        const sleepBlockingSelect = document.getElementById('sleepBlocking');
        const sleepSettings = document.getElementById('sleepBlockingSettings');

        if (this.sleepBlocking.enabled) {
            sleepBlockingSelect.value = 'enabled';
            sleepSettings.style.display = 'block';
        } else {
            sleepBlockingSelect.value = 'disabled';
            sleepSettings.style.display = 'none';
        }

        // Populate time inputs
        document.getElementById('sleepStartTime').value = this.sleepBlocking.startTime || '22:00';
        document.getElementById('sleepEndTime').value = this.sleepBlocking.endTime || '06:00';

        // Populate day checkboxes
        const days = ['sleepSunday', 'sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday'];
        days.forEach(day => {
            const dayValue = parseInt(day.replace('sleep', '').replace('sunday', '0').replace('monday', '1').replace('tuesday', '2').replace('wednesday', '3').replace('thursday', '4').replace('friday', '5').replace('saturday', '6'));
            document.getElementById(day).checked = this.sleepBlocking.days && this.sleepBlocking.days.includes(dayValue);
        });
        this.updateSelectAllState('sleepSelectAllDays', days);

        // Populate block all checkbox
        document.getElementById('sleepBlockAll').checked = this.sleepBlocking.blockAll !== false; // Default to true

        // Populate whitelist
        this.populateSleepWhitelist();
    }

    populateTimeLimits() {
        const timeLimitsSelect = document.getElementById('timeLimits');
        const timeLimitsSettings = document.getElementById('timeLimitsSettings');

        timeLimitsSelect.value = this.timeLimitsEnabled ? 'enabled' : 'disabled';
        timeLimitsSettings.style.display = this.timeLimitsEnabled ? 'block' : 'none';

        this.updateTimeLimitsList();
    }

    updateTimeLimitsList() {
        const timeLimitsList = document.getElementById('timeLimitsList');
        timeLimitsList.innerHTML = '';

        this.timeLimits.forEach(limit => {
            const limitItem = document.createElement('div');
            limitItem.className = 'site-item';
            limitItem.innerHTML = `
                <span class="site-url">${limit.site}</span>
                <span class="site-url">${limit.minutes} minutes/day</span>
                <div style="display: flex; gap: 8px;">
                    <button class="edit-site btn-secondary" data-site="${limit.site}" style="padding: 4px 8px; font-size: 11px;">Edit</button>
                    <button class="remove-site" data-site="${limit.site}" data-type="timelimit">Remove</button>
                </div>
            `;

            limitItem.querySelector('.edit-site').addEventListener('click', (e) => {
                this.editTimeLimit(e.target.dataset.site);
            });

            limitItem.querySelector('.remove-site').addEventListener('click', (e) => {
                this.removeTimeLimit(e.target.dataset.site);
            });

            timeLimitsList.appendChild(limitItem);
        });
    }

    updateRangeDisplays() {
        const rangeInputs = document.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            const valueDisplay = document.getElementById(input.id + 'Value');
            if (valueDisplay) {
                valueDisplay.textContent = input.value + '%';
            }
        });
    }

    updateSiteLists() {
        const focusSitesList = document.getElementById('focusSitesList');
        const scheduledSitesList = document.getElementById('scheduledSitesList');

        focusSitesList.innerHTML = '';
        this.focusBlockedSites.forEach(site => {
            const siteItem = this.createSiteItem(site, 'focus');
            focusSitesList.appendChild(siteItem);
        });

        scheduledSitesList.innerHTML = '';
        this.scheduledBlockedSites.forEach(site => {
            const siteItem = this.createSiteItem(site, 'scheduled');
            scheduledSitesList.appendChild(siteItem);
        });
    }

    createSiteItem(site, type) {
        const div = document.createElement('div');
        div.className = 'site-item';
        div.innerHTML = `
            <span class="site-url">${site}</span>
            <button class="remove-site" data-site="${site}" data-type="${type}">Remove</button>
        `;

        div.querySelector('.remove-site').addEventListener('click', (e) => {
            this.removeSite(e.target.dataset.site, e.target.dataset.type);
        });

        return div;
    }

    async addFocusSite() {
        const input = document.getElementById('newFocusSite');
        const site = input.value.trim().toLowerCase();

        if (site && !this.focusBlockedSites.includes(site)) {
            this.focusBlockedSites.push(site);
            await this.saveSiteLists();
            this.updateSiteLists();
            input.value = '';
            this.showNotification('Great move — site added to your focus shield.', 'success');

            // Check if focus mode is active and apply blocking immediately
            const focusState = await chrome.storage.local.get(['focusState']);
            if (focusState.focusState && focusState.focusState.isActive) {
                // Dynamically apply block to all tabs matching this site
                await chrome.runtime.sendMessage({
                    action: 'applyDynamicFocusBlock',
                    site: site
                }).catch(() => {});
            }
        }
    }

    async addScheduledSite() {
        const input = document.getElementById('newScheduledSite');
        const site = input.value.trim().toLowerCase();

        if (site && !this.scheduledBlockedSites.includes(site)) {
            this.scheduledBlockedSites.push(site);
            await this.saveSiteLists();
            this.updateSiteLists();
            input.value = '';
            this.showNotification('Nice — scheduled protection updated.', 'success');
        }
    }

    async removeSite(site, type) {
        if (type === 'focus') {
            const allowed = await this.runProtectionSequence(`Remove ${site} from Focus blocklist`);
            if (!allowed) return;
            this.focusBlockedSites = this.focusBlockedSites.filter(s => s !== site);
        } else if (type === 'scheduled') {
            const allowed = await this.runProtectionSequence(`Remove ${site} from Scheduled blocking`);
            if (!allowed) return;
            this.scheduledBlockedSites = this.scheduledBlockedSites.filter(s => s !== site);
        }

        // Parallel update and refresh
        await Promise.all([
            this.saveSiteLists(),
            this.updateSiteLists()
        ]);

        this.showNotification('Protection relaxed for this site.', 'warning');
    }

    async saveSiteLists() {
        await chrome.storage.local.set({
            focusBlockedSites: this.focusBlockedSites,
            scheduledBlockedSites: this.scheduledBlockedSites,
            whitelist: this.whitelist
        });
        // Trigger immediate check in service worker
        chrome.runtime.sendMessage({ action: 'checkScheduledBlocking' }).catch(() => { });
    }

    async saveSettings() {
        const formElements = document.querySelectorAll('input, select');
        const newSettings = {};

        formElements.forEach(element => {
            if (element.id && element.id !== 'importFile') {
                if (element.type === 'checkbox') {
                    newSettings[element.id] = element.checked;
                } else if (element.type === 'range' || element.type === 'number') {
                    newSettings[element.id] = parseInt(element.value);
                } else {
                    newSettings[element.id] = element.value;
                }
            }
        });

        this.settings = { ...this.settings, ...newSettings };

        // NEW: Save ad blocker specific settings
        await this.saveAdBlockSettings();

        await chrome.storage.local.set({ settings: this.settings });

        this.showNotification('Settings saved successfully!', 'success');
    }

    // NEW: Save Ad Blocker Settings
    async saveAdBlockSettings() {
        // Save filter lists
        Object.entries(this.filterLists).forEach(([key, list]) => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                this.filterLists[key].enabled = checkbox.checked;
            }
        });

        // Save custom filters
        const customFiltersTextarea = document.getElementById('customFilters');
        if (customFiltersTextarea) {
            const customFiltersText = customFiltersTextarea.value;
            this.customFilters = customFiltersText
                .split('\n')
                .filter(line => line.trim())
                .map(line => ({
                    filter: line.trim(),
                    type: line.includes('##') ? 'cosmetic' : 'network'
                }));
        }

        // Save whitelist
        const whitelistTextarea = document.getElementById('whitelist');
        if (whitelistTextarea) {
            this.whitelist = whitelistTextarea.value
                .split('\n')
                .map(s => s.trim())
                .filter(s => s);
        }

        // Save all ad blocker settings
        await chrome.storage.local.set({
            filterLists: this.filterLists,
            customFilters: this.customFilters,
            whitelist: this.whitelist
        });

        // Notify background script to update filters
        try {
            await chrome.runtime.sendMessage({ action: 'settingsUpdated' });
        } catch (error) {
            console.error('Failed to notify background script:', error);
        }
    }

    async resetToDefaults() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            this.settings = this.getDefaultSettings();
            await chrome.storage.local.set({ settings: this.settings });
            this.populateForm();
            this.showNotification('Settings reset to defaults', 'success');
        }
    }

    getDefaultBlockedSites() {
        return [
            'facebook.com',
            'twitter.com',
            'instagram.com',
            'youtube.com',
            'tiktok.com',
            'reddit.com'
        ];
    }

    getDefaultScheduledBlocking() {
        return {
            enabled: false,
            startTime: '09:00',
            endTime: '17:00',
            days: [1, 2, 3, 4, 5] // Monday to Friday
        };
    }

    getDefaultSettings() {
        return {
            theme: 'light',
            timeFormat: '12h',
            clockSize: 'medium',
            clockOpacity: 90,
            clockPosition: 'top-right',
            autoStartClock: false,
            syncAcrossDevices: false,
            focusDuration: 25,
            breakDuration: 5,
            longBreakDuration: 15,
            pomodoroCount: 4,
            soundEnabled: true,
            notificationsEnabled: true,
            breakReminders: true,
            animationSpeed: 'normal',
            showSeconds: true,
            showDate: true,
            showTimezone: true,
            timezone: 'Asia/Kathmandu',
            challengeTextEnabled: true,
            challengeTextValue: 'I choose discipline over distraction, for my dreams are worth more than temporary comfort.',
            challengePinEnabled: false,
            challengePinValue: '1234',
            challengePasswordEnabled: false,
            challengePasswordValue: 'focus',
            challengeDelayEnabled: false,
            challengeDelaySeconds: 8
        };
    }



    async exportData() {
        const result = await chrome.storage.local.get([
            'settings', 'blockedSites', 'whitelist',
            'scheduledBlocking', 'timeLimits'
        ]);

        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `floating-clock-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showNotification('Data exported successfully', 'success');
    }

    async importData() {
        const fileInput = document.getElementById('importFile');
        const file = fileInput.files[0];

        if (!file) {
            this.showNotification('Please select a file to import', 'error');
            return;
        }

        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            // Import all data to storage
            await chrome.storage.local.set(importData);

            await this.loadData();
            this.populateForm();
            this.showNotification('Data imported successfully', 'success');
        } catch (error) {
            this.showNotification('Failed to import data: ' + error.message, 'error');
        }

        fileInput.value = '';
    }



    async resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            await chrome.storage.local.remove(['settings']);
            this.settings = this.getDefaultSettings();
            this.populateForm();
            this.showNotification('Settings reset to defaults', 'success');
        }
    }

    async clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This includes settings, tasks, analytics, and everything else. This action cannot be undone!')) {
            if (confirm('This is your final warning. All data will be permanently deleted. Continue?')) {
                await chrome.storage.local.clear();
                await this.loadData();
                this.populateForm();
                this.showNotification('All data cleared. Extension reset to defaults.', 'success');
            }
        }
    }

    getDefaultScheduledBlocking() {
        return {
            enabled: false,
            startTime: '09:00',
            endTime: '17:00',
            days: [1, 2, 3, 4, 5] // Monday to Friday
        };
    }

    getDefaultSleepBlocking() {
        return {
            enabled: false,
            startTime: '22:00', // 10 PM
            endTime: '06:00', // 6 AM
            days: [1, 2, 3, 4, 5], // Monday to Friday
            blockAll: true, // Block all sites by default
            whitelist: [] // Whitelist for productive sites during sleep time
        };
    }

    async resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            await chrome.storage.local.remove(['settings']);
            this.settings = this.getDefaultSettings();
            this.populateForm();
            this.showNotification('Settings reset to defaults', 'success');
        }
    }

    async toggleTimeLimits(value) {
        const wantsEnable = value === 'enabled';
        if (!wantsEnable) {
            const allowed = await this.runProtectionSequence('Disable Daily Time Limits');
            if (!allowed) {
                document.getElementById('timeLimits').value = 'enabled';
                return;
            }
            this.showNotification('Daily limits disabled. Try a shorter break instead of removing guardrails.', 'warning');
        } else {
            this.showNotification('Daily limits enabled — great discipline setup.', 'success');
        }

        this.timeLimitsEnabled = wantsEnable;
        chrome.storage.local.set({ timeLimitsEnabled: this.timeLimitsEnabled });
        this.populateTimeLimits();
    }

    async toggleScheduledBlocking(value) {
        const wantsEnable = value === 'enabled';
        if (!wantsEnable) {
            const allowed = await this.runProtectionSequence('Disable Scheduled Blocking');
            if (!allowed) {
                document.getElementById('scheduledBlocking').value = 'enabled';
                return;
            }

            this.showNotification('Scheduled blocking disabled. Stay focused!', 'warning');
        } else {
            this.showNotification('Scheduled blocking enabled — protect your focus time!', 'success');
        }

        this.scheduledBlocking.enabled = wantsEnable;
        this.saveScheduledBlocking();
        this.populateScheduledBlocking();

        // Trigger immediate check in background
        chrome.runtime.sendMessage({ action: 'checkScheduledBlocking' }).catch(() => { });
    }

    async toggleSleepBlocking(value) {
        const wantsEnable = value === 'enabled';
        if (!wantsEnable) {
            const allowed = await this.runProtectionSequence('Disable Sleep Time Blocking');
            if (!allowed) {
                document.getElementById('sleepBlocking').value = 'enabled';
                return;
            }

            this.showNotification('Sleep blocking disabled. Remember to maintain healthy sleep habits.', 'warning');
            
            // Explicitly disable blocking when turning off sleep blocking
            await chrome.runtime.sendMessage({ action: 'disableScheduledBlocking' }).catch(() => { });
        } else {
            this.showNotification('Sleep blocking enabled — sweet dreams and better rest!', 'success');
        }

        this.sleepBlocking.enabled = wantsEnable;
        this.saveSleepBlocking();
        this.populateSleepBlocking();

        // Trigger immediate check in background
        chrome.runtime.sendMessage({ action: 'checkScheduledBlocking' }).catch(() => { });
    }

    async saveSleepBlocking() {
        this.sleepBlocking.startTime = document.getElementById('sleepStartTime').value;
        this.sleepBlocking.endTime = document.getElementById('sleepEndTime').value;
        this.sleepBlocking.blockAll = document.getElementById('sleepBlockAll').checked;

        // Get selected days
        const days = [];
        ['sleepSunday', 'sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday'].forEach(day => {
            if (document.getElementById(day).checked) {
                const dayValue = parseInt(day.replace('sleep', '').replace('sunday', '0').replace('monday', '1').replace('tuesday', '2').replace('wednesday', '3').replace('thursday', '4').replace('friday', '5').replace('saturday', '6'));
                days.push(dayValue);
            }
        });
        this.sleepBlocking.days = days;
        this.updateSelectAllState('sleepSelectAllDays', ['sleepSunday', 'sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday']);

        this.scheduledBlocking = {
            enabled: this.sleepBlocking.enabled,
            startTime: this.sleepBlocking.startTime,
            endTime: this.sleepBlocking.endTime,
            days: this.sleepBlocking.days,
            mode: this.sleepBlocking.blockAll ? 'all' : 'specific',
            whitelist: this.sleepBlocking.whitelist || []
        };

        await chrome.storage.local.set({ sleepBlocking: this.sleepBlocking, scheduledBlocking: this.scheduledBlocking });

        // Trigger immediate check in background
        chrome.runtime.sendMessage({ action: 'checkScheduledBlocking' }).catch(() => { });
    }

    addSleepWhitelist() {
        const site = document.getElementById('sleepWhitelistSite').value.trim();

        if (site) {
            // Normalize the domain
            const normalizedSite = site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();

            if (!this.sleepBlocking.whitelist) {
                this.sleepBlocking.whitelist = [];
            }

            // Check if already exists
            if (!this.sleepBlocking.whitelist.includes(normalizedSite)) {
                this.sleepBlocking.whitelist.push(normalizedSite);
                this.saveSleepBlocking();
                this.populateSleepWhitelist();
                document.getElementById('sleepWhitelistSite').value = '';
                this.showNotification(`${normalizedSite} added to sleep whitelist`, 'success');
            } else {
                this.showNotification(`${normalizedSite} is already in the whitelist`, 'warning');
            }
        }
    }

    removeSleepWhitelist(site) {
        if (confirm(`Remove ${site} from sleep whitelist?`)) {
            this.sleepBlocking.whitelist = this.sleepBlocking.whitelist.filter(s => s !== site);
            this.saveSleepBlocking();
            this.populateSleepWhitelist();
            this.showNotification(`${site} removed from sleep whitelist`, 'success');
        }
    }

    populateSleepWhitelist() {
        const whitelistList = document.getElementById('sleepWhitelistList');
        whitelistList.innerHTML = '';

        if (this.sleepBlocking.whitelist && this.sleepBlocking.whitelist.length > 0) {
            this.sleepBlocking.whitelist.forEach(site => {
                const siteItem = document.createElement('div');
                siteItem.className = 'site-item';
                siteItem.innerHTML = `
                    <span class="site-name">${site}</span>
                    <button class="btn-remove" onclick="optionsManager.removeSleepWhitelist('${site}')">×</button>
                `;
                whitelistList.appendChild(siteItem);
            });
        } else {
            whitelistList.innerHTML = '<p class="no-sites">No whitelisted sites. Add productive sites above.</p>';
        }
    }

    addTimeLimit() {
        const site = document.getElementById('limitSite').value.trim();
        const minutes = parseInt(document.getElementById('limitMinutes').value);

        if (site && minutes && minutes > 0) {
            const existingIndex = this.timeLimits.findIndex(limit => limit.site === site);
            if (existingIndex !== -1) {
                this.timeLimits[existingIndex].minutes = minutes;
            } else {
                this.timeLimits.push({
                    site: site,
                    minutes: minutes,
                    usedToday: 0,
                    lastReset: new Date().toDateString()
                });
            }

            this.saveTimeLimits();
            this.populateTimeLimits();
            document.getElementById('limitSite').value = '';
            document.getElementById('limitMinutes').value = '';

            this.showNotification('Time limit added successfully', 'success');
        }
    }

    async editTimeLimit(site) {
        const limit = this.timeLimits.find(l => l.site === site);
        if (!limit) return;

        const newMinsStr = prompt(`Change daily limit for ${site} (currently ${limit.minutes} mins):`, limit.minutes);
        if (newMinsStr === null) return;

        const newMins = parseInt(newMinsStr);
        if (isNaN(newMins) || newMins <= 0) {
            this.showNotification('Please enter a valid number of minutes.', 'error');
            return;
        }

        if (newMins === limit.minutes) return;

        if (newMins < limit.minutes) {
            // Decreasing is good!
            this.showNotification('Awesome! Reducing your distractible time. Keep it up!', 'success');
        } else {
            // Increasing requires protection
            const allowed = await this.runProtectionSequence(`Increase time limit for ${site} to ${newMins} mins`);
            if (!allowed) return;

            // MANDATORY EXTRA CHALLENGE for increasing limits as requested
            const challenge = "I will respect my boundaries and focus on my work.";
            const typed = prompt(`FINAL CONFIRMATION: To increase the limit to ${newMins} minutes, type this exactly:\n\n"${challenge}"`, "");
            if (typed !== challenge) {
                this.showNotification('Limit increase cancelled. Challenge failed.', 'error');
                return;
            }
        }

        limit.minutes = newMins;
        await this.saveTimeLimits();
        this.populateTimeLimits();
        this.showNotification(`Limit updated for ${site}.`, 'success');
    }

    async removeTimeLimit(site) {
        const allowed = await this.runProtectionSequence(`Remove time limit for ${site}`);
        if (!allowed) {
            return;
        }

        this.timeLimits = this.timeLimits.filter(limitItem => limitItem.site !== site);
        this.saveTimeLimits();
        this.populateTimeLimits();
        this.showNotification('Time limit removed for this site.', 'warning');
    }

    async saveScheduledBlocking() {
        const startTime = document.getElementById('blockingStartTime').value;
        const endTime = document.getElementById('blockingEndTime').value;
        const days = [];

        // index maps directly to JS day numbers: 0=sunday, 1=monday, ..., 6=saturday
        ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].forEach((day, index) => {
            if (document.getElementById(day).checked) {
                days.push(index);
            }
        });

        this.scheduledBlocking = {
            enabled: this.scheduledBlocking.enabled,
            startTime: startTime,
            endTime: endTime,
            days: days
        };
        this.updateSelectAllState('scheduleSelectAllDays', ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);

        await chrome.storage.local.set({ scheduledBlocking: this.scheduledBlocking });
        // Trigger immediate check in service worker
        chrome.runtime.sendMessage({ action: 'checkScheduledBlocking' }).catch(() => { });
    }

    async saveTimeLimits() {
        await chrome.storage.local.set({ timeLimits: this.timeLimits });
    }



    // (duplicate method definitions removed — see implementations above)

    // NEW: Ad Blocker Methods
    setupAdBlockListeners() {
        const resetStatsBtn = document.getElementById('resetStats');
        if (resetStatsBtn) {
            resetStatsBtn.addEventListener('click', () => this.resetAdStats());
        }

        const manualUpdateBtn = document.getElementById('manualUpdate');
        if (manualUpdateBtn) {
            manualUpdateBtn.addEventListener('click', () => this.manualFilterUpdate());
        }

        const adToggle = document.getElementById('adBlockEnabledToggle');
        if (adToggle) {
            // Initialize from stored value (default true)
            chrome.storage.local.get(['adBlockEnabled'], (data) => {
                const enabled = data.adBlockEnabled !== false;
                adToggle.checked = enabled;
            });

            adToggle.addEventListener('change', async () => {
                const enabled = adToggle.checked;
                try {
                    await chrome.runtime.sendMessage({ action: 'toggleAdBlock', enabled });
                    await chrome.storage.local.set({ adBlockEnabled: enabled });
                    this.showNotification(enabled ? 'Ad blocking enabled' : 'Ad blocking disabled', 'success');
                } catch (e) {
                    console.error('Failed to toggle ad blocker', e);
                    this.showNotification('Failed to toggle ad blocker', 'error');
                }
            });
        }
    }

    resetAdStats() {
        if (confirm('Are you sure you want to reset all ad blocking statistics?')) {
            this.adBlockStats = { adsBlocked: 0, bandwidthSaved: 0, timeSaved: 0 };
            chrome.storage.local.set({ adBlockStats: this.adBlockStats });
            this.showNotification('Statistics reset successfully!', 'success');
        }
    }

    async manualFilterUpdate() {
        const btn = document.getElementById('manualUpdate');
        const originalText = btn.textContent;
        btn.textContent = 'Updating...';
        btn.disabled = true;

        try {
            await chrome.runtime.sendMessage({ action: 'updateFilters' });
            btn.textContent = '✅ Updated!';
            this.showNotification('Filter lists updated successfully!', 'success');

            // Update last update time
            const now = new Date();
            document.getElementById('lastUpdate').textContent = `Last updated: ${now.toLocaleString()}`;
            chrome.storage.local.set({ lastFilterUpdate: now.toISOString() });
        } catch (error) {
            btn.textContent = '❌ Error';
            this.showNotification('Failed to update filters', 'error');
        }

        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);
    }

    getDefaultFilterLists() {
        return {
            easyList: { name: 'EasyList (Ads)', enabled: true, category: 'ads' },
            easyPrivacy: { name: 'EasyPrivacy (Trackers)', enabled: true, category: 'tracking' },
            advancedAnnoyances: { name: 'Advanced Annoyances', enabled: true, category: 'annoyances' },
            fanboysAnnoyances: { name: 'Fanboy\'s Annoyances', enabled: false, category: 'annoyances' },
            malwareDomains: { name: 'Malware Domains', enabled: true, category: 'security' }
        };
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;

        if (type === 'error') {
            notification.style.background = '#e11d48'; // Rose 600
        } else if (type === 'warning') {
            notification.style.background = '#f59e0b'; // Amber 500
            notification.style.color = '#111827';
        } else if (type === 'success') {
            notification.style.background = '#10b981'; // Emerald 500
        }

        // Stack notifications vertically to prevent overlapping
        const existingNotifications = document.querySelectorAll('.notification');
        const offset = existingNotifications.length * 70; // 70px spacing per notification
        notification.style.top = `${24 + offset}px`;

        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
            // Re-stack remaining notifications
            document.querySelectorAll('.notification').forEach((notif, index) => {
                notif.style.top = `${24 + index * 70}px`;
            });
        }, 3000);
    }

    async playFeedbackSound(kind) {
        const sound = kind === 'success' ? 'timer-complete' : 'break-time';
        try {
            await chrome.runtime.sendMessage({ action: 'playSound', sound });
        } catch (e) {
            // no-op
        }
    }

    async showGuardStep(title, message, continueLabel = 'Continue', cancelLabel = 'Cancel') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 100000;
                background: rgba(2, 6, 23, 0.72);
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(4px);
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                width: min(520px, calc(100vw - 32px));
                background: #0f172a; color: #e5e7eb;
                border: 1px solid rgba(99,102,241,0.35);
                border-radius: 16px; padding: 20px;
                box-shadow: 0 20px 48px rgba(0,0,0,0.45);
            `;
            modal.innerHTML = `
                <div style="font-size:1.05rem;font-weight:700;margin-bottom:10px;">${title}</div>
                <div style="font-size:0.92rem;line-height:1.55;color:#cbd5e1;margin-bottom:16px;">${message}</div>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="ts-guard-cancel" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:#1e293b;color:#e5e7eb;cursor:pointer;">${cancelLabel}</button>
                    <button id="ts-guard-continue" style="padding:8px 14px;border-radius:10px;border:none;background:#6366f1;color:white;cursor:pointer;">${continueLabel}</button>
                </div>
            `;

            const preventEsc = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };

            const cleanup = () => {
                document.removeEventListener('keydown', preventEsc, true);
                overlay.remove();
            };

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', preventEsc, true);

            modal.querySelector('#ts-guard-cancel').addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            modal.querySelector('#ts-guard-continue').addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
        });
    }

    async showDisableCountdown(actionLabel, seconds = 60) {
        const messages = [
            'Take a breath and keep your momentum.',
            'Your future self will thank you for waiting.',
            'Small pauses protect big goals.',
            'Focus first, distractions later.',
            'You are building a better default.'
        ];

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 100000;
                background: rgba(2, 6, 23, 0.8);
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(6px);
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                width: min(540px, calc(100vw - 32px));
                background: linear-gradient(180deg, #0f172a, #111827);
                color: #e5e7eb;
                border: 1px solid rgba(99,102,241,0.35);
                border-radius: 18px;
                padding: 22px;
                box-shadow: 0 24px 60px rgba(0,0,0,0.5);
            `;

            modal.innerHTML = `
                <div style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd;margin-bottom:10px;">Protection Countdown</div>
                <div style="font-size:1.15rem;font-weight:800;margin-bottom:8px;">${actionLabel}</div>
                <div id="ts-countdown-message" style="font-size:0.95rem;line-height:1.55;color:#cbd5e1;margin-bottom:18px;"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;">
                    <div id="ts-countdown-value" style="font-family:'Outfit',sans-serif;font-size:3rem;font-weight:800;color:#818cf8;min-width:96px;">${seconds}</div>
                    <div style="flex:1;height:10px;background:rgba(148,163,184,0.16);border-radius:999px;overflow:hidden;">
                        <div id="ts-countdown-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:999px;transition:width 1s linear;"></div>
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="ts-countdown-cancel" style="padding:9px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:#1e293b;color:#e5e7eb;cursor:pointer;">Cancel</button>
                    <button id="ts-countdown-continue" disabled style="padding:9px 14px;border-radius:10px;border:none;background:#6366f1;color:white;opacity:0.5;cursor:not-allowed;">Continue</button>
                </div>
            `;

            const cleanup = () => {
                clearInterval(timerId);
                document.removeEventListener('keydown', escHandler, true);
                overlay.remove();
            };

            const resolveAndCleanup = (value) => {
                cleanup();
                resolve(value);
            };

            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    resolveAndCleanup(false);
                }
            };

            const messageEl = modal.querySelector('#ts-countdown-message');
            const valueEl = modal.querySelector('#ts-countdown-value');
            const barEl = modal.querySelector('#ts-countdown-bar');
            const continueBtn = modal.querySelector('#ts-countdown-continue');
            const cancelBtn = modal.querySelector('#ts-countdown-cancel');

            const formatCountdown = (value) => {
                const total = Math.max(0, Number(value) || 0);
                const mins = Math.floor(total / 60);
                const secs = total % 60;
                return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            };

            const update = () => {
                const remaining = Math.max(0, endAt - Date.now());
                const remainingSeconds = Math.ceil(remaining / 1000);
                const message = messages[remainingSeconds % messages.length];
                valueEl.textContent = formatCountdown(remainingSeconds);
                messageEl.textContent = message;
                barEl.style.width = `${Math.max(0, (remaining / totalMs) * 100)}%`;

                if (remainingSeconds <= 0) {
                    continueBtn.disabled = false;
                    continueBtn.style.opacity = '1';
                    continueBtn.style.cursor = 'pointer';
                    continueBtn.textContent = 'Continue';
                    clearInterval(timerId);
                } else {
                    continueBtn.textContent = `Wait ${remainingSeconds}s`;
                }
            };

            const totalMs = Math.max(1000, (Number(seconds) || 60) * 1000);
            const endAt = Date.now() + totalMs;
            let timerId = null;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', escHandler, true);

            cancelBtn.addEventListener('click', () => resolveAndCleanup(false));
            continueBtn.addEventListener('click', () => {
                if (continueBtn.disabled) return;
                resolveAndCleanup(true);
            });

            update();
            timerId = setInterval(update, 1000);
        });
    }

    async runChallengeChecks(actionLabel) {
        const settings = this.settings || {};

        if (settings.challengeTextEnabled) {
            const expected = (settings.challengeTextValue || 'I choose focus over distraction.').trim();
            const typed = prompt(`${actionLabel}\n\nType this sentence exactly:\n"${expected}"`, '') || '';
            if (typed.trim() !== expected) return { ok: false, reason: 'Text challenge failed' };
        }

        if (settings.challengePinEnabled) {
            const expectedPin = String(settings.challengePinValue || '1234');
            const pin = prompt(`${actionLabel}\n\nEnter your focus PIN`, '') || '';
            if (pin !== expectedPin) return { ok: false, reason: 'PIN verification failed' };
        }

        if (settings.challengePasswordEnabled) {
            const expectedPassword = String(settings.challengePasswordValue || 'focus');
            const pass = prompt(`${actionLabel}\n\nEnter your focus password`, '') || '';
            if (pass !== expectedPassword) return { ok: false, reason: 'Password verification failed' };
        }

        if (settings.challengeDelayEnabled) {
            const delaySeconds = Math.max(3, Math.min(60, Number(settings.challengeDelaySeconds || 8)));
            await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
        }

        return { ok: true };
    }

    async runProtectionSequence(actionLabel) {
        if (this.requiresProtectionCountdown(actionLabel)) {
            const countdownAllowed = await this.showDisableCountdown(actionLabel, 60);
            if (!countdownAllowed) return false;
        }

        const challengeResult = await this.runChallengeChecks(actionLabel);
        if (!challengeResult.ok) {
            await this.playFeedbackSound('failure');
            this.showNotification(challengeResult.reason || 'Verification failed', 'error');
            return false;
        }

        await this.playFeedbackSound('success');
        return true;
    }

    requiresProtectionCountdown(actionLabel) {
        const label = String(actionLabel || '').toLowerCase();
        return label.includes('remove') || label.includes('disable') || label.includes('clear') || label.includes('delete') || label.includes('confirm') || label.includes('ok');
    }

    // --- Screen Time Functionality ---
    setupScreenTimeListeners() {
        const refreshBtn = document.getElementById('refreshScreenTime');
        const clearBtn = document.getElementById('clearScreenTime');
        const rangeSelect = document.getElementById('screenTimeRange');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.renderScreenTime();
                this.showNotification('Screen time refreshed', 'success');
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                await this.clearScreenTimeData();
            });
        }

        if (rangeSelect) {
            rangeSelect.addEventListener('change', () => {
                this.renderScreenTime();
            });
        }

        const prevBtn = document.getElementById('prevDate');
        const nextBtn = document.getElementById('nextDate');
        const todayBtn = document.getElementById('jumpToToday');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const range = document.getElementById('screenTimeRange')?.value || 'day';
                const days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
                this.screenTimeRefDate.setDate(this.screenTimeRefDate.getDate() - days);
                this.renderScreenTime();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const range = document.getElementById('screenTimeRange')?.value || 'day';
                const days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
                const newDate = new Date(this.screenTimeRefDate);
                newDate.setDate(newDate.getDate() + days);

                // Don't allow navigating into the future
                if (newDate <= new Date()) {
                    this.screenTimeRefDate = newDate;
                    this.renderScreenTime();
                } else {
                    this.screenTimeRefDate = new Date();
                    this.renderScreenTime();
                    this.showNotification('You are already at the current date.', 'warning');
                }
            });
        }

        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                this.screenTimeRefDate = new Date();
                // Reset range dropdown to 'day' when jumping to today
                const rangeSelect = document.getElementById('screenTimeRange');
                if (rangeSelect) rangeSelect.value = 'day';
                this.renderScreenTime();
            });
        }

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.dataset.tab === 'screentime') this.renderScreenTime();
            });
        });

        this.renderScreenTime();
    }

    async clearScreenTimeData() {
        const confirmed = await this.showGuardStep(
            'Clear Analytics',
            'This will permanently remove your screen-time history and insights.',
            'Clear Data',
            'Cancel'
        );
        if (!confirmed) return;

        await chrome.storage.local.remove(['siteUsageData', 'siteOpenCounts', 'siteUsageTimeline']);
        await this.renderScreenTime();
        this.showNotification('Screen time history cleared', 'success');
    }

    getRangeDays() {
        const range = document.getElementById('screenTimeRange')?.value || 'day';
        if (range === 'week') return 7;
        if (range === 'month') return 30;
        return 1;
    }

    formatDuration(seconds) {
        const safe = Math.max(0, Number(seconds || 0));
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        const secs = safe % 60;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    async renderScreenTime() {
        const container = document.getElementById('screenTimeContainer');
        const chartContainer = document.getElementById('screenTimeChart');
        const dateDisplay = document.getElementById('currentDateDisplay');
        const svgEl = document.querySelector('#screenTimeChart svg');
        if (!container || !chartContainer || !svgEl) return;

        const { siteUsageData = {}, siteOpenCounts = {}, siteUsageTimeline = {} } =
            await chrome.storage.local.get(['siteUsageData', 'siteOpenCounts', 'siteUsageTimeline']);

        const refDate = new Date(this.screenTimeRefDate);
        refDate.setHours(23, 59, 59, 999); // End of the ref day

        const range = document.getElementById('screenTimeRange')?.value || 'day';
        const days = this.getRangeDays();

        // Update date display
        if (dateDisplay) {
            const today = new Date().toDateString();
            if (this.screenTimeRefDate.toDateString() === today) {
                if (range === 'day') dateDisplay.textContent = 'Today';
                else if (range === 'week') dateDisplay.textContent = 'Last 7 Days';
                else dateDisplay.textContent = 'Last 30 Days';
            } else {
                if (range === 'day') {
                    dateDisplay.textContent = this.screenTimeRefDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                } else {
                    const start = new Date(this.screenTimeRefDate);
                    start.setDate(start.getDate() - (days - 1));
                    dateDisplay.textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${this.screenTimeRefDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                }
            }
        }

        const perSite = {};
        Object.keys(siteUsageData).forEach(dateKey => {
            const d = new Date(dateKey);
            if (Number.isNaN(d.getTime())) return;

            // Calculate difference in days from reference date
            // We want dates in the range [refDate - days, refDate]
            const timeDiff = refDate.getTime() - d.getTime();
            const dayDiff = timeDiff / (1000 * 60 * 60 * 24);

            if (dayDiff < 0 || dayDiff >= days) return;

            const byDomain = siteUsageData[dateKey] || {};
            Object.keys(byDomain).forEach(domain => {
                if (!perSite[domain]) perSite[domain] = { seconds: 0, opens: 0, byDate: {} };

                const sec = byDomain[domain] || 0;
                const opens = siteOpenCounts?.[dateKey]?.[domain] || 0;
                const timeline = siteUsageTimeline?.[dateKey]?.[domain] || new Array(24).fill(0);

                perSite[domain].seconds += sec;
                perSite[domain].opens += opens;
                perSite[domain].byDate[dateKey] = {
                    seconds: sec,
                    opens,
                    timeline
                };
            });
        });

        const sites = Object.entries(perSite)
            .map(([domain, data]) => ({ domain, ...data }))
            .sort((a, b) => b.seconds - a.seconds);

        if (!sites.length) {
            chartContainer.style.display = 'none';
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--slate-400);">No browsing data recorded in this range.</div>';
            return;
        }

        chartContainer.style.display = 'flex';

        const totalSeconds = sites.reduce((acc, item) => acc + item.seconds, 0);
        document.getElementById('totalTimeText').textContent = this.formatDuration(totalSeconds);

        const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6'];
        const radius = 100;
        const circumference = 2 * Math.PI * radius;
        const center = 125;
        let consumed = 0;

        let donut = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--surface)" stroke-width="30" />`;
        sites.forEach((item, index) => {
            const share = item.seconds / totalSeconds;
            const color = palette[index % palette.length];
            donut += `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="30" stroke-dasharray="${share * circumference} ${circumference}" stroke-dashoffset="-${consumed}" transform="rotate(-90 ${center} ${center})" />`;
            consumed += share * circumference;
        });
        svgEl.innerHTML = donut;

        const maxSeconds = sites[0]?.seconds || 1;
        container.innerHTML = sites.map((item, index) => {
            const width = Math.max(3, (item.seconds / maxSeconds) * 100);
            const color = palette[index % palette.length];
            return `
                <div class="screen-time-site" data-domain="${item.domain}">
                    <button type="button" class="screen-time-site-main" data-domain="${item.domain}">
                        <img src="https://www.google.com/s2/favicons?domain=${item.domain}&sz=64" class="screen-time-site-favicon" alt="${item.domain}">
                        <div class="screen-time-site-main-content">
                            <div class="screen-time-site-header">
                                <span class="screen-time-site-domain">${item.domain}</span>
                                <span class="screen-time-site-summary">${this.formatDuration(item.seconds)} · ${item.opens} sessions</span>
                            </div>
                            <div class="screen-time-site-bar-track">
                                <div class="screen-time-site-bar-fill" style="width:${width}%; background:${color};"></div>
                            </div>
                        </div>
                    </button>
                    <div class="screen-time-site-detail" style="display:none;"></div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.screen-time-site-main').forEach(btn => {
            btn.addEventListener('click', () => {
                const domain = btn.dataset.domain;
                const site = sites.find(s => s.domain === domain);
                if (!site) return;

                container.querySelectorAll('.screen-time-site-main').forEach(b => b.classList.remove('active'));
                container.querySelectorAll('.screen-time-site-detail').forEach(el => {
                    el.style.display = 'none';
                    el.innerHTML = '';
                });

                btn.classList.add('active');
                const detail = btn.parentElement.querySelector('.screen-time-site-detail');
                if (!detail) return;

                const dates = Object.entries(site.byDate)
                    .map(([date, value]) => ({ date, ...value }))
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                detail.innerHTML = `
                    <div class="screen-time-graph-card">
                        <div class="screen-time-graph-header">
                            <div class="screen-time-graph-title">${site.domain} · Date Breakdown</div>
                            <div class="screen-time-graph-meta">Click a date for full 24-hour timeline</div>
                        </div>
                        <div class="screen-time-graph-body">
                            ${dates.map(day => `
                                <button type="button" class="screen-time-graph-row ts-date-row" data-date="${day.date}" style="width:100%;border:none;background:transparent;cursor:pointer;">
                                    <span class="screen-time-graph-hour" style="width:120px;">${new Date(day.date).toLocaleDateString()}</span>
                                    <div class="screen-time-graph-bar-track"><div class="screen-time-graph-bar-fill" style="width:${Math.max(4, (day.seconds / Math.max(...dates.map(d => d.seconds), 1)) * 100)}%;"></div></div>
                                    <span class="screen-time-graph-value" style="width:130px;">${this.formatDuration(day.seconds)} · ${day.opens} sessions</span>
                                </button>
                            `).join('')}
                        </div>
                        <div class="ts-hourly-panel" style="margin-top:10px;"></div>
                    </div>
                `;
                detail.style.display = 'block';

                const hourlyPanel = detail.querySelector('.ts-hourly-panel');
                detail.querySelectorAll('.ts-date-row').forEach(dateBtn => {
                    dateBtn.addEventListener('click', () => {
                        const dateKey = dateBtn.dataset.date;
                        const dateData = site.byDate[dateKey];
                        if (!dateData) return;

                        const maxHour = Math.max(...dateData.timeline, 1);
                        const rows = dateData.timeline.map((sec, hour) => {
                            if (!sec) return '';
                            const pct = Math.max(4, (sec / maxHour) * 100);
                            return `
                                <div class="screen-time-graph-row">
                                    <span class="screen-time-graph-hour">${String(hour).padStart(2, '0')}:00</span>
                                    <div class="screen-time-graph-bar-track"><div class="screen-time-graph-bar-fill" style="width:${pct}%;"></div></div>
                                    <span class="screen-time-graph-value">${this.formatDuration(sec)}</span>
                                </div>
                            `;
                        }).join('') || '<div class="screen-time-graph-empty">No activity for this day.</div>';

                        hourlyPanel.innerHTML = `
                            <div class="screen-time-graph-header">
                                <div class="screen-time-graph-title">24-Hour Timeline · ${new Date(dateKey).toLocaleDateString()}</div>
                                <div class="screen-time-graph-meta">Session-wise: ${dateData.opens} sessions · Total: ${this.formatDuration(dateData.seconds)}</div>
                            </div>
                            <div class="screen-time-graph-body">${rows}</div>
                        `;
                    });
                });
            });
        });
    }

    // ── ACCORDION (Schedules & Limits) ────────────────────────────────────────
    setupAccordion() {
        document.querySelectorAll('.accordion-header').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const item = document.getElementById(targetId);
                if (!item) return;

                const isOpen = item.classList.contains('open');

                // Toggle this panel
                item.classList.toggle('open', !isOpen);
                btn.setAttribute('aria-expanded', String(!isOpen));

                // Update badge when closing
                if (!isOpen) {
                    // Opened — badge fades via CSS
                } else {
                    this.updateAccordionBadges();
                }
            });
        });

        // Keep badges in sync when selects change
        ['scheduledBlocking', 'sleepBlocking', 'timeLimits', 'globalLimitEnabled'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.updateAccordionBadges());
        });

        // Don't call updateAccordionBadges here - it's called after populateForm in init()
    }

    updateAccordionBadges() {
        // Scheduled Blocking List — site count
        const blBadge = document.getElementById('badge-blocklist');
        if (blBadge) {
            const n = this.scheduledBlockedSites ? this.scheduledBlockedSites.length : 0;
            blBadge.textContent = n === 1 ? '1 site' : `${n} sites`;
        }

        // Schedule Settings — Enabled / Disabled
        const schBadge = document.getElementById('badge-schedule');
        if (schBadge) {
            // Read from data object instead of DOM to ensure correct initial state
            const isEnabled = this.scheduledBlocking && this.scheduledBlocking.enabled;
            schBadge.textContent = isEnabled ? 'Enabled' : 'Disabled';
            schBadge.style.background = isEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.14)';
            schBadge.style.color = isEnabled ? '#34d399' : '#818cf8';
        }

        // Sleep Blocking — Enabled / Disabled
        const slBadge = document.getElementById('badge-sleep');
        if (slBadge) {
            // Read from data object instead of DOM to ensure correct initial state
            const isEnabled = this.sleepBlocking && this.sleepBlocking.enabled;
            slBadge.textContent = isEnabled ? 'Enabled' : 'Disabled';
            slBadge.style.background = isEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.14)';
            slBadge.style.color = isEnabled ? '#34d399' : '#818cf8';
        }

        // Time Limits — Enabled / Disabled
        const tlBadge = document.getElementById('badge-timelimits');
        if (tlBadge) {
            // Read from data object instead of DOM to ensure correct initial state
            const isEnabled = this.timeLimitsEnabled;
            tlBadge.textContent = isEnabled ? 'Enabled' : 'Disabled';
            tlBadge.style.background = isEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.14)';
            tlBadge.style.color = isEnabled ? '#34d399' : '#818cf8';
        }

        // Global Limit — Enabled / Disabled
        const glBadge = document.getElementById('badge-global');
        if (glBadge) {
            // Read from data object instead of DOM to ensure correct initial state
            const isEnabled = this.globalLimit && this.globalLimit.enabled;
            glBadge.textContent = isEnabled ? 'Enabled' : 'Disabled';
            glBadge.style.background = isEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.14)';
            glBadge.style.color = isEnabled ? '#34d399' : '#818cf8';
        }
        // Focus Blocklist — count
        const fblBadge = document.getElementById('badge-focus-blocklist');
        if (fblBadge) {
            const n = this.focusBlockedSites ? this.focusBlockedSites.length : 0;
            fblBadge.textContent = n === 1 ? '1 site' : `${n} sites`;
        }

        // Ad Blocker Status
        const abBadge = document.getElementById('badge-adblock-blocking');
        if (abBadge) {
            const toggle = document.getElementById('adBlockEnabledToggle');
            const isEnabled = toggle ? toggle.checked : true;
            abBadge.textContent = isEnabled ? 'Active' : 'Paused';
            abBadge.style.background = isEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)';
            abBadge.style.color = isEnabled ? '#34d399' : '#f43f5e';
        }

        // Notification Badge
        const notifBadge = document.getElementById('badge-general-notifications');
        if (notifBadge) {
            const enabled = document.getElementById('notificationsEnabled')?.checked;
            notifBadge.textContent = enabled ? 'On' : 'Off';
        }

        // Theme Badge
        const themeBadge = document.getElementById('badge-general-appearance');
        if (themeBadge) {
            const theme = document.getElementById('theme')?.value || 'Solar';
            themeBadge.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        }

        // Pomodoro Badge
        const pomoBadge = document.getElementById('badge-focus-pomodoro');
        if (pomoBadge) {
            const dur = document.getElementById('focusDuration')?.value || '25';
            pomoBadge.textContent = `${dur} min`;
        }

        // Ad Stats Badge
        const adsStatsBadge = document.getElementById('badge-adblock-stats');
        if (adsStatsBadge && this.adBlockStats) {
            adsStatsBadge.textContent = `${this.adBlockStats.adsBlocked || 0} blocked`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('copyright-year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }

    new OptionsManager();
});
