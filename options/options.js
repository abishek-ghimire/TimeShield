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
            'settings', 'blockedSites', 'whitelist', 'todayStats', 'analyticsData'
        ]);
        
        this.settings = result.settings || StorageManager.getDefaultSettings();
        this.blockedSites = result.blockedSites || StorageManager.getDefaultBlockedSites();
        this.whitelist = result.whitelist || [];
    }
    
    setupEventListeners() {
        this.setupTabSwitching();
        this.setupFormListeners();
        this.setupSiteManagement();
        this.setupDataManagement();
        this.setupAnalytics();
    }
    
    setupTabSwitching() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
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
                } else {
                    element.value = this.settings[element.id];
                }
            }
        });
        
        this.updateSiteLists();
        this.updateRangeDisplays();
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
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OptionsManager();
});
