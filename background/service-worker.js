// Import ad-blocking modules
import { AdBlockEngine } from './adblock-core.js';
import { FilterListManager } from './filter-lists.js';
import { RuleCompiler } from './adblock-rules.js';

class BackgroundService {
    constructor() {
        this.timerState = {
            isRunning: false,
            startTime: null,
            duration: 0,
            type: null
        };
        
        this.focusState = {
            isActive: false,
            startTime: null,
            duration: 0,
            blockedSites: []
        };
        
        // NEW: Ad blocker state
        this.adsBlocked = 0;
        this.bandwidthSaved = 0;
        this.timeSaved = 0;
        
        // Initialize components
        this.filterManager = new FilterListManager();
        this.ruleCompiler = new RuleCompiler();
        this.adBlocker = new AdBlockEngine(this);
        
        this.init();
    }
    
    init() {
        this.setupMessageHandlers();
        this.setupAlarmHandlers();
        this.initializeStorage();
        this.restoreState();
        this.initializeAdBlocking(); // NEW
    }
    
    // NEW: Initialize Ad Blocking
    async initializeAdBlocking() {
        try {
            // Load and compile filter lists
            const filters = await this.filterManager.loadAllLists();
            const rules = await this.ruleCompiler.compile(filters);
            
            // Apply DNR rules
            await this.adBlocker.applyRules(rules);
            
            console.log(`✅ Ad blocker initialized with ${rules.length} rules`);
            
            // Setup rule tracking
            this.setupRuleTracking();
        } catch (error) {
            console.error('Failed to initialize ad blocker:', error);
        }
    }
    
    // NEW: Setup rule tracking for stats
    setupRuleTracking() {
        // Track blocked requests for statistics
        if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
            chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
                this.trackBlockedRequest(info);
            });
        }
    }
    
    // NEW: Track blocked requests
    trackBlockedRequest(info) {
        this.adsBlocked++;
        
        // Estimate bandwidth saved (average ad size: 300KB)
        const avgAdSize = 300 * 1024; // 300KB in bytes
        this.bandwidthSaved += avgAdSize;
        
        // Estimate time saved (average ad load time: 0.5 seconds)
        this.timeSaved += 0.5;
        
        // Save stats periodically
        if (this.adsBlocked % 10 === 0) {
            this.saveAdStats();
        }
        
        // Update badge
        this.updateAdBlockBadge();
    }
    
    // NEW: Save ad blocking statistics
    async saveAdStats() {
        const stats = {
            adsBlocked: this.adsBlocked,
            bandwidthSaved: this.bandwidthSaved,
            timeSaved: this.timeSaved,
            lastUpdated: Date.now()
        };
        
        await chrome.storage.local.set({ adBlockStats: stats });
    }
    
    // NEW: Update badge with ad block count
    updateAdBlockBadge() {
        const count = this.adsBlocked > 999 ? '999+' : this.adsBlocked.toString();
        chrome.action.setBadgeText({ text: count });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    }
    
    // NEW: Format bytes for display
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // NEW: Format time for display
    formatTime(seconds) {
        if (seconds < 60) return `${Math.round(seconds)} sec`;
        if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
        return `${(seconds / 3600).toFixed(1)} hours`;
    }
    
    async restoreState() {
        // Restore timer state
        const timerResult = await chrome.storage.local.get(['timerState']);
        if (timerResult.timerState) {
            this.timerState = timerResult.timerState;
            if (this.timerState.isRunning) {
                this.startTimerAlarm();
            }
        }
        
        // Restore focus state
        const focusResult = await chrome.storage.local.get(['focusState']);
        if (focusResult.focusState) {
            this.focusState = focusResult.focusState;
            if (this.focusState.isActive) {
                this.enableSiteBlocking(this.focusState.blockedSites);
                chrome.action.setBadgeText({ text: '🎯' });
                chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
            }
        }
        
        // NEW: Restore ad blocker stats
        const adBlockResult = await chrome.storage.local.get(['adBlockStats']);
        if (adBlockResult.adBlockStats) {
            this.adsBlocked = adBlockResult.adBlockStats.adsBlocked || 0;
            this.bandwidthSaved = adBlockResult.adBlockStats.bandwidthSaved || 0;
            this.timeSaved = adBlockResult.adBlockStats.timeSaved || 0;
            this.updateAdBlockBadge();
        }
    }
    
    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
    }
    
    setupAlarmHandlers() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            this.handleAlarm(alarm);
        });
        
        // NEW: Daily filter update alarm
        chrome.alarms.create('updateFilters', { periodInMinutes: 1440 }); // Every 24 hours
    }
    
    async handleAlarm(alarm) {
        switch (alarm.name) {
            case 'timer':
                await this.timerComplete();
                break;
                
            case 'focusMode':
                await this.focusModeComplete();
                break;
                
            case 'breakReminder':
                this.sendBreakReminder();
                break;
                
            // NEW: Handle filter update alarm
            case 'updateFilters':
                await this.updateFilters();
                break;
                
            default:
                console.log('Unknown alarm:', alarm.name);
        }
    }
    
    // NEW: Update filter lists
    async updateFilters() {
        console.log('Updating filter lists...');
        try {
            await this.filterManager.updateAllLists();
            await this.initializeAdBlocking();
            console.log('✅ Filter lists updated successfully');
        } catch (error) {
            console.error('❌ Failed to update filter lists:', error);
        }
    }
    
    async handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'startTimer':
                await this.startTimer(message.duration, 'custom');
                sendResponse({ success: true });
                break;
                
            case 'stopTimer':
                await this.stopTimer();
                sendResponse({ success: true });
                break;
                
            case 'startFocusMode':
                await this.startFocusMode(message.duration, message.blockedSites);
                sendResponse({ success: true });
                break;
                
            case 'stopFocusMode':
                await this.stopFocusMode();
                sendResponse({ success: true });
                break;
                
            case 'toggleClock':
                await this.toggleFloatingClock();
                sendResponse({ success: true });
                break;
                
            case 'playSound':
                this.playSound(message.sound);
                sendResponse({ success: true });
                break;
                
            case 'updateBlockList':
                await this.updateBlockList(message.blockedSites, message.whitelist);
                sendResponse({ success: true });
                break;
                
            case 'getTimerState':
                sendResponse({ state: this.timerState });
                break;
                
            case 'getFocusState':
                sendResponse({ state: this.focusState });
                break;
                
            case 'updateStats':
                await this.updateStats(message.stats);
                sendResponse({ success: true });
                break;
                
            case 'checkScheduledBlocking':
                await this.checkScheduledBlocking();
                sendResponse({ active: await this.isScheduledBlockingActive() });
                break;
                
            case 'checkTimeLimit':
                await this.checkTimeLimit(message.site);
                sendResponse({ allowed: await this.isTimeLimitAllowed(message.site), remaining: await this.getTimeLimitRemaining(message.site) });
                break;
                
            // NEW: Ad blocker message handlers
            case 'getAdStats':
                sendResponse({
                    adsBlocked: this.adsBlocked,
                    bandwidthSaved: this.formatBytes(this.bandwidthSaved),
                    timeSaved: this.formatTime(this.timeSaved)
                });
                break;
                
            case 'blockElement':
                await this.adBlocker.addCustomRule({
                    filter: message.selector,
                    resourceTypes: ['script', 'image', 'stylesheet']
                });
                sendResponse({ success: true });
                break;
                
            case 'updateFilters':
                await this.updateFilters();
                sendResponse({ success: true });
                break;
                
            case 'settingsUpdated':
                await this.initializeAdBlocking();
                sendResponse({ success: true });
                break;
                
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }
    
    async isScheduledBlockingActive() {
        const result = await chrome.storage.local.get(['scheduledBlocking']);
        const scheduled = result.scheduledBlocking;
        
        if (!scheduled || !scheduled.enabled) {
            return false;
        }
        
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const startTime = this.timeToMinutes(scheduled.startTime);
        const endTime = this.timeToMinutes(scheduled.endTime);
        const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // Check if current time is within blocking window and current day is selected
        return currentTime >= startTime && currentTime <= endTime && scheduled.days.includes(currentDay);
    }
    
    async isTimeLimitAllowed(site) {
        const result = await chrome.storage.local.get(['timeLimits']);
        const timeLimits = result.timeLimits || [];
        
        const limit = timeLimits.find(limit => limit.site === site);
        if (!limit) {
            return true; // No limit set
        }
        
        const today = new Date().toDateString();
        
        // Reset daily usage at midnight
        if (limit.lastReset !== today) {
            limit.usedToday = 0;
            limit.lastReset = today;
        }
        
        return limit.usedToday < limit.minutes;
    }
    
    async getTimeLimitRemaining(site) {
        const result = await chrome.storage.local.get(['timeLimits']);
        const timeLimits = result.timeLimits || [];
        
        const limit = timeLimits.find(limit => limit.site === site);
        if (!limit) {
            return null; // No limit set
        }
        
        const today = new Date().toDateString();
        
        // Reset daily usage at midnight
        if (limit.lastReset !== today) {
            limit.usedToday = 0;
            limit.lastReset = today;
        }
        
        return Math.max(0, limit.minutes - limit.usedToday);
    }
    
    async checkScheduledBlocking() {
        const isActive = await this.isScheduledBlockingActive();
        if (isActive) {
            await this.enableScheduledBlocking();
        } else {
            await this.disableScheduledBlocking();
        }
    }
    
    async enableScheduledBlocking() {
        const result = await chrome.storage.local.get(['blockedSites']);
        const blockedSites = result.blockedSites || StorageManager.getDefaultBlockedSites();
        
        await this.enableSiteBlocking(blockedSites);
        
        chrome.action.setBadgeText({ text: '🚫' });
        chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
    }
    
    async disableScheduledBlocking() {
        await this.disableSiteBlocking();
        
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
    }
    
    async checkTimeLimit(site) {
        const allowed = await this.isTimeLimitAllowed(site);
        const remaining = await this.getTimeLimitRemaining(site);
        
        if (!allowed && remaining !== null) {
            // Block the site and show time limit message
            await this.enableSiteBlocking([site]);
            
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'showTimeLimitWarning',
                        site: site,
                        remaining: remaining
                    });
                }
            });
        }
    }
    
    timeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    async handleAlarm(alarm) {
        switch (alarm.name) {
            case 'timer':
                await this.timerComplete();
                break;
                
            case 'focusMode':
                await this.focusModeComplete();
                break;
                
            case 'breakReminder':
                await this.sendBreakReminder();
                break;
        }
    }
    
    async startTimer(duration, type = 'custom') {
        this.timerState = {
            isRunning: true,
            startTime: Date.now(),
            duration: duration,
            type: type
        };
        
        chrome.alarms.create('timer', {
            delayInMinutes: duration / 60
        });
        
        await chrome.storage.local.set({ timerState: this.timerState });
        
        // Update extension icon
        chrome.action.setBadgeText({ text: '⏱️' });
        chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
        chrome.action.setTitle({ title: 'Productivity Clock - Timer Running' });
    }
    
    startTimerAlarm() {
        const remainingTime = (this.timerState.startTime + this.timerState.duration * 1000) - Date.now();
        if (remainingTime > 0) {
            chrome.alarms.create('timer', {
                delayInMinutes: remainingTime / 60000
            });
        }
    }
    
    async stopTimer() {
        this.timerState.isRunning = false;
        
        chrome.alarms.clear('timer');
        
        await chrome.storage.local.set({ timerState: this.timerState });
        
        // Update extension icon
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setTitle({ title: 'Productivity Clock - Focus & Time Manager' });
    }
    
    async timerComplete() {
        this.timerState.isRunning = false;
        await chrome.storage.local.set({ timerState: this.timerState });
        
        chrome.action.setBadgeText({ text: '' });
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Timer Complete!',
            message: 'Your timer has finished.'
        });
        
        this.playSound('timer-complete');
    }
    
    async focusModeComplete() {
        const focusTime = Math.floor((Date.now() - this.focusState.startTime) / 1000);
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Focus Session Complete!',
            message: `Great job! You focused for ${Math.floor(focusTime / 60)} minutes.`
        });
        
        this.playSound('timer-complete');
        await this.stopFocusMode();
    }
    
    async sendBreakReminder() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Break Reminder',
            message: 'Time to take a break and stretch!'
        });
        
        this.playSound('break-time');
    }
    
    async checkTimeLimit(site) {
        const allowed = await this.isTimeLimitAllowed(site);
        const remaining = await this.getTimeLimitRemaining(site);
        
        if (!allowed && remaining !== null) {
            // Block the site and show time limit message
            await this.enableSiteBlocking([site]);
            
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'showTimeLimitWarning',
                        site: site,
                        remaining: remaining
                    });
                }
            });
        }
    }
    
    timeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    async startFocusMode(duration, blockedSites = []) {
        this.focusState = {
            isActive: true,
            startTime: Date.now(),
            duration: duration,
            blockedSites: blockedSites
        };
        
        chrome.alarms.create('focusMode', {
            delayInMinutes: duration / 60
        });
        
        await chrome.storage.local.set({ focusState: this.focusState });
        await this.enableSiteBlocking(blockedSites);
        
        // Update extension icon
        chrome.action.setBadgeText({ text: '🎯' });
        chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        chrome.action.setTitle({ title: 'Productivity Clock - Focus Mode Active' });
        
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'focusModeStarted',
                    duration: duration
                });
            });
        });
    }
    
    async stopFocusMode() {
        this.focusState.isActive = false;
        
        chrome.alarms.clear('focusMode');
        await this.disableSiteBlocking();
        await chrome.storage.local.set({ focusState: this.focusState });
        
        // Update extension icon
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setTitle({ title: 'Productivity Clock - Focus & Time Manager' });
        
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'focusModeStopped'
                });
            });
        });
    }
    
    async focusModeComplete() {
        const focusTime = Math.floor((Date.now() - this.focusState.startTime) / 1000);
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Focus Session Complete!',
            message: `Great job! You focused for ${Math.floor(focusTime / 60)} minutes.`
        });
        
        await this.updateStats({
            focusTime: focusTime,
            sessionsCompleted: 1
        });
        
        await this.stopFocusMode();
    }
    
    async enableSiteBlocking(blockedSites) {
        const rules = blockedSites.map((site, index) => ({
            id: index + 1,
            priority: 1,
            action: {
                type: 'redirect',
                redirect: {
                    extensionPath: '/floating/focus-block.html'
                }
            },
            condition: {
                urlFilter: `*://*.${site}/*`,
                resourceTypes: ['main_frame']
            }
        }));
        
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules
        });
    }
    
    async disableSiteBlocking() {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIds = rules.map(rule => rule.id);
        
        if (ruleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: ruleIds
            });
        }
    }
    
    async sendBreakReminder() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Break Time!',
            message: 'Time to take a break and stretch your legs.'
        });
    }
    
    async updateStats(stats) {
        const result = await chrome.storage.local.get(['todayStats']);
        let todayStats = result.todayStats || {
            focusTime: 0,
            tasksCompleted: 0,
            sessionsCompleted: 0,
            date: new Date().toDateString()
        };
        
        const today = new Date().toDateString();
        if (todayStats.date !== today) {
            todayStats = {
                focusTime: 0,
                tasksCompleted: 0,
                sessionsCompleted: 0,
                date: today
            };
        }
        
        if (stats.focusTime) {
            todayStats.focusTime += stats.focusTime;
        }
        
        if (stats.tasksCompleted) {
            todayStats.tasksCompleted += stats.tasksCompleted;
        }
        
        if (stats.sessionsCompleted) {
            todayStats.sessionsCompleted += stats.sessionsCompleted;
        }
        
        await chrome.storage.local.set({ todayStats: todayStats });
    }
    
    async getSettings() {
        const result = await chrome.storage.local.get(['settings']);
        return result.settings || {
            theme: 'default',
            soundEnabled: true,
            notificationsEnabled: true,
            breakReminders: true
        };
    }
    
    async playSound(soundName) {
        const settings = await this.getSettings();
        if (!settings.soundEnabled) return;
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'playSound',
                    sound: soundName
                });
            }
        });
    }
    
    async toggleFloatingClock() {
        const result = await chrome.storage.local.get(['clockVisible']);
        const isVisible = result.clockVisible || false;
        
        // Toggle the state
        const newState = !isVisible;
        await chrome.storage.local.set({ clockVisible: newState });
        
        // Send message to all tabs to toggle clock
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'toggleClock',
                visible: newState
            }).catch(() => {
                // Ignore errors for tabs that don't have content script
            });
        });
    }
    
    async initializeStorage() {
        const defaults = {
            settings: {
                theme: 'default',
                soundEnabled: true,
                notificationsEnabled: true,
                breakReminders: true,
                clockStyle: 'digital',
                clockPosition: { x: 20, y: 20 },
                clockSize: 'medium'
            },
            blockedSites: [
                'facebook.com',
                'twitter.com',
                'instagram.com',
                'youtube.com',
                'reddit.com',
                'netflix.com'
            ],
            todos: [],
            todayStats: {
                focusTime: 0,
                tasksCompleted: 0,
                sessionsCompleted: 0,
                date: new Date().toDateString()
            }
        };
        
        for (const [key, value] of Object.entries(defaults)) {
            const result = await chrome.storage.local.get(key);
            if (!result[key]) {
                await chrome.storage.local.set({ [key]: value });
            }
        }
    }
}

new BackgroundService();
