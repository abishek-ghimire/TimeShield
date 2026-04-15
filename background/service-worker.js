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
        
        this.init();
    }
    
    init() {
        this.setupMessageHandlers();
        this.setupAlarmHandlers();
        this.initializeStorage();
    }
    
    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
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
                
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }
    
    setupAlarmHandlers() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            this.handleAlarm(alarm);
        });
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
        
        chrome.action.setBadgeText({ text: '⏱️' });
        chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
    }
    
    async stopTimer() {
        this.timerState.isRunning = false;
        
        chrome.alarms.clear('timer');
        
        await chrome.storage.local.set({ timerState: this.timerState });
        
        chrome.action.setBadgeText({ text: '' });
    }
    
    async timerComplete() {
        const settings = await this.getSettings();
        
        if (settings.notificationsEnabled) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/icon48.png',
                title: 'Timer Complete!',
                message: 'Your timer has finished. Time for a break!'
            });
        }
        
        if (settings.soundEnabled) {
            await this.playSound('timer-complete');
        }
        
        this.timerState.isRunning = false;
        await chrome.storage.local.set({ timerState: this.timerState });
        
        chrome.action.setBadgeText({ text: '' });
        
        await this.updateStats({
            sessionsCompleted: 1
        });
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
        
        await this.enableSiteBlocking(blockedSites);
        await chrome.storage.local.set({ focusState: this.focusState });
        
        chrome.action.setBadgeText({ text: '🎯' });
        chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        
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
        
        chrome.action.setBadgeText({ text: '' });
        
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
