// usage-tracker.js
// Tracks time spent on different websites for the "Screen Time" feature.

class UsageTracker {
    constructor() {
        this.activeDomain = null;
        this.intervalId = null;
        this.init();
    }

    async init() {
        // Listeners for tab changes
        chrome.tabs.onActivated.addListener(activeInfo => {
            this.handleTabChange(activeInfo.tabId);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (tab.active && changeInfo.url) {
                this.handleTabChange(tabId);
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

        // Initialize with current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (tabs && tabs[0]) {
                this.handleTabChange(tabs[0].id);
            }
        });
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
                    this.startTracking(domain);
                } else if (url.protocol === 'chrome-extension:' && url.searchParams.get('src')) {
                    // Chrome PDF viewer often uses chrome-extension://.../?src=<original-pdf-url>
                    const src = decodeURIComponent(url.searchParams.get('src'));
                    try {
                        const srcUrl = new URL(src);
                        const derived = srcUrl.protocol === 'file:'
                            ? `file://${srcUrl.pathname.split('/').pop()}`
                            : `${srcUrl.hostname.replace('www.', '')}${srcUrl.pathname.toLowerCase().endsWith('.pdf') ? ' (pdf)' : ''}`;
                        this.startTracking(derived);
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
                    this.startTracking(domain);
                } else {
                    this.stopTracking();
                }
            }
        });
    }

    startTracking(domain) {
        if (this.activeDomain === domain) return;
        this.stopTracking();
        this.activeDomain = domain;
        // Count an open immediately, then track every second
        this.incrementUsage(domain, { countOpen: true });
        this.intervalId = setInterval(() => this.incrementUsage(domain, { countOpen: false }), 1000);
    }

    stopTracking() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.activeDomain = null;
    }

    async incrementUsage(domain, { countOpen = false } = {}) {
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
            'timeLimitWarningCache'
        ]);

        let data = result.siteUsageData || {};
        let timeline = result.siteUsageTimeline || {};
        let openCounts = result.siteOpenCounts || {};
        const timeLimits = result.timeLimits || [];
        const globalLimit = result.globalLimit || { enabled: false, minutes: 60, domains: [] };

        if (!data[today]) {
            data[today] = {};
        }

        data[today][domain] = (data[today][domain] || 0) + 1;

        // Per‑hour timeline (for detailed graphs)
        if (!timeline[today]) timeline[today] = {};
        if (!timeline[today][domain]) timeline[today][domain] = new Array(24).fill(0);
        timeline[today][domain][currentHour] = (timeline[today][domain][currentHour] || 0) + 1;

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
            if (remaining > 0 && remaining <= 120) {
                const warningMinutes = remaining <= 60 ? 1 : 2;
                if (domainWarningCache[warningMinutes] !== warningToken) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        const tab = tabs?.[0];
                        if (!tab?.id) return;
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'showTimeLimitWarning',
                            site: domain,
                            remaining: warningMinutes
                        }).catch(() => undefined);
                    });
                    domainWarningCache[warningMinutes] = warningToken;
                    warningCache[domain] = domainWarningCache;
                    await chrome.storage.local.set({ timeLimitWarningCache: warningCache });
                }

                // Keep the compact corner countdown synchronized once per
                // second during the final minute. It removes itself at zero.
                if (remaining <= 60) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        const tab = tabs?.[0];
                        if (!tab?.id) return;
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'showBlockingCountdown',
                            label: `${domain} limit`,
                            endAt: Date.now() + (remaining * 1000)
                        }).catch(() => undefined);
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

            if (totalGlobalSeconds >= globalLimit.minutes * 60) {
                shouldBlock = true;
            }
        }

        // Check if blocking is paused
        const pauseResult = await chrome.storage.local.get(['pauseBlockingUntil']);
        const isPaused = pauseResult.pauseBlockingUntil && 
                        (pauseResult.pauseBlockingUntil === -1 || pauseResult.pauseBlockingUntil > Date.now());

        if (shouldBlock && !isPaused) {
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
