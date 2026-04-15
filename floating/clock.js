class FloatingClock {
    constructor() {
        this.isDragging = false;
        this.currentX = 20;
        this.currentY = 20;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;
        
        this.isExpanded = false;
        this.isMinimized = false;
        this.timerInterval = null;
        this.timerSeconds = 0;
        this.isTimerRunning = false;
        
        this.focusModeActive = false;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.loadSettings();
        this.startClock();
        this.loadQuickTasks();
    }
    
    setupElements() {
        this.clock = document.getElementById('floatingClock');
        this.dragHandle = document.querySelector('.clock-drag-handle');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.dateDisplay = document.getElementById('dateDisplay');
        this.timezoneDisplay = document.getElementById('timezoneDisplay');
        
        this.minimizeBtn = document.getElementById('minimizeClock');
        this.expandBtn = document.getElementById('expandClock');
        this.closeBtn = document.getElementById('closeClock');
        
        this.clockContent = document.querySelector('.clock-content');
        this.clockExpanded = document.getElementById('clockExpanded');
        this.clockMinimized = document.getElementById('clockMinimized');
        
        this.floatingTimerMinutes = document.getElementById('floatingTimerMinutes');
        this.floatingTimerSeconds = document.getElementById('floatingTimerSeconds');
        this.floatingStartTimer = document.getElementById('floatingStartTimer');
        this.floatingTimerDisplay = document.getElementById('floatingTimerDisplay');
        
        this.pomodoro25 = document.getElementById('pomodoro25');
        this.pomodoro50 = document.getElementById('pomodoro50');
        this.pomodoro90 = document.getElementById('pomodoro90');
        
        this.floatingFocusMode = document.getElementById('floatingFocusMode');
        this.focusStatus = document.getElementById('focusStatus');
        
        this.quickTaskList = document.getElementById('quickTaskList');
        this.addQuickTask = document.getElementById('addQuickTask');
        
        this.minimizedTime = document.getElementById('minimizedTime');
    }
    
    setupEventListeners() {
        this.dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.dragEnd());
        
        this.minimizeBtn.addEventListener('click', () => this.minimize());
        this.expandBtn.addEventListener('click', () => this.toggleExpand());
        this.closeBtn.addEventListener('click', () => this.close());
        
        this.floatingStartTimer.addEventListener('click', () => this.toggleTimer());
        this.floatingTimerMinutes.addEventListener('input', () => this.updateTimerDisplay());
        this.floatingTimerSeconds.addEventListener('input', () => this.updateTimerDisplay());
        
        this.pomodoro25.addEventListener('click', () => this.startPomodoro(25));
        this.pomodoro50.addEventListener('click', () => this.startPomodoro(50));
        this.pomodoro90.addEventListener('click', () => this.startPomodoro(90));
        
        this.floatingFocusMode.addEventListener('click', () => this.toggleFocusMode());
        this.addQuickTask.addEventListener('click', () => this.addQuickTask());
        
        this.quickTaskList.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                this.saveQuickTasks();
            }
        });
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
    }
    
    dragStart(e) {
        this.initialX = e.clientX - this.xOffset;
        this.initialY = e.clientY - this.yOffset;
        
        if (e.target === this.dragHandle) {
            this.isDragging = true;
        }
    }
    
    drag(e) {
        if (this.isDragging) {
            e.preventDefault();
            this.currentX = e.clientX - this.initialX;
            this.currentY = e.clientY - this.initialY;
            
            this.xOffset = this.currentX;
            this.yOffset = this.currentY;
            
            this.setTranslate(this.currentX, this.currentY);
        }
    }
    
    dragEnd() {
        this.initialX = this.currentX;
        this.initialY = this.currentY;
        this.isDragging = false;
        
        this.savePosition();
    }
    
    setTranslate(xPos, yPos) {
        this.clock.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
    
    minimize() {
        this.isMinimized = true;
        this.clock.classList.add('minimized');
        this.clockContent.style.display = 'none';
        this.clockMinimized.style.display = 'block';
    }
    
    toggleExpand() {
        this.isExpanded = !this.isExpanded;
        
        if (this.isExpanded) {
            this.clockExpanded.style.display = 'block';
            this.expandBtn.textContent = '−';
            this.expandBtn.title = 'Collapse';
        } else {
            this.clockExpanded.style.display = 'none';
            this.expandBtn.textContent = '□';
            this.expandBtn.title = 'Expand';
        }
    }
    
    close() {
        this.clock.style.display = 'none';
        chrome.runtime.sendMessage({
            action: 'clockClosed'
        });
    }
    
    startClock() {
        const updateTime = () => {
            const now = new Date();
            const nepalTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kathmandu"}));
            
            const timeString = nepalTime.toLocaleTimeString('en-US', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            const dateString = nepalTime.toLocaleDateString('en-US', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            this.timeDisplay.textContent = timeString;
            this.dateDisplay.textContent = dateString;
            this.minimizedTime.textContent = timeString.substring(0, 5);
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }
    
    updateTimerDisplay() {
        const minutes = parseInt(this.floatingTimerMinutes.value) || 0;
        const seconds = parseInt(this.floatingTimerSeconds.value) || 0;
        this.floatingTimerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    toggleTimer() {
        if (this.isTimerRunning) {
            this.stopTimer();
        } else {
            this.startTimer();
        }
    }
    
    startTimer() {
        const minutes = parseInt(this.floatingTimerMinutes.value) || 25;
        const seconds = parseInt(this.floatingTimerSeconds.value) || 0;
        this.timerSeconds = minutes * 60 + seconds;
        
        this.isTimerRunning = true;
        this.floatingStartTimer.textContent = 'Stop';
        this.floatingStartTimer.style.background = '#dc3545';
        
        this.timerInterval = setInterval(() => {
            this.timerSeconds--;
            if (this.timerSeconds <= 0) {
                this.stopTimer();
                this.timerComplete();
            } else {
                const mins = Math.floor(this.timerSeconds / 60);
                const secs = this.timerSeconds % 60;
                this.floatingTimerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
        this.floatingStartTimer.textContent = 'Start';
        this.floatingStartTimer.style.background = '#28a745';
        
        chrome.runtime.sendMessage({
            action: 'stopTimer'
        });
    }
    
    timerComplete() {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '../assets/icons/icon48.png',
            title: 'Timer Complete!',
            message: 'Your timer has finished. Time for a break!'
        });
        
        this.floatingTimerDisplay.textContent = '00:00';
        chrome.runtime.sendMessage({
            action: 'timerComplete'
        });
    }
    
    startPomodoro(minutes) {
        this.floatingTimerMinutes.value = minutes;
        this.floatingTimerSeconds.value = 0;
        this.updateTimerDisplay();
        
        if (!this.isTimerRunning) {
            this.startTimer();
        }
    }
    
    async toggleFocusMode() {
        if (this.focusModeActive) {
            await this.stopFocusMode();
        } else {
            await this.startFocusMode();
        }
    }
    
    async startFocusMode() {
        const focusTime = prompt('Enter focus session duration (minutes):', '25');
        if (focusTime && !isNaN(focusTime)) {
            this.focusModeActive = true;
            this.clock.classList.add('focus-active');
            this.focusStatus.textContent = 'Active';
            this.focusStatus.classList.add('active');
            this.floatingFocusMode.textContent = 'Stop Focus';
            
            chrome.runtime.sendMessage({
                action: 'startFocusMode',
                duration: parseInt(focusTime) * 60
            });
        }
    }
    
    async stopFocusMode() {
        this.focusModeActive = false;
        this.clock.classList.remove('focus-active');
        this.focusStatus.textContent = 'Not Active';
        this.focusStatus.classList.remove('active');
        this.floatingFocusMode.textContent = 'Start Focus';
        
        chrome.runtime.sendMessage({
            action: 'stopFocusMode'
        });
    }
    
    addQuickTask() {
        const taskText = prompt('Enter quick task:');
        if (taskText && taskText.trim()) {
            const taskId = Date.now().toString();
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `
                <input type="checkbox" id="quickTask${taskId}">
                <label for="quickTask${taskId}">${taskText.trim()}</label>
            `;
            
            this.quickTaskList.appendChild(taskItem);
            this.saveQuickTasks();
        }
    }
    
    async saveQuickTasks() {
        const tasks = [];
        this.quickTaskList.querySelectorAll('.task-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const label = item.querySelector('label');
            tasks.push({
                id: checkbox.id,
                text: label.textContent,
                completed: checkbox.checked
            });
        });
        
        await chrome.storage.local.set({ quickTasks: tasks });
    }
    
    async loadQuickTasks() {
        const result = await chrome.storage.local.get(['quickTasks']);
        if (result.quickTasks && result.quickTasks.length > 0) {
            this.quickTaskList.innerHTML = '';
            result.quickTasks.forEach(task => {
                const taskItem = document.createElement('div');
                taskItem.className = 'task-item';
                taskItem.innerHTML = `
                    <input type="checkbox" id="${task.id}" ${task.completed ? 'checked' : ''}>
                    <label for="${task.id}">${task.text}</label>
                `;
                this.quickTaskList.appendChild(taskItem);
            });
        }
    }
    
    async savePosition() {
        await chrome.storage.local.set({
            clockPosition: {
                x: this.currentX,
                y: this.currentY
            }
        });
    }
    
    async loadSettings() {
        const result = await chrome.storage.local.get(['settings', 'clockPosition']);
        
        const settings = result.settings || {};
        if (settings.theme) {
            this.clock.classList.add(settings.theme + '-theme');
        }
        
        if (settings.clockSize) {
            this.clock.classList.add(settings.clockSize);
        }
        
        const position = result.clockPosition || { x: 20, y: 20 };
        this.currentX = position.x;
        this.currentY = position.y;
        this.xOffset = position.x;
        this.yOffset = position.y;
        this.setTranslate(position.x, position.y);
    }
    
    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'toggleClock':
                this.toggleVisibility();
                break;
                
            case 'focusModeStarted':
                this.focusModeActive = true;
                this.clock.classList.add('focus-active');
                this.focusStatus.textContent = 'Active';
                this.focusStatus.classList.add('active');
                break;
                
            case 'focusModeStopped':
                this.focusModeActive = false;
                this.clock.classList.remove('focus-active');
                this.focusStatus.textContent = 'Not Active';
                this.focusStatus.classList.remove('active');
                break;
                
            case 'playSound':
                this.playSound(message.sound);
                break;
        }
    }
    
    toggleVisibility() {
        if (this.clock.style.display === 'none') {
            this.clock.style.display = 'block';
        } else {
            this.clock.style.display = 'none';
        }
    }
    
    playSound(soundName) {
        const audio = new Audio(`../assets/sounds/${soundName}.mp3`);
        audio.play().catch(e => console.log('Could not play sound:', e));
    }
}

if (typeof window !== 'undefined') {
    new FloatingClock();
}
