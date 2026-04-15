/**
 * Anti-Anti-Adblock & Cosmetic Filtering Engine
 * Hides all ad elements using aggressive CSS selectors.
 * Runs at document_start so hidden elements never flash visible.
 */
(function () {
    'use strict';

    // ─── ULTRA-AGGRESSIVE AD SELECTORS ────────────────────────────────────────
    const AD_SELECTORS = [
        // High-confidence ad provider containers (must be specific)
        'ins.adsbygoogle',
        'ytd-ad-slot-renderer',
        'ytd-companion-slot-renderer',
        'shreddit-ad-post',

        // Exact data attributes used by major networks
        '[data-ad-slot]', '[data-ad-client]', '[data-ad-unit]',
        '[data-ad-format]', '[data-revive-zoneid]',

        // High-confidence iframe sources
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googleadservices.com"]',
        'iframe[src*="google.com/ads"]',
        'iframe[src*="taboola.com"]',
        'iframe[src*="outbrain.com"]'
    ];

    // ─── INJECT HIDE STYLESHEET ────────────────────────────────────────────────
    function injectBaseStyles() {
        const style = document.createElement('style');
        style.id = 'ts-adblock-base';
        // We use !important on every rule to override site's own display styles
        style.textContent = AD_SELECTORS.map(s => `body.ts-adblock-active ${s}{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}`).join('');
        (document.head || document.documentElement).appendChild(style);
    }

    // ─── MUTATION OBSERVER – CATCH DYNAMICALLY INJECTED ADS ──────────────────
    function setupObserver() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', setupObserver);
            return;
        }

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    hideIfAd(node);
                    // Also check all children
                    node.querySelectorAll && node.querySelectorAll(AD_SELECTORS.join(',')).forEach(hideEl);
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function hideEl(el) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
    }

    function hideIfAd(node) {
        try {
            if (node.matches && node.matches(AD_SELECTORS.join(','))) hideEl(node);
        } catch (e) { }
    }

    // ─── ANTI-ANTI-ADBLOCK ────────────────────────────────────────────────────
    // Neutralizes common methods sites use to detect ad blockers
    function patchAntiAdblock() {
        // 1. Spoof google ads object so detection scripts see "ads loaded"
        if (!window.googletag) {
            window.googletag = {
                cmd: [],
                defineSlot: () => ({ addService: () => ({}) }),
                pubads: () => ({ addEventListener: () => { }, enableSingleRequest: () => { }, refresh: () => { }, setTargeting: () => ({}) }),
                enableServices: () => { },
                display: () => { },
                destroySlots: () => true
            };
        }

        // 2. Fake google _ads_ bait element so detectors think ads are visible
        const bait = document.createElement('div');
        bait.setAttribute('class', 'ad_unit ad-slot adsbox');
        bait.setAttribute('style', 'width:1px;height:1px;position:absolute;left:-9999px;top:-9999px;');
        bait.innerHTML = '&nbsp;';
        (document.body || document.documentElement).appendChild(bait);
        Object.defineProperty(bait, 'offsetParent', { get: () => document.body });
        Object.defineProperty(bait, 'offsetWidth', { get: () => 1 });
        Object.defineProperty(bait, 'offsetHeight', { get: () => 1 });

        // 3. Override common detection methods
        if (window.canRunAds !== undefined) window.canRunAds = true;
        if (window.adblockDetector !== undefined) {
            window.adblockDetector = { init: () => { } };
        }
        if (window.adBlockerDetected !== undefined) {
            window.adBlockerDetected = false;
        }

        // 4. Intercept fetch/XHR requests to ad-detection endpoints
        const originalFetch = window.fetch;
        window.fetch = function (resource, options) {
            if (typeof resource === 'string') {
                if (resource.includes('adblock') || resource.includes('ads-check') ||
                    resource.includes('detect-ad') || resource.includes('addetect')) {
                    // Return a fake successful response
                    return Promise.resolve(new Response(JSON.stringify({ blocked: false }), {
                        status: 200, headers: { 'Content-Type': 'application/json' }
                    }));
                }
            }
            return originalFetch.call(this, resource, options);
        };
    }

    // ─── YOUTUBE SKIP ADS BUTTON (Auto-click) ────────────────────────────────
    function autoSkipYouTubeAds() {
        if (!window.location.hostname.includes('youtube.com')) return;

        const observer = new MutationObserver(() => {
            // Auto-click skip button
            const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
            if (skipBtn) skipBtn.click();

            // Mute and fast-forward video ads
            const video = document.querySelector('video');
            if (video) {
                const adOverlay = document.querySelector('.ytp-ad-player-overlay');
                if (adOverlay && !video.muted) {
                    // Mute during ad
                    video.muted = true;
                    // Speed up
                    if (video.playbackRate < 16) video.playbackRate = 16;
                }
                // Restore when ad ends
                const adModule = document.querySelector('.ytp-ad-module');
                if (!adModule) {
                    video.muted = false;
                    video.playbackRate = 1;
                }
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class']
        });
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────
    // Setup remaining features after DOM is available and check if enabled
    async function init() {
        const result = await chrome.storage.local.get(['adBlockEnabled']);
        const isEnabled = result.adBlockEnabled === true;

        if (isEnabled) {
            injectBaseStyles();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setupObserver();
                    patchAntiAdblock();
                    autoSkipYouTubeAds();
                });
            } else {
                setupObserver();
                patchAntiAdblock();
                autoSkipYouTubeAds();
            }
        }
    }

    init();
})();
