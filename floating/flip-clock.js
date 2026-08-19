// flip-clock.js — 12hr/24hr format, Hours+Minutes flip, Seconds plain
(function () {
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    function pad(n) { return String(n).padStart(2, '0'); }

    let currentHours = null;
    let currentMinutes = null;
    let is12h = true; // default: 12-hour format

    // Load time format preference from storage
    function loadFormat() {
        try {
            chrome.storage.local.get(['settings'], res => {
                const fmt = res?.settings?.timeFormat;
                is12h = fmt !== '24h'; // default to 12h unless explicitly set to 24h
            });
        } catch (e) {
            // If not running in extension context, default to 12h
            is12h = true;
        }
    }

    function getDisplayHours(h24) {
        if (!is12h) return pad(h24);
        const h12 = h24 % 12 || 12;
        return pad(h12);
    }

    function getAmPm(h24) {
        return h24 < 12 ? 'AM' : 'PM';
    }

    function updateAmPm(h24) {
        let badge = document.getElementById('ampm-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'ampm-badge';
            badge.className = 'ampm-badge';
            // Insert next to the seconds group (as a flex sibling in the main row)
            const secondsGroup = document.getElementById('seconds-display')?.closest('.flip-group');
            if (secondsGroup && secondsGroup.parentNode) {
                secondsGroup.parentNode.appendChild(badge);
            }
        }
        badge.style.display = is12h ? 'block' : 'none';
        if (is12h) badge.textContent = getAmPm(h24);
    }

    function flip(unit, oldVal, newVal) {
        if (oldVal === newVal) return;

        const card = document.getElementById(`card-${unit}`);
        const upperDigit = document.getElementById(`upper-${unit}`);
        const lowerDigit = document.getElementById(`lower-${unit}`);
        const foldUpperDigit = document.getElementById(`fold-upper-digit-${unit}`);
        const foldLowerDigit = document.getElementById(`fold-lower-digit-${unit}`);

        if (!card || card.classList.contains('flipping')) return;

        // Fold-upper will animate away showing OLD value
        foldUpperDigit.textContent = oldVal;
        // Fold-lower will animate in showing NEW value
        foldLowerDigit.textContent = newVal;

        // Update static upper immediately (hidden behind fold-upper while it animates)
        upperDigit.textContent = newVal;

        card.classList.add('flipping');

        // Halfway through, update the static lower half to new value
        setTimeout(() => {
            lowerDigit.textContent = newVal;
        }, 280);

        // Remove class after full animation
        setTimeout(() => {
            card.classList.remove('flipping');
        }, 600);
    }

    function updateClock() {
        const now = new Date();
        const h24 = now.getHours();
        const h = getDisplayHours(h24);
        const m = pad(now.getMinutes());
        const s = pad(now.getSeconds());

        if (h !== currentHours) {
            flip('hours', currentHours || h, h);
            currentHours = h;
        }
        if (m !== currentMinutes) {
            flip('minutes', currentMinutes || m, m);
            currentMinutes = m;
        }

        // Seconds — plain update, no flip
        const secEl = document.getElementById('seconds-display');
        if (secEl) secEl.textContent = s;

        // Update AM/PM (only changes once a day but keep in sync)
        updateAmPm(h24);
    }

    function updateDate() {
        const now = new Date();
        const el = document.getElementById('date-display');
        if (el) {
            el.textContent = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`;
        }
    }

    function init() {
        loadFormat();

        // Small delay to let storage load before first render
        setTimeout(() => {
            const now = new Date();
            const h24 = now.getHours();
            const h = getDisplayHours(h24);
            const m = pad(now.getMinutes());
            const s = pad(now.getSeconds());

            currentHours = h;
            currentMinutes = m;

            ['hours', 'minutes'].forEach(unit => {
                const val = unit === 'hours' ? h : m;
                const upper = document.getElementById(`upper-${unit}`);
                const lower = document.getElementById(`lower-${unit}`);
                if (upper) upper.textContent = val;
                if (lower) lower.textContent = val;
            });

            const secEl = document.getElementById('seconds-display');
            if (secEl) secEl.textContent = s;

            updateAmPm(h24);
            updateDate();
        }, 80);
    }

    // Focus Timer Integration
    let focusEndTime = null;
    let focusTimerInterval = null;

    function showFocusTimer(endTime) {
        focusEndTime = endTime;
        const container = document.getElementById('focusTimerContainer');
        if (container) {
            container.style.display = 'block';
            startFocusTimerUpdate();
        }
    }

    function hideFocusTimer() {
        const container = document.getElementById('focusTimerContainer');
        if (container) {
            container.style.display = 'none';
        }
        if (focusTimerInterval) {
            clearInterval(focusTimerInterval);
            focusTimerInterval = null;
        }
        focusEndTime = null;
    }

    function startFocusTimerUpdate() {
        if (focusTimerInterval) {
            clearInterval(focusTimerInterval);
        }

        updateFocusTimerDisplay();
        focusTimerInterval = setInterval(updateFocusTimerDisplay, 1000);
    }

    function updateFocusTimerDisplay() {
        if (!focusEndTime) return;

        const now = Date.now();
        const remaining = Math.max(0, focusEndTime - now);

        if (remaining === 0) {
            hideFocusTimer();
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const timeString = `Focus: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const timerText = document.getElementById('focusTimerText');
        if (timerText) {
            timerText.textContent = timeString;
        }
    }

    async function openClockView() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'toggleClock', visible: true });
            if (response?.success === false) {
                throw new Error(response.error || 'Unable to open Clock View');
            }
        } catch (error) {
            console.warn('Unable to open Clock View:', error);
        }
    }

    // Handle page controls
    document.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('focusTimerClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideFocusTimer);
        }

        const clockViewToggle = document.getElementById('clock-view-toggle');
        if (clockViewToggle) {
            clockViewToggle.addEventListener('click', openClockView);
            clockViewToggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openClockView();
                }
            });
        }
    });

    // Listen for messages from background script
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'showFocusTimer') {
                showFocusTimer(message.focusEndTime);
            } else if (message.action === 'hideFocusTimer') {
                hideFocusTimer();
            } else if (message.action === 'mergeFocusTimer') {
                showFocusTimer(message.focusEndTime);
            }
        });
    }

    init();
    setInterval(updateClock, 1000);
    setInterval(updateDate, 60000);
})();
