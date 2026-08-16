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

            const resetError = () => {
                error.style.display = 'none';
            };
            input.addEventListener('input', resetError);
            input.addEventListener('paste', (event) => event.preventDefault());
            input.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') event.preventDefault();
            });

            submit.addEventListener('click', () => {
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

                submit.disabled = true;
                chrome.runtime.sendMessage({
                    action: 'pauseBlockingWithPassword',
                    durationMs,
                    pauseContext: response?.pauseContext === 'usageLimit' ? 'usageLimit' : 'general',
                    password: value
                }, (result) => {
                    if (chrome.runtime.lastError || !result?.success) {
                        submit.disabled = false;
                        error.textContent = result?.error || 'Those sentences do not match. Try again.';
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
