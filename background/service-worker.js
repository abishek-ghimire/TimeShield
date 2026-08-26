// Import ad-blocking modules
import { AdBlockEngine } from './adblock-core.js';
import { FilterListManager } from './filter-lists.js';
import { RuleCompiler } from './adblock-rules.js';
import { StorageManager } from '../lib/storage-manager.js';
import { usageTracker } from './usage-tracker.js';

const DEFAULT_NUCLEAR_WHITELIST = [
    'chatgpt.com',
    'gemini.google.com',
    'notebooklm.google.com',
    'claude.ai',
    'deepseek.com',
    'grok.com',
    'web.whatsapp.com'
];
const NUCLEAR_OPEN_TAB_SESSION_RULE_ID = 48001;

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

        // Track challenge-free one-minute pauses (maximum two per local day).
                this.shortPauseUsage = {
            count: 0,
            lastResetDate: new Date().toDateString()
        };
        this.shortPauseRequestLock = Promise.resolve();
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
        await this.disablePackagedFocusRuleset();
        await this.initializeStorage();
        await this.migrateNuclearWhitelistDefaults();
        await this.migrateOldSettings();
        await this.clearLegacyAutomaticProtection();
        await this.clearLegacyDynamicTabScopedRules();
        await this.restoreState();
        await this.initializeAdBlocking();
        await this.checkScheduledBlocking(); // Ensure scheduled blocking is enforced on startup
        await this.clearInactiveNuclearProtection();
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

    async disablePackagedFocusRuleset() {
        // Older installations may have enabled the packaged Focus ruleset in
        // Chrome-managed state. It redirects social sites independently of all
        // stored settings, so disable it during every worker startup. The
        // ruleset may be absent in newer manifests; that case is harmless.
        try {
            await chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: ['focus-rules']
            });
        } catch (error) {
            if (!/not found|does not exist|unknown ruleset/i.test(String(error?.message || error))) {
                console.warn('TimeShield: packaged Focus ruleset cleanup failed', error);
            }
        }
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

    normalizeFocusSites(sites) {
        return Array.isArray(sites)
            ? [...new Set(sites
                .filter(site => typeof site === 'string')
                .map(site => site.trim().toLowerCase().replace(/^www\./, ''))
                .filter(Boolean))]
            : [];
    }

    normalizeNuclearSite(site) {
        const value = String(site || '').trim();
        if (!value || value === '*') return '';
        try {
            if (/^file:\/\//i.test(value)) {
                const fileUrl = new URL(value);
                return fileUrl.protocol === 'file:' && fileUrl.pathname
                    ? fileUrl.href.toLowerCase()
                    : '';
            }

            const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
            const url = new URL(hasScheme ? value : `https://${value}`);
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';

            const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
            const hasSpecificPath = url.pathname !== '/' || url.search || url.hash;
            if (!hasSpecificPath) return hostname;

            const port = url.port ? `:${url.port}` : '';
            return `${url.protocol}//${hostname}${port}${url.pathname}${url.search}${url.hash}`.toLowerCase();
        } catch {
            return '';
        }
    }

    normalizeNuclearWhitelist(sites) {
        return Array.isArray(sites)
            ? [...new Set(sites.map(site => this.normalizeNuclearSite(site)).filter(Boolean))].slice(0, 8)
            : [];
    }

    normalizeNuclearExcludedTabIds(tabIds) {
        return Array.isArray(tabIds)
            ? [...new Set(tabIds.map(tabId => Number(tabId)).filter(tabId => Number.isInteger(tabId) && tabId >= 0))]
            : [];
    }

    async clearNuclearOpenTabSessionRule() {
        try {
            const existing = await chrome.declarativeNetRequest.getSessionRules();
            const ruleIds = existing
                .filter(rule => rule.id === NUCLEAR_OPEN_TAB_SESSION_RULE_ID)
                .map(rule => rule.id);
            if (ruleIds.length > 0) {
                await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds });
            }
        } catch (error) {
            console.warn('TimeShield: unable to clear Nuclear open-tab session rule', error);
        }
    }

    async applyNuclearOpenTabSessionRule(tabIds = []) {
        await this.clearNuclearOpenTabSessionRule();
        const normalizedTabIds = this.normalizeNuclearExcludedTabIds(tabIds);
        if (!normalizedTabIds.length) return;
        await chrome.declarativeNetRequest.updateSessionRules({
            addRules: [{
                id: NUCLEAR_OPEN_TAB_SESSION_RULE_ID,
                priority: 6,
                action: { type: 'allow' },
                condition: {
                    tabIds: normalizedTabIds,
                    resourceTypes: ['main_frame']
                }
            }]
        });
    }

    isNuclearAutomaticException(url) {
        const target = String(url || '').trim().toLowerCase();
        if (!target || target.startsWith('chrome://') || target.startsWith('chrome-extension://')) return false;
        if (target.startsWith('file://')) return true;

        try {
            const parsed = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
            const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
            const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
            if (localHosts.has(hostname)) return true;
            return /\.pdf(?:$|[?#])/i.test(parsed.pathname + parsed.search + parsed.hash);
        } catch {
            return false;
        }
    }

    matchesNuclearWhitelist(url, whitelist = []) {
        const target = String(url || '').trim().toLowerCase();
        if (!target || target.startsWith('chrome://') || target.startsWith('chrome-extension://')) return false;
        if (this.isNuclearAutomaticException(target)) return true;
        const normalizedTarget = this.normalizeNuclearSite(target);
        if (!normalizedTarget) return false;

        return this.normalizeNuclearWhitelist(whitelist).some((entry) => {
            if (entry.startsWith('file://')) {
                return normalizedTarget === entry;
            }
            if (entry.startsWith('http://') || entry.startsWith('https://')) {
                return normalizedTarget.replace(/\/$/, '') === entry.replace(/\/$/, '');
            }
            try {
                const targetUrl = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
                return targetUrl.hostname.replace(/^www\./, '').toLowerCase() === entry
                    || targetUrl.hostname.replace(/^www\./, '').toLowerCase().endsWith(`.${entry}`);
            } catch {
                return false;
            }
        });
    }

    getDefaultNuclearWhitelist() {
        return [...DEFAULT_NUCLEAR_WHITELIST];
    }

    getNuclearSessionEndTime(nuclearState) {
        const storedEndTime = Number(nuclearState?.endTime);
        if (Number.isFinite(storedEndTime) && storedEndTime > 0) return storedEndTime;
        const startTime = Number(nuclearState?.startTime);
        const duration = Number(nuclearState?.duration);
        return Number.isFinite(startTime) && startTime > 0
            && Number.isFinite(duration) && duration > 0
            ? startTime + (duration * 1000)
            : 0;
    }

    isNuclearSessionValid(nuclearState) {
        if (!nuclearState || nuclearState.isActive !== true) return false;
        const whitelist = this.normalizeNuclearWhitelist(nuclearState.whitelist);
        const excludedTabIds = this.normalizeNuclearExcludedTabIds(nuclearState.excludedTabIds);
        if (whitelist.length === 0 && excludedTabIds.length === 0) return false;
        const startTime = Number(nuclearState.startTime);
        const duration = Number(nuclearState.duration);
        const endTime = this.getNuclearSessionEndTime(nuclearState);
        return Number.isFinite(startTime) && startTime > 0
            && Number.isFinite(duration) && duration > 0
            && Number.isFinite(endTime) && endTime > Date.now();
    }

    normalizeNuclearSchedule(schedule = {}) {
        const rawTime = typeof schedule?.startTime === 'string' ? schedule.startTime : '09:00';
        const startTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : '09:00';
        const duration = Math.floor(Number(schedule?.duration));
        const days = Array.isArray(schedule?.days)
            ? [...new Set(schedule.days.map(day => Number(day)).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
            : [];
        const lastStartedToken = typeof schedule?.lastStartedToken === 'string' && schedule.lastStartedToken.length <= 40
            ? schedule.lastStartedToken
            : null;
        return {
            enabled: schedule?.enabled === true || schedule?.enabled === 'enabled',
            startTime,
            duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
            days,
            excludeOpenTabs: schedule?.excludeOpenTabs === true,
            lastStartedToken
        };
    }

    validateNuclearSchedule(schedule = {}) {
        const normalized = this.normalizeNuclearSchedule(schedule);
        if (!normalized.enabled) throw new Error('Turn on Schedule Nuclear Mode before saving it.');
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized.startTime)) {
            throw new Error('Choose a valid start time for the Nuclear Mode schedule.');
        }
        if (!normalized.days.length) throw new Error('Choose at least one day for the Nuclear Mode schedule.');
        if (!Number.isInteger(normalized.duration) || normalized.duration <= 0) {
            throw new Error('Choose a Nuclear Mode duration greater than zero for the schedule.');
        }
        return normalized;
    }

    getCleanNuclearModeState(overrides = {}) {
        return {
            isActive: false,
            startTime: null,
            duration: 0,
            endTime: null,
            whitelist: [],
            excludedTabIds: [],
            freeOneMinutePauseUsed: overrides.freeOneMinutePauseUsed === true,
            schedule: this.normalizeNuclearSchedule(overrides.schedule),
            ...overrides,
            whitelist: this.normalizeNuclearWhitelist(overrides.whitelist || []),
            excludedTabIds: this.normalizeNuclearExcludedTabIds(overrides.excludedTabIds || []),
            freeOneMinutePauseUsed: overrides.freeOneMinutePauseUsed === true,
            schedule: this.normalizeNuclearSchedule(overrides.schedule)
        };
    }

    getFocusSessionEndTime(focusState) {
        const storedEndTime = Number(focusState?.endTime);
        if (Number.isFinite(storedEndTime) && storedEndTime > 0) return storedEndTime;

        const startTime = Number(focusState?.startTime);
        const duration = Number(focusState?.duration);
        return Number.isFinite(startTime) && startTime > 0
            && Number.isFinite(duration) && duration > 0
            ? startTime + (duration * 1000)
            : 0;
    }

    isFocusSessionValid(focusState, sites = []) {
        const normalizedSites = this.normalizeFocusSites(sites);
        if (!focusState || focusState.isActive !== true || normalizedSites.length === 0) return false;

        const startTime = Number(focusState.startTime);
        const duration = Number(focusState.duration);
        const endTime = this.getFocusSessionEndTime(focusState);
        return Number.isFinite(startTime) && startTime > 0
            && Number.isFinite(duration) && duration > 0
            && Number.isFinite(endTime) && endTime > Date.now();
    }

    async clearInactiveFocusProtection(focusState = null) {
        await chrome.alarms.clear('focusMode');
        // Older versions used the default 1-100 rule range. Remove Focus
        // redirects by destination as well, so legacy rules cannot survive a
        // migration and block sites when Focus Mode is inactive.
        await this.removeDynamicRulesForBlockPage('floating/focus-block.html');
        await this.disableSiteBlockingRange(1, 200);
        await this.redirectTabsBack('floating/focus-block.html');

        if (focusState?.isActive === true) {
            const clearedState = {
                ...focusState,
                isActive: false,
                deepWorkMode: false,
                endTime: Date.now()
            };
            this.focusState = clearedState;
            await chrome.storage.local.set({ focusState: clearedState });
        } else {
            this.focusState = {
                ...this.focusState,
                isActive: false,
                deepWorkMode: false,
                endTime: Date.now()
            };
        }
        chrome.action.setBadgeText({ text: '' });
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

        // Restore Focus only when the stored session is complete, non-empty, and unexpired.
        // Dynamic rules survive service-worker restarts, so inactive state must explicitly
        // remove the old Focus range instead of leaving a previous session blocking sites.
        const focusResult = await chrome.storage.local.get(['focusState', 'focusBlockedSites']);
        const focusSites = this.normalizeFocusSites(focusResult.focusBlockedSites);
        if (this.isFocusSessionValid(focusResult.focusState, focusSites)) {
            this.focusState = {
                ...focusResult.focusState,
                endTime: this.getFocusSessionEndTime(focusResult.focusState)
            };
            await this.enableSiteBlocking(focusSites, 101, 'focus');

            chrome.action.setBadgeText({ text: '🎯' });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });

            const remaining = this.focusState.endTime - Date.now();
            if (remaining > 0) {
                chrome.alarms.create('focusMode', { delayInMinutes: remaining / 60000 });
            } else {
                await this.clearInactiveFocusProtection(this.focusState);
            }
        } else {
            await this.clearInactiveFocusProtection(focusResult.focusState);
        }

        // Restore Nuclear Mode independently from Focus, Schedule, Sleep, and Usage Limits.
        await this.restoreNuclearMode();
        await this.restoreNuclearSchedule();

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
            await this.disableSiteBlockingRange(101, 600);
        } else if (Number.isFinite(pauseUntil) && pauseUntil > Date.now()) {
            chrome.alarms.create('pauseExpires', { when: pauseUntil });
            await this.disableSiteBlockingRange(101, 600);
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

        const preActivationResult = await chrome.storage.local.get(['preActivationWarningCache']);
        this.preActivationWarningCache = preActivationResult.preActivationWarningCache || {};
        // Focus Mode no longer uses delayed preactivation. Remove legacy pending state
        // and alarms so an earlier one-minute request cannot start unexpectedly.
        await chrome.alarms.clear('focusModeActivation');
        await chrome.storage.local.remove(['pendingFocusActivation']);
    }

        async checkShortPauseReset() {
        const today = new Date().toDateString();
        const stored = await chrome.storage.local.get(['shortPauseUsage']);
        if (stored.shortPauseUsage && Number.isFinite(Number(stored.shortPauseUsage.count))) {
            this.shortPauseUsage = {
                count: Math.max(0, Number(stored.shortPauseUsage.count)),
                lastResetDate: stored.shortPauseUsage.lastResetDate || today
            };
        }
        if (this.shortPauseUsage.lastResetDate !== today) {
            this.shortPauseUsage = {
                count: 0,
                lastResetDate: today
            };
            await chrome.storage.local.set({ shortPauseUsage: this.shortPauseUsage });
        }
    }
    async tryFreeNuclearOneMinutePause() {
        const previousRequest = this.nuclearPauseRequestLock || Promise.resolve();
        let releaseRequest;
        this.nuclearPauseRequestLock = new Promise((resolve) => {
            releaseRequest = resolve;
        });
        await previousRequest;
        try {
            const result = await chrome.storage.local.get(['nuclearMode']);
            const nuclearState = result.nuclearMode;
            if (!this.isNuclearSessionValid(nuclearState)) return false;
            if (nuclearState.freeOneMinutePauseUsed === true) return null;

            const paused = await this.pauseBlocking(60 * 1000);
            if (!paused) return false;

            const latest = await chrome.storage.local.get(['nuclearMode']);
            const nextState = this.getCleanNuclearModeState({
                ...(latest.nuclearMode || nuclearState),
                freeOneMinutePauseUsed: true
            });
            await chrome.storage.local.set({ nuclearMode: nextState });
            return true;
        } finally {
            releaseRequest();
        }
    }

    async tryFreeOneMinutePause() {
        const previousRequest = this.shortPauseRequestLock;
        let releaseRequest;
        this.shortPauseRequestLock = new Promise((resolve) => {
            releaseRequest = resolve;
        });
        await previousRequest;
        try {
            await this.checkShortPauseReset();
            if (this.shortPauseUsage.count >= 2) return null;
            const paused = await this.pauseBlocking(60 * 1000);
            if (!paused) return false;
            await this.incrementShortPause();
            return true;
        } finally {
            releaseRequest();
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
                    // Pause verification only needs storage and the pause
                    // methods. Do not make the user wait for unrelated filter
                    // or tab initialization, which can suspend or take longer
                    // than the block-page request timeout.
                    const pauseRequest = message.action === 'pauseBlocking'
                        || message.action === 'pauseBlockingWithPassword';
                    if (!pauseRequest) await this.initPromise;
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

            case 'nuclearSchedule':
                await this.handleNuclearScheduleAlarm();
                break;

            case 'nuclearMode':
                await this.stopNuclearMode();
                await this.sendNotification('Nuclear Mode complete', 'Your protected session has ended.', false, `nuclear-complete-${Date.now()}`);
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
            case 'resetAllUserData': {
                await this.resetAllUserData();
                sendResponse({ success: true });
                break;
            }
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
                await this.startFocusMode(message.duration, fSites);
                sendResponse({ success: true });
                break;
            case 'startNuclearMode': {
                const state = await this.startNuclearMode(message.duration, message.whitelist, message.excludedTabIds);
                sendResponse({ success: true, nuclearMode: state });
                break;
            }
            case 'scheduleNuclearMode': {
                const schedule = await this.scheduleNuclearMode(message.schedule, message.whitelist);
                sendResponse({ success: true, schedule });
                break;
            }
            case 'clearNuclearModeSchedule': {
                const schedule = await this.clearNuclearModeSchedule();
                sendResponse({ success: true, schedule });
                break;
            }
            case 'stopNuclearMode':
                sendResponse({
                    success: false,
                    error: 'Nuclear Mode can only be ended through the verified block-page challenge.'
                });
                break;
            case 'getNuclearModeState': {
                const result = await chrome.storage.local.get(['nuclearMode']);
                const state = this.getCleanNuclearModeState(result.nuclearMode || {});
                sendResponse({ success: true, nuclearMode: state });
                break;
            }
            case 'addNuclearWhitelistSite': {
                const whitelist = await this.addNuclearWhitelistSite(message.site);
                sendResponse({ success: true, whitelist });
                break;
            }
            case 'removeNuclearWhitelistSite': {
                const whitelist = await this.removeNuclearWhitelistSite(message.site);
                sendResponse({ success: true, whitelist });
                break;
            }
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
            case 'addCurrentSiteToFocusList': {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const tab = tabs[0];
                let hostname = '';
                try {
                    const url = new URL(tab?.url || '');
                    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The current page cannot be added to Focus Mode.');
                    hostname = url.hostname.toLowerCase().replace(/^www\./, '');
                } catch (error) {
                    sendResponse({ success: false, error: error.message || 'The current page cannot be added to Focus Mode.' });
                    break;
                }

                const current = await chrome.storage.local.get(['focusBlockedSites', 'focusState']);
                const sites = Array.isArray(current.focusBlockedSites) ? [...current.focusBlockedSites] : [];
                if (!sites.includes(hostname)) sites.push(hostname);
                await chrome.storage.local.set({ focusBlockedSites: sites });

                if (this.isFocusSessionValid(current.focusState, sites)) {
                    await this.enableSiteBlocking(sites, 101, 'focus');
                    await this.redirectTabsOnBlock(sites, 'floating/focus-block.html');
                }
                sendResponse({ success: true, site: hostname, added: !current.focusBlockedSites?.includes(hostname) });
                break;
            }
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
                    if (this.isFocusSessionValid(focusResult.focusState, focusSitesList)) {
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
            case 'openFlipClockTab':
                await chrome.tabs.create({ url: chrome.runtime.getURL('floating/flip-clock.html') });
                sendResponse({ success: true });
                break;
            case 'broadcastClockGeometry': {
                const clockPos = message.clockPos;
                if (!clockPos || !Number.isFinite(Number(clockPos.x)) || !Number.isFinite(Number(clockPos.y))) {
                    sendResponse({ success: false });
                    break;
                }
                await chrome.storage.local.set({ clockPos });
                const tabs = await chrome.tabs.query({});
                await Promise.all(tabs
                    .filter(tab => tab.id != null && this.isEligibleOverlayTab(tab.url))
                    .map(tab => chrome.tabs.sendMessage(tab.id, {
                        action: 'applyClockGeometry',
                        clockPos
                    }).catch(() => null)));
                sendResponse({ success: true });
                break;
            }
            case 'toggleClock': {
                const openingClockView = message.visible === true;
                const fromFlipClock = openingClockView
                    && sender?.tab?.url
                    && sender.tab.url.includes('/floating/flip-clock.html');
                let returnTab = null;

                if (fromFlipClock) {
                    returnTab = await this.findClockViewReturnTab(sender.tab);
                    if (!returnTab) {
                        sendResponse({ success: false, error: 'No eligible browser tab is open for Clock View.' });
                        break;
                    }
                }

                await this.toggleFloatingClock(message.visible);
                // Ensure scripts are injected after toggle to make it work immediately everywhere
                if (openingClockView) await this.ensureContentScriptInjected();

                if (fromFlipClock) {
                    await chrome.windows.update(returnTab.windowId, { focused: true }).catch(() => undefined);
                    await chrome.tabs.update(returnTab.id, { active: true }).catch(() => undefined);
                    await chrome.tabs.remove(sender.tab.id).catch(() => undefined);
                }

                sendResponse({ success: true, focusedTabId: returnTab?.id || null });
                break;
            }
            case 'settingsUpdated': {
                await this.ensureContentScriptInjected();
                const tabs = await chrome.tabs.query({});
                await Promise.all(tabs
                    .filter(tab => tab.id != null && this.isEligibleOverlayTab(tab.url))
                    .map(tab => chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }).catch(() => null)));
                sendResponse({ success: true });
                break;
            }
            case 'setTimeFormat':
                const settings = await this.getSettings();
                settings.timeFormat = message.format;
                await chrome.storage.local.set({ settings });
                sendResponse({ success: true });
                break;
            case 'playSound':
                await this.playSound(message.sound, sender?.tab?.id);
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
            case 'requestNuclearExitChallenge': {
                const nuclearResult = await chrome.storage.local.get(['nuclearMode']);
                if (!this.isNuclearSessionValid(nuclearResult.nuclearMode)) {
                    sendResponse({ success: false, error: 'Nuclear Mode is not active.' });
                    break;
                }
                const challenge = this.generatePauseChallenge();
                await chrome.storage.local.set({
                    pauseChallenge: {
                        value: challenge,
                        durationMs: 0,
                        pauseContext: 'nuclearExit',
                        expiresAt: Date.now() + (10 * 60 * 1000)
                    }
                });
                sendResponse({
                    success: false,
                    requiresPassword: true,
                    challenge,
                    pauseContext: 'nuclearExit'
                });
                break;
            }
            case 'completeNuclearExitWithPassword': {
                const challengeResult = await chrome.storage.local.get(['pauseChallenge']);
                const challenge = challengeResult.pauseChallenge;
                const submitted = String(message.password || '').replace(/\r\n?/g, '\n').trim();
                const isValid = challenge
                    && challenge.pauseContext === 'nuclearExit'
                    && Date.now() < challenge.expiresAt
                    && this.isValidPauseChallenge(submitted)
                    && submitted === challenge.value;
                if (!isValid) {
                    sendResponse({ success: false, error: 'Incorrect motivational sentences or expired challenge' });
                    break;
                }
                const state = await this.stopNuclearMode();
                await chrome.storage.local.remove('pauseChallenge');
                sendResponse({ success: true, nuclearMode: state });
                break;
            }
            case 'pauseBlocking': {
                const pauseContext = message.pauseContext === 'usageLimit'
                    ? 'usageLimit'
                    : (message.pauseContext === 'nuclear' ? 'nuclear' : 'general');
                const durationMs = Number(message.durationMs);
                if (!this.isAllowedPauseDuration(durationMs, pauseContext)) {
                    const choices = pauseContext === 'usageLimit'
                        ? '1, 5, or 10 minutes'
                        : '1, 5, 10 minutes, 1 hour, or 3 hours';
                    sendResponse({ success: false, error: `Choose one of these pause durations: ${choices}.` });
                    break;
                }

                // Focus, scheduled, and sleep pauses keep their existing daily allowance.
                // Nuclear Mode has its own single free one-minute pause per session;
                // later Nuclear requests use the motivational verification flow.
                const isOneMinuteNuclearPause = pauseContext === 'nuclear' && durationMs === 60 * 1000;
                if (isOneMinuteNuclearPause) {
                    const freePauseResult = await this.tryFreeNuclearOneMinutePause();
                    if (freePauseResult === true) {
                        sendResponse({ success: true, freePause: true, pauseContext });
                        break;
                    }
                    if (freePauseResult === false) {
                        sendResponse({ success: false, error: 'Unable to pause Nuclear Mode' });
                        break;
                    }
                }

                const isOneMinuteGeneralPause = pauseContext === 'general' && durationMs === 60 * 1000;
                if (isOneMinuteGeneralPause) {
                    const freePauseResult = await this.tryFreeOneMinutePause();
                    if (freePauseResult === true) {
                        sendResponse({ success: true, freePause: true, pauseContext });
                        break;
                    }
                    if (freePauseResult === false) {
                        sendResponse({ success: false, error: 'Unable to pause protection' });
                        break;
                    }
                }

                const challenge = this.generatePauseChallenge();
                await chrome.storage.local.set({
                    pauseChallenge: {
                        value: challenge,
                        durationMs,
                        pauseContext,
                        expiresAt: Date.now() + (10 * 60 * 1000)
                    }
                });
                sendResponse({
                    success: false,
                    requiresPassword: true,
                    challenge,
                    pauseContext
                });
                break;
            }
            case 'pauseBlockingWithPassword': {
                const challengeResult = await chrome.storage.local.get(['pauseChallenge']);
                const challenge = challengeResult.pauseChallenge;
                const submitted = String(message.password || '').replace(/\r\n?/g, '\n').trim();
                const isValid = challenge
                    && Date.now() < challenge.expiresAt
                    && this.isValidPauseChallenge(submitted)
                    && submitted === challenge.value;
                if (!isValid) {
                    sendResponse({ success: false, error: 'Incorrect motivational sentences or expired challenge' });
                    break;
                }

                const durationMs = Number(challenge.durationMs);
                if (!this.isAllowedPauseDuration(durationMs, challenge.pauseContext)) {
                    sendResponse({ success: false, error: 'This pause duration is no longer available.' });
                    break;
                }

                // Usage-limit pauses require one deliberate final confirmation after the
                // motivational challenge. This adds modest friction without changing the
                // pause flow for Focus, scheduled, or sleep blocking.
                if (challenge.pauseContext === 'usageLimit' && !message.confirmUsagePause) {
                    const readyAt = Date.now() + (10 * 1000);
                    await chrome.storage.local.set({
                        pauseChallenge: { ...challenge, readyAt }
                    });
                    sendResponse({
                        success: false,
                        requiresFinalConfirmation: true,
                        readyAt,
                        pauseContext: challenge.pauseContext
                    });
                    break;
                }
                if (challenge.pauseContext === 'usageLimit') {
                    if (!challenge.readyAt || Date.now() < challenge.readyAt) {
                        sendResponse({ success: false, error: 'Please wait before confirming this usage-limit pause.' });
                        break;
                    }
                }

                const paused = await this.pauseBlocking(durationMs);
                if (paused) {
                    await chrome.storage.local.remove('pauseChallenge');
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Unable to pause protection' });
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

    getAllowedPauseDurationsMs(pauseContext = 'general') {
        const minutes = pauseContext === 'usageLimit' ? [1, 5, 10] : [1, 5, 60, 180];
        return minutes.map(value => value * 60 * 1000);
    }

    isAllowedPauseDuration(durationMs, pauseContext = 'general') {
        return this.getAllowedPauseDurationsMs(pauseContext).includes(Number(durationMs));
    }

    isValidPauseChallenge(value) {
        const lines = String(value || '').split('\n');
        return lines.length >= 2
            && lines.length <= 3
            && lines.every(line => /^[a-z]+(?: [a-z]+)*$/.test(line));
    }

    generatePauseChallenge() {
        const challenges = [
'i am focused and i will not get distracted\ni choose to protect my time and finish what matters',
            'i am building the discipline to finish what matters most\ni return my attention to the work in front of me',
            'i choose to stay on task and honor the commitment i made to myself\ni will not let distraction win today'
        ];
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return challenges[values[0] % challenges.length];
    }

    async pauseBlocking(durationMs) {
        // Focus Mode may be paused after the same visible challenge as every other protection.
        // ResumeBlocking() re-evaluates Focus Mode and restores its rules when the pause expires.
        const pauseDurationMs = Number(durationMs);
        if (!Number.isFinite(pauseDurationMs) || pauseDurationMs <= 0) return false;

        const expire = Date.now() + pauseDurationMs;
        await chrome.storage.local.set({ pauseBlockingUntil: expire });
        await chrome.alarms.clear('pauseExpires');
        chrome.alarms.create('pauseExpires', { when: expire });
        // Remove ALL active blocking rules immediately (focus: 101-200, scheduled: 201-300, sleep: 301-400, time limits: 401-500, Nuclear Mode: 501-600)
        await this.disableSiteBlockingRange(101, 600);
        chrome.action.setBadgeText({ text: '' });
        // Redirect tabs back from ALL block pages
        await this.redirectTabsBack('floating/focus-block.html');
        await this.redirectTabsBack('floating/schedule-block.html');
        await this.redirectTabsBack('floating/sleep-block.html');
        await this.redirectTabsBack('floating/limit-block.html');
        await this.redirectTabsBack('floating/nuclear-block.html');
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
        const sites = this.normalizeFocusSites(focusResult.focusBlockedSites);
        if (this.isFocusSessionValid(focusResult.focusState, sites)) {
            await this.enableSiteBlocking(sites, 101, 'focus');
            await this.redirectTabsOnBlock(sites, 'floating/focus-block.html');
            chrome.action.setBadgeText({ text: '🎯' });
            chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        } else {
            await this.clearInactiveFocusProtection(focusResult.focusState);
        }

        await this.restoreNuclearMode();
    }

    getNuclearScheduleStartOnDate(schedule, date) {
        const [hours, minutes] = String(schedule?.startTime || '').split(':').map(Number);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
        const candidate = new Date(date.getTime());
        candidate.setHours(hours, minutes, 0, 0);
        return candidate;
    }

    getLatestNuclearScheduleStart(schedule, now = new Date()) {
        const normalized = this.normalizeNuclearSchedule(schedule);
        if (!normalized.enabled || !normalized.days.length) return null;
        let latest = null;
        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
            const date = new Date(now.getTime());
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - dayOffset);
            if (!normalized.days.includes(date.getDay())) continue;
            const candidate = this.getNuclearScheduleStartOnDate(normalized, date);
            if (candidate && candidate.getTime() <= now.getTime() && (!latest || candidate > latest)) {
                latest = candidate;
            }
        }
        return latest;
    }

    getNextNuclearScheduleStart(schedule, now = new Date()) {
        const normalized = this.normalizeNuclearSchedule(schedule);
        if (!normalized.enabled || !normalized.days.length) return null;
        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
            const date = new Date(now.getTime());
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + dayOffset);
            if (!normalized.days.includes(date.getDay())) continue;
            const candidate = this.getNuclearScheduleStartOnDate(normalized, date);
            if (candidate && candidate.getTime() > now.getTime()) return candidate;
        }
        return null;
    }

    getNuclearScheduleToken(startTime) {
        return startTime instanceof Date && !Number.isNaN(startTime.getTime())
            ? startTime.toISOString().slice(0, 16)
            : '';
    }

    async ensureNuclearScheduleAlarm(schedule = null) {
        const result = await chrome.storage.local.get(['nuclearMode']);
        const storedState = result.nuclearMode || this.getCleanNuclearModeState();
        const normalized = this.normalizeNuclearSchedule(schedule || storedState.schedule);
        await chrome.alarms.clear('nuclearSchedule');
        if (!normalized.enabled || !normalized.days.length || normalized.duration <= 0) return false;

        const nextStart = this.getNextNuclearScheduleStart(normalized);
        if (nextStart) {
            chrome.alarms.create('nuclearSchedule', { when: nextStart.getTime() });
            return true;
        }
        return false;
    }

    async scheduleNuclearMode(schedule, whitelist = []) {
        const normalized = this.validateNuclearSchedule(schedule);
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const savedWhitelist = this.normalizeNuclearWhitelist(current.whitelist);
        const addedWhitelist = Array.isArray(whitelist)
            ? whitelist.map(site => this.normalizeNuclearSite(site)).filter(Boolean)
            : [];
        const combinedWhitelist = [...new Set([...savedWhitelist, ...addedWhitelist])];
        if (combinedWhitelist.length > 8) throw new Error('Nuclear Mode allows up to 8 sites.');
        const nextState = this.getCleanNuclearModeState({
            ...current,
            whitelist: combinedWhitelist,
            schedule: { ...normalized, lastStartedToken: null }
        });
        await chrome.storage.local.set({ nuclearMode: nextState });
        await this.ensureNuclearScheduleAlarm(nextState.schedule);
        return nextState.schedule;
    }

    async clearNuclearModeSchedule() {
        await chrome.alarms.clear('nuclearSchedule');
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const nextState = this.getCleanNuclearModeState({
            ...current,
            schedule: this.normalizeNuclearSchedule({
                ...current.schedule,
                enabled: false,
                lastStartedToken: null
            })
        });
        await chrome.storage.local.set({ nuclearMode: nextState });
        return nextState.schedule;
    }

    async handleNuclearScheduleAlarm() {
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const schedule = this.normalizeNuclearSchedule(current.schedule);
        if (!schedule.enabled || !schedule.days.length || schedule.duration <= 0) return false;

        const now = new Date();
        const scheduledStart = this.getLatestNuclearScheduleStart(schedule, now);
        if (!scheduledStart) {
            await this.ensureNuclearScheduleAlarm(schedule);
            return false;
        }
        const token = this.getNuclearScheduleToken(scheduledStart);
        const scheduledEnd = scheduledStart.getTime() + (schedule.duration * 1000);
        if (now.getTime() >= scheduledEnd || schedule.lastStartedToken === token) {
            await this.ensureNuclearScheduleAlarm(schedule);
            return false;
        }

        // Never replace a manually started or separately scheduled active session.
        if (this.isNuclearSessionValid(current)) {
            const activeStart = Number(current.startTime);
            if (Math.abs(activeStart - scheduledStart.getTime()) > 1000) {
                await this.ensureNuclearScheduleAlarm(schedule);
                return false;
            }
            await this.ensureNuclearScheduleAlarm(schedule);
            return true;
        }

        let excludedTabIds = [];
        if (schedule.excludeOpenTabs) {
            const tabs = await chrome.tabs.query({});
            excludedTabIds = this.normalizeNuclearExcludedTabIds(tabs.map(tab => tab.id));
        }
        const whitelist = this.normalizeNuclearWhitelist(current.whitelist);
        if (!whitelist.length && !excludedTabIds.length) {
            await this.sendNotification('Nuclear Mode could not start', 'Add an allowed site or disable the open-tabs exception in the Nuclear schedule.', true);
            await this.ensureNuclearScheduleAlarm(schedule);
            return false;
        }

        await this.startNuclearMode(schedule.duration, whitelist, excludedTabIds, {
            schedule: { ...schedule, lastStartedToken: token }
        });
        await this.ensureNuclearScheduleAlarm({ ...schedule, lastStartedToken: token });
        return true;
    }

    async restoreNuclearSchedule() {
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const schedule = this.normalizeNuclearSchedule(current.schedule);
        if (!schedule.enabled || !schedule.days.length || schedule.duration <= 0) {
            await chrome.alarms.clear('nuclearSchedule');
            return false;
        }

        const now = new Date();
        const scheduledStart = this.getLatestNuclearScheduleStart(schedule, now);
        const scheduledEnd = scheduledStart
            ? scheduledStart.getTime() + (schedule.duration * 1000)
            : 0;
        const occurrenceIsActive = scheduledStart && now.getTime() < scheduledEnd;
        const token = scheduledStart ? this.getNuclearScheduleToken(scheduledStart) : '';
        if (occurrenceIsActive && schedule.lastStartedToken !== token && !this.isNuclearSessionValid(current)) {
            await this.handleNuclearScheduleAlarm();
            return true;
        }
        await this.ensureNuclearScheduleAlarm(schedule);
        return true;
    }

    async startNuclearMode(durationSeconds, whitelist = [], excludedTabIds = [], options = {}) {
        const duration = Math.floor(Number(durationSeconds));
        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error('Nuclear Mode duration must be greater than zero');
        }

        const stored = await chrome.storage.local.get(['nuclearMode']);
        const savedWhitelist = this.normalizeNuclearWhitelist(stored.nuclearMode?.whitelist);
        const candidateSites = Array.isArray(whitelist)
            ? whitelist.map(site => this.normalizeNuclearSite(site)).filter(Boolean)
            : [];
        const cleanWhitelist = [...new Set([...savedWhitelist, ...candidateSites])].slice(0, 8);
        const cleanExcludedTabIds = this.normalizeNuclearExcludedTabIds(excludedTabIds);
        if (cleanWhitelist.length === 0 && cleanExcludedTabIds.length === 0) {
            throw new Error('Add at least one allowed site or choose Exclude all open tabs before starting Nuclear Mode.');
        }
        if (cleanWhitelist.length > 8) {
            throw new Error('Nuclear Mode allows up to 8 sites.');
        }

        const now = Date.now();
        const nuclearState = this.getCleanNuclearModeState({
            isActive: true,
            startTime: now,
            duration,
            endTime: now + (duration * 1000),
            whitelist: cleanWhitelist,
            excludedTabIds: cleanExcludedTabIds,
            freeOneMinutePauseUsed: false,
            schedule: options.schedule
                ? this.normalizeNuclearSchedule(options.schedule)
                : this.normalizeNuclearSchedule(stored.nuclearMode?.schedule)
        });
        await chrome.alarms.clear('nuclearMode');
        await chrome.storage.local.set({ nuclearMode: nuclearState, sessionOverlayDismissed: false });
        chrome.alarms.create('nuclearMode', { when: nuclearState.endTime });

        if (!await this.isPaused()) {
            await this.enableSiteBlocking(['*'], 501, 'nuclear', cleanWhitelist, cleanExcludedTabIds);
            await this.redirectAllTabs('floating/nuclear-block.html', cleanWhitelist, cleanExcludedTabIds);
            chrome.action.setBadgeText({ text: '☢' });
            chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
        }
        return nuclearState;
    }

    async stopNuclearMode() {
        await chrome.alarms.clear('nuclearMode');
        await this.disableSiteBlockingRange(501, 600);
        await this.redirectTabsBack('floating/nuclear-block.html');
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const nuclearState = this.getCleanNuclearModeState({
            ...current,
            isActive: false,
            startTime: null,
            duration: 0,
            endTime: null,
            excludedTabIds: [],
            freeOneMinutePauseUsed: false,
            whitelist: this.normalizeNuclearWhitelist(current.whitelist),
            schedule: this.normalizeNuclearSchedule(current.schedule)
        });
        await chrome.storage.local.set({ nuclearMode: nuclearState });
        return nuclearState;
    }

    async restoreNuclearMode() {
        const result = await chrome.storage.local.get(['nuclearMode']);
        const storedState = result.nuclearMode;
        if (!this.isNuclearSessionValid(storedState)) {
            if (storedState?.isActive === true) {
                await this.stopNuclearMode();
            } else {
                await this.disableSiteBlockingRange(501, 600);
                await this.redirectTabsBack('floating/nuclear-block.html');
            }
            return false;
        }

        const nuclearState = this.getCleanNuclearModeState({
            ...storedState,
            endTime: this.getNuclearSessionEndTime(storedState)
        });
        await chrome.storage.local.set({ nuclearMode: nuclearState });
        const remaining = nuclearState.endTime - Date.now();
        chrome.alarms.create('nuclearMode', { when: nuclearState.endTime });
        if (await this.isPaused()) {
            await this.disableSiteBlockingRange(501, 600);
            await this.redirectTabsBack('floating/nuclear-block.html');
            return true;
        }

        await this.enableSiteBlocking(['*'], 501, 'nuclear', nuclearState.whitelist, nuclearState.excludedTabIds);
        await this.redirectAllTabs('floating/nuclear-block.html', nuclearState.whitelist, nuclearState.excludedTabIds);
        chrome.action.setBadgeText({ text: '☢' });
        chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
        return remaining > 0;
    }

    async addNuclearWhitelistSite(site) {
        const normalized = this.normalizeNuclearSite(site);
        if (!normalized) throw new Error('Enter a valid website domain.');
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const whitelist = this.normalizeNuclearWhitelist(current.whitelist);
        if (whitelist.includes(normalized)) return whitelist;
        if (whitelist.length >= 8) throw new Error('Nuclear Mode allows up to 8 sites.');
        whitelist.push(normalized);
        const next = this.getCleanNuclearModeState({ ...current, whitelist });
        await chrome.storage.local.set({ nuclearMode: next });
        if (this.isNuclearSessionValid(next) && !await this.isPaused()) {
            await this.enableSiteBlocking(['*'], 501, 'nuclear', whitelist, next.excludedTabIds);
            await this.redirectAllTabs('floating/nuclear-block.html', whitelist, next.excludedTabIds);
        }
        return whitelist;
    }

    async removeNuclearWhitelistSite(site) {
        const normalized = this.normalizeNuclearSite(site);
        const result = await chrome.storage.local.get(['nuclearMode']);
        const current = result.nuclearMode || this.getCleanNuclearModeState();
        const whitelist = this.normalizeNuclearWhitelist(current.whitelist).filter(item => item !== normalized);
        const next = this.getCleanNuclearModeState({ ...current, whitelist });
        await chrome.storage.local.set({ nuclearMode: next });
        if (this.isNuclearSessionValid(next) && !await this.isPaused()) {
            await this.enableSiteBlocking(['*'], 501, 'nuclear', whitelist, next.excludedTabIds);
            await this.redirectAllTabs('floating/nuclear-block.html', whitelist, next.excludedTabIds);
        }
        return whitelist;
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
        const sites = this.normalizeFocusSites(result.focusBlockedSites);
        if (!this.isFocusSessionValid(result.focusState, sites)) {
            await this.clearInactiveFocusProtection(result.focusState);
            return { active: false, sites: [] };
        }

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
            if (settings.soundEnabled !== false) {
                await this.playSound('limit-warning');
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
            const sites = Array.isArray(result.scheduledBlockedSites)
                ? result.scheduledBlockedSites.filter(site => typeof site === 'string' && site.trim())
                : [];
            if (sites.length === 0) {
                await this.disableScheduledBlocking();
                return;
            }
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

        async redirectAllTabs(blockPage, whitelist = [], excludedTabIds = []) {
        const extensionUrl = chrome.runtime.getURL(blockPage);
        const isNuclear = blockPage.includes('nuclear-block.html');
        const normalizedWhitelist = isNuclear
            ? this.normalizeNuclearWhitelist(whitelist)
            : whitelist.map(site => String(site || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()).filter(Boolean);
        const normalizedExcludedTabIds = isNuclear
            ? this.normalizeNuclearExcludedTabIds(excludedTabIds)
            : [];
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (!tab.url) continue;
            if (tab.url.includes(blockPage)) continue;
            if (tab.url.startsWith('chrome-extension://')) continue;
            if (isNuclear && normalizedExcludedTabIds.includes(Number(tab.id))) continue;
            if (tab.url.startsWith('chrome://')) continue;

            if (!isNuclear) {
                if (tab.url.startsWith('file://')) continue;
                if (/\.pdf($|[?#])/i.test(tab.url)) continue;
                let tabDomain;
                try {
                    tabDomain = new URL(tab.url).hostname.replace(/^www\./, '');
                } catch { continue; }
                if (tabDomain === 'localhost' || tabDomain === '127.0.0.1') continue;
            }

            const isWhitelisted = isNuclear
                ? normalizedExcludedTabIds.includes(Number(tab.id)) || this.matchesNuclearWhitelist(tab.url, normalizedWhitelist)
                : (() => {
                    try {
                        const tabDomain = new URL(tab.url).hostname.replace(/^www\./, '');
                        return normalizedWhitelist.some(domain => tabDomain === domain || tabDomain.endsWith(`.${domain}`));
                    } catch {
                        return false;
                    }
                })();
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
        if (this.isFocusSessionValid(focusResult.focusState, focusSites) && focusSites.includes(hostname)) {
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
        
            // Nuclear Mode is the strictest all-sites protection. Its automatic
            // localhost, local-file, and PDF exceptions are enforced by the
            // navigation rules and tab redirect helper, which receive full URLs.
            const nuclearResult = await chrome.storage.local.get(['nuclearMode']);
            if (this.isNuclearSessionValid(nuclearResult.nuclearMode)) {
                const nuclearWhitelist = this.normalizeNuclearWhitelist(nuclearResult.nuclearMode.whitelist);
                const isWhitelisted = nuclearWhitelist.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`));
                if (!isWhitelisted && hostname !== 'localhost' && hostname !== '127.0.0.1') return true;
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
        // A cleared alarm can still race with stopTimer. Complete a running
        // timer only once so the notification and sound cannot repeat.
        if (!this.timerState.isRunning) return;

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

        // Play before opening the completion window, which otherwise takes
        // focus away from the browser tab that should receive the sound.
        await this.playSound('timer-complete');

        // Create completion window that auto-closes
        chrome.windows.create({
            url: chrome.runtime.getURL(`floating/timer-complete.html?type=${type}&mins=${minsRemaining}`),
            type: 'popup',
            width: 320,
            height: 260,
            focused: true
        }).catch(() => { });

        chrome.action.setBadgeText({ text: '' });
    }

    async canRunProtectedDisable() {
        const data = await chrome.storage.local.get(['disableAuthorizedUntil']);
        return Number(data.disableAuthorizedUntil || 0) > Date.now();
    }

    async startFocusMode(duration, focusBlockedSites = []) {
        const durationSeconds = Math.floor(Number(duration));
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            throw new Error('Focus duration must be greater than zero');
        }
        const cleanSites = Array.isArray(focusBlockedSites)
            ? [...new Set(focusBlockedSites.map(site => String(site || '').trim().toLowerCase().replace(/^www\./, '')).filter(Boolean))]
            : [];
        if (cleanSites.length === 0) {
            throw new Error('Add at least one site in Settings before starting Focus Mode.');
        }

        // Focus Mode starts immediately after the popup save-work warning.
        // Clear any legacy pending activation so an old one-minute delay cannot fire later.
        await this.cancelPendingFocusActivation();
        await this.activateFocusMode(durationSeconds, cleanSites);
    }

    async activatePendingFocusMode() {
        const result = await chrome.storage.local.get(['pendingFocusActivation']);
        const pending = result.pendingFocusActivation;
        if (!pending) return;

        await chrome.storage.local.remove(['pendingFocusActivation']);
        const sites = Array.isArray(pending.focusBlockedSites)
            ? pending.focusBlockedSites.filter(site => typeof site === 'string' && site.trim())
            : [];
        if (sites.length === 0) {
            await this.disableSiteBlockingRange(101, 200);
            return;
        }
        await this.activateFocusMode(pending.duration, sites);
    }

    async cancelPendingFocusActivation() {
        await chrome.alarms.clear('focusModeActivation');
        await chrome.storage.local.remove(['pendingFocusActivation']);
    }

    async activateFocusMode(duration, focusBlockedSites = []) {
        const effectiveFocusSites = Array.isArray(focusBlockedSites)
            ? focusBlockedSites.filter(site => typeof site === 'string' && site.trim())
            : [];
        if (effectiveFocusSites.length === 0) {
            await this.disableSiteBlockingRange(101, 200);
            return;
        }
        await this.ensureContentScriptInjected();
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
                if (tab.url && tab.url.includes('flip-clock.html')) {
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

    isEligibleOverlayTab(url = '') {
        return /^(https?:|file:|ftp:)/i.test(String(url));
    }

    async findClockViewReturnTab(sourceTab = {}) {
        const tabs = await chrome.tabs.query({});
        const candidates = tabs.filter((tab) => (
            tab.id != null
            && tab.id !== sourceTab.id
            && this.isEligibleOverlayTab(tab.url)
        ));
        if (candidates.length === 0) return null;

        const sameWindow = candidates.filter((tab) => tab.windowId === sourceTab.windowId);
        const pool = sameWindow.length > 0 ? sameWindow : candidates;
        const previousTab = pool
            .filter((tab) => Number.isFinite(sourceTab.index) && tab.index < sourceTab.index)
            .sort((a, b) => b.index - a.index)[0];
        return previousTab || pool.find((tab) => tab.active) || pool[0];
    }

    async ensureContentScriptInjected() {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs.filter(candidate => candidate.id != null && this.isEligibleOverlayTab(candidate.url))) {
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

    async enableSiteBlocking(blockedSites, startId = 1, type = 'focus', whitelist = [], excludedTabIds = []) {
        if (type === 'nuclear') {
            const nuclearResult = await chrome.storage.local.get(['nuclearMode']);
            if (!this.isNuclearSessionValid(nuclearResult.nuclearMode)) {
                await this.disableSiteBlockingRange(501, 600);
                return;
            }
        }

        const blockPage = type === 'schedule' ? 'floating/schedule-block.html' :
            type === 'sleep' ? 'floating/sleep-block.html' :
                type === 'nuclear' ? 'floating/nuclear-block.html' : 'floating/focus-block.html';
        const extensionUrl = chrome.runtime.getURL(blockPage);

        // Clear previous rules in this specific range first (IMPORTANT: prevents conflicts by using exactly 100 slots)
        await this.disableSiteBlockingRange(startId, startId + 99);

        // Sleep and Nuclear Mode block all sites except their explicit allowlist.
        if ((type === 'sleep' || type === 'nuclear') && blockedSites.includes('*')) {
            const isNuclear = type === 'nuclear';
            const normalizedWhitelist = isNuclear
                ? this.normalizeNuclearWhitelist(whitelist)
                : whitelist.map(site => String(site || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()).filter(Boolean);
            const normalizedExcludedTabIds = isNuclear
                ? this.normalizeNuclearExcludedTabIds(excludedTabIds)
                : [];

            console.log(`🔍 ${type} blocking rules:`, { originalWhitelist: whitelist, normalizedWhitelist, excludedTabIds: normalizedExcludedTabIds });

            // Create individual rules for each whitelist domain
            const rules = [];

            // Main blocking rule for all sites (excluding PDFs)
            rules.push({
                id: startId,
                    priority: 3, // Highest priority for all-sites protection
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

            // Sleep Mode keeps its historical PDF exception. Nuclear Mode also
            // keeps local development pages, all local files, and PDFs available.
            if (!isNuclear) {
                rules.push({
                    id: startId + 1,
                    priority: 5,
                    action: { type: 'allow' },
                    condition: {
                        regexFilter: '^(https?|file)://.*\\.pdf($|[?#])',
                        resourceTypes: ['main_frame']
                    }
                });
            } else {
                const exceptionStartId = startId + 1 + normalizedWhitelist.length;
                rules.push({
                    id: exceptionStartId,
                    priority: 5,
                    action: { type: 'allow' },
                    condition: {
                        regexFilter: '^file://',
                        resourceTypes: ['main_frame']
                    }
                });
                rules.push({
                    id: exceptionStartId + 1,
                    priority: 5,
                    action: { type: 'allow' },
                    condition: {
                        regexFilter: '^https?://.*\\.pdf(?:$|[?#])',
                        resourceTypes: ['main_frame']
                    }
                });
                rules.push({
                    id: exceptionStartId + 2,
                    priority: 5,
                    action: { type: 'allow' },
                    condition: {
                        urlFilter: '||localhost^',
                        resourceTypes: ['main_frame']
                    }
                });
                rules.push({
                    id: exceptionStartId + 3,
                    priority: 5,
                    action: { type: 'allow' },
                    condition: {
                        urlFilter: '||127.0.0.1^',
                        resourceTypes: ['main_frame']
                    }
                });
                rules.push({
                    id: exceptionStartId + 4,
                    priority: 5,
                    action: { type: 'allow' },
                    condition: {
                        regexFilter: '^https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\])(?::\\d+)?(?:/|$)',
                        resourceTypes: ['main_frame']
                    }
                });
            }

            // Create precise allow rules for Nuclear domains, links, and files.
            normalizedWhitelist.forEach((entry, index) => {
                const rule = {
                    id: startId + 1 + index,
                    priority: 4,
                    action: { type: 'allow' },
                    condition: { resourceTypes: ['main_frame'] }
                };
                if (isNuclear && (entry.startsWith('file://') || entry.startsWith('http://') || entry.startsWith('https://'))) {
                    const escapedEntry = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    rule.condition.regexFilter = `^${escapedEntry}/?(?:[?#].*)?$`;
                } else {
                    rule.condition.urlFilter = `||${entry}^`;
                    rule.condition.isUrlFilterCaseSensitive = false;
                }
                rules.push(rule);
            });

            if (!isNuclear) {
                // Sleep Mode keeps localhost and local-development access available.
                const localhostRuleId = startId + normalizedWhitelist.length + 2;
                rules.push({
                    id: localhostRuleId,
                    priority: 4,
                    action: { type: 'allow' },
                    condition: {
                        urlFilter: '||localhost^',
                        resourceTypes: ['main_frame']
                    }
                });

                const ipRuleId = startId + normalizedWhitelist.length + 3;
                rules.push({
                    id: ipRuleId,
                    priority: 4,
                    action: { type: 'allow' },
                    condition: {
                        urlFilter: '||127.0.0.1^',
                        resourceTypes: ['main_frame']
                    }
                });

                const localDevRuleId = startId + normalizedWhitelist.length + 4;
                rules.push({
                    id: localDevRuleId,
                    priority: 4,
                    action: { type: 'allow' },
                    condition: {
                        regexFilter: '^https?://(localhost|127\\.0\\.0\\.1):\\d+',
                        resourceTypes: ['main_frame']
                    }
                });
            }

            await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
            if (isNuclear) {
                await this.applyNuclearOpenTabSessionRule(normalizedExcludedTabIds);
            }
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
        if (startId <= 501 && endId >= 600) {
            await this.clearNuclearOpenTabSessionRule();
        }
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIds = rules.map(r => r.id).filter(id => id >= startId && id <= endId);
        if (ruleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
        }
    }

    async removeDynamicRulesForBlockPage(blockPage) {
        const extensionUrl = chrome.runtime.getURL(blockPage);
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIds = rules
            .filter(rule => rule.action?.type === 'redirect'
                && typeof rule.action.redirect?.url === 'string'
                && rule.action.redirect.url.startsWith(extensionUrl))
            .map(rule => rule.id);
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
            'pauseBlockingUntil', 'focusState', 'timerState', 'nuclearMode', 'todayStats',
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
        const nuclearActive = this.isNuclearSessionValid(result.nuclearMode);
        return {
            active: Boolean(result.focusState?.isActive || result.timerState?.isActive || nuclearActive || scheduleActive || sleepActive),
            paused: pauseUntil === -1 || (Number.isFinite(pauseUntil) && pauseUntil > Date.now()),
            pauseUntil: pauseUntil > 0 ? pauseUntil : null,
            scheduleActive,
            sleepActive,
            nuclearActive,
            nuclearMode: this.getCleanNuclearModeState(result.nuclearMode || {}),
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
            'settings', 'pauseBlockingUntil', 'focusState', 'timerState', 'nuclearMode',
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
            nuclearModeActive: this.isNuclearSessionValid(storage.nuclearMode),
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
            soundEnabled: true,
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

    async playSound(soundName, preferredTabId = null) {
        const settings = await this.getSettings();
        if (settings.soundEnabled === false) return false;

        const normalizedSound = String(soundName || '').trim();
        if (!/^[a-z0-9-]+$/i.test(normalizedSound)) return false;

        const tabs = await chrome.tabs.query({});
        const preferredTab = Number.isInteger(preferredTabId)
            ? tabs.find(tab => tab.id === preferredTabId && this.isEligibleOverlayTab(tab.url))
            : null;
        const activeTab = tabs.find(tab => tab.active && this.isEligibleOverlayTab(tab.url));
        const target = preferredTab || activeTab;
        if (!target?.id) return false;

        const message = { action: 'playSound', sound: normalizedSound };
        try {
            const response = await chrome.tabs.sendMessage(target.id, message);
            return response?.success === true;
        } catch {
            // The manifest content script normally handles this. Retry once
            // after injection for tabs that were opened before the worker woke.
            await chrome.scripting.executeScript({
                target: { tabId: target.id },
                files: ['content/blocker.js', 'content/anti-antiblock.js']
            }).catch(() => undefined);
            try {
                const response = await chrome.tabs.sendMessage(target.id, message);
                return response?.success === true;
            } catch {
                return false;
            }
        }
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

    async clearInactiveNuclearProtection() {
        const result = await chrome.storage.local.get(['nuclearMode']);
        if (this.isNuclearSessionValid(result.nuclearMode)) return false;

        await chrome.alarms.clear('nuclearMode').catch(() => false);
        await this.disableSiteBlockingRange(501, 600).catch(() => undefined);
        await this.clearNuclearOpenTabSessionRule();
        return true;
    }

    async clearLegacyDynamicTabScopedRules() {
        try {
            const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
            const legacyRuleIds = dynamicRules
                .filter(rule => rule?.condition && (
                    Array.isArray(rule.condition.tabIds)
                    || Array.isArray(rule.condition.excludedTabIds)
                ))
                .map(rule => rule.id)
                .filter(id => Number.isInteger(id));
            if (legacyRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: legacyRuleIds });
                console.info('TimeShield: removed legacy dynamic tab-scoped DNR rules', legacyRuleIds);
            }
        } catch (error) {
            console.warn('TimeShield: unable to remove legacy dynamic tab-scoped DNR rules', error);
        }
    }

    async clearLegacyAutomaticProtection() {
        const automaticDomains = new Set([
            'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
            'reddit.com', 'netflix.com', 'tiktok.com', 'linkedin.com', 'pinterest.com',
            'snapchat.com', 'threads.net', 'discord.com'
        ]);
        const data = await chrome.storage.local.get([
            'focusBlockedSites', 'scheduledBlockedSites', 'blockedSites',
            'focusState', 'scheduledBlocking', 'globalLimit', 'manualOnlyDefaultsClearedVersion'
        ]);
        // Versioned so installations that already passed the first cleanup also
        // receive the stronger removal of former starter domains and stale state.
        if (Number(data.manualOnlyDefaultsClearedVersion) >= 2) return;

        const removeAutomaticDomains = (sites) => (Array.isArray(sites) ? sites : [])
            .filter(site => !automaticDomains.has(String(site).toLowerCase().replace(/^www\./, '')));
        const focusSites = removeAutomaticDomains(data.focusBlockedSites);
        const scheduledSites = removeAutomaticDomains(data.scheduledBlockedSites);
        const legacySites = removeAutomaticDomains(data.blockedSites);
        const globalLimit = { enabled: false, minutes: 60, domains: [], ...(data.globalLimit || {}) };
        const cleanedGlobalDomains = removeAutomaticDomains(globalLimit.domains);
        const updates = {
            focusBlockedSites: focusSites,
            scheduledBlockedSites: scheduledSites,
            blockedSites: legacySites,
            globalLimit: {
                ...globalLimit,
                domains: cleanedGlobalDomains,
                enabled: cleanedGlobalDomains.length > 0 && globalLimit.enabled === true
            },
            manualOnlyDefaultsClearedVersion: 2
        };

        if (data.focusState?.isActive && focusSites.length === 0) {
            updates.focusState = { ...data.focusState, isActive: false, deepWorkMode: false, endTime: Date.now() };
            await chrome.alarms.clear('focusMode');
            await this.disableSiteBlockingRange(101, 200);
        }
        if (data.scheduledBlocking?.enabled && scheduledSites.length === 0) {
            updates.scheduledBlocking = { ...data.scheduledBlocking, enabled: false };
            await this.disableSiteBlockingRange(201, 300);
        }
        await chrome.storage.local.set(updates);
    }

    getCleanUserDataDefaults() {
        const today = new Date().toDateString();
        return {
            settings: {
                theme: 'solar',
                timeFormat: '12h',
                soundEnabled: true,
                notificationsEnabled: true,
                breakReminders: true,
                clockPosition: { x: 20, y: 20 },
                clockSize: 'medium',
                focusTimerWidgetEnabled: true,
                timerWidgetEnabled: true,
                autoStartClock: false,
                showBlockingCountdown: true,
                usageRetentionDays: 90,
                safeModeEnabled: false
            },
            focusBlockedSites: [],
            scheduledBlockedSites: [],
            scheduledBlocking: {
                enabled: false,
                startTime: '09:00',
                endTime: '17:00',
                days: [1, 2, 3, 4, 5]
            },
            sleepBlocking: {
                enabled: false,
                startTime: '22:00',
                endTime: '06:00',
                days: [1, 2, 3, 4, 5],
                blockAll: true,
                whitelist: []
            },
            timeLimits: [],
            timeLimitsEnabled: false,
            globalLimit: { enabled: false, minutes: 60, domains: [] },
            focusState: { isActive: false, startTime: null, duration: 0, focusBlockedSites: [] },
            nuclearMode: {
                isActive: false,
                startTime: null,
                duration: 0,
                endTime: null,
                whitelist: [...DEFAULT_NUCLEAR_WHITELIST],
                excludedTabIds: [],
                freeOneMinutePauseUsed: false,
                schedule: {
                    enabled: false,
                    startTime: '09:00',
                    duration: 0,
                    days: [],
                    excludeOpenTabs: false,
                    lastStartedToken: null
                }
            },
            timerState: { isRunning: false, startTime: null, duration: 0, type: null },
            pauseBlockingUntil: null,
            pauseChallenge: null,
            siteUsageData: {},
            siteUsageTimeline: {},
            siteOpenCounts: {},
            timeLimitWarningCache: {},
            todos: [],
            gracePauses: { count: 0, lastResetDate: today },
            shortPauseUsage: { count: 0, lastResetDate: today },
            clockVisible: false,
            clockPos: { x: 0, y: 20, w: 280, h: 160 },
            clockMinimized: false,
            sessionOverlayDismissed: false,
            adBlockEnabled: false,
            adBlockStats: { adsBlocked: 0, bandwidthSaved: 0, timeSaved: 0, lastUpdated: Date.now() },
            blockedSites: [],
            whitelist: [],
            filterLists: {},
            customFilters: [],
            todayStats: { focusTime: 0, tasksCompleted: 0, sessionsCompleted: 0, date: today }
        };
    }

    async resetAllUserData() {
        const protectionAlarms = [
            'timer', 'focusMode', 'focusModeActivation', 'nuclearMode', 'nuclearSchedule', 'pauseExpires', 'breakReminder'
        ];
        await Promise.all(protectionAlarms.map((name) => chrome.alarms.clear(name).catch(() => false)));
        await this.disableSiteBlockingRange(101, 600).catch(() => undefined);
        await this.adBlocker.clearRules().catch(() => undefined);
        try {
            await chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: ['base-adblock', 'focus-rules']
            });
        } catch (error) {
            if (!/not found|does not exist|unknown ruleset/i.test(String(error?.message || error))) {
                console.warn('TimeShield: ruleset cleanup during reset failed', error);
            }
        }
        await chrome.storage.local.clear();
        await chrome.storage.local.set(this.getCleanUserDataDefaults());

        this.timerState = { isRunning: false, startTime: null, duration: 0, type: null };
        this.focusState = { isActive: false, startTime: null, duration: 0, focusBlockedSites: [] };
        this.shortPauseUsage = { count: 0, lastResetDate: new Date().toDateString() };
        this.gracePauses = { count: 0, lastResetDate: new Date().toDateString() };
        this.adBlockEnabled = false;
        this.adsBlocked = 0;
        this.bandwidthSaved = 0;
        this.timeSaved = 0;
        await chrome.action.setBadgeText({ text: '' });
        await this.redirectTabsBack('floating/focus-block.html').catch(() => undefined);
        await this.redirectTabsBack('floating/schedule-block.html').catch(() => undefined);
        await this.redirectTabsBack('floating/sleep-block.html').catch(() => undefined);
        await this.redirectTabsBack('floating/limit-block.html').catch(() => undefined);
        await this.redirectTabsBack('floating/nuclear-block.html').catch(() => undefined);
        await this.ensureContentScriptInjected();
        await this.toggleFloatingClock(false);
        return true;
    }

    async migrateNuclearWhitelistDefaults() {
        const result = await chrome.storage.local.get(['nuclearMode', 'nuclearModeWhitelistDefaultsApplied']);
        if (result.nuclearModeWhitelistDefaultsApplied === true) return;

        const current = result.nuclearMode && typeof result.nuclearMode === 'object'
            ? result.nuclearMode
            : this.getCleanNuclearModeState();
        const hasWhitelist = Array.isArray(current.whitelist) && current.whitelist.length > 0;
        const next = hasWhitelist
            ? current
            : { ...current, whitelist: this.getDefaultNuclearWhitelist() };

        await chrome.storage.local.set({
            nuclearMode: this.getCleanNuclearModeState(next),
            nuclearModeWhitelistDefaultsApplied: true
        });
    }

    async initializeStorage() {
        const defaults = this.getCleanUserDataDefaults();

        for (const [key, value] of Object.entries(defaults)) {
            const result = await chrome.storage.local.get(key);
            if (!result[key]) {
                await chrome.storage.local.set({ [key]: value });
            }
        }
    }





}

new BackgroundService();
