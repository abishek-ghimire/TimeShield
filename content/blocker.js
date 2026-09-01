/**
 * ContentBlocker — Injected into every tab.
 * Manages: floating draggable+resizable clock widget, time-limit warning, sound.
 */
class ContentBlocker {
    constructor() {
        this.isFullscreenFlip = false;
        this.refs = {
            wrapper: null,
            widget: null,
            header: null,
            iframe: null,
            grip: null
        };
        this.blockingCountdownTimer = null;
        this.blockingCountdownEndAt = 0;
        this.soundLastPlayedAt = new Map();
        this.youtubeShortsNavigationHandler = null;
        this.youtubeShortsPlaybackHandler = null;
        this.init();
    }

    async init() {
        this.setupMessageHandlers();
        this.setupStorageListeners();
        this.setupFullscreenListener();
        this.setupYouTubeLearningNavigation();
        if (this.isYouTubePage()) await this.syncYouTubeLearningMode();
        const mountClock = () => this.injectFloatingClock().catch(() => undefined);
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(mountClock, { timeout: 1500 });
        } else {
            window.setTimeout(mountClock, 0);
        }
    }

    setupYouTubeLearningNavigation() {
        if (!this.isYouTubePage()) return;
        ['yt-navigate-finish', 'yt-page-data-updated', 'popstate'].forEach((eventName) => {
            window.addEventListener(eventName, () => this.syncYouTubeLearningMode(), true);
        });
    }

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'ping':
                    sendResponse({ pong: true });
                    break;
                case 'toggleClock':
                    this.toggleFloatingClock(message.visible);
                    sendResponse({ success: true });
                    break;
                case 'playSound':
                    this.playSound(message.sound);
                    sendResponse({ success: true });
                    break;
                case 'showTimeLimitWarning':
                    this.showTimeLimitWarning(message.site, message.remaining);
                    sendResponse({ success: true });
                    break;
                case 'showBlockingWarning':
                    this.showBlockingWarning(message.label, message.remainingMinutes);
                    sendResponse({ success: true });
                    break;
                case 'showBlockingCountdown':
                    this.showBlockingCountdown(message.label, message.endAt);
                    sendResponse({ success: true });
                    break;
                case 'refreshVisibility':
                    if (this.refs.widget) this._restoreVisibility(this.refs.widget);
                    sendResponse({ success: true });
                    break;
                case 'settingsUpdated':
                    if (this.refs.widget) this._restoreVisibility(this.refs.widget);
                    sendResponse({ success: true });
                    break;
                case 'applyClockGeometry':
                    if (message.clockPos && !this.isFullscreenFlip) {
                        this._applyStoredPositionAndSize(message.clockPos);
                    }
                    sendResponse({ success: true });
                    break;
                default:
                    break;
            }
            return true;
        });
    }

    setupStorageListeners() {
        chrome.storage.onChanged.addListener(async (changes) => {
            if (changes.nuclearMode) await this.syncYouTubeLearningMode();
            if (!this.refs.widget) return;

            if (changes.clockVisible) {
                this.toggleFloatingClock(changes.clockVisible.newValue);
            }

            if (changes.clockPos?.newValue && !this.isFullscreenFlip) {
                this._applyStoredPositionAndSize(changes.clockPos.newValue);
            }

            if (changes.clockMinimized && !this.isFullscreenFlip) {
                this._applyMinimizeState(
                    this.refs.widget,
                    this.refs.iframe,
                    this.refs.grip,
                    changes.clockMinimized.newValue === true
                );
            }

            if (changes.focusState || changes.timerState || changes.settings || changes.sessionOverlayDismissed) {
                await this._restoreVisibility(this.refs.widget);
            }
        });
    }

    setupFullscreenListener() {
        document.addEventListener('fullscreenchange', () => {
            const { wrapper, widget } = this.refs;
            if (!wrapper || !widget) return;

            const fullscreenElement = document.fullscreenElement;
            const nextParent = fullscreenElement || document.body || document.documentElement;
            if (nextParent && wrapper.parentElement !== nextParent) {
                nextParent.appendChild(wrapper);
            }

            // Fullscreen stacking contexts can hide ordinary fixed elements. Keep the
            // isolated overlay host and widget above the player while inside fullscreen.
            wrapper.style.zIndex = '2147483646';
            widget.style.zIndex = '2147483647';
            if (fullscreenElement) {
                widget.style.position = 'fixed';
                this._applyScale(true);
            } else {
                this._restorePositionAndSize(widget).catch(() => undefined);
            }
        }, true);
    }

    async injectFloatingClock() {
        if (document.getElementById('timeshield-wrapper')) return;

        // Use a full-viewport host plus a shadow root so PDF viewers and webpages
        // cannot hide or restyle the clock header controls.
        const wrapper = document.createElement('div');
        wrapper.id = 'timeshield-wrapper';
        wrapper.style.cssText = `
            all: initial;
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            z-index: 2147483646;
            pointer-events: none;
            isolation: isolate;
            font-family: inherit;
        `;
        const shadowRoot = wrapper.attachShadow({ mode: 'open' });
        const shadowStyle = document.createElement('style');
        shadowStyle.textContent = `
            :host { all: initial; }
            #ts-clock-widget, #ts-clock-widget * { box-sizing: border-box; }
            #ts-clock-widget button { font: inherit; }
        `;
        shadowRoot.appendChild(shadowStyle);

        const widget = document.createElement('div');
        widget.id = 'ts-clock-widget';
        widget.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 280px;
            height: 160px;
            min-width: 200px;
            min-height: 110px;
            z-index: 2147483647;
            display: none;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
            user-select: none;
            font-family: 'Inter', -apple-system, sans-serif;
            will-change: transform;
            transition: width 0.22s ease, height 0.22s ease, border-radius 0.22s ease;
            contain: layout style paint;
            pointer-events: auto;
        `;

        const header = document.createElement('div');
        header.id = 'ts-clock-header';
        header.style.cssText = `
            height: 28px;
            background: rgba(10, 15, 30, 0.98);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 10px 0 12px;
            cursor: grab;
            flex-shrink: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        `;
        header.innerHTML = `
            <span style="color:#6366f1;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                <span style="font-size:14px;">⏰</span> TimeShield
            </span>
            <div style="display:flex;gap:8px;align-items:center;">
                <button id="ts-minimize-btn" title="Minimize/Expand" style="background:none;border:none;padding:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#94a3b8;transition:color 0.2s;height:24px;width:24px;border-radius:4px;" onmouseover="this.style.background='rgba(255,255,255,0.05)';this.style.color='#f59e0b'" onmouseout="this.style.background='none';this.style.color='#94a3b8'">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button id="ts-close-btn" title="Close clock" style="background:none;border:none;padding:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#94a3b8;transition:all 0.2s;height:24px;width:24px;border-radius:4px;" onmouseover="this.style.background='rgba(244,63,94,0.1)';this.style.color='#f43f5e'" onmouseout="this.style.background='none';this.style.color='#94a3b8'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        `;

        const iframe = document.createElement('iframe');
        iframe.id = 'ts-clock-iframe';
        iframe.src = chrome.runtime.getURL('floating/clock.html');
        iframe.allow = 'autoplay';
        iframe.style.cssText = `
            width: 100%;
            height: calc(100% - 28px);
            border: none;
            display: block;
            background: transparent;
            transition: opacity 0.3s ease;
        `;

        const grip = document.createElement('div');
        grip.id = 'ts-resize-grip';
        grip.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 18px;
            height: 18px;
            cursor: se-resize;
            z-index: 10;
            background: linear-gradient(135deg, transparent 40%, rgba(99,102,241,0.5) 40%);
            border-radius: 0 0 16px 0;
        `;

        widget.appendChild(header);
        widget.appendChild(iframe);
        widget.appendChild(grip);
        shadowRoot.appendChild(widget);
        (document.body || document.documentElement).appendChild(wrapper);

        this.refs = { wrapper, widget, header, iframe, grip };

        this._makeDraggable(widget, header, iframe);
        this._makeResizable(widget, grip, iframe);
        this._setupControls(widget, iframe, grip);

        await this._restorePositionAndSize(widget);
        await this._restoreVisibility(widget);
    }

    _makeDraggable(widget, header, iframe) {
        let dragging = false;
        let offX = 0;
        let offY = 0;
        let frameId = null;

        const move = (e) => {
            if (!dragging || this.isFullscreenFlip) return;

            const x = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, e.clientX - offX));
            const y = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, e.clientY - offY));

            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                widget.style.transform = `translate(${x}px, ${y}px)`;
            });
        };

        header.addEventListener('mousedown', (e) => {
            if (this.isFullscreenFlip) return;
            if (e.target.closest('button')) return;

            dragging = true;
            const currentTransform = new DOMMatrix(getComputedStyle(widget).transform);
            offX = e.clientX - currentTransform.e;
            offY = e.clientY - currentTransform.f;

            header.style.cursor = 'grabbing';
            iframe.style.pointerEvents = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', move);

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            header.style.cursor = 'grab';
            iframe.style.pointerEvents = 'auto';
            if (frameId) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            this._savePosition(widget);
        });
    }

    _makeResizable(widget, grip, iframe) {
        let resizing = false;
        let startW = 0;
        let startH = 0;
        let startX = 0;
        let startY = 0;
        let frameId = null;

        grip.addEventListener('mousedown', (e) => {
            if (this.isFullscreenFlip) return;
            resizing = true;
            startW = widget.offsetWidth;
            startH = widget.offsetHeight;
            startX = e.clientX;
            startY = e.clientY;
            iframe.style.pointerEvents = 'none';
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!resizing || this.isFullscreenFlip) return;

            const newW = Math.max(220, startW + (e.clientX - startX));
            const newH = Math.max(120, startH + (e.clientY - startY));

            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                widget.style.width = `${newW}px`;
                widget.style.height = `${newH}px`;
                this._applyScale();
            });
        });

        document.addEventListener('mouseup', () => {
            if (!resizing) return;
            resizing = false;
            iframe.style.pointerEvents = 'auto';
            if (frameId) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            this._savePosition(widget);
            this._applyScale();
        });

        iframe.addEventListener('load', () => {
            try {
                this._applyScale();
            } catch (error) {
                if (error.name === 'SecurityError') {
                    console.log('TimeShield: Cross-origin iframe access blocked on load (expected behavior)');
                    return;
                }
                console.warn('TimeShield: Error in iframe load:', error);
            }
        });
    }

    _setupControls(widget, iframe, grip) {
        const minimizeButton = this.refs.header?.querySelector('#ts-minimize-btn');
        const closeButton = this.refs.header?.querySelector('#ts-close-btn');
        minimizeButton?.addEventListener('click', async () => {
            if (this.isFullscreenFlip) return;
            try {
                const result = await chrome.storage.local.get(['clockMinimized']);
                const newState = !result.clockMinimized;
                await chrome.storage.local.set({ clockMinimized: newState });
                this._applyMinimizeState(widget, iframe, grip, newState);
            } catch (e) {
                const currentState = widget.dataset.isMinimized === 'true';
                this._applyMinimizeState(widget, iframe, grip, !currentState);
            }
        });

        closeButton?.addEventListener('click', async () => {
            widget.style.display = 'none';
            try {
                // If focus/timer is active, close it for ALL sites
                await chrome.storage.local.set({
                    clockVisible: false,
                    sessionOverlayDismissed: true
                });
                chrome.runtime.sendMessage({ action: 'toggleClock', visible: false }).catch(() => { });
            } catch (e) {
                // no-op
            }
        });
    }

    _applyMinimizeState(widget, iframe, grip, minimized) {
        if (this.isFullscreenFlip) return;

        const btn = this.refs.header?.querySelector('#ts-minimize-btn');
        if (!btn) return;
        if (minimized) {
            widget.dataset.prevH = widget.style.height || (widget.dataset.isStatusOnly === 'true' ? '120px' : '160px');
            iframe.style.opacity = '0';
            setTimeout(() => {
                if (widget.dataset.isMinimized === 'true') {
                    iframe.style.display = 'none';
                    widget.style.height = '28px';
                    grip.style.display = 'none';
                }
            }, 220);
            widget.dataset.isMinimized = 'true';
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
            btn.title = 'Expand';
        } else {
            widget.dataset.isMinimized = 'false';
            iframe.style.display = 'block';
            widget.style.height = widget.dataset.isStatusOnly === 'true' ? '120px' : (widget.dataset.prevH || '160px');
            grip.style.display = 'block';
            setTimeout(() => {
                iframe.style.opacity = '1';
            }, 10);
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
            btn.title = 'Minimize';
            this._applyScale();
        }
    }


    _applyScale(fullscreen = false) {
        const { widget, iframe } = this.refs;
        if (!widget || !iframe) return;

        try {
            const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!innerDoc) return;

            const rect = widget.getBoundingClientRect();
            const BASE_WIDTH = fullscreen ? window.innerWidth : 280;
            const BASE_HEIGHT = fullscreen ? window.innerHeight : 160;
            const scale = Math.max(0.65, Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT));

            const clockFace = innerDoc.querySelector('.clock-face');
            if (clockFace) clockFace.style.setProperty('--ts-scale', scale.toString());

            const flipClock = innerDoc.querySelector('.flip-clock');
            if (flipClock) flipClock.style.setProperty('--ts-scale', fullscreen ? '1.35' : scale.toString());
        } catch (error) {
            // Ignore cross-origin security errors when accessing iframe content
            if (error.name === 'SecurityError') {
                console.log('TimeShield: Cross-origin iframe access blocked (expected behavior)');
                return;
            }
            console.warn('TimeShield: Error accessing iframe content:', error);
        }
    }

    async _restoreVisibility(widget) {
        const result = await chrome.storage.local.get(['clockVisible', 'clockMinimized', 'focusState', 'timerState', 'settings', 'sessionOverlayDismissed']);
        const s = result.settings || {};

        const focusEnabled = s.focusTimerWidgetEnabled !== false;
        const timerEnabled = s.timerWidgetEnabled !== false;

        const focusActive = result.focusState?.isActive === true && focusEnabled;
        const timerActive = result.timerState?.isRunning === true && timerEnabled;
        const shouldShowForStatus = focusActive || timerActive;

        // If the session overlay was specifically dismissed by the user (x button), hide it everywhere
        if (result.sessionOverlayDismissed && !result.clockVisible) {
            widget.style.display = 'none';
            return;
        }

        if (result.clockVisible || shouldShowForStatus) {
            widget.style.display = 'block';
        } else {
            widget.style.display = 'none';
        }

        // Set status only mode if clock is hidden but focus is active
        const isStatusOnly = !result.clockVisible && shouldShowForStatus;
        widget.dataset.isStatusOnly = String(isStatusOnly);

        if (isStatusOnly) {
            widget.style.height = '120px';
            widget.style.minHeight = '100px';
        } else {
            widget.style.minHeight = '110px';
            if (widget.dataset.isMinimized !== 'true') {
                const pos = result.clockPos;
                widget.style.height = pos?.h ? `${pos.h}px` : '160px';
            }
        }

        if (result.clockMinimized && !this.isFullscreenFlip) {
            this._applyMinimizeState(this.refs.widget, this.refs.iframe, this.refs.grip, true);
        }
    }

    toggleFloatingClock(visible) {
        const widget = this.refs.widget || document.getElementById('timeshield-wrapper')?.shadowRoot?.getElementById('ts-clock-widget');
        if (!widget) return;

        if (visible === undefined) {
            widget.style.display = widget.style.display === 'none' ? 'block' : 'none';
        } else {
            widget.style.display = visible ? 'block' : 'none';
        }
    }

    _savePosition(widget) {
        if (this.isFullscreenFlip) return;
        const rect = widget.getBoundingClientRect();
        const transform = new DOMMatrix(getComputedStyle(widget).transform);
        const clockPos = {
            x: Math.round(transform.e),
            y: Math.round(transform.f),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
        };
        chrome.storage.local.set({ clockPos }).catch(() => { });
        chrome.runtime.sendMessage({ action: 'broadcastClockGeometry', clockPos }).catch(() => { });
    }

    _applyStoredPositionAndSize(pos = {}) {
        const { widget } = this.refs;
        if (!widget || this.isFullscreenFlip) return;
        const width = Math.max(220, Number(pos.w) || 280);
        const height = Math.max(120, Number(pos.h) || 160);
        const x = Math.max(0, Math.min(Math.max(0, window.innerWidth - width), Number(pos.x) || 0));
        const y = Math.max(0, Math.min(Math.max(0, window.innerHeight - height), Number(pos.y) || 0));
        widget.style.transform = `translate(${x}px, ${y}px)`;
        widget.style.width = `${width}px`;
        widget.style.height = `${height}px`;
        this._applyScale();
    }

    async _restorePositionAndSize(widget) {
        const result = await chrome.storage.local.get(['clockPos']);
        if (result.clockPos) {
            this._applyStoredPositionAndSize(result.clockPos);
            return;
        }

        const defaultX = Math.max(0, window.innerWidth - 280 - 20);
        const defaultY = 20;
        widget.style.transform = `translate(${defaultX}px, ${defaultY}px)`;
    }

    async syncYouTubeLearningMode() {
        if (!this.isYouTubePage()) {
            this.disableYouTubeLearningMode();
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({ action: 'getNuclearModeState' });
            const nuclearState = response?.nuclearMode;
            const active = nuclearState?.isActive === true && Number(nuclearState.endTime) > Date.now();
            const allowed = active && this.isYouTubeAllowedByNuclearWhitelist(nuclearState.whitelist);
            if (!allowed) {
                this.disableYouTubeLearningMode();
                return;
            }
            await this.enableYouTubeLearningMode();
        } catch {
            this.disableYouTubeLearningMode();
        }
    }

    isYouTubeShortsPage() {
        const pathname = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
        return pathname === '/shorts' || pathname.startsWith('/shorts/');
    }
    isYouTubeWatchPage() {
        return String(window.location.pathname || '') === '/watch';
    }
    isYouTubePage() {
        const hostname = String(window.location.hostname || '').toLowerCase().replace(/^www\\./, '');
        return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
    }

    isYouTubeAllowedByNuclearWhitelist(whitelist) {
        if (!Array.isArray(whitelist)) return false;
        return whitelist.some((entry) => {
            const value = String(entry || '').trim().toLowerCase();
            if (!value) return false;
            try {
                const url = new URL(value.includes('://') ? value : `https://${value}`);
                const hostname = url.hostname.replace(/^www\\./, '').toLowerCase();
                return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
            } catch {
                return value === 'youtube.com' || value.endsWith('.youtube.com');
            }
        });
    }

    async enableYouTubeLearningMode() {
        if (!this.youtubeLearning) {
            this.youtubeLearning = {
                shadowHost: null,
                shadowRoot: null,
                preferences: {
                    panelHidden: false,
                    hideHomeFeed: false,
                    hideVideoSidebar: false,
                    hideLiveChat: false,
                    hidePlaylist: false,
                    hideShorts: false,
                    hideTrending: false,
                    hideExplore: false,
                    hideSubscriptions: false,
                    redirectSubscriptions: false,
                    hideRelated: false,
                    showRecommended: true,
                    hideEndScreen: false,
                    hideEndScreenVideowall: false,
                    hideEndScreenCards: false,
                    hideMiniplayer: false,
                    hideMixRadioPlaylists: false,
                    hideComments: false,
                    hideVideoInfo: false,
                    hideVideoButtonsBar: false,
                    hideChannelInfo: false,
                    hideVideoDescription: false,
                    hideTopHeader: false,
                    hideNotificationBell: false,
                    hideIrrelevantSearchResults: false,
                    hideMoreFromYouTube: false,
                    disableAutoplay: true,
                    disableAnnotations: false,
                    strictRecommendations: false,
                    channelWhitelist: false,
                    learningSession: false,
                    learningQueue: false,
                    channels: []
                },
                sessionStartedAt: 0,
                mutationObserver: null,
                shortsFilterFrame: 0,
                shortsFilterNodes: new Set()
            };
        }
        const stored = await chrome.storage.local.get(['youtubeLearningPreferences']);
        const saved = stored.youtubeLearningPreferences || {};
        const strictNuclearPolicy = {
            panelHidden: true,
            hideHomeFeed: true,
            hideVideoSidebar: false,
            hideLiveChat: true,
            hidePlaylist: true,
            hideShorts: true,
            hideTrending: true,
            hideExplore: true,
            hideSubscriptions: true,
            redirectSubscriptions: true,
            hideRelated: false,
            showRecommended: true,
            hideEndScreen: true,
            hideEndScreenVideowall: true,
            hideEndScreenCards: true,
            hideMiniplayer: true,
            hideMixRadioPlaylists: true,
            hideComments: false,
            hideVideoInfo: false,
            hideVideoButtonsBar: true,
            hideChannelInfo: true,
            hideVideoDescription: false,
            hideTopHeader: false,
            hideNotificationBell: true,
            hideIrrelevantSearchResults: true,
            hideMoreFromYouTube: true,
            disableAutoplay: true,
            disableAnnotations: true,
            strictRecommendations: true,
            channelWhitelist: false,
            learningSession: false,
            learningQueue: false
        };
        this.youtubeLearning.preferences = {
            ...this.youtubeLearning.preferences,
            ...saved,
            ...strictNuclearPolicy,
            channels: Array.isArray(saved.channels) ? saved.channels.slice(0, 100) : []
        };
        if (this.youtubeLearning.preferences.learningSession && !this.youtubeLearning.sessionStartedAt) {
            this.youtubeLearning.sessionStartedAt = Date.now();
        }
        // Nuclear Mode uses an automatic strict layout; no settings panel is shown on YouTube.
        this.youtubeLearning.shadowHost?.remove();
        this.youtubeLearning.shadowHost = null;
        this.youtubeLearning.shadowRoot = null;
        this.applyYouTubeLearningStyles();
        if (this.isYouTubeShortsPage() && !this.youtubeShortsPlaybackHandler) {
            this.youtubeShortsPlaybackHandler = (event) => {
                const media = event.target;
                if (media instanceof HTMLMediaElement) {
                    media.pause();
                    media.removeAttribute('autoplay');
                }
            };
            document.addEventListener('play', this.youtubeShortsPlaybackHandler, true);
        }
        if (this.isYouTubeShortsPage()) {
            document.querySelectorAll('video, audio').forEach((media) => {
                media.pause();
                media.removeAttribute('autoplay');
            });
        }
        if (!this.isYouTubeWatchPage() && !this.isYouTubeShortsPage()) {
            this.applyYouTubeShortsFilter();
            this.applyYouTubeChannelWhitelist();
            this.applyYouTubeSubscriptionRedirect();
        }
        if (!this.youtubeLearning.mutationObserver && document.body && !this.isYouTubeWatchPage() && !this.isYouTubeShortsPage()) {
            this.youtubeLearning.mutationObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) this.youtubeLearning.shortsFilterNodes.add(node);
                }));
                if (this.youtubeLearning.shortsFilterFrame) return;
                this.youtubeLearning.shortsFilterFrame = window.setTimeout(() => {
                    this.youtubeLearning.shortsFilterFrame = 0;
                    if (!this.youtubeLearning?.preferences?.strictRecommendations) return;
                    const nodes = [...this.youtubeLearning.shortsFilterNodes];
                    this.youtubeLearning.shortsFilterNodes.clear();
                    nodes.forEach((node) => this.applyYouTubeShortsFilter(node));
                }, 250);
            });
            this.youtubeLearning.mutationObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    disableYouTubeLearningMode() {
        if (this.youtubeLearning?.shortsFilterFrame) {
            window.clearTimeout(this.youtubeLearning.shortsFilterFrame);
            this.youtubeLearning.shortsFilterFrame = 0;
        }
        this.youtubeLearning?.mutationObserver?.disconnect();
        if (this.youtubeShortsNavigationHandler) {
            document.removeEventListener('click', this.youtubeShortsNavigationHandler, true);
            this.youtubeShortsNavigationHandler = null;
        }
        if (this.youtubeShortsPlaybackHandler) {
            document.removeEventListener('play', this.youtubeShortsPlaybackHandler, true);
            this.youtubeShortsPlaybackHandler = null;
        }
        if (this.youtubeLearning) {
            this.youtubeLearning.mutationObserver = null;
            this.youtubeLearning.shortsFilterNodes.clear();
        }
        document.getElementById('timeshield-youtube-learning-style')?.remove();
        document.querySelectorAll('[data-timeshield-hidden-shorts]').forEach((element) => {
            const previousDisplay = element.dataset.timeshieldPreviousDisplay || '';
            element.style.removeProperty('display');
            if (previousDisplay) element.style.display = previousDisplay;
            delete element.dataset.timeshieldHiddenShorts;
            delete element.dataset.timeshieldPreviousDisplay;
        });
        this.youtubeLearning?.shadowHost?.remove();
        if (this.youtubeLearning) {
            this.youtubeLearning.shadowHost = null;
            this.youtubeLearning.shadowRoot = null;
            this.youtubeLearning.sessionStartedAt = 0;
        }
    }

    ensureYouTubeLearningPanel() {
        if (this.youtubeLearning.shadowHost?.isConnected) {
            this.renderYouTubeLearningPanel();
            return;
        }
        const host = document.createElement('div');
        host.id = 'timeshield-youtube-learning';
        host.style.cssText = 'all:initial;position:fixed;top:76px;right:16px;z-index:2147483645;pointer-events:none;';
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            :host { all: initial; }
            .panel { width: 274px; color: #e5e7eb; background: rgba(15,23,42,.97); border: 1px solid rgba(99,102,241,.55); border-radius: 14px; box-shadow: 0 14px 38px rgba(0,0,0,.42); padding: 12px; font: 12px/1.35 Inter, system-ui, sans-serif; pointer-events:auto; }
            .titlebar { display:flex; align-items:center; justify-content:space-between; gap:8px; }
            .title { color: #c4b5fd; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 3px; }
            .subtitle { color: #94a3b8; font-size: 10px; margin-bottom: 9px; }
            .group-label { color:#a5b4fc; font-size:9px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; margin:9px 0 3px; border-top:1px solid rgba(148,163,184,.14); padding-top:7px; }
            .row { display:flex; align-items:center; gap:7px; margin: 6px 0; }
            .row input { accent-color:#8b5cf6; }
            label { cursor:pointer; }
            .queue { display:flex; gap:6px; align-items:center; margin-top:9px; padding-top:9px; border-top:1px solid rgba(148,163,184,.18); }
            button { border:0; border-radius:7px; padding:6px 8px; color:#fff; background:#6d28d9; cursor:pointer; font:600 10px Inter,system-ui,sans-serif; }
            button:hover { background:#7c3aed; }
            button.secondary { background:rgba(148,163,184,.22); color:#e2e8f0; }
            button.secondary:hover { background:rgba(148,163,184,.34); }
            .hidden-panel { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#cbd5e1; font-size:11px; }
            .meta { color:#a5b4fc; font-size:10px; margin-left:auto; }
            .channels { display:none; width:100%; margin:2px 0 5px 22px; box-sizing:border-box; border:1px solid rgba(148,163,184,.3); border-radius:6px; padding:5px; color:#e5e7eb; background:#111827; font:10px Inter,system-ui,sans-serif; }
            .channels.visible { display:block; }
        `;
        shadowRoot.appendChild(style);
        const panel = document.createElement('section');
        panel.className = 'panel';
        shadowRoot.appendChild(panel);
        (document.body || document.documentElement).appendChild(host);
        this.youtubeLearning.shadowHost = host;
        this.youtubeLearning.shadowRoot = shadowRoot;
        this.renderYouTubeLearningPanel();
    }

    renderYouTubeLearningPanel() {
        const root = this.youtubeLearning?.shadowRoot;
        const panel = root?.querySelector('.panel');
        if (!panel) return;
        const prefs = this.youtubeLearning.preferences;
        const elapsed = prefs.learningSession && this.youtubeLearning.sessionStartedAt
            ? Math.max(0, Math.floor((Date.now() - this.youtubeLearning.sessionStartedAt) / 60000))
            : 0;
        if (prefs.panelHidden) {
            panel.innerHTML = `<div class="hidden-panel"><span>Focus Learning controls hidden</span><button class="secondary" data-panel-show type="button">Show controls</button></div>`;
            panel.querySelector('[data-panel-show]')?.addEventListener('click', () => this.updateYouTubeLearningPreference('panelHidden', false));
            return;
        }
        panel.innerHTML = `
            <div class="titlebar"><div class="title">Focus Learning Mode</div><button class="secondary" data-panel-hide type="button">Hide</button></div>
            <div class="subtitle">Nuclear Mode is active for this allowlisted YouTube session.</div>
            <div class="group-label">Discovery and navigation</div>
            <label class="row"><input data-learning-pref="hideHomeFeed" type="checkbox" ${prefs.hideHomeFeed ? 'checked' : ''}> Hide Homepage Feed</label>
            <label class="row"><input data-learning-pref="hideShorts" type="checkbox" ${prefs.hideShorts ? 'checked' : ''}> Hide YouTube Shorts</label>
            <label class="row"><input data-learning-pref="hideTrending" type="checkbox" ${prefs.hideTrending ? 'checked' : ''}> Hide Trending</label>
            <label class="row"><input data-learning-pref="hideExplore" type="checkbox" ${prefs.hideExplore ? 'checked' : ''}> Hide Explore</label>
            <label class="row"><input data-learning-pref="hideMoreFromYouTube" type="checkbox" ${prefs.hideMoreFromYouTube ? 'checked' : ''}> Hide More from YouTube</label>
            <label class="row"><input data-learning-pref="hideIrrelevantSearchResults" type="checkbox" ${prefs.hideIrrelevantSearchResults ? 'checked' : ''}> Hide Irrelevant Search Results</label>
            <label class="row"><input data-learning-pref="hideSubscriptions" type="checkbox" ${prefs.hideSubscriptions ? 'checked' : ''}> Hide and Redirect Subscriptions</label>
            <label class="row"><input data-learning-pref="redirectSubscriptions" type="checkbox" ${prefs.redirectSubscriptions ? 'checked' : ''}> Redirect Subscriptions</label>
            <label class="row"><input data-learning-pref="hideVideoSidebar" type="checkbox" ${prefs.hideVideoSidebar ? 'checked' : ''}> Hide Video Sidebar</label>
            <label class="row"><input data-learning-pref="hidePlaylist" type="checkbox" ${prefs.hidePlaylist ? 'checked' : ''}> Hide Playlist</label>
            <div class="group-label">Playback and recommendations</div>
            <label class="row"><input data-learning-pref="disableAutoplay" type="checkbox" ${prefs.disableAutoplay ? 'checked' : ''}> Disable Autoplay</label>
            <label class="row"><input data-learning-pref="disableAnnotations" type="checkbox" ${prefs.disableAnnotations ? 'checked' : ''}> Disable Annotations</label>
            <label class="row"><input data-learning-pref="hideRelated" type="checkbox" ${prefs.hideRelated ? 'checked' : ''}> Hide Recommended (Related Videos)</label>
            <label class="row"><input data-learning-pref="showRecommended" type="checkbox" ${prefs.showRecommended ? 'checked' : ''}> Show Recommended</label>
            <label class="row"><input data-learning-pref="hideEndScreen" type="checkbox" ${prefs.hideEndScreen ? 'checked' : ''}> Hide End Screen</label>
            <label class="row"><input data-learning-pref="hideEndScreenVideowall" type="checkbox" ${prefs.hideEndScreenVideowall ? 'checked' : ''}> Hide End Screen Videowall</label>
            <label class="row"><input data-learning-pref="hideEndScreenCards" type="checkbox" ${prefs.hideEndScreenCards ? 'checked' : ''}> Hide End Screen Cards</label>
            <label class="row"><input data-learning-pref="hideMixRadioPlaylists" type="checkbox" ${prefs.hideMixRadioPlaylists ? 'checked' : ''}> Hide Mix Radio Playlists</label>
            <label class="row"><input data-learning-pref="hideMiniplayer" type="checkbox" ${prefs.hideMiniplayer ? 'checked' : ''}> Hide Miniplayer</label>
            <div class="group-label">Video details and page chrome</div>
            <label class="row"><input data-learning-pref="hideLiveChat" type="checkbox" ${prefs.hideLiveChat ? 'checked' : ''}> Hide Live Chat</label>
            <label class="row"><input data-learning-pref="hideComments" type="checkbox" ${prefs.hideComments ? 'checked' : ''}> Hide Comments</label>
            <label class="row"><input data-learning-pref="hideVideoInfo" type="checkbox" ${prefs.hideVideoInfo ? 'checked' : ''}> Hide Video Info</label>
            <label class="row"><input data-learning-pref="hideVideoButtonsBar" type="checkbox" ${prefs.hideVideoButtonsBar ? 'checked' : ''}> Hide Video Buttons Bar</label>
            <label class="row"><input data-learning-pref="hideChannelInfo" type="checkbox" ${prefs.hideChannelInfo ? 'checked' : ''}> Hide Channel</label>
            <label class="row"><input data-learning-pref="hideVideoDescription" type="checkbox" ${prefs.hideVideoDescription ? 'checked' : ''}> Hide Video Description</label>
            <label class="row"><input data-learning-pref="hideTopHeader" type="checkbox" ${prefs.hideTopHeader ? 'checked' : ''}> Hide Top Header</label>
            <label class="row"><input data-learning-pref="hideNotificationBell" type="checkbox" ${prefs.hideNotificationBell ? 'checked' : ''}> Hide Notification Bell</label>
            <label class="row"><input data-learning-pref="hideMerchOffers" type="checkbox" ${prefs.hideMerchOffers ? 'checked' : ''}> Hide Merch, Tickets, Offers</label>
            <label class="row"><input data-learning-pref="strictRecommendations" type="checkbox" ${prefs.strictRecommendations ? 'checked' : ''}> Strict Learning Recommendations</label>
            <label class="row"><input data-learning-pref="channelWhitelist" type="checkbox" ${prefs.channelWhitelist ? 'checked' : ''}> Channel Whitelist</label>
            <input class="channels ${prefs.channelWhitelist ? 'visible' : ''}" data-channel-list placeholder="channel names, comma separated" value="${this.escapeYouTubeAttribute(prefs.channels.join(', '))}">
            <label class="row"><input data-learning-pref="learningSession" type="checkbox" ${prefs.learningSession ? 'checked' : ''}> Learning session ${elapsed ? `<span class="meta">${elapsed} min</span>` : ''}</label>
            <label class="row"><input data-learning-pref="learningQueue" type="checkbox" ${prefs.learningQueue ? 'checked' : ''}> Learning queue</label>
            <div class="queue"><button data-queue-add type="button">Add current video</button><span class="meta" data-queue-count>0 queued</span></div>
        `;
        panel.querySelector('[data-panel-hide]')?.addEventListener('click', () => this.updateYouTubeLearningPreference('panelHidden', true));
        panel.querySelectorAll('[data-learning-pref]').forEach((input) => {
            input.addEventListener('change', () => this.updateYouTubeLearningPreference(input.dataset.learningPref, input.checked));
        });
        panel.querySelector('[data-channel-list]')?.addEventListener('change', (event) => {
            this.updateYouTubeLearningChannels(event.target.value);
        });
        panel.querySelector('[data-queue-add]')?.addEventListener('click', () => this.addCurrentYouTubeVideoToQueue());
        this.updateYouTubeQueueCount();
    }

    escapeYouTubeAttribute(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async updateYouTubeLearningPreference(name, enabled) {
        if (!this.youtubeLearning?.preferences) return;
        this.youtubeLearning.preferences[name] = Boolean(enabled);
        if (name === 'learningSession') {
            this.youtubeLearning.sessionStartedAt = enabled ? (this.youtubeLearning.sessionStartedAt || Date.now()) : 0;
        }
        await chrome.storage.local.set({ youtubeLearningPreferences: this.youtubeLearning.preferences });
        this.applyYouTubeLearningStyles();
        this.renderYouTubeLearningPanel();
    }

    async updateYouTubeLearningChannels(value) {
        const channels = [...new Set(String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
        this.youtubeLearning.preferences.channels = channels;
        await chrome.storage.local.set({ youtubeLearningPreferences: this.youtubeLearning.preferences });
        this.applyYouTubeChannelWhitelist();
    }

    applyYouTubeLearningStyles() {
        const prefs = this.youtubeLearning?.preferences || {};
        document.getElementById('timeshield-youtube-learning-style')?.remove();
        const style = document.createElement('style');
        style.id = 'timeshield-youtube-learning-style';
        style.textContent = `
            ${prefs.hideComments ? '#comments, ytd-comments, #chat { display:none !important; }' : ''}
            ${prefs.hideHomeFeed ? 'ytd-browse[page-subtype="home"] #contents, ytd-rich-grid-renderer[is-home] { display:none !important; }' : ''}
            ${prefs.hideVideoSidebar ? '#secondary, ytd-watch-next-secondary-results-renderer { display:none !important; }' : ''}
            ${prefs.hideLiveChat ? '#chat, ytd-live-chat-frame, ytd-live-chat-renderer { display:none !important; }' : ''}
            ${prefs.hidePlaylist ? '#panels ytd-playlist-panel-renderer, ytd-playlist-panel-renderer, ytd-watch-metadata ytd-playlist-panel-renderer { display:none !important; }' : ''}
            ${prefs.hideShorts ? 'ytd-shorts, #shorts-container, #shorts-player, ytd-reel-video-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-rich-shelf-renderer:has(a[href*="/shorts"]), ytd-rich-shelf-renderer:has(a[href*="youtube.com/shorts"]), ytd-rich-section-renderer:has(a[href*="/shorts"]), ytd-rich-section-renderer:has(a[href*="youtube.com/shorts"]), ytd-item-section-renderer:has(a[href*="/shorts"]), ytd-item-section-renderer:has(a[href*="youtube.com/shorts"]), ytd-guide-entry-renderer:has(a[href*="/shorts"]), ytd-guide-entry-renderer:has(a[href*="youtube.com/shorts"]), ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]), ytd-mini-guide-entry-renderer:has(a[href*="youtube.com/shorts"]), ytd-guide-entry-renderer a[href*="/shorts"], ytd-guide-entry-renderer a[href*="youtube.com/shorts"], ytd-mini-guide-entry-renderer a[href*="/shorts"], ytd-mini-guide-entry-renderer a[href*="youtube.com/shorts"], ytd-reel-item-renderer, ytd-video-renderer:has(a[href*="/shorts"]), ytd-video-renderer:has(a[href*="youtube.com/shorts"]), ytd-grid-video-renderer:has(a[href*="/shorts"]), ytd-grid-video-renderer:has(a[href*="youtube.com/shorts"]), ytd-rich-item-renderer:has(a[href*="/shorts"]), ytd-rich-item-renderer:has(a[href*="youtube.com/shorts"]) { display:none !important; }' : ''}
            ${prefs.hideShorts && this.isYouTubeShortsPage() ? 'ytd-browse, ytd-shorts, #page-manager, #content, #shorts-container, #shorts-player, ytd-reel-video-renderer { display:none !important; }' : ''}
            ${prefs.hideTrending ? 'ytd-browse[page-subtype="trending"] #contents, ytd-guide-entry-renderer a[href^="/feed/trending"] { display:none !important; }' : ''}
            ${prefs.hideExplore ? 'ytd-guide-entry-renderer a[href^="/feed/explore"], ytd-guide-entry-renderer a[href^="/feed/storefront"] { display:none !important; }' : ''}
            ${prefs.hideMoreFromYouTube ? 'ytd-rich-section-renderer, ytd-shelf-renderer[expanded], ytd-rich-shelf-renderer:not([is-shorts]) { display:none !important; }' : ''}
            ${prefs.hideSubscriptions ? 'ytd-guide-entry-renderer a[href^="/feed/subscriptions"], ytd-browse[page-subtype="subscriptions"] #contents { display:none !important; }' : ''}
            ${prefs.hideRelated && !prefs.showRecommended ? '#related, ytd-watch-next-secondary-results-renderer { display:none !important; }' : ''}
            ${prefs.hideEndScreen ? '.ytp-endscreen-content, .ytp-ce-element, .ytp-endscreen-previous, .ytp-endscreen-next { display:none !important; }' : ''}
            ${prefs.hideEndScreenVideowall ? '.ytp-endscreen-content { display:none !important; }' : ''}
            ${prefs.hideEndScreenCards ? '.ytp-ce-element { display:none !important; }' : ''}
            ${prefs.hideMiniplayer ? 'ytd-miniplayer, #miniplayer { display:none !important; }' : ''}
            ${prefs.hideMixRadioPlaylists ? 'ytd-compact-radio-renderer, ytd-radio-renderer, ytd-playlist-renderer[is-mix] { display:none !important; }' : ''}
            ${prefs.hideVideoInfo ? '#above-the-fold, #info, ytd-watch-metadata { display:none !important; }' : ''}
            ${prefs.hideVideoButtonsBar ? '#top-level-buttons-computed, #actions, ytd-menu-renderer { display:none !important; }' : ''}
            ${prefs.hideChannelInfo ? '#owner, ytd-video-owner-renderer { display:none !important; }' : ''}
            ${prefs.hideVideoDescription ? '#description, ytd-text-inline-expander, ytd-watch-metadata #description { display:none !important; }' : ''}
            ${prefs.hideTopHeader ? 'ytd-masthead, #masthead-container { display:none !important; }' : ''}
            ${prefs.hideNotificationBell ? 'ytd-notification-topbar-button-renderer, a[href^="/feed/notifications"] { display:none !important; }' : ''}
            ${prefs.hideMerchOffers ? '#offer-module, ytd-merch-shelf-renderer, ytd-product-shelf-renderer, ytd-ticket-shelf-renderer { display:none !important; }' : ''}
            ${prefs.hideIrrelevantSearchResults ? 'ytd-search ytd-shelf-renderer, ytd-search ytd-horizontal-card-list-renderer, ytd-search ytd-reel-shelf-renderer { display:none !important; }' : ''}
            ${prefs.strictRecommendations ? `
                ytd-reel-shelf-renderer,
                ytd-rich-shelf-renderer[is-shorts],
                ytd-rich-shelf-renderer:has(a[href^="/shorts"]),
                ytd-rich-section-renderer:has(a[href^="/shorts"]),
                ytd-item-section-renderer:has(a[href^="/shorts"]),
                ytd-guide-entry-renderer:has(a[href^="/shorts"]),
                ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
                ytd-guide-entry-renderer a[href^="/shorts"],
                ytd-mini-guide-entry-renderer a[href^="/shorts"],
                ytd-video-renderer:has(a[href^="/shorts"]),
                ytd-grid-video-renderer:has(a[href^="/shorts"]),
                ytd-rich-item-renderer:has(a[href^="/shorts"]),
                ytd-reel-item-renderer,
                ytd-rich-section-renderer[mini-guide-entry-renderer] { display:none !important; }
            ` : ''}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    applyYouTubeAutoplayOff() {
        if (!this.youtubeLearning?.preferences || this.youtubeLearning.preferences.disableAutoplay === false) return;
        const video = document.querySelector('video');
        if (video) video.autoplay = false;
        const autoplayButton = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
        if (autoplayButton && !autoplayButton.dataset.timeshieldAutoplayOff) {
            autoplayButton.dataset.timeshieldAutoplayOff = 'true';
            autoplayButton.click();
        }
    }

    applyYouTubeSubscriptionRedirect() {
        const prefs = this.youtubeLearning?.preferences;
        if (!prefs?.redirectSubscriptions || window.location.pathname !== '/feed/subscriptions') return;
        if (sessionStorage.getItem('timeshield-subscriptions-redirected') === 'true') return;
        sessionStorage.setItem('timeshield-subscriptions-redirected', 'true');
        window.location.assign('/');
    }
    applyYouTubeShortsFilter(root = document) {
        if (!this.youtubeLearning?.preferences?.strictRecommendations) return;
        const shortsHref = (href) => {
            const value = String(href || '');
            try {
                const parsed = new URL(value, window.location.origin);
                return parsed.pathname === '/shorts' || parsed.pathname.startsWith('/shorts/');
            } catch {
                return value === '/shorts' || value.startsWith('/shorts/') || value.startsWith('/shorts?');
            }
        };
        const targets = new Set();
        const anchors = [];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches('a[href*="/shorts"]')) anchors.push(root);
        if (typeof root.querySelectorAll === 'function') anchors.push(...root.querySelectorAll('a[href*="/shorts"]'));
        anchors.forEach((anchor) => {
            if (!shortsHref(anchor.getAttribute('href'))) return;
            const target = anchor.closest([
                'ytd-guide-entry-renderer',
                'ytd-mini-guide-entry-renderer',
                'ytd-reel-item-renderer',
                'ytd-video-renderer',
                'ytd-grid-video-renderer',
                'ytd-rich-item-renderer',
                'ytd-reel-shelf-renderer',
                'ytd-rich-shelf-renderer',
                'ytd-rich-section-renderer',
                'ytd-item-section-renderer',
                'ytd-rich-grid-row',
                'ytd-rich-grid-renderer'
            ].join(',')) || anchor;
            targets.add(target);
        });
                const textContainers = root.querySelectorAll?.([
            'ytd-guide-entry-renderer',
            'ytd-mini-guide-entry-renderer',
            'ytd-rich-shelf-renderer',
            'ytd-rich-section-renderer',
            'ytd-item-section-renderer',
            'ytd-reel-shelf-renderer',
            'ytd-rich-grid-row'
        ].join(',')) || [];
        textContainers.forEach((container) => {
            const label = [container.getAttribute('aria-label'), container.getAttribute('title'), container.textContent]
                .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            if (!/(^|\s)shorts(\s|$)/i.test(label)) return;
            targets.add(container);
        });
        targets.forEach((element) => {
            if (!element.dataset.timeshieldHiddenShorts) {
                element.dataset.timeshieldHiddenShorts = 'true';
                element.dataset.timeshieldPreviousDisplay = element.style.display || '';
            }
            element.style.setProperty('display', 'none', 'important');
        });
    }
    applyYouTubeChannelWhitelist() {
        const prefs = this.youtubeLearning?.preferences;
        if (!prefs?.channelWhitelist || !prefs.channels.length) return;
        const channels = prefs.channels;
        document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer').forEach((card) => {
            const channel = card.querySelector('#channel-name, ytd-channel-name, .ytd-channel-name')?.textContent?.trim().toLowerCase() || '';
            if (channel) card.style.display = channels.some((allowed) => channel.includes(allowed)) ? '' : 'none';
        });
    }

    async addCurrentYouTubeVideoToQueue() {
        const url = window.location.href;
        let parsedUrl;
        try { parsedUrl = new URL(url); } catch { return; }
        if (!parsedUrl.hostname.toLowerCase().endsWith('youtube.com') || parsedUrl.pathname !== '/watch') return;
        const title = document.querySelector('h1.ytd-watch-metadata, h1.title')?.textContent?.trim() || document.title;
        const stored = await chrome.storage.local.get(['youtubeLearningQueue']);
        const queue = Array.isArray(stored.youtubeLearningQueue) ? stored.youtubeLearningQueue : [];
        if (!queue.some((item) => item.url === url)) {
            queue.push({ url, title, addedAt: Date.now() });
            await chrome.storage.local.set({ youtubeLearningQueue: queue.slice(-100) });
        }
        this.updateYouTubeQueueCount();
    }

    async updateYouTubeQueueCount() {
        const stored = await chrome.storage.local.get(['youtubeLearningQueue']);
        const count = Array.isArray(stored.youtubeLearningQueue) ? stored.youtubeLearningQueue.length : 0;
        const target = this.youtubeLearning?.shadowRoot?.querySelector('[data-queue-count]');
        if (target) target.textContent = `${count} queued`;
    }

    showTimeLimitWarning(site, remaining) {
        this.showBlockingWarning(`${site} screen limit`, remaining, 'until blocking');
    }

    showBlockingWarning(label, remainingMinutes, suffix = 'until blocking') {
        if (!document.getElementById('ts-warning-style')) {
            const style = document.createElement('style');
            style.id = 'ts-warning-style';
            style.textContent = '@keyframes ts-slide-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }';
            document.head.appendChild(style);
        }

        const existing = document.getElementById('ts-time-limit-warning');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'ts-time-limit-warning';
        div.style.cssText = `
            position: fixed; top: 74px; right: 12px; max-width: min(320px, calc(100vw - 24px));
            background: rgba(10,15,30,0.97); color: white; padding: 10px 13px;
            border-radius: 11px; border: 1px solid rgba(244,63,94,0.42);
            z-index: 2147483646; font-family: Inter, -apple-system, sans-serif;
            box-shadow: 0 8px 24px rgba(0,0,0,0.34); display: flex;
            align-items: center; gap: 8px; font-size: 12px; line-height: 1.35;
            font-weight: 500; backdrop-filter: blur(12px); animation: ts-slide-up 0.25s ease;
        `;
        const icon = document.createElement('span');
        icon.textContent = '⏰';
        icon.style.fontSize = '16px';
        const text = document.createElement('span');
        text.textContent = `${label}: ${remainingMinutes} minute${Number(remainingMinutes) === 1 ? '' : 's'} ${suffix}. Save your work now.`;
        div.append(icon, text);
        document.body.appendChild(div);
        window.setTimeout(() => div.remove(), 8000);
    }

    showBlockingCountdown(label, endAt) {
        const endTime = Number(endAt);
        if (!Number.isFinite(endTime)) return;

        let div = document.getElementById('ts-blocking-countdown');
        if (!div) {
            div = document.createElement('div');
            div.id = 'ts-blocking-countdown';
            div.style.cssText = `
                position: fixed; top: 12px; right: 12px; width: 154px;
                box-sizing: border-box; padding: 8px 10px; border-radius: 9px;
                background: rgba(15,23,42,0.96); color: #fff;
                border: 1px solid rgba(251,146,60,0.58); z-index: 2147483647;
                font: 500 11px/1.25 Inter, -apple-system, sans-serif;
                box-shadow: 0 6px 18px rgba(0,0,0,0.3); text-align: center;
                pointer-events: none;
            `;
            document.body.appendChild(div);
        }

        this.blockingCountdownEndAt = endTime;
        const render = () => {
            const remainingSeconds = Math.max(0, Math.ceil((this.blockingCountdownEndAt - Date.now()) / 1000));
            if (remainingSeconds <= 0) {
                this.removeBlockingCountdown();
                return;
            }
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = String(remainingSeconds % 60).padStart(2, '0');
            div.textContent = `${label} in ${minutes}:${seconds}`;
        };

        render();
        if (this.blockingCountdownTimer) return;
        this.blockingCountdownTimer = window.setInterval(render, 1000);
    }

    removeBlockingCountdown() {
        if (this.blockingCountdownTimer) {
            window.clearInterval(this.blockingCountdownTimer);
            this.blockingCountdownTimer = null;
        }
        this.blockingCountdownEndAt = 0;
        document.getElementById('ts-blocking-countdown')?.remove();
    }

    playSound(sound) {
        const normalizedSound = String(sound || '').trim();
        if (!/^[a-z0-9-]+$/i.test(normalizedSound)) return;

        const now = Date.now();
        const lastPlayedAt = this.soundLastPlayedAt.get(normalizedSound) || 0;
        if (now - lastPlayedAt < 750) return;
        this.soundLastPlayedAt.set(normalizedSound, now);

        const audio = new Audio(chrome.runtime.getURL(`assets/sounds/${normalizedSound}.mp3`));
        audio.preload = 'auto';
        audio.volume = 0.7;
        audio.play().catch(() => {
            // Autoplay policy or a missing asset should not affect page behavior.
            this.soundLastPlayedAt.delete(normalizedSound);
        });
    }
}

if (
    typeof window !== 'undefined' &&
    !window.location.protocol.startsWith('chrome') &&
    !window.location.protocol.startsWith('chrome-extension')
) {
    if (document.body) {
        if (!window.hasInitializedBlocker) {
    window.hasInitializedBlocker = true;
    new ContentBlocker();
}
    } else {
        document.addEventListener('DOMContentLoaded', () => new ContentBlocker());
    }
}
