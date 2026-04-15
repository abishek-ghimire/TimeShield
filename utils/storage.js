class StorageManager {
    static async get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => {
                resolve(result);
            });
        });
    }
    
    static async set(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        });
    }
    
    static async remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                resolve();
            });
        });
    }
    
    static async clear() {
        return new Promise((resolve) => {
            chrome.storage.local.clear(() => {
                resolve();
            });
        });
    }
    
    static async getSettings() {
        const result = await this.get('settings');
        return result.settings || this.getDefaultSettings();
    }
    
    static async saveSettings(settings) {
        const currentSettings = await this.getSettings();
        const updatedSettings = { ...currentSettings, ...settings };
        await this.set({ settings: updatedSettings });
        return updatedSettings;
    }
    
    static getDefaultSettings() {
        return {
            theme: 'default',
            soundEnabled: true,
            notificationsEnabled: true,
            breakReminders: true,
            clockStyle: 'digital',
            clockPosition: { x: 20, y: 20 },
            clockSize: 'medium',
            opacity: 95,
            showSeconds: true,
            showDate: true,
            showTimezone: true,
            autoStartFocus: false,
            focusDuration: 25,
            breakDuration: 5,
            longBreakDuration: 15,
            pomodoroCount: 4,
            taskReminders: true,
            analyticsEnabled: true,
            dataRetentionDays: 90
        };
    }
    
    static async getTodayStats() {
        const result = await this.get('todayStats');
        const stats = result.todayStats || this.getDefaultTodayStats();
        
        const today = new Date().toDateString();
        if (stats.date !== today) {
            await this.set({ todayStats: this.getDefaultTodayStats() });
            return this.getDefaultTodayStats();
        }
        
        return stats;
    }
    
    static async updateTodayStats(updates) {
        const stats = await this.getTodayStats();
        const updatedStats = { ...stats, ...updates };
        await this.set({ todayStats: updatedStats });
        return updatedStats;
    }
    
    static getDefaultTodayStats() {
        return {
            date: new Date().toDateString(),
            focusTime: 0,
            tasksCompleted: 0,
            sessionsCompleted: 0,
            blockedAttempts: 0,
            interruptions: 0,
            productivityScore: 0,
            bestFocusStreak: 0,
            currentFocusStreak: 0
        };
    }
    
    static async getTodos() {
        const result = await this.get('todos');
        return result.todos || [];
    }
    
    static async saveTodos(todos) {
        await this.set({ 
            todos: todos,
            todosLastUpdated: new Date().toISOString()
        });
        return todos;
    }
    
    static async addTodo(todo) {
        const todos = await this.getTodos();
        const newTodo = {
            id: Date.now().toString(),
            text: todo.text,
            completed: false,
            priority: todo.priority || 'medium',
            createdAt: new Date().toISOString(),
            dueDate: todo.dueDate || null,
            estimatedTime: todo.estimatedTime || 0,
            actualTime: 0,
            tags: todo.tags || [],
            subtasks: todo.subtasks || []
        };
        
        todos.push(newTodo);
        await this.saveTodos(todos);
        return newTodo;
    }
    
    static async updateTodo(todoId, updates) {
        const todos = await this.getTodos();
        const todoIndex = todos.findIndex(todo => todo.id === todoId);
        
        if (todoIndex !== -1) {
            todos[todoIndex] = { ...todos[todoIndex], ...updates };
            await this.saveTodos(todos);
            return todos[todoIndex];
        }
        
        return null;
    }
    
    static async deleteTodo(todoId) {
        const todos = await this.getTodos();
        const filteredTodos = todos.filter(todo => todo.id !== todoId);
        await this.saveTodos(filteredTodos);
        return filteredTodos;
    }
    
    static async getBlockedSites() {
        const result = await this.get('blockedSites');
        return result.blockedSites || this.getDefaultBlockedSites();
    }
    
    static async saveBlockedSites(sites) {
        await this.set({ blockedSites: sites });
        return sites;
    }
    
    static getDefaultBlockedSites() {
        return [
            'facebook.com',
            'twitter.com',
            'instagram.com',
            'youtube.com',
            'reddit.com',
            'netflix.com',
            'tiktok.com',
            'linkedin.com',
            'pinterest.com',
            'snapchat.com'
        ];
    }
    
    static async getWhitelist() {
        const result = await this.get('whitelist');
        return result.whitelist || [];
    }
    
    static async saveWhitelist(sites) {
        await this.set({ whitelist: sites });
        return sites;
    }
    
    static async getAnalyticsData(days = 30) {
        const result = await this.get('analyticsData');
        const data = result.analyticsData || {};
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const filteredData = {};
        Object.keys(data).forEach(date => {
            if (new Date(date) >= cutoffDate) {
                filteredData[date] = data[date];
            }
        });
        
        return filteredData;
    }
    
    static async saveAnalyticsData(date, data) {
        const result = await this.get('analyticsData');
        const analyticsData = result.analyticsData || {};
        
        analyticsData[date] = {
            ...analyticsData[date],
            ...data,
            lastUpdated: new Date().toISOString()
        };
        
        await this.set({ analyticsData: analyticsData });
        return analyticsData;
    }
    
    static async exportData() {
        const data = await this.get([
            'settings',
            'todos',
            'blockedSites',
            'whitelist',
            'todayStats',
            'analyticsData',
            'quickTasks',
            'emergencyOverrides',
            'blockedAttempts'
        ]);
        
        return {
            exportDate: new Date().toISOString(),
            version: '1.0.0',
            data: data
        };
    }
    
    static async importData(importData) {
        try {
            const data = importData.data;
            await this.set(data);
            return { success: true, message: 'Data imported successfully' };
        } catch (error) {
            return { success: false, message: 'Failed to import data: ' + error.message };
        }
    }
    
    static async cleanupOldData() {
        const settings = await this.getSettings();
        const retentionDays = settings.dataRetentionDays || 90;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        const result = await this.get(['analyticsData', 'blockedAttempts', 'emergencyOverrides']);
        
        if (result.analyticsData) {
            const filteredAnalytics = {};
            Object.keys(result.analyticsData).forEach(date => {
                if (new Date(date) >= cutoffDate) {
                    filteredAnalytics[date] = result.analyticsData[date];
                }
            });
            await this.set({ analyticsData: filteredAnalytics });
        }
        
        if (result.blockedAttempts) {
            const filteredAttempts = result.blockedAttempts.filter(attempt => 
                new Date(attempt.timestamp) >= cutoffDate
            );
            await this.set({ blockedAttempts: filteredAttempts });
        }
        
        if (result.emergencyOverrides) {
            const filteredOverrides = result.emergencyOverrides.filter(override => 
                new Date(override.timestamp) >= cutoffDate
            );
            await this.set({ emergencyOverrides: filteredOverrides });
        }
    }
    
    static async getStorageUsage() {
        return new Promise((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                resolve(bytesInUse);
            });
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
