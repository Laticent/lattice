#!/usr/bin/env node
/**
 * audit-inline-objects — what does an inline object (a pill, a check disc) do to the text around it?
 *
 * Every other gate asks whether content FITS; `check:jank` asks whether an anchor STAYS PUT as content
 * grows. Neither asks the question an author hits the moment they put a pill in a sentence: does it
 * wrap, push, or sit crooked? This tool measures that on a real render, on every text host a deck has.
 *
 * HOW. It renders a deck (a `.md` through the CLI, or an existing `.html`), then in Chromium takes each
 * element that holds a run of text and swaps a word in the middle of it, one at a time, for:
 *   - `control`: the plain label text, `LIVE` (the baseline every other kind is compared with),
 *   - `pill`: a short pill, `pill2`: a longer one (`AT RISK NOW`),
 *   - `disc`: a check disc.
 * It reverts after each, so nothing it measures leaks into the next host. The deck's own CSS and fonts
 * are in force, because the page is the real export.
 *
 * WHAT IT REPORTS, per kind, against the control:
 *   - extra lines: the host holds more lines of text than with the plain label;
 *   - host taller: the host box grew by more than 1 px (a pill taller than the line box does this
 *     without adding a line);
 *   - surroundings moved: any element outside the host, host's ancestors included, moved by more than 1 px;
 *   - text pushed to another line: text that shared the label's line in the control no longer does (in a
 *     flex or grid host this is the split the `inline-run` transformer exists to fix);
 *   - vertical alignment: the object's center against the cap-height center of the line it sits on, in
 *     em of the host's font, with the median and the 5th and 95th percentile;
 *   - the same counts by the host's computed `display`, because the cause differs by layout.
 *
 * Sizes are in slide pixels (the layout is 3840 wide), and the numbers are for the browser in use:
 * `CHROME_PATH`, else puppeteer's own. On-demand, not a CI gate: it renders a whole deck and measures
 * thousands of mutations. The regression gate for the split defect is
 * `test/integration/invariants/inline-objects-no-split.test.js`. Findings and method:
 * engineering/decisions/2026-10-20-inline-objects-audit.md.
 *
 * Usage:
 *   node tools/audit-inline-objects.js test/integration/baseline-decks/gallery.md
 *   node tools/audit-inline-objects.js deck.html --json > rows.json
 *
 * Exit codes: 0 measured, 2 could not run (no input, no Chromium, render failed).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/** Runs in the page. Returns one row per (host, kind). */
function measureInPage() {
  const KINDS = {
    control: () => document.createTextNode('LIVE'),
    pill: () => {
      const e = document.createElement('span');
      e.className = 'lat-pill';
      e.dataset.shape = 'pill';
      e.dataset.c = 'c3';
      e.textContent = 'LIVE';
      return e;
    },
    pill2: () => {
      const e = document.createElement('span');
      e.className = 'lat-pill';
      e.dataset.shape = 'pill';
      e.dataset.c = 'c5';
      e.textContent = 'AT RISK NOW';
      return e;
    },
    disc: () => {
      const e = document.createElement('span');
      e.className = 'state pass state-full lat-state';
      e.setAttribute('role', 'img');
      e.setAttribute('aria-label', 'yes');
      return e;
    },
  };
  const ctx = document.createElement('canvas').getContext('2d');
  const skip = (el) => el.closest('svg,pre,code,math,.katex,[data-lattice-berth],script,style,.marker-rail,[aria-hidden="true"]');
  const rows = [];
  for (const sec of document.querySelectorAll('section')) {
    const sc = sec.getBoundingClientRect().width / sec.offsetWidth || 1;
    const all = [...sec.querySelectorAll('*')].filter((e) => !e.closest('svg') || e.tagName === 'svg');
    const hosts = [];
    for (const el of sec.querySelectorAll('*')) {
      if (skip(el)) continue;
      let best = null;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || n.nodeValue.trim().length < 3) continue;
        if (!best || n.nodeValue.trim().length > best.nodeValue.trim().length) best = n;
      }
      if (best) hosts.push([el, best]);
    }
    const snap = () => all.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.top / sc, r.left / sc, r.width / sc, r.height / sc];
    });
    const lineCount = (host) => {
      const ys = [];
      const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let n = w.nextNode();
      while (n) {
        if (n.nodeValue.trim() && !n.parentElement.closest('.lat-pill,.lat-state')) {
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const r of rg.getClientRects()) ys.push((r.top + r.bottom) / 2 / sc);
        }
        n = w.nextNode();
      }
      ys.sort((a, b) => a - b);
      const fsz = parseFloat(getComputedStyle(host).fontSize);
      let lines = 0;
      let last = -1e9;
      for (const y of ys) {
        if (y - last > fsz * 0.6) { lines++; last = y; }
      }
      return lines;
    };
    for (const [host, tn] of hosts) {
      const cs = getComputedStyle(host);
      const fs = parseFloat(cs.fontSize);
      const orig = tn.nodeValue;
      const words = orig.split(/(\s+)/);
      const idx = words.map((w, i) => [w, i]).filter(([w]) => w.trim());
      const mid = idx.length >= 3;
      const wi = mid ? idx[Math.floor(idx.length / 2)][1] : -1;
      const res = {};
      for (const [kind, make] of Object.entries(KINDS)) {
        const before = document.createTextNode(words.slice(0, mid ? wi : words.length).join(''));
        const after = document.createTextNode(mid ? words.slice(wi + 1).join('') : '');
        const obj = make();
        const parent = tn.parentNode;
        parent.insertBefore(before, tn);
        parent.insertBefore(obj, tn);
        parent.insertBefore(after, tn);
        parent.removeChild(tn);
        let orect;
        if (obj.nodeType === 1) orect = obj.getBoundingClientRect();
        else {
          const rg = document.createRange();
          rg.selectNodeContents(obj);
          orect = rg.getBoundingClientRect();
        }
        const edge = (node, which) => {
          if (!node.nodeValue?.trim()) return null;
          const rg = document.createRange();
          rg.selectNodeContents(node);
          const rs = [...rg.getClientRects()];
          return rs.length ? (which === 'last' ? rs[rs.length - 1] : rs[0]) : null;
        };
        const pr = edge(before, 'last');
        const nr = edge(after, 'first');
        const oc = (orect.top + orect.bottom) / 2;
        const same = (r) => (r ? Math.abs((r.top + r.bottom) / 2 - oc) < r.height * 0.6 : null);
        const metric = { prevSame: same(pr), nextSame: same(nr) };
        if (pr && kind !== 'control') {
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
          const m = ctx.measureText('H');
          const baseline = pr.top + (pr.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
          metric.dyEm = (oc - (baseline - m.actualBoundingBoxAscent / 2)) / sc / fs;
          metric.objHEm = orect.height / sc / fs;
        }
        res[kind] = { s: snap(), lines: lineCount(host), metric };
        parent.insertBefore(tn, before);
        parent.removeChild(before);
        parent.removeChild(obj);
        parent.removeChild(after);
      }
      const hostIdx = all.indexOf(host);
      for (const kind of ['pill', 'pill2', 'disc']) {
        const c = res.control;
        const t = res[kind];
        let moved = 0;
        all.forEach((e, i) => {
          if (host.contains(e)) return;
          const d = Math.max(Math.abs(c.s[i][0] - t.s[i][0]), Math.abs(c.s[i][1] - t.s[i][1]), Math.abs(c.s[i][3] - t.s[i][3]));
          if (d > 1) moved++;
        });
        rows.push({
          sec: sec.dataset.class || '?',
          host: host.tagName.toLowerCase(),
          display: cs.display,
          kind,
          mid,
          dLines: t.lines - c.lines,
          hostTaller: t.s[hostIdx][3] - c.s[hostIdx][3] > 1,
          moved: moved > 0,
          pushed: !!((c.metric.prevSame && t.metric.prevSame === false) || (c.metric.nextSame && t.metric.nextSame === false)),
          dyEm: t.metric.dyEm,
          sharesLine: t.metric.prevSame === true,
          objHEm: t.metric.objHEm,
        });
      }
    }
  }
  return rows;
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const quant = (v, q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];

function summarize(rows) {
  const lines = [];
  const hosts = rows.filter((r) => r.kind === 'pill').length;
  lines.push(`${hosts} text hosts measured, each with a mid-text swap`, '');
  lines.push('kind   extra lines  host taller  surroundings moved  text pushed to another line');
  for (const kind of ['pill', 'pill2', 'disc']) {
    const rs = rows.filter((r) => r.kind === kind);
    const n = rs.length;
    const f = (fn) => `${String(rs.filter(fn).length).padStart(4)} ${pct(rs.filter(fn).length, n).padStart(4)}`;
    lines.push(`${kind.padEnd(6)} ${f((r) => r.dLines > 0)}     ${f((r) => r.hostTaller)}      ${f((r) => r.moved)}           ${f((r) => r.pushed)}`);
  }
  lines.push('', 'vertical alignment, objects that share a line with their neighbor text (em of host font; + = low of the cap-height center)');
  for (const kind of ['pill', 'disc']) {
    const v = rows.filter((r) => r.kind === kind && r.sharesLine && typeof r.dyEm === 'number').map((r) => r.dyEm).sort((a, b) => a - b);
    if (v.length) lines.push(`${kind.padEnd(6)} n=${v.length}  median ${quant(v, 0.5).toFixed(3)}  p5 ${quant(v, 0.05).toFixed(3)}  p95 ${quant(v, 0.95).toFixed(3)}`);
    const h = rows.filter((r) => r.kind === kind && typeof r.objHEm === 'number').map((r) => r.objHEm).sort((a, b) => a - b);
    if (h.length) lines.push(`       height / host font: median ${quant(h, 0.5).toFixed(2)}  p10 ${quant(h, 0.1).toFixed(2)}  p90 ${quant(h, 0.9).toFixed(2)}`);
  }
  lines.push('', 'pill, by host display: hosts  extra lines  host taller  moved  pushed');
  const by = {};
  for (const r of rows.filter((x) => x.kind === 'pill')) {
    const b = (by[r.display] = by[r.display] || [0, 0, 0, 0, 0]);
    b[0]++;
    b[1] += r.dLines > 0;
    b[2] += r.hostTaller;
    b[3] += r.moved;
    b[4] += r.pushed;
  }
  for (const [d, b] of Object.entries(by).sort((a, z) => z[1][0] - a[1][0])) {
    lines.push(`  ${d.padEnd(13)} ${b.map((x) => String(x).padStart(5)).join('  ')}`);
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const input = args.find((a) => !a.startsWith('--'));
  if (!input || !fs.existsSync(input)) {
    console.error('usage: node tools/audit-inline-objects.js <deck.md | deck.html> [--json]');
    process.exit(2);
  }
  let html = path.resolve(input);
  let tmp = null;
  if (input.endsWith('.md')) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-audit-'));
    html = path.join(tmp, 'deck.html');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.resolve(input), html, '-q'], { encoding: 'utf8', timeout: 300000 });
    if (r.status !== 0) {
      console.error(`render failed: ${r.stderr || r.stdout}`);
      process.exit(2);
    }
  }
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch { console.error('puppeteer is not installed'); process.exit(2); }
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  } catch (err) {
    console.error(`no Chromium: ${err.message}`);
    process.exit(2);
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    const rows = await page.evaluate(measureInPage);
    console.log(json ? JSON.stringify(rows) : summarize(rows));
  } finally {
    await browser.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { measureInPage, summarize };
