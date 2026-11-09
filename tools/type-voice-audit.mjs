#!/usr/bin/env node
/**
 * tools/type-voice-audit.mjs — measure a deck's type voices on real slides: which roles a reader can tell apart, and which collide.
 *
 * On-demand audit, not a gate. It backs the hierarchy / tension / isolation study in
 * engineering/decisions/2026-11-09-type-hierarchy-study.md, and it is how a new content pairing,
 * chrome voice or eyebrow style is checked against that study's rules before it ships.
 *
 * WHAT IT DOES
 *   1. Writes a fixed probe deck (title, content with header + meta + footer + eyebrow, divider,
 *      quote, big number, cards, bar, piechart, line chart with a source line) to a temp folder.
 *   2. Renders it with the real CLI (`dist/lattice.js`) to HTML, under `--theme` and `--mode`,
 *      with an optional `--style <file.css>` appended as the deck's `style:` block. A style file may
 *      load its own fonts with `@font-face` and absolute `file://` URLs.
 *   3. Opens the HTML in Playwright Chromium at 1280×720 and reads every visible text run's
 *      computed face, size (SVG text scaled by its screen matrix), weight, style, case, tracking
 *      and ink over the slide background.
 *   4. Files each run under a ROLE (chrome: header, eyebrow, heading: h2, body, chart: tick, …) and
 *      prints one row per role.
 *   5. COLLISIONS: on every slide, for every pair of roles on it, counts the axes that tell them apart: face (family or
 *      italic), size (≥ 1.2×), weight (≥ 200), case (capitals vs as written) and ink (the two inks
 *      ≥ 1.5:1 apart in luminance, or ≥ 0.1 apart in OKLab, so a hue change counts). A pair's verdict is its worst slide.
 *      Zero or one axis is a collision; tracking is not counted (0.18em against 0.08em is real but small); the study's rule is that a content role and
 *      a chrome role never collide.
 *   6. ISOLATION: the vertical gaps on the content slide (header → eyebrow → heading → body →
 *      footer), and whether the meta line shares the eyebrow's row.
 *
 * USAGE
 *   node tools/type-voice-audit.mjs [--theme cuoio] [--mode light|dark] [--style recipe.css] [--json]
 *
 * Needs `npm run build` (dist/lattice.js) and Playwright's Chromium (pre-installed in the sandbox).
 * Exit 0 always: it reports, it does not judge.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const theme = opt('theme', 'cuoio');
const mode = opt('mode', 'light');
const styleFile = opt('style', null);
const asJson = args.includes('--json');

const PROBE = `---
marp: true
theme: ${theme}
color-mode: ${mode}
paginate: true
header: "Northwind · Board review"
meta: "Q3 2026 · Finance"
footer: "Confidential · prepared for the board"
__STYLE__---

<!-- _class: title -->

\`Board review · Q3 2026\`

# Revenue held while costs fell

The quarter in one page: what moved, what it cost, and what we ask the board to approve.

---

\`Revenue · Part two\`

## Three segments carried the quarter

- Enterprise grew 18% on two renewals and one new logo
- Mid-market held flat while churn fell to its lowest in two years
- Self-serve doubled after the pricing page moved to annual by default

---

<!-- _class: divider -->

\`Part three\`

## What it cost

---

<!-- _class: quote -->

> We stopped arguing about the forecast once the numbers arrived before the meeting did.

— Chief Financial Officer

---

<!-- _class: big-number -->

\`Net retention · trailing twelve months\`

- 118%
  - Every hundred dollars of revenue a year ago is worth one hundred and eighteen today, before any new customer.

---

<!-- _class: cards-grid -->

\`What we ask\`

## Three approvals, one budget

- Hire
  - Six engineers for the platform team, phased over two quarters.
- Build
  - A second region in Frankfurt to meet the residency clause.
- Cut
  - Retire the legacy billing system by the end of March.

---

<!-- _class: bar -->

\`Revenue by segment\`

## Enterprise is now half the business

- Enterprise \`48\`
- Mid-market \`27\`
- Self-serve \`16\`
- Services \`9\`

---

<!-- _class: piechart -->

## Where the hours went

- Deck production \`46%\`
- Meetings \`22%\`
- Realigning \`18%\`
- Deciding \`14%\`

---

<!-- _class: line -->

\`Revenue · by segment\`

## Enterprise pulled away after the launch

- Q1
  - Enterprise \`60\`
  - SMB \`40\`
- Q2
  - Enterprise \`75\`
  - SMB \`52\`
- Q3
  - Enterprise \`90\`
  - SMB \`70\`
- Q4
  - Enterprise \`120\`
  - SMB \`95\`

Source: finance ledger, unaudited.
`;

// Which kind of slide each probe slide is, by position.
const KIND = ['title', 'content', 'divider', 'quote', 'big-number', 'cards-grid', 'bar', 'piechart', 'line'];

function role(x) {
  const e = x.el, k = KIND[x.slide - 1];
  if (e === 'header') return 'chrome: header';
  if (e.startsWith('div.tile-meta')) return 'chrome: meta';
  if (e === 'footer') return 'chrome: footer';
  if (e.includes('lat-pagination')) return 'chrome: page number';
  if (e === 'p.chart-caption') return 'chart chrome: source line';
  if (e === 'code') return k === 'divider' ? 'eyebrow (divider)' : k === 'title' ? 'eyebrow (title)' : 'eyebrow';
  if (e === 'h1') return 'heading: h1 (title)';
  if (e === 'h2') return k === 'divider' ? 'heading: h2 (divider)' : 'heading: h2';
  if (k === 'title' && e === 'p') return 'subtitle';
  if (k === 'quote') return x.text.startsWith('—') ? 'quote attribution' : 'quote';
  if (k === 'big-number') return x.px > 60 ? 'hero figure' : 'hero caption';
  if (k === 'cards-grid' && e === 'li') return +x.wt >= 600 ? 'card title' : 'body';
  if (e === 'li') return 'body';
  if (e === 'text.chart-key-value') return 'chart: key value';
  if (k === 'piechart') return 'chart: key label';
  if (k === 'bar') return /^\d/.test(x.text) ? 'chart: data label' : 'chart: category';
  if (k === 'line') return /^\d+$/.test(x.text) ? 'chart: tick' : +x.wt >= 600 ? 'chart: direct label' : 'chart: category';
  return `other: ${e}`;
}
const CHROME_ROLE = (r) => r.startsWith('chrome') || r.startsWith('chart chrome');

const parse = (c) => {
  const m = c.match(/[\d.]+/g).map(Number);
  return c.startsWith('color(') ? [m[0] * 255, m[1] * 255, m[2] * 255, m[3] ?? 1] : [m[0], m[1], m[2], m[3] ?? 1];
};
const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
const lum = (rgb) => {
  const f = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
// OKLab distance: hue and chroma count too, so an accent and a muted gray of equal lightness still read apart.
const oklab = (rgb) => {
  const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const deltaE = (a, b) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-voice-'));
  let style = '';
  if (styleFile) {
    const css = fs.readFileSync(path.resolve(styleFile), 'utf8');
    style = `style: |\n${css.split('\n').map((l) => `  ${l}`).join('\n')}\n`;
  }
  const md = path.join(dir, 'probe.md');
  const html = path.join(dir, 'probe.html');
  fs.writeFileSync(md, PROBE.replace('__STYLE__', style));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'dist', 'lattice.js'), md, html, '-q'], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('render failed'); process.exit(r.status || 1); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`file://${html}`);
  await page.evaluate(() => document.fonts.ready);
  const { unloaded, runs, gaps } = await page.evaluate(() => {
    const runs = [];
    const secs = [...document.querySelectorAll('section')];
    secs.forEach((sec, i) => {
      const bg = getComputedStyle(sec).backgroundColor;
      const walk = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.textContent.replace(/\s+/g, ' ').trim();
        const el = n.parentElement;
        if (!text || seen.has(el)) continue;
        seen.add(el);
        if (el.closest('.chart-sr-table,.chart-sr-only,.sr-only,style,script,title,desc')) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const em = parseFloat(cs.fontSize);
        let px = em;
        if (el instanceof SVGElement && el.getScreenCTM) { const m = el.getScreenCTM(); px = em * Math.hypot(m.a, m.b); }
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        runs.push({
          slide: i + 1, el: el.tagName.toLowerCase() + (cls ? `.${cls}` : ''), text: text.slice(0, 32),
          face: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), px, wt: cs.fontWeight,
          it: cs.fontStyle === 'italic', uc: cs.textTransform === 'uppercase',
          ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) / em,
          ink: el instanceof SVGElement ? cs.fill : cs.color, bg,
        });
      }
    });
    // Isolation by space on the content slide (slide 2): tight text boxes via a Range.
    const s = secs[1], o = s.getBoundingClientRect();
    const tight = (q) => { const e = s.querySelector(q); if (!e) return null; const rg = document.createRange(); rg.selectNodeContents(e); const b = rg.getBoundingClientRect(); return { top: b.top - o.top, bottom: b.bottom - o.top, left: b.left - o.left }; };
    // A computed font-family names the face asked for, not the face drawn: list any family with no loaded face.
    const asked = new Set(runs.map((x) => x.face));
    const unloaded = [...asked].filter((fam) => ![...document.fonts].some((ff) => ff.family.replace(/["']/g, '') === fam && ff.status === 'loaded'));
    return { unloaded, runs, gaps: { header: tight('header'), eyebrow: tight('p > code'), h2: tight('h2'), first: tight('li'), last: tight('li:last-child'), footer: tight('footer'), meta: tight('.tile-meta') } };
  });
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });

  // Measure each role ON EACH SLIDE: a role's ink and size change with the slide's background and kind, so a pair is
  // only ever compared where both roles stand on the same slide. A pair's verdict is its worst slide (fewest axes).
  const voice = (x) => {
    const bg = parse(x.bg);
    const ink = over(parse(x.ink), bg);
    return { role: role(x), slide: x.slide, face: x.face, px: +x.px.toFixed(1), weight: +x.wt, italic: x.it, caps: x.uc, tracking: +x.ls.toFixed(2), ink, contrast: +contrast(ink, bg).toFixed(1) };
  };
  const perSlide = new Map(); // slide → role → voice (the role's first run on that slide)
  for (const x of runs) {
    const v = voice(x);
    if (!perSlide.has(v.slide)) perSlide.set(v.slide, new Map());
    const m = perSlide.get(v.slide);
    if (!m.has(v.role)) m.set(v.role, v);
  }
  // The table shows each role once: from the plain content slide (2) when it appears there, else its first slide.
  const roles = new Map();
  for (const n of [2, ...[...perSlide.keys()].filter((k) => k !== 2)]) for (const [r, v] of perSlide.get(n) || []) if (!roles.has(r)) roles.set(r, v);
  const list = [...roles.values()].sort((a, b) => b.px - a.px);
  const axesOf = (a, b) => {
    const axes = [];
    if (a.face !== b.face || a.italic !== b.italic) axes.push('face');
    if (Math.max(a.px, b.px) / Math.min(a.px, b.px) >= 1.2) axes.push('size');
    if (Math.abs(a.weight - b.weight) >= 200) axes.push('weight');
    if (a.caps !== b.caps) axes.push('case');
    if (contrast(a.ink, b.ink) >= 1.5 || deltaE(a.ink, b.ink) >= 0.1) axes.push('ink');
    return axes;
  };
  const worst = new Map();
  for (const [n, m] of perSlide) {
    const vs = [...m.values()];
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
      const [a, b] = [vs[i], vs[j]].sort((x, y) => (x.role < y.role ? -1 : 1));
      const key = `${a.role}|${b.role}`;
      const axes = axesOf(a, b);
      if (!worst.has(key) || axes.length < worst.get(key).axes.length) worst.set(key, { a: a.role, b: b.role, axes, slide: n });
    }
  }
  const pairs = [...worst.values()].filter((p) => p.axes.length <= 1).map((p) => ({ ...p, crossesChrome: CHROME_ROLE(p.a) !== CHROME_ROLE(p.b) }));
  const g = gaps;
  const gap = (a, b) => (g[a] && g[b] ? Math.round(g[b].top - g[a].bottom) : null);
  const space = {
    headerToEyebrow: gap('header', 'eyebrow'), eyebrowToHeading: gap('eyebrow', 'h2'), headingToBody: gap('h2', 'first'), bodyToFooter: gap('last', 'footer'),
    metaSharesEyebrowRow: !!(g.meta && g.eyebrow && Math.abs(g.meta.top - g.eyebrow.top) < 4),
  };

  if (unloaded.length) console.error(`warning: no loaded face for ${unloaded.join(', ')}; those rows measure a fallback font`);
  if (asJson) { console.log(JSON.stringify({ theme, mode, style: styleFile, roles: list, collisions: pairs, space }, null, 2)); return; }
  console.log(`type-voice-audit · ${theme} · ${mode}${styleFile ? ` · ${path.basename(styleFile)}` : ''}\n`);
  console.log('| Role | Face | px @1280 | Weight | Case · tracking | Contrast |');
  console.log('|---|---|---|---|---|---|');
  for (const v of list) console.log(`| ${v.role} | ${v.face}${v.italic ? ' italic' : ''} | ${v.px} | ${v.weight} | ${v.caps ? 'capitals' : 'as written'} · ${v.tracking}em | ${v.contrast}:1 |`);
  console.log('\nCollisions (0–1 axes apart). ✗ = content against chrome, the pair the study forbids:');
  for (const p of pairs.sort((x, y) => x.axes.length - y.axes.length || +y.crossesChrome - +x.crossesChrome)) {
    console.log(`  ${p.crossesChrome ? '✗' : ' '} ${p.axes.length} · ${p.a} ~ ${p.b}${p.axes.length ? ` (only ${p.axes[0]})` : ''} · slide ${p.slide}`);
  }
  console.log(`\nSpace on the content slide (px @1280): header→eyebrow ${space.headerToEyebrow}, eyebrow→heading ${space.eyebrowToHeading}, heading→body ${space.headingToBody}, body→footer ${space.bodyToFooter}; meta shares the eyebrow's row: ${space.metaSharesEyebrowRow}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
