document.addEventListener('DOMContentLoaded', async () => {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};

    const authView = document.getElementById('authView');
    const durationView = document.getElementById('durationView');
    const motivationView = document.getElementById('motivationView');

    const passBlock = document.getElementById('passwordBlock');
    const chlBlock = document.getElementById('challengeBlock');
    const passInput = document.getElementById('passwordInput');
    const chlInput = document.getElementById('challengeInput');
    const chlDisplay = document.getElementById('challengeTextDisplay');
    const errorMsg = document.getElementById('errorMsg');

    let selectedDurationMs = 0;

    // 0. Grace Pause Check
    const graceStatus = await chrome.runtime.sendMessage({ action: 'getGracePauseStatus' });
    const graceCount = graceStatus?.count || 0;

    // 1. Show Auth or Skip
    const needPass = settings.challengePasswordEnabled && settings.challengePasswordValue;
    const needText = settings.challengeTextEnabled && settings.challengeTextValue;

    authView.dataset.initialRequired = (needPass || needText) ? 'true' : 'false';

    if (!needPass && !needText) {
        // Skip directly to duration
        durationView.classList.add('active');
    } else {
        authView.classList.add('active');
        if (needPass) passBlock.style.display = 'block';
        if (needText) {
            chlBlock.style.display = 'block';
            // Generate dynamic challenge if it's dynamic
            let cText = settings.challengeTextValue;
            if (cText === 'dynamic_phrase') {
                const phrases = ['I commit to maintaining focus', 'Mindful use of my time', 'Discipline over distraction', 'My goals require my attention'];
                cText = phrases[Math.floor(Math.random() * phrases.length)];
            } else if (cText === 'dynamic_math') {
                const a = Math.floor(Math.random() * 50) + 10;
                const b = Math.floor(Math.random() * 50) + 10;
                cText = `${a} + ${b} = ${a + b}`;
            } else if (cText === 'dynamic_date') {
                cText = new Date().toDateString();
            }
            if (chlDisplay) chlDisplay.textContent = cText;
            if (chlInput) chlInput.dataset.expected = cText; // Store expected result
        }
    }

    // 2. Auth Verification Handle
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            let success = true;
            if (needPass) {
                if (passInput.value !== settings.challengePasswordValue) success = false;
            }
            if (needText) {
                if (chlInput.value.trim().toLowerCase() !== chlInput.dataset.expected.toLowerCase()) success = false;
            }

            if (success) {
                authView.classList.remove('active');
                durationView.classList.add('active');
            } else {
                errorMsg.style.display = 'block';
                if (passInput) passInput.value = '';
                if (chlInput) {
                    chlInput.value = '';
                    // Clear error on typing
                    chlInput.addEventListener('input', () => {
                        errorMsg.style.display = 'none';
                    }, { once: true });
                }
            }
        });
    }

    // 3. Duration Click Handle -> Trigger Motivation View
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dur = btn.dataset.minutes;

            if (dur === 'eod') {
                // End of day
                const now = new Date();
                const eod = new Date();
                eod.setHours(23, 59, 59, 999);
                selectedDurationMs = eod.getTime() - now.getTime();
            } else {
                // Disallow indefinite '-1' pauses — require timed duration
                if (dur === '-1') {
                    alert('Indefinite pause option removed. Please pick a timed duration.');
                    return;
                }
                selectedDurationMs = parseInt(dur) * 60000;
            }

            // Determine if we need motivation challenge
            const isFiveMin = dur === '5';
            const isGrace = isFiveMin && graceCount < 2;

            if (isGrace) {
                // Skip motivation view for grace pauses
                chrome.runtime.sendMessage({ action: 'pauseBlocking', durationMs: selectedDurationMs });
                chrome.runtime.sendMessage({ action: 'incrementGracePause' });
                window.close();
                return;
            }

            // Show warnings as requested
            alert("Warning: Pausing protection will let distractions in. Productivity will decrease.");
            alert("Remember: Time is your most valuable asset. Once spent, you can never get it back.");

            durationView.classList.remove('active');
            motivationView.classList.add('active');
        });
    });

    // 4. Motivation Validation Handle (single exact-sentence requirement)
    // Support either id for backward compatibility
    const motTextEl = document.getElementById('motivationText') || document.getElementById('motivationText1');
    if (motTextEl) {
        // store expected to protect against accidental clearing
        motTextEl.dataset.expected = motTextEl.textContent || motTextEl.dataset.expected || '';
    }

    const confirmBtn = document.getElementById('confirmPauseBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const cleanText = (str) => (str || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();

            const mText = cleanText(motTextEl ? motTextEl.textContent : (motTextEl && motTextEl.dataset.expected) || '');
            const mInput = cleanText(document.getElementById('motivationInput').value || '');

            if (mInput === mText) {
                if (parseInt(selectedDurationMs) === 5 * 60000) {
                    await chrome.runtime.sendMessage({ action: 'incrementGracePause' });
                }
                await chrome.runtime.sendMessage({ action: 'pauseBlocking', durationMs: selectedDurationMs });
                window.close();
            } else {
                const err = document.getElementById('motivationErrorMsg');
                if (err) err.style.display = 'block';
                // Do not clear or modify the displayed target sentence so user can retry
                if (motTextEl && (!motTextEl.textContent || motTextEl.textContent.trim() === '')) {
                    motTextEl.textContent = motTextEl.dataset.expected || '';
                }
                // Hide error on user's input again
                const inp = document.getElementById('motivationInput');
                if (inp) {
                    inp.addEventListener('input', () => {
                        const er = document.getElementById('motivationErrorMsg');
                        if (er) er.style.display = 'none';
                    }, { once: true });
                }
            }
        });
    }

    // Enforce anti-paste on both challenge input fields (auth challenge and motivation input)
    if (chlInput) {
        chlInput.addEventListener('paste', (e) => e.preventDefault());
        chlInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') e.preventDefault();
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
    disableCopy('challengeTextDisplay');
    disableCopy('motivationText');
});
