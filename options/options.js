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
            'scheduledBlocking', 'timeLimits'
        ]);
        
        this.settings = result.settings || StorageManager.getDefaultSettings();
        this.blockedSites = result.blockedSites || StorageManager.getDefaultBlockedSites();
        this.whitelist = result.whitelist || [];
        this.scheduledBlocking = result.scheduledBlocking || this.getDefaultScheduledBlocking();
        this.timeLimits = result.timeLimits || [];
    }
    
    setupEventListeners() {
        this.setupTabSwitching();
        this.setupFormListeners();
        this.setupSiteManagement();
        this.setupDataManagement();
        this.setupAnalytics();
        this.setupThemeListener();
        this.setupFooterInteractions();
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
        this.updateRangeDisplays();
        this.applyTheme();
    }
    
    applyTheme() {
        const theme = this.settings.theme || 'default';
        const body = document.body;
        
        // Remove existing theme classes
        body.classList.remove('dark-theme', 'light-theme', 'blue-theme');
        
        // Apply new theme class
        if (theme !== 'default') {
            body.classList.add(`${theme}-theme`);
        }
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
        await StorageManager.saveSettings(this.settings);
        
        this.showNotification('Settings saved successfully!', 'success');
    }
    
    async resetToDefaults() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            this.settings = StorageManager.getDefaultSettings();
            await StorageManager.saveSettings(this.settings);
            this.populateForm();
            this.showNotification('Settings reset to defaults', 'success');
        }
    }
    
    async loadAnalytics() {
        const report = await AnalyticsManager.getAnalyticsReport(30);
        const summary = report.summary;
        
        document.getElementById('totalFocusTime').textContent = 
            TimeManager.formatDuration(summary.totalFocusTime);
        document.getElementById('totalSessions').textContent = summary.totalSessions;
        document.getElementById('totalTasks').textContent = summary.totalTasksCompleted;
        document.getElementById('productivityScore').textContent = summary.averageProductivityScore;
    }
    
    async exportData() {
        const data = await StorageManager.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `productivity-clock-backup-${new Date().toISOString().split('T')[0]}.json`;
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
            
            const result = await StorageManager.importData(importData);
            
            if (result.success) {
                await this.loadData();
                this.populateForm();
                this.loadAnalytics();
                this.showNotification('Data imported successfully', 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            this.showNotification('Failed to import data: ' + error.message, 'error');
        }
        
        fileInput.value = '';
    }
    
    async exportAnalytics() {
        const data = await AnalyticsManager.exportAnalytics('json');
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `productivity-analytics-${new Date().toISOString().split('T')[0]}.json`;
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
            this.settings = StorageManager.getDefaultSettings();
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
