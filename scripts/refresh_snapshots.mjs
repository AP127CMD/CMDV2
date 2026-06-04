#!/usr/bin/env node
/* ============================================================================
 * AP127_V2 — refresh bundled data snapshots.
 *
 * V2 is a MIRROR, not a scraper. It pulls two already-published upstreams:
 *   1. flight-data.js   ← Command Center's published copy (raw GitHub).
 *                          CC runs the Playwright scrape; we just track its output.
 *   2. progress-data.js  ← the ap127-data-api Cloudflare Worker (same endpoint the
 *                          app fetches live; the snapshot is the offline fallback).
 *
 * No dependencies — uses Node 18+ global fetch. Run by .github/workflows/refresh-data.yml.
 * Writes files only when content changes; exits 0 always unless a fetch hard-fails.
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLIGHT_SRC = 'https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data.js';
const PROGRESS_SRC = 'https://ap127-data-api.anusorn-tanmetha.workers.dev';
// Use CF Pages URL instead of raw.githubusercontent.com for cache.json — CF Pages
// deploys within ~60s of a DB001 push so the file is always fresh when CMDV2 runs
// (~3-4 min after the dispatch cycle). raw.github CDN can lag 1-5 min and would
// still serve the previous cycle's data.
const NGT_SRC = 'https://ap127-db001.pages.dev/cache.json';
const RETRIES = 3, RETRY_DELAY_MS = 15_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, label) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!text || text.length < 100) throw new Error(`suspiciously short (${text.length} bytes)`);
      return text;
    } catch (e) {
      console.warn(`[${label}] attempt ${attempt}/${RETRIES} failed: ${e.message}`);
      if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
      else throw new Error(`[${label}] all ${RETRIES} attempts failed: ${e.message}`);
    }
  }
}

function writeIfChanged(file, content) {
  const path = join(ROOT, file);
  let prev = '';
  try { prev = readFileSync(path, 'utf8'); } catch { /* new file */ }
  // Compare ignoring volatile check-time stamps (the "// Generated" header and the
  // injected "_updated" field) so an unchanged payload doesn't produce a noisy
  // hourly no-op commit — only real data changes are written. Because we skip the
  // write when stripped content matches, the file keeps its previous _updated,
  // so that value reflects when the data LAST ACTUALLY CHANGED.
  const strip = s => s.replace(/^\/\/ Generated .*$/m, '').replace(/"_updated":"[^"]*"/g, '');
  if (strip(prev) === strip(content)) { console.log(`[${file}] unchanged — skip`); return false; }
  writeFileSync(path, content);
  console.log(`[${file}] updated (${content.length} bytes)`);
  return true;
}

const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ── 1. Operations: mirror Command Center's flight-data.js verbatim ──
const flightJs = await fetchText(FLIGHT_SRC, 'flight-data');
if (!/window\.FLIGHT_DATA\s*=/.test(flightJs)) throw new Error('[flight-data] upstream missing `window.FLIGHT_DATA =` — refusing to write');
writeIfChanged('flight-data.js', flightJs.trimEnd() + '\n');

// ── 2. Progress: fetch worker JSON, validate, wrap as window.PROGRESS_DATA ──
const progressRaw = await fetchText(PROGRESS_SRC, 'progress-data');
let progress;
try { progress = JSON.parse(progressRaw); } catch (e) { throw new Error(`[progress-data] not valid JSON: ${e.message}`); }
if (!Array.isArray(progress.ap127) || progress.ap127.length === 0) throw new Error('[progress-data] missing/empty ap127[] — refusing to write');
if (!Array.isArray(progress.cur127)) console.warn('[progress-data] note: cur127[] absent in worker response');
progress._updated = nowIso;
const progressJs =
  `// Snapshot of AP127 progress data from worker ap127-data-api — fallback when live fetch fails\n` +
  `// Generated ${nowIso}\n` +
  `window.PROGRESS_DATA = ${JSON.stringify(progress)};\n`;
writeIfChanged('progress-data.js', progressJs);

// ── 3. Training program: mirror NGT_001 cache.json (all 4 batches) as window.NGT_CACHE ──
// powers the multi-batch Overview / School's Performance / Simulation views.
const ngtRaw = await fetchText(NGT_SRC, 'ngt-data');
let ngt;
try { ngt = JSON.parse(ngtRaw); } catch (e) { throw new Error(`[ngt-data] not valid JSON: ${e.message}`); }
if (!Array.isArray(ngt.ap127) || ngt.ap127.length === 0) throw new Error('[ngt-data] missing/empty ap127[] — refusing to write');
['ap124', 'ap126', 'ap129', 'monthly', 'cur127'].forEach(k => { if (!ngt[k]) console.warn(`[ngt-data] note: ${k} absent in cache.json`); });
const ngtJs =
  `// Snapshot of AP127_NGT_001 cache.json (all 4 batches + monthly + curricula) — mirror of\n` +
  `// ${NGT_SRC}. Refreshed hourly. Powers the Training Program views.\n` +
  `// Generated ${nowIso}\n` +
  `window.NGT_CACHE = ${JSON.stringify(ngt)};\n`;
// writeIfChanged strips both the header and any "_updated" before diffing, so a new
// upstream rebuild timestamp alone won't trigger a commit — only real data changes do.
writeIfChanged('ngt-data.js', ngtJs);

console.log('Done.');
