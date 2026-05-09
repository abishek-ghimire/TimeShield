class SleepBlockPage {
    constructor() {
        this.quotes = [
            "Sleep is the golden chain that ties health and our bodies together. — Thomas Dekker",
            "Sleep is the best meditation. — Dalai Lama",
            "A good laugh and a long sleep are the two best cures for anything. — Irish Proverb",
            "Sleep is that golden chain that ties health and our bodies together. — Thomas Dekker",
            "The bridge between despair and hope is a good night's sleep. — E. Joseph Cossman",
            "Sleep is the cousin of death. — Homer",
            "Your future depends on your dreams, so go to sleep. — Mesut Barzani",
            "A day without a nap is like a day without sunshine. — Unknown",
            "Sleep is an investment in the energy you need to be effective tomorrow. — Tom Roth",
            "The best bridge between despair and hope is a good night's sleep. — E. Joseph Cossman",
            "Sleep makes you more attractive, healthier, and sharper. — Matthew Walker",
            "Dreams are the touchstones of our characters. — Henry David Thoreau",
            "Sleep is the sovereign cure for the weariness of the soul. — Sir Walter Scott",
            "A well-spent day brings happy sleep. — Leonardo da Vinci",
            "Sleep is the interest we have to pay on the capital which is called in at death. — Arthur Schopenhauer",
            "The time just before sleep is the most creative time of all. — Joyce Brothers",
            "Sleep is the most important thing you can do for your brain and body. — Matthew Walker",
            "Good sleep is the cornerstone of good health. — Unknown",
            "Sleep is the best meditation for a peaceful mind. — Unknown",
            "Early to bed and early to rise makes a man healthy, wealthy, and wise. — Benjamin Franklin"
        ];
        this.sleepMessages = [
            "All websites are blocked during sleep time. It's important to get proper rest for better health and productivity tomorrow.",
            "Sleep time is protected! Your body and mind need rest to perform at their best tomorrow.",
            "The internet can wait. Your sleep cannot. Time to recharge for a better tomorrow.",
            "All distractions are blocked. Focus on getting the quality sleep you deserve.",
            "Sleep mode activated! This is your time to rest, recover, and prepare for tomorrow's challenges."
        ];
        this.init();
    }

    async init() {
        this.updateTime();
        this.startQuoteRotation();
        this.startMessageRotation();
        this.addPauseBlockButton();
        setInterval(() => this.updateTime(), 1000);
    }

    addPauseBlockButton() {
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
    }

    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = `Current Time: ${timeString}`;
        }
    }

    startQuoteRotation() {
        const el = document.getElementById('sleepQuote');
        // Initial jump to a random quote
        el.textContent = `"${this.quotes[Math.floor(Math.random() * this.quotes.length)]}"`;

        setInterval(() => {
            el.style.opacity = 0;
            setTimeout(() => {
                el.textContent = `"${this.quotes[Math.floor(Math.random() * this.quotes.length)]}"`;
                el.style.opacity = 0.6;
            }, 500);
        }, 20000);
    }

    startMessageRotation() {
        const el = document.getElementById('sleepMessage');
        // Initial jump to a random message
        el.textContent = this.sleepMessages[Math.floor(Math.random() * this.sleepMessages.length)];

        setInterval(() => {
            el.style.opacity = 0;
            setTimeout(() => {
                el.textContent = this.sleepMessages[Math.floor(Math.random() * this.sleepMessages.length)];
                el.style.opacity = 1;
            }, 500);
        }, 25000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SleepBlockPage();
});
