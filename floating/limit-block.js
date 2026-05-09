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
            chrome.runtime.sendMessage({ action: 'pauseBlocking', durationMs: durationMs }, (response) => {
                if (response.success) {
                    // Show success message briefly
                    pauseSection.innerHTML = `
                        <h3>✅ Blocking Paused</h3>
                        <p class="pause-message">Protection has been temporarily paused.</p>
                    `;
                    
                    // Close the page after a short delay
                    setTimeout(() => {
                        window.close();
                    }, 2000);
                } else if (response.requiresPassword) {
                    // Show password challenge
                    pauseSection.innerHTML = `
                        <h3>🔒 Password Required</h3>
                        <p class="pause-message">You've used your free short pauses today or requested a longer pause. Please enter your password to continue.</p>
                        <p class="pause-message" style="color: #f43f5e;">Remaining free 5-min pauses today: ${response.remainingShortPauses}</p>
                        <div style="margin-top: 20px;">
                            <input type="password" id="pausePassword" placeholder="Enter password" style="padding: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; border-radius: 8px; width: 200px; margin-right: 10px;">
                            <button class="duration-btn" id="submitPassword">Submit</button>
                            <button class="cancel-pause-btn" id="cancelPassword">Cancel</button>
                        </div>
                    `;
                    
                    // Add event listeners for password form
                    document.getElementById('submitPassword').addEventListener('click', () => {
                        const password = document.getElementById('pausePassword').value;
                        if (password) {
                            chrome.runtime.sendMessage({ action: 'pauseBlockingWithPassword', durationMs: durationMs, password: password }, (response) => {
                                if (response.success) {
                                    pauseSection.innerHTML = `
                                        <h3>✅ Blocking Paused</h3>
                                        <p class="pause-message">Protection has been temporarily paused.</p>
                                    `;
                                    setTimeout(() => window.close(), 2000);
                                } else {
                                    pauseSection.querySelector('.pause-message').textContent = 'Incorrect password. Please try again.';
                                    document.getElementById('pausePassword').value = '';
                                }
                            });
                        }
                    });
                    
                    document.getElementById('cancelPassword').addEventListener('click', () => {
                        pauseSection.style.display = 'none';
                        pauseBtn.style.display = 'flex';
                    });
                }
            });
        });
    });
});
