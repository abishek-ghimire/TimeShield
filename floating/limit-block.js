document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    const originalUrl = params.get('orig');
    
    if (site) {
        document.getElementById('siteName').textContent = site;
        
        // Add click handler to site name to add it to time limits
        const siteNameElement = document.getElementById('siteName');
        if (siteNameElement) {
            siteNameElement.style.cursor = 'pointer';
            siteNameElement.title = 'Click to add this site to time limits';
            siteNameElement.addEventListener('click', async () => {
                try {
                    const result = await chrome.storage.local.get(['timeLimits']);
                    const timeLimits = result.timeLimits || [];
                    const existingLimit = timeLimits.find(l => l.site === site);
                    
                    if (existingLimit) {
                        alert(`${site} is already in your time limits with ${existingLimit.minutes} minutes/day`);
                    } else {
                        const minutes = prompt(`Enter daily time limit for ${site} (in minutes):`, '30');
                        if (minutes && !isNaN(minutes) && parseInt(minutes) > 0) {
                            timeLimits.push({
                                site: site,
                                minutes: parseInt(minutes),
                                usedToday: 0,
                                lastReset: new Date().toDateString()
                            });
                            await chrome.storage.local.set({ timeLimits });
                            alert(`${site} added to time limits with ${minutes} minutes/day`);
                        }
                    }
                } catch (error) {
                    console.error('Failed to add site to time limits:', error);
                }
            });
        }
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
                // Indefinite pause removed — require a timed duration
                alert('Indefinite pause option has been removed. Please choose a timed duration.');
                return;
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
                    // Show text challenge
                    pauseSection.innerHTML = `
                        <h3>✍️ Text Challenge Required</h3>
                        <p class="pause-message">I choose discipline over distraction, for my dreams are worth more than temporary comfort.</p>
                        <p class="pause-message" style="color: #f43f5e;">Remaining free 5-min pauses today: ${response.remainingShortPauses}</p>
                        <div style="margin-top: 20px;">
                            <input type="text" id="pauseChallenge" placeholder="Type the sentence above" style="padding: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: white; border-radius: 8px; width: 300px; margin-right: 10px;">
                            <button class="duration-btn" id="submitChallenge">Submit</button>
                            <button class="cancel-pause-btn" id="cancelChallenge">Cancel</button>
                        </div>
                    `;
                    
                    // Add event listeners for text challenge form
                    document.getElementById('submitChallenge').addEventListener('click', () => {
                        const challenge = document.getElementById('pauseChallenge').value;
                        if (challenge) {
                            chrome.runtime.sendMessage({ action: 'pauseBlockingWithPassword', durationMs: durationMs, password: challenge }, (response) => {
                                if (response.success) {
                                    pauseSection.innerHTML = `
                                        <h3>✅ Blocking Paused</h3>
                                        <p class="pause-message">Protection has been temporarily paused.</p>
                                    `;
                                    setTimeout(() => window.close(), 2000);
                                } else {
                                    pauseSection.querySelector('.pause-message').textContent = 'Incorrect text. Please try again.';
                                    document.getElementById('pauseChallenge').value = '';
                                }
                            });
                        }
                    });
                    
                    document.getElementById('cancelChallenge').addEventListener('click', () => {
                        pauseSection.style.display = 'none';
                        pauseBtn.style.display = 'flex';
                    });
                }
            });
        });
    });
});
