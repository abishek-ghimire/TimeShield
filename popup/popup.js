class PopupController {
    constructor() {
        this.currentTime = document.getElementById('currentTime');
        this.timerDisplay = document.getElementById('timerDisplay');
        this.timerMinutes = document.getElementById('timerMinutes');
        this.timerSeconds = document.getElementById('timerSeconds');
        this.focusTime = document.getElementById('focusTime');
        this.tasksCompleted = document.getElementById('tasksCompleted');
        this.sessionsCompleted = document.getElementById('sessionsCompleted');
        this.todoList = document.getElementById('todoList');
        
        // Ad blocker elements
        this.adsBlocked = document.getElementById('adsBlocked');
        this.bandwidthSaved = document.getElementById('bandwidthSaved');
        this.timeSaved = document.getElementById('timeSaved');
        
        this.timerInterval = null;
        this.timeInterval = null;
        this.timerSeconds = 0;
        this.isTimerRunning = false;
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.startClock();
        await this.loadSettings();
        await this.loadTodayStats();
        await this.loadTodos();
        await this.restoreTimerState();
        await this.loadAdBlockStats(); // NEW
    }
    
    async loadAdBlockStats() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAdStats' });
            if (response) {
                this.adsBlocked.textContent = this.formatNumber(response.adsBlocked);
                this.bandwidthSaved.textContent = response.bandwidthSaved;
                this.timeSaved.textContent = response.timeSaved;
            }
        } catch (error) {
            console.error('Failed to load ad block stats:', error);
        }
    }
    
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }
    
    async restoreTimerState() {
        const result = await chrome.storage.local.get(['timerState', 'focusState']);
        
        // Restore timer state
        if (result.timerState && result.timerState.isRunning) {
            this.timerSeconds = Math.floor((Date.now() - result.timerState.startTime) / 1000);
            this.isTimerRunning = true;
            this.startTimerInterval();
            document.getElementById('startTimer').textContent = 'Stop Timer';
        }
        
        // Restore focus state
        if (result.focusState && result.focusState.isActive) {
            document.getElementById('startFocus').textContent = 'Stop Focus';
        }
    }
    
    setupEventListeners() {
        document.getElementById('toggleClock').addEventListener('click', () => this.toggleFloatingClock());
        document.getElementById('startFocus').addEventListener('click', () => this.toggleFocusMode());
        document.getElementById('openSettings').addEventListener('click', () => this.openSettings());
        document.getElementById('startTimer').addEventListener('click', () => this.toggleTimer());
        document.getElementById('addTask').addEventListener('click', () => this.addTask());
        
        // NEW: Ad blocker event listeners
        document.getElementById('blockElement').addEventListener('click', () => this.startElementPicker());
        document.getElementById('updateFilters').addEventListener('click', () => this.updateFilters());
        
        this.timerMinutes.addEventListener('input', () => this.updateTimerDisplay());
        
        document.querySelectorAll('#todoList input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.toggleTask(e.target));
        });
    }
    
    async startElementPicker() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { action: 'startElementPicker' });
            window.close(); // Close popup
        } catch (error) {
            console.error('Failed to start element picker:', error);
        }
    }
    
    async updateFilters() {
        const btn = document.getElementById('updateFilters');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Updating...';
        btn.disabled = true;
        
        try {
            await chrome.runtime.sendMessage({ action: 'updateFilters' });
            btn.textContent = '✅ Updated!';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (error) {
            btn.textContent = '❌ Error';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }
    
    async toggleFocusMode() {
        const result = await chrome.storage.local.get(['focusState']);
        const focusState = result.focusState || { isActive: false };
        
        if (focusState.isActive) {
            await this.stopFocusMode();
        } else {
            await this.startFocusMode();
        }
    }
    
    startClock() {
        const updateTime = () => {
            const now = new Date();
            this.currentTime.textContent = now.toLocaleTimeString('en-US', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        };
        
        updateTime();
        this.timeInterval = setInterval(updateTime, 1000);
    }
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.timerSeconds / 60);
        const seconds = this.timerSeconds % 60;
        this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update input fields to match display
        if (this.timerMinutes) {
            this.timerMinutes.value = minutes;
        }
        if (this.timerSeconds) {
            this.timerSeconds.value = seconds;
        }
    }
    
    toggleTimer() {
        if (this.isTimerRunning) {
            this.stopTimer();
        } else {
            const minutes = parseInt(this.timerMinutes.value) || 25;
            this.startTimer(minutes * 60);
        }
    }
    
    startTimer(duration) {
        this.timerSeconds = duration;
        this.isTimerRunning = true;
        
        // Start timer in background service worker
        chrome.runtime.sendMessage({
            action: 'startTimer',
            duration: duration
        });
        
        document.getElementById('startTimer').textContent = 'Stop Timer';
        this.startTimerInterval();
    }
    
    startTimerInterval() {
        this.timerInterval = setInterval(() => {
            if (this.timerSeconds > 0) {
                this.timerSeconds--;
                this.updateTimerDisplay();
            } else {
                this.timerComplete();
            }
        }, 1000);
    }
    
    stopTimer() {
        this.isTimerRunning = false;
        clearInterval(this.timerInterval);
        document.getElementById('startTimer').textContent = 'Start';
        document.getElementById('startTimer').style.background = '#28a745';
        
        chrome.runtime.sendMessage({
            action: 'stopTimer'
        });
    }
    
    timerComplete() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Timer Complete!',
            message: 'Your timer has finished. Time for a break!'
        });
        
        this.timerDisplay.textContent = '00:00';
        chrome.runtime.sendMessage({
            action: 'timerComplete'
        });
    }
    
    async toggleFloatingClock() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'toggleClock'
            });
            
            if (response && response.success) {
                this.showNotification('Clock toggled successfully', 'success');
            }
        } catch (error) {
            console.error('Error toggling clock:', error);
            this.showNotification('Error toggling clock', 'error');
        }
    }
    
    async startFocusMode() {
        const focusTime = prompt('Enter focus session duration (minutes):', '25');
        if (focusTime && !isNaN(focusTime)) {
            chrome.runtime.sendMessage({
                action: 'startFocusMode',
                duration: parseInt(focusTime) * 60
            });
            
            document.getElementById('startFocus').textContent = 'Stop Focus';
            window.close();
        }
    }
    
    async stopFocusMode() {
        chrome.runtime.sendMessage({
            action: 'stopFocusMode'
        });
        
        document.getElementById('startFocus').textContent = 'Start Focus';
    }
    
    openSettings() {
        chrome.runtime.openOptionsPage();
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
    
    async addTask() {
        const taskText = prompt('Enter new task:');
        if (taskText && taskText.trim()) {
            const taskId = Date.now().toString();
            const todoItem = document.createElement('div');
            todoItem.className = 'todo-item';
            todoItem.innerHTML = `
                <input type="checkbox" id="task${taskId}">
                <label for="task${taskId}">${taskText.trim()}</label>
            `;
            
            todoItem.querySelector('input').addEventListener('change', (e) => this.toggleTask(e.target));
            this.todoList.appendChild(todoItem);
            
            await this.saveTodos();
        }
    }
    
    async toggleTask(checkbox) {
        await this.saveTodos();
        await this.updateTaskStats();
    }
    
    async saveTodos() {
        const todos = [];
        document.querySelectorAll('.todo-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const label = item.querySelector('label');
            todos.push({
                id: checkbox.id,
                text: label.textContent,
                completed: checkbox.checked
            });
        });
        
        await chrome.storage.local.set({ 
            todos: todos,
            lastUpdated: new Date().toISOString()
        });
    }
    
    async loadTodos() {
        const result = await chrome.storage.local.get(['todos']);
        if (result.todos && result.todos.length > 0) {
            this.todoList.innerHTML = '';
            result.todos.forEach(todo => {
                const todoItem = document.createElement('div');
                todoItem.className = 'todo-item';
                todoItem.innerHTML = `
                    <input type="checkbox" id="${todo.id}" ${todo.completed ? 'checked' : ''}>
                    <label for="${todo.id}">${todo.text}</label>
                `;
                
                todoItem.querySelector('input').addEventListener('change', (e) => this.toggleTask(e.target));
                this.todoList.appendChild(todoItem);
            });
        }
    }
    
    async updateTaskStats() {
        const checkboxes = document.querySelectorAll('#todoList input[type="checkbox"]');
        const completed = Array.from(checkboxes).filter(cb => cb.checked).length;
        this.tasksCompleted.textContent = completed;
    }
    
    async loadTodayStats() {
        const result = await chrome.storage.local.get(['todayStats']);
        const stats = result.todayStats || {
            focusTime: 0,
            tasksCompleted: 0,
            sessionsCompleted: 0,
            date: new Date().toDateString()
        };
        
        const today = new Date().toDateString();
        if (stats.date !== today) {
            stats.focusTime = 0;
            stats.tasksCompleted = 0;
            stats.sessionsCompleted = 0;
            stats.date = today;
        }
        
        this.focusTime.textContent = this.formatTime(stats.focusTime);
        this.tasksCompleted.textContent = stats.tasksCompleted;
        this.sessionsCompleted.textContent = stats.sessionsCompleted;
    }
    
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
    
    async loadSettings() {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {
            theme: 'default',
            soundEnabled: true,
            notificationsEnabled: true
        };
        
        document.body.className = settings.theme || '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
