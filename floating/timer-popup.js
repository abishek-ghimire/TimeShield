(function () {
    const displayEl = document.getElementById('timerDisplay');
    const minutesEl = document.getElementById('timerMinutes');
    const secondsEl = document.getElementById('timerSeconds');
    const startStopBtn = document.getElementById('startStop');

    let remaining = 0;
    let intervalId = null;
    let running = false;

    function format(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function syncDisplay() {
        displayEl.textContent = format(remaining);
    }

    function setInputsFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const m = Number(params.get('m'));
        const s = Number(params.get('s'));
        if (!Number.isNaN(m)) minutesEl.value = String(Math.max(0, Math.min(180, m)));
        if (!Number.isNaN(s)) secondsEl.value = String(Math.max(0, Math.min(59, s)));
        remaining = (parseInt(minutesEl.value, 10) || 0) * 60 + (parseInt(secondsEl.value, 10) || 0);
        syncDisplay();
    }

    async function restoreState() {
        const response = await chrome.runtime.sendMessage({ action: 'getState' });
        const timerState = response?.timerState;
        if (timerState?.isRunning) {
            running = true;
            const elapsed = Math.floor((Date.now() - timerState.startTime) / 1000);
            remaining = Math.max(0, (timerState.duration || 0) - elapsed);
            startStopBtn.textContent = 'Stop';
            startTick();
        }
    }

    function startTick() {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(() => {
            if (!running) return;
            if (remaining > 0) {
                remaining -= 1;
                syncDisplay();
            } else {
                running = false;
                clearInterval(intervalId);
                startStopBtn.textContent = 'Start';
            }
        }, 1000);
    }

    async function toggleTimer() {
        if (running) {
            await chrome.runtime.sendMessage({ action: 'stopTimer' });
            running = false;
            startStopBtn.textContent = 'Start';
            if (intervalId) clearInterval(intervalId);
            return;
        }

        const mins = parseInt(minutesEl.value, 10) || 0;
        const secs = parseInt(secondsEl.value, 10) || 0;
        remaining = mins * 60 + secs;
        if (remaining <= 0) return;

        await chrome.runtime.sendMessage({ action: 'startTimer', duration: remaining });
        running = true;
        startStopBtn.textContent = 'Stop';
        syncDisplay();
        startTick();
    }

    startStopBtn.addEventListener('click', toggleTimer);
    document.getElementById('closeWindow').addEventListener('click', () => window.close());

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.timerState?.newValue && !changes.timerState.newValue.isRunning) {
            running = false;
            startStopBtn.textContent = 'Start';
        }
    });

    setInputsFromQuery();
    restoreState();
})();