class PopupController {
    constructor() {
        this.elements = {
            currentTime: document.getElementById('currentTime'),
            timerDisplay: document.getElementById('timerDisplay'),
            timerInputsContainer: document.getElementById('timerInputsContainer'),
            timerMinutes: document.getElementById('timerMinutes'),
            timerSeconds: document.getElementById('timerSeconds'),
            todoList: document.getElementById('todoList'),
            startTimerBtn: document.getElementById('startTimer'),
            startFocusBtn: document.getElementById('startFocus')
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
        await Promise.all([
            this.loadSettings(),
            this.loadTodos(),
            this.restoreTimerState(),
            this.loadCurrentSite(),  // Quick-Add current site
            this.checkPauseState()
        ]);
    }



    setupEventListeners() {
        document.getElementById('toggleClock').addEventListener('click', () => this.toggleFloatingClock());
        document.getElementById('flipClockMode').addEventListener('click', () => this.openFlipClockTab());
        document.getElementById('pauseProtectionMode').addEventListener('click', () => this.handlePauseProtection());
        this.elements.startFocusBtn.addEventListener('click', () => this.handleFocusMode());
        document.getElementById('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
        this.elements.startTimerBtn.addEventListener('click', () => this.toggleTimer());
        document.getElementById('addTask').addEventListener('click', () => this.addTask());
        document.getElementById('blockElement').addEventListener('click', () => this.startElementPicker());
        document.getElementById('toggleFormat').addEventListener('click', () => this.toggleTimeFormat());
        document.getElementById('updateFilters').addEventListener('click', () => this.updateFilters());

        // Quick-add current site buttons
        const addToFocusBtn = document.getElementById('addToFocus');
        const addToScheduleBtn = document.getElementById('addToSchedule');
        if (addToFocusBtn) addToFocusBtn.addEventListener('click', () => this.addCurrentSiteToFocus());
        if (addToScheduleBtn) addToScheduleBtn.addEventListener('click', () => this.addCurrentSiteToSchedule());

        this.elements.timerMinutes.addEventListener('input', () => this.syncTimerInputs());
        this.elements.timerSeconds.addEventListener('input', () => this.syncTimerInputs());

        const restoreFocusBtn = document.getElementById('restoreFocusBtn');
        if (restoreFocusBtn) {
            restoreFocusBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'showStatusWidget' });
                window.close();
            });
        }

        const restoreTimerBtn = document.getElementById('restoreTimerBtn');
        if (restoreTimerBtn) {
            restoreTimerBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'showStatusWidget' });
                window.close();
            });
        }

        // Ad blocker toggle
        document.getElementById('adBlockToggle').addEventListener('change', (e) => {
            chrome.runtime.sendMessage({ action: 'toggleAdBlock', enabled: e.target.checked });
        });

        // Widget display toggles
        document.getElementById('focusTimerWidgetToggle').addEventListener('change', (e) => {
            this.updateWidgetSetting('focusTimerWidgetEnabled', e.target.checked);
        });
        document.getElementById('timerWidgetToggle').addEventListener('change', (e) => {
            this.updateWidgetSetting('timerWidgetEnabled', e.target.checked);
        });
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
        }

        // Check if we need to show the "Restore" buttons
        const clockRes = await chrome.storage.local.get(['clockVisible']);
        const restoreFocusBtn = document.getElementById('restoreFocusBtn');
        const restoreTimerBtn = document.getElementById('restoreTimerBtn');

        if (restoreFocusBtn) {
            restoreFocusBtn.style.display = (result.focusState?.isActive && !clockRes.clockVisible) ? 'flex' : 'none';
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

    async startClock() {
        const update = async () => {
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            const is12h = settings?.timeFormat === '12h';

            this.elements.currentTime.textContent = new Date().toLocaleTimeString('en-US', {
                hour12: is12h,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            document.getElementById('toggleFormat').textContent = is12h ? '12H' : '24H';
        };
        update();
        this.state.clockInterval = setInterval(update, 1000);
    }

    async toggleTimeFormat() {
        const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
        const newFormat = settings?.timeFormat === '12h' ? '24h' : '12h';
        await chrome.runtime.sendMessage({ action: 'setTimeFormat', format: newFormat });
        this.startClock(); // Refresh immediately
    }

    toggleTimer() {
        if (this.state.isTimerRunning) {
            this.stopTimer();
        } else {
            const mins = parseInt(this.elements.timerMinutes.value) || 0;
            const secs = parseInt(this.elements.timerSeconds.value) || 0;
            this.startTimer(mins * 60 + secs);
        }
    }

    startTimer(seconds) {
        if (seconds <= 0) return;
        this.state.timerRemaining = seconds;
        this.state.isTimerRunning = true;

        chrome.runtime.sendMessage({ action: 'startTimer', duration: seconds });
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

    stopTimer() {
        this.state.isTimerRunning = false;
        clearInterval(this.state.timerInterval);
        this.elements.startTimerBtn.textContent = 'Start Flow';
        this.elements.startTimerBtn.classList.remove('btn-focus');
        this.elements.timerInputsContainer.style.display = 'flex';
        this.elements.timerDisplay.style.display = 'none';
        chrome.runtime.sendMessage({ action: 'stopTimer' });
        this.syncTimerInputs();
    }

    async handleFocusMode() {
        const result = await chrome.storage.local.get(['focusState']);
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
        } else {
            const mins = prompt('Focus duration (minutes):', '25');
            if (mins && !isNaN(mins)) {
                await chrome.runtime.sendMessage({ action: 'startFocusMode', duration: parseInt(mins) * 60 });
                window.close();
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

    async runProtectionSequence(actionLabel) {
        if (!confirm('AWAKENING: This action will break your current focus session. Are you absolutely certain?')) return false;
        if (!confirm('CONSIDERATION: Is this distraction more important than your deep work goals?')) return false;
        if (!confirm('INTENTION: Will you regret breaking this momentum in 10 minutes?')) return false;
        if (!confirm('DETERMINATION: You are almost there. Stay focused instead? (Cancel to stay, OK to break)')) return false;
        if (!confirm('FINAL WARNING: This is the 5th and final prompt. Break focus now?')) return false;

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

document.addEventListener('DOMContentLoaded', () => new PopupController());
