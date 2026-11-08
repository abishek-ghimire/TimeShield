document.addEventListener('DOMContentLoaded', () => {
    const pauseSection = document.getElementById('durationView');
    const pauseButton = null;
    if (!pauseSection || typeof window.TimeShieldPauseDelay?.start !== 'function') return;

    document.querySelectorAll('.duration-btn[data-minutes]').forEach((button) => {
        button.addEventListener('click', () => {
            const durationMs = Number(button.dataset.minutes) * 60000;
            if (!Number.isFinite(durationMs) || durationMs <= 0) return;

            button.disabled = true;
            window.TimeShieldPauseDelay.start({
                pauseSection,
                pauseButton,
                requestPause: (delayComplete) => new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'pauseBlocking',
                        durationMs,
                        pauseContext: 'general',
                        delayComplete
                    }, (response) => {
                        const error = chrome.runtime.lastError;
                        if (error) reject(new Error(error.message));
                        else resolve(response);
                    });
                })
            });
        });
    });

    document.getElementById('cancelBtn')?.addEventListener('click', () => window.close());
});
