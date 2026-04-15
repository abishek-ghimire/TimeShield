class TimeManager {
    static getTimezones() {
        return [
            { id: 'npt', name: 'Nepal Time', offset: '+5:45', timezone: 'Asia/Kathmandu' },
            { id: 'utc', name: 'UTC', offset: '+0:00', timezone: 'UTC' },
            { id: 'est', name: 'Eastern Time', offset: '-5:00', timezone: 'America/New_York' },
            { id: 'pst', name: 'Pacific Time', offset: '-8:00', timezone: 'America/Los_Angeles' },
            { id: 'gmt', name: 'GMT', offset: '+0:00', timezone: 'GMT' },
            { id: 'cet', name: 'Central European', offset: '+1:00', timezone: 'Europe/Paris' },
            { id: 'jst', name: 'Japan Time', offset: '+9:00', timezone: 'Asia/Tokyo' },
            { id: 'aest', name: 'Australian Eastern', offset: '+10:00', timezone: 'Australia/Sydney' }
        ];
    }
    
    static getCurrentTime(timezone = 'Asia/Kathmandu') {
        const now = new Date();
        return new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    }
    
    static formatTime(date, options = {}) {
        const defaults = {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        
        const formatOptions = { ...defaults, ...options };
        return date.toLocaleTimeString('en-US', formatOptions);
    }
    
    static formatDate(date, options = {}) {
        const defaults = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        
        const formatOptions = { ...defaults, ...options };
        return date.toLocaleDateString('en-US', formatOptions);
    }
    
    static formatDateTime(date, options = {}) {
        const defaults = {
            dateStyle: 'medium',
            timeStyle: 'medium',
            hour12: false
        };
        
        const formatOptions = { ...defaults, ...options };
        return date.toLocaleString('en-US', formatOptions);
    }
    
    static formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }
    
    static formatDurationShort(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    static formatDurationHuman(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            if (minutes > 0) {
                return `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else {
                return `${hours} hour${hours > 1 ? 's' : ''}`;
            }
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else {
            return 'less than a minute';
        }
    }
    
    static parseDuration(durationString) {
        const regex = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
        const match = durationString.match(regex);
        
        if (!match) return 0;
        
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    static getStartOfDay(date = new Date()) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        return start;
    }
    
    static getEndOfDay(date = new Date()) {
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return end;
    }
    
    static getStartOfWeek(date = new Date()) {
        const start = new Date(date);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        return start;
    }
    
    static getEndOfWeek(date = new Date()) {
        const end = this.getStartOfWeek(date);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return end;
    }
    
    static getStartOfMonth(date = new Date()) {
        const start = new Date(date);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return start;
    }
    
    static getEndOfMonth(date = new Date()) {
        const end = new Date(date);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        return end;
    }
    
    static isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }
    
    static isYesterday(date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return date.toDateString() === yesterday.toDateString();
    }
    
    static isThisWeek(date) {
        const start = this.getStartOfWeek();
        const end = this.getEndOfWeek();
        return date >= start && date <= end;
    }
    
    static isThisMonth(date) {
        const start = this.getStartOfMonth();
        const end = this.getEndOfMonth();
        return date >= start && date <= end;
    }
    
    static getRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 7) {
            return this.formatDate(date, { month: 'short', day: 'numeric' });
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'just now';
        }
    }
    
    static getTimeUntil(targetDate) {
        const now = new Date();
        const diff = targetDate - now;
        
        if (diff <= 0) {
            return { expired: true, seconds: 0 };
        }
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        return {
            expired: false,
            seconds: seconds % 60,
            minutes: minutes % 60,
            hours: hours % 24,
            days: days,
            totalSeconds: seconds
        };
    }
    
    static addTime(date, amount, unit) {
        const result = new Date(date);
        
        switch (unit) {
            case 'seconds':
                result.setSeconds(result.getSeconds() + amount);
                break;
            case 'minutes':
                result.setMinutes(result.getMinutes() + amount);
                break;
            case 'hours':
                result.setHours(result.getHours() + amount);
                break;
            case 'days':
                result.setDate(result.getDate() + amount);
                break;
            case 'weeks':
                result.setDate(result.getDate() + (amount * 7));
                break;
            case 'months':
                result.setMonth(result.getMonth() + amount);
                break;
            case 'years':
                result.setFullYear(result.getFullYear() + amount);
                break;
        }
        
        return result;
    }
    
    static getWorkingDays(startDate, endDate) {
        let workingDays = 0;
        const current = new Date(startDate);
        
        while (current <= endDate) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workingDays++;
            }
            current.setDate(current.getDate() + 1);
        }
        
        return workingDays;
    }
    
    static getBusinessHours(startDate, endDate, startHour = 9, endHour = 17) {
        let businessSeconds = 0;
        const current = new Date(startDate);
        
        while (current <= endDate) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const currentHour = current.getHours();
                if (currentHour >= startHour && currentHour < endHour) {
                    businessSeconds += 3600;
                }
            }
            current.setHours(current.getHours() + 1);
        }
        
        return businessSeconds;
    }
    
    static createCountdown(targetDate, onTick, onComplete) {
        const interval = setInterval(() => {
            const timeUntil = this.getTimeUntil(targetDate);
            
            if (timeUntil.expired) {
                clearInterval(interval);
                if (onComplete) onComplete();
            } else {
                if (onTick) onTick(timeUntil);
            }
        }, 1000);
        
        return interval;
    }
    
    static validateTimezone(timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: timezone });
            return true;
        } catch (e) {
            return false;
        }
    }
    
    static getTimezoneOffset(timezone) {
        try {
            const now = new Date();
            const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
            const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
            const offset = (tzDate - utcDate) / (1000 * 60 * 60);
            return offset;
        } catch (e) {
            return 0;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeManager;
}
