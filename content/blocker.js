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
                if (message.visible !== undefined) {
                    // Set visibility to specific state
                    this.setClockVisibility(message.visible);
                } else {
                    // Toggle current state
                    this.toggleFloatingClock();
                }
                // Send response back to background
                if (sendResponse) {
                    sendResponse({ success: true });
                }
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
        const result = await chrome.storage.local.get(['scheduledBlocking']);
        const scheduled = result.scheduledBlocking || { enabled: false };
        
        if (scheduled.enabled && this.isInScheduledTime(scheduled)) {
            await this.enableScheduledBlocking();
        } else {
            await this.disableScheduledBlocking();
        }
    }
    
    isInScheduledTime(scheduled) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const dayOfWeek = now.getDay();
        
        // Check if current day is enabled
        if (scheduled.days && !scheduled.days.includes(dayOfWeek)) {
            return false;
        }
        
        // Check if current time is within scheduled range
        if (scheduled.startTime && scheduled.endTime) {
            const [startHour, startMin] = scheduled.startTime.split(':').map(Number);
            const [endHour, endMin] = scheduled.endTime.split(':').map(Number);
            const startTime = startHour * 60 + startMin;
            const endTime = endHour * 60 + endMin;
            
            return currentTime >= startTime && currentTime <= endTime;
        }
        
        return false;
    }
    
    async checkTimeLimit() {
        const currentDomain = this.getCurrentDomain();
        
        // Check if time limits are enabled
        const result = await chrome.storage.local.get(['timeLimits']);
        const timeLimits = result.timeLimits || [];
        
        const limit = timeLimits.find(limit => limit.site === currentDomain);
        if (!limit) {
            return; // No limit set for this site
        }
        
        const today = new Date().toDateString();
        let usedToday = limit.usedToday || 0;
        
        // Reset daily usage at midnight
        if (limit.lastReset !== today) {
            usedToday = 0;
            limit.lastReset = today;
            limit.usedToday = 0;
            await chrome.storage.local.set({ timeLimits });
        }
        
        const remaining = Math.max(0, limit.minutes - usedToday);
        
        if (remaining <= 0) {
            // Block site and show time limit message
            await this.enableSiteBlocking([currentDomain]);
            
            this.showTimeLimitWarning(currentDomain, 0);
        } else if (remaining <= 5) {
            // Show warning when 5 minutes or less remaining
            this.showTimeLimitWarning(currentDomain, remaining);
        }
    }
    
    checkCurrentPage() {
        console.log('ContentBlocker: checkCurrentPage called');
        console.log('ContentBlocker: Focus mode active:', this.isFocusModeActive);
        console.log('ContentBlocker: Should block current site:', this.shouldBlockCurrentSite());
        
        // Check if focus mode is active and current site should be blocked
        if (this.isFocusModeActive && this.shouldBlockCurrentSite()) {
            console.log('ContentBlocker: Blocking current page due to focus mode');
            this.blockCurrentPage();
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
        console.log('ContentBlocker: blockCurrentPage called');
        
        // Inject the focus block page
        const iframe = document.createElement('iframe');
        iframe.src = chrome.runtime.getURL('floating/focus-block.html');
        iframe.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            z-index: 999999;
            background: white;
        `;
        
        document.body.innerHTML = '';
        document.body.appendChild(iframe);
        
        this.blockedAttempts++;
        this.logBlockedAttempt();
    }
    
    async enableSiteBlocking(sites) {
        console.log('ContentBlocker: enableSiteBlocking called with sites:', sites);
        this.blockedSites = sites;
        
        if (this.shouldBlockCurrentSite()) {
            this.blockCurrentPage();
        }
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
        console.log('ContentBlocker: startFocusMode called with duration:', duration);
        this.isFocusModeActive = true;
        this.blockedAttempts = 0;
        
        // Get blocked sites from storage or use default
        const result = await chrome.storage.local.get(['blockedSites']);
        this.blockedSites = result.blockedSites || [
            'facebook.com', 'twitter.com', 'instagram.com', 
            'youtube.com', 'tiktok.com', 'reddit.com', 'netflix.com'
        ];
        
        console.log('ContentBlocker: Blocked sites:', this.blockedSites);
        
        if (this.shouldBlockCurrentSite()) {
            console.log('ContentBlocker: Blocking current site');
            this.blockCurrentPage();
        } else {
            console.log('ContentBlocker: Current site not in blocklist');
        }
        
        this.showFocusNotification();
    }
    
    async stopFocusMode() {
        console.log('ContentBlocker: stopFocusMode called');
        this.isFocusModeActive = false;
        
        if (document.body.innerHTML.includes('Focus Mode Active')) {
            location.reload();
        }
    }
    
    showFocusNotification() {
        // Show notification that focus mode started
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px;
            max-width: 300px;
        `;
        
        notification.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">
                🎯 Focus Mode Active
            </div>
            <div style="font-size: 13px;">
                Blocking distracting sites. Stay focused!
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    injectFloatingClock() {
        console.log('ContentBlocker: injectFloatingClock called');
        
        if (document.getElementById('floatingClockFrame')) {
            console.log('ContentBlocker: Clock iframe already exists');
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
            resize: both;
            overflow: auto;
            min-width: 200px;
            min-height: 100px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            border-radius: 8px;
        `;
        
        // Make draggable
        this.makeDraggable(iframe);
        
        document.body.appendChild(iframe);
        console.log('ContentBlocker: Clock iframe injected');
        
        // Set initial visibility based on stored state
        this.restoreClockVisibility();
    }
    
    makeDraggable(element) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        const dragStart = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) {
                return; // Don't drag when clicking buttons/inputs
            }
            
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            
            if (e.target === element || element.contains(e.target)) {
                isDragging = true;
            }
        };
        
        const dragEnd = () => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        };
        
        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                
                if (e.type === "touchmove") {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                
                xOffset = currentX;
                yOffset = currentY;
                
                element.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        };
        
        // Add event listeners
        element.addEventListener('touchstart', dragStart, false);
        element.addEventListener('touchend', dragEnd, false);
        element.addEventListener('touchmove', drag, false);
        
        element.addEventListener('mousedown', dragStart, false);
        element.addEventListener('mouseup', dragEnd, false);
        element.addEventListener('mousemove', drag, false);
    }
    
    async restoreClockVisibility() {
        const result = await chrome.storage.local.get(['clockVisible']);
        const isVisible = result.clockVisible || false;
        
        console.log('ContentBlocker: Restoring clock visibility:', isVisible);
        
        const iframe = document.getElementById('floatingClockFrame');
        if (iframe) {
            iframe.style.display = isVisible ? 'block' : 'none';
            console.log('ContentBlocker: Set iframe display to:', iframe.style.display);
        }
    }
    
    toggleFloatingClock() {
        console.log('ContentBlocker: toggleFloatingClock called');
        
        const iframe = document.getElementById('floatingClockFrame');
        if (iframe) {
            // Toggle visibility
            const isVisible = iframe.style.display !== 'none';
            iframe.style.display = isVisible ? 'none' : 'block';
            
            console.log('ContentBlocker: Toggled clock from', isVisible, 'to', !isVisible);
            
            // Update storage
            chrome.storage.local.set({ clockVisible: !isVisible });
        } else {
            console.log('ContentBlocker: No iframe found, injecting new clock');
            // Inject clock if it doesn't exist
            this.injectFloatingClock();
        }
    }
    
    setClockVisibility(visible) {
        console.log('ContentBlocker: setClockVisibility called with:', visible);
        
        const iframe = document.getElementById('floatingClockFrame');
        if (iframe) {
            iframe.style.display = visible ? 'block' : 'none';
            console.log('ContentBlocker: Set clock visibility to:', visible);
            
            // Update storage
            chrome.storage.local.set({ clockVisible: visible });
        } else if (visible) {
            // Inject clock if it doesn't exist and should be visible
            this.injectFloatingClock();
        }
    }
    
    async enableScheduledBlocking() {
        console.log('ContentBlocker: enableScheduledBlocking called');
        const result = await chrome.storage.local.get(['blockedSites']);
        this.blockedSites = result.blockedSites || [];
        
        if (this.shouldBlockCurrentSite()) {
            this.blockCurrentPage();
        }
    }
    
    async disableScheduledBlocking() {
        console.log('ContentBlocker: disableScheduledBlocking called');
        // Reload page if currently blocked by scheduled blocking
        if (document.body.innerHTML.includes('Focus Mode Active')) {
            location.reload();
        }
    }
    
    async showTimeLimitWarning(site, remaining) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 300px;
        `;
        
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
        
        await chrome.storage.local.set({ blockedAttempts: attempts });
    }
    
    async updateBlockedAttempts() {
        const result = await chrome.storage.local.get(['todayStats']);
        let stats = result.todayStats || {
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
            url: window.location.href,
            domain: this.getCurrentDomain(),
            reason: reason,
            timestamp: new Date().toISOString()
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
    
    // NEW: Play sound method
    playSound(soundName) {
        try {
            const audio = new Audio(chrome.runtime.getURL(`assets/sounds/${soundName}.mp3`));
            audio.play().catch(error => {
                console.log('Sound play failed:', error);
            });
        } catch (error) {
            console.log('Sound creation failed:', error);
        }
    }
}

if (typeof window !== 'undefined' && window.location.protocol !== 'chrome-extension:') {
    new ContentBlocker();
}
