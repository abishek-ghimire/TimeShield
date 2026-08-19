class NuclearBlockPage {
    constructor() {
        this.quotes = [
            'i am focused and i will not get distracted',
            'i choose to protect my time and finish what matters',
            'i am building the discipline to complete what i started',
            'i can feel the urge to switch tasks and i choose to return',
            'i will be proud that i protected this session',
            'i am stronger than the distraction in front of me'
        ];
        this.init();
    }

    init() {
        this.startQuoteRotation();
        this.addPauseBlockButton();
    }

    addPauseBlockButton() {
        const pauseBtn = document.getElementById('pauseBlockBtn');
        const pauseSection = document.getElementById('pauseDurationSection');
        const cancelBtn = document.getElementById('cancelPauseBtn');
        if (!pauseBtn || !pauseSection) return;

        pauseBtn.addEventListener('click', () => {
            pauseSection.style.display = 'block';
            pauseBtn.style.display = 'none';
        });

        cancelBtn?.addEventListener('click', () => {
            pauseSection.style.display = 'none';
            pauseBtn.style.display = 'flex';
        });

        document.querySelectorAll('.duration-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const durationMs = Number(btn.dataset.minutes) * 60000;
                const messageEl = pauseSection.querySelector('.pause-message');
                if (!Number.isFinite(durationMs) || durationMs <= 0) return;

                btn.disabled = true;
                if (typeof window.TimeShieldPauseChallenge?.startPreparation === 'function') {
                    window.TimeShieldPauseChallenge.startPreparation({
                        pauseSection,
                        pauseButton: pauseBtn,
                        durationMs,
                        pauseContext: 'general',
                        requestChallenge: () => new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage({
                                action: 'pauseBlocking',
                                durationMs,
                                pauseContext: 'general'
                            }, (response) => {
                                const error = chrome.runtime.lastError;
                                if (error) reject(new Error(error.message));
                                else resolve(response);
                            });
                        })
                    });
                    return;
                }

                btn.disabled = false;
                if (messageEl) messageEl.textContent = 'Unable to start verification. Please reload the page.';
            });
        });
    }

    startQuoteRotation() {
        const element = document.getElementById('motivationalQuote');
        if (!element) return;
        const update = () => {
            element.textContent = `"${this.quotes[Math.floor(Math.random() * this.quotes.length)]}"`;
        };
        update();
        setInterval(() => {
            element.style.opacity = '0';
            setTimeout(() => {
                update();
                element.style.opacity = '0.6';
            }, 500);
        }, 15000);
    }
}

document.addEventListener('DOMContentLoaded', () => new NuclearBlockPage());
