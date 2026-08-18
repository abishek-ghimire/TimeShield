import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_PATH = `${ROOT}/data/repository-traffic.json`;
const BADGE_PATH = `${ROOT}/data/repository-traffic-badge.json`;
const API_VERSION = "2026-03-10";
const SCHEMA_VERSION = 1;

function parseRepository(value) {
  const match = String(value || "").trim().match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repository form.");
  }
  return { owner: match[1], repo: match[2] };
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function dateKey(timestamp) {
  return String(timestamp || "").slice(0, 10);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fetchTraffic(owner, repo, token, endpoint) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/traffic/${endpoint}?per=day`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "TimeShield-repository-traffic-tracker",
      "X-GitHub-Api-Version": API_VERSION,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub traffic request failed (${response.status}): ${body}`);
  }

  return response.json();
}

export function mergeTraffic(existing, views, clones, recordedAt = new Date().toISOString()) {
  const daily = { ...(existing?.daily || {}) };

  for (const item of views.views || []) {
    const day = dateKey(item.timestamp);
    if (!day) continue;
    daily[day] = {
      ...(daily[day] || {}),
      views: asNumber(item.count),
      uniqueVisitors: asNumber(item.uniques),
    };
  }

  for (const item of clones.clones || []) {
    const day = dateKey(item.timestamp);
    if (!day) continue;
    daily[day] = {
      ...(daily[day] || {}),
      clones: asNumber(item.count),
      uniqueCloners: asNumber(item.uniques),
    };
  }

  const orderedDaily = Object.fromEntries(
    Object.entries(daily)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, values]) => [day, {
        views: asNumber(values.views),
        uniqueVisitors: asNumber(values.uniqueVisitors),
        clones: asNumber(values.clones),
        uniqueCloners: asNumber(values.uniqueCloners),
      }]),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    repository: existing?.repository || null,
    source: "GitHub repository traffic API",
    dataRetentionDays: 14,
    lastUpdated: recordedAt,
    latestWindow: {
      start: views.views?.[0]?.timestamp || null,
      end: views.views?.at(-1)?.timestamp || null,
      views: asNumber(views.count),
      uniqueVisitors: asNumber(views.uniques),
      clones: asNumber(clones.count),
      uniqueCloners: asNumber(clones.uniques),
    },
    daily: orderedDaily,
  };
}

export function makeBadgeData(metrics) {
  const uniqueVisitors = asNumber(metrics?.uniqueVisitors);
  return {
    schemaVersion: SCHEMA_VERSION,
    label: "unique visitors (14d)",
    message: String(uniqueVisitors),
    color: uniqueVisitors > 0 ? "brightgreen" : "lightgrey",
    cacheSeconds: 21600,
    isError: false,
  };
}

export async function collect({ token, repository, now = new Date() }) {
  if (!token) throw new Error("GITHUB_TOKEN is required to read repository traffic.");
  const { owner, repo } = parseRepository(repository);
  const [views, clones] = await Promise.all([
    fetchTraffic(owner, repo, token, "views"),
    fetchTraffic(owner, repo, token, "clones"),
  ]);
  const existing = await readJson(DATA_PATH, { daily: {} });
  const merged = mergeTraffic({ ...existing, repository }, views, clones, now.toISOString());
  const badge = makeBadgeData(merged.latestWindow);
  await writeFile(DATA_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  await writeFile(BADGE_PATH, `${JSON.stringify(badge, null, 2)}\n`, "utf8");
  return { merged, badge };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.REPO_TRAFFIC_TOKEN || process.env.GITHUB_TOKEN;
  const { merged } = await collect({ token, repository });
  console.log(JSON.stringify({
    repository: merged.repository,
    lastUpdated: merged.lastUpdated,
    latestWindow: merged.latestWindow,
  }, null, 2));
}
