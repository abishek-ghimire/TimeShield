document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    const originalUrl = params.get('orig');
    
    if (site) {
        document.getElementById('siteName').textContent = site;
    }

    
    // Redirect cleanly to options page screen time tab
    const optionsLink = document.getElementById('optionsLink');
    if (optionsLink) {
        optionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#screentime') });
            // Alternatively, #screentime if the hash mapping logic handles it, but Options HTML expects click to switch.
            // A full tab create ensures it works smoothly from an iframe or redirect page.
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

    // Add click handlers to duration buttons
    document.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const duration = btn.dataset.minutes;
            let durationMs = 0;

            if (duration === 'eod') {
                // End of day
                const now = new Date();
                const eod = new Date();
                eod.setHours(23, 59, 59, 999);
                durationMs = eod.getTime() - now.getTime();
            } else if (duration === '-1') {
                durationMs = -1;
            } else {
                durationMs = parseInt(duration) * 60000;
            }

            // Send pause message to background script
            chrome.runtime.sendMessage({ action: 'pauseBlocking', durationMs: durationMs });
            
            // Show success message briefly
            pauseSection.innerHTML = `
                <h3>✅ Blocking Paused</h3>
                <p class="pause-message">Protection has been temporarily paused.</p>
            `;
            
            // Close the page after a short delay
            setTimeout(() => {
                window.close();
            }, 2000);
        });
    });
});
