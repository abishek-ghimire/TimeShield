# 🛡️ TimeShield: The Ultimate Productivity Command Center

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Version](https://img.shields.io/badge/Version-1.0.0-green.svg)](https://github.com/abishekgh-6/TimeShield/releases/tag/v1.0.0)

**TimeShield** is a productivity extension for Chrome/Brave that combines high-performance ad blocking with a focused deep-work toolkit. It turns your browser into a dedicated workspace with a floating clock overlay, intelligent site blocking, and detailed usage analytics.

> 🔽 **Release builds**: Download the latest packaged extension (`TimeShield-*.zip`) from the GitHub **Releases** page and load it into Chrome/Brave via **Load unpacked**.

---

## ✨ Features

### 🕐 Two types of clocks
*   **Always on top:** A simple clock you can drag around that stays on top of other websites.
*   **3D Flip Clock:** A cool retro clock that opens in its own tab with nice animations.
*   **Resize it:** You can makes the clock small like a pill or big like a box.
*   **Hide it:** Minimize the clock into the title bar when you need more space.

### 🛑 Challenge to turn off the block
*   **Hard to stop:** If you want to pause your blocks, you have to go through a challenge first.
*   **Real warnings:** It shows you a few popups to make sure you really want to stop working.
*   **Type to unlock:** You have to type out two motivational lines exactly right to turn off the block.
*   **Pick your time:** Pause for 5 minutes, an hour, or the rest of the day.

### ⚡ Quick block buttons
*   **Block sites fast:** Add the site you're on to your blocklist right from the popup.
*   **Toggle ads:** Quickly turn the ad blocker on or off from the main menu.

### 🎯 Focus sessions
*   **Pure focus:** Block all distracting sites while you work.
*   **Redirects:** If you try to visit a blocked site, it sends you to a focus screen instead.
*   **Live timers:** See exactly how much time you have left on the block screen and the clock.

### 🩹 A better ad blocker
*   **Smart blocking:** Blocks ads and trackers but keeps the stuff you want to see.
*   **Keep posts:** It won't hide social media posts, captions, or comments by mistake.
*   **Hide anything:** Use the element picker to right-click and hide anything annoying on a page.

### 📊 Track your screen time
*   **See your habits:** Check exactly how much time you spend on each site every day.
*   **Stats for the week:** Look back at the last 7 or 30 days to see your progress.
*   **Simple graphs:** Click a site to see a basic bar chart of when you used it.
*   **Go to stats:** If you try to open a blocked site, you can jump straight to your stats from there.

### ⏱️ Schedules & Time Limits
*   **Set daily limits:** Cap how much time you can spend on sites like YouTube or Instagram.
*   **Scheduled blocks:** Automatically block sites during certain hours of the day.
*   **Shared budget:** Put multiple sites behind one shared time limit.
*   **Whitelist:** Keep important sites unblocked even when other rules are on.

---

## 🎨 Themes and Light Mode
TimeShield includes multiple themes like Dark, Light, and Solar Ember. We fixed the colors so everything is easy to read even in light mode.

---

## 🚀 Quick Start Guide

### Installation from Source
1.  **Clone** this repository to your local machine.
2.  Open Chrome and go to `chrome://extensions/`.
3.  Switch on **Developer Mode** (top-right toggle).
4.  Click **Load unpacked** and select the extension folder.
5.  **Pin** TimeShield to your toolbar for the best experience!

### Installation from GitHub Releases
1.  Go to the **Releases** tab of `abishekgh-6/FloatingClockExtension` on GitHub.
2.  Download the latest `TimeShield-*.zip` file.
3.  Extract the zip (optional, for inspection) or load it directly via **Load unpacked** pointing at the extracted folder.

### Using Focus Mode
1.  Open the TimeShield popup.
2.  Add websites you want to block in the **Settings**.
3.  Click **"Focus Mode"** and enter your desired duration.
4.  Start your focus session; distracting sites will be automatically blocked for the duration.

---

## 🛠️ Technical Stack & Architecture

TimeShield is built on a modern Chrome extension stack:

*   **Logic:** Modern asynchronous JavaScript with Service Worker (Manifest V3).
*   **Blocking Engine:** `declarativeNetRequest` for native-speed ad and site filtering.
*   **Storage:** `chrome.storage.local` for high-speed state persistence and consistency across reboots.
*   **UI/UX:** Vanilla CSS with a focus on Glassmorphism, CSS Variables for theming, and smooth transitions.

```text
FloatingClockExtension/
├── background/          # Persistent Background Service Worker
├── content/             # DOM-injected Blocker & UI Widgets
├── floating/            # The Floating Clock & Focus Screens
├── popup/               # The Primary Control Panel
├── options/             # Advanced Analytics & Personalization
└── rules/               # Static DNR Filtering Sets
```

---

## 🖼️ Screenshots
Below are reference screenshots for the main views in TimeShield.

### Options Dashboard

<details>
<summary><strong>General Settings</strong> – View image</summary>

![Options – General](assets/screenshots/options-general.png)

_File: assets/screenshots/options-general.png_

</details>

<details>
<summary><strong>Clock Settings</strong> – View image</summary>

![Options – Clock](assets/screenshots/options-clock.png)

_File: assets/screenshots/options-clock.png_

</details>

<details>
<summary><strong>Focus Mode Settings</strong> – View image</summary>

![Options – Focus Mode](assets/screenshots/options-focus.png)

_File: assets/screenshots/options-focus.png_

</details>

<details>
<summary><strong>Schedules & Time Limits</strong> – View image</summary>

![Options – Schedules & Limits](assets/screenshots/optins-schedules-limits.png)

_File: assets/screenshots/optins-schedules-limits.png_

</details>

<details>
<summary><strong>Ad Blocker Settings</strong> – View image</summary>

![Options – Ad Blocker](assets/screenshots/options-adblock.png)

_File: assets/screenshots/options-adblock.png_

</details>

<details>
<summary><strong>Screen Time Overview</strong> – View image</summary>

![Options – Screen Time](assets/screenshots/options-screentime.png)

_File: assets/screenshots/options-screentime.png_

</details>

<details>
<summary><strong>Tasks</strong> – View image</summary>

![Options – Tasks](assets/screenshots/options-tasks.png)

_File: assets/screenshots/options-tasks.png_

</details>

<details>
<summary><strong>Data Management</strong> – View image</summary>

![Options – Data](assets/screenshots/options-data.png)

_File: assets/screenshots/options-data.png_

</details>

---

### Popup & Floating Clock

<details>
<summary><strong>Control Center Popup</strong> – View image</summary>

![Popup – Control Center](assets/screenshots/control-panel.png)

_File: assets/screenshots/control-panel.png_

</details>

<details>
<summary><strong>Floating Clock Overlay</strong> – View image</summary>

![Floating Clock Overlay](assets/screenshots/floating-clock.png)

_File: assets/screenshots/floating-clock.png_

</details>

---

### Focus & Limits Screens

<details>
<summary><strong>Focus Block Screen</strong> – View image</summary>

![Focus Block Screen](assets/screenshots/focus-block.png)

_File: assets/screenshots/focus-block.png_

</details>

<details>
<summary><strong>Time Limit Screen</strong> – View image</summary>

![Time Limit Screen](assets/screenshots/limit-block.png)

_File: assets/screenshots/limit-block.png_

</details>

<details>
<summary><strong>Timer / Focus Complete</strong> – View image</summary>

![Timer / Focus Complete](assets/screenshots/timer-complete.png)

_File: assets/screenshots/timer-complete.png_

</details>

---

## 🎨 Themes

TimeShield includes multiple visual themes (Dark, Light, Aurora Gradient, Neon Focus, Solar Ember, Forest Deep Work) so you can match the clock and options UI to your style.

- Open the **Options** page and go to the **General / Appearance** section.
- Use the **Theme** dropdown to switch between themes.
- The floating clock, popup, and options page update instantly to reflect your chosen theme.

---

## 📈 Privacy First
TimeShield is private by design. **None of your browsing data, site usage, or task lists ever leave your computer.** All analytics are processed locally and stored within your Chrome profile's isolated storage.

---

## 🤝 Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License
Distributed under the Apache License 2.0. See `LICENSE` for full terms.

---

**Designed and engineered for sustained, distraction-free deep work.**