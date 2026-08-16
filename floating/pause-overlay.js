document.addEventListener('DOMContentLoaded', async () => {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};

    const authView = document.getElementById('authView');
    const durationView = document.getElementById('durationView');
    const motivationView = document.getElementById('motivationView');

    const passBlock = document.getElementById('passwordBlock');
    const passInput = document.getElementById('passwordInput');
    const errorMsg = document.getElementById('errorMsg');

    let selectedDurationMs = 0;
    const motTextEl = document.getElementById('motivationText') || document.getElementById('motivationText1');

    // 0. Grace Pause Check
    const graceStatus = await chrome.runtime.sendMessage({ action: 'getGracePauseStatus' });
    const graceCount = graceStatus?.count || 0;

    // 1. Show Auth or Skip
    const needPass = settings.challengePasswordEnabled && settings.challengePasswordValue;
    // The background generates fresh lowercase motivational sentences after duration selection.

    authView.dataset.initialRequired = needPass ? 'true' : 'false';

    if (!needPass) {
        // Skip directly to duration; the generated word is requested after selection.
        durationView.classList.add('active');
    } else {
        authView.classList.add('active');
        passBlock.style.display = 'block';
    }

    // 2. Auth Verification Handle
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            let success = true;
            if (needPass) {
                if (passInput.value !== settings.challengePasswordValue) success = false;
            }

            if (success) {
                authView.classList.remove('active');
                durationView.classList.add('active');
            } else {
                errorMsg.style.display = 'block';
                if (passInput) {
                    passInput.value = '';
                    passInput.focus();
                    passInput.addEventListener('input', () => {
                        errorMsg.style.display = 'none';
                    }, { once: true });
                }
            }
        });
    }

    // 3. Duration click: ask the background whether verification is required.
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const dur = btn.dataset.minutes;
            selectedDurationMs = Number.parseInt(dur, 10) * 60000;

            if (!Number.isFinite(selectedDurationMs) || selectedDurationMs <= 0) return;
            btn.disabled = true;
            if (typeof window.TimeShieldPauseChallenge?.startPreparation === 'function') {
                window.TimeShieldPauseChallenge.startPreparation({
                    pauseSection: durationView,
                    pauseButton: null,
                    durationMs: selectedDurationMs,
                    pauseContext: 'general',
                    requestChallenge: () => chrome.runtime.sendMessage({
                        action: 'pauseBlocking',
                        durationMs: selectedDurationMs,
                        pauseContext: 'general'
                    })
                });
                return;
            }
            btn.disabled = false;
        });
    });

    // 4. Verify the returned lowercase motivational sentence challenge.
    // Support either id for backward compatibility
    if (motTextEl) {
        // store expected to protect against accidental clearing
        motTextEl.dataset.expected = motTextEl.textContent || motTextEl.dataset.expected || '';
    }

    const confirmBtn = document.getElementById('confirmPauseBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const input = document.getElementById('motivationInput');
            const value = input?.value || '';
            const error = document.getElementById('motivationErrorMsg');

            const normalizedValue = value.replace(/\r\n?/g, '\n').trim();
            const valueLines = normalizedValue.split('\n');
            const validValue = valueLines.length >= 2
                && valueLines.length <= 3
                && valueLines.every(line => /^[a-z]+(?: [a-z]+)*$/.test(line));
            if (!validValue) {
                if (error) {
                    error.textContent = 'Type the exact lowercase words shown above, one sentence per line, with no punctuation.';
                    error.style.display = 'block';
                }
                return;
            }

            confirmBtn.disabled = true;
            const response = await chrome.runtime.sendMessage({
                action: 'pauseBlockingWithPassword',
                durationMs: selectedDurationMs,
                password: normalizedValue,
                pauseContext: 'general'
            });
            confirmBtn.disabled = false;

            if (response?.success) {
                window.close();
            } else if (error) {
                error.textContent = response?.error || 'Those sentences do not match. Try again.';
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        });
    }

    const motInp = document.getElementById('motivationInput');
    if (motInp) {
        motInp.addEventListener('paste', (e) => e.preventDefault());
        motInp.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') e.preventDefault();
        });
    }

    // Connect cancel buttons natively due to extension CSP restrictions
    const c1 = document.getElementById('cancelBtn1');
    if (c1) c1.addEventListener('click', () => window.close());
    const c2 = document.getElementById('cancelBtn2');
    if (c2) c2.addEventListener('click', () => window.close());

    // Disable copy-pasting for challenge text blocks
    const disableCopy = (id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('copy', (e) => e.preventDefault());
    };
    disableCopy('motivationText');
});
