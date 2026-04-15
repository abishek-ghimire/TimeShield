class AnalyticsManager {
    static async trackEvent(eventName, properties = {}) {
        const settings = await StorageManager.getSettings();
        if (!settings.analyticsEnabled) return;
        
        const event = {
            name: eventName,
            properties: properties,
            timestamp: new Date().toISOString(),
            sessionId: await this.getSessionId(),
            userAgent: navigator.userAgent,
            url: window.location?.href || 'extension'
        };
        
        await this.saveEvent(event);
    }
    
    static async getSessionId() {
        const result = await StorageManager.get('sessionId');
        if (result.sessionId) {
            return result.sessionId;
        }
        
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await StorageManager.set({ sessionId: sessionId });
        return sessionId;
    }
    
    static async saveEvent(event) {
        const today = new Date().toDateString();
        const analyticsData = await StorageManager.getAnalyticsData();
        
        if (!analyticsData[today]) {
            analyticsData[today] = {
                events: [],
                metrics: this.getDefaultMetrics()
            };
        }
        
        analyticsData[today].events.push(event);
        await this.updateMetrics(analyticsData[today], event);
        await StorageManager.saveAnalyticsData(today, analyticsData[today]);
    }
    
    static getDefaultMetrics() {
        return {
            totalFocusTime: 0,
            totalSessions: 0,
            totalTasksCompleted: 0,
            totalBlockedAttempts: 0,
            totalInterruptions: 0,
            averageSessionLength: 0,
            longestSession: 0,
            productivityScore: 0,
            mostProductiveHour: 0,
            mostProductiveDay: 0,
            focusStreak: 0,
            longestStreak: 0,
            taskCompletionRate: 0,
            distractionRate: 0,
            breakCompliance: 0
        };
    }
    
    static async updateMetrics(dayData, event) {
        const metrics = dayData.metrics;
        
        switch (event.name) {
            case 'focus_session_started':
                metrics.totalSessions++;
                break;
                
            case 'focus_session_completed':
                const duration = event.properties.duration || 0;
                metrics.totalFocusTime += duration;
                metrics.averageSessionLength = metrics.totalFocusTime / metrics.totalSessions;
                
                if (duration > metrics.longestSession) {
                    metrics.longestSession = duration;
                }
                
                metrics.focusStreak++;
                if (metrics.focusStreak > metrics.longestStreak) {
                    metrics.longestStreak = metrics.focusStreak;
                }
                break;
                
            case 'focus_session_abandoned':
                metrics.focusStreak = 0;
                break;
                
            case 'task_completed':
                metrics.totalTasksCompleted++;
                break;
                
            case 'site_blocked':
                metrics.totalBlockedAttempts++;
                break;
                
            case 'interruption':
                metrics.totalInterruptions++;
                break;
                
            case 'break_taken':
                metrics.breakCompliance = this.calculateBreakCompliance(dayData.events);
                break;
        }
        
        metrics.productivityScore = this.calculateProductivityScore(metrics);
        metrics.taskCompletionRate = this.calculateTaskCompletionRate(dayData.events);
        metrics.distractionRate = this.calculateDistractionRate(metrics);
        metrics.mostProductiveHour = this.getMostProductiveHour(dayData.events);
        metrics.mostProductiveDay = this.getMostProductiveDay(dayData.events);
    }
    
    static calculateProductivityScore(metrics) {
        let score = 0;
        
        score += Math.min(metrics.totalFocusTime / 3600 * 10, 40);
        score += Math.min(metrics.totalSessions * 2, 20);
        score += Math.min(metrics.totalTasksCompleted * 3, 20);
        score += Math.min(metrics.focusStreak * 2, 10);
        score += Math.max(10 - metrics.totalInterruptions, 0);
        
        return Math.round(Math.min(score, 100));
    }
    
    static calculateTaskCompletionRate(events) {
        const tasksCreated = events.filter(e => e.name === 'task_created').length;
        const tasksCompleted = events.filter(e => e.name === 'task_completed').length;
        
        if (tasksCreated === 0) return 0;
        return Math.round((tasksCompleted / tasksCreated) * 100);
    }
    
    static calculateDistractionRate(metrics) {
        const totalInteractions = metrics.totalSessions + metrics.totalTasksCompleted;
        if (totalInteractions === 0) return 0;
        
        return Math.round((metrics.totalBlockedAttempts / totalInteractions) * 100);
    }
    
    static calculateBreakCompliance(events) {
        const focusSessions = events.filter(e => e.name === 'focus_session_completed');
        const breaksTaken = events.filter(e => e.name === 'break_taken');
        
        if (focusSessions.length === 0) return 0;
        return Math.round((breaksTaken.length / focusSessions.length) * 100);
    }
    
    static getMostProductiveHour(events) {
        const hourCounts = {};
        
        events.filter(e => e.name === 'focus_session_completed').forEach(event => {
            const hour = new Date(event.timestamp).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        
        let maxHour = 0;
        let maxCount = 0;
        
        Object.keys(hourCounts).forEach(hour => {
            if (hourCounts[hour] > maxCount) {
                maxCount = hourCounts[hour];
                maxHour = parseInt(hour);
            }
        });
        
        return maxHour;
    }
    
    static getMostProductiveDay(events) {
        const dayCounts = {};
        
        events.filter(e => e.name === 'focus_session_completed').forEach(event => {
            const day = new Date(event.timestamp).getDay();
            dayCounts[day] = (dayCounts[day] || 0) + 1;
        });
        
        let maxDay = 0;
        let maxCount = 0;
        
        Object.keys(dayCounts).forEach(day => {
            if (dayCounts[day] > maxCount) {
                maxCount = dayCounts[day];
                maxDay = parseInt(day);
            }
        });
        
        return maxDay;
    }
    
    static async getAnalyticsReport(days = 30) {
        const data = await StorageManager.getAnalyticsData(days);
        const report = {
            period: days,
            startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toDateString(),
            endDate: new Date().toDateString(),
            summary: this.generateSummary(data),
            dailyBreakdown: this.generateDailyBreakdown(data),
            trends: this.generateTrends(data),
            insights: this.generateInsights(data),
            recommendations: this.generateRecommendations(data)
        };
        
        return report;
    }
    
    static generateSummary(data) {
        let totalFocusTime = 0;
        let totalSessions = 0;
        let totalTasks = 0;
        let totalBlocks = 0;
        let productivityScores = [];
        
        Object.values(data).forEach(dayData => {
            const metrics = dayData.metrics;
            totalFocusTime += metrics.totalFocusTime;
            totalSessions += metrics.totalSessions;
            totalTasks += metrics.totalTasksCompleted;
            totalBlocks += metrics.totalBlockedAttempts;
            productivityScores.push(metrics.productivityScore);
        });
        
        const avgProductivity = productivityScores.length > 0 
            ? Math.round(productivityScores.reduce((a, b) => a + b, 0) / productivityScores.length)
            : 0;
        
        return {
            totalFocusTime: totalFocusTime,
            totalSessions: totalSessions,
            totalTasksCompleted: totalTasks,
            totalBlockedAttempts: totalBlocks,
            averageProductivityScore: avgProductivity,
            averageSessionLength: totalSessions > 0 ? Math.round(totalFocusTime / totalSessions) : 0,
            activeDays: Object.keys(data).length
        };
    }
    
    static generateDailyBreakdown(data) {
        return Object.keys(data).map(date => ({
            date: date,
            metrics: data[date].metrics,
            events: data[date].events.length
        })).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    static generateTrends(data) {
        const dates = Object.keys(data).sort();
        const focusTimeTrend = dates.map(date => data[date].metrics.totalFocusTime);
        const productivityTrend = dates.map(date => data[date].metrics.productivityScore);
        const sessionsTrend = dates.map(date => data[date].metrics.totalSessions);
        
        return {
            focusTime: this.calculateTrend(focusTimeTrend),
            productivity: this.calculateTrend(productivityTrend),
            sessions: this.calculateTrend(sessionsTrend)
        };
    }
    
    static calculateTrend(values) {
        if (values.length < 2) return 'stable';
        
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        const change = ((secondAvg - firstAvg) / firstAvg) * 100;
        
        if (change > 10) return 'improving';
        if (change < -10) return 'declining';
        return 'stable';
    }
    
    static generateInsights(data) {
        const insights = [];
        const summary = this.generateSummary(data);
        
        if (summary.averageProductivityScore > 80) {
            insights.push({
                type: 'positive',
                title: 'High Productivity',
                description: `Your average productivity score of ${summary.averageProductivityScore} is excellent!`
            });
        }
        
        if (summary.averageSessionLength > 1800) {
            insights.push({
                type: 'positive',
                title: 'Great Focus',
                description: 'Your average focus session is over 30 minutes. Great concentration!'
            });
        }
        
        if (summary.totalBlockedAttempts > summary.totalSessions * 2) {
            insights.push({
                type: 'warning',
                title: 'High Distraction Rate',
                description: 'You might want to consider adjusting your blocklist or focus duration.'
            });
        }
        
        const mostProductiveHour = this.getMostProductiveHourFromData(data);
        if (mostProductiveHour !== null) {
            insights.push({
                type: 'info',
                title: 'Peak Productivity Time',
                description: `Your most productive hour is ${mostProductiveHour}:00. Schedule important tasks during this time.`
            });
        }
        
        return insights;
    }
    
    static getMostProductiveHourFromData(data) {
        const hourCounts = {};
        
        Object.values(data).forEach(dayData => {
            dayData.events.filter(e => e.name === 'focus_session_completed').forEach(event => {
                const hour = new Date(event.timestamp).getHours();
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            });
        });
        
        let maxHour = null;
        let maxCount = 0;
        
        Object.keys(hourCounts).forEach(hour => {
            if (hourCounts[hour] > maxCount) {
                maxCount = hourCounts[hour];
                maxHour = parseInt(hour);
            }
        });
        
        return maxHour;
    }
    
    static generateRecommendations(data) {
        const recommendations = [];
        const summary = this.generateSummary(data);
        
        if (summary.averageSessionLength < 900) {
            recommendations.push({
                type: 'focus',
                title: 'Short Sessions',
                description: 'Your focus sessions are quite short. Try gradually increasing session duration.',
                action: 'Set a goal to complete 30-minute sessions'
            });
        }
        
        if (summary.totalTasksCompleted < summary.totalSessions) {
            recommendations.push({
                type: 'tasks',
                title: 'Task Alignment',
                description: 'Consider aligning your focus sessions with specific tasks.',
                action: 'Create tasks before starting focus sessions'
            });
        }
        
        if (summary.totalBlockedAttempts > summary.totalSessions * 3) {
            recommendations.push({
                type: 'distractions',
                title: 'Too Many Distractions',
                description: 'You might benefit from a stricter blocklist or different work environment.',
                action: 'Review and update your blocked sites list'
            });
        }
        
        return recommendations;
    }
    
    static async exportAnalytics(format = 'json') {
        const data = await StorageManager.getAnalyticsData();
        
        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);
                
            case 'csv':
                return this.convertToCSV(data);
                
            default:
                return data;
        }
    }
    
    static convertToCSV(data) {
        const headers = [
            'Date', 'Focus Time (seconds)', 'Sessions', 'Tasks Completed',
            'Blocked Attempts', 'Productivity Score', 'Average Session Length'
        ];
        
        const rows = Object.keys(data).map(date => {
            const metrics = data[date].metrics;
            return [
                date,
                metrics.totalFocusTime,
                metrics.totalSessions,
                metrics.totalTasksCompleted,
                metrics.totalBlockedAttempts,
                metrics.productivityScore,
                metrics.averageSessionLength
            ];
        });
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsManager;
}
