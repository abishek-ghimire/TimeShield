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
            dataRetentionDays: 90
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
        return Array.isArray(result.blockedSites) ? result.blockedSites : [];
    }

    static async saveBlockedSites(sites) {
        await this.set({ blockedSites: sites });
        return sites;
    }

    static getDefaultBlockedSites() {
        return [];
    }

    static async getWhitelist() {
        const result = await this.get('whitelist');
        return result.whitelist || [];
    }

    static async saveWhitelist(sites) {
        await this.set({ whitelist: sites });
        return sites;
    }


    static async exportData() {
        const data = await this.get([
            'settings',
            'todos',
            'blockedSites',
            'whitelist',
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

        const result = await this.get(['blockedAttempts', 'emergencyOverrides']);

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
