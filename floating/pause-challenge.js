(() => {
    const showSuccess = (pauseSection) => {
        pauseSection.innerHTML = `
            <h3>✅ Blocking Paused</h3>
            <p class="pause-message">Protection has been temporarily paused.</p>
        `;
        window.setTimeout(() => window.close(), 2000);
    };

    window.TimeShieldPauseChallenge = {
        render({ pauseSection, pauseButton, response, durationMs }) {
            const challenge = String(response?.challenge || '');
            const challengeLines = challenge.split('\n');
            const validChallenge = challengeLines.length >= 2
                && challengeLines.length <= 3
                && challengeLines.every(line => /^[a-z]+(?: [a-z]+)*$/.test(line));
            if (!validChallenge) {
                pauseSection.innerHTML = '<p class="pause-message">Unable to create a valid motivational challenge. Please try again.</p>';
                return;
            }

            pauseSection.innerHTML = `
                <h3>🔐 Stay Focused</h3>
                <p class="pause-message">Type these motivational sentences exactly in lowercase. Use one line for each sentence:</p>
                <p class="pause-challenge-word" aria-label="Motivational pause challenge" style="font:700 1rem/1.55 ui-sans-serif,system-ui,sans-serif;white-space:pre-line;word-break:normal;color:#a5b4fc;"></p>
                <p class="pause-message" style="color:#f43f5e;">This challenge expires in 10 minutes.</p>
                <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    <textarea id="pauseChallenge" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false"
                        placeholder="type the sentences above"
                        style="padding:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:white;border-radius:8px;flex:1 1 280px;min-width:0;resize:vertical;font:inherit;line-height:1.45;"></textarea>
                    <button class="duration-btn" id="submitChallenge" type="button">Continue Anyway</button>
                    <button class="cancel-pause-btn" id="cancelChallenge" type="button">Stay Focused</button>
                </div>
                <p class="pause-message" id="challengeError" style="display:none;color:#fb7185;">Those sentences do not match. Try again.</p>
            `;

            const wordDisplay = pauseSection.querySelector('.pause-challenge-word');
            const input = pauseSection.querySelector('#pauseChallenge');
            const submit = pauseSection.querySelector('#submitChallenge');
            const cancel = pauseSection.querySelector('#cancelChallenge');
            const error = pauseSection.querySelector('#challengeError');
            wordDisplay.textContent = challenge;

            const isUsageLimit = response?.pauseContext === 'usageLimit';
            let submittedValue = '';
            let finalConfirmationReady = false;
            let countdownTimer = null;

            const resetError = () => {
                error.style.display = 'none';
            };
            const stopCountdown = () => {
                if (countdownTimer) {
                    window.clearInterval(countdownTimer);
                    countdownTimer = null;
                }
            };
            let sendPauseRequest = (password, confirmUsagePause = false) => {
                chrome.runtime.sendMessage({
                    action: 'pauseBlockingWithPassword',
                    durationMs,
                    pauseContext: isUsageLimit ? 'usageLimit' : 'general',
                    password,
                    confirmUsagePause
                }, (result) => {
                    if (chrome.runtime.lastError || !result?.success) {
                        submit.disabled = false;
                        error.textContent = result?.error || 'Those sentences do not match. Try again.';
                        error.style.display = 'block';
                        if (!result?.requiresFinalConfirmation) {
                            input.disabled = false;
                            input.value = '';
                            input.focus();
                        }
                        return;
                    }
                    stopCountdown();
                    showSuccess(pauseSection);
                });
            };

            input.addEventListener('input', resetError);
            input.addEventListener('paste', (event) => event.preventDefault());
            input.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') event.preventDefault();
            });

            submit.addEventListener('click', () => {
                if (isUsageLimit && finalConfirmationReady) {
                    submit.disabled = true;
                    submit.textContent = 'confirming pause';
                    sendPauseRequest(submittedValue, true);
                    return;
                }

                const value = input.value.replace(/\r\n?/g, '\n').trim();
                const valueLines = value.split('\n');
                const validValue = valueLines.length >= 2
                    && valueLines.length <= 3
                    && valueLines.every(line => /^[a-z]+(?: [a-z]+)*$/.test(line));
                if (!validValue) {
                    error.textContent = 'Use only the exact lowercase words shown above, with one sentence per line and no punctuation.';
                    error.style.display = 'block';
                    return;
                }

                submittedValue = value;
                submit.disabled = true;
                input.disabled = true;
                sendPauseRequest(value);
            });

            // Usage-limit pauses get a modest second decision point so extending a
            // site limit is deliberate rather than an automatic reflex.
            if (isUsageLimit) {
                const usageSendPauseRequest = (password, confirmUsagePause = false) => {
                    chrome.runtime.sendMessage({
                        action: 'pauseBlockingWithPassword',
                        durationMs,
                        pauseContext: 'usageLimit',
                        password,
                        confirmUsagePause
                    }, (result) => {
                        if (chrome.runtime.lastError || !result?.success) {
                            if (result?.requiresFinalConfirmation && Number.isFinite(result.readyAt)) {
                                const updateCountdown = () => {
                                    const remaining = Math.max(0, Math.ceil((result.readyAt - Date.now()) / 1000));
                                    submit.textContent = remaining > 0 ? `wait ${remaining}s` : 'confirm pause';
                                    if (remaining <= 0) {
                                        finalConfirmationReady = true;
                                        submit.disabled = false;
                                        error.textContent = 'your pause request is ready. confirm only if you still want extra site time.';
                                        error.style.display = 'block';
                                        stopCountdown();
                                    }
                                };
                                error.textContent = 'pause request accepted. wait ten seconds, then confirm if you still want extra site time.';
                                error.style.display = 'block';
                                updateCountdown();
                                stopCountdown();
                                countdownTimer = window.setInterval(updateCountdown, 250);
                                return;
                            }
                            submit.disabled = false;
                            input.disabled = false;
                            error.textContent = result?.error || 'Those sentences do not match. Try again.';
                            error.style.display = 'block';
                            input.value = '';
                            input.focus();
                            return;
                        }
                        stopCountdown();
                        showSuccess(pauseSection);
                    });
                };
                // The first submission uses the challenge; the second uses the
                // same text plus the explicit final-confirmation flag.
                sendPauseRequest = usageSendPauseRequest;
            }

            cancel.addEventListener('click', () => {
                stopCountdown();
                pauseSection.style.display = 'none';
                pauseButton.style.display = 'flex';
            });
            input.focus();
        }
    };
})();
