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

test('Reliability controls and conflict-resolution UI are wired', async () => {
    const html = await read('options/options.html');
    const options = await read('options/options.js');
    const sync = await read('utils/sync-service.js');
    const popup = await read('popup/popup.js');
    for (const id of ['siteWarningFirstMinutes', 'showBlockingCountdown', 'safeModeEnabled', 'usageRetentionDays', 'runDiagnostics', 'cleanupUsageNow', 'syncConflictPanel', 'keepLocalSync', 'keepCloudSync']) {
        assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
    }
    assert.match(options, /resolveSyncConflict/);
    assert.match(options, /getDiagnostics/);
    assert.match(sync, /preserveConflict/);
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
