# Floating Productivity Clock Chrome Extension

A comprehensive Chrome extension featuring a floating, customizable clock designed to maximize productivity through time management, focus sessions, and distraction blocking.

## Features

### 🕐 Floating Clock Interface
- **Always-on-top floating widget** that stays visible across all tabs
- **Draggable positioning** - move the clock anywhere on screen
- **Resizable interface** - adjustable from compact to expanded dashboard
- **Customizable appearance**:
  - Multiple clock faces (digital, analog, minimalist)
  - Color themes (dark mode, light mode, custom palettes)
  - Opacity control (10-100%)
  - Font selection and size adjustment
- **Nepal time display** (NPT - UTC+5:45) with automatic timezone accuracy

### ⏱️ Timer & Stopwatch
- **Pomodoro Timer**:
  - Preset intervals (25/5, 50/10, 90/20 minutes)
  - Custom time settings
  - Auto-start breaks
  - Session counter tracking
- **Custom Timer**:
  - Set any duration (seconds to hours)
  - Multiple simultaneous timers with labels
  - Repeat/loop functionality
- **Stopwatch**:
  - Lap time recording
  - Split time tracking
  - Export lap times
- **Sound Notifications**:
  - Multiple alarm sounds
  - Volume control
  - Visual flash notifications

### 🎯 Focus Mode (Deep Work Sessions)
- **Website Blocking**:
  - Pre-session site blocklist creation
  - Quick-add common distractions
  - Custom URL blocking
  - Whitelist for necessary sites
  - Block enforcement with motivational redirect page
- **Focus Session Management**:
  - Name and categorize focus sessions
  - Set session duration with goals
  - Track focus streaks
  - Break reminders with suggestions
- **Distraction Analytics**:
  - Track blocked access attempts
  - Identify most distracting sites
  - Show distraction patterns by time of day

### ✅ Integrated To-Do List
- **Task Management**:
  - Create tasks with descriptions and priorities
  - Assign tasks to specific focus sessions
  - Set task duration estimates
  - Subtask support for complex projects
- **Time Tracking**:
  - Link tasks to timers
  - Auto-start timer when task begins
  - Track actual vs. estimated time
  - Daily/weekly task completion statistics
- **Smart Features**:
  - Recurring tasks
  - Task templates
  - Quick-add with keyboard shortcuts

### 📊 Productivity Analytics & Insights
- **Time Tracking Dashboard**:
  - Daily/weekly/monthly productivity reports
  - Focused hours heatmap calendar
  - Category-based time breakdown
  - Productive vs. distracted time ratio
- **Streaks & Achievements**:
  - Focus session streaks
  - Longest focused period
  - Tasks completed milestones
  - Gamification badges
- **Data Visualization**:
  - Charts showing productivity trends
  - Best performing hours/days
  - Progress toward weekly goals

## Installation

### From Source
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension will appear in your Chrome toolbar

### From Chrome Web Store
*(Coming soon - will be published to the Chrome Web Store)*

## Usage

### Getting Started
1. **Click the extension icon** in your Chrome toolbar to open the popup
2. **Toggle the floating clock** using the "Toggle Clock" button
3. **Start your first focus session** by clicking "Focus Mode"
4. **Add tasks** to track your work
5. **Monitor your progress** in the analytics dashboard

### Focus Mode
1. **Set your focus duration** (default: 25 minutes)
2. **Configure blocked sites** in the settings
3. **Start focus mode** - distracting sites will be blocked
4. **Work without distractions** until the session ends
5. **Take breaks** when prompted to maintain productivity

### Time Management
1. **Use the Pomodoro timer** for structured work sessions
2. **Track time on tasks** to improve estimates
3. **Use the stopwatch** for unplanned work
4. **Review analytics** to identify productivity patterns

## Configuration

### Settings
Access settings by:
- Right-clicking the extension icon → "Options"
- Clicking the settings icon in the popup
- Navigating to `chrome://extensions/` → Details → Options

### Key Settings
- **Clock Settings**: Style, size, position, opacity
- **Focus Mode**: Duration, break intervals, blocked sites
- **Notifications**: Sound, desktop alerts, break reminders
- **Analytics**: Data retention, tracking preferences
- **Themes**: Color schemes, appearance options

## Technical Details

### Architecture
- **Manifest V3** compliance for future-proof Chrome extension
- **Background service worker** for timer continuity
- **Content scripts** for website blocking
- **Local storage** for settings and data persistence
- **Declarative Net Request API** for efficient site blocking

### File Structure
```
chrome-productivity-clock/
├── manifest.json              # Extension manifest
├── popup/                     # Extension popup
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── background/                 # Background service worker
│   └── service-worker.js
├── content/                   # Content scripts
│   └── blocker.js
├── floating/                  # Floating clock widget
│   ├── clock.html
│   ├── clock.js
│   ├── clock.css
│   ├── stopwatch.html
│   ├── stopwatch.js
│   └── focus-block.html
├── options/                   # Settings page
│   ├── options.html
│   └── options.js
├── utils/                     # Utility modules
│   ├── storage.js
│   ├── time.js
│   └── analytics.js
├── rules/                     # Site blocking rules
│   └── focus-rules.json
└── assets/                    # Static assets
    ├── icons/
    ├── sounds/
    └── fonts/
```

### Permissions
- `storage` - Save settings and data
- `alarms` - Timer functionality
- `notifications` - Desktop alerts
- `tabs` - Current tab information
- `declarativeNetRequest` - Website blocking
- `activeTab` - Current tab access

## Privacy & Data

### Data Storage
- **All data stored locally** by default
- **No tracking or analytics** without explicit consent
- **Export/backup functionality** for data portability
- **Clear data option** for privacy

### Security
- **Minimal permissions** requested
- **No external API calls** without user action
- **Content Security Policy** compliant
- **Manifest V3** security standards

## Development

### Building from Source
1. Clone the repository
2. Install dependencies (if any)
3. Load as unpacked extension in Chrome
4. Make changes to source files
5. Reload extension in Chrome to test

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Troubleshooting

### Common Issues
- **Extension not loading**: Check manifest.json syntax
- **Floating clock not showing**: Ensure content script permissions
- **Site blocking not working**: Check declarativeNetRequest permissions
- **Timer not persisting**: Verify background service worker is running

### Support
- **Documentation**: Check this README and inline comments
- **Issues**: Report bugs via GitHub Issues
- **Features**: Request enhancements via GitHub Discussions

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### v1.0.0 (Current)
- Initial release
- Core functionality implemented
- Focus mode with site blocking
- Floating clock widget
- Timer and stopwatch
- Task management
- Analytics dashboard
- Comprehensive settings

---

**Transform your Chrome into a productivity command center and reclaim your focus!** 🚀