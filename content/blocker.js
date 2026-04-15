class ContentBlocker {
    constructor() {
        this.isFocusModeActive = false;
        this.blockedSites = [];
        this.whitelist = [];
        this.blockedAttempts = 0;
        
        this.init();
    }
    
    async init() {
        await this.loadSettings();
        this.setupMessageHandlers();
        this.checkCurrentPage();
        this.injectFloatingClock();
        this.checkScheduledBlocking();
        this.checkTimeLimit();
        this.restoreClockVisibility();
    }
    
    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'focusModeStarted':
                await this.startFocusMode(message.duration);
                break;
                
            case 'focusModeStopped':
                await this.stopFocusMode();
                break;
                
            case 'toggleClock':
                this.toggleFloatingClock();
                break;
                
            case 'playSound':
                this.playSound(message.sound);
                break;
                
            case 'updateBlockList':
                await this.updateBlockList(message.blockedSites, message.whitelist);
                break;
                
            case 'showTimeLimitWarning':
                this.showTimeLimitWarning(message.site, message.remaining);
                break;
        }
    }
    
    async loadSettings() {
        const result = await chrome.storage.local.get(['focusState', 'blockedSites', 'whitelist', 'scheduledBlocking', 'timeLimits']);
        
        if (result.focusState) {
            this.isFocusModeActive = result.focusState.isActive;
        }
        
        this.blockedSites = result.blockedSites || [];
        this.whitelist = result.whitelist || [];
        this.scheduledBlocking = result.scheduledBlocking || { enabled: false };
        this.timeLimits = result.timeLimits || [];
    }
    
    async checkScheduledBlocking() {
        const isActive = await this.isScheduledBlockingActive();
        if (isActive) {
            await this.enableScheduledBlocking();
        } else {
            await this.disableScheduledBlocking();
        }
    }
    
    async checkTimeLimit() {
        const currentDomain = this.getCurrentDomain();
        const allowed = await this.isTimeLimitAllowed(currentDomain);
        const remaining = await this.getTimeLimitRemaining(currentDomain);
        
        if (!allowed && remaining !== null) {
            // Block site and show time limit message
            await this.enableSiteBlocking([currentDomain]);
            
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'showTimeLimitWarning',
                        site: currentDomain,
                        remaining: remaining
                    });
                }
            });
        }
    }
    
    shouldBlockCurrentSite() {
        const currentDomain = this.getCurrentDomain();
        
        if (this.whitelist.some(site => currentDomain.includes(site))) {
            return false;
        }
        
        return this.blockedSites.some(site => currentDomain.includes(site));
    }
    
    getCurrentDomain() {
        const hostname = window.location.hostname;
        return hostname.replace('www.', '');
    }
    
    blockCurrentPage() {
        this.blockedAttempts++;
        this.logBlockedAttempt();
        
        document.body.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 20px;
            ">
                <div style="max-width: 600px;">
                    <h1 style="font-size: 3rem; margin-bottom: 20px; font-weight: 300;">🎯 Focus Mode Active</h1>
                    <p style="font-size: 1.2rem; margin-bottom: 30px; opacity: 0.9;">
                        This site is blocked during your focus session. Stay focused on your important tasks!
                    </p>
                    <div style="background: rgba(255, 255, 255, 0.1); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
                        <h2 style="margin-bottom: 20px;">💡 Quick Break Ideas</h2>
                        <ul style="text-align: left; font-size: 1.1rem; line-height: 1.8;">
                            <li>Take 5 deep breaths</li>
                            <li>Stretch your arms and neck</li>
                            <li>Drink a glass of water</li>
                            <li>Look at something 20 feet away for 20 seconds</li>
                            <li>Stand up and walk around for 2 minutes</li>
                        </ul>
                    </div>
                    <div style="margin-bottom: 30px;">
                        <p style="font-size: 1.1rem; margin-bottom: 15px;">Blocked attempts this session: <strong>${this.blockedAttempts}</strong></p>
                        <p style="opacity: 0.8;">You're doing great! Every blocked attempt makes you stronger.</p>
                    </div>
                    <button id="emergencyOverride" style="
                        background: rgba(220, 53, 69, 0.2);
                        border: 2px solid rgba(220, 53, 69, 0.5);
                        color: white;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 1rem;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">
                        Emergency Override (Break Focus)
                    </button>
                    <p style="font-size: 0.9rem; opacity: 0.7; margin-top: 10px;">
                        Use only when absolutely necessary. This will end your focus session.
                    </p>
                </div>
            </div>
        `;
        
        document.getElementById('emergencyOverride').addEventListener('click', () => {
            this.emergencyOverride();
        });
        
        this.updateBlockedAttempts();
    }
    
    async emergencyOverride() {
        const reason = prompt('Please enter the reason for breaking focus mode:');
        if (reason && reason.trim()) {
            await this.logEmergencyOverride(reason.trim());
            chrome.runtime.sendMessage({
                action: 'stopFocusMode'
            });
            
            location.reload();
        }
    }
    
    async startFocusMode(duration) {
        this.isFocusModeActive = true;
        this.blockedAttempts = 0;
        
        if (this.shouldBlockCurrentSite()) {
            this.blockCurrentPage();
        }
        
        this.showFocusNotification();
    }
    
    async stopFocusMode() {
        this.isFocusModeActive = false;
        
        if (document.body.innerHTML.includes('Focus Mode Active')) {
            location.reload();
        }
    }
    
    showFocusNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 10001;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🎯</span>
                <div>
                    <strong>Focus Mode Started</strong>
                    <div style="font-size: 12px; opacity: 0.9;">Distractions are now blocked</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    injectFloatingClock() {
        if (document.getElementById('floatingClockFrame')) {
            return;
        }
        
        const iframe = document.createElement('iframe');
        iframe.id = 'floatingClockFrame';
        iframe.src = chrome.runtime.getURL('floating/clock.html');
        iframe.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 280px;
            height: auto;
            border: none;
            z-index: 9999;
            pointer-events: auto;
        `;
        
        document.body.appendChild(iframe);
    }
    
    async restoreClockVisibility() {
        const result = await chrome.storage.local.get(['clockVisible']);
        const isVisible = result.clockVisible || false;
        
        const iframe = document.getElementById('floatingClockFrame');
        if (iframe) {
            iframe.style.display = isVisible ? 'block' : 'none';
        }
    }
    
    toggleFloatingClock() {
        const iframe = document.getElementById('floatingClockFrame');
        if (iframe) {
            if (iframe.style.display === 'none') {
                iframe.style.display = 'block';
            } else {
                iframe.style.display = 'none';
            }
        } else {
            this.injectFloatingClock();
        }
    }
    
    notification.innerHTML = `
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">
            ⏰ Time Limit Reached
        </div>
        <div style="font-size: 14px; margin-bottom: 15px;">
            Site: <strong>${site}</strong><br>
            Time remaining: <strong>${Math.floor(remaining / 60)}h ${remaining % 60}m</strong><br>
            <small>This site will be unblocked at midnight or when time limit resets.</small>
        </div>
        <div style="margin-top: 15px;">
            <button onclick="this.parentElement.remove()" style="
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: #333;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            ">Close</button>
        </div>
    `;
    
    document.body.appendChild(notification);
}

async logBlockedAttempt() {
    const result = await chrome.storage.local.get(['blockedAttempts']);
    const attempts = result.blockedAttempts || [];
    
    attempts.push({
        url: window.location.href,
        domain: this.getCurrentDomain(),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
    });
            tasksCompleted: 0,
            sessionsCompleted: 0,
            date: new Date().toDateString(),
            blockedAttempts: 0
        };
        
        const today = new Date().toDateString();
        if (stats.date !== today) {
            stats.blockedAttempts = 0;
            stats.date = today;
        }
        
        stats.blockedAttempts++;
        await chrome.storage.local.set({ todayStats: stats });
    }
    
    async logEmergencyOverride(reason) {
        const result = await chrome.storage.local.get(['emergencyOverrides']);
        const overrides = result.emergencyOverrides || [];
        
        overrides.push({
            reason: reason,
            url: window.location.href,
            domain: this.getCurrentDomain(),
            timestamp: new Date().toISOString(),
            blockedAttempts: this.blockedAttempts
        });
        
        await chrome.storage.local.set({ emergencyOverrides: overrides });
    }
    
    async updateBlockList(blockedSites, whitelist) {
        this.blockedSites = blockedSites;
        this.whitelist = whitelist;
        
        if (this.isFocusModeActive && this.shouldBlockCurrentSite()) {
            this.blockCurrentPage();
        }
        
        this.checkScheduledBlocking();
        this.checkTimeLimit();
    }
}

if (typeof window !== 'undefined' && window.location.protocol !== 'chrome-extension:') {
    new ContentBlocker();
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
