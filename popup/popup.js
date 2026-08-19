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
            timeLimitInterval: null,
            nuclearInterval: null,
            nuclearState: null,
            nuclearDraft: [],
            nuclearSaved: [],
            nuclearExcludeOpenTabs: false,
            nuclearExcludedTabIds: []
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadAllData();
        await this.updateClockViewButton();
        this.startClock();
        this.state.timeLimitInterval = setInterval(() => this.loadTimeLimitStatus(), 30_000);
    }

    async loadAllData() {
        const tasks = [
            ['settings', () => this.loadSettings()],
            ['todos', () => this.loadTodos()],
            ['timer state', () => this.restoreTimerState()],
            ['pause state', () => this.checkPauseState()],
            ['site limit status', () => this.loadTimeLimitStatus()],
            ['nuclear mode', () => this.loadNuclearModeState()]
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
        bind('nuclearToggle', () => this.openNuclearSetup());
        bind('nuclearExitButton', () => this.openNuclearBlockPage());

        document.getElementById('nuclearSetupClose')?.addEventListener('click', () => this.closeNuclearSetup());
        document.getElementById('nuclearSetupCancel')?.addEventListener('click', () => this.closeNuclearSetup());
        document.getElementById('nuclearAddEntry')?.addEventListener('click', () => this.addNuclearDraftEntry());
        document.getElementById('nuclearUseCurrentTab')?.addEventListener('click', () => this.addCurrentTabToNuclearDraft());
        document.getElementById('nuclearSetupStart')?.addEventListener('click', () => this.startNuclearFromSetup());
        document.getElementById('nuclearExcludeOpenTabs')?.addEventListener('change', (event) => {
            this.setNuclearOpenTabsExclusion(event.target.checked).catch((error) => {
                console.error('Failed to capture open tabs:', error);
                event.target.checked = false;
                this.state.nuclearExcludeOpenTabs = false;
                this.state.nuclearExcludedTabIds = [];
                this.updateNuclearOpenTabsSummary();
                this.setNuclearSetupError('The currently open tabs could not be captured. Try again or add sites manually.');
            });
        });
        document.getElementById('nuclearEntry')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.addNuclearDraftEntry();
            }
        });

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
            if (changes.clockVisible) {
                this.updateClockViewButton(changes.clockVisible.newValue).catch((error) => console.error('Failed to refresh Clock View label:', error));
            }
            if (changes.nuclearMode) {
                this.loadNuclearModeState().catch((error) => console.error('Failed to refresh Nuclear Mode:', error));
            }
        });

        chrome.tabs.onActivated?.addListener(() => {
            this.loadTimeLimitStatus().catch((error) => console.error('Failed to refresh active-site limit:', error));
        });
        chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
            if (tab?.active && (changeInfo.url || changeInfo.status === 'complete')) {
                this.loadTimeLimitStatus().catch((error) => console.error('Failed to refresh active-site limit:', error));
            }
        });
    }

    async getActiveSiteHostname() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = new URL(tab?.url || '');
            if (!['http:', 'https:'].includes(url.protocol)) return '';
            return url.hostname.toLowerCase().replace(/^www\./, '');
        } catch {
            return '';
        }
    }

    normalizeLimitSite(site) {
        const value = String(site || '').trim().toLowerCase();
        if (!value) return '';
        try {
            const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
            return url.hostname.replace(/^www\./, '');
        } catch {
            return value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
        }
    }

    async loadTimeLimitStatus() {
        const container = this.elements.siteLimitStatus;
        if (!container) return [];

        const [result, activeSite] = await Promise.all([
            chrome.storage.local.get(['timeLimits', 'timeLimitsEnabled', 'siteUsageData']),
            this.getActiveSiteHostname()
        ]);
        const limits = Array.isArray(result.timeLimits) ? result.timeLimits : [];
        const today = new Date().toDateString();
        const usageToday = result.siteUsageData?.[today] || {};
        const enabled = result.timeLimitsEnabled === true || result.timeLimitsEnabled === 'enabled' || result.timeLimitsEnabled === 'true' || result.timeLimitsEnabled === 1;
        const activeLimit = activeSite
            ? limits.find((limit) => this.normalizeLimitSite(limit?.site) === activeSite && Number(limit.minutes) > 0)
            : null;
        const statuses = activeLimit ? (() => {
            const limitMinutes = Number(activeLimit.minutes);
            const usageKey = Object.prototype.hasOwnProperty.call(usageToday, activeLimit.site)
                ? activeLimit.site
                : activeSite;
            const usedSeconds = Math.max(0, Number(usageToday[usageKey]) || 0);
            const remainingSeconds = Math.max(0, Math.floor(limitMinutes * 60 - usedSeconds));
            return [{ site: activeLimit.site, limitMinutes, usedSeconds, remainingSeconds }];
        })() : [];

        container.replaceChildren();
        if (!statuses.length) {
            const empty = document.createElement('div');
            empty.className = 'site-limit-empty';
            empty.textContent = activeSite ? 'Site limit is not set for this site.' : 'Site limit is not available for this tab.';
            container.appendChild(empty);
            return statuses;
        }

        const summary = document.createElement('div');
        summary.className = 'site-limit-summary';
        summary.textContent = enabled ? 'remaining today' : 'site limit currently disabled';
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

    async loadNuclearModeState() {
        const response = await chrome.runtime.sendMessage({ action: 'getNuclearModeState' });
        const state = response?.nuclearMode || {
            isActive: false,
            startTime: null,
            duration: 0,
            endTime: null,
            whitelist: []
        };
        this.state.nuclearState = state;

        const endTime = Number(state.endTime);
        const active = state.isActive === true && Number.isFinite(endTime) && endTime > Date.now();
        const toggle = document.getElementById('nuclearToggle');
        const activeView = document.getElementById('nuclearActiveView');
        if (toggle) {
            toggle.hidden = active;
            toggle.disabled = active;
        }
        if (activeView) activeView.hidden = !active;

        if (active) this.startNuclearInterval(state);
        else if (this.state.nuclearInterval) {
            clearInterval(this.state.nuclearInterval);
            this.state.nuclearInterval = null;
        }
        return state;
    }

    formatNuclearRemaining(seconds) {
        const remaining = Math.max(0, Math.ceil(Number(seconds) || 0));
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const secs = remaining % 60;
        return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':');
    }

    startNuclearInterval(state) {
        if (this.state.nuclearInterval) clearInterval(this.state.nuclearInterval);
        const update = () => {
            const remaining = Math.max(0, (Number(state.endTime) - Date.now()) / 1000);
            const countdown = document.getElementById('nuclearCountdown');
            if (countdown) countdown.textContent = `Protected time remaining: ${this.formatNuclearRemaining(remaining)}`;
            if (remaining <= 0) {
                clearInterval(this.state.nuclearInterval);
                this.state.nuclearInterval = null;
                this.loadNuclearModeState().catch(() => undefined);
            }
        };
        update();
        this.state.nuclearInterval = setInterval(update, 1000);
    }

    normalizeNuclearDraftEntry(value) {
        const raw = String(value || '').trim();
        if (!raw || raw === '*') return '';
        try {
            if (/^file:\/\//i.test(raw)) {
                const fileUrl = new URL(raw);
                return fileUrl.protocol === 'file:' && fileUrl.pathname ? fileUrl.href.toLowerCase() : '';
            }
            const hasScheme = /^[a-z][a-z\\d+.-]*:\/\//i.test(raw);
            const url = new URL(hasScheme ? raw : `https://${raw}`);
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
            const hostname = url.hostname.replace(/^www\\./, '').toLowerCase();
            const hasSpecificPath = url.pathname !== '/' || url.search || url.hash;
            if (!hasSpecificPath && !url.port) return hostname;
            const port = url.port ? `:${url.port}` : '';
            return `${url.protocol}//${hostname}${port}${url.pathname}${url.search}${url.hash}`.toLowerCase();
        } catch {
            return '';
        }
    }

    renderNuclearDraft() {
        const list = document.getElementById('nuclearEntryList');
        if (!list) return;
        list.replaceChildren();
        this.state.nuclearDraft.forEach((entry) => {
            const chip = document.createElement('span');
            chip.className = 'nuclear-entry-chip';
            const label = document.createElement('span');
            label.textContent = entry;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'nuclear-entry-remove';
            remove.setAttribute('aria-label', `Remove ${entry}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                this.state.nuclearDraft = this.state.nuclearDraft.filter(item => item !== entry);
                this.renderNuclearDraft();
                this.renderNuclearSavedEntries();
            });
            chip.append(label, remove);
            list.appendChild(chip);
        });
    }

    renderNuclearSavedEntries() {
        const list = document.getElementById('nuclearSavedEntryList');
        if (!list) return;
        list.replaceChildren();

        const savedEntries = Array.isArray(this.state.nuclearSaved) ? this.state.nuclearSaved : [];
        if (!savedEntries.length) {
            const empty = document.createElement('span');
            empty.className = 'nuclear-saved-empty';
            empty.textContent = 'No saved entries yet.';
            list.appendChild(empty);
            return;
        }

        savedEntries.forEach((entry) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'nuclear-saved-entry';
            button.textContent = `＋ ${entry}`;
            button.title = `Add ${entry} to this session`;
            button.disabled = this.state.nuclearDraft.includes(entry) || this.state.nuclearDraft.length >= 8;
            button.addEventListener('click', () => {
                if (this.addNuclearDraftEntry(entry)) this.renderNuclearSavedEntries();
            });
            list.appendChild(button);
        });
    }

    setNuclearSetupError(message = '') {
        const error = document.getElementById('nuclearSetupError');
        if (!error) return;
        error.textContent = message;
        error.hidden = !message;
    }

    async openNuclearSetup() {
        const state = this.state.nuclearState || await this.loadNuclearModeState();
        if (state?.isActive === true && Number(state.endTime) > Date.now()) {
            this.showToast('Nuclear Mode is active. Use the Nuclear block page to exit it.');
            return;
        }
        // A saved whitelist is only a library of optional entries. It must never
        // become the active session allowlist without an explicit user action.
        this.state.nuclearSaved = Array.isArray(state?.whitelist)
            ? [...new Set(state.whitelist.map(entry => this.normalizeNuclearDraftEntry(entry)).filter(Boolean))].slice(0, 8)
            : [];
        this.state.nuclearDraft = [];
        this.state.nuclearExcludeOpenTabs = false;
        this.state.nuclearExcludedTabIds = [];
        const excludeOpenTabs = document.getElementById('nuclearExcludeOpenTabs');
        if (excludeOpenTabs) excludeOpenTabs.checked = false;
        this.updateNuclearOpenTabsSummary();
        document.getElementById('nuclearHours').value = '';
        document.getElementById('nuclearMinutes').value = '';
        this.setNuclearSetupError('');
        this.renderNuclearDraft();
        this.renderNuclearSavedEntries();
        const modal = document.getElementById('nuclearSetupModal');
        if (modal) modal.hidden = false;
        document.getElementById('nuclearHours')?.focus();
    }

    async setNuclearOpenTabsExclusion(enabled) {
        this.state.nuclearExcludeOpenTabs = Boolean(enabled);
        if (!this.state.nuclearExcludeOpenTabs) {
            this.state.nuclearExcludedTabIds = [];
            this.updateNuclearOpenTabsSummary();
            this.setNuclearSetupError('');
            return;
        }

        await this.captureNuclearOpenTabs();
        this.setNuclearSetupError('');
    }

    async captureNuclearOpenTabs() {
        const tabs = await chrome.tabs.query({});
        this.state.nuclearExcludedTabIds = [...new Set(tabs
            .map(tab => Number(tab.id))
            .filter(tabId => Number.isInteger(tabId) && tabId >= 0))];
        this.updateNuclearOpenTabsSummary();
        return this.state.nuclearExcludedTabIds;
    }

    updateNuclearOpenTabsSummary() {
        const summary = document.getElementById('nuclearOpenTabsSummary');
        if (!summary) return;
        if (!this.state.nuclearExcludeOpenTabs) {
            summary.textContent = 'New tabs will still be blocked unless they are allowlisted.';
            return;
        }
        const count = this.state.nuclearExcludedTabIds.length;
        summary.textContent = count > 0
            ? `${count} open tab${count === 1 ? '' : 's'} will stay available for this session.`
            : 'No open tabs were found yet. Try again before starting.';
    }

    closeNuclearSetup() {
        const modal = document.getElementById('nuclearSetupModal');
        if (modal) modal.hidden = true;
        this.setNuclearSetupError('');
    }

    addNuclearDraftEntry(value = document.getElementById('nuclearEntry')?.value) {
        const normalized = this.normalizeNuclearDraftEntry(value);
        if (!normalized) {
            this.setNuclearSetupError('Enter a valid domain, http or https link, or file URL.');
            return false;
        }
        if (this.state.nuclearDraft.includes(normalized)) {
            this.setNuclearSetupError('That entry is already in the allowed list.');
            return false;
        }
        if (this.state.nuclearDraft.length >= 8) {
            this.setNuclearSetupError('The allowed list is full. Remove an entry before adding another.');
            return false;
        }
        this.state.nuclearDraft.push(normalized);
        const input = document.getElementById('nuclearEntry');
        if (input) input.value = '';
        this.setNuclearSetupError('');
        this.renderNuclearDraft();
        this.renderNuclearSavedEntries();
        return true;
    }

    async addCurrentTabToNuclearDraft() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentUrl = tabs?.[0]?.url || '';
            if (!this.addNuclearDraftEntry(currentUrl)) return;
            this.showToast('Current tab added to the Nuclear allowlist.');
        } catch (error) {
            this.setNuclearSetupError('The current tab could not be added. Enter its URL manually.');
        }
    }

    async startNuclearFromSetup() {
        const hoursInput = document.getElementById('nuclearHours');
        const minutesInput = document.getElementById('nuclearMinutes');
        const hours = Number(hoursInput?.value || 0);
        const minutes = Number(minutesInput?.value || 0);
        if (!Number.isInteger(hours) || hours < 0 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
            this.setNuclearSetupError('Enter whole hours and 0–59 minutes.');
            return;
        }
        const durationSeconds = (hours * 3600) + (minutes * 60);
        if (durationSeconds <= 0) {
            this.setNuclearSetupError('Choose how long Nuclear Mode should run.');
            return;
        }
        if (!this.state.nuclearDraft.length && !this.state.nuclearExcludeOpenTabs) {
            this.setNuclearSetupError('Add at least one allowed site or link, or choose Exclude all open tabs.');
            return;
        }

        const ready = await this.showNuclearStartWarning(hours, minutes);
        if (!ready) return;
        if (this.state.nuclearExcludeOpenTabs) {
            await this.captureNuclearOpenTabs();
        }
        const startButton = document.getElementById('nuclearSetupStart');
        if (startButton) startButton.disabled = true;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'startNuclearMode',
                duration: durationSeconds,
                whitelist: [...this.state.nuclearDraft],
                excludedTabIds: this.state.nuclearExcludeOpenTabs ? [...this.state.nuclearExcludedTabIds] : []
            });
            if (response?.success === false) throw new Error(response.error || 'Unable to start Nuclear Mode');
            this.closeNuclearSetup();
            await this.loadNuclearModeState();
            this.showToast('Nuclear Mode is active.');
        } catch (error) {
            console.error('Failed to start Nuclear Mode:', error);
            this.setNuclearSetupError(error.message || 'Unable to start Nuclear Mode.');
        } finally {
            if (startButton) startButton.disabled = false;
        }
    }

    async handleNuclearMode() {
        return this.openNuclearSetup();
    }

    async openNuclearBlockPage() {
        try {
            await chrome.tabs.create({
                url: chrome.runtime.getURL('floating/nuclear-block.html')
            });
        } catch (error) {
            console.error('Failed to open Nuclear block page:', error);
            this.showToast('Open the Nuclear block page to continue the exit process.');
        }
    }

    async stopNuclearMode() {
        await this.openNuclearBlockPage();
    }

    showNuclearStartWarning(hours, minutes) {
        const safeHours = Math.max(0, Number(hours) || 0);
        const safeMinutes = Math.max(0, Number(minutes) || 0);
        const totalMinutes = (safeHours * 60) + safeMinutes;
        const parts = [];
        if (safeHours) parts.push(`${safeHours} hour${safeHours === 1 ? '' : 's'}`);
        if (safeMinutes) parts.push(`${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}`);
        return this.showFocusStartWarning(totalMinutes, 'Nuclear Mode', parts.join(' '));
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

    showFocusStartWarning(durationMinutes, modeName = 'Focus Mode', durationLabel = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 100000;
                display: flex; align-items: center; justify-content: center;
                padding: 16px; background: rgba(2, 6, 23, 0.86);
                font-family: Inter, system-ui, sans-serif;
            `;
            const warningHeading = modeName === 'Focus Mode' ? 'Save your work before Focus Mode' : `Save your work before ${modeName}`;
            const startButtonLabel = modeName === 'Focus Mode' ? 'Start Focus Now' : `Start ${modeName} Now`;
            overlay.innerHTML = `
                <section style="width: min(340px, 100%); padding: 22px; border-radius: 18px;
                    background: #111126; color: #f8fafc; border: 1px solid rgba(139,92,246,.45);
                    box-shadow: 0 20px 60px rgba(0,0,0,.45);">
                    <h2 style="margin:0 0 10px; font-size:1.15rem;">${warningHeading}</h2>
                    <p style="margin:0 0 12px; color:#cbd5e1; line-height:1.5; font-size:.9rem;">
                        ${modeName} will begin immediately and enforce your protection settings for ${durationLabel || `${durationMinutes} minutes`}.
                    </p>
                    <ul style="margin:0 0 18px; padding-left:20px; color:#cbd5e1; line-height:1.6; font-size:.85rem;">
                        <li>Save documents and submit any pending work.</li>
                        <li>Finish or pause downloads, uploads, and calls.</li>
                        <li>Close anything you need before starting.</li>
                    </ul>
                    <div style="display:flex; gap:10px; justify-content:flex-end;">
                        <button data-action="cancel" style="padding:9px 13px; border-radius:9px; border:1px solid #475569; background:transparent; color:#cbd5e1; cursor:pointer;">Not yet</button>
                        <button data-action="start" style="padding:9px 13px; border:0; border-radius:9px; background:#7c3aed; color:white; font-weight:700; cursor:pointer;">${startButtonLabel}</button>
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

    async updateClockViewButton(clockVisible) {
        const button = document.getElementById('toggleClock');
        const label = document.getElementById('clockViewLabel');
        if (!button || !label) return;

        let visible = clockVisible;
        if (visible === undefined) {
            const result = await chrome.storage.local.get(['clockVisible']);
            visible = result.clockVisible === true;
        }
        const isOpen = visible === true;
        label.textContent = isOpen ? 'Close Clock View' : 'Open Clock View';
        button.title = isOpen ? 'Close Clock View' : 'Open Clock View';
        button.setAttribute('aria-pressed', String(isOpen));
    }

    async toggleFloatingClock() {
        const result = await chrome.storage.local.get(['clockVisible']);
        const newState = result.clockVisible !== true;
        await chrome.runtime.sendMessage({ action: 'toggleClock', visible: newState });
        await this.updateClockViewButton(newState);
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
