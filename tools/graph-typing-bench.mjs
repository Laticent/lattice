#!/usr/bin/env node
/**
 * graph-typing-bench — time each stage of a graph chart's live redraw, key by key, in the real Studio.
 *
 * WHY: the Node bench (`npm run bench`, GRAPH LAYOUT) times the kernel, but a keystroke in the
 * Studio also pays the Studio's render, the pipeline's style and layout reads before it asks
 * the worker, the worker's queue, and the paint. Those only exist in a browser. This drives the
 * production-built Studio in headless Chromium, types the tail of three charts one key at a
 * time, and reports per stage (median / p90 ms):
 *   studio — key to the draw's start (the Studio's render and patch);
 *   before — the draw's start to its first worker post (the editor's thread before the post,
 *            plus any wait behind a busy worker);
 *   router — post to answer (the worker's queue, the layout, the messages);
 *   paint  — the answer's handler (adapter, SVG write, fit);
 *   total  — key to the first drawing of that key's text;
 *   stale  — answers a newer key had already made stale, of all answers.
 * It instruments the preview frame from outside (Worker.prototype.postMessage, the onmessage
 * setter, getComputedStyle on the figure), so it measures any build without changing it.
 * With CAPTURE=<file> it also appends the set of distinct drawings painted per chart (sha1 of
 * the SVG, viewBox and box style) and the settled one, for a byte-identity check across builds.
 *
 * Usage (needs `cd docs && npm run build:e2e && npx astro preview --port 4321` running):
 *   node tools/graph-typing-bench.mjs <label> [runs=3]
 *   env: IVS=600,150 (ms between keys) · CHARTS=chain11,incident,flow · BASE=http://localhost:4321
 *        CAPTURE=<file> · CHROME_PATH (default /opt/pw-browsers/chromium) · DUMP=1 (raw timeline)
 * Writes .scratch/typing/<label>.json. On-demand; not a gate. Born of
 * engineering/decisions/2026-10-05-graph-chart-typing-latency.md (the first harness was never
 * committed and had to be rebuilt).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'docs', 'package.json'))('playwright');

const BASE = process.env.BASE || 'http://localhost:4321';
const RUNS = Number(process.argv[3] || 3);
const LABEL = process.argv[2] || 'run';
const HEAD = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# Before\n\n---\n\n';
const CHARTS = {
  'chain11': `<!-- _class: state-chart -->\n\n## Eleven states.\n\n- Draft \`start\`\n  - -submit-> Submitted\n- Submitted\n  - -withdraw-> Draft\n  - -triage-> Triaged\n- Triaged\n  - -assign-> Assigned\n- Assigned\n  - -start-> In Progress\n- In Progress\n  - -block-> Blocked\n  - -finish-> Review\n- Blocked \`at-risk\`\n  - -unblock-> In Progress\n- Review\n  - -approve-> Approved\n  - -reject-> In Progress\n- Approved \`done\`\n  - -merge-> Merged\n- Merged\n  - -deploy-> Deployed\n- Deployed \`live\`\n  - -verify-> Closed\n- Closed \`end\`\n`,
  'incident': `<!-- _class: state-chart -->\n\n## Incident response.\n\n- Detected \`start\`\n  - -triage-> Triaged\n- Triaged \`on-track\`\n  - -assign-> Investigating\n  - -false alarm-> Resolved\n- Investigating\n  - -mitigate-> Mitigated\n  - -escalate-> Escalated\n  - -need more info-> Triaged\n- Mitigated\n  - -verify-> Monitoring\n- Escalated \`at-risk\`\n  - -hand off-> Mitigated\n  - -re-page-> Escalated\n- Monitoring \`live\`\n  - -resolve-> Resolved\n  - -regression-> Investigating\n- Resolved \`done\`\n  - -postmortem-> Closed\n- Closed \`end\`\n`,
  'flow': `<!-- _class: flowchart -->\n\n## Payments sit between four parties.\n\n- Customers \`:c1\`\n  - Shopper \`:circle\`\n    - -browses-> Storefront\n  - Merchant \`:circle\`\n    - -lists items-> Storefront\n- Platform \`:c2\`\n  - Storefront\n    - => Payments\n  - Payments\n    - -screens-> Fraud checks\n    - <-> Card networks\n  - Fraud checks \`:diamond\`\n  - -ships via-> Carriers\n- Partners \`:c3\`\n  - Card networks \`:square\`\n  - Carriers \`:square\`\n- Regulators \`:doc\`\n`,
};
// The tail typed key by key: a renamed last state/shape (no list auto-continuation in it).
const TAIL = { chain11: 'Closed `end`\n', incident: 'Closed `end`\n', flow: 'Regulators `:doc`\n' };

const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const p90 = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]; };

async function frameOf(page) {
  for (let i = 0; i < 200; i++) {
    const h = await page.$('[aria-label="Live deck preview"] iframe.live');
    if (h) { const fr = await h.contentFrame(); if (fr) return fr; }
    await page.waitForTimeout(100);
  }
  throw new Error('no preview frame');
}

async function one(browser, chart, interval) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' })); } catch {}
    window.__keys = [];
    document.addEventListener('keydown', () => window.__keys.push(performance.timeOrigin + performance.now()), true);
  });
  await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Deck source').waitFor({ timeout: 60000 });
  const sel = chart === 'flow' ? '.flowchart-figure' : '.state-chart-figure';
  const attr = chart === 'flow' ? 'data-fc-drawn' : 'data-sc-drawn';
  const setAll = async (t) => {
    await page.getByLabel('Deck source').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(t);
  };
  await setAll(HEAD + '# plain\n');
  await page.waitForTimeout(1500);
  const fr = await frameOf(page);
  await fr.evaluate((sel) => {
    const w = window;
    const T = () => performance.timeOrigin + performance.now();
    w.__ev = { posts: [], answers: [], patches: [] };
    let wid = 0;
    const post = w.Worker.prototype.postMessage;
    w.Worker.prototype.postMessage = function (d, ...r) {
      if (!this.__wid) this.__wid = ++wid;
      w.__ev.posts.push({ t: T(), w: this.__wid, id: d?.id });
      return post.call(this, d, ...r);
    };
    const desc = Object.getOwnPropertyDescriptor(w.Worker.prototype, 'onmessage');
    Object.defineProperty(w.Worker.prototype, 'onmessage', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(fn) {
        const self = this;
        desc.set.call(this, function (e) {
          const t0 = T();
          const r = fn.call(this, e);
          w.__ev.answers.push({ t: t0, end: T(), w: self.__wid, id: e.data?.id });
          const f = document.querySelector(sel); const g = f?.querySelector('svg');
          if (g) (w.__ev.svgs ||= []).push([g.getAttribute('viewBox'), g.innerHTML, f.querySelector('[style*="transform"]')?.getAttribute('style') || ''].join('|'));
          return r;
        });
      },
    });
    // A draw starts with getComputedStyle(fig).transform (pipeline.ts draw()); a new
    // figure element (a patched slide) is a new draw.
    const gcs = w.getComputedStyle;
    const seen = new WeakSet();
    w.getComputedStyle = function (el, ...r) {
      if (el?.matches?.(sel) && !seen.has(el)) { seen.add(el); w.__ev.patches.push(T()); }
      return gcs.call(this, el, ...r);
    };
  }, sel);
  const full = HEAD + CHARTS[chart];
  const tail = TAIL[chart];
  const pre = full.slice(0, full.lastIndexOf(tail));
  await setAll(pre + tail.slice(0, 2));
  await fr.locator(sel).first().waitFor({ state: 'attached', timeout: 30000 });
  await fr.locator(`${sel}[${attr}]`).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await fr.evaluate(() => { window.__ev.posts = []; window.__ev.answers = []; window.__ev.patches = []; window.__ev.svgs = []; });
  await page.evaluate(() => { window.__keys = []; });
  const rest = tail.slice(2, -1); // no newline
  for (const ch of rest) { await page.keyboard.type(ch); await page.waitForTimeout(interval); }
  await page.waitForTimeout(2500);
  const keys = await page.evaluate(() => window.__keys);
  const ev = await fr.evaluate(() => window.__ev);
  if (process.env.CAPTURE) { const hs = (ev.svgs || []).map((x) => createHash('sha1').update(x).digest('hex').slice(0, 10)); fs.appendFileSync(process.env.CAPTURE, `${chart}@${interval} ${[...new Set(hs)].sort().join(",")} final=${hs[hs.length - 1]}\n`); }
  await ctx.close();
  const rows = [];
  let stale = 0, answered = 0;
  const ans = new Map(ev.answers.map((a) => [`${a.w}:${a.id}`, a]));
  for (const a of ev.answers) {
    answered++;
    const p = ev.posts.find((x) => x.w === a.w && x.id === a.id);
    if (p && ev.patches.some((t) => t > p.t && t < a.t)) stale++;
  }
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], nk = keys[i + 1] ?? Infinity;
    const patch = ev.patches.find((t) => t >= k && t < nk);
    if (patch == null) continue;
    const p = ev.posts.find((x) => x.t >= patch);
    if (!p || p.t >= nk + 5000) continue;
    const a = ans.get(`${p.w}:${p.id}`);
    // first drawn: the first answer after the patch with no newer patch before it
    const drawn = ev.answers.find((x) => { const pp = ev.posts.find((y) => y.w === x.w && y.id === x.id); return pp && pp.t >= patch && !ev.patches.some((t) => t > pp.t && t < x.t); });
    rows.push({ studio: patch - k, before: p.t - patch, router: a ? a.t - p.t : NaN, paint: a ? a.end - a.t : NaN, total: drawn ? drawn.end - k : NaN });
  }
  if (process.env.DUMP) { const t0 = keys[0]; console.log("keys", keys.map((k) => (k - t0).toFixed(0)).join(" ")); console.log("patch", ev.patches.map((k) => (k - t0).toFixed(0)).join(" ")); console.log("posts", ev.posts.map((p) => `${p.w}:${p.id}@${(p.t - t0).toFixed(0)}`).join(" ")); console.log("ans", ev.answers.map((p) => `${p.w}:${p.id}@${(p.t - t0).toFixed(0)}`).join(" ")); }
  return { rows, stale, answered };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const out = {};
for (const chart of (process.env.CHARTS || 'chain11,incident,flow').split(',')) for (const iv of (process.env.IVS || '600,150').split(',').map(Number)) {
  const all = []; let stale = 0, answered = 0;
  for (let r = 0; r < RUNS; r++) { const x = await one(browser, chart, iv); all.push(...x.rows); stale += x.stale; answered += x.answered; }
  const col = (f) => { const v = all.map((r) => r[f]).filter(Number.isFinite); return `${med(v).toFixed(0)} / ${p90(v).toFixed(0)}`; };
  out[`${chart}@${iv}`] = { n: all.length, total: col('total'), studio: col('studio'), before: col('before'), router: col('router'), paint: col('paint'), stale: `${stale}/${answered}` };
  console.log(chart, iv, JSON.stringify(out[`${chart}@${iv}`]));
}
await browser.close();
fs.mkdirSync(path.join(ROOT, '.scratch', 'typing'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.scratch', 'typing', `${LABEL}.json`), JSON.stringify(out, null, 1));
