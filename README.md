# TimeShield

[![Latest release](https://img.shields.io/github/v/release/abishekgh-6/TimeShield?display_name=tag&sort=semver)](https://github.com/abishekgh-6/TimeShield/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Tests](https://img.shields.io/badge/smoke%20tests-47%20passing-2ea44f)](tests/smoke.test.mjs)

TimeShield is a local-first productivity extension for Chrome and other Chromium-based browsers. It combines a floating clock, focus sessions, scheduled blocking, sleep protection, usage limits, screen-time reports, tasks, and optional ad blocking in one place.

The extension is designed to stay out of the way until you choose to use it. **Sites are not blocked automatically.** You add the domains you want to manage and enable the protection mode that fits the moment.

![TimeShield control panel](assets/screenshots/control-panel.png)

<details>
<summary>View the TimeShield screenshots</summary>

The gallery is collapsed by default. Select the arrow to expand it and browse the control center, settings pages, and feature views.

### Control center

![TimeShield control panel](assets/screenshots/control-panel.png)

### Settings and feature tabs

![General settings](assets/screenshots/general.png)

![Clock settings](assets/screenshots/clock.png)

![Focus settings](assets/screenshots/focus.png)

![Scheduled blocking and limits](assets/screenshots/schedule.png)

![Ad blocker settings](assets/screenshots/ad.png)

![Tasks settings](assets/screenshots/task.png)

![Screen Time settings](assets/screenshots/screen.png)

![Data management settings](assets/screenshots/data.png)

</details>

## Choose how to install

| Option | Best for | Instructions |
|---|---|---|
| Download a release | The quickest way to try TimeShield | Download the ZIP from the [latest release](https://github.com/abishekgh-6/TimeShield/releases/latest), extract it, and load the extracted folder as an unpacked extension. |
| Clone the repository | Development, inspection, or contributing | Clone `main`, then load the repository folder containing `manifest.json` through the browser’s Extensions page. |

### Install from a release ZIP

1. Download **`TimeShield-v2.3.2.zip`** from the [v2.3.2 release](https://github.com/abishekgh-6/TimeShield/releases/tag/v2.3.2).
2. Extract the ZIP to a permanent folder. Do not select the ZIP file itself.
3. Open `chrome://extensions` in Chrome, `brave://extensions` in Brave, or the equivalent Extensions page in another Chromium browser.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the extracted folder that contains `manifest.json`.
6. Pin TimeShield from the browser toolbar if you want quick access to the popup.

### Install by cloning the repository

```bash
git clone https://github.com/abishekgh-6/TimeShield.git
cd TimeShield
```

Then load the cloned `TimeShield` folder through **Load unpacked** on the browser’s Extensions page. The repository already contains the files required to run the extension; no build step is required.

For local development, run the smoke tests with:

```bash
node --test tests/smoke.test.mjs
```

## What TimeShield does

### Floating clock and timers

The floating display can be shown independently of the full Clock View. It can be dragged and resized, and its position and size are synchronized across open tabs. Clock text scales with the display, and the standard clock can open the Flip Clock in a separate tab. A 12-hour or 24-hour format can be selected in settings.

### Focus Mode

Focus Mode starts immediately after the save-work warning is acknowledged. You choose the sites that should be restricted, and the block page provides a clear way to remain focused or request a deliberate pause. The current tab can be added to the Focus list directly from the popup.

### Scheduled and sleep protection

Scheduled Blocking can restrict a manually maintained site list during selected times and days. Sleep protection can cover a separate list and can handle schedules that cross midnight. Both modes remain inactive until you enable them and configure the sites and schedule you want.

### Usage limits

Set a daily limit for individual domains and receive warnings before the limit is reached. When a limit is reached, the site can be paused for **1, 5, or 10 minutes**. Focus, Schedule, and Sleep pauses use **1 minute, 5 minutes, 1 hour, or 3 hours**. Pause requests begin with a visible 10-second countdown, followed by a lowercase motivational sentence challenge. Usage-limit pauses include an additional confirmation step so extending the limit is intentional.

### Screen Time

Screen Time records active browsing time by site and presents it in daily, weekly, and monthly views. Tracking is stored locally in the browser and continues to checkpoint while the Manifest V3 service worker is suspended. Time is not recovered retroactively if the extension was not installed or tracking was not running at the time.

To track local documents and local PDFs, open the TimeShield details page at `chrome://extensions` and enable **Allow access to file URLs**. Chrome internal pages such as `chrome://settings` and the Chrome Web Store cannot receive extension content scripts.

### Optional ad protection

Ad Protection is optional. It uses the extension’s local rule lists and can be disabled without affecting the clock, focus tools, or screen-time tracking. The element picker and custom filter controls are available from the Ad Protection settings when enabled.

### Tasks and personalization

The Tasks section provides a small local task list for daily work. TimeShield also includes dark, light, and Solar Ember themes, compact popup controls, configurable animations, and settings accordions that open only when you need them.

## Privacy and permissions

TimeShield is built around local storage. Settings, task data, screen-time records, and protection lists remain in the browser profile on your device. The extension does not require an account or cloud synchronization.

| Permission or access | Why it is used |
|---|---|
| `storage` | Saves settings, tasks, protection lists, and screen-time records locally. |
| `alarms` | Checkpoints screen-time usage and evaluates scheduled features reliably. |
| `tabs` and `webNavigation` | Detects active-tab changes and keeps usage tracking accurate. |
| `scripting` and host access | Displays the floating clock and timer overlays on eligible pages. |
| Declarative Net Request permissions | Applies configured blocking and optional ad-blocking rules. |
| File URL access, when enabled by you | Allows overlays and tracking on local documents and PDFs. |

TimeShield does not promise access to protected browser pages. This is a Chrome platform restriction, not an extension setting.

## Troubleshooting

### A website is blocked unexpectedly

Open the TimeShield popup and check Focus Mode, Scheduled Blocking, Sleep protection, Usage Limits, and Global Limits. Disable any mode that you do not intend to use. After updating the extension, open `chrome://extensions`, click **Reload**, close old TimeShield block tabs, and open the website in a new tab.

### Screen Time is empty

Leave a normal website active for at least 30–60 seconds, then open the Screen Time page and select **Refresh Data**. Make sure the extension is enabled and that you are not testing on a protected `chrome://` page. For local files, enable **Allow access to file URLs**.

### The pause challenge does not appear

Reload TimeShield from `chrome://extensions`, close the existing block page, and open a new blocked tab. Select a pause duration and wait for the visible 10-second countdown to finish. The challenge should then appear with its input and **Continue Anyway** button.

### The popup looks outdated after an update

Chrome can keep an old popup or block page open. Reload the extension and close the old TimeShield tab before opening a new popup or website tab.

## Repository layout

| Directory | Purpose |
|---|---|
| `background/` | Service-worker logic, protection enforcement, and Screen Time tracking. |
| `content/` | Floating clock, overlay, and page-level controls. |
| `floating/` | Clock, timer, block-page, and pause-challenge views. |
| `options/` | The full settings and Screen Time dashboard. |
| `popup/` | The compact toolbar popup. |
| `rules/` | Local declarative rule resources. |
| `assets/` | Icons, screenshots, and optional sounds. |
| `tests/` | Node-based smoke and regression tests. |

## Current release

The current downloadable release is **[TimeShield v2.3.2](https://github.com/abishekgh-6/TimeShield/releases/tag/v2.3.2)**. The release includes `TimeShield-v2.3.2.zip` and is intended for unpacked installation while the project is distributed through GitHub.

This project is not currently distributed through the Chrome Web Store. Browser extensions loaded from GitHub releases use the browser’s developer-mode workflow described above.

## License

TimeShield is available under the [Apache License 2.0](LICENSE).

Built to make focused work easier, one deliberate session at a time.
