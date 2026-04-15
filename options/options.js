class OptionsManager {
    constructor() {
        this.settings = {};
        this.blockedSites = [];
        this.whitelist = [];
        
        this.init();
    }
    
    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.populateForm();
        this.loadAnalytics();
    }
    
    async loadData() {
        const result = await chrome.storage.local.get([
            'settings', 'blockedSites', 'whitelist', 'todayStats', 'analyticsData',
            'scheduledBlocking', 'timeLimits', 'filterLists', 'customFilters', 'adBlockStats'
        ]);
        
        this.settings = result.settings || this.getDefaultSettings();
        this.blockedSites = result.blockedSites || this.getDefaultBlockedSites();
        this.whitelist = result.whitelist || [];
        this.scheduledBlocking = result.scheduledBlocking || this.getDefaultScheduledBlocking();
        this.timeLimits = result.timeLimits || [];
        this.filterLists = result.filterLists || this.getDefaultFilterLists();
        this.customFilters = result.customFilters || [];
        this.adBlockStats = result.adBlockStats || { adsBlocked: 0, bandwidthSaved: 0, timeSaved: 0 };
    }
    
    setupEventListeners() {
        this.setupTabSwitching();
        this.setupFormListeners();
        this.setupSiteManagement();
        this.setupDataManagement();
        this.setupAnalytics();
        this.setupThemeListener();
        this.setupFooterInteractions();
        this.setupAdBlockListeners(); // NEW
        this.setupEnhancedInteractions();
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
            button.addEventListener('click', function(e) {
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
        
        // Add smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }
    
    setupFormListeners() {
        this.setupTabSwitching();
        this.setupFormListeners();
        this.setupSiteManagement();
        this.setupDataManagement();
        this.setupAnalytics();
        this.setupThemeListener();
    }
    
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
            if (element.type !== 'checkbox' && element.id !== 'saveSettings' && element.id !== 'resetToDefaults') {
                element.addEventListener('change', () => {
                    this.saveSettings();
                });
            }
        });
        
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetToDefaults').addEventListener('click', () => this.resetToDefaults());
    }
    
    setupSiteManagement() {
        document.getElementById('addBlockedSite').addEventListener('click', () => this.addBlockedSite());
        document.getElementById('addWhitelistSite').addEventListener('click', () => this.addWhitelistSite());
        
        // Scheduled blocking
        document.getElementById('scheduledBlocking').addEventListener('change', (e) => {
            this.toggleScheduledBlocking(e.target.value);
        });
        
        document.getElementById('blockingStartTime').addEventListener('change', () => this.saveScheduledBlocking());
        document.getElementById('blockingEndTime').addEventListener('change', () => this.saveScheduledBlocking());
        
        // Day checkboxes
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
            document.getElementById(day).addEventListener('change', () => this.saveScheduledBlocking());
        });
        
        // Time limits
        document.getElementById('timeLimits').addEventListener('change', (e) => {
            this.toggleTimeLimits(e.target.value);
        });
        
        document.getElementById('addTimeLimit').addEventListener('click', () => this.addTimeLimit());
        
        document.getElementById('newBlockedSite').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addBlockedSite();
        });
        
        document.getElementById('newWhitelistSite').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addWhitelistSite();
        });
    }
    
    setupDataManagement() {
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('importData').addEventListener('click', () => this.importData());
        document.getElementById('clearAnalytics').addEventListener('click', () => this.clearAnalytics());
        document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
        document.getElementById('clearAllData').addEventListener('click', () => this.clearAllData());
        document.getElementById('exportAnalytics').addEventListener('click', () => this.exportAnalytics());
        document.getElementById('refreshAnalytics').addEventListener('click', () => this.loadAnalytics());
    }
    
    setupAnalytics() {
        document.getElementById('analyticsEnabled').addEventListener('change', (e) => {
            if (!e.target.checked) {
                this.showNotification('Analytics tracking has been disabled', 'warning');
            }
        });
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
        this.populateTimeLimits();
        this.populateAdBlockSettings(); // NEW
        this.updateRangeDisplays();
        this.applyTheme();
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
        const theme = this.settings.theme || 'default';
        const body = document.body;
        
        // Remove existing theme classes
        body.classList.remove('dark-theme', 'light-theme', 'blue-theme', 'gradient-theme', 'neon-theme');
        
        // Apply new theme class
        if (theme !== 'default') {
            body.classList.add(`${theme}-theme`);
        }
        
        // Apply theme to tab contents
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            content.classList.remove('dark-theme', 'light-theme', 'blue-theme', 'gradient-theme', 'neon-theme');
            if (theme !== 'default') {
                content.classList.add(`${theme}-theme`);
            }
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
    }
    
    populateTimeLimits() {
        const timeLimitsSelect = document.getElementById('timeLimits');
        const timeLimitsSettings = document.getElementById('timeLimitsSettings');
        
        if (this.timeLimits.length > 0) {
            timeLimitsSelect.value = 'enabled';
            timeLimitsSettings.style.display = 'block';
        } else {
            timeLimitsSelect.value = 'disabled';
            timeLimitsSettings.style.display = 'none';
        }
        
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
                <button class="remove-site" data-site="${limit.site}" data-type="timelimit">Remove</button>
            `;
            
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
        const blockedSitesList = document.getElementById('blockedSitesList');
        const whitelistList = document.getElementById('whitelistList');
        
        blockedSitesList.innerHTML = '';
        this.blockedSites.forEach(site => {
            const siteItem = this.createSiteItem(site, 'blocked');
            blockedSitesList.appendChild(siteItem);
        });
        
        whitelistList.innerHTML = '';
        this.whitelist.forEach(site => {
            const siteItem = this.createSiteItem(site, 'whitelist');
            whitelistList.appendChild(siteItem);
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
    
    async addBlockedSite() {
        const input = document.getElementById('newBlockedSite');
        const site = input.value.trim().toLowerCase();
        
        if (site && !this.blockedSites.includes(site)) {
            this.blockedSites.push(site);
            await this.saveSiteLists();
            this.updateSiteLists();
            input.value = '';
            this.showNotification('Site added to blocklist', 'success');
        }
    }
    
    async addWhitelistSite() {
        const input = document.getElementById('newWhitelistSite');
        const site = input.value.trim().toLowerCase();
        
        if (site && !this.whitelist.includes(site)) {
            this.whitelist.push(site);
            await this.saveSiteLists();
            this.updateSiteLists();
            input.value = '';
            this.showNotification('Site added to whitelist', 'success');
        }
    }
    
    async removeSite(site, type) {
        if (type === 'blocked') {
            this.blockedSites = this.blockedSites.filter(s => s !== site);
        } else {
            this.whitelist = this.whitelist.filter(s => s !== site);
        }
        
        await this.saveSiteLists();
        this.updateSiteLists();
        this.showNotification('Site removed', 'success');
    }
    
    async saveSiteLists() {
        await chrome.storage.local.set({
            blockedSites: this.blockedSites,
            whitelist: this.whitelist
        });
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
            theme: 'default',
            clockStyle: 'digital',
            timeFormat: '12',
            clockSize: 'medium',
            clockOpacity: 90,
            clockPosition: 'top-right',
            autoStartClock: false,
            syncAcrossDevices: false,
            showProductivityTips: true,
            dataRetentionDays: 90,
            focusModeDuration: 25,
            breakDuration: 5,
            longBreakDuration: 15,
            soundEnabled: true,
            notificationEnabled: true,
            animationSpeed: 'normal'
        };
    }
    
    async loadAnalytics() {
        const result = await chrome.storage.local.get(['analyticsData', 'todayStats']);
        const analyticsData = result.analyticsData || {};
        const todayStats = result.todayStats || {};
        
        // Calculate summary from available data
        const summary = {
            totalFocusTime: todayStats.totalFocusTime || 0,
            totalSessions: todayStats.sessionsCompleted || 0,
            totalTasksCompleted: todayStats.tasksCompleted || 0,
            averageProductivityScore: todayStats.productivityScore || 0
        };
        
        document.getElementById('totalFocusTime').textContent = 
            this.formatDuration(summary.totalFocusTime);
        document.getElementById('totalSessions').textContent = summary.totalSessions;
        document.getElementById('totalTasks').textContent = summary.totalTasksCompleted;
        document.getElementById('productivityScore').textContent = summary.averageProductivityScore;
    }
    
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
    
    async exportData() {
        const result = await chrome.storage.local.get([
            'settings', 'blockedSites', 'whitelist', 'todayStats', 'analyticsData',
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
            this.loadAnalytics();
            this.showNotification('Data imported successfully', 'success');
        } catch (error) {
            this.showNotification('Failed to import data: ' + error.message, 'error');
        }
        
        fileInput.value = '';
    }
    
    async exportAnalytics() {
        const result = await chrome.storage.local.get(['analyticsData']);
        const data = JSON.stringify(result.analyticsData || {}, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Analytics exported successfully', 'success');
    }
    
    async clearAnalytics() {
        if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
            await chrome.storage.local.remove(['analyticsData', 'todayStats']);
            this.loadAnalytics();
            this.showNotification('Analytics data cleared', 'success');
        }
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
                this.loadAnalytics();
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
    
    toggleScheduledBlocking(value) {
        this.scheduledBlocking.enabled = value === 'enabled';
        this.saveScheduledBlocking();
        this.populateScheduledBlocking();
    }
    
    toggleTimeLimits(value) {
        if (value === 'enabled') {
            // Initialize with empty array if enabling
            if (this.timeLimits.length === 0) {
                this.timeLimits = [];
            }
        } else {
            this.timeLimits = [];
        }
        this.saveTimeLimits();
        this.populateTimeLimits();
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
    
    removeTimeLimit(site) {
        this.timeLimits = this.timeLimits.filter(limit => limit.site !== site);
        this.saveTimeLimits();
        this.populateTimeLimits();
        this.showNotification('Time limit removed', 'success');
    }
    
    async saveScheduledBlocking() {
        const startTime = document.getElementById('blockingStartTime').value;
        const endTime = document.getElementById('blockingEndTime').value;
        const days = [];
        
        ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].forEach((day, index) => {
            if (document.getElementById(day).checked) {
                days.push(index === 0 ? 0 : index);
            }
        });
        
        this.scheduledBlocking = {
            enabled: this.scheduledBlocking.enabled,
            startTime: startTime,
            endTime: endTime,
            days: days
        };
        
        await chrome.storage.local.set({ scheduledBlocking: this.scheduledBlocking });
    }
    
    async saveTimeLimits() {
        await chrome.storage.local.set({ timeLimits: this.timeLimits });
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
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

removeTimeLimit(site) {
    this.timeLimits = this.timeLimits.filter(limit => limit.site !== site);
    this.saveTimeLimits();
    this.populateTimeLimits();
    this.showNotification('Time limit removed', 'success');
}

async saveScheduledBlocking() {
    const startTime = document.getElementById('blockingStartTime').value;
    const endTime = document.getElementById('blockingEndTime').value;
    const days = [];
    
    ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].forEach((day, index) => {
        if (document.getElementById(day).checked) {
            days.push(index === 0 ? 0 : index);
        }
    });
    
    this.scheduledBlocking = {
        enabled: this.scheduledBlocking.enabled,
        startTime: startTime,
        endTime: endTime,
        days: days
    };
    
    await chrome.storage.local.set({ scheduledBlocking: this.scheduledBlocking });
    }
    
    // NEW: Ad Blocker Methods
    setupAdBlockListeners() {
        document.getElementById('resetStats').addEventListener('click', () => this.resetAdStats());
        document.getElementById('manualUpdate').addEventListener('click', () => this.manualFilterUpdate());
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
            uBlockAnnoyances: { name: 'uBlock Annoyances', enabled: true, category: 'annoyances' },
            fanboysAnnoyances: { name: 'Fanboy\'s Annoyances', enabled: false, category: 'annoyances' },
            malwareDomains: { name: 'Malware Domains', enabled: true, category: 'security' }
        };
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        if (type === 'error') {
            notification.style.background = '#dc3545';
        } else if (type === 'warning') {
            notification.style.background = '#ffc107';
            notification.style.color = '#333';
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
});
