// usage-tracker.js
// Tracks time spent on different websites for the "Screen Time" feature.

class UsageTracker {
    constructor() {
        this.activeDomain = null;
        this.activeTabId = null;
        this.lastCheckpointAt = 0;
        this.intervalId = null;
        this.injectionPromises = new Map();
        this.usageAlarmName = 'timeShieldUsageTick';
        // All domains share one queue because each write reads and rewrites the
        // complete usage object; per-domain queues can still lose data when tabs
        // change quickly and two domains update concurrently.
        this.writeQueue = Promise.resolve();
        this.init();
    }

    async init() {
        // MV3 service workers may be suspended, so a setInterval alone cannot
        // reliably record screen time. A Chrome alarm wakes the worker again.
        chrome.alarms.onAlarm.addListener(alarm => {
            if (alarm.name === this.usageAlarmName) {
                this.handleUsageAlarm();
            }
        });
        chrome.alarms.create(this.usageAlarmName, { periodInMinutes: 0.5 });

        // Listeners for tab changes
        chrome.tabs.onActivated.addListener(activeInfo => {
            this.handleTabChange(activeInfo.tabId);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (tab.active && changeInfo.url) {
                this.handleTabChange(tabId);
            }
        });

        chrome.tabs.onRemoved.addListener(tabId => {
            if (this.activeTabId === tabId) {
                this.stopTracking();
            }
        });

        chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
            if (this.activeTabId === removedTabId) {
                this.handleTabChange(addedTabId);
            }
        });

        chrome.windows.onFocusChanged.addListener(windowId => {
            if (windowId === chrome.windows.WINDOW_ID_NONE) {
                this.stopTracking(); // Chrome lost focus
            } else {
                chrome.tabs.query({ active: true, windowId: windowId }, tabs => {
                    if (tabs && tabs[0]) {
                        this.handleTabChange(tabs[0].id);
                    }
                });
            }
        });

        // Restore the active tab after a worker restart. lastFocusedWindow is
        // reliable from a service worker, whereas currentWindow may be absent.
        await this.restoreCurrentTab();
    }

    async restoreCurrentTab() {
        try {
            const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tabs?.[0]?.id) {
                this.handleTabChange(tabs[0].id);
            } else {
                this.stopTracking();
            }
        } catch {
            this.stopTracking();
        }
    }

    async handleUsageAlarm() {
        if (!this.activeDomain) {
            await this.restoreCurrentTab();
        }
        if (!this.activeDomain || !this.lastCheckpointAt) return;

        const domain = this.activeDomain;
        const elapsedSeconds = Math.floor((Date.now() - this.lastCheckpointAt) / 1000);
        if (elapsedSeconds <= 0) return;

        this.lastCheckpointAt += elapsedSeconds * 1000;
        await this.incrementUsage(domain, { seconds: elapsedSeconds, countOpen: false });
    }

    handleTabChange(tabId) {
        chrome.tabs.get(tabId, tab => {
            if (chrome.runtime.lastError || !tab || !tab.url) {
                this.stopTracking();
                return;
            }

            try {
                const url = new URL(tab.url);
                // Track http, https, and file protocols
                if (url.protocol.startsWith('http') || url.protocol === 'file:') {
                    const domain = url.protocol === 'file:' ? `file://${url.pathname.split('/').pop()}` : url.hostname.replace('www.', '');
                    this.startTracking(domain, tabId);
                } else if (url.protocol === 'chrome-extension:' && url.searchParams.get('src')) {
                    // Chrome PDF viewer often uses chrome-extension://.../?src=<original-pdf-url>
                    const src = decodeURIComponent(url.searchParams.get('src'));
                    try {
                        const srcUrl = new URL(src);
                        const derived = srcUrl.protocol === 'file:'
                            ? `file://${srcUrl.pathname.split('/').pop()}`
                            : `${srcUrl.hostname.replace('www.', '')}${srcUrl.pathname.toLowerCase().endsWith('.pdf') ? ' (pdf)' : ''}`;
                        this.startTracking(derived, tabId);
                    } catch (e) {
                        this.stopTracking();
                    }
                } else {
                    this.stopTracking();
                }
            } catch (e) {
                // Handle cases where URL is not valid, like about:blank
                if (tab.url && tab.url.startsWith('file:///')) {
                    const domain = `file://${tab.url.substring(tab.url.lastIndexOf('/') + 1)}`;
                    this.startTracking(domain, tabId);
                } else {
                    this.stopTracking();
                }
            }
        });
    }

    startTracking(domain, tabId = null) {
        if (this.activeDomain === domain) {
            if (tabId !== null) this.activeTabId = tabId;
            return;
        }

        this.stopTracking();
        this.activeDomain = domain;
        this.activeTabId = tabId;
        this.lastCheckpointAt = Date.now();

        // Count a new site activation once. Elapsed seconds are checkpointed
        // by the alarm, with the interval retained only for responsive UI.
        this.incrementUsage(domain, { countOpen: true, seconds: 0 });
        this.intervalId = setInterval(() => this.handleUsageAlarm(), 1000);
    }

    stopTracking() {
        const previousDomain = this.activeDomain;
        const checkpoint = this.lastCheckpointAt;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.activeDomain = null;
        this.activeTabId = null;
        this.lastCheckpointAt = 0;

        // Flush the final partial segment before switching or stopping. The
        // per-domain queue keeps this write ordered with the next checkpoint.
        if (previousDomain && checkpoint) {
            const elapsedSeconds = Math.floor((Date.now() - checkpoint) / 1000);
            if (elapsedSeconds > 0) {
                this.incrementUsage(previousDomain, { seconds: elapsedSeconds, countOpen: false });
            }
        }
    }

    async sendToActiveTab(message) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs?.[0];
        if (!tab?.id || !/^https?:/i.test(tab.url || '')) return false;

        try {
            const response = await chrome.tabs.sendMessage(tab.id, message);
            if (response?.success !== true) throw new Error('Content script did not acknowledge message');
            return true;
        } catch {
            // A tab can be active before the content script has initialized.
            // Inject once, then retry the message so warnings/countdowns are
            // visible instead of failing silently.
            try {
                let injectionPromise = this.injectionPromises.get(tab.id);
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
                        if (this.injectionPromises.get(tab.id) === injectionPromise) {
                            this.injectionPromises.delete(tab.id);
                        }
                    });
                    this.injectionPromises.set(tab.id, injectionPromise);
                }
                await injectionPromise;
                const response = await chrome.tabs.sendMessage(tab.id, message);
                return response?.success === true;
            } catch {
                return false;
            }
        }
    }

    async sendFallbackNotification(title, message, requireInteraction = false) {
        try {
            const settingsResult = await chrome.storage.local.get(['settings']);
            const settings = settingsResult.settings || {};
            if (settings.notificationsEnabled === false || settings.notificationFallbackEnabled === false) return false;
            const id = `timeshield-warning-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            await chrome.notifications.create(id, {
                type: 'basic',
                iconUrl: 'assets/icons/icon128.png',
                title,
                message,
                priority: 2,
                requireInteraction
            });
            if (!requireInteraction) setTimeout(() => chrome.notifications.clear(id).catch(() => {}), 8000);
            return true;
        } catch {
            return false;
        }
    }

    async incrementUsage(domain, options = {}) {
        const operation = this.writeQueue
            .catch(() => undefined)
            .then(() => this._incrementUsage(domain, options));
        this.writeQueue = operation.catch(() => undefined);
        return operation;
    }

    async _incrementUsage(domain, { countOpen = false, seconds = 1 } = {}) {
        // Skip internal Chrome pages and extension pages (but NOT file:// PDFs)
        if (domain.startsWith('chrome://') || domain.startsWith('chrome-extension://')) {
            this.stopTracking();
            return;
        }

        const now = new Date();
        const today = now.toDateString();
        const currentHour = now.getHours(); // 0-23
        const result = await chrome.storage.local.get([
            'siteUsageData',
            'siteUsageTimeline',
            'siteOpenCounts',
            'timeLimits',
            'globalLimit',
            'timeLimitWarningCache',
            'settings'
        ]);

        let data = result.siteUsageData || {};
        let timeline = result.siteUsageTimeline || {};
        let openCounts = result.siteOpenCounts || {};
        const timeLimits = result.timeLimits || [];
        const globalLimit = result.globalLimit || { enabled: false, minutes: 60, domains: [] };
        const settings = result.settings || {};
        const safeMode = settings.safeModeEnabled === true;
        const siteFirstWarning = Math.max(1, Number(settings.siteWarningFirstMinutes || 2));
        const siteFinalWarning = Math.max(1, Math.min(siteFirstWarning, Number(settings.siteWarningFinalMinutes || 1)));

        if (!data[today]) {
            data[today] = {};
        }

        const elapsedSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        data[today][domain] = (data[today][domain] || 0) + elapsedSeconds;

        // Per‑hour timeline (for detailed graphs)
        if (!timeline[today]) timeline[today] = {};
        if (!timeline[today][domain]) timeline[today][domain] = new Array(24).fill(0);
        timeline[today][domain][currentHour] = (timeline[today][domain][currentHour] || 0) + elapsedSeconds;

        // Per‑day open counts (how many times a site was opened/activated)
        if (countOpen) {
            if (!openCounts[today]) openCounts[today] = {};
            openCounts[today][domain] = (openCounts[today][domain] || 0) + 1;
        }

        // Save back
        await chrome.storage.local.set({
            siteUsageData: data,
            siteUsageTimeline: timeline,
            siteOpenCounts: openCounts
        });

        let shouldBlock = false;

        // 1. Check individual time limit
        const limitObj = timeLimits.find(l => l.site === domain);
        if (limitObj && Number(limitObj.minutes) > 0) {
            const limitSeconds = Math.floor(Number(limitObj.minutes) * 60);
            const usedSeconds = data[today][domain];
            const remaining = limitSeconds - usedSeconds;
            const warningToken = `${today}:${limitSeconds}`;
            const warningCache = result.timeLimitWarningCache || {};
            const domainWarningCache = warningCache[domain] || {};

            // Deliver each warning once per day and per configured limit. If
            // the limit is changed, the token changes and warnings start over.
            if (remaining > 0 && remaining <= siteFirstWarning * 60) {
                const warningMinutes = remaining <= siteFinalWarning * 60 ? siteFinalWarning : siteFirstWarning;
                if (domainWarningCache[warningMinutes] !== warningToken) {
                    const title = `${domain} limit warning`;
                    const message = `${warningMinutes} minute${warningMinutes === 1 ? '' : 's'} remaining. Save your work now.`;
                    const delivered = await this.sendToActiveTab({
                        action: 'showTimeLimitWarning',
                        site: domain,
                        remaining: warningMinutes
                    });
                    if (!delivered && settings.notificationFallbackEnabled !== false) {
                        await this.sendFallbackNotification(title, message, warningMinutes <= siteFinalWarning);
                    }
                    domainWarningCache[warningMinutes] = warningToken;
                    warningCache[domain] = domainWarningCache;
                    await chrome.storage.local.set({ timeLimitWarningCache: warningCache });
                }

                // Keep the compact corner countdown synchronized once per
                // second during the configured final warning window.
                if (settings.showBlockingCountdown !== false && remaining <= siteFinalWarning * 60) {
                    await this.sendToActiveTab({
                        action: 'showBlockingCountdown',
                        label: `${domain} limit`,
                        endAt: Date.now() + (remaining * 1000)
                    });
                }
            }

            if (usedSeconds >= limitSeconds) {
                shouldBlock = true;
            }
        }

        // 2. Check global shared limit
        if (!shouldBlock && globalLimit.enabled && globalLimit.domains.includes(domain)) {
            let totalGlobalSeconds = 0;
            globalLimit.domains.forEach(d => {
                if (data[today][d]) {
                    totalGlobalSeconds += data[today][d];
                }
            });

            const globalLimitSeconds = Math.max(1, Number(globalLimit.minutes || 60) * 60);
            const globalRemaining = globalLimitSeconds - totalGlobalSeconds;
            const globalFirstWarning = Math.max(1, Number(settings.siteWarningFirstMinutes || 2));
            const globalFinalWarning = Math.max(1, Math.min(globalFirstWarning, Number(settings.siteWarningFinalMinutes || 1)));
            const globalWarningCache = result.timeLimitWarningCache || {};
            const globalCacheEntry = globalWarningCache.__global__ || {};
            const globalWarningToken = `${today}:${globalLimitSeconds}`;
            if (globalRemaining > 0 && globalRemaining <= globalFirstWarning * 60) {
                const warningMinutes = globalRemaining <= globalFinalWarning * 60 ? globalFinalWarning : globalFirstWarning;
                if (globalCacheEntry[warningMinutes] !== globalWarningToken) {
                    const title = 'Global limit warning';
                    const message = `${warningMinutes} minute${warningMinutes === 1 ? '' : 's'} remaining across your distraction sites. Save your work now.`;
                    const delivered = await this.sendToActiveTab({
                        action: 'showTimeLimitWarning',
                        site: 'all distraction sites',
                        remaining: warningMinutes
                    });
                    if (!delivered && settings.notificationFallbackEnabled !== false) {
                        await this.sendFallbackNotification(title, message, warningMinutes <= globalFinalWarning);
                    }
                    globalCacheEntry[warningMinutes] = globalWarningToken;
                    globalWarningCache.__global__ = globalCacheEntry;
                    await chrome.storage.local.set({ timeLimitWarningCache: globalWarningCache });
                }
                if (settings.showBlockingCountdown !== false && globalRemaining <= globalFinalWarning * 60) {
                    await this.sendToActiveTab({
                        action: 'showBlockingCountdown',
                        label: 'global limit',
                        endAt: Date.now() + (globalRemaining * 1000)
                    });
                }
            }

            if (totalGlobalSeconds >= globalLimitSeconds) {
                shouldBlock = true;
            }
        }

        // Check if blocking is paused
        const pauseResult = await chrome.storage.local.get(['pauseBlockingUntil']);
        const isPaused = pauseResult.pauseBlockingUntil && 
                        (pauseResult.pauseBlockingUntil === -1 || pauseResult.pauseBlockingUntil > Date.now());

        if (shouldBlock && !isPaused && !safeMode) {
            // Time's up! Redirect to active tab.
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0] && !tabs[0].url.includes('limit-block.html')) {
                    chrome.tabs.update(tabs[0].id, {
                        url: chrome.runtime.getURL('floating/limit-block.html?site=' + encodeURIComponent(domain) + '&orig=' + encodeURIComponent(tabs[0].url))
                    });
                }
            });
            this.stopTracking(); // Stop tracking since it's blocked
        }
    }
}

export const usageTracker = new UsageTracker();
