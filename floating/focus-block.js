class FocusBlockPage {
    constructor() {
        this.quotes = [
            "Your focus determines your reality. — Qui-Gon Jinn",
            "The successful warrior is the average man, with laser-like focus. — Bruce Lee",
            "Deep work is the superpower of the 21st century. — Cal Newport",
            "Focus is more important than intelligence. — Unknown",
            "What you focus on expands. — Tony Robbins",
            "Focus on being productive instead of busy. — Tim Ferriss",
            "Discipline is the bridge between goals and accomplishment. — Jim Rohn",
            "Starve your distractions, feed your focus. — Unknown",
            "It is during our darkest moments that we must focus to see the light. — Aristotle",
            "Success is the product of daily habits—not once-in-a-lifetime transformations. — James Clear",
            "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus. — Alexander Graham Bell",
            "The key to success is to focus on goals, not obstacles. — Unknown",
            "Focus is a matter of deciding what things you're not going to do. — John Carmack",
            "Lack of direction, not lack of time, is the problem. We all have twenty-four hour days. — Zig Ziglar",
            "Successful people have focus. They don't get sidetracked by what's not important. — Unknown",
            "Your life is controlled by what you focus on. — Tony Robbins",
            "The secret of change is to focus all of your energy, not on fighting the old, but on building the new. — Socrates",
            "Don't decrease the goal. Increase the effort. — Unknown",
            "Focus like a laser, not a flashlight. — Unknown",
            "Simplicity is the ultimate sophistication, and focus is the key to simplicity. — Unknown",
            "Where focus goes, energy flows. — Tony Robbins",
            "Great things are done by a series of small things brought together. — Vincent Van Gogh"
        ];
        this.init();
    }

    async init() {
        this.startQuoteRotation();
        this.addPauseBlockButton();
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

    startQuoteRotation() {
        const el = document.getElementById('motivationalQuote');
        // Initial jump to a random quote
        el.textContent = `"${this.quotes[Math.floor(Math.random() * this.quotes.length)]}"`;

        setInterval(() => {
            el.style.opacity = 0;
            setTimeout(() => {
                el.textContent = `"${this.quotes[Math.floor(Math.random() * this.quotes.length)]}"`;
                el.style.opacity = 0.6;
            }, 500);
        }, 15000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FocusBlockPage();
});
