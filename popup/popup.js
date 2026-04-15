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
    }
    
    setupEventListeners() {
        document.getElementById('toggleClock').addEventListener('click', () => this.toggleFloatingClock());
        document.getElementById('startFocus').addEventListener('click', () => this.startFocusMode());
        document.getElementById('openSettings').addEventListener('click', () => this.openSettings());
        document.getElementById('startTimer').addEventListener('click', () => this.toggleTimer());
        document.getElementById('addTask').addEventListener('click', () => this.addTask());
        
        this.timerMinutes.addEventListener('input', () => this.updateTimerDisplay());
        this.timerSeconds.addEventListener('input', () => this.updateTimerDisplay());
        
        document.querySelectorAll('#todoList input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.toggleTask(e.target));
        });
    }
    
    startClock() {
        const updateTime = () => {
            const now = new Date();
            const nepalTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kathmandu"}));
            this.currentTime.textContent = nepalTime.toLocaleTimeString('en-US', { 
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
        const minutes = parseInt(this.timerMinutes.value) || 0;
        const seconds = parseInt(this.timerSeconds.value) || 0;
        this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    toggleTimer() {
        if (this.isTimerRunning) {
            this.stopTimer();
        } else {
            this.startTimer();
        }
    }
    
    startTimer() {
        const minutes = parseInt(this.timerMinutes.value) || 25;
        const seconds = parseInt(this.timerSeconds.value) || 0;
        this.timerSeconds = minutes * 60 + seconds;
        
        this.isTimerRunning = true;
        document.getElementById('startTimer').textContent = 'Stop';
        document.getElementById('startTimer').style.background = '#dc3545';
        
        this.timerInterval = setInterval(() => {
            this.timerSeconds--;
            if (this.timerSeconds <= 0) {
                this.stopTimer();
                this.timerComplete();
            } else {
                const mins = Math.floor(this.timerSeconds / 60);
                const secs = this.timerSeconds % 60;
                this.timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
        
        chrome.runtime.sendMessage({
            action: 'startTimer',
            duration: this.timerSeconds
        });
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
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.tabs.sendMessage(tab.id, {
            action: 'toggleClock'
        });
    }
    
    async startFocusMode() {
        const focusTime = prompt('Enter focus session duration (minutes):', '25');
        if (focusTime && !isNaN(focusTime)) {
            chrome.runtime.sendMessage({
                action: 'startFocusMode',
                duration: parseInt(focusTime) * 60
            });
            
            window.close();
        }
    }
    
    openSettings() {
        chrome.runtime.openOptionsPage();
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
