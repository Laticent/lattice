#!/usr/bin/env node
/**
 * studio-sync-bench — how fast the Studio keeps its panes in step, in the real production build.
 *
 * WHY: the Studio's editor, slide rail and live preview follow one another on every caret move,
 * keystroke and rail click. Unit tests prove they AGREE; only a browser shows how long agreeing
 * takes, and the cost grows with deck size even when the slide never changes (measured in
 * engineering/decisions/2026-10-15-fuoco-focus-sync.md §4, which this tool produced). It drives
 * headless Chromium through five scenarios on a deck of N slides cut from the gallery deck:
 *   A. caret walk at held-key pace (ArrowDown every KEY_MS);
 *   B. caret walk, one line per 400 ms;
 *   C. typing 35 characters inside one slide;
 *   D. rail clicks (markdown mode only);
 *   E. scenario A again after a session of edits (does it degrade over time?).
 * Per scenario it reports, median / p90 / max:
 *   input → next frame   — keydown to the first animation frame after it;
 *   event-timing         — the browser's own Event Timing duration (what INP is built from);
 *                          about 16 ms is the floor for any key press, since it includes the paint;
 *   slide change → rail / preview — time until the rail highlight and the preview's shown slide
 *                          reach the value they settle on;
 *   long tasks           — count, total and worst.
 * It reads only the DOM (the rail's aria-current pill, the preview frame's section), so it
 * measures any build without changing it.
 *
 * Usage (needs `cd docs && npm run build:e2e && npx astro preview --port 4321` running):
 *   node tools/studio-sync-bench.mjs [slides=123] [markdown|compose] [label]
 *   env: KEY_MS=90 · BASE=http://localhost:4321 · CHROME_PATH (default /opt/pw-browsers/chromium)
 * Writes .scratch/sync/<label>.json. On-demand; not a gate.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'docs', 'package.json'))('playwright');
const BASE = process.env.BASE || 'http://localhost:4321';
const N = Number(process.argv[2] || 123);
const MODE = process.argv[3] || 'markdown';
const LABEL = process.argv[4] || `${N}-${MODE}`;
const RESULTS = {};
const KEY_MS = Number(process.env.KEY_MS || 90);

const gallery = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
const fm = gallery.match(/^---\n[\s\S]*?\n---\n/)[0];
const parts = gallery.slice(fm.length).split(/\n---\n/);
const deckParts = []; while (deckParts.length < N) deckParts.push(...parts);
const DECK = fm + deckParts.slice(0, N).join('\n---\n');

const q = (a, p) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : NaN; };
const fmt = (a) => `med ${q(a, .5).toFixed(0)} · p90 ${q(a, .9).toFixed(0)} · max ${q(a, 1).toFixed(0)} ms (n=${a.filter(Number.isFinite).length})`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' })); } catch {}
  const now = () => performance.now();
  window.__k = []; window.__f = []; window.__ev = []; window.__lt = [];
  document.addEventListener('keydown', (e) => window.__k.push({ t: now(), key: e.key }), true);
  document.addEventListener('pointerdown', () => window.__k.push({ t: now(), key: 'click' }), true);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__ev.push({ t: e.startTime, d: e.duration, name: e.name, proc: e.processingEnd - e.processingStart }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  const tick = () => {
    if (window.__rec) {
      const rail = document.querySelector('nav[aria-label="Slide navigator"] [aria-current="true"]');
      const fr = document.querySelector('[aria-label="Live deck preview"] iframe.live');
      let pv = '';
      try { const s = fr?.contentDocument?.querySelector('section[data-lattice-slide]'); pv = s ? (s.getAttribute('data-lattice-slide') + '|' + (s.textContent || '').slice(0, 80)) : ''; } catch {}
      window.__f.push({ t: now(), rail: rail?.textContent?.match(/^\d+/)?.[0] || '', pv });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
const ed = page.getByLabel('Deck source');
await ed.waitFor({ timeout: 60000 });
await ed.click();
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.press('Delete');
await page.keyboard.insertText(DECK);
await page.waitForTimeout(4000);
if (MODE === 'compose') {
  await page.getByRole('button', { name: 'Compose — rich editor' }).first().click();
  await page.waitForTimeout(3000);
  await page.locator('.ProseMirror').first().click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('ControlOrMeta+Home');
} else {
  await ed.click();
  await page.keyboard.press('ControlOrMeta+Home');
}
await page.waitForTimeout(1500);

// Per-input analysis: for each input, the rail/preview value it settles to, and when it first got there.
function analyze(rec, label) {
  const { k, f, ev } = rec;
  const caretFrame = [], railLat = [], pvLat = [], interact = [];
  let crossings = 0, _railMiss = 0, pvMiss = 0;
  for (let i = 0; i < k.length; i++) {
    const t = k[i].t, tn = k[i + 1]?.t ?? t + 3000;
    const before = [...f].reverse().find((x) => x.t <= t);
    const window_ = f.filter((x) => x.t > t && x.t < tn);
    const first = window_[0]; if (first) caretFrame.push(first.t - t);
    const e = ev.find((x) => Math.abs(x.t - t) < 8); if (e) interact.push(e.d);
    const settledRail = window_.at(-1)?.rail; const settledPv = window_.at(-1)?.pv;
    if (before && settledRail && settledRail !== before.rail) {
      crossings++;
      const r = window_.find((x) => x.rail === settledRail); railLat.push(r ? r.t - t : NaN);
      if (settledPv !== before.pv) { const p = window_.find((x) => x.pv === settledPv); pvLat.push(p ? p.t - t : NaN); } else pvMiss++;
    }
  }
  console.log(`\n## ${label}  (${N} slides, ${MODE}, ${k.length} inputs, ${crossings} slide changes)`);
  console.log(`  input → next frame          ${fmt(caretFrame)}`);
  console.log(`  event-timing (≥16ms only)   ${fmt(interact)}  [${interact.length}/${k.length} inputs over 16ms]`);
  console.log(`  slide change → rail         ${fmt(railLat)}`);
  console.log(`  slide change → preview      ${fmt(pvLat)}  [preview did not follow within the window: ${pvMiss}]`);
  const lt = rec.lt;
  RESULTS[label] = { inputs: k.length, slideChanges: crossings, inputToFrame: [q(caretFrame, .5), q(caretFrame, .9)], eventTiming: [q(interact, .5), q(interact, .9)], rail: [q(railLat, .5), q(railLat, .9)], preview: [q(pvLat, .5), q(pvLat, .9)], longTasks: lt.length, longTaskMs: Math.round(lt.reduce((s, x) => s + x.d, 0)) };
  console.log(`  long tasks: ${lt.length}, total ${lt.reduce((s, x) => s + x.d, 0).toFixed(0)} ms, worst ${q(lt.map((x) => x.d), 1).toFixed(0)} ms`);
}
async function record(label, fn) {
  await page.evaluate(() => { window.__k = []; window.__f = []; window.__ev = []; window.__lt = []; window.__rec = true; });
  await fn();
  await page.waitForTimeout(2500);
  const rec = await page.evaluate(() => { window.__rec = false; return { k: window.__k, f: window.__f, ev: window.__ev, lt: window.__lt }; });
  analyze(rec, label);
  return rec;
}
const heap = async () => (await page.evaluate(() => performance.memory?.usedJSHeapSize / 1e6 || 0)).toFixed(0);

console.log(`heap at start: ${await heap()} MB`);
await record('A. caret walk (ArrowDown, held-key pace)', async () => { for (let i = 0; i < 260; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(KEY_MS); } });
await record('B. caret walk, slow (one line per 400ms)', async () => { for (let i = 0; i < 40; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400); } });
await record('C. typing inside a slide (35 chars @110ms)', async () => { await page.keyboard.press('End'); for (const ch of ' and a few more words typed here.') { await page.keyboard.type(ch); await page.waitForTimeout(110); } });
if (MODE === 'markdown') {
  await record('D. rail click → slide', async () => {
    for (const i of [5, 40, 12, 90, 3, 60, 77, 20]) { if (i >= N) continue; await page.locator('nav[aria-label="Slide navigator"] button').nth(i).click(); await page.waitForTimeout(900); }
  });
}
// over time: a long editing session, then re-measure A
await page.locator(MODE === 'compose' ? '.ProseMirror' : '.cm-content').first().focus();
for (let r = 0; r < 6; r++) { for (const ch of ' more text') await page.keyboard.type(ch); for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown'); }
console.log(`\nheap after ~60 edits + 150 moves: ${await heap()} MB`);
await record('E. caret walk again, after a session of edits', async () => { for (let i = 0; i < 260; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(KEY_MS); } });
await browser.close();
fs.mkdirSync(path.join(ROOT, '.scratch', 'sync'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.scratch', 'sync', `${LABEL}.json`), JSON.stringify({ slides: N, mode: MODE, results: RESULTS }, null, 1));
