# TimeShield

[![Latest Release](https://img.shields.io/github/v/release/abishek-ghimire/TimeShield?display_name=tag&sort=semver)](https://github.com/abishek-ghimire/TimeShield/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Unique Visitors](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fabishek-ghimire%2FTimeShield%2Fmain%2Fdata%2Frepository-traffic-badge.json)](https://github.com/abishek-ghimire/TimeShield/blob/main/data/repository-traffic.json)

**TimeShield is a local-first productivity and focus extension for Chromium-based browsers.** It combines a floating clock, focus protection, scheduled blocking, sleep protection, usage limits, screen-time tracking, tasks, timers, and optional ad protection in one browser extension.

TimeShield does not require an account or cloud synchronization for its core features. Settings, task data, protection lists, and screen-time records remain in the browser profile.

| Resource | Link |
| --- | --- |
| Source repository | [github.com/abishek-ghimire/TimeShield](https://github.com/abishek-ghimire/TimeShield) |
| Issues and feature requests | [Open an issue](https://github.com/abishek-ghimire/TimeShield/issues) |
| Releases | [View GitHub Releases](https://github.com/abishek-ghimire/TimeShield/releases) |
| Current manifest version | `2.3.3` |

> **Distribution note:** The latest development changes are maintained on the `main` branch and can be loaded directly as an unpacked extension. No new ZIP or release is created automatically for every change.

---

## Features at a glance

| Feature | Current behavior |
| --- | --- |
| **Floating Clock** | Displays a draggable and resizable clock on supported webpages, synchronizes its geometry across open tabs, and remains visible in supported fullscreen contexts. |
| **Flip Clock** | Opens a dedicated split-flap clock in a separate browser tab and provides a route back to the normal clock view. |
| **Timers** | Runs configurable timers from the control panel and can display timer information independently of Clock View. |
| **Focus Mode** | Restricts a user-defined website list during an explicitly started focus session. The current site can be added directly from the popup. |
| **Nuclear Mode** | Runs a strict, timed allowlist session with an explicit setup dialog, optional open-tab exclusion, dedicated block page, pause flow, and verified exit. |
| **Scheduled Blocking** | Restricts configured websites during selected days and time ranges. It remains inactive until explicitly enabled and configured. |
| **Sleep Protection** | Applies a separate protection list during sleep hours, including schedules that cross midnight. |
| **Usage Limits** | Tracks configured website usage and blocks a site after its daily limit is reached, with warnings before the limit. |
| **Screen Time** | Records active browsing time by website and presents daily, weekly, and monthly views. |
| **Tasks** | Provides a small local task list for everyday work. |
| **Ad Protection** | Offers optional local rule-based filtering, element selection, and custom filters. |
| **Themes** | Includes Light, Dark, and Solar Ember themes, with Solar Ember as the default. |
| **Local-first storage** | Keeps core configuration and activity data in browser storage without requiring an account or cloud sync. |

---

## Why TimeShield?

TimeShield is designed for deliberate protection rather than automatic restriction. A website is not blocked merely because it belongs to a predefined category. Protection begins only when a configured feature is enabled or an explicit session is started.

The control panel brings the main actions together in one compact view. It shows the current clock, focus controls, Nuclear Mode, settings, active-site limits, timers, tasks, and optional ad protection. Settings pages remain focused on configuration; Nuclear Mode activation itself happens from the control panel.

---

## Screenshots

<details>
<summary>View the TimeShield screenshots</summary>

### Control Center

![TimeShield Control Panel](assets/screenshots/control-panel.png)

### General Settings

![General Settings](assets/screenshots/general.png)

### Clock Settings

![Clock Settings](assets/screenshots/clock.png)

### Clock View

![Clock View](assets/screenshots/clock-view.webp)

### Flip Clock

![Flip Clock](assets/screenshots/flip-clock.webp)

### Focus Mode

![Focus Settings](assets/screenshots/focus.png)

### Scheduled Blocking

![Scheduled Blocking](assets/screenshots/schedule.png)

### Ad Protection

![Ad Protection](assets/screenshots/ad.png)

### Tasks

![Tasks](assets/screenshots/task.png)

### Screen Time

![Screen Time](assets/screenshots/screen.png)

### Data Management

![Data Management](assets/screenshots/data.png)

</details>

---

## Installation

TimeShield is a Manifest V3 extension and currently works as an unpacked extension. The repository can be loaded directly; a build step is not required.

### Load the current repository

```bash
git clone https://github.com/abishek-ghimire/TimeShield.git
cd TimeShield
```

Then complete the following steps:

1. Open the browser's extension-management page.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the cloned `TimeShield` directory containing `manifest.json`.
5. Pin TimeShield to the toolbar if desired.

Typical extension-management URLs are:

| Browser | Extension page |
| --- | --- |
| Chrome | `chrome://extensions` |
| Brave | `brave://extensions` |
| Edge | `edge://extensions` |
| Other Chromium browsers | Open the browser's Extensions page manually |

> **Important:** Select the extracted or cloned folder, not the ZIP file itself. After pulling new code, click **Reload** on the TimeShield card before testing.

### Release packages

Older or published packages, when available, are listed on the [GitHub Releases page](https://github.com/abishek-ghimire/TimeShield/releases). The published **[TimeShield-v2.3.3.zip](https://github.com/abishek-ghimire/TimeShield/releases/download/v2.3.3/TimeShield-v2.3.3.zip)** package is available for the v2.3.3 release. A release archive may not contain commits added to `main` afterward. For the newest implementation, clone the repository and load it as an unpacked extension.

---

## Core features

### Floating Clock and Flip Clock

The Floating Clock can be opened from the control panel and displayed on supported webpages. Its position and size can be changed by dragging and resizing. TimeShield synchronizes clock geometry across open supported tabs, so updates made in one tab can be reflected in the others.

Clock View and Flip Clock are separate views. Clock View can open Flip Clock in a new tab, while Flip Clock provides a route back to Clock View. The clock supports 12-hour and 24-hour formats, and the popup reflects the active view.

Local documents and PDFs can receive the floating clock when the browser grants TimeShield access to file URLs. Browser-internal pages remain protected by the browser and cannot receive normal extension content scripts.

### Timers and floating display

Timers can be configured from the control panel. Floating display for a timer or focus session is independent of opening Clock View. When enabled and supported by the current page, the relevant timer or session overlay appears without requiring the separate clock interface to be open.

### Focus Mode

Focus Mode restricts only the websites configured in the Focus list and only while an explicit focus session is active. The current site can be added from the control panel when it is open in a supported tab.

A focus session starts after a save-work warning so that unfinished work can be saved before blocking begins. Focus Mode supports pausing from its block page. General one-minute pauses are challenge-free for the first two eligible requests per local calendar day; later requests use the motivational verification flow.

### Scheduled Blocking

Scheduled Blocking supports a configurable website list, selected days, and start and end times. It does not block anything while disabled or while no usable site list has been configured. A schedule that crosses midnight is handled according to its configured time range.

### Sleep Protection

Sleep Protection is separate from Scheduled Blocking. It has its own website list and schedule, including overnight ranges that start on one day and end on the next.

### Usage Limits

Usage Limits track configured domains and show warnings as the remaining time approaches. The control panel shows the remaining limit only for the currently open site when that site has a configured limit. It does not display unrelated website limits while browsing another site.

After a limit is reached, the site-specific pause choices are limited to **1 minute**, **5 minutes**, and **10 minutes**. Usage-limit extensions include additional confirmation so that extending access is deliberate.

### Screen Time

Screen Time records active browsing time by website and provides daily, weekly, and monthly views. The service worker periodically checkpoints tracking data so that Manifest V3 suspension does not discard all progress.

TimeShield cannot reconstruct browsing time from before tracking was enabled or during periods when the extension was unavailable. Local files and PDFs can be tracked after **Allow access to file URLs** is enabled in the extension details.

To enable local-file access:

1. Open the browser's Extensions page.
2. Open TimeShield's **Details** page.
3. Enable **Allow access to file URLs**.
4. Reload TimeShield and reopen the local document if necessary.

### Tasks

Tasks are stored locally and are intended for small, practical work items. They do not require a separate account or an external task service.

### Optional Ad Protection

Ad Protection is independent of the productivity features. It can be enabled or disabled without changing the clock, Focus Mode, Screen Time, Tasks, or Nuclear Mode. It includes local rule lists, an element picker, synchronization controls, and custom filter support.

### Themes and interface customization

TimeShield includes Light, Dark, and Solar Ember themes. The popup uses compact cards, responsive controls, expandable settings sections, and a control-panel layout designed for the browser toolbar. Solar Ember is the default theme.

---

## Nuclear Mode

Nuclear Mode is the strictest TimeShield protection feature. It is an opt-in timed session for work that requires access to only a small, deliberate set of destinations.

> **Nuclear Mode rule:** Without an explicit exception, an ordinary unlisted website or link is blocked. Nuclear Mode is never supposed to activate automatically.

### Starting a session

Nuclear Mode is started from the **Nuclear Mode** button in the control panel. Every activation opens a fresh setup dialog. The active session allowlist starts empty, even when the Settings page contains saved entries.

The setup sequence is:

1. Choose a positive duration using separate **Hours** and **Minutes** fields.
2. Optionally select **Exclude all open tabs** as the first setup choice.
3. Add work websites or exact links manually, capture the current tab, or deliberately select saved entries.
4. Review the save-work warning.
5. Confirm the Nuclear Mode activation.

The duration is explicit. There is no hidden 25-minute fallback or automatic session duration.

### Allowlist and open-tab exclusion

The session allowlist supports bare domains, exact HTTP/HTTPS links, and exact `file://` URLs. A maximum of eight manually allowlisted entries can be used in a session.

The optional **Exclude all open tabs** choice captures every tab currently open immediately before Nuclear Mode starts. Captured tabs remain available for the session, including websites, exact links, localhost pages, local files, PDFs, and other content already open in browser tabs. Newly opened tabs are still blocked unless they are otherwise permitted.

The Settings page contains a Nuclear Mode Whitelist for saved entries. The default suggestions include `chatgpt.com`, `gemini.google.com`, `notebooklm.google.com`, `claude.ai`, `deepseek.com`, `grok.com`, and `web.whatsapp.com`. These are suggestions only. They are not copied into a new session automatically; each entry must be deliberately added to the active session.

### Automatic exceptions

The following remain available during Nuclear Mode without being added manually:

| Destination | Behavior |
| --- | --- |
| Local files | `file://` pages remain available, including local documents and PDFs. Browser file access must be enabled for the extension where required. |
| Localhost | `localhost`, `127.0.0.1`, `0.0.0.0`, and IPv6 loopback development pages remain available. |
| PDF URLs | HTTP/HTTPS destinations whose URL identifies a PDF remain available. |
| Other unlisted websites and links | Blocked unless explicitly allowlisted or preserved through the open-tab exclusion. |

### Pausing and ending Nuclear Mode

The dedicated Nuclear block page provides **Pause Blocks**. In each Nuclear Mode session, exactly one **1-minute pause** is available without a challenge. Later one-minute pause attempts require the lowercase motivational verification challenge. Longer pauses use the existing preparation and challenge flow.

To end an active Nuclear session manually, use the control-panel button **Exit from Nuclear Mode**. It opens the Nuclear block page rather than stopping the session directly. The required sequence is:

1. Select **Pause Blocks**.
2. Select **End Nuclear Mode with verification**.
3. Continue to verification.
4. Type the displayed motivational sentences exactly in lowercase.
5. Submit the challenge to end Nuclear Mode.

The challenge uses first-person **“i”** language, such as sentences about staying focused and avoiding distraction. It does not use second-person “you” wording, and it does not accept symbols, numbers, or incorrectly formatted text.

Nuclear Mode also ends automatically when its selected duration expires. Cleanup removes its blocking rules and its preserved open-tab exception.

---

## Pause behavior

Pause behavior depends on the protection feature and requested duration.

| Protection context | Challenge-free allowance | Verified pause behavior |
| --- | --- | --- |
| Nuclear Mode | One 1-minute pause per Nuclear session | Later 1-minute requests and longer pauses use the Nuclear pause flow. |
| Focus, Schedule, and Sleep | Two eligible 1-minute pauses per local day | Later one-minute requests and supported longer pauses use verification. |
| Usage Limits | No more than the site-limit pause choices of 1, 5, or 10 minutes | Additional confirmation is used when extending a usage limit. |

When verification is required, the block page displays a visible preparation countdown before the motivational challenge. The challenge text is shown in lowercase and must be entered exactly as displayed.

---

## Privacy and local storage

TimeShield follows a local-first design. The following data is stored in the browser profile:

| Data | Storage behavior |
| --- | --- |
| Settings and themes | Stored locally using browser extension storage. |
| Website lists and protection state | Stored locally and used by the service worker to enforce configured rules. |
| Tasks | Stored locally in the extension profile. |
| Screen Time | Stored locally and periodically checkpointed. |
| Nuclear Mode session state | Stores the active session, duration, allowlist, preserved tab IDs, and one-minute pause usage. |

TimeShield does not require an account, cloud synchronization, or a TimeShield server for core productivity features. Clearing browser extension data, removing the extension, or resetting the browser can remove locally stored data.

---

## Permissions

TimeShield requests permissions because its features use different browser APIs.

| Permission or access | Purpose |
| --- | --- |
| `storage` | Stores settings, tasks, protection lists, session state, and Screen Time data. |
| `alarms` | Runs scheduled checks, session expiry, pause expiry, and tracking checkpoints. |
| `tabs` | Reads active tabs, captures open-tab exclusions, and synchronizes supported tab behavior. |
| `webNavigation` | Observes supported navigation events for blocking and Screen Time tracking. |
| `scripting` | Injects supported overlays and clock interfaces into eligible pages. |
| Host permissions | Allows configured website protection and supported page overlays. |
| Declarative Net Request | Applies blocking rules and optional local ad-protection rules. |
| File URL access | Enables supported clock, tracking, and Nuclear Mode behavior on local files after the user grants browser access. |

Browser-internal pages are not ordinary web pages. Normal extensions cannot inject content scripts into pages such as `chrome://settings`, `chrome://extensions`, `brave://extensions`, or the Chrome Web Store.

---

## Browser compatibility and platform limitations

TimeShield targets browsers that support the Chromium Manifest V3 extension platform, including Chrome, Brave, Microsoft Edge, and other Chromium-based browsers. Small differences can occur because each browser controls its own permissions and protected pages.

The following limitations are imposed by the browser platform:

- Browser-internal pages cannot receive normal extension overlays or content scripts.
- A normal extension cannot reliably block or delay access to `chrome://extensions` or `brave://extensions`.
- A normal extension cannot prevent a user from disabling or removing the extension from the browser's extension-management page.
- Local-file features require the user to enable **Allow access to file URLs**.
- Screen Time cannot reconstruct historical activity that was not recorded.
- Browser-specific restrictions may affect overlays, fullscreen behavior, protected pages, and local documents.

These limitations are expected platform behavior, not hidden TimeShield features.

---

## Troubleshooting

### A website is blocked unexpectedly

Check whether Focus Mode, Scheduled Blocking, Sleep Protection, a Usage Limit, a Global Limit, or Nuclear Mode is active. Each feature has its own configured state. If no feature should be active, open the extension-management page, click **Reload** on TimeShield, close old block tabs, and reopen the website in a new tab.

Nuclear Mode is strict by design. An unlisted website or link remains blocked while the session is active. Add the destination to the current session, preserve its tab using **Exclude all open tabs** before activation, or wait for the session to expire.

### Nuclear Mode shows a DNR rule error

Reload the extension from the browser's Extensions page. TimeShield includes cleanup for legacy Nuclear rules and recreates the supported session rule for preserved open tabs. If the error continues, close old TimeShield block tabs and reload the extension once more before starting a new session.

### The Nuclear exit button does not stop the session immediately

That is intentional. **Exit from Nuclear Mode** opens the Nuclear block page. Use **Pause Blocks**, select **End Nuclear Mode with verification**, and complete the displayed lowercase motivational challenge. Direct stopping from the popup is not available.

### The first Nuclear one-minute pause does not show a challenge

That is intentional. Nuclear Mode provides exactly one challenge-free 1-minute pause per session. Later one-minute pauses require verification.

### Screen Time is empty

Open a supported website, keep it active for at least 30–60 seconds, open Screen Time, and refresh the data. Confirm that TimeShield is enabled and that the page is not a browser-internal page. For local documents, enable **Allow access to file URLs** from the extension details page.

### The pause challenge does not appear

For a challenge-required pause, wait for the visible preparation countdown to finish. If the page remains stuck, reload TimeShield from the browser's Extensions page, close the old blocked page, open a new blocked tab, and request the pause again.

### The popup looks outdated after an update

Reload the extension, close any old popup or block pages, and open the control panel again. The browser may retain an older extension page until the extension is reloaded.

---

## Project structure

```text
TimeShield/
├── background/      Manifest V3 service worker and protection enforcement
├── content/         Page-level scripts and floating interfaces
├── floating/        Clock, timer, block pages, and pause challenges
├── options/         Settings and Screen Time dashboard
├── popup/           Browser toolbar control panel
├── rules/           Local declarative network rules
├── assets/          Icons, screenshots, sounds, and static assets
├── tests/           Smoke and regression tests
├── manifest.json    Extension manifest
└── README.md       Project documentation
```

---

## Development

TimeShield currently does not require a framework build pipeline. After cloning the repository, load it directly with **Load unpacked** in a Chromium-based browser.

Run the smoke and regression tests with:

```bash
node --test tests/smoke.test.mjs
```

Before submitting a change, verify that the extension loads without manifest errors, the popup and options page open, Clock View and Flip Clock still work, protection modes remain opt-in, Screen Time continues recording, local-file behavior is preserved, and the test suite passes.

### Test command reference

| Check | Command |
| --- | --- |
| Smoke and regression suite | `node --test tests/smoke.test.mjs` |
| Service worker syntax | `node --check background/service-worker.js` |
| Popup syntax | `node --check popup/popup.js` |
| Block-page syntax | `node --check floating/nuclear-block.js` |
| Pause challenge syntax | `node --check floating/pause-challenge.js` |
| Whitespace errors | `git diff --check` |

---

## Testing

The repository contains Node-based smoke and regression tests that cover the extension's wiring and important protection behavior without requiring a full browser automation environment.

```bash
node --test tests/smoke.test.mjs
```

The current suite contains **55 passing tests**. It covers, among other areas, opt-in protection, inactive-state cleanup, Nuclear Mode setup and verified exit, preserved open tabs, supported DNR session rules, local-file and localhost exceptions, pause verification, Screen Time tracking, popup behavior, settings persistence, and repository documentation checks.

---

## Contributing

Bug reports, feature ideas, documentation improvements, and code contributions are welcome through the [GitHub issue tracker](https://github.com/abishek-ghimire/TimeShield/issues).

Before changing user-visible behavior, review the existing implementation, preserve local-first operation, avoid unnecessary permissions, keep protection modes opt-in, run the smoke suite, and update the README. Do not create a release archive unless the change is ready and a release is explicitly requested.

---

## License

TimeShield is licensed under the [Apache License 2.0](LICENSE).

---

## Project philosophy

> **Productivity tools should help people control their attention, not demand more of it.**

TimeShield is intended to provide deliberate tools, clear warnings, and local control without requiring an account or mandatory cloud services.

---

## References

[1]: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 "Chrome Extensions: Manifest V3"
[2]: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions "Chrome Extensions: Declare permissions"
[3]: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest "Chrome Extensions: Declarative Net Request API"
[4]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts "Chrome Extensions: Content scripts"
[5]: https://docs.github.com/en/repositories/creating-and-managing-repositories/viewing-activity-and-data-for-your-repository "GitHub Docs: Viewing repository activity and data"

The repository links and release information in this document point to the canonical [TimeShield GitHub repository](https://github.com/abishek-ghimire/TimeShield).
