class Stopwatch {
    constructor() {
        this.startTime = 0;
        this.elapsedTime = 0;
        this.timerInterval = null;
        this.isRunning = false;
        this.laps = [];
        this.lastLapTime = 0;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.loadSavedState();
    }
    
    setupElements() {
        this.display = document.getElementById('stopwatchDisplay');
        this.startStopBtn = document.getElementById('startStop');
        this.lapBtn = document.getElementById('lap');
        this.resetBtn = document.getElementById('reset');
        this.lapsContainer = document.getElementById('lapsContainer');
        this.lapsList = document.getElementById('lapsList');
    }
    
    setupEventListeners() {
        this.startStopBtn.addEventListener('click', () => this.toggleStartStop());
        this.lapBtn.addEventListener('click', () => this.recordLap());
        this.resetBtn.addEventListener('click', () => this.reset());
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
    }
    
    toggleStartStop() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    }
    
    start() {
        this.startTime = Date.now() - this.elapsedTime;
        this.timerInterval = setInterval(() => this.updateDisplay(), 10);
        this.isRunning = true;
        
        this.startStopBtn.textContent = 'Pause';
        this.startStopBtn.className = 'btn-stopwatch btn-pause';
        this.lapBtn.disabled = false;
        
        this.saveState();
        this.trackEvent('stopwatch_started');
    }
    
    pause() {
        clearInterval(this.timerInterval);
        this.isRunning = false;
        
        this.startStopBtn.textContent = 'Resume';
        this.startStopBtn.className = 'btn-stopwatch btn-start';
        
        this.saveState();
        this.trackEvent('stopwatch_paused');
    }
    
    reset() {
        clearInterval(this.timerInterval);
        this.startTime = 0;
        this.elapsedTime = 0;
        this.isRunning = false;
        this.laps = [];
        this.lastLapTime = 0;
        
        this.display.textContent = '00:00:00';
        this.startStopBtn.textContent = 'Start';
        this.startStopBtn.className = 'btn-stopwatch btn-start';
        this.lapBtn.disabled = true;
        this.lapsContainer.style.display = 'none';
        this.lapsList.innerHTML = '';
        
        this.saveState();
        this.trackEvent('stopwatch_reset');
    }
    
    recordLap() {
        if (!this.isRunning) return;
        
        const currentLapTime = this.elapsedTime - this.lastLapTime;
        const lapNumber = this.laps.length + 1;
        
        const lap = {
            number: lapNumber,
            time: this.elapsedTime,
            lapTime: currentLapTime,
            timestamp: new Date().toISOString()
        };
        
        this.laps.unshift(lap);
        this.lastLapTime = this.elapsedTime;
        
        this.updateLapsDisplay();
        this.saveState();
        this.trackEvent('stopwatch_lap_recorded', { lapNumber, lapTime: currentLapTime });
    }
    
    updateDisplay() {
        this.elapsedTime = Date.now() - this.startTime;
        this.display.textContent = this.formatTime(this.elapsedTime);
    }
    
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const ms = Math.floor((milliseconds % 1000) / 10);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
    
    updateLapsDisplay() {
        if (this.laps.length === 0) {
            this.lapsContainer.style.display = 'none';
            return;
        }
        
        this.lapsContainer.style.display = 'block';
        this.lapsList.innerHTML = '';
        
        this.laps.forEach((lap, index) => {
            const lapItem = document.createElement('div');
            lapItem.className = 'lap-item';
            
            const lapTimeDiff = index > 0 ? lap.lapTime - this.laps[index - 1].lapTime : 0;
            const diffText = index > 0 && lapTimeDiff !== 0 
                ? (lapTimeDiff > 0 ? '+' : '') + this.formatTime(Math.abs(lapTimeDiff))
                : '';
            
            lapItem.innerHTML = `
                <span class="lap-number">Lap ${lap.number}</span>
                <span class="lap-time">${this.formatTime(lap.lapTime)}</span>
                <span class="lap-diff">${diffText}</span>
            `;
            
            this.lapsList.appendChild(lapItem);
        });
    }
    
    async saveState() {
        const state = {
            elapsedTime: this.elapsedTime,
            isRunning: this.isRunning,
            laps: this.laps,
            lastLapTime: this.lastLapTime,
            timestamp: new Date().toISOString()
        };
        
        await chrome.storage.local.set({ stopwatchState: state });
    }
    
    async loadSavedState() {
        const result = await chrome.storage.local.get('stopwatchState');
        const state = result.stopwatchState;
        
        if (state) {
            this.elapsedTime = state.elapsedTime || 0;
            this.laps = state.laps || [];
            this.lastLapTime = state.lastLapTime || 0;
            
            this.display.textContent = this.formatTime(this.elapsedTime);
            this.updateLapsDisplay();
            
            if (state.isRunning) {
                this.start();
            }
        }
    }
    
    async exportLaps() {
        const exportData = {
            laps: this.laps,
            totalTime: this.elapsedTime,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `stopwatch-laps-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        this.trackEvent('stopwatch_laps_exported', { lapCount: this.laps.length });
    }
    
    getStatistics() {
        if (this.laps.length === 0) {
            return null;
        }
        
        const lapTimes = this.laps.map(lap => lap.lapTime);
        const fastestLap = Math.min(...lapTimes);
        const slowestLap = Math.max(...lapTimes);
        const averageLap = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
        
        return {
            totalLaps: this.laps.length,
            fastestLap: this.formatTime(fastestLap),
            slowestLap: this.formatTime(slowestLap),
            averageLap: this.formatTime(averageLap),
            totalTime: this.formatTime(this.elapsedTime)
        };
    }
    
    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'getStopwatchState':
                sendResponse({
                    isRunning: this.isRunning,
                    elapsedTime: this.elapsedTime,
                    laps: this.laps.length
                });
                break;
                
            case 'pauseStopwatch':
                if (this.isRunning) {
                    this.pause();
                }
                break;
                
            case 'resetStopwatch':
                this.reset();
                break;
                
            case 'exportStopwatchLaps':
                this.exportLaps();
                break;
        }
    }
    
    async trackEvent(eventName, properties = {}) {
        try {
            await chrome.runtime.sendMessage({
                action: 'trackEvent',
                eventName: eventName,
                properties: properties
            });
        } catch (error) {
            console.log('Could not track event:', error);
        }
    }
    
    getKeyboardShortcuts() {
        return {
            'Space': 'Start/Pause',
            'L': 'Record Lap',
            'R': 'Reset',
            'E': 'Export Laps'
        };
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    this.toggleStartStop();
                    break;
                case 'l':
                    this.recordLap();
                    break;
                case 'r':
                    this.reset();
                    break;
                case 'e':
                    this.exportLaps();
                    break;
            }
        });
    }
}

if (typeof window !== 'undefined') {
    const stopwatch = new Stopwatch();
    stopwatch.setupKeyboardShortcuts();
}
