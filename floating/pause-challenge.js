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
            if (!/^[a-z]{25}$/.test(challenge)) {
                pauseSection.innerHTML = '<p class="pause-message">Unable to create a valid pause challenge. Please try again.</p>';
                return;
            }

            pauseSection.innerHTML = `
                <h3>🔐 Verification Required</h3>
                <p class="pause-message">Type this 25-letter lowercase word exactly:</p>
                <p class="pause-challenge-word" aria-label="Pause challenge word" style="font:700 1.1rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;word-break:break-all;color:#a5b4fc;"></p>
                <p class="pause-message" style="color:#f43f5e;">This challenge expires in 10 minutes.</p>
                <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    <input type="text" id="pauseChallenge" maxlength="25" autocomplete="off" autocapitalize="off" spellcheck="false"
                        placeholder="type the word above"
                        style="padding:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:white;border-radius:8px;flex:1 1 240px;min-width:0;">
                    <button class="duration-btn" id="submitChallenge" type="button">Submit</button>
                    <button class="cancel-pause-btn" id="cancelChallenge" type="button">Cancel</button>
                </div>
                <p class="pause-message" id="challengeError" style="display:none;color:#fb7185;">That word does not match. Try again.</p>
            `;

            const wordDisplay = pauseSection.querySelector('.pause-challenge-word');
            const input = pauseSection.querySelector('#pauseChallenge');
            const submit = pauseSection.querySelector('#submitChallenge');
            const cancel = pauseSection.querySelector('#cancelChallenge');
            const error = pauseSection.querySelector('#challengeError');
            wordDisplay.textContent = challenge;

            const resetError = () => {
                error.style.display = 'none';
            };
            input.addEventListener('input', resetError);
            input.addEventListener('paste', (event) => event.preventDefault());
            input.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') event.preventDefault();
            });

            submit.addEventListener('click', () => {
                const value = input.value;
                if (!/^[a-z]{25}$/.test(value)) {
                    error.textContent = 'Use only the exact 25 lowercase letters shown above.';
                    error.style.display = 'block';
                    return;
                }

                submit.disabled = true;
                chrome.runtime.sendMessage({
                    action: 'pauseBlockingWithPassword',
                    durationMs,
                    password: value
                }, (result) => {
                    if (chrome.runtime.lastError || !result?.success) {
                        submit.disabled = false;
                        error.textContent = result?.error || 'That word does not match. Try again.';
                        error.style.display = 'block';
                        input.value = '';
                        input.focus();
                        return;
                    }
                    showSuccess(pauseSection);
                });
            });

            cancel.addEventListener('click', () => {
                pauseSection.style.display = 'none';
                pauseButton.style.display = 'flex';
            });
            input.focus();
        }
    };
})();
