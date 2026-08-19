import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFile(join(root, file), 'utf8');

async function filesWithExtension(directory, extension) {
    const result = [];
    async function walk(current) {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const path = join(current, entry.name);
            if (entry.isDirectory() && entry.name !== 'node_modules') await walk(path);
            else if (entry.isFile() && path.endsWith(extension)) result.push(path);
        }
    }
    await walk(join(root, directory));
    return result;
}

test('Manifest is valid Manifest V3 with required runtime permissions', async () => {
    const manifest = JSON.parse(await read('manifest.json'));
    assert.equal(manifest.manifest_version, 3);
    for (const permission of ['storage', 'alarms', 'notifications', 'scripting']) {
        assert.ok(manifest.permissions.includes(permission), `missing ${permission} permission`);
    }
    assert.equal(manifest.background.service_worker, 'background/service-worker.js');
    assert.equal(manifest.background.type, 'module', 'background imports require a module service worker');
});

test('All extension JavaScript parses successfully', async () => {
    const files = await filesWithExtension('.', '.js');
    for (const file of files) {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    }
});

test('No merge-conflict markers remain in source files', async () => {
    const files = [
        ...(await filesWithExtension('background', '.js')),
        ...(await filesWithExtension('content', '.js')),
        ...(await filesWithExtension('floating', '.js')),
        ...(await filesWithExtension('options', '.js')),
        ...(await filesWithExtension('popup', '.js')),
        ...(await filesWithExtension('utils', '.js'))
    ];
    for (const file of files) {
        const text = await read(relative(root, file));
        assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m, relative(root, file));
    }
});

test('Warning and countdown contracts are connected end to end', async () => {
    const tracker = await read('background/usage-tracker.js');
    const worker = await read('background/service-worker.js');
    const blocker = await read('content/blocker.js');
    assert.match(tracker, /showTimeLimitWarning/);
    assert.match(tracker, /showBlockingCountdown/);
    assert.match(worker, /scheduleWarningFirstMinutes/);
    assert.match(worker, /showBlockingCountdown/);
    assert.match(blocker, /ts-blocking-countdown/);
    assert.match(blocker, /position:\s*fixed/);
    assert.match(blocker, /top:\s*12px/);
    assert.match(blocker, /right:\s*12px/);
});

test('Pause challenge uses lowercase motivational sentences and context-specific durations', async () => {
    const helper = await read('floating/pause-challenge.js');
    const worker = await read('background/service-worker.js');
    const usageLimit = await read('floating/limit-block.html');
    const focus = await read('floating/focus-block.html');
    const schedule = await read('floating/schedule-block.html');
    const sleep = await read('floating/sleep-block.html');
    assert.match(helper, /motivational sentences/);
    assert.match(helper, /valueLines\.length >= 2/);
    assert.match(helper, /\^\[a-z\]\+\(\?: \[a-z\]\+\)\*\$/);
    assert.match(worker, /generatePauseChallenge/);
    assert.match(worker, /i am focused and i will not get distracted/);
    assert.match(worker, /i choose to protect my time and finish what matters/);
    assert.match(worker, /i return my attention to the work in front of me/);
    assert.match(worker, /'i am focused and i will not get distracted\\ni choose to protect my time and finish what matters'/);
    assert.match(worker, /'i am building the discipline to finish what matters most\\ni return my attention to the work in front of me'/);
    assert.match(worker, /'i choose to stay on task and honor the commitment i made to myself\\ni will not let distraction win today'/);
    assert.match(worker, /isValidPauseChallenge/);
    const challengeSource = worker.match(/const challenges = \[([\s\S]*?)\n        \];/)?.[1] || '';
    assert.doesNotMatch(challengeSource, /\bwe\b/);
    const challengeText = challengeSource.replace(/,\s*/g, '');
    assert.doesNotMatch(challengeText, /[A-Z]|[.,!?]/);
    assert.match(worker, /pauseContext === 'usageLimit'/);
    assert.match(worker, /requiresFinalConfirmation: true/);
    assert.match(worker, /confirmUsagePause/);
    assert.match(worker, /Date\.now\(\) \+ \(10 \* 1000\)/);
    assert.match(helper, /wait ten seconds/);
    assert.match(helper, /confirm pause/);
    assert.match(worker, /\[1, 5, 10\]/);
    assert.match(worker, /\[1, 5, 60, 180\]/);
    assert.match(helper, /isUsageLimit/);
    assert.doesNotMatch(worker, /new Uint32Array\(25\)/);
    assert.doesNotMatch(worker, /alphabet\.length/);
    assert.match(usageLimit, /data-minutes="1"/);
    assert.match(usageLimit, /data-minutes="5"/);
    assert.match(usageLimit, /data-minutes="10"/);
    assert.doesNotMatch(usageLimit, /data-minutes="60"|data-minutes="180"/);
    for (const source of [focus, schedule, sleep]) {
        assert.match(source, /data-minutes="60"/);
        assert.match(source, /data-minutes="180"/);
        assert.doesNotMatch(source, /data-minutes="10"/);
        assert.doesNotMatch(source, /rest of day/i);
    }
});

test('Status and retention use local calendar-day usage keys', async () => {
    const worker = await read('background/service-worker.js');
    const tracker = await read('background/usage-tracker.js');
    assert.match(tracker, /const today = now\.toDateString\(\)/);
    assert.match(worker, /const today = new Date\(\)\.toDateString\(\)/);
    assert.match(worker, /const isRecentDateKey = \(key\) =>/);
    assert.match(worker, /const tokenDate = String\(token\)\.split\('\:'\)\[0\]/);
});

test('Reliability controls remain local-only and cloud sync interfaces are absent', async () => {
    const html = await read('options/options.html');
    const options = await read('options/options.js');
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.js');
    for (const id of ['siteWarningFirstMinutes', 'showBlockingCountdown', 'safeModeEnabled', 'usageRetentionDays', 'cleanupUsageNow']) {
        assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
    }
    for (const source of [html, options, worker, popup]) {
        assert.doesNotMatch(source, /syncConflictPanel|keepLocalSync|keepCloudSync|Cloud Sync|Account Access|syncService/);
    }
    assert.doesNotMatch(html, /Pomodoro Timer/);
    for (const source of [html, options, popup]) {
        assert.doesNotMatch(source, /Protection status|protectionStatus|popupProtection|refreshPopupStatus|runDiagnostics|diagnosticsOutput/);
    }
});

test('Light theme defines readable surfaces and visible focus states', async () => {
    const popupCss = await read('popup/popup.css');
    const optionsHtml = await read('options/options.html');
    assert.match(popupCss, /body\.theme-light/);
    assert.match(popupCss, /focus-visible/);
    assert.match(popupCss, /#ffffff/);
    assert.match(optionsHtml, /prefers-reduced-motion/);
    assert.match(optionsHtml, /color-scheme:\s*light/);
});


test('Short settings tabs keep the shared footer at the bottom of the page', async () => {
    const options = await read('options/options.html');
    assert.match(options, /body\s*\{[\s\S]*?min-height:\s*100vh;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
    assert.match(options, /\.container\s*\{[\s\S]*?flex:\s*1 0 auto;[\s\S]*?width:\s*100%;/);
    assert.match(options, /\.app-footer\s*\{[\s\S]*?flex-shrink:\s*0;/);
    assert.match(options, /<div id="tasks" class="tab-content">/);
});


test('Manual blocking lists, independent sleep enforcement, and delayed focus confirmations are wired', async () => {
    const options = await read('options/options.js');
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.js');

    assert.doesNotMatch(options, /categoryPreset|scheduleCategoryPreset|renderBlockingCategoryControls|getCategoryEntriesForTarget|saveBlockingCategories/);
    assert.doesNotMatch(worker, /blockingCategories|getActiveBlockingSites/);
    assert.match(options, /'scheduledBlockedSites'/);
    assert.match(worker, /isValidPauseChallenge/);
    assert.match(worker, /requiresPassword: true/);
    assert.match(popup, /renderClock\(\)/);
    assert.match(popup, /timeFormat: '12h'/);

    assert.match(worker, /refreshActiveFocusBlocking/);
    assert.match(worker, /isSleepBlockingActive/);
    assert.match(worker, /enableSleepBlocking/);
    assert.match(worker, /sleepActive/);
    assert.match(worker, /manualOnlyDefaultsClearedVersion/);
    assert.match(worker, /clearLegacyAutomaticProtection/);
    assert.doesNotMatch(options, /Quick Add from Category|Active categories/);

    const focusBlock = await read('floating/focus-block.js');
    const pauseOverlay = await read('floating/pause-overlay.js');
    assert.match(focusBlock, /TimeShieldPauseChallenge\?\.startPreparation/);
    assert.match(pauseOverlay, /const motTextEl.*motivationText/);
    assert.match(pauseOverlay, /action: 'pauseBlockingWithPassword'/);

    for (const source of [options, popup]) {
        assert.match(source, /showProtectionWarning\(actionLabel\)/);
        assert.match(source, /Focus protection warning/);
        assert.match(source, /const totalMs = 20_000/);
        assert.match(source, /Continue will appear in \$\{remainingSeconds\}s/);
        assert.match(source, /continueBtn\.hidden = false/);
        assert.match(source, /Stay Focused/);
        assert.match(source, /Changing this setting weakens your current protection/);
        assert.doesNotMatch(source, /showProtectionStep|Focus protection · Step|This is the final check/);
    }
    assert.doesNotMatch(popup, /syncNow/);
});


test('All settings accordions have reliable two-way expand and collapse wiring', async () => {
    const html = await read('options/options.html');
    const options = await read('options/options.js');
    const itemCount = (html.match(/class="accordion-item/g) || []).length;
    const headerCount = (html.match(/class="accordion-header"/g) || []).length;
    assert.ok(itemCount > 0, 'accordion sections are present');
    assert.equal(headerCount, itemCount, 'every accordion section has one header');
    assert.doesNotMatch(html, /<button(?![^>]*type="button")[^>]*class="accordion-header"/);
    assert.doesNotMatch(html, /accordion-item open|aria-expanded="true"/);
    assert.match(options, /const open = false/);
    assert.match(options, /item\.classList\.toggle\('open', open\)/);
    assert.match(options, /button\.setAttribute\('aria-expanded', String\(open\)\)/);
    assert.match(options, /body\.style\.display = open \? 'block' : 'none'/);
    assert.match(options, /body\.setAttribute\('aria-hidden', String\(!open\)\)/);
    assert.match(options, /event\.preventDefault\(\)/);
    assert.match(options, /event\.stopPropagation\(\)/);
});

test('Popup keeps an intrinsic width instead of collapsing into a clipped sidebar strip', async () => {
    const popupCss = await read('popup/popup.css');
    assert.match(popupCss, /html\s*\{[\s\S]*?width:\s*380px;[\s\S]*?min-width:\s*380px;/);
    assert.match(popupCss, /body\s*\{[\s\S]*?width:\s*380px;[\s\S]*?min-width:\s*380px;/);
    assert.doesNotMatch(popupCss, /width:\s*min\(380px,\s*100vw\)/);
});

test('Focus Mode starts immediately after a save-work warning', async () => {
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.js');
    assert.match(popup, /showFocusStartWarning/);
    assert.match(popup, /Save your work before Focus Mode/);
    assert.match(popup, /Start Focus Now/);
    assert.doesNotMatch(popup, /startAfterMinutes:\s*1/);
    assert.match(worker, /Focus Mode starts immediately after the popup save-work warning/);
    assert.doesNotMatch(worker, /Focus Mode starts in 1 minute/);
    assert.doesNotMatch(worker, /const delayMinutes =/);
    assert.match(worker, /await this\.cancelPendingFocusActivation\(\);/);
    assert.match(worker, /await this\.activateFocusMode\(durationSeconds, cleanSites\);/);
});

test('Focus pause, current-site capture, and synchronized clock behavior stay wired', async () => {
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.js');
    const clock = await read('floating/clock.js');
    const blocker = await read('content/blocker.js');
    assert.match(worker, /case 'addCurrentSiteToFocusList'/);
    assert.match(worker, /chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
    assert.match(worker, /case 'openFlipClockTab'/);
    assert.doesNotMatch(worker, /Pausing is unavailable while Focus Mode is active/);
    assert.match(popup, /addCurrentSiteToFocusList/);
    assert.match(popup, /action: 'addCurrentSiteToFocusList'/);
    assert.match(clock, /focusState\?\.endTime/);
    assert.match(clock, /Math\.ceil\(\(focusEnd - now\) \/ 1000\)/);
    assert.doesNotMatch(clock, /Focus Complete/);
    assert.match(blocker, /changes\.clockPos\?\.newValue/);
    assert.match(blocker, /this\._applyScale\(\)/);
});

test('Popup is compact, Mission-first, and schedule enforcement requires configured sites', async () => {
    const popupHtml = await read('popup/popup.html');
    const popupCss = await read('popup/popup.css');
    const worker = await read('background/service-worker.js');

    const missionIndex = popupHtml.indexOf('> Mission\n');
    const adProtectionIndex = popupHtml.indexOf('> Ad Protection\n');
    assert.ok(missionIndex >= 0, 'Mission card is present');
    assert.ok(adProtectionIndex >= 0, 'Ad Protection card is present');
    assert.ok(missionIndex < adProtectionIndex, 'Mission precedes Ad Protection');
    assert.doesNotMatch(popupHtml, /Mission Plan|Mission & Plan/);
    assert.match(popupHtml, /popup-card-grid/);
    assert.match(popupCss, /Compact one-page popup layout/);
    assert.match(popupCss, /height:\s*590px/);
    assert.match(popupCss, /overflow:\s*hidden/);
    assert.match(popupCss, /Accessible typography scale/);
    assert.match(popupCss, /body\s*\{[\s\S]*?font-size:\s*0\.875rem/);

    assert.match(worker, /Array\.isArray\(result\.scheduledBlockedSites\)/);
    assert.match(worker, /if \(sites\.length === 0\) \{\s*await this\.disableScheduledBlocking\(\);/);
    assert.doesNotMatch(worker, /scheduledBlockedSites \|\| StorageManager\.getDefaultBlockedSites\(\)/);
});

test('Clock view opens flip mode in a separate tab', async () => {
    const clock = await read('floating/clock.js');
    const clockHtml = await read('floating/clock.html');
    const blocker = await read('content/blocker.js');
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.js');
    assert.match(clock, /action: 'openFlipClockTab'/);
    assert.match(clock, /window\.open\(chrome\.runtime\.getURL\('floating\/flip-clock\.html'\), '_blank'\)/);
    assert.doesNotMatch(clockHtml, /flip-clock-frame/);
    assert.doesNotMatch(blocker, /async applyClockMode/);
    assert.match(worker, /case 'openFlipClockTab'/);
    assert.match(popup, /chrome\.runtime\.getURL\('floating\/flip-clock\.html'\)/);
});

test('Clock controls reflect the current view and support reverse navigation', async () => {
    const popup = await read('popup/popup.html');
    const popupJs = await read('popup/popup.js');
    const flipHtml = await read('floating/flip-clock.html');
    const flipJs = await read('floating/flip-clock.js');
    const flipCss = await read('floating/flip-clock.css');
    assert.match(popup, /id="clockViewLabel">Open Clock View/);
    assert.match(popupJs, /label\.textContent = isOpen \? 'Close Clock View' : 'Open Clock View'/);
    assert.match(popupJs, /changes\.clockVisible/);
    assert.match(flipHtml, /id="clock-view-toggle"[\s\S]*?title="Open Clock View"/);
    assert.match(flipJs, /action: 'toggleClock', visible: true/);
    assert.match(flipJs, /clockViewToggle\.addEventListener\('click', openClockView\)/);
    assert.match(flipCss, /\.view-toggle\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?right:\s*24px;[\s\S]*?bottom:\s*24px;/);
});


test('Flip Clock returns to a browser tab and Solar Ember is the default theme', async () => {
    const worker = await read('background/service-worker.js');
    const flip = await read('floating/flip-clock.js');
    const options = await read('options/options.js');
    assert.match(flip, /action: 'toggleClock', visible: true/);
    assert.match(worker, /fromFlipClock = openingClockView/);
    assert.match(worker, /findClockViewReturnTab\(sender\.tab\)/);
    assert.match(worker, /windows\.update\(returnTab\.windowId, \{ focused: true \}\)/);
    assert.match(worker, /tabs\.update\(returnTab\.id, \{ active: true \}\)/);
    assert.match(worker, /tabs\.remove\(sender\.tab\.id\)/);
    assert.match(worker, /findClockViewReturnTab\(sourceTab = \{\}\)/);
    assert.match(options, /getDefaultSettings\(\)[\s\S]*?theme: 'solar'/);
    assert.match(worker, /getCleanUserDataDefaults\(\)[\s\S]*?theme: 'solar'/);
});


test('Clock geometry is broadcast and applied across open sites', async () => {
    const blocker = await read('content/blocker.js');
    const worker = await read('background/service-worker.js');
    const popupCss = await read('popup/popup.css');
    assert.match(blocker, /case 'applyClockGeometry'/);
    assert.match(blocker, /action: 'broadcastClockGeometry'/);
    assert.match(blocker, /const clockPos = \{\s*x:/);
    assert.match(worker, /case 'broadcastClockGeometry'/);
    assert.match(worker, /action: 'applyClockGeometry'/);
    assert.match(popupCss, /Final compact-popup visual refinement/);
    assert.match(popupCss, /min-height:\s*38px/);
});

test('Options typography and accordion defaults stay accessible and collapsed-first', async () => {
    const html = await read('options/options.html');
    assert.match(html, /Accessible typography scale/);
    assert.match(html, /body\s*\{[\s\S]*?font-size:\s*1rem/);
    assert.doesNotMatch(html, /accordion-item open|aria-expanded="true"/);
});


test('Floating Display is independent of Clock View and refreshes immediately', async () => {
    const blocker = await read('content/blocker.js');
    const popup = await read('popup/popup.js');
    const worker = await read('background/service-worker.js');
    assert.match(blocker, /changes\.focusState \|\| changes\.timerState \|\| changes\.settings/);
    assert.match(blocker, /case 'settingsUpdated'/);
    assert.match(blocker, /const shouldShowForStatus = focusActive \|\| timerActive/);
    assert.match(popup, /if \(enabled\) update\.sessionOverlayDismissed = false/);
    assert.match(popup, /action: 'settingsUpdated'/);
    assert.match(worker, /case 'settingsUpdated'/);
    assert.match(worker, /await this\.ensureContentScriptInjected\(\)/);
    assert.match(worker, /isEligibleOverlayTab\(url = ''\)/);
});

test('Eligible local document tabs keep isolated clock controls and geometry sync', async () => {
    const manifest = JSON.parse(await read('manifest.json'));
    const blocker = await read('content/blocker.js');
    const worker = await read('background/service-worker.js');
    assert.ok(manifest.host_permissions.includes('file:///*'));
    assert.ok(manifest.content_scripts.some((entry) => entry.matches.includes('file:///*')));
    assert.match(blocker, /wrapper\.attachShadow\(\{ mode: 'open' \}\)/);
    assert.match(blocker, /pointer-events: none/);
    assert.match(blocker, /pointer-events: auto/);
    assert.match(blocker, /this\.refs\.header\?\.querySelector\('#ts-minimize-btn'\)/);
    assert.match(blocker, /this\.refs\.header\?\.querySelector\('#ts-close-btn'\)/);
    assert.match(worker, /\^\(https\?:\|file:\|ftp:\)/);
    assert.match(worker, /chrome\.tabs\.query\(\{\}\)/);
    assert.match(worker, /isEligibleOverlayTab\(tab\.url\)/);
    assert.match(worker, /isEligibleOverlayTab\(candidate\.url\)/);
});

test('Popup polish preserves fixed width and touch-friendly controls', async () => {
    const popupCss = await read('popup/popup.css');
    assert.match(popupCss, /width:\s*380px;[\s\S]*min-width:\s*380px/);
    assert.match(popupCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(popupCss, /\.timer-display\s*\{[\s\S]*font-size:\s*1\.65rem/);
});


test('Floating clock handles extension reloads without unhandled context errors', async () => {
    const clock = await read('floating/clock.js');
    assert.match(clock, /extensionContextInvalid/);
    assert.match(clock, /isInvalidatedError/);
    assert.match(clock, /safeStorageGet/);
    assert.match(clock, /safeSendMessage/);
    assert.match(clock, /handleExtensionContextError/);
    assert.match(clock, /clearInterval\(activeInterval\)/);
    assert.match(clock, /document\.documentElement\.style\.display = 'none'/);
    assert.doesNotMatch(clock, /timerSnapshot = await chrome\.storage\.local\.get/);
    assert.doesNotMatch(clock, /await chrome\.runtime\.sendMessage\(\{ action: 'stop/);
});


test('Inactive Focus sessions cannot leave stale blocking rules behind', async () => {
    const worker = await read('background/service-worker.js');
    assert.match(worker, /isFocusSessionValid\(focusState, sites = \[\]\)/);
    assert.match(worker, /getFocusSessionEndTime\(focusState\)/);
    assert.match(worker, /clearInactiveFocusProtection\(focusState = null\)/);
    assert.match(worker, /await this\.disableSiteBlockingRange\(101, 200\)/);
    assert.match(worker, /if \(this\.isFocusSessionValid\(focusResult\.focusState, sites\)\)/);
    assert.match(worker, /await this\.clearInactiveFocusProtection\(result\.focusState\)/);
});

test('Popup keeps controls readable instead of collapsing or ellipsizing the main actions', async () => {
    const popupCss = await read('popup/popup.css');
    assert.match(popupCss, /width:\s*420px;/);
    assert.match(popupCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(popupCss, /white-space:\s*normal;/);
    assert.match(popupCss, /text-overflow:\s*clip;/);
});


test('Screen-time tracking survives MV3 suspension with alarm checkpoints', async () => {
    const tracker = await read('background/usage-tracker.js');
    assert.match(tracker, /usageAlarmName\s*=\s*'timeShieldUsageTick'/);
    assert.match(tracker, /chrome\.alarms\.create\(this\.usageAlarmName,\s*\{\s*periodInMinutes:\s*0\.5\s*\}\)/);
    assert.match(tracker, /async handleUsageAlarm\(\)/);
    assert.match(tracker, /incrementUsage\(domain, \{ seconds: elapsedSeconds, countOpen: false \}\)/);
    assert.match(tracker, /_incrementUsage\(domain, \{ countOpen = false, seconds = 1 \} = \{\}\)/);
    assert.match(tracker, /data\[today\]\[domain\] = \(data\[today\]\[domain\] \|\| 0\) \+ elapsedSeconds/);
});

test('Screen-time renderer refreshes from storage changes and compares local calendar days', async () => {
    const options = await read('options/options.js');
    assert.match(options, /chrome\.storage\.onChanged\.addListener/);
    assert.match(options, /changes\.siteUsageData \|\| changes\.siteUsageTimeline \|\| changes\.siteOpenCounts/);
    assert.match(options, /d\.setHours\(0, 0, 0, 0\)/);
    assert.match(options, /Math\.round\(\(refDay\.getTime\(\) - d\.getTime\(\)\)/);
});


test('Pause verification shows a ten-second countdown before the challenge', async () => {
    const helper = await read('floating/pause-challenge.js');
    assert.match(helper, /startPreparation\(/);
    assert.match(helper, /let remaining = 10/);
    assert.match(helper, /pausePreparationCountdown/);
    assert.match(helper, /window\.setInterval\(tick, 1000\)/);
    assert.match(helper, /window\.TimeShieldPauseChallenge\.render/);
    assert.match(helper, /id="submitChallenge"/);
    assert.match(helper, /Continue Anyway/);
});

test('All pause block pages use the shared preparation flow', async () => {
    const sources = await Promise.all([
        read('floating/focus-block.js'),
        read('floating/schedule-block.js'),
        read('floating/sleep-block.js'),
        read('floating/limit-block.js'),
        read('floating/nuclear-block.js')
    ]);
    for (const source of sources) {
        assert.match(source, /TimeShieldPauseChallenge\?\.startPreparation/);
        assert.match(source, /requestChallenge:/);
        assert.match(source, /action: 'pauseBlocking'/);
    }
});


test('Nuclear Mode is wired as an isolated opt-in protection feature', async () => {
    const manifest = JSON.parse(await read('manifest.json'));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.html');
    const popupJs = await read('popup/popup.js');
    const blockPage = await read('floating/nuclear-block.html');
    const blockController = await read('floating/nuclear-block.js');

    assert.ok(resources.includes('floating/nuclear-block.html'));
    assert.ok(resources.includes('floating/nuclear-block.js'));
    assert.match(blockPage, /Nuclear Mode Active/);
    assert.match(blockPage, /pause-challenge\.js/);
    assert.match(blockController, /pauseContext: 'general'/);
    assert.match(worker, /startNuclearMode/);
    assert.match(worker, /stopNuclearMode/);
    assert.match(worker, /getNuclearModeState/);
    assert.match(worker, /addNuclearWhitelistSite/);
    assert.match(worker, /removeNuclearWhitelistSite/);
    assert.match(worker, /enableSiteBlocking\(\['\*'\], 501, 'nuclear'/);
    assert.match(worker, /nuclearMode/);
    assert.match(worker, /disableSiteBlockingRange\(501, 600\)/);
    assert.match(worker, /whitelist\.slice\(0, 8\)|slice\(0, 8\)/);
    assert.match(popup, /id="nuclearCard"/);
    assert.match(popup, /id="nuclearHours"/);
    assert.match(popup, /id="nuclearMinutes"/);
    assert.match(popup, /id="nuclearWhitelist"/);
    assert.match(popupJs, /handleNuclearMode/);
    assert.match(popupJs, /showNuclearStartWarning/);
});


test('Screen-time tracking follows tab lifecycle changes without overcounting', async () => {
    const tracker = await read('background/usage-tracker.js');
    assert.match(tracker, /chrome\.tabs\.onRemoved\.addListener/);
    assert.match(tracker, /this\.activeTabId === tabId/);
    assert.match(tracker, /chrome\.tabs\.onReplaced\.addListener/);
    assert.match(tracker, /this\.activeTabId === removedTabId/);
    assert.match(tracker, /this\.handleTabChange\(addedTabId\)/);
    assert.match(tracker, /this\.startTracking\(domain, tabId\)/);
});


test('Inactive Focus cleanup removes legacy redirect rules and clears on refresh', async () => {
    const worker = await read('background/service-worker.js');
    assert.match(worker, /removeDynamicRulesForBlockPage\('floating\/focus-block\.html'\)/);
    assert.match(worker, /await this\.disableSiteBlockingRange\(1, 200\)/);
    assert.match(worker, /action\.redirect\.url\.startsWith\(extensionUrl\)/);
    assert.match(worker, /await this\.clearInactiveFocusProtection\(focusResult\.focusState\)/);
});


test('Existing installations remove seeded social sites without reintroducing automatic defaults', async () => {
    const worker = await read('background/service-worker.js');
    assert.match(worker, /manualOnlyDefaultsClearedVersion\) >= 2/);
    assert.match(worker, /manualOnlyDefaultsClearedVersion: 2/);
    assert.match(worker, /removeAutomaticDomains/);
    assert.match(worker, /const scheduledSites = removeAutomaticDomains\(data\.scheduledBlockedSites\)/);
});

test('Screen-time storage writes are serialized across domains', async () => {
    const tracker = await read('background/usage-tracker.js');
    assert.match(tracker, /this\.writeQueue = Promise\.resolve\(\)/);
    assert.match(tracker, /complete usage object/);
    assert.match(tracker, /this\.writeQueue\s*\.catch\(\(\) => undefined\)/);
    assert.doesNotMatch(tracker, /this\.writeQueues\s*=\s*new Map/);
});

test('Pause block pages use callback-backed runtime responses', async () => {
    const sources = await Promise.all([
        read('floating/focus-block.js'),
        read('floating/schedule-block.js'),
        read('floating/sleep-block.js'),
        read('floating/limit-block.js'),
        read('floating/nuclear-block.js'),
        read('floating/pause-overlay.js')
    ]);
    for (const source of sources) {
        assert.match(source, /new Promise\(\(resolve, reject\) =>/);
        assert.match(source, /chrome\.runtime\.lastError/);
        assert.match(source, /else resolve\(response\)/);
    }
});


test('Disabled schedule state remains opt-in and is immediately rechecked', async () => {
    const options = await read('options/options.js');
    const worker = await read('background/service-worker.js');
    assert.match(options, /this\.scheduledBlocking\.enabled = wantsEnable/);
    assert.match(options, /chrome\.runtime\.sendMessage\(\{ action: 'checkScheduledBlocking' \}\)/);
    assert.match(worker, /if \(scheduledActive\)[\s\S]*?enableScheduledBlocking\(\);[\s\S]*?disableScheduledBlocking\(\);/);
    assert.match(worker, /await this\.disableSiteBlockingRange\(201, 300\)/);
});


test('Pause preparation exposes a visible failure path instead of a stuck zero state', async () => {
    const helper = await read('floating/pause-challenge.js');
    assert.match(helper, /verification request timed out/);
    assert.match(helper, /retryPausePreparation/);
    assert.match(helper, /Unable to prepare verification/);
});


test('Packaged Focus rules cannot automatically block social sites', async () => {
    const manifest = JSON.parse(await read('manifest.json'));
    const resources = manifest.declarative_net_request?.rule_resources || [];
    assert.equal(resources.some(resource => resource.id === 'focus-rules'), false);
    const worker = await read('background/service-worker.js');
    assert.match(worker, /disablePackagedFocusRuleset/);
    assert.match(worker, /disableRulesetIds:\s*\['focus-rules'\]/);
});


test('Pause verification is not blocked by general worker initialization', async () => {
    const worker = await read('background/service-worker.js');
    assert.match(worker, /const pauseRequest = message\.action === 'pauseBlocking'/);
    assert.match(worker, /if \(!pauseRequest\) await this\.initPromise/);
});


test('Pause requests still return a challenge after the initialization bypass', async () => {
    const worker = await read('background/service-worker.js');
    assert.match(worker, /case 'pauseBlocking':/);
    assert.match(worker, /requiresPassword: true/);
    assert.match(worker, /await chrome\.storage\.local\.set\(\{\s*pauseChallenge:/);
});


test('Focus block page reports a retryable pause request failure', async () => {
    const helper = await read('floating/pause-challenge.js');
    assert.match(helper, /requestChallenge\(\)/);
    assert.match(helper, /verification request timed out/);
    assert.match(helper, /Try Again/);
});


test('Reset All Data restores a clean disabled state without automatic sites', async () => {
    const worker = await read('background/service-worker.js');
    const options = await read('options/options.html');
    const optionsJs = await read('options/options.js');
    assert.match(options, /id="resetAllUserData"/);
    assert.match(optionsJs, /action: 'resetAllUserData'/);
    assert.match(worker, /case 'resetAllUserData'/);
    assert.match(worker, /await chrome\.storage\.local\.clear\(\)/);
    assert.match(worker, /getCleanUserDataDefaults\(\)/);
    assert.match(worker, /focusBlockedSites: \[\]/);
    assert.match(worker, /scheduledBlockedSites: \[\]/);
    assert.match(worker, /timeLimits: \[\]/);
    assert.match(worker, /scheduledBlocking: \{\s*enabled: false/);
    assert.match(worker, /sleepBlocking: \{\s*enabled: false/);
    assert.match(worker, /timeLimitsEnabled: false/);
    assert.match(worker, /nuclearMode:\s*\{\s*isActive: false/);
    assert.match(worker, /await this\.disableSiteBlockingRange\(501, 600\)/);
    assert.match(worker, /clockVisible: false/);
});


test('Release manifest contains only unique runtime resources', async () => {
    const manifest = JSON.parse(await read('manifest.json'));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
    assert.equal(resources.filter((resource) => resource === 'floating/limit-block.html').length, 1);
    assert.equal(resources.includes('assets/fonts/*'), false);
    assert.equal(manifest.declarative_net_request?.rule_resources?.some((resource) => resource.id === 'focus-rules'), false);
});


test('Floating clock follows the Fullscreen API and keeps all-tab visibility synchronized', async () => {
    const blocker = await read('content/blocker.js');
    const worker = await read('background/service-worker.js');
    assert.match(blocker, /document\.addEventListener\('fullscreenchange'/);
    assert.match(blocker, /document\.fullscreenElement/);
    assert.match(blocker, /nextParent\.appendChild\(wrapper\)/);
    assert.match(blocker, /widget\.style\.zIndex = '2147483647'/);
    assert.match(worker, /case 'toggleClock':[\s\S]*?await this\.toggleFloatingClock\(message\.visible\);[\s\S]*?await this\.ensureContentScriptInjected\(\)/);
    assert.match(worker, /tabs\.forEach\(tab => \{[\s\S]*?action: 'toggleClock'/);
    assert.match(blocker, /clockVisible: false/);
    assert.match(blocker, /action: 'toggleClock', visible: false/);
});


test('Control center shows only the active site limit', async () => {
    const html = await read('popup/popup.html');
    const popup = await read('popup/popup.js');
    const css = await read('popup/popup.css');
    assert.match(html, /id="siteLimitStatus"/);
    assert.match(html, /Site Limits/);
    assert.match(popup, /loadTimeLimitStatus\(\)/);
    assert.match(popup, /chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
    assert.match(popup, /getActiveSiteHostname\(\)/);
    assert.match(popup, /normalizeLimitSite\(limit\?\.site\) === activeSite/);
    assert.match(popup, /const activeLimit = activeSite/);
    assert.match(popup, /Site limit is not set for this site\./);
    assert.match(popup, /timeLimitsEnabled/);
    assert.match(popup, /siteUsageData/);
    assert.match(popup, /new Date\(\)\.toDateString\(\)/);
    assert.match(popup, /remainingSeconds/);
    assert.match(popup, /30_000/);
    assert.match(popup, /chrome\.storage\.onChanged\.addListener/);
    assert.match(popup, /chrome\.tabs\.onActivated/);
    assert.match(popup, /chrome\.tabs\.onUpdated/);
    assert.match(css, /site-limit-track/);
    assert.match(css, /site-limit-remaining\.is-critical/);
});


test('Repository ignores generated metadata and local release archives', async () => {
    const ignore = await read('.gitignore');
    assert.match(ignore, /_metadata\//);
    assert.match(ignore, /Manifest\.JSON/);
    assert.match(ignore, /\*\.zip/);
});


test('Light-theme popup header keeps the brand and format control readable', async () => {
    const html = await read('popup/popup.html');
    const css = await read('popup/popup.css');
    assert.match(html, /id="toggleFormat" class="btn-mini"/);
    assert.match(css, /body\.theme-light \.popup-header \.brand h1/);
    assert.match(css, /-webkit-text-fill-color: #ffffff/);
    assert.match(css, /body\.theme-light \.popup-header #toggleFormat/);
    assert.match(css, /color: #ffffff/);
    assert.match(css, /border-color: rgba\(255, 255, 255, 0\.48\)/);
});


test('Pause screens keep readable typography at normal browser zoom', async () => {
    const stylesheet = await read('floating/pause-screen.css');
    const challenge = await read('floating/pause-challenge.js');
    const manifest = JSON.parse(await read('manifest.json'));
    const pausePages = await Promise.all([
        'floating/pause-overlay.html',
        'floating/focus-block.html',
        'floating/schedule-block.html',
        'floating/limit-block.html',
        'floating/sleep-block.html'
    ].map(read));
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);

    assert.equal(resources.includes('floating/pause-screen.css'), true);
    pausePages.forEach((page) => assert.match(page, /rel="stylesheet" href="pause-screen\.css"/));
    assert.match(stylesheet, /#durationView > h3/);
    assert.match(stylesheet, /font-size: clamp\(2rem, 4vw, 3\.25rem\)/);
    assert.match(stylesheet, /pause-preparation-countdown/);
    assert.match(stylesheet, /font-size: 3rem/);
    assert.match(stylesheet, /pause-challenge-actions/);
    assert.match(stylesheet, /font-size: 1\.1rem !important/);
    assert.match(challenge, /class="pause-preparation-countdown"/);
    assert.match(challenge, /class="pause-challenge-actions"/);
});


test('One-minute general pauses get two daily free uses before verification', async () => {
    const worker = await read('background/service-worker.js');
    const helper = await read('floating/pause-challenge.js');
    const options = await read('options/options.html');

    assert.equal(options.includes('Free 5-minute pauses are limited'), false);
    assert.match(worker, /shortPauseUsage: \{ count: 0, lastResetDate: today \}/);
    assert.match(worker, /async tryFreeOneMinutePause\(\)/);
    assert.match(worker, /if \(this\.shortPauseUsage\.count >= 2\) return null/);
    assert.match(worker, /const isOneMinuteGeneralPause = pauseContext === 'general' && durationMs === 60 \* 1000/);
    assert.match(worker, /const freePauseResult = await this\.tryFreeOneMinutePause\(\)/);
    assert.match(worker, /freePause: true/);
    assert.match(helper, /pauseContext === 'general' && durationMs === 60 \* 1000/);
    assert.match(helper, /if \(response\?\.success\) \{\s*showSuccess\(pauseSection\)/);
    assert.match(helper, /response\?\.requiresPassword[\s\S]*?TimeShieldPauseChallenge\.render/);
});


test('README provides a collapsed gallery for every repository screenshot', async () => {
    const readme = await read('README.md');
    const screenshotFiles = await readdir('assets/screenshots');
    assert.match(readme, /<details>\s*\n<summary>View the TimeShield screenshots<\/summary>/);
    assert.match(readme, /<\/details>/);
    for (const filename of screenshotFiles.filter((name) => /\.(png|jpe?g|webp)$/i.test(name))) {
        assert.ok(readme.includes(`assets/screenshots/${filename}`), `README is missing ${filename}`);
    }
});

test('README links to the real release without a Visit Repository badge', async () => {
    const readme = await read('README.md');
    assert.match(readme, /img\.shields\.io\/github\/v\/release\/abishekgh-6\/TimeShield\?display_name=tag&sort=semver/);
    assert.doesNotMatch(readme, /display_name=tag\\&sort=semver/);
    assert.doesNotMatch(readme, /\[!\[Visit Repository\]/);
    assert.doesNotMatch(readme, /smoke%20tests|smoke tests-49/);
    assert.match(readme, /https:\/\/github\.com\/abishekgh-6\/TimeShield\)/);
    assert.match(readme, /releases\/download\/v2\.3\.3\/TimeShield-v2\.3\.3\.zip/);
});


test('Repository traffic tracking uses official GitHub metrics and persists history', async () => {
    const workflow = await read('.github/workflows/repository-traffic.yml');
    const collector = await read('scripts/collect-repository-traffic.mjs');
    const badge = JSON.parse(await read('data/repository-traffic-badge.json'));
    const snapshot = JSON.parse(await read('data/repository-traffic.json'));
    const readme = await read('README.md');

    assert.match(workflow, /cron: "17 2 \* \* \*"/);
    assert.match(workflow, /REPO_TRAFFIC_TOKEN/);
    assert.match(workflow, /node scripts\/collect-repository-traffic\.mjs/);
    assert.match(workflow, /data\/repository-traffic-badge\.json/);
    assert.match(workflow, /git push/);
    assert.match(collector, /repos\/\$\{owner\}\/\$\{repo\}\/traffic\/\$\{endpoint\}/);
    assert.match(collector, /uniqueVisitors/);
    assert.match(collector, /uniqueCloners/);
    assert.match(collector, /dataRetentionDays: 14/);
    assert.equal(badge.label, 'unique visitors (14d)');
    assert.equal(typeof badge.message, 'string');
    assert.equal(snapshot.repository, 'abishekgh-6/TimeShield');
    assert.match(collector, /https:\/\/api\.github\.com\/repos\/\$\{owner\}\/\$\{repo\}\/traffic/);
    assert.equal(snapshot.source, 'GitHub repository traffic API');
    assert.equal(snapshot.dataRetentionDays, 14);
    assert.ok(Object.keys(snapshot.daily).length > 0);
    assert.match(readme, /Unique Visitors/);
    assert.match(readme, /img\.shields\.io\/endpoint\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2Fabishekgh-6%2FTimeShield%2Fmain%2Fdata%2Frepository-traffic-badge\.json/);
    assert.match(readme, /data\/repository-traffic\.json/);
});
