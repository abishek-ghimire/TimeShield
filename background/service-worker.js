// Import ad-blocking modules
import { AdBlockEngine } from './adblock-core.js';
import { FilterListManager } from './filter-lists.js';
import { RuleCompiler } from './adblock-rules.js';
import { StorageManager } from '../lib/storage-manager.js';
import { usageTracker } from './usage-tracker.js';

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
            focusBlockedSites: []
        };

        // sleepBlockingState removed

        // Track short pause usage (5 min, max 2 per day)
        this.shortPauseUsage = {
            count: 0,
            lastResetDate: new Date().toDateString()
        };

        this.adBlockEnabled = false; // Default to disabled to avoid altering site layout
        this.preActivationWarningCache = {};
        this.activeTabInjectionPromises = new Map();

        // NEW: Ad blocker state
        this.adsBlocked = 0;
        this.bandwidthSaved = 0;
        this.timeSaved = 0;

        // Initialize components
        this.filterManager = new FilterListManager();
        this.ruleCompiler = new RuleCompiler();
        this.adBlocker = new AdBlockEngine(this);

        // Track initialization
        this.initPromise = this.init();
    }

    async init() {
        this.setupMessageHandlers();
        this.setupAlarmHandlers();
        // Cloud synchronization has been removed; discard obsolete account and sync metadata on upgrade.
        await chrome.storage.local.remove(['firebaseUser', 'customFirebaseConfig', 'syncStatus', 'syncDirty', 'lastSyncTime', 'syncConflict']);
        await this.initializeStorage();
        await this.migrateOldSettings();
        await this.restoreState();
        await this.initializeAdBlocking();
        await this.checkScheduledBlocking(); // Ensure scheduled blocking is enforced on startup
        // Auto-start floating clock on browser launch if enabled in settings
        try {
            const settings = await this.getSettings();
            if (settings.autoStartClock) {
                await this.toggleFloatingClock(true);
                await this.ensureContentScriptInjected();
            }
        } catch (e) {
            console.warn('TimeShield: Failed to auto-start clock on launch', e);
        }
        console.log('🚀 Background Service fully initialized');
    }

    // NEW: Initialize Ad Blocking
    async initializeAdBlocking() {
        if (!this.adBlockEnabled) {
            console.log('🚫 Ad blocker is disabled by user');
            await this.adBlocker.clearRules();
            chrome.action.setBadgeText({ text: '' });
            return;
        }
        try {
            console.log('🔄 Starting ad blocker initialization...');

            // Check if components are properly initialized
            if (!this.filterManager || !this.ruleCompiler || !this.adBlocker) {
                console.error('❌ Ad blocker components not properly initialized');
                return;
            }

            // Load and compile filter lists
            const filters = await this.filterManager.loadAllLists();
            console.log(`📋 Loaded ${filters.length} filters`);

            const rules = await this.ruleCompiler.compile(filters);
            console.log(`⚙️ Compiled ${rules.length} DNR rules`);

            // Apply DNR rules
            await this.adBlocker.applyRules(rules);

            console.log(`✅ Ad blocker initialized successfully with ${rules.length} rules`);

            // Setup rule tracking
            this.setupRuleTracking();

            // Broadcast cosmetic rules to all tabs
            await this.broadcastCosmeticRules();
        } catch (error) {
            console.error('❌ Failed to initialize ad blocker:', error);
            console.error('Stack trace:', error.stack);
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
        // Hide numeric counts on the toolbar icon to keep the logo clean
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    }

    // NEW: Broadcast cosmetic rules to all tabs
    async broadcastCosmeticRules() {
        try {
            const allFilters = await this.filterManager.loadAllLists();
            const cosmetic = allFilters
                .filter(f => f.type === 'cosmetic')
                .map(f => {
                    const parts = f.rule.split('##');
                    return { domain: parts[0], selector: parts[1] };
                });

            const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
            for (const tab of tabs) {
                if (!tab.url) continue;

                let hostname = '';
                try {
                    hostname = new URL(tab.url).hostname.replace(/^www\./, '');
                } catch (e) { continue; }

                // Only send rules that match the current hostname.
                // Do NOT send generic rules with no domain to avoid breaking unrelated sites.
                const finalRules = cosmetic.filter(rule => {
                    if (!rule.domain) return false;
                    const domain = rule.domain.replace(/^\|\|/, '').trim();
                    return hostname === domain || hostname.endsWith('.' + domain);
                });

                chrome.tabs.sendMessage(tab.id, {
                    action: 'applyCosmeticRules',
                    rules: finalRules
                }).catch(() => { });
            }
        } catch (error) {
            console.error('❌ Failed to broadcast cosmetic rules:', error);
        }
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
        const focusResult = await chrome.storage.local.get(['focusState', 'focusBlockedSites']);
        if (focusResult.focusState) {
            this.focusState = focusResult.focusState;
            if (this.focusState.isActive) {
                // If focus was active, ensure site blocking is re-enabled with correct sites
                const sites = focusResult.focusBlockedSites || [];
                await this.enableSiteBlocking(sites, 101, 'focus');

                // Set badge and color
                chrome.action.setBadgeText({ text: '🎯' });
                chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });

                // Re-create the completion alarm if duration is still pending
                const elapsed = Math.floor((Date.now() - this.focusState.startTime) / 60000);
                const remaining = this.focusState.duration - (elapsed * 60);
                if (remaining > 0) {
                    chrome.alarms.create('focusMode', { delayInMinutes: remaining / 60 });
                } else {
                    // If time passed while extension was off, complete it now
                    this.focusModeComplete();
                }
            }
        }

        // Restore ad block state
        const adResult = await chrome.storage.local.get(['adBlockStats', 'adBlockEnabled']);
        if (adResult.adBlockStats) {
            this.adsBlocked = adResult.adBlockStats.adsBlocked || 0;
            this.bandwidthSaved = adResult.adBlockStats.bandwidthSaved || 0;
            this.timeSaved = adResult.adBlockStats.timeSaved || 0;
            this.updateAdBlockBadge();
        }
        if (adResult.adBlockEnabled === true) {
            this.adBlockEnabled = true;
        } else {
            this.adBlockEnabled = false;
        }

        // Restore grace pause state
        const graceResult = await chrome.storage.local.get(['gracePauses']);
        this.gracePauses = graceResult.gracePauses || { count: 0, lastResetDate: new Date().toDateString() };
        await this.checkGracePauseReset();

        // Restore pause state. A finite pause (including Rest of Day) must
        // survive a worker restart and continue to expire at its stored local
        // midnight timestamp. Expired pauses are cleared and protection is
        // evaluated immediately.
        const pauseResult = await chrome.storage.local.get(['pauseBlockingUntil']);
        const pauseUntil = Number(pauseResult.pauseBlockingUntil);
        if (pauseUntil === -1) {
            await this.disableSiteBlockingRange(101, 500);
        } else if (Number.isFinite(pauseUntil) && pauseUntil > Date.now()) {
            chrome.alarms.create('pauseExpires', { when: pauseUntil });
            await this.disableSiteBlockingRange(101, 500);
        } else if (pauseResult.pauseBlockingUntil !== undefined) {
            await chrome.storage.local.remove('pauseBlockingUntil');
            await this.resumeBlocking();
        }

        // Restore sleep blocking state - deprecated

        // Restore short pause usage
        const shortPauseResult = await chrome.storage.local.get(['shortPauseUsage']);
        if (shortPauseResult.shortPauseUsage) {
            this.shortPauseUsage = shortPauseResult.shortPauseUsage;
        }
        await this.checkShortPauseReset();

        const pendingFocusResult = await chrome.storage.local.get(['pendingFocusActivation', 'preActivationWarningCache']);
        this.preActivationWarningCache = pendingFocusResult.preActivationWarningCache || {};
        if (pendingFocusResult.pendingFocusActivation?.activationAt) {
            chrome.alarms.create('focusModeActivation', { when: pendingFocusResult.pendingFocusActivation.activationAt });
        }
    }

    async checkShortPauseReset() {
        const today = new Date().toDateString();
        if (this.shortPauseUsage.lastResetDate !== today) {
            this.shortPauseUsage = {
                count: 0,
                lastResetDate: today
            };
            await chrome.storage.local.set({ shortPauseUsage: this.shortPauseUsage });
        }
    }

    async incrementShortPause() {
        await this.checkShortPauseReset();
        this.shortPauseUsage.count++;
        await chrome.storage.local.set({ shortPauseUsage: this.shortPauseUsage });
    }

    async checkGracePauseReset() {
        const today = new Date().toDateString();
        if (this.gracePauses.lastResetDate !== today) {
            this.gracePauses = {
                count: 0,
                lastResetDate: today
            };
            await chrome.storage.local.set({ gracePauses: this.gracePauses });
        }
    }

    async incrementGracePause() {
        await this.checkGracePauseReset();
        this.gracePauses.count++;
        await chrome.storage.local.set({ gracePauses: this.gracePauses });
    }

    setupMessageHandlers() {
        chrome.runtime.onInstalled.addListener(async (details) => {
            if (details.reason === 'install' || details.reason === 'update') {
                await this.initializeStorage();
                await this.ensureContentScriptInjected();
                console.log('🚀 TimeShield initialized and injected into active tabs');
            }
        });

        chrome.runtime.onStartup.addListener(() => {
            this.ensureContentScriptInjected();
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            (async () => {
                try {
                    await this.initPromise;
                    if (message.action === 'showStatusWidget') {
                        await chrome.storage.local.set({ sessionOverlayDismissed: false });
                        await this.ensureContentScriptInjected();
                        const tabs = await chrome.tabs.query({});
                        await Promise.all(tabs.map((tab) => {
                            if (!tab.id) return Promise.resolve();
                            return chrome.tabs.sendMessage(tab.id, { action: 'refreshVisibility' }).catch(() => undefined);
                        }));
                        sendResponse({ success: true });
                    } else {
                        await this.handleMessage(message, sender, sendResponse);
                    }
                } catch (error) {
                    console.error(`TimeShield action failed: ${message?.action || 'unknown'}`, error);
                    sendResponse({ success: false, error: error?.message || 'Action failed' });
                }
            })();
            return true;
        });

    }

    setupAlarmHandlers() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            this.initPromise.then(() => {
                this.handleAlarm(alarm);
            });
        });

        // Daily maintenance alarms survive service-worker suspension.
        chrome.alarms.create('updateFilters', { periodInMinutes: 1440 });
        chrome.alarms.create('usageRetentionCleanup', { periodInMinutes: 1440 });

        // Check and apply scheduled blocking every minute
        chrome.alarms.create('scheduledBlockingCheck', { periodInMinutes: 1 });
        // Also check immediately on startup
        this.checkScheduledBlocking();
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

            // Handle filter update alarm
            case 'updateFilters':
                await this.updateFilters();
                break;

            case 'usageRetentionCleanup':
                await this.cleanupUsageHistory();
                break;

            case 'scheduledBlockingCheck':
                await this.checkScheduledBlocking();
                break;
            case 'pauseExpires': {
                const pauseResult = await chrome.storage.local.get(['pauseBlockingUntil']);
                const pauseUntil = Number(pauseResult.pauseBlockingUntil);
                if (pauseUntil === -1) break;
                if (Number.isFinite(pauseUntil) && pauseUntil > Date.now()) {
                    chrome.alarms.create('pauseExpires', { when: pauseUntil });
                    break;
                }
                await this.resumeBlocking();
                break;
            }
            case 'focusModeActivation':
                await this.activatePendingFocusMode();
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

    async getTodayStats() {
        return {
            focusTime: 0,
            tasksCompleted: 0,
            sessionsCompleted: 0,
            blockedAttempts: 0,
            date: new Date().toDateString()
        };
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
                const focusBlockedResult = await chrome.storage.local.get(['focusBlockedSites']);
                const fSites = Array.isArray(message.focusBlockedSites) && message.focusBlockedSites.length > 0
                    ? message.focusBlockedSites
                    : (focusBlockedResult.focusBlockedSites || []);
                const requestedDelay = message.startAfterMinutes;
                const startAfterMinutes = requestedDelay === undefined ? 1 : Number(requestedDelay);
                await this.startFocusMode(message.duration, fSites, startAfterMinutes);
                sendResponse({ success: true });
                break;
            case 'stopFocusMode':
                {
                    const allowed = await this.canRunProtectedDisable();
                    if (!allowed) {
                        sendResponse({ success: false, error: 'PROTECTION_LOCKED' });
                        break;
                    }
                    await this.stopFocusMode();
                    sendResponse({ success: true });
                }
                break;
            case 'cancelPendingFocusMode':
                {
                    const allowed = await this.canRunProtectedDisable();
                    if (!allowed) {
                        sendResponse({ success: false, error: 'PROTECTION_LOCKED' });
                        break;
                    }
                    await this.cancelPendingFocusActivation();
                    sendResponse({ success: true });
                }
                break;
            case 'applyDynamicFocusBlock':
                {
                    // Dynamically apply block to a newly added focus site while Focus Mode is active
                    const addedSite = (message.site || '').toLowerCase().replace(/^www\./, '').trim();

                    // Ensure storage has updated list (options likely updated it already)
                    const fs = await chrome.storage.local.get(['focusBlockedSites']);
                    const focusSitesList = fs.focusBlockedSites || [];

                    // If the site isn't yet in storage, add it and persist
                    if (addedSite && !focusSitesList.includes(addedSite)) {
                        focusSitesList.push(addedSite);
                        await chrome.storage.local.set({ focusBlockedSites: focusSitesList });
                    }

                    const focusResult = await chrome.storage.local.get(['focusState']);
                    if (focusResult.focusState && focusResult.focusState.isActive) {
                        try {
                            // Update DNR rules immediately so new rules take effect for future navigations
                            await this.enableSiteBlocking(focusSitesList, 101, 'focus');

                            // Redirect any currently open tabs that match the newly added site
                            const tabs = await chrome.tabs.query({});
                            for (const tab of tabs) {
                                if (!tab.url) continue;
                                try {
                                    const tabHostname = new URL(tab.url).hostname.toLowerCase().replace(/^www\./, '');
                                    if (tabHostname === addedSite || tabHostname.endsWith('.' + addedSite)) {
                                        chrome.tabs.update(tab.id, {
                                            url: chrome.runtime.getURL('floating/focus-block.html?site=' + encodeURIComponent(addedSite))
                                        }).catch(() => { });
                                    }
                                } catch (e) { /* ignore invalid URLs */ }
                            }
                        } catch (e) {
                            console.error('Error applying dynamic focus block:', e);
                        }
                    }
                    sendResponse({ success: true });
                }
                break;
            case 'authorizeDisableActions':
                {
                    const ttlMs = Math.max(10000, Math.min(120000, Number(message.ttlMs || 45000)));
                    await chrome.storage.local.set({ disableAuthorizedUntil: Date.now() + ttlMs });
                    sendResponse({ success: true });
                }
                break;
            case 'getState':
                const s = await chrome.storage.local.get(['timerState', 'focusState', 'todayStats', 'adBlockEnabled', 'pendingFocusActivation']);
                sendResponse({
                    timerState: s.timerState || this.timerState,
                    focusState: s.focusState || this.focusState,
                    todayStats: s.todayStats || { focusTime: 0, sessionsCompleted: 0, blockedAttempts: 0 },
                    adBlockEnabled: s.adBlockEnabled !== undefined ? s.adBlockEnabled : this.adBlockEnabled,
                    pendingFocusActivation: s.pendingFocusActivation || null
                });
                break;
            case 'getProtectionStatus': {
                const status = await this.getProtectionStatus();
                sendResponse({ success: true, status });
                break;
            }
            case 'getDiagnostics': {
                const diagnostics = await this.getDiagnostics();
                sendResponse({ success: true, diagnostics });
                break;
            }
            case 'runRetentionCleanup': {
                const cleanup = await this.cleanupUsageHistory();
                sendResponse({ success: true, ...cleanup });
                break;
            }
            case 'toggleClock':
                await this.toggleFloatingClock(message.visible);
                // Ensure scripts are injected after toggle to make it work immediately everywhere
                if (message.visible) await this.ensureContentScriptInjected();
                sendResponse({ success: true });
                break;
            case 'setTimeFormat':
                const settings = await this.getSettings();
                settings.timeFormat = message.format;
                await chrome.storage.local.set({ settings });
                sendResponse({ success: true });
                break;
            case 'playSound':
                this.playSound(message.sound);
                sendResponse({ success: true });
                break;
            case 'getTimerState':
                sendResponse({ state: this.timerState });
                break;
            case 'getFocusState':
                sendResponse({ state: this.focusState });
                break;
            case 'toggleAdBlock':
                this.adBlockEnabled = message.enabled;
                await chrome.storage.local.set({ adBlockEnabled: this.adBlockEnabled });
                await this.initializeAdBlocking();
                sendResponse({ success: true });
                break;
            case 'getSettings':
                const currentSettings = await this.getSettings();
                sendResponse(currentSettings);
                break;
            case 'updateStats':
                await this.updateStats(message.stats);
                sendResponse({ success: true });
                break;
            case 'checkScheduledBlocking': {
                await this.checkScheduledBlocking();
                const focusRefresh = await this.refreshActiveFocusBlocking();
                sendResponse({
                    active: await this.isScheduledBlockingActive(),
                    sleepActive: await this.isSleepBlockingActive(),
                    focusActive: focusRefresh.active
                });
                break;
            }
            case 'getAdStats':
                sendResponse({
                    adsBlocked: this.adsBlocked,
                    bandwidthSaved: this.formatBytes(this.bandwidthSaved),
                    timeSaved: this.formatTime(this.timeSaved)
                });
                break;
            case 'getGracePauseStatus':
                await this.checkGracePauseReset();
                sendResponse(this.gracePauses);
                break;
            case 'incrementGracePause':
                await this.incrementGracePause();
                sendResponse({ success: true });
                break;
            case 'trackEvent':
                // Analytics disabled
                sendResponse({ success: true });
                break;
            case 'incrementBlockedAttempts':
                // Blocked attempts tracking disabled
                sendResponse({ success: true });
                break;
            case 'getCosmeticFilters':
                const allFilters = await this.filterManager.loadAllLists();
                const cosmetic = allFilters
                    .filter(f => f.type === 'cosmetic')
                    .map(f => {
                        const parts = f.rule.split('##');
                        return { domain: parts[0], selector: parts[1] };
                    })
                    .filter(f => !f.domain || message.domain.includes(f.domain));
                sendResponse(cosmetic);
                break;
            case 'blockElement':
                const customDomain = message.domain === '*' ? '' : message.domain;
                const cosmeticRule = `${customDomain}##${message.selector}`;

                // Add to customFilters in storage
                const cfData = await chrome.storage.local.get('customFilters');
                const customFilters = cfData.customFilters || [];
                customFilters.push(cosmeticRule);
                await chrome.storage.local.set({ customFilters });

                // Track stats
                this.adsBlocked++;
                this.updateAdBlockBadge();

                // Refresh filters in all tabs
                const tabsList = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
                for (const tab of tabsList) {
                    chrome.tabs.sendMessage(tab.id, { action: 'refreshFilters' }).catch(() => { });
                }
                sendResponse({ success: true });
                break;
            case 'updateFilters':
                await this.updateFilters();
                sendResponse({ success: true });
                break;
            case 'pauseBlocking': {
                const durationMs = message.restOfDay === true
                    ? this.getRestOfDayDurationMs()
                    : Number(message.durationMs);
                if (!Number.isFinite(durationMs) || durationMs <= 0) {
                    sendResponse({ success: false, error: 'Pause duration must be greater than zero' });
                    break;
                }

                // Every pause duration requires the same visible confirmation word. This keeps
                // the duration picker from silently pausing protection, including five minutes.
                const challenge = this.generatePauseChallenge();
                await chrome.storage.local.set({
                    pauseChallenge: {
                        value: challenge,
                        durationMs,
                        restOfDay: message.restOfDay === true,
                        expiresAt: Date.now() + (10 * 60 * 1000)
                    }
                });
                sendResponse({
                    success: false,
                    requiresPassword: true,
                    challenge,
                    restOfDay: message.restOfDay === true
                });
                break;
            }
            case 'pauseBlockingWithPassword': {
                const challengeResult = await chrome.storage.local.get(['pauseChallenge']);
                const challenge = challengeResult.pauseChallenge;
                const submitted = String(message.password || '');
                const isValid = challenge && Date.now() < challenge.expiresAt && submitted === challenge.value;
                if (!isValid) {
                    sendResponse({ success: false, error: 'Incorrect challenge word or expired challenge' });
                    break;
                }

                const durationMs = challenge.restOfDay === true
                    ? this.getRestOfDayDurationMs()
                    : Number(challenge.durationMs);
                const paused = await this.pauseBlocking(durationMs);
                if (paused) {
                    await chrome.storage.local.remove('pauseChallenge');
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Pausing is unavailable while Focus Mode is active' });
                }
                break;
            }
            case 'resumeBlocking':
                await this.resumeBlocking();
                sendResponse({ success: true });
                break;
            case 'settingsUpdated':
                await this.initializeAdBlocking();
                await this.checkScheduledBlocking();
                sendResponse({ success: true });
                break;
            default:
                sendResponse({ success: false, error: 'Unknown action' });
                break;
        }
    }

    async isPaused() {
        const result = await chrome.storage.local.get(['pauseBlockingUntil']);
        const pb = result.pauseBlockingUntil;
        if (!pb) return false;
        if (pb === -1) return true;
        if (Date.now() < pb) return true;
        // Expired
        await chrome.storage.local.remove('pauseBlockingUntil');
        return false;
    }

    getRestOfDayDurationMs(now = new Date()) {
        const nextLocalMidnight = new Date(now);
        // Setting hour 24 preserves local timezone and daylight-saving behavior.
        nextLocalMidnight.setHours(24, 0, 0, 0);
        return nextLocalMidnight.getTime() - now.getTime();
    }

    generatePauseChallenge() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        const values = new Uint32Array(25);
        globalThis.crypto.getRandomValues(values);
        return Array.from(values, value => alphabet[value % alphabet.length]).join('');
    }

    async pauseBlocking(durationMs) {
        // Deep Work Strict Mode: Prevent pausing during active focus.
        const focusResult = await chrome.storage.local.get(['focusState']);
        const focusState = focusResult.focusState || {};
        if (focusState.isActive && focusState.deepWorkMode) {
            return false;
        }

        const pauseDurationMs = Number(durationMs);
        if (!Number.isFinite(pauseDurationMs) || pauseDurationMs <= 0) return false;

        const expire = Date.now() + pauseDurationMs;
        await chrome.storage.local.set({ pauseBlockingUntil: expire });
        await chrome.alarms.clear('pauseExpires');
        chrome.alarms.create('pauseExpires', { when: expire });
        // Remove ALL active blocking rules immediately (focus: 101-200, scheduled: 201-300, sleep: 301-400, time limits: 401-500)
        await this.disableSiteBlockingRange(101, 500);
        chrome.action.setBadgeText({ text: '' });
        // Redirect tabs back from ALL block pages
        await this.redirectTabsBack('floating/focus-block.html');
        await this.redirectTabsBack('floating/schedule-block.html');
        await this.redirectTabsBack('floating/sleep-block.html');
        await this.redirectTabsBack('floating/limit-block.html');
        return true;
    }

    async resumeBlocking() {
        await chrome.storage.local.remove('pauseBlockingUntil');
        chrome.alarms.clear('pauseExpires');

        // Re-evaluate ALL blocking features
        await this.checkScheduledBlocking();
        await this.checkTimeLimits(); // Re-evaluate time limits
        await this.checkGlobalLimits(); // Re-evaluate global limits

        // Re-evaluate focus mode
        const focusResult = await chrome.storage.local.get(['focusState', 'focusBlockedSites']);
        if (focusResult.focusState && focusResult.focusState.isActive) {
            const sites = focusResult.focusBlockedSites || [];
            await this.enableSiteBlocking(sites, 101, 'focus');
            await this.redirectTabsOnBlock(sites, 'floating/focus-block.html');
            chrome.action.setBadgeText({ text: '🎯' });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        }
    }

    async isScheduledBlockingActive() {
        const result = await chrome.storage.local.get(['scheduledBlocking']);
        const scheduled = result.scheduledBlocking;

        // Handle both boolean and string "enabled" states from different UI versions
        if (!scheduled || (scheduled.enabled !== true && scheduled.enabled !== 'enabled')) return false;

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const startTime = this.timeToMinutes(scheduled.startTime || '00:00');
        const endTime = this.timeToMinutes(scheduled.endTime || '23:59');
        const currentDay = now.getDay();
        const days = scheduled.days || [];

        if (startTime <= endTime) {
            // Normal schedule: e.g. 09:00 - 17:00
            return currentTime >= startTime && currentTime <= endTime && days.includes(currentDay);
        } else {
            // Overnight schedule: e.g. 22:00 - 02:00
            const isActiveTime = currentTime >= startTime || currentTime <= endTime;
            if (!isActiveTime) return false;

            // If it's early morning (before end time), it belongs to the previous day's schedule
            const effectiveDay = currentTime <= endTime ? (currentDay - 1 + 7) % 7 : currentDay;
            return days.includes(effectiveDay);
        }
    }

    async checkScheduledBlocking() {
        const paused = await this.isPaused();
        const settings = await this.getSettings();
        if (paused) {
            await this.disableScheduledBlocking();
            await this.disableSleepBlocking();
            await this.checkPreActivationWarnings();
            return;
        }
        if (settings.safeModeEnabled === true) {
            await this.disableScheduledBlocking();
            await this.disableSleepBlocking();
            return;
        }

        const [scheduledActive, sleepActive] = await Promise.all([
            this.isScheduledBlockingActive(),
            this.isSleepBlockingActive()
        ]);
        if (scheduledActive) {
            await this.enableScheduledBlocking();
        } else {
            await this.disableScheduledBlocking();
        }
        if (sleepActive) {
            await this.enableSleepBlocking();
        } else {
            await this.disableSleepBlocking();
        }
        await this.checkPreActivationWarnings();
    }

    async refreshActiveFocusBlocking() {
        const result = await chrome.storage.local.get(['focusState', 'focusBlockedSites']);
        if (!result.focusState?.isActive) return { active: false, sites: [] };

        const sites = result.focusBlockedSites || [];
        if (!await this.isPaused()) {
            await this.enableSiteBlocking(sites, 101, 'focus');
            await this.redirectTabsOnBlock(sites, 'floating/focus-block.html');
            chrome.action.setBadgeText({ text: '🎯' });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        }
        return { active: true, sites };
    }

    async checkPreActivationWarnings() {
        // A pause means blocking will not start, so do not alarm the user until
        // protection is actually going to resume.
        if (await this.isPaused()) return;

        const result = await chrome.storage.local.get(['scheduledBlocking', 'sleepBlocking', 'preActivationWarningCache', 'settings']);
        this.preActivationWarningCache = result.preActivationWarningCache || {};
        const now = new Date();

        await this.checkSinglePreActivationWarning(
            'scheduled',
            'Scheduled Blocking',
            result.scheduledBlocking,
            now,
            result.settings || {}
        );
        await this.checkSinglePreActivationWarning(
            'sleep',
            'Sleep Mode',
            result.sleepBlocking,
            now,
            result.settings || {}
        );
    }

    async checkSinglePreActivationWarning(cacheKey, label, config, now, settings = {}) {
        const nextStart = this.getNextActivationStart(config, now);
        if (!nextStart) return;

        const msUntilStart = nextStart.getTime() - now.getTime();
        const firstWarningMinutes = Math.max(1, Number(settings.scheduleWarningFirstMinutes || 5));
        const finalWarningMinutes = Math.max(1, Math.min(firstWarningMinutes, Number(settings.scheduleWarningFinalMinutes || 1)));
        if (msUntilStart <= 0 || msUntilStart > firstWarningMinutes * 60000) return;

        const minutesUntilStart = Math.ceil(msUntilStart / 60000);
        const warningMinutes = minutesUntilStart <= finalWarningMinutes ? finalWarningMinutes : firstWarningMinutes;
        const warningToken = `${cacheKey}:${nextStart.toISOString().slice(0, 16)}`;
        const cacheEntry = this.preActivationWarningCache[cacheKey];
        const alreadyWarned = typeof cacheEntry === 'object'
            ? cacheEntry[warningMinutes] === warningToken
            : warningMinutes === 1 && cacheEntry === warningToken;

        if (!alreadyWarned) {
            const title = `${label} starts in ${warningMinutes} minute${warningMinutes === 1 ? '' : 's'}`;
            const message = 'Save your work now to avoid interruption.';
            let notificationSent = false;
            if (settings.notificationsEnabled !== false) {
                await this.sendNotification(
                    title,
                    message,
                    warningMinutes <= finalWarningMinutes,
                    `preactivation-${cacheKey}-${warningMinutes}-${Date.now()}`
                );
                notificationSent = true;
            }
            const delivered = await this.sendActiveTabMessage({
                action: 'showBlockingWarning',
                label,
                remainingMinutes: warningMinutes
            });
            if (!delivered && !notificationSent && settings.notificationFallbackEnabled !== false) {
                await this.sendNotification(title, message, warningMinutes <= finalWarningMinutes);
            }

            const nextCacheEntry = typeof cacheEntry === 'object' && cacheEntry !== null
                ? cacheEntry
                : {};
            nextCacheEntry[warningMinutes] = warningToken;
            this.preActivationWarningCache[cacheKey] = nextCacheEntry;
            await chrome.storage.local.set({ preActivationWarningCache: this.preActivationWarningCache });
        }

        // Start one compact in-page countdown during the final minute. The
        // content script owns the one-second tick and removes itself at zero.
        if (settings.showBlockingCountdown !== false && msUntilStart <= finalWarningMinutes * 60000) {
            await this.sendActiveTabMessage({
                action: 'showBlockingCountdown',
                label,
                endAt: nextStart.getTime()
            });
        }
    }

    async sendActiveTabMessage(message) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];
            if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return false;

            try {
                const response = await chrome.tabs.sendMessage(tab.id, message);
                if (response?.success === true) return true;
            } catch {
                // The active tab may not have the content script yet.
            }

            let injectionPromise = this.activeTabInjectionPromises.get(tab.id);
            if (!injectionPromise) {
                injectionPromise = Promise.allSettled([
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content/blocker.js', 'content/anti-antiblock.js']
                    }),
                    chrome.scripting.insertCSS({
                        target: { tabId: tab.id },
                        files: ['content/adblock-styles.css']
                    })
                ]).finally(() => {
                    if (this.activeTabInjectionPromises.get(tab.id) === injectionPromise) {
                        this.activeTabInjectionPromises.delete(tab.id);
                    }
                });
                this.activeTabInjectionPromises.set(tab.id, injectionPromise);
            }
            await injectionPromise;
            const response = await chrome.tabs.sendMessage(tab.id, message);
            return response?.success === true;
        } catch (error) {
            return false;
        }
    }

    getNextActivationStart(config, now = new Date()) {
        const enabled = config?.enabled === true || config?.enabled === 'enabled';
        const days = Array.isArray(config?.days) ? config.days : [];
        if (!enabled || !days.length) return null;

        const startTime = config.startTime || '00:00';
        const [hour, minute] = startTime.split(':').map(Number);
        if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
            const candidate = new Date(now.getTime());
            candidate.setHours(0, 0, 0, 0);
            candidate.setDate(candidate.getDate() + dayOffset);

            if (!days.includes(candidate.getDay())) continue;

            candidate.setHours(hour, minute, 0, 0);
            if (candidate.getTime() > now.getTime()) {
                return candidate;
            }
        }

        return null;
    }

    async isSleepBlockingActive() {
        const result = await chrome.storage.local.get(['sleepBlocking']);
        const sleep = result.sleepBlocking;
        if (!sleep || (sleep.enabled !== true && sleep.enabled !== 'enabled' && sleep.enabled !== 'true' && sleep.enabled !== 1 && sleep.enabled !== '1')) return false;

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const startTime = this.timeToMinutes(sleep.startTime || '22:00');
        const endTime = this.timeToMinutes(sleep.endTime || '06:00');
        const currentDay = now.getDay();
        const days = Array.isArray(sleep.days) ? sleep.days : [];
        if (!days.length) return false;

        if (startTime <= endTime) {
            return currentTime >= startTime && currentTime <= endTime && days.includes(currentDay);
        }
        const isActiveTime = currentTime >= startTime || currentTime <= endTime;
        if (!isActiveTime) return false;
        const effectiveDay = currentTime <= endTime ? (currentDay - 1 + 7) % 7 : currentDay;
        return days.includes(effectiveDay);
    }

    async enableSleepBlocking() {
        const result = await chrome.storage.local.get(['sleepBlocking']);
        const sleepConfig = result.sleepBlocking || {};
        const whitelist = Array.isArray(sleepConfig.whitelist) ? sleepConfig.whitelist : [];
        await this.enableSiteBlocking(['*'], 301, 'sleep', whitelist);
        await this.redirectAllTabs('floating/sleep-block.html', whitelist);
        chrome.action.setBadgeText({ text: '😴' });
        chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
    }

    async disableSleepBlocking() {
        await this.disableSiteBlockingRange(301, 400);
        await this.redirectTabsBack('floating/sleep-block.html');
    }

    async enableScheduledBlocking() {
        const result = await chrome.storage.local.get(['scheduledBlockedSites', 'scheduledBlocking']);
        const scheduledConfig = result.scheduledBlocking || {};
        const mode = scheduledConfig.mode || 'specific';

        if (mode === 'all') {
            const whitelist = scheduledConfig.whitelist || [];
            const allSitesPattern = ['*'];
            await this.enableSiteBlocking(allSitesPattern, 201, 'schedule', whitelist);
            await this.redirectAllTabs('floating/schedule-block.html', whitelist);
            chrome.action.setBadgeText({ text: '😴' });
            chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' }); // Purple color for "sleep/block all"
        } else {
            const sites = result.scheduledBlockedSites || StorageManager.getDefaultBlockedSites();
            await this.enableSiteBlocking(sites, 201, 'schedule');
            await this.redirectTabsOnBlock(sites, 'floating/schedule-block.html');
            chrome.action.setBadgeText({ text: '🚫' });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' }); // Red color for "specific blocklist"
        }
    }

    async disableScheduledBlocking() {
        await this.disableSiteBlockingRange(201, 300);
        await this.redirectTabsBack('floating/schedule-block.html');
        chrome.action.setBadgeText({ text: '' });
    }

    async redirectAllTabs(blockPage, whitelist = []) {
        const extensionUrl = chrome.runtime.getURL(blockPage);
        const normalizedWhitelist = whitelist.map(site => {
            return site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
        }).filter(domain => domain);

        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (!tab.url) continue;
            // Always skip extension pages, block pages already shown, local files, and PDFs
            if (tab.url.includes(blockPage)) continue;
            if (tab.url.startsWith('chrome-extension://')) continue;
            if (tab.url.startsWith('chrome://')) continue;
            if (tab.url.startsWith('file://')) continue;
            if (/\.pdf($|[?#])/i.test(tab.url)) continue;

            let tabDomain;
            try {
                tabDomain = new URL(tab.url).hostname.replace(/^www\./, '');
            } catch { continue; }

            // Always allow localhost and 127.0.0.1 regardless of whitelist
            if (tabDomain === 'localhost' || tabDomain === '127.0.0.1') continue;

            // Check if current tab is whitelisted
            const isWhitelisted = normalizedWhitelist.some(whitelistedDomain =>
                tabDomain === whitelistedDomain || tabDomain.endsWith('.' + whitelistedDomain)
            );

            // Only redirect non-whitelisted tabs
            if (!isWhitelisted) {
                chrome.tabs.update(tab.id, {
                    url: `${extensionUrl}?orig=${encodeURIComponent(tab.url)}`
                }).catch(() => { });
            }
        }
    }

    async checkTimeLimits() {
        // Time limits are handled by UsageTracker class
        // This method ensures time limit checking continues when not paused
        const paused = await this.isPaused();
        if (paused) {
            // If paused, redirect any tabs on limit block pages back
            await this.redirectTabsBack('floating/limit-block.html');
        }
        // UsageTracker will handle the actual time limit checking
    }

    async checkGlobalLimits() {
        // Global limits are handled by UsageTracker class
        // This method ensures global limit checking continues when not paused
        const paused = await this.isPaused();
        if (paused) {
            // If paused, redirect any tabs on limit block pages back
            await this.redirectTabsBack('floating/limit-block.html');
        }
        // UsageTracker will handle the actual global limit checking
    }

    async redirectTabsOnBlock(sites, blockPage) {
        const extensionUrl = chrome.runtime.getURL(blockPage);
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (!tab.url || tab.url.includes(blockPage)) continue;

            const isBlocked = sites.some(site => {
                const domain = site.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '').split('/')[0];
                return tab.url.includes(domain);
            });

            if (isBlocked) {
                chrome.tabs.update(tab.id, {
                    url: `${extensionUrl}?orig=${encodeURIComponent(tab.url)}`
                }).catch(() => { });
            }
        }
    }

    async redirectTabsBack(blockPage) {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && tab.url.includes(blockPage)) {
                const urlObj = new URL(tab.url);
                const orig = urlObj.searchParams.get('orig');
                if (orig) {
                    chrome.tabs.update(tab.id, { url: decodeURIComponent(orig) }).catch(() => { });
                }
            }
        }
    }

    async isSiteBlocked(hostname) {
        // Check if site is in any blocklist
        const result = await chrome.storage.local.get(['focusBlockedSites', 'scheduledBlockedSites', 'timeLimits', 'timeLimitsEnabled', 'globalLimit', 'scheduledBlocking', 'sleepBlocking']);
        
        const focusSites = result.focusBlockedSites || [];
        const scheduledSites = result.scheduledBlockedSites || [];
        const timeLimits = result.timeLimits || [];
        const timeLimitsEnabled = result.timeLimitsEnabled || false;
        const globalLimit = result.globalLimit || { enabled: false, domains: [] };
        
        // Check focus blocking
        const focusResult = await chrome.storage.local.get(['focusState']);
        if (focusResult.focusState && focusResult.focusState.isActive && focusSites.includes(hostname)) {
            return true;
        }
        
        // Check scheduled blocking (unified specific vs block all)
        const isScheduledActive = await this.isScheduledBlockingActive();
        if (isScheduledActive) {
            const scheduledConfig = result.scheduledBlocking || {};
            const mode = scheduledConfig.mode || 'specific';
            if (mode === 'all') {
                const whitelist = scheduledConfig.whitelist || [];
                const normalizedWhitelist = whitelist.map(site => {
                    return site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
                }).filter(domain => domain);
                
                const isWhitelisted = normalizedWhitelist.some(whitelistedDomain =>
                    hostname === whitelistedDomain || hostname.endsWith('.' + whitelistedDomain)
                );
                const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
                if (!isWhitelisted && !isLocalhost) {
                    return true;
                }
            } else if (scheduledSites.includes(hostname)) {
                return true;
            }
        }
        
        // Sleep blocking stays independent from the scheduled blocklist and blocks all sites except its whitelist.
        if (await this.isSleepBlockingActive()) {
            const whitelist = Array.isArray(result.sleepBlocking?.whitelist) ? result.sleepBlocking.whitelist : [];
            const isWhitelisted = whitelist.some(site => {
                const allowed = String(site).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
                return allowed && (hostname === allowed || hostname.endsWith(`.${allowed}`));
            });
            if (!isWhitelisted && hostname !== 'localhost' && hostname !== '127.0.0.1') return true;
        }

        // Check time limits
        if (timeLimitsEnabled) {
            const limit = timeLimits.find(l => l.site === hostname);
            if (limit) {
                return true;
            }
        }
        
        // Check global limit
        if (globalLimit.enabled && globalLimit.domains.includes(hostname)) {
            return true;
        }
        
        return false;
    }

    async migrateOldSettings() {
        const result = await chrome.storage.local.get(['sleepBlocking', 'scheduledBlocking', 'whitelist', 'migrationDone']);
        if (result.migrationDone) return;

        console.log('🔄 Checking for deprecated Night/Sleep Blocking settings to migrate...');

        const scheduledBlocking = result.scheduledBlocking || {
            enabled: false,
            startTime: '09:00',
            endTime: '17:00',
            days: [1, 2, 3, 4, 5],
            mode: 'specific',
            whitelist: []
        };

        if (!scheduledBlocking.mode) {
            scheduledBlocking.mode = 'specific';
        }
        if (!scheduledBlocking.whitelist) {
            scheduledBlocking.whitelist = result.whitelist || [];
        }

        // Sleep Blocking is now an independent protection. Keep its existing
        // configuration intact rather than folding it into Scheduled Blocking.
        await chrome.storage.local.set({
            scheduledBlocking,
            migrationDone: true
        });

        await chrome.storage.local.remove(['sleepBlockingState']);
        console.log('✅ Schedule and Sleep Blocking settings preserved independently.');
    }
    timeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }

    async startTimer(duration, type = 'custom') {
        const durSec = Math.floor(Number(duration));
        if (!Number.isFinite(durSec) || durSec <= 0) {
            throw new Error('Timer duration must be greater than zero');
        }
        await this.ensureContentScriptInjected();
        await chrome.alarms.clear('timer');
        this.timerState = { isRunning: true, startTime: Date.now(), duration: durSec, type };
        chrome.alarms.create('timer', { delayInMinutes: durSec / 60 });
        await chrome.storage.local.set({ timerState: this.timerState, sessionOverlayDismissed: false });
        chrome.action.setBadgeText({ text: '⏱️' });
        chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
        // No popup window created here anymore as requested
    }

    startTimerAlarm() {
        const remainingTime = (this.timerState.startTime + this.timerState.duration * 1000) - Date.now();
        if (remainingTime > 0) {
            chrome.alarms.create('timer', { delayInMinutes: remainingTime / 60000 });
        }
    }

    async stopTimer() {
        this.timerState.isRunning = false;
        chrome.alarms.clear('timer');
        await chrome.storage.local.set({ timerState: this.timerState });
        chrome.action.setBadgeText({ text: '' });
    }

    async timerComplete() {
        const type = this.timerState.type || 'timer';
        const startTime = this.timerState.startTime || Date.now();
        const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minsRemaining = Math.max(1, Math.round(durationSeconds / 60));
        const targetMins = Math.round(this.timerState.duration / 60);

        this.timerState.isRunning = false;
        await chrome.storage.local.set({ timerState: this.timerState });

        const notificationId = 'timer-complete-' + Date.now();
        chrome.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: 'assets/icons/icon128.png',
            title: 'Timer complete',
            message: `Great work — your ${targetMins} minute session is complete.`,
            priority: 2
        });
        setTimeout(() => chrome.notifications.clear(notificationId), 8000);

        // Update stats
        await this.updateStats({ focusTime: type === 'focus' ? durationSeconds : 0, sessionsCompleted: 1 });

        // Create completion window that auto-closes
        chrome.windows.create({
            url: chrome.runtime.getURL(`floating/timer-complete.html?type=${type}&mins=${minsRemaining}`),
            type: 'popup',
            width: 320,
            height: 260,
            focused: true
        }).catch(() => { });

        this.playSound('timer-complete');

        chrome.action.setBadgeText({ text: '' });
    }

    async canRunProtectedDisable() {
        const data = await chrome.storage.local.get(['disableAuthorizedUntil']);
        return Number(data.disableAuthorizedUntil || 0) > Date.now();
    }

    async startFocusMode(duration, focusBlockedSites = [], startAfterMinutes = 0) {
        const durationSeconds = Math.floor(Number(duration));
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            throw new Error('Focus duration must be greater than zero');
        }
        await this.cancelPendingFocusActivation();
        const delayMinutes = Math.max(0, Number(startAfterMinutes || 0));
        if (delayMinutes >= 1) {
            const activationAt = Date.now() + (delayMinutes * 60000);
            const pendingFocusActivation = {
                duration: durationSeconds,
                focusBlockedSites: Array.isArray(focusBlockedSites) ? focusBlockedSites : [],
                activationAt
            };

            await chrome.storage.local.set({ pendingFocusActivation });
            chrome.alarms.create('focusModeActivation', { when: activationAt });
            await this.sendNotification(
                'Focus Mode starts in 1 minute',
                'Save your work now. Focus blocking will activate soon.',
                true,
                `focus-preactivation-${activationAt}`
            );
            return;
        }

        await this.activateFocusMode(durationSeconds, focusBlockedSites);
    }

    async activatePendingFocusMode() {
        const result = await chrome.storage.local.get(['pendingFocusActivation']);
        const pending = result.pendingFocusActivation;
        if (!pending) return;

        await chrome.storage.local.remove(['pendingFocusActivation']);
        await this.activateFocusMode(pending.duration, pending.focusBlockedSites || []);
    }

    async cancelPendingFocusActivation() {
        await chrome.alarms.clear('focusModeActivation');
        await chrome.storage.local.remove(['pendingFocusActivation']);
    }

    async activateFocusMode(duration, focusBlockedSites = []) {
        await this.ensureContentScriptInjected();
        const effectiveFocusSites = focusBlockedSites;
        const endTime = Date.now() + (duration * 1000);
        // Deep Work Strict Mode: automatically enabled during Focus Mode
        this.focusState = { isActive: true, startTime: Date.now(), duration, endTime, deepWorkMode: true };
        chrome.alarms.create('focusMode', { delayInMinutes: duration / 60 });
        await chrome.storage.local.set({ focusState: this.focusState, sessionOverlayDismissed: false });

        const paused = await this.isPaused();
        if (!paused) {
            await this.disableSiteBlockingRange(101, 200);
            await this.enableSiteBlocking(effectiveFocusSites, 101, 'focus');
            await this.redirectTabsOnBlock(effectiveFocusSites, 'floating/focus-block.html');

            chrome.action.setBadgeText({ text: '🎯' });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        }

        // Show focus timer
        await this.showFocusTimer();

        this.playSound('focus-start');

        // Block access to chrome://extensions during Deep Work Mode
        await this.blockExtensionsPage();
    }

    async stopFocusMode() {
        await this.cancelPendingFocusActivation();
        this.focusState.isActive = false;
        this.focusState.deepWorkMode = false;
        this.focusState.endTime = Date.now();

        await chrome.alarms.clear('focusMode');
        await this.disableSiteBlockingRange(101, 200);
        await chrome.storage.local.set({ focusState: this.focusState });

        await this.redirectTabsBack('floating/focus-block.html');
        chrome.action.setBadgeText({ text: '' });

        // Hide focus timer
        await this.hideFocusTimer();

        // Unblock chrome://extensions access
        await this.unblockExtensionsPage();
    }

    async showFocusTimer() {
        try {
            // Focus timer is now integrated into the floating clock widget
            // which automatically appears in status mode if the clock is hidden
            console.log('🎯 Focus session started - status widget will appear in tabs');
        } catch (error) {
            console.error('Error showing focus timer:', error);
        }
    }

    async hideFocusTimer() {
        try {
            // Send message to all tabs to hide focus timer
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && (tab.url.includes('focus-timer.html') || tab.url.includes('flip-clock.html'))) {
                    chrome.tabs.sendMessage(tab.id, { action: 'hideFocusTimer' }).catch(() => { });
                }
            }
        } catch (error) {
            console.error('Error hiding focus timer:', error);
        }
    }

    async focusModeComplete() {
        const result = await chrome.storage.local.get(['focusState']);
        this.focusState = result.focusState || this.focusState;

        const startTime = this.focusState.startTime || (Date.now() - (this.focusState.duration * 1000));
        const focusSeconds = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.max(1, Math.floor(focusSeconds / 60));

        // Create completion window that auto-closes
        chrome.windows.create({
            url: chrome.runtime.getURL(`floating/focus-complete.html?mins=${mins}`),
            type: 'popup',
            width: 320,
            height: 260,
            focused: true
        }).catch(() => { });


        await this.updateStats({ focusTime: focusSeconds, sessionsCompleted: 1 });

        this.playSound('timer-complete');
        await this.stopFocusMode();
    }

    async ensureContentScriptInjected() {
        const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        for (const tab of tabs) {
            try {
                // Check if already injected
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            } catch (e) {
                // Not injected, do it now
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content/blocker.js', 'content/anti-antiblock.js']
                }).catch(() => undefined);
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['content/adblock-styles.css']
                }).catch(() => undefined);
            }
        }
    }

    async enableSiteBlocking(blockedSites, startId = 1, type = 'focus', whitelist = []) {
        const blockPage = type === 'schedule' ? 'floating/schedule-block.html' :
            type === 'sleep' ? 'floating/sleep-block.html' : 'floating/focus-block.html';
        const extensionUrl = chrome.runtime.getURL(blockPage);

        // Clear previous rules in this specific range first (IMPORTANT: prevents conflicts by using exactly 100 slots)
        await this.disableSiteBlockingRange(startId, startId + 99);

        // Special handling for sleep blocking - block all sites except whitelist, localhost, and PDFs
        if (type === 'sleep' && blockedSites.includes('*')) {
            // Normalize whitelist domains
            const normalizedWhitelist = whitelist.map(site => {
                return site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
            }).filter(domain => domain);

            console.log('🔍 Sleep blocking rules:', { originalWhitelist: whitelist, normalizedWhitelist });

            // Create individual rules for each whitelist domain
            const rules = [];

            // Main blocking rule for all sites (excluding PDFs)
            rules.push({
                id: startId,
                priority: 3, // Highest priority for sleep blocking
                action: {
                    type: 'redirect',
                    redirect: { url: extensionUrl }
                },
                condition: {
                    urlFilter: '*',
                    resourceTypes: ['main_frame'],
                    excludedInitiatorDomains: [chrome.runtime.id] // Only exclude extension pages
                }
            });

            // Allow PDF documents to open normally
            rules.push({
                id: startId + 1,
                priority: 5,
                action: {
                    type: 'allow'
                },
                condition: {
                    regexFilter: '^(https?|file)://.*\\.pdf($|[?#])',
                    resourceTypes: ['main_frame']
                }
            });

            // Create separate rules to allow whitelisted domains
            normalizedWhitelist.forEach((domain, index) => {
                if (domain) {
                    rules.push({
                        id: startId + 2 + index,
                        priority: 4, // Higher priority to override blocking
                        action: {
                            type: 'allow'
                        },
                        condition: {
                            urlFilter: `||${domain}^`,
                            resourceTypes: ['main_frame']
                        }
                    });
                }
            });

            // Add rule for localhost (127.0.0.1 and localhost variants)
            const localhostRuleId = startId + normalizedWhitelist.length + 2;
            rules.push({
                id: localhostRuleId,
                priority: 4, // Higher priority to override blocking
                action: {
                    type: 'allow'
                },
                condition: {
                    urlFilter: '||localhost^',
                    resourceTypes: ['main_frame']
                }
            });

            // Add rule for 127.0.0.1
            const ipRuleId = startId + normalizedWhitelist.length + 3;
            rules.push({
                id: ipRuleId,
                priority: 4, // Higher priority to override blocking
                action: {
                    type: 'allow'
                },
                condition: {
                    urlFilter: '||127.0.0.1^',
                    resourceTypes: ['main_frame']
                }
            });

            // Add rule for local development ports (localhost:3000, localhost:8080, etc.)
            const localDevRuleId = startId + normalizedWhitelist.length + 4;
            rules.push({
                id: localDevRuleId,
                priority: 4, // Higher priority to override blocking
                action: {
                    type: 'allow'
                },
                condition: {
                    regexFilter: '^https?://(localhost|127\\.0\\.0\\.1):\\d+',
                    resourceTypes: ['main_frame']
                }
            });

            await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
            return;
        }

        // Alias handling: if x.com is added, also block twitter.com and vice versa
        const expandedSites = [...blockedSites];
        if (blockedSites.some(s => s.includes('x.com'))) expandedSites.push('twitter.com');
        if (blockedSites.some(s => s.includes('twitter.com'))) expandedSites.push('x.com');

        const rules = [...new Set(expandedSites)].map((site, index) => {
            // Normalize site: remove http/https/www
            const domain = site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
            if (!domain) return null;

            return {
                id: startId + index,
                priority: 2, // Increased priority to ensure it overrides other rules
                action: {
                    type: 'redirect',
                    redirect: { url: `${extensionUrl}?orig=${encodeURIComponent('https://' + domain)}` }
                },
                condition: {
                    // Use more inclusive filter to catch variants
                    urlFilter: `||${domain}^`,
                    resourceTypes: ['main_frame']
                }
            };
        }).filter(r => r !== null);
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }

    async disableSiteBlockingRange(startId, endId) {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIds = rules.map(r => r.id).filter(id => id >= startId && id <= endId);
        if (ruleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
        }
    }

    async sendBreakReminder() {
        const notificationId = 'break-reminder-' + Date.now();
        chrome.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: 'assets/icons/icon128.png',
            title: 'Break Time!',
            message: 'Time to take a break and stretch!',
            priority: 2,
            requireInteraction: true
        });

        // Auto-clear after 8 seconds
        setTimeout(() => {
            chrome.notifications.clear(notificationId);
        }, 8000);

        this.playSound('break-time');
    }

    async sendNotification(title, message, requireInteraction = false, notificationId = null) {
        const settings = await this.getSettings();
        if (settings.notificationsEnabled === false) return;

        const id = notificationId || `timeshield-notice-${Date.now()}`;
        chrome.notifications.create(id, {
            type: 'basic',
            iconUrl: 'assets/icons/icon128.png',
            title,
            message,
            priority: 2,
            requireInteraction
        });

        if (!requireInteraction) {
            setTimeout(() => {
                chrome.notifications.clear(id);
            }, 8000);
        }
    }

    async updateStats(newStats) {
        // Statistics tracking disabled as per user request
    }

    async getProtectionStatus() {
        const result = await chrome.storage.local.get([
            'pauseBlockingUntil', 'focusState', 'timerState', 'todayStats',
            'siteUsageData', 'scheduledBlocking', 'sleepBlocking', 'settings'
        ]);
        const settings = { ...this.getDefaultSettings(), ...(result.settings || {}) };
        const today = new Date().toDateString();
        const todayUsage = result.siteUsageData?.[today] || {};
        const todaySeconds = Object.values(todayUsage).reduce((sum, value) => sum + (Number(value) || 0), 0);
        const pauseUntil = Number(result.pauseBlockingUntil);
        const [scheduleActive, sleepActive] = await Promise.all([
            this.isScheduledBlockingActive(),
            this.isSleepBlockingActive()
        ]);
        return {
            active: Boolean(result.focusState?.isActive || result.timerState?.isActive || scheduleActive || sleepActive),
            paused: pauseUntil === -1 || (Number.isFinite(pauseUntil) && pauseUntil > Date.now()),
            pauseUntil: pauseUntil > 0 ? pauseUntil : null,
            scheduleActive,
            sleepActive,
            focusActive: Boolean(result.focusState?.isActive),
            timerActive: Boolean(result.timerState?.isActive),
            safeMode: settings.safeModeEnabled === true,
            todaySeconds,
            updatedAt: Date.now()
        };
    }

    async getDiagnostics() {
        const alarms = await chrome.alarms.getAll();
        const tabs = await chrome.tabs.query({});
        const storage = await chrome.storage.local.get([
            'settings', 'pauseBlockingUntil', 'focusState', 'timerState',
            'scheduledBlocking', 'sleepBlocking', 'timeLimits', 'globalLimit',
            'siteUsageData', 'timeLimitWarningCache', 'preActivationWarningCache',
            'syncStatus', 'lastSyncTime'
        ]);
        const status = await this.getProtectionStatus();
        return {
            generatedAt: new Date().toISOString(),
            status,
            alarms: alarms.map(alarm => ({ name: alarm.name, scheduledTime: alarm.scheduledTime, periodInMinutes: alarm.periodInMinutes || null })),
            tabCount: tabs.length,
            webTabCount: tabs.filter(tab => /^https?:\/\//.test(tab.url || '')).length,
            configuredTimeLimitCount: Array.isArray(storage.timeLimits) ? storage.timeLimits.length : 0,
            globalLimitEnabled: Boolean(storage.globalLimit?.enabled),
            scheduledBlockingEnabled: Boolean(storage.scheduledBlocking?.enabled),
            sleepBlockingEnabled: Boolean(storage.sleepBlocking?.enabled),
            warningCacheDomains: Object.keys(storage.timeLimitWarningCache || {}).length,
            syncStatus: storage.syncStatus || null,
            lastSyncTime: storage.lastSyncTime || null
        };
    }

    async cleanupUsageHistory() {
        const settings = { ...this.getDefaultSettings(), ...(await this.getSettings()) };
        const retentionDays = Math.min(730, Math.max(7, Number(settings.usageRetentionDays || 90)));
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - retentionDays);
        const cutoffTimestamp = cutoff.getTime();
        const cutoffKey = cutoff.toDateString();
        const result = await chrome.storage.local.get(['siteUsageData', 'siteUsageTimeline', 'siteOpenCounts', 'timeLimitWarningCache']);
        const isRecentDateKey = (key) => {
            const timestamp = Date.parse(String(key));
            return Number.isFinite(timestamp) && timestamp >= cutoffTimestamp;
        };
        const prune = (source = {}) => Object.fromEntries(Object.entries(source).filter(([day]) => isRecentDateKey(day)));
        const nextData = prune(result.siteUsageData);
        const nextTimeline = prune(result.siteUsageTimeline);
        const nextOpenCounts = prune(result.siteOpenCounts);
        const nextWarningCache = Object.fromEntries(Object.entries(result.timeLimitWarningCache || {}).filter(([key, value]) => {
            if (key === '__global__') return true;
            return value && Object.values(value).some(token => {
                const tokenDate = String(token).split(':')[0];
                return isRecentDateKey(tokenDate);
            });
        }));
        const removedDays = Math.max(0, Object.keys(result.siteUsageData || {}).length - Object.keys(nextData).length);
        await chrome.storage.local.set({
            siteUsageData: nextData,
            siteUsageTimeline: nextTimeline,
            siteOpenCounts: nextOpenCounts,
            timeLimitWarningCache: nextWarningCache
        });
        return { removedDays, retentionDays, cutoffKey };
    }

    getDefaultSettings() {
        return {
            notificationsEnabled: true,
            notificationFallbackEnabled: true,
            showBlockingCountdown: true,
            siteWarningFirstMinutes: 2,
            siteWarningFinalMinutes: 1,
            scheduleWarningFirstMinutes: 5,
            scheduleWarningFinalMinutes: 1,
            usageRetentionDays: 90,
            safeModeEnabled: false
        };
    }

    async getSettings() {
        const result = await chrome.storage.local.get(['settings']);
        return { ...this.getDefaultSettings(), ...(result.settings || {}) };
    }

    async playSound(soundName) {
        const settings = await this.getSettings();
        if (!settings.soundEnabled) return;

        const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'playSound',
                sound: soundName
            }).catch(() => { });
        });
    }

    async toggleFloatingClock(forcedState) {
        const result = await chrome.storage.local.get(['clockVisible']);
        const isVisible = result.clockVisible || false;

        // Use forced state if provided, otherwise toggle
        const newState = (forcedState !== undefined) ? forcedState : !isVisible;
        await chrome.storage.local.set({ clockVisible: newState });

        // Send message to all tabs to update visibility
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'toggleClock',
                visible: newState
            }).catch(() => { });
        });
    }

    async blockExtensionsPage() {
        // Create a DNR rule to redirect chrome://extensions to a blocked page
        // This helps prevent users from disabling the extension during Deep Work Mode
        // Note: Chrome doesn't allow blocking chrome:// URLs via content scripts or DNR
        // Instead, we monitor tab creation and close any attempt to visit chrome://extensions
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && tab.url.includes('chrome://extensions')) {
                    // Close any existing extensions management tabs
                    chrome.tabs.remove(tab.id);
                }
            }

            // Set up listeners to detect attempts to open chrome://extensions and close them.
            if (!this._extensionsListenerAdded) {
                this._extensionsListenerAdded = true;

                this._onBeforeNavigateHandler = (details) => {
                    if (!details || !details.url) return;
                    if (details.url.includes('chrome://extensions')) {
                        // Attempting to open chrome://extensions — close the tab if focus mode active.
                        if (this.focusState && this.focusState.isActive) {
                            // Try to close the tab (if available)
                            try {
                                if (details.tabId) chrome.tabs.remove(details.tabId).catch(() => { });
                            } catch (e) { }
                        }
                    }
                };

                this._onCommittedHandler = (details) => {
                    if (!details || !details.url) return;
                    if (details.url.includes('chrome://extensions')) {
                        if (this.focusState && this.focusState.isActive) {
                            // If navigation succeeded, close the tab
                            try {
                                if (details.tabId) chrome.tabs.remove(details.tabId).catch(() => { });
                            } catch (e) { }
                        }
                    }
                };

                chrome.webNavigation.onBeforeNavigate.addListener(this._onBeforeNavigateHandler);
                chrome.webNavigation.onCommitted.addListener(this._onCommittedHandler);
            }
        } catch (error) {
            console.error('Error blocking extensions page:', error);
        }
    }

    async unblockExtensionsPage() {
        // Remove any restrictions on chrome://extensions access
        // (Note: We don't need to do much here as restrictions are checked at runtime)
        if (this._extensionsListenerAdded) {
            try {
                if (this._onBeforeNavigateHandler) chrome.webNavigation.onBeforeNavigate.removeListener(this._onBeforeNavigateHandler);
                if (this._onCommittedHandler) chrome.webNavigation.onCommitted.removeListener(this._onCommittedHandler);
            } catch (e) { }
            this._extensionsListenerAdded = false;
            this._onBeforeNavigateHandler = null;
            this._onCommittedHandler = null;
        }
        console.log('Deep Work Strict Mode disabled - chrome://extensions access restored');
    }

    async initializeStorage() {
        const defaults = {
            settings: {
                theme: 'solar',
                soundEnabled: true,
                notificationsEnabled: true,
                breakReminders: true,
                clockPosition: { x: 20, y: 20 },
                clockSize: 'medium',
                focusTimerWidgetEnabled: true,
                timerWidgetEnabled: true
            },
            blockedSites: [
                'facebook.com',
                'twitter.com',
                'instagram.com',
                'youtube.com',
                'reddit.com',
                'netflix.com'
            ],
            gracePauses: {
                count: 0,
                lastResetDate: new Date().toDateString()
            },
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
