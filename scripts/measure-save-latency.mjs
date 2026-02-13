#!/usr/bin/env node

/**
 * Measure save creation latency in production.
 *
 * Example:
 * node scripts/measure-save-latency.mjs \
 *   --cookie "__Secure-better-auth.session_token=..." \
 *   --team "retro-rangers" \
 *   --manager "Perf Tester"
 */

function getArg(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const cookie = getArg('--cookie');
const teamId = getArg('--team', 'retro-rangers');
const managerName = getArg('--manager', 'Perf Tester');
const pagesOrigin = getArg('--pages', 'https://retrofoot-web.pages.dev');
const workerOrigin = getArg(
  '--worker',
  'https://retrofoot-api.vellerbauer.workers.dev',
);

if (!cookie) {
  console.error('Missing required --cookie argument');
  process.exit(1);
}

function buildBody(label) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    name: `Perf ${label} ${suffix}`,
    teamId,
    managerName,
  };
}

async function runRequest(label, url, body) {
  const started = performance.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Math.round(performance.now() - started);
  const payload = await response.json().catch(() => ({}));
  return {
    label,
    url,
    status: response.status,
    elapsedMs,
    setupStatus: payload.setupStatus ?? 'unknown',
    saveId: payload.saveId ?? null,
    timingsMs: payload.timingsMs ?? null,
    error: payload.error ?? null,
  };
}

async function main() {
  const tests = [
    {
      label: 'pages_sync_cold',
      url: `${pagesOrigin}/api/save?mode=sync`,
      body: buildBody('pages-sync-cold'),
    },
    {
      label: 'pages_sync_warm',
      url: `${pagesOrigin}/api/save?mode=sync`,
      body: buildBody('pages-sync-warm'),
    },
    {
      label: 'worker_sync_cold',
      url: `${workerOrigin}/api/save?mode=sync`,
      body: buildBody('worker-sync-cold'),
    },
    {
      label: 'worker_sync_warm',
      url: `${workerOrigin}/api/save?mode=sync`,
      body: buildBody('worker-sync-warm'),
    },
    {
      label: 'pages_async_acceptance',
      url: `${pagesOrigin}/api/save`,
      body: buildBody('pages-async'),
    },
  ];

  const results = [];
  for (const test of tests) {
    try {
      const result = await runRequest(test.label, test.url, test.body);
      results.push(result);
      console.log(
        `${result.label}: status=${result.status} elapsed=${result.elapsedMs}ms setup=${result.setupStatus}`,
      );
    } catch (error) {
      results.push({
        label: test.label,
        url: test.url,
        status: 0,
        elapsedMs: -1,
        setupStatus: 'failed',
        saveId: null,
        timingsMs: null,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`${test.label}: failed`);
    }
  }

  console.log('\nDetailed results:\n');
  console.log(JSON.stringify(results, null, 2));
}

void main();
