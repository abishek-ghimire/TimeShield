(() => {
    const DELAY_SECONDS = 15;

    const showSuccess = (pauseSection, message = 'Protection has been temporarily paused.') => {
        const ended = message === 'Nuclear Mode has ended.';
        pauseSection.innerHTML = `
            <h3>${ended ? '✅ Nuclear Mode Ended' : '✅ Blocking Paused'}</h3>
            <p class="pause-message">${message}</p>
        `;
        window.setTimeout(() => window.close(), 2000);
    };

    const showError = (pauseSection, error, retry) => {
        pauseSection.innerHTML = `
            <h3>Unable to pause protection</h3>
            <p class="pause-message" style="color:#fb7185;">${String(error?.message || 'Please try again.')}</p>
            <button class="duration-btn" id="retryPause" type="button">Try Again</button>
        `;
        pauseSection.querySelector('#retryPause')?.addEventListener('click', retry);
    };

    window.TimeShieldPauseDelay = {
        start({ pauseSection, pauseButton, requestPause, successMessage, onCancel }) {
            if (!pauseSection || typeof requestPause !== 'function') return;

            let remaining = DELAY_SECONDS;
            let timer = null;
            let delayRequired = false;
            pauseSection.innerHTML = `
                <h3>⏳ Pause Delay</h3>
                <p class="pause-message" id="pauseDelayMessage">Please wait ${DELAY_SECONDS} seconds before continuing.</p>
                <div class="pause-preparation-countdown" aria-live="polite" aria-atomic="true"
                    style="display:grid;place-items:center;margin:18px auto;width:76px;height:76px;border:4px solid rgba(129,140,248,.35);border-top-color:#818cf8;border-radius:50%;font:700 1.8rem/1 ui-sans-serif,system-ui,sans-serif;color:#a5b4fc;">
                    <span id="pauseDelayCountdown">${DELAY_SECONDS}</span>
                </div>
                <button class="cancel-pause-btn" id="cancelPauseDelay" type="button">Stay Focused</button>
            `;

            const message = pauseSection.querySelector('#pauseDelayMessage');
            const countdown = pauseSection.querySelector('#pauseDelayCountdown');
            const cancel = pauseSection.querySelector('#cancelPauseDelay');
            const stop = () => {
                if (timer) window.clearInterval(timer);
                timer = null;
            };
            const complete = async () => {
                stop();
                if (message) message.textContent = 'Processing pause request...';
                if (countdown) countdown.textContent = '✓';
                if (cancel) cancel.disabled = true;
                try {
                    const response = await requestPause(true);
                    if (!response?.success) throw new Error(response?.error || 'Unable to pause protection.');
                    showSuccess(pauseSection, successMessage);
                } catch (error) {
                    showError(pauseSection, error, () => window.location.reload());
                }
            };
            const tick = () => {
                if (!delayRequired) return;
                remaining -= 1;
                if (countdown) countdown.textContent = String(Math.max(remaining, 0));
                if (remaining > 0) {
                    if (message) message.textContent = `Please wait ${remaining} seconds before continuing.`;
                } else {
                    complete();
                }
            };

            cancel?.addEventListener('click', () => {
                stop();
                onCancel?.();
                pauseSection.style.display = 'none';
                if (pauseButton) pauseButton.style.display = 'flex';
            });

            Promise.resolve()
                .then(() => requestPause(false))
                .then((response) => {
                    if (response?.success) {
                        showSuccess(pauseSection, successMessage);
                        return;
                    }
                    if (!response?.requiresDelay) {
                        throw new Error(response?.error || 'Unable to pause protection.');
                    }
                    delayRequired = true;
                    if (message) message.textContent = `Please wait ${DELAY_SECONDS} seconds before continuing.`;
                    timer = window.setInterval(tick, 1000);
                })
                .catch((error) => showError(pauseSection, error, () => window.location.reload()));
        }
    };
})();
