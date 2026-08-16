document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    const originalUrl = params.get('orig');
    
    if (site) {
        // Display only the site that the user deliberately configured a limit for.
        document.getElementById('siteName').textContent = site;
    }

    
    // Redirect cleanly to options page screen time tab in the same tab
    const optionsLink = document.getElementById('optionsLink');
    if (optionsLink) {
        optionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.update({ url: chrome.runtime.getURL('options/options.html#screentime') });
        });
    }

    // Add pause block functionality
    const pauseBtn = document.getElementById('pauseBlockBtn');
    const pauseSection = document.getElementById('pauseDurationSection');
    const cancelBtn = document.getElementById('cancelPauseBtn');
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            // Show pause duration section
            pauseSection.style.display = 'block';
            pauseBtn.style.display = 'none';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            // Hide pause duration section
            pauseSection.style.display = 'none';
            pauseBtn.style.display = 'flex';
        });
    }

    // Every duration opens a visible verification challenge before blocking is paused.
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const duration = btn.dataset.minutes;
            const durationMs = Number(duration) * 60000;
            const messageEl = pauseSection.querySelector('.pause-message');
            if (!Number.isFinite(durationMs) || durationMs <= 0) return;

            btn.disabled = true;
            if (messageEl) messageEl.textContent = 'Preparing your verification challenge…';
            try {
                const response = await chrome.runtime.sendMessage({ action: 'pauseBlocking', durationMs, pauseContext: 'usageLimit' });
                if (response?.requiresPassword && typeof window.TimeShieldPauseChallenge?.render === 'function') {
                    window.TimeShieldPauseChallenge.render({ pauseSection, pauseButton: pauseBtn, response, durationMs });
                    return;
                }
                if (response?.success) {
                    pauseSection.innerHTML = '<h3>Blocking Paused</h3><p class="pause-message">Protection has been temporarily paused.</p>';
                    window.setTimeout(() => window.close(), 2000);
                    return;
                }
                throw new Error(response?.error || 'Unable to open verification.');
            } catch (error) {
                btn.disabled = false;
                if (messageEl) messageEl.textContent = `${error.message || 'Unable to open verification.'} Please choose the duration again.`;
            }
        });
    });
});
