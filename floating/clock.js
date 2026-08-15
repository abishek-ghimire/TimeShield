/**
 * clock.js — Clock face display only.
 * Dragging and resizing are handled by the container in content/blocker.js.
 */
(function () {
    const hmEl = document.getElementById('hm');
    const secEl = document.getElementById('sec');
    const dateEl = document.getElementById('dateDisplay');
    const tzEl = document.getElementById('tzDisplay');
    const focusEl = document.getElementById('focusIndicator');

    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let cachedSettings = {};
    let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    function pad(n) { return String(n).padStart(2, '0'); }

    function updateClock() {
        const s = cachedSettings || {};
        const is12h = s.timeFormat === '12h';
        const tz = s.timezone || currentTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hour12: is12h,
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });

            const parts = formatter.formatToParts(new Date());
            const get = (type) => parts.find(p => p.type === type)?.value || '';

            let hour = get('hour');
            const minute = get('minute');
            const second = get('second');
            const day = get('weekday');
            const month = get('month');
            const dayNum = get('day');

            if (!is12h) {
                hour = pad(parseInt(hour, 10));
            }

            hmEl.textContent = `${hour}:${minute}`;
            const dayPeriod = get('dayPeriod');
            const secPart = document.querySelector('.seconds-part');

            if (is12h && dayPeriod) {
                secPart.textContent = `${get('second')} ${dayPeriod}`;
            } else {
                secPart.textContent = get('second');
            }

            dateEl.textContent = `${get('weekday')}, ${get('month')} ${get('day')}`;
        } catch (e) {
            // Fallback to local time if timezone formatting fails
            const now = new Date();
            let h = now.getHours();
            const m = pad(now.getMinutes());
            const s2 = pad(now.getSeconds());
            let ampm = '';
            if (is12h) {
                ampm = h >= 12 ? ' PM' : ' AM';
                h = h % 12;
                h = h ? h : 12;
            }
            const displayHour = is12h ? h.toString() : pad(h);
            const day = DAYS[now.getDay()];
            const date = now.getDate();
            const mon = MONTHS[now.getMonth()];
            hmEl.textContent = `${displayHour}:${m}`;

            const secPart = document.querySelector('.seconds-part');
            secPart.textContent = s2 + (is12h ? ampm : '');
            dateEl.textContent = `${day}, ${mon} ${date}`;
        }
    }

    function updateTimezone() {
        const s = cachedSettings || {};
        const tz = s.timezone || currentTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        tzEl.textContent = tz || '';
    }

    let activeInterval = null;
    let timerSnapshot = { focusState: null, timerState: null };

    function renderActiveTimers() {
        const focusState = timerSnapshot.focusState;
        const timerState = timerSnapshot.timerState;
        const focusEnd = Number(focusState?.endTime || 0);
        const timerEnd = Number(timerState?.startTime || 0) + (Number(timerState?.duration || 0) * 1000);
        const now = Date.now();
        const parts = [];

        if (focusState?.isActive === true && focusEnd > now) {
            const remaining = Math.ceil((focusEnd - now) / 1000);
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            parts.push(`🎯 Focus: ${pad(m)}:${pad(s)}`);
        }

        if (timerState?.isRunning === true && timerEnd > now) {
            const remaining = Math.ceil((timerEnd - now) / 1000);
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            parts.push(`⏱️ Timer: ${pad(m)}:${pad(s)}`);
        }

        if (!parts.length) {
            focusEl.style.display = 'none';
            focusEl.innerHTML = '';
            focusEl.classList.remove('has-timer');
            if (activeInterval) {
                clearInterval(activeInterval);
                activeInterval = null;
            }
            return;
        }

        focusEl.style.display = 'block';
        focusEl.classList.add('has-timer');
        const markup = parts.map(text => `<div class="focus-indicator-line">${text}</div>`).join('');
        if (focusEl.innerHTML !== markup) focusEl.innerHTML = markup;
    }

    async function checkActiveTimers() {
        timerSnapshot = await chrome.storage.local.get(['focusState', 'timerState']);
        renderActiveTimers();
        if (!activeInterval && (timerSnapshot.focusState?.isActive || timerSnapshot.timerState?.isRunning)) {
            activeInterval = setInterval(renderActiveTimers, 1000);
        }
    }

    // Setup close button functionality
    document.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('timerCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                const res = await chrome.storage.local.get(['focusState', 'timerState']);
                const focusActive = res.focusState?.isActive === true;
                const timerActive = res.timerState?.isRunning === true;

                if (focusActive) {
                    await chrome.runtime.sendMessage({ action: 'stopFocusMode' });
                }
                if (timerActive) {
                    await chrome.runtime.sendMessage({ action: 'stopTimer' });
                }
            });
        }
    });

    async function applySettings() {
        const result = await chrome.storage.local.get(['settings', 'clockVisible', 'focusState', 'timerState']);
        cachedSettings = result.settings || {};
        const s = cachedSettings;
        currentTimezone = s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        const clockVisible = result.clockVisible !== false;
        const focusActive = result.focusState?.isActive === true;
        const timerActive = result.timerState?.isRunning === true;
        const isStatusOnly = !clockVisible && (focusActive || timerActive);

        // Standard digital style elements
        const timeDisplay = document.querySelector('.time-display');
        const dateDisplay = document.getElementById('dateDisplay');
        const tzDisplay = document.getElementById('tzDisplay');
        const clockFace = document.querySelector('.clock-face');

        if (isStatusOnly) {
            if (timeDisplay) timeDisplay.style.display = 'none';
            if (dateDisplay) dateDisplay.style.display = 'none';
            if (tzDisplay) tzDisplay.style.display = 'none';
            if (clockFace) {
                clockFace.style.justifyContent = 'center';
                clockFace.classList.add('status-only');
            }
        } else {
            if (timeDisplay) timeDisplay.style.display = 'flex';
            if (dateDisplay) dateDisplay.style.display = (s.showDate !== false) ? 'block' : 'none';
            if (tzDisplay) tzDisplay.style.display = (s.showTimezone !== false) ? 'block' : 'none';
            if (clockFace) {
                clockFace.style.justifyContent = 'center';
                clockFace.classList.remove('status-only');
            }
        }

        // Range Opacity
        if (s.clockOpacity) {
            document.documentElement.style.setProperty('--bg-opacity', s.clockOpacity / 100);
        }

        const secPart = document.querySelector('.seconds-part');
        if (secPart) {
            if (isStatusOnly || s.showSeconds === false) {
                secPart.style.display = 'none';
            } else {
                secPart.style.display = 'inline';
            }
        }

        updateClock();
        updateTimezone();
    }

    // Start ticking
    applySettings();
    updateClock();
    updateTimezone();
    checkActiveTimers();

    // Regular updates while the tab is active
    setInterval(updateClock, 1000);
    setInterval(checkActiveTimers, 5000);

    // Ensure the clock snaps to the correct time when a tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateClock();
            updateTimezone();
            checkActiveTimers();
        }
    });

    // Listen for changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.focusState || changes.timerState || changes.clockVisible) {
            checkActiveTimers();
            applySettings();
        }
        if (changes.settings) applySettings();
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'settingsUpdated') {
            applySettings();
        }
    });

    // The in-widget control always opens the full Flip Clock in a separate tab.
    const viewToggle = document.getElementById('view-toggle');
    const openFlipClockTab = async () => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'openFlipClockTab' });
            if (!response?.success) throw new Error('Flip Clock tab was not opened');
        } catch (error) {
            // Keep the click useful if an older service worker is still active.
            window.open(chrome.runtime.getURL('floating/flip-clock.html'), '_blank');
        }
    };
    viewToggle?.addEventListener('click', openFlipClockTab);
    viewToggle?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFlipClockTab();
        }
    });

})();
