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

test('Pause challenge remains exactly 25 lowercase letters', async () => {
    const helper = await read('floating/pause-challenge.js');
    const worker = await read('background/service-worker.js');
    assert.match(helper, /25/);
    assert.match(helper, /lowercase/);
    assert.match(worker, /generatePauseChallenge/);
    assert.match(worker, /new Uint32Array\(25\)/);
    assert.match(worker, /alphabet\.length/);
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
    for (const id of ['siteWarningFirstMinutes', 'showBlockingCountdown', 'safeModeEnabled', 'usageRetentionDays', 'runDiagnostics', 'cleanupUsageNow']) {
        assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
    }
    for (const source of [html, options, worker, popup]) {
        assert.doesNotMatch(source, /syncConflictPanel|keepLocalSync|keepCloudSync|Cloud Sync|Account Access|syncService/);
    }
    assert.doesNotMatch(html, /Pomodoro Timer/);
    assert.match(options, /getDiagnostics/);
    assert.match(popup, /popupProtectionStatus/);
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


test('Manual blocking lists, independent sleep enforcement, and delayed focus confirmations are wired', async () => {
    const options = await read('options/options.js');
    const worker = await read('background/service-worker.js');
    const popup = await read('popup/popup.js');

    assert.doesNotMatch(options, /categoryPreset|scheduleCategoryPreset|renderBlockingCategoryControls|getCategoryEntriesForTarget|saveBlockingCategories/);
    assert.doesNotMatch(worker, /blockingCategories|getActiveBlockingSites/);
    assert.match(options, /'scheduledBlockedSites'/);
    assert.match(worker, /Every pause duration requires the same visible confirmation word/);
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
    assert.match(focusBlock, /Preparing your verification challenge/);
    assert.match(focusBlock, /TimeShieldPauseChallenge\.render/);
    assert.match(pauseOverlay, /const motTextEl.*motivationText/);
    assert.match(pauseOverlay, /requiresPassword/);

    for (const source of [options, popup]) {
        assert.match(source, /showProtectionStep\(actionLabel, step, totalSteps, message, delaySeconds = 8\)/);
        assert.match(source, /Focus protection · Step/);
        assert.match(source, /Continue will appear in \$\{remainingSeconds\}s/);
        assert.match(source, /continueBtn\.hidden = false/);
        assert.match(source, /Stay Focused/);
        assert.match(source, /This is the final check/);
    }
    assert.doesNotMatch(popup, /syncNow/);
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

    assert.match(worker, /Array\.isArray\(result\.scheduledBlockedSites\)/);
    assert.match(worker, /if \(sites\.length === 0\) \{\s*await this\.disableScheduledBlocking\(\);/);
    assert.doesNotMatch(worker, /scheduledBlockedSites \|\| StorageManager\.getDefaultBlockedSites\(\)/);
});
