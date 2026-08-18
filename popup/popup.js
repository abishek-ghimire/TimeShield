class PopupController {
    constructor() {
        this.elements = {
            currentTime: document.getElementById('currentTime'),
            timerDisplay: document.getElementById('timerDisplay'),
            timerInputsContainer: document.getElementById('timerInputsContainer'),
            timerMinutes: document.getElementById('timerMinutes'),
            timerSeconds: document.getElementById('timerSeconds'),
            todoList: document.getElementById('todoList'),
            siteLimitStatus: document.getElementById('siteLimitStatus'),
            startTimerBtn: document.getElementById('startTimer'),
            startFocusBtn: document.getElementById('startFocus'),
        };

        this.state = {
            timerInterval: null,
            clockInterval: null,
            timerRemaining: 0,
            isTimerRunning: false,
            focusInterval: null,
            isPaused: false,
            timeFormat: '12h',
            timeLimitInterval: null
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadAllData();
        this.startClock();
        this.state.timeLimitInterval = setInterval(() => this.loadTimeLimitStatus(), 30_000);
    }

    async loadAllData() {
        const tasks = [
            ['settings', () => this.loadSettings()],
            ['todos', () => this.loadTodos()],
            ['timer state', () => this.restoreTimerState()],
            ['pause state', () => this.checkPauseState()],
            ['site limit status', () => this.loadTimeLimitStatus()]
        ];
        const results = await Promise.allSettled(tasks.map(([, task]) => task()));
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Failed to load ${tasks[index][0]}:`, result.reason);
            }
        });
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
        bind('addCurrentSite', () => this.addCurrentSiteToFocusList());
        bind('startFocus', () => this.handleFocusMode());
        bind('openSettings', () => chrome.runtime.openOptionsPage());
        bind('startTimer', () => this.toggleTimer());
        bind('addTask', () => this.addTask());
        bind('blockElement', () => this.startElementPicker());
        bind('toggleFormat', () => this.toggleTimeFormat());
        bind('updateFilters', () => this.updateFilters());

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

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (changes.timeLimits || changes.timeLimitsEnabled || changes.siteUsageData) {
                this.loadTimeLimitStatus().catch((error) => console.error('Failed to refresh site limits:', error));
            }
        });
    }

    async loadTimeLimitStatus() {
        const container = this.elements.siteLimitStatus;
        if (!container) return [];

        const result = await chrome.storage.local.get(['timeLimits', 'timeLimitsEnabled', 'siteUsageData']);
        const limits = Array.isArray(result.timeLimits) ? result.timeLimits : [];
        const today = new Date().toDateString();
        const usageToday = result.siteUsageData?.[today] || {};
        const enabled = result.timeLimitsEnabled === true || result.timeLimitsEnabled === 'enabled' || result.timeLimitsEnabled === 'true' || result.timeLimitsEnabled === 1;
        const statuses = limits
            .filter((limit) => limit && typeof limit.site === 'string' && Number(limit.minutes) > 0)
            .map((limit) => {
                const limitMinutes = Number(limit.minutes);
                const usedSeconds = Math.max(0, Number(usageToday[limit.site]) || 0);
                const remainingSeconds = Math.max(0, Math.floor(limitMinutes * 60 - usedSeconds));
                return { site: limit.site, limitMinutes, usedSeconds, remainingSeconds };
            });

        container.replaceChildren();
        if (!statuses.length) {
            const empty = document.createElement('div');
            empty.className = 'site-limit-empty';
            empty.textContent = 'No site limits configured.';
            container.appendChild(empty);
            return statuses;
        }

        const summary = document.createElement('div');
        summary.className = 'site-limit-summary';
        summary.textContent = enabled ? 'remaining today' : 'limits currently disabled';
        container.appendChild(summary);

        statuses.forEach((status) => {
            const row = document.createElement('div');
            row.className = 'site-limit-row';

            const top = document.createElement('div');
            top.className = 'site-limit-row-top';
            const site = document.createElement('span');
            site.className = 'site-limit-site';
            site.textContent = status.site;
            const remaining = document.createElement('span');
            remaining.className = `site-limit-remaining${status.remainingSeconds <= 60 ? ' is-critical' : status.remainingSeconds <= 300 ? ' is-warning' : ''}`;
            remaining.textContent = enabled
                ? this.formatRemainingLimit(status.remainingSeconds)
                : `${this.formatRemainingLimit(status.remainingSeconds)} · off`;
            top.append(site, remaining);

            const track = document.createElement('div');
            track.className = 'site-limit-track';
            const fill = document.createElement('div');
            fill.className = 'site-limit-fill';
            const usedRatio = Math.min(1, status.usedSeconds / Math.max(1, status.limitMinutes * 60));
            fill.style.width = `${usedRatio * 100}%`;
            if (status.remainingSeconds <= 60) fill.classList.add('is-critical');
            else if (status.remainingSeconds <= 300) fill.classList.add('is-warning');
            track.appendChild(fill);

            row.append(top, track);
            container.appendChild(row);
        });
        return statuses;
    }

    formatRemainingLimit(seconds) {
        const remaining = Math.max(0, Math.floor(Number(seconds) || 0));
        if (remaining <= 0) return 'limit reached';
        if (remaining < 60) return `${remaining}s left`;
        const minutes = Math.floor(remaining / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m left`;
        return `${minutes}m left`;
    }

    async updateWidgetSetting(key, enabled) {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {};
        settings[key] = enabled;
        const update = { settings };
        if (enabled) update.sessionOverlayDismissed = false;
        await chrome.storage.local.set(update);
        // Inject/recheck every eligible tab so an active session appears immediately.
        await chrome.runtime.sendMessage({ action: 'settingsUpdated' }).catch(() => { });
        this.showToast(enabled ? 'Floating display enabled.' : 'Floating display disabled.');
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

    renderClock() {
        const is12Hour = this.state.timeFormat !== '24h';
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = new Date().toLocaleTimeString(undefined, {
                hour12: is12Hour,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
        const formatButton = document.getElementById('toggleFormat');
        if (formatButton) formatButton.textContent = is12Hour ? '12H' : '24H';
    }

    startClock() {
        if (this.state.clockInterval) clearInterval(this.state.clockInterval);
        this.renderClock();
        this.state.clockInterval = setInterval(() => this.renderClock(), 1000);
    }

    async toggleTimeFormat() {
        const newFormat = this.state.timeFormat === '12h' ? '24h' : '12h';
        try {
            const response = await chrome.runtime.sendMessage({ action: 'setTimeFormat', format: newFormat });
            if (response?.success === false) throw new Error(response.error || 'Unable to change time format');
            this.state.timeFormat = newFormat;
            this.renderClock();
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

    async addCurrentSiteToFocusList() {
        const response = await chrome.runtime.sendMessage({ action: 'addCurrentSiteToFocusList' });
        if (response?.success === false) {
            this.showToast(response.error || 'This page cannot be added to Focus Mode.');
            return;
        }
        this.showToast(`${response.site} added to the Focus list.`);
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
            const ready = await this.showFocusStartWarning(durationMinutes);
            if (!ready) return;

            const response = await chrome.runtime.sendMessage({
                action: 'startFocusMode',
                duration: durationMinutes * 60
            });
            if (response?.success === false) {
                throw new Error(response.error || 'Unable to start focus mode');
            }
            window.close();
        }
    }

    showFocusStartWarning(durationMinutes) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 100000;
                display: flex; align-items: center; justify-content: center;
                padding: 16px; background: rgba(2, 6, 23, 0.86);
                font-family: Inter, system-ui, sans-serif;
            `;
            overlay.innerHTML = `
                <section style="width: min(340px, 100%); padding: 22px; border-radius: 18px;
                    background: #111126; color: #f8fafc; border: 1px solid rgba(139,92,246,.45);
                    box-shadow: 0 20px 60px rgba(0,0,0,.45);">
                    <h2 style="margin:0 0 10px; font-size:1.15rem;">Save your work before Focus Mode</h2>
                    <p style="margin:0 0 12px; color:#cbd5e1; line-height:1.5; font-size:.9rem;">
                        Focus Mode will begin immediately and block the sites on your Focus list for ${durationMinutes} minutes.
                    </p>
                    <ul style="margin:0 0 18px; padding-left:20px; color:#cbd5e1; line-height:1.6; font-size:.85rem;">
                        <li>Save documents and submit any pending work.</li>
                        <li>Finish or pause downloads, uploads, and calls.</li>
                        <li>Close anything you need before starting.</li>
                    </ul>
                    <div style="display:flex; gap:10px; justify-content:flex-end;">
                        <button data-action="cancel" style="padding:9px 13px; border-radius:9px; border:1px solid #475569; background:transparent; color:#cbd5e1; cursor:pointer;">Not yet</button>
                        <button data-action="start" style="padding:9px 13px; border:0; border-radius:9px; background:#7c3aed; color:white; font-weight:700; cursor:pointer;">Start Focus Now</button>
                    </div>
                </section>
            `;

            const finish = (value) => {
                overlay.remove();
                resolve(value);
            };
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(false));
            overlay.querySelector('[data-action="start"]').addEventListener('click', () => finish(true));
            document.body.appendChild(overlay);
        });
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

    async showProtectionWarning(actionLabel) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 100000;
                background: rgba(2, 6, 23, 0.84);
                display: flex; align-items: center; justify-content: center;
                padding: 16px; backdrop-filter: blur(6px);
                font-family: Inter, system-ui, sans-serif;
            `;

            const modal = document.createElement('div');
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'popup-protection-title');
            modal.style.cssText = `
                width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto;
                background: linear-gradient(180deg, #0f172a, #111827);
                color: #e5e7eb; border: 1px solid rgba(99,102,241,0.4);
                border-radius: 18px; padding: 22px;
                box-shadow: 0 24px 60px rgba(0,0,0,0.5);
            `;
            modal.innerHTML = `
                <div style="font-size:0.86rem;letter-spacing:0.1em;text-transform:uppercase;color:#93c5fd;margin-bottom:10px;">Focus protection warning</div>
                <div id="popup-protection-title" style="font-size:1.2rem;font-weight:800;line-height:1.3;margin-bottom:10px;"></div>
                <div style="font-size:0.96rem;line-height:1.58;color:#cbd5e1;margin-bottom:18px;">Changing this setting weakens your current protection. Stay with the task in front of you, finish one meaningful step, and keep your attention protected. If you still need to continue, wait for the full countdown and choose deliberately.</div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                    <div id="popup-protection-countdown" style="font-family:Outfit,Inter,sans-serif;font-size:2.4rem;font-weight:800;color:#818cf8;min-width:76px;">20s</div>
                    <div style="flex:1;height:10px;background:rgba(148,163,184,0.18);border-radius:999px;overflow:hidden;"><div id="popup-protection-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:999px;"></div></div>
                </div>
                <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
                    <span id="popup-protection-wait" aria-live="polite" style="margin-right:auto;color:#cbd5e1;font-size:0.9rem;">Continue will appear after 20 seconds.</span>
                    <button id="popup-protection-stay" type="button" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:#1e293b;color:#e5e7eb;cursor:pointer;font-size:0.92rem;">Stay Focused</button>
                    <button id="popup-protection-continue" type="button" hidden style="padding:10px 14px;border-radius:10px;border:none;background:#6366f1;color:white;cursor:pointer;font-size:0.92rem;">Continue Anyway</button>
                </div>
            `;
            modal.querySelector('#popup-protection-title').textContent = actionLabel;

            const countdownEl = modal.querySelector('#popup-protection-countdown');
            const barEl = modal.querySelector('#popup-protection-bar');
            const stayBtn = modal.querySelector('#popup-protection-stay');
            const waitEl = modal.querySelector('#popup-protection-wait');
            const continueBtn = modal.querySelector('#popup-protection-continue');
            const totalMs = 20_000;
            const endAt = Date.now() + totalMs;
            let timerId = null;

            const cleanup = () => {
                clearInterval(timerId);
                document.removeEventListener('keydown', escHandler, true);
                overlay.remove();
            };
            const settle = (value) => { cleanup(); resolve(value); };
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
                    waitEl.textContent = `Continue will appear in ${remainingSeconds}s.`;
                    return;
                }
                waitEl.textContent = 'Choose carefully. Your protection is still worth keeping.';
                continueBtn.hidden = false;
                continueBtn.focus();
                clearInterval(timerId);
            };

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', escHandler, true);
            stayBtn.addEventListener('click', () => settle(false));
            continueBtn.addEventListener('click', () => settle(true));
            tick();
            timerId = setInterval(tick, 200);
            stayBtn.focus();
        });
    }

    async runProtectionSequence(actionLabel) {
        const allowed = await this.showProtectionWarning(actionLabel);
        if (!allowed) return false;
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
        this.state.timeFormat = result.settings?.timeFormat === '24h' ? '24h' : '12h';
        this.renderClock();
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
