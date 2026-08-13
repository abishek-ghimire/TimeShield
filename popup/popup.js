class PopupController {
    constructor() {
        this.socialMediaSites = [
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
        ];

        this.elements = {
            currentTime: document.getElementById('currentTime'),
            timerDisplay: document.getElementById('timerDisplay'),
            timerInputsContainer: document.getElementById('timerInputsContainer'),
            timerMinutes: document.getElementById('timerMinutes'),
            timerSeconds: document.getElementById('timerSeconds'),
            todoList: document.getElementById('todoList'),
            startTimerBtn: document.getElementById('startTimer'),
            startFocusBtn: document.getElementById('startFocus'),
            syncStatusText: document.getElementById('syncStatusText'),
            syncLastSyncedText: document.getElementById('syncLastSyncedText')
        };

        this.state = {
            timerInterval: null,
            clockInterval: null,
            timerRemaining: 0,
            isTimerRunning: false,
            focusInterval: null,
            isPaused: false
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.startClock();
        await this.loadAllData();
    }

    async loadAllData() {
        const tasks = [
            ['settings', () => this.loadSettings()],
            ['todos', () => this.loadTodos()],
            ['timer state', () => this.restoreTimerState()],
            ['current site', () => this.loadCurrentSite()],
            ['pause state', () => this.checkPauseState()],
            ['protection status', () => this.refreshProtectionStatus()],
            ['sync status', () => this.refreshSyncStatus()]
        ];
        const results = await Promise.allSettled(tasks.map(([, task]) => task()));
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Failed to load ${tasks[index][0]}:`, result.reason);
            }
        });
    }



    async refreshProtectionStatus() {
        const response = await chrome.runtime.sendMessage({ action: 'getProtectionStatus' }).catch(() => null);
        const status = response?.status;
        const main = document.getElementById('popupProtectionStatus');
        const meta = document.getElementById('popupProtectionMeta');
        const dot = document.getElementById('protectionStatusDot');
        if (!main || !meta || !dot) return;

        dot.className = 'status-dot';
        if (status?.paused) {
            dot.classList.add('is-paused');
            main.textContent = 'Protection paused';
            meta.textContent = status.pauseUntil ? `Resumes ${new Date(status.pauseUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Paused until resumed';
        } else if (status?.safeMode) {
            dot.classList.add('is-safe');
            main.textContent = 'Safe mode enabled';
            meta.textContent = 'Automatic redirects are paused';
        } else if (status?.focusActive) {
            main.textContent = 'Focus Mode active';
            meta.textContent = 'Distraction protection is running';
        } else if (status?.sleepActive) {
            main.textContent = 'Sleep protection active';
            meta.textContent = 'Your sleep window is enforcing';
        } else if (status?.scheduleActive) {
            main.textContent = 'Scheduled protection active';
            meta.textContent = 'Your current schedule is enforcing';
        } else {
            dot.classList.add('is-idle');
            main.textContent = 'Protection ready';
            meta.textContent = `${Math.round((status?.todaySeconds || 0) / 60)} minutes tracked today`;
        }
    }

    setupEventListeners() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (!el) {
                console.warn('Button not found:', id);
                return;
            }
            el.addEventListener('click', async (event) => {
                if (el.disabled) return;
                el.disabled = true;
                try {
                    await fn(event);
                } catch (error) {
                    console.error(`Popup action failed: ${id}`, error);
                    this.showToast('Action failed. Please try again.');
                } finally {
                    el.disabled = false;
                }
            });
        };

        bind('toggleClock', () => this.toggleFloatingClock());
        bind('flipClockMode', () => this.openFlipClockTab());
        bind('pauseProtectionMode', () => this.handlePauseProtection());
        bind('blockSocialMedia', () => this.blockSocialMedia());
        bind('syncNowButton', () => this.syncNow());
        bind('openSyncSettings', () => chrome.runtime.openOptionsPage());
        bind('startFocus', () => this.handleFocusMode());
        bind('openSettings', () => chrome.runtime.openOptionsPage());
        bind('startTimer', () => this.toggleTimer());
        bind('addTask', () => this.addTask());
        bind('blockElement', () => this.startElementPicker());
        bind('toggleFormat', () => this.toggleTimeFormat());
        bind('updateFilters', () => this.updateFilters());
        bind('refreshPopupStatus', () => this.refreshProtectionStatus());

        // Quick-add current site buttons
        const addToFocusBtn = document.getElementById('addToFocus');
        const addToScheduleBtn = document.getElementById('addToSchedule');
        if (addToFocusBtn) addToFocusBtn.addEventListener('click', () => this.addCurrentSiteToFocus());
        if (addToScheduleBtn) addToScheduleBtn.addEventListener('click', () => this.addCurrentSiteToSchedule());

        this.elements.timerMinutes?.addEventListener('input', () => this.syncTimerInputs());
        this.elements.timerSeconds?.addEventListener('input', () => this.syncTimerInputs());

        const restoreStatusWidget = async () => {
            const response = await chrome.runtime.sendMessage({ action: 'showStatusWidget' });
            if (response?.success === false) {
                throw new Error(response.error || 'Unable to restore status widget');
            }
            window.close();
        };
        document.getElementById('restoreFocusBtn')?.addEventListener('click', restoreStatusWidget);
        document.getElementById('restoreTimerBtn')?.addEventListener('click', restoreStatusWidget);

        // Ad blocker toggle
        const adBlockToggle = document.getElementById('adBlockToggle');
        adBlockToggle?.addEventListener('change', async (event) => {
            try {
                const response = await chrome.runtime.sendMessage({ action: 'toggleAdBlock', enabled: event.target.checked });
                if (response?.success === false) throw new Error(response.error || 'Unable to update ad blocker');
                this.showToast(event.target.checked ? 'Ad blocking enabled.' : 'Ad blocking disabled.');
            } catch (error) {
                event.target.checked = !event.target.checked;
                this.showToast('Unable to update ad blocking. Please try again.');
                console.error('Failed to toggle ad blocker:', error);
            }
        });

        // Widget display toggles
        document.getElementById('focusTimerWidgetToggle')?.addEventListener('change', (event) => {
            this.updateWidgetSetting('focusTimerWidgetEnabled', event.target.checked).catch((error) => {
                console.error('Failed to update focus widget setting:', error);
            });
        });
        document.getElementById('timerWidgetToggle')?.addEventListener('change', (event) => {
            this.updateWidgetSetting('timerWidgetEnabled', event.target.checked).catch((error) => {
                console.error('Failed to update timer widget setting:', error);
            });
        });
    }

    async refreshSyncStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getSyncStatus' });
            const status = response?.syncStatus || { state: 'offline', lastSynced: null, error: null };
            this.renderSyncStatus(status);
        } catch (error) {
            this.renderSyncStatus({ state: 'offline', lastSynced: null, error: error.message || 'Sync unavailable' });
        }
    }

    renderSyncStatus(status) {
        if (this.elements.syncStatusText) {
            const labelMap = {
                syncing: 'Syncing',
                synced: 'Synced',
                offline: 'Offline',
                failed: 'Sync Failed'
            };
            this.elements.syncStatusText.textContent = status?.conflict ? 'Conflict Needs Review' : (labelMap[status?.state] || 'Offline');
        }

        if (this.elements.syncLastSyncedText) {
            this.elements.syncLastSyncedText.textContent = status?.lastSynced
                ? `Last synced: ${new Date(status.lastSynced).toLocaleString()}`
                : 'Last synced: never';
        }
    }

    async syncNow() {
        const button = document.getElementById('syncNowButton');
        const originalText = button?.textContent;
        if (button) {
            button.textContent = 'Syncing...';
            button.disabled = true;
        }

        try {
            await chrome.runtime.sendMessage({ action: 'syncNow', force: true });
            await this.refreshSyncStatus();
            this.showToast('Cloud sync started.');
        } catch (error) {
            this.showToast('Sync failed. Open settings to check your account.');
        } finally {
            if (button) {
                button.textContent = originalText || 'Sync Now';
                button.disabled = false;
            }
        }
    }

    async updateWidgetSetting(key, enabled) {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {};
        settings[key] = enabled;
        await chrome.storage.local.set({ settings });
        // Trigger a check in active tabs
        chrome.runtime.sendMessage({ action: 'settingsUpdated' }).catch(() => { });
    }

    syncTimerInputs() {
        if (this.state.isTimerRunning) return;
        const mins = parseInt(this.elements.timerMinutes.value) || 0;
        const secs = parseInt(this.elements.timerSeconds.value) || 0;
        this.elements.timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }





    async restoreTimerState() {
        const response = await chrome.runtime.sendMessage({ action: 'getState' });
        const result = response || { timerState: { isRunning: false }, focusState: { isActive: false }, adBlockEnabled: true };

        if (result.timerState?.isRunning) {
            const elapsed = Math.floor((Date.now() - result.timerState.startTime) / 1000);
            this.state.timerRemaining = Math.max(0, result.timerState.duration - elapsed);
            this.state.isTimerRunning = true;
            this.startTimerInterval();
            this.elements.startTimerBtn.textContent = 'Stop Flow';
            this.elements.startTimerBtn.classList.add('btn-focus');
            this.elements.timerInputsContainer.style.display = 'none';
            this.elements.timerDisplay.style.display = 'block';
        }

        if (result.focusState?.isActive) {
            this.elements.startFocusBtn.classList.add('active');
            this.startFocusInterval(result.focusState);
        } else if (result.pendingFocusActivation?.activationAt) {
            this.elements.startFocusBtn.classList.add('active');
            this.startPendingFocusInterval(result.pendingFocusActivation.activationAt);
        }

        // Check if we need to show the "Restore" buttons
        const clockRes = await chrome.storage.local.get(['clockVisible']);
        const restoreFocusBtn = document.getElementById('restoreFocusBtn');
        const restoreTimerBtn = document.getElementById('restoreTimerBtn');

        if (restoreFocusBtn) {
            restoreFocusBtn.style.display = ((result.focusState?.isActive || result.pendingFocusActivation) && !clockRes.clockVisible) ? 'flex' : 'none';
        }
        if (restoreTimerBtn) {
            restoreTimerBtn.style.display = (result.timerState?.isRunning && !clockRes.clockVisible) ? 'flex' : 'none';
        }

        if (result.adBlockEnabled !== undefined) {
            document.getElementById('adBlockToggle').checked = result.adBlockEnabled;
        }
    }

    startFocusInterval(focusState) {
        if (this.state.focusInterval) clearInterval(this.state.focusInterval);

        const updateText = () => {
            const elapsed = Math.floor((Date.now() - focusState.startTime) / 1000);
            const remaining = Math.max(0, focusState.duration - elapsed);

            if (remaining > 0) {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                this.elements.startFocusBtn.textContent = `Focus: ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                this.elements.startFocusBtn.textContent = 'Focus Mode';
                this.elements.startFocusBtn.classList.remove('active');
                clearInterval(this.state.focusInterval);
            }
        };

        updateText();
        this.state.focusInterval = setInterval(updateText, 1000);
    }

    startPendingFocusInterval(activationAt) {
        if (this.state.focusInterval) clearInterval(this.state.focusInterval);

        const updateText = () => {
            const remaining = Math.max(0, Math.floor((activationAt - Date.now()) / 1000));
            if (remaining > 0) {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                this.elements.startFocusBtn.textContent = `Starts: ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                this.elements.startFocusBtn.textContent = 'Focus Mode';
                this.elements.startFocusBtn.classList.remove('active');
                clearInterval(this.state.focusInterval);
            }
        };

        updateText();
        this.state.focusInterval = setInterval(updateText, 1000);
    }

    async startClock() {
        if (this.state.clockInterval) clearInterval(this.state.clockInterval);

        const update = async () => {
            try {
                const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
                const is12h = settings?.timeFormat === '12h';
                if (this.elements.currentTime) {
                    this.elements.currentTime.textContent = new Date().toLocaleTimeString('en-US', {
                        hour12: is12h,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                }
                const formatButton = document.getElementById('toggleFormat');
                if (formatButton) formatButton.textContent = is12h ? '12H' : '24H';
            } catch (error) {
                console.error('Failed to update popup clock:', error);
            }
        };
        await update();
        this.state.clockInterval = setInterval(update, 1000);
    }

    async toggleTimeFormat() {
        try {
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            const newFormat = settings?.timeFormat === '12h' ? '24h' : '12h';
            const response = await chrome.runtime.sendMessage({ action: 'setTimeFormat', format: newFormat });
            if (response?.success === false) throw new Error(response.error || 'Unable to change time format');
            await this.startClock();
        } catch (error) {
            console.error('Failed to change time format:', error);
            this.showToast('Unable to change time format.');
        }
    }

    async toggleTimer() {
        if (this.state.isTimerRunning) {
            await this.stopTimer();
            return;
        }
        const mins = parseInt(this.elements.timerMinutes?.value, 10) || 0;
        const secs = parseInt(this.elements.timerSeconds?.value, 10) || 0;
        await this.startTimer(mins * 60 + secs);
    }

    async startTimer(seconds) {
        if (!Number.isFinite(seconds) || seconds <= 0) {
            this.showToast('Enter a timer duration greater than zero.');
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({ action: 'startTimer', duration: seconds });
            if (response?.success === false) throw new Error(response.error || 'Unable to start timer');
        } catch (error) {
            console.error('Failed to start timer:', error);
            this.showToast('Unable to start the timer.');
            return;
        }

        this.state.timerRemaining = seconds;
        this.state.isTimerRunning = true;
        this.elements.startTimerBtn.textContent = 'Stop Flow';
        this.elements.startTimerBtn.classList.add('btn-focus');
        this.elements.timerInputsContainer.style.display = 'none';
        this.elements.timerDisplay.style.display = 'block';
        this.startTimerInterval();
    }

    startTimerInterval() {
        if (this.state.timerInterval) clearInterval(this.state.timerInterval);
        this.state.timerInterval = setInterval(() => {
            if (this.state.timerRemaining > 0) {
                this.state.timerRemaining--;
                const mins = Math.floor(this.state.timerRemaining / 60);
                const secs = this.state.timerRemaining % 60;
                this.elements.timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                this.stopTimer();
            }
        }, 1000);
    }

    async stopTimer() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'stopTimer' });
            if (response?.success === false) throw new Error(response.error || 'Unable to stop timer');
        } catch (error) {
            console.error('Failed to stop timer:', error);
            this.showToast('Unable to stop the timer.');
            return;
        }

        this.state.isTimerRunning = false;
        clearInterval(this.state.timerInterval);
        this.elements.startTimerBtn.textContent = 'Start Flow';
        this.elements.startTimerBtn.classList.remove('btn-focus');
        this.elements.timerInputsContainer.style.display = 'flex';
        this.elements.timerDisplay.style.display = 'none';
        this.syncTimerInputs();
    }

    async handleFocusMode() {
        const result = await chrome.storage.local.get(['focusState', 'pendingFocusActivation']);
        if (result.focusState?.isActive) {
            const canStop = await this.runProtectionSequence('Stop Focus Mode');
            if (!canStop) return;

            await chrome.runtime.sendMessage({ action: 'authorizeDisableActions', ttlMs: 45000 });
            const response = await chrome.runtime.sendMessage({ action: 'stopFocusMode' });
            if (response?.success) {
                if (this.state.focusInterval) clearInterval(this.state.focusInterval);
                this.elements.startFocusBtn.textContent = 'Focus Mode';
                this.elements.startFocusBtn.classList.remove('active');
            } else {
                alert('Focus protection is active. Please complete verification and try again.');
            }
        } else if (result.pendingFocusActivation) {
            const canCancel = await this.runProtectionSequence('Cancel pending Focus Mode');
            if (!canCancel) return;

            await chrome.runtime.sendMessage({ action: 'authorizeDisableActions', ttlMs: 45000 });
            const response = await chrome.runtime.sendMessage({ action: 'cancelPendingFocusMode' });
            if (response?.success) {
                if (this.state.focusInterval) clearInterval(this.state.focusInterval);
                this.elements.startFocusBtn.textContent = 'Focus Mode';
                this.elements.startFocusBtn.classList.remove('active');
            } else {
                alert('Focus protection is active. Please complete verification and try again.');
            }
        } else {
            const mins = prompt('Focus duration (minutes):', '25');
            const durationMinutes = Math.floor(Number(mins));
            if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                if (mins !== null) this.showToast('Enter a focus duration greater than zero.');
                return;
            }
            const response = await chrome.runtime.sendMessage({
                action: 'startFocusMode',
                duration: durationMinutes * 60,
                startAfterMinutes: 1
            });
            if (response?.success === false) {
                throw new Error(response.error || 'Unable to start focus mode');
            }
            window.close();
        }
    }

    async blockSocialMedia() {
        const result = await chrome.storage.local.get(['focusState', 'pendingFocusActivation']);
        const focusState = result.focusState || {};
        const pendingFocus = result.pendingFocusActivation || null;
        const pendingSites = Array.isArray(pendingFocus?.focusBlockedSites) ? pendingFocus.focusBlockedSites : [];
        
        // Check if social media blocking is currently active
        const isSocialMediaBlocked = (focusState.isActive &&
            focusState.focusBlockedSites &&
            this.socialMediaSites.every(site => focusState.focusBlockedSites.includes(site))) ||
            (pendingFocus && this.socialMediaSites.every(site => pendingSites.includes(site)));

        if (isSocialMediaBlocked) {
            const canStop = await this.runProtectionSequence('Disable Social Media Focus Block');
            if (!canStop) return;

            await chrome.runtime.sendMessage({ action: 'authorizeDisableActions', ttlMs: 45000 });
            const response = focusState.isActive
                ? await chrome.runtime.sendMessage({ action: 'stopFocusMode' })
                : await chrome.runtime.sendMessage({ action: 'cancelPendingFocusMode' });
            if (response?.success) {
                this.showToast('Social media block disabled.');
                this.updateSocialMediaButton(false);
            } else {
                alert('Focus protection is active. Please complete verification and try again.');
                return;
            }
        } else {
            // Enable social media blocking
            const response = await chrome.runtime.sendMessage({
                action: 'startFocusMode',
                duration: 25 * 60,
                focusBlockedSites: this.socialMediaSites,
                startAfterMinutes: 1
            });
            if (response?.success === false) {
                throw new Error(response.error || 'Unable to enable social media blocking');
            }
            this.showToast('Social media block will start in 1 minute.');
            this.updateSocialMediaButton(true);
        }
        window.close();
    }

    async checkSocialMediaBlockState() {
        const result = await chrome.storage.local.get(['focusState', 'pendingFocusActivation']);
        const focusState = result.focusState || {};
        const pendingFocus = result.pendingFocusActivation || null;
        const pendingSites = Array.isArray(pendingFocus?.focusBlockedSites) ? pendingFocus.focusBlockedSites : [];
        
        const isSocialMediaBlocked = (focusState.isActive &&
            focusState.focusBlockedSites &&
            this.socialMediaSites.every(site => focusState.focusBlockedSites.includes(site))) ||
            (pendingFocus && this.socialMediaSites.every(site => pendingSites.includes(site)));
        
        this.updateSocialMediaButton(isSocialMediaBlocked);
    }

    updateSocialMediaButton(isBlocked) {
        const label = document.getElementById('blockSocialMediaLabel');
        const button = document.getElementById('blockSocialMedia');
        if (label && button) {
            if (isBlocked) {
                label.textContent = 'Unblock Social Media';
                button.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                button.style.background = 'rgba(16, 185, 129, 0.1)';
            } else {
                label.textContent = 'Block Social Media';
                button.style.borderColor = '';
                button.style.background = '';
            }
        }
    }

    async toggleFloatingClock() {
        const result = await chrome.storage.local.get(['clockVisible']);
        const newState = !result.clockVisible;
        await chrome.runtime.sendMessage({ action: 'toggleClock', visible: newState });
        window.close(); // Close popup so user can see the clock
    }

    // Open flip clock as a brand-new full-screen tab
    openFlipClockTab() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('floating/flip-clock.html')
        });
        window.close();
    }

    async checkPauseState() {
        const result = await chrome.storage.local.get(['pauseBlockingUntil']);
        const pb = result.pauseBlockingUntil;
        const icon = document.getElementById('pauseIcon');
        const label = document.getElementById('pauseLabel');
        const btn = document.getElementById('pauseProtectionMode');

        this.state.isPaused = pb && (pb === -1 || Date.now() < pb);

        if (this.state.isPaused) {
            icon.textContent = '▶️';
            label.textContent = 'Resume Blocks';
            btn.style.borderColor = 'rgba(16, 185, 129, 0.4)'; // green
            btn.style.background = 'rgba(16, 185, 129, 0.1)';
        } else {
            icon.textContent = '⏸️';
            label.textContent = 'Pause Blocks';
            btn.style.borderColor = 'rgba(244, 63, 94, 0.3)';
            btn.style.background = '';
        }
    }

    async handlePauseProtection() {
        if (this.state.isPaused) {
            await chrome.runtime.sendMessage({ action: 'resumeBlocking' });
            window.close();
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('floating/pause-overlay.html') });
            window.close();
        }
    }

    // Load the current tab's domain and display quick-add + remaining time
    async loadCurrentSite() {
        const panel = document.getElementById('quickAddPanel');
        const domainLabel = document.getElementById('quickAddDomain');
        if (!panel || !domainLabel) return;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) { panel.style.display = 'none'; return; }

        try {
            const url = new URL(tab.url);
            if (!url.protocol.startsWith('http')) { panel.style.display = 'none'; return; }
            const domain = url.hostname.replace(/^www\./, '');
            this.currentDomain = domain;
            domainLabel.textContent = domain;
            panel.style.display = 'block';
            // Show remaining usage time if a limit exists
            await this.showRemainingTime(domain);
        } catch (e) {
            panel.style.display = 'none';
        }
    }

    async showRemainingTime(domain) {
        const el = document.getElementById('remainingTimeRow');
        if (!el) return;

        const today = new Date().toDateString();
        const result = await chrome.storage.local.get(['siteUsageData', 'timeLimits', 'globalLimit']);
        const usageData = result.siteUsageData || {};
        const timeLimits = result.timeLimits || [];
        const globalLimit = result.globalLimit || { enabled: false, minutes: 0, domains: [] };
        const todayUsage = usageData[today] || {};
        const usedSeconds = todayUsage[domain] || 0;

        // Check individual per-site limit first
        const limitObj = timeLimits.find(l => l.site === domain);
        let limitSeconds = 0;
        let limitLabel = '';

        if (limitObj && limitObj.minutes > 0) {
            limitSeconds = limitObj.minutes * 60;
            limitLabel = 'Daily Limit';
        } else if (globalLimit.enabled && (globalLimit.domains || []).includes(domain)) {
            let globalUsed = 0;
            (globalLimit.domains || []).forEach(d => { globalUsed += (todayUsage[d] || 0); });
            const remaining = Math.max(0, (globalLimit.minutes || 0) * 60 - globalUsed);
            this._renderRemainingTime(el, remaining, 'Shared Pool', (globalLimit.minutes || 0) * 60);
            return;
        }

        if (!limitSeconds) { el.style.display = 'none'; return; }

        this._renderRemainingTime(el, Math.max(0, limitSeconds - usedSeconds), 'Daily Limit', limitSeconds);

        // Live refresh every 5 s while popup stays open
        if (this._remainingTimer) clearInterval(this._remainingTimer);
        this._remainingTimer = setInterval(async () => {
            const r2 = await chrome.storage.local.get(['siteUsageData']);
            const u2 = ((r2.siteUsageData || {})[today] || {});
            const rem = Math.max(0, limitSeconds - (u2[domain] || 0));
            this._renderRemainingTime(el, rem, 'Daily Limit', limitSeconds);
            if (rem === 0) clearInterval(this._remainingTimer);
        }, 5000);
    }

    _renderRemainingTime(el, remainingSeconds, label, totalSeconds) {
        el.style.display = 'flex';
        const h = Math.floor(remainingSeconds / 3600);
        const m = Math.floor((remainingSeconds % 3600) / 60);
        const s = remainingSeconds % 60;
        let text = '';
        if (remainingSeconds <= 0) text = '🚫 Limit reached!';
        else if (h > 0) text = `${h}h ${m}m left`;
        else if (m > 0) text = `${m}m ${s}s left`;
        else text = `${s}s left`;

        const pct = totalSeconds > 0 ? Math.round((remainingSeconds / totalSeconds) * 100) : 0;
        const color = remainingSeconds <= 0 ? '#f43f5e'
            : remainingSeconds < 300 ? '#f59e0b'
                : '#10b981';

        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:5px;">
                <span style="font-size:0.68rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">⏱ ${label}</span>
                <span style="font-size:0.82rem;font-weight:700;color:${color};">${text}</span>
            </div>
            <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width 0.4s;"></div>
            </div>`;
    }

    async addCurrentSiteToFocus() {
        if (!this.currentDomain) return;
        const result = await chrome.storage.local.get(['focusBlockedSites']);
        const sites = result.focusBlockedSites || [];
        if (!sites.includes(this.currentDomain)) {
            sites.push(this.currentDomain);
            await chrome.storage.local.set({ focusBlockedSites: sites });
        }
        const btn = document.getElementById('addToFocus');
        if (btn) { btn.textContent = '✅ Added!'; btn.disabled = true; }
    }

    async addCurrentSiteToSchedule() {
        if (!this.currentDomain) return;
        const result = await chrome.storage.local.get(['scheduledBlockedSites']);
        const sites = result.scheduledBlockedSites || [];
        if (!sites.includes(this.currentDomain)) {
            sites.push(this.currentDomain);
            await chrome.storage.local.set({ scheduledBlockedSites: sites });
        }
        const btn = document.getElementById('addToSchedule');
        if (btn) { btn.textContent = '✅ Added!'; btn.disabled = true; }
    }

    async startElementPicker() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: 'startElementPicker' });
            window.close();
        }
    }

    async updateFilters() {
        const btn = document.getElementById('updateFilters');
        const oldText = btn.textContent;
        btn.textContent = '⏳ ...';
        try {
            await chrome.runtime.sendMessage({ action: 'updateFilters' });
            btn.textContent = '✅ Done';
        } catch (e) {
            btn.textContent = '❌ Fail';
        }
        setTimeout(() => btn.textContent = oldText, 2000);
    }

    async runChallengeChecks(actionLabel) {
        const { settings } = await chrome.storage.local.get(['settings']);
        const s = settings || {};

        // Removed text challenge per user request

        // Removed PIN and Password challenges per user request

        if (s.challengeDelayEnabled) {
            const delay = Math.max(3, Math.min(60, Number(s.challengeDelaySeconds || 8)));
            await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        }

        return true;
    }

    async showProtectionStep(actionLabel, step, totalSteps, message, delaySeconds = 8) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 100000;
                background: rgba(2, 6, 23, 0.82);
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(6px);
            `;

            const modal = document.createElement('div');
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.style.cssText = `
                width: min(460px, calc(100vw - 32px));
                background: linear-gradient(180deg, #0f172a, #111827);
                color: #e5e7eb;
                border: 1px solid rgba(99,102,241,0.35);
                border-radius: 18px;
                padding: 20px;
                box-shadow: 0 24px 60px rgba(0,0,0,0.5);
                font-family: 'Inter', sans-serif;
            `;
            modal.innerHTML = `
                <div style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd;margin-bottom:10px;">Focus protection · Step <span id="popup-protection-step"></span></div>
                <div id="popup-protection-action" style="font-size:1.05rem;font-weight:800;margin-bottom:8px;"></div>
                <div id="popup-protection-message" style="font-size:0.92rem;line-height:1.55;color:#cbd5e1;margin-bottom:16px;"></div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
                    <div id="popup-protection-countdown" style="font-family:'Outfit',sans-serif;font-size:2.2rem;font-weight:800;color:#818cf8;min-width:68px;">8s</div>
                    <div style="flex:1;height:10px;background:rgba(148,163,184,0.16);border-radius:999px;overflow:hidden;">
                        <div id="popup-protection-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:999px;transition:width 0.2s linear;"></div>
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;">
                    <button id="popup-protection-stay" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:#1e293b;color:#e5e7eb;cursor:pointer;">Stay Focused</button>
                    <button id="popup-protection-continue" disabled style="padding:8px 14px;border-radius:10px;border:none;background:#6366f1;color:white;opacity:0.5;cursor:not-allowed;">Continue Anyway (8s)</button>
                </div>
            `;

            modal.querySelector('#popup-protection-step').textContent = `${step} of ${totalSteps}`;
            modal.querySelector('#popup-protection-action').textContent = actionLabel;
            modal.querySelector('#popup-protection-message').textContent = message;
            const countdownEl = modal.querySelector('#popup-protection-countdown');
            const barEl = modal.querySelector('#popup-protection-bar');
            const stayBtn = modal.querySelector('#popup-protection-stay');
            const continueBtn = modal.querySelector('#popup-protection-continue');
            const totalMs = Math.max(1000, Number(delaySeconds) * 1000);
            const endAt = Date.now() + totalMs;
            let timerId = null;

            const cleanup = () => {
                clearInterval(timerId);
                document.removeEventListener('keydown', escHandler, true);
                overlay.remove();
            };
            const settle = (value) => {
                cleanup();
                resolve(value);
            };
            const escHandler = (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                settle(false);
            };
            const tick = () => {
                const remainingMs = Math.max(0, endAt - Date.now());
                const remainingSeconds = Math.ceil(remainingMs / 1000);
                countdownEl.textContent = remainingSeconds > 0 ? `${remainingSeconds}s` : 'Ready';
                barEl.style.width = `${(remainingMs / totalMs) * 100}%`;
                if (remainingSeconds > 0) {
                    continueBtn.textContent = `Continue Anyway (${remainingSeconds}s)`;
                    return;
                }
                continueBtn.disabled = false;
                continueBtn.style.opacity = '1';
                continueBtn.style.cursor = 'pointer';
                continueBtn.textContent = 'Continue Anyway';
                clearInterval(timerId);
            };

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', escHandler, true);
            stayBtn.addEventListener('click', () => settle(false));
            continueBtn.addEventListener('click', () => {
                if (!continueBtn.disabled) settle(true);
            });
            tick();
            timerId = setInterval(tick, 200);
            stayBtn.focus();
        });
    }

    async runProtectionSequence(actionLabel) {
        const messages = [
            'Your current focus is valuable. You can keep it with one click.',
            'Small distractions can turn into much longer detours.',
            'Finish the next meaningful step before changing your protection.',
            'Momentum is difficult to rebuild once it is broken.',
            'A short pause now can protect your goals for the rest of the day.',
            'Choose deliberately: protect your attention or continue anyway.',
            'This is the final check. Make the choice you will be proud of later.'
        ];

        for (let index = 0; index < messages.length; index += 1) {
            const allowed = await this.showProtectionStep(actionLabel, index + 1, messages.length, messages[index], 8);
            if (!allowed) return false;
        }

        const challengeOk = await this.runChallengeChecks(actionLabel);
        if (!challengeOk) {
            chrome.runtime.sendMessage({ action: 'playSound', sound: 'break-time' }).catch(() => { });
            alert('Verification failed. Try again.');
            return false;
        }

        chrome.runtime.sendMessage({ action: 'playSound', sound: 'timer-complete' }).catch(() => { });
        return true;
    }

    async addTask() {
        const text = prompt('Task name:');
        if (text?.trim()) {
            const todo = { id: 'task' + Date.now(), text: text.trim(), completed: false };
            this.renderTodo(todo);
            await this.saveTodos();
        }
    }

    renderTodo(todo) {
        const div = document.createElement('div');
        div.className = 'todo-item';
        div.innerHTML = `
            <input type="checkbox" id="${todo.id}" ${todo.completed ? 'checked' : ''}>
            <label for="${todo.id}">${todo.text}</label>
        `;
        div.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.showToast('✅ Awesome! Task completed.');
            }
            this.saveTodos();
        });
        this.elements.todoList.appendChild(div);
    }

    async saveTodos() {
        const items = Array.from(this.elements.todoList.querySelectorAll('.todo-item')).map(item => ({
            id: item.querySelector('input').id,
            text: item.querySelector('label').textContent,
            completed: item.querySelector('input').checked
        }));
        await chrome.storage.local.set({ todos: items });
    }

    async loadTodos() {
        const result = await chrome.storage.local.get(['todos']);
        this.elements.todoList.innerHTML = '';
        (result.todos || []).forEach(t => this.renderTodo(t));
    }

    async loadSettings() {
        const result = await chrome.storage.local.get(['settings']);
        const theme = result.settings?.theme || 'solar';
        if (theme === 'light') {
            document.body.className = 'theme-light';
        } else {
            document.body.className = 'theme-dark';
        }

        // Set widget toggles
        const s = result.settings || {};
        const focToggle = document.getElementById('focusTimerWidgetToggle');
        const timToggle = document.getElementById('timerWidgetToggle');
        if (focToggle) focToggle.checked = s.focusTimerWidgetEnabled !== false;
        if (timToggle) timToggle.checked = s.timerWidgetEnabled !== false;
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'rgba(16, 185, 129, 0.95)';
        toast.style.color = 'white';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '12px';
        toast.style.fontSize = '0.9rem';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
        toast.style.zIndex = '10000';
        toast.style.animation = 'fadeIn 0.3s ease-out';
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 3000);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        new PopupController();
        console.log('PopupController initialized');
    } catch (e) {
        console.error('Failed to initialize PopupController:', e);
    }
});
