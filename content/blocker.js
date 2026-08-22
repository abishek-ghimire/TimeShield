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
        this.init();
    }

    async init() {
        this.setupMessageHandlers();
        this.setupStorageListeners();
        this.setupFullscreenListener();
        await this.injectFloatingClock();
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
