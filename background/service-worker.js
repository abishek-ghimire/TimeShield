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
        this.restoreState();
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
        
        chrome.action.setBadgeText({ text: '⏱️' });
        chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
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
        
        chrome.action.setBadgeText({ text: '' });
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
