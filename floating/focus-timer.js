class FocusTimer {
    constructor() {
        this.timerElement = document.getElementById('focusTimer');
        this.timerText = document.getElementById('timerText');
        this.minimizeBtn = document.getElementById('minimizeBtn');
        this.closeBtn = document.getElementById('closeBtn');
        
        this.isMinimized = false;
        this.focusEndTime = null;
        this.updateInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.loadFocusState();
        this.startTimer();
    }

    setupEventListeners() {
        this.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        this.closeBtn.addEventListener('click', () => this.closeTimer());
        
        // Listen for focus state changes from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'focusStateChanged') {
                this.loadFocusState();
            }
        });
    }

    setupDragAndDrop() {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        this.timerElement.addEventListener('mousedown', (e) => {
            if (e.target === this.minimizeBtn || e.target === this.closeBtn) return;
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === this.timerElement || this.timerElement.contains(e.target)) {
                isDragging = true;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                this.timerElement.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        });
    }

    async loadFocusState() {
        try {
            const result = await chrome.storage.local.get(['focusState']);
            const focusState = result.focusState || {};
            
            if (focusState.isActive && focusState.endTime) {
                this.focusEndTime = focusState.endTime;
                this.showTimer();
            } else {
                this.hideTimer();
            }
        } catch (error) {
            console.error('Error loading focus state:', error);
        }
    }

    startTimer() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);

        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        if (!this.focusEndTime) {
            this.hideTimer();
            return;
        }

        const now = Date.now();
        const remaining = Math.max(0, this.focusEndTime - now);

        if (remaining === 0) {
            this.hideTimer();
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const timeString = `Focus: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        this.timerText.textContent = timeString;
        this.showTimer();
    }

    showTimer() {
        this.timerElement.style.display = 'flex';
    }

    hideTimer() {
        this.timerElement.style.display = 'none';
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.timerElement.classList.toggle('minimized', this.isMinimized);
        this.minimizeBtn.textContent = this.isMinimized ? '□' : '−';
    }

    closeTimer() {
        this.hideTimer();
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    // Check if clock view is open and merge with it
    async checkClockView() {
        try {
            const tabs = await chrome.tabs.query({});
            const clockTab = tabs.find(tab => tab.url && tab.url.includes('flip-clock.html'));
            
            if (clockTab) {
                // Send message to clock view to merge timer
                chrome.tabs.sendMessage(clockTab.id, {
                    action: 'mergeFocusTimer',
                    focusEndTime: this.focusEndTime
                });
                this.closeTimer();
                return true;
            }
        } catch (error) {
            console.error('Error checking clock view:', error);
        }
        return false;
    }
}

// Initialize the focus timer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new FocusTimer();
});
