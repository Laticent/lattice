#!/usr/bin/env node
/**
 * calibrate-points — the POINTS COLUMN's line geometry, for `calibrate-capacity split-panel --points`.
 *
 * A `split-panel` slide has two clipping boxes. Its claim panel (left) has line geometry
 * (`calibrate-panel.js`, Amendment (6)); its points column (`.panel-right`) had a count row, which
 * cannot see a line break: `gallery.md`'s `watermark` slides 18 and 57 clip there at conference
 * with three points, under a sub-heading and a paragraph the count never saw, and
 * `system-design-foundations` 45 and 209 clip there because a `proof` grid's rows share the
 * tallest card's height (2026-09-25-font-scale-fit.md, Amendment (10)).
 *
 * THE MODEL, per register. The column holds the slide's points, each a `title` (the lead, lifted to
 * <strong>) over `body` lines (its nested items), and on some slides a `sub` heading (`###`) and a
 * `para` above them. Each role's lines are wrapped at its characters a line and summed at its line
 * height.
 *
 *   A flex column (bare, `metric`, `steps`, `watermark`): every point is a row,
 *     used = Σ point lines  +  points × row  +  (sub ? subAt + its lines)  +  (para ? paraAt + its lines)
 *   A `proof` grid: the first point (the signal) spans the column and the rest pair up beneath it,
 *     and its rows are `1fr` with `min-height: 0`: each row gets an equal share and a point taller
 *     than its share clips inside itself (`eq`), so the column overflows when its TALLEST row does:
 *     used = the tallest row's lines   (the budget is one row's share)
 *
 *   fits ⇔ used ≤ budget
 *
 * The first point of a grid register has its own geometry (`first`: the signal reads at body size
 * across the column, the cards at compact size in half of it). A grid register is measured at its
 * documented three points and judged only there; its rows' fixed cost is in the budget.
 *
 * Overflow is read with the export's own probe (`probeSectionOverflow`, the panel-right cell's
 * `dy`), at `size: 4k`, so a budget is px of a 2160-high slide with FRAME_TOLERANCE included —
 * calibrate-rows.js's basis. Characters a line = the role's box width ÷ its font's average advance on
 * a fixed sample. Each role records the face lint weighs it in: `d` the display face, `f` flat (an
 * uppercase label, whose table lint does not carry); otherwise the body face.
 *
 * Usage (through calibrate-capacity, or directly): node tools/lib/calibrate-points.js [--json]
 */

const { gradedDeck, renderProbe, cap } = require('./calibrate-core.js');
const { resolveChrome } = require('./resolve-chrome.js');
const { FRAME_TOLERANCE, probeSectionOverflow, CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR } = require('../../lib/core/overflow-probe.js');

const JSON_OUT = process.argv.includes('--json');
function die(msg) {
  console.error(msg);
  process.exit(1);
}

// The registers measured. A register not listed keeps its count row.
// `capstone` is not measured: its first row is `1fr` with `min-height: 0` and a centered quotation,
// so a long quotation overlaps the row below rather than pushing it, and the export's probe does not
// read that as the column overflowing (a 110-word card pair under a quotation did not flag at
// laptop). It keeps its count row.
// Keys name their variants in the manifest's order (build-stage-catalog.js checks it); `mirror` swaps
// the panels' sides, so it is measured alone and on `watermark`, and stored as bare's key where it
// measures the same.
const REGISTERS = ['bare', 'metric', 'steps', 'watermark', 'proof', 'mirror', 'watermark mirror'];
// Grid registers: the first point spans, the rest pair beneath it; `eq` rows share the tallest.
const GRID = { proof: { eq: 1 } };
// Registers whose slides put a `###` sub-heading and a paragraph in the column (`watermark` routes
// every block but its eyebrow, `#####` and heading to the right; lib/core/split-panels.js).
const SUBHEAD = new Set(['watermark']);
// Registers that style an ordered list (`1.`): `steps` numbers its discs and `watermark` its cards.
// Elsewhere only `.panel-right > ul` is a column, so the row is stored with `ul: 1` and lint keeps an
// ordered slide on its count row.
const ORDERED = new Set(['steps', 'watermark']);

const SAMPLE = 'you recall syntax patterns and standards so the path is known and the job is to follow it without error while the team learns what a real answer should look like before anyone writes code'.split(' ');
const prose = (n, from = 0) => cap(Array.from({ length: n }, (_, i) => SAMPLE[(i + from) % SAMPLE.length]).join(' '));

/** One probe slide: a short claim panel, and a column long enough in every role to overflow. */
function probe({ reg, n, ol, sub, para, header }) {
  const cls = reg === 'bare' ? 'split-panel' : `split-panel ${reg}`;
  const mark = (i) => (ol ? `${i + 1}.` : '-');
  const pad = (i) => ' '.repeat(mark(i).length + 1);
  // A grid's signal is a sentence; its cards and every flex point are a title over a long body.
  // A title long enough to wrap: `watermark` shrink-wraps its title (`justify-items: start`), so a
  // one-line title's box is its text, not the line it may fill.
  const point = (i) => (GRID[reg] && i === 0 ? `${mark(i)} ${prose(5, 9)}\n${pad(i)}- ${prose(30, 2)}.` : `${mark(i)} ${prose(GRID[reg] ? 3 : 18, i)}\n${pad(i)}- ${prose(GRID[reg] ? 110 : 90, i + 3)}.`);
  const left = reg.startsWith('watermark') ? `## ${prose(3)}\n\n\`Calibration\`` : `\`Calibration\`\n\n## ${prose(4)}.\n\n${prose(8)}.`;
  const right = `${sub ? `### ${prose(5, 4)}\n\n` : ''}${para ? `${prose(40, 6)}.\n\n` : ''}${Array.from({ length: n }, (_, i) => point(i)).join('\n')}`;
  return `<!-- _class: ${cls} -->\n${header ? '<!-- _header: "Calibration" -->\n' : ''}\n${left}\n\n${right}\n`;
}
const VENUES = { laptop: null, huddle: 'l', conference: 'xl', hall: '2xl' };

async function main() {
  const chrome = resolveChrome();
  if (!chrome) die('no Chromium (set CHROME_PATH) — nothing was measured.');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const out = {};
  try {
    for (const [venue, scale] of Object.entries(VENUES)) {
      const probes = [];
      for (const reg of REGISTERS) {
        for (const ol of ORDERED.has(reg.split(' ')[0]) ? [false, true] : [false]) {
          // A flex column: a and b points separate a point's cost from the budget; a grid is
          // measured at its three points. `H` adds the sub-heading, `P` the paragraph under it.
          const tags = GRID[reg] ? { A: { n: 3 } } : { A: { n: 3 }, B: { n: 5 } };
          if (SUBHEAD.has(reg.split(' ')[0])) Object.assign(tags, { H: { n: 3, sub: 1 }, P: { n: 3, sub: 1, para: 1 } });
          // Under a slide header a `mirror` slide pads its column's leading `###` past the header
          // (split-panel.styles.css `.mirror:has(> header) .panel-right > h3:first-child`): the
          // sub-heading's cost is measured again with one (`subAtHeader`). The checker's probe, a
          // header deck, clipped by 53 px at conference where the header-less row read 5% under.
          if (SUBHEAD.has(reg.split(' ')[0]) && reg.split(' ').includes('mirror')) tags.M = { n: 3, sub: 1, header: 1 };
          for (const [tag, o] of Object.entries(tags)) probes.push({ reg, shape: ol ? 'ol' : 'ul', tag, slide: probe({ reg, ol, ...o }) });
        }
      }
      const deck = gradedDeck({ comp: 'split-panel', size: '4k', scale, steps: probes, slideFor: (p) => ({ slide: p.slide }) })
        .replace(/<!-- _class: split-panel -->\n\n<!-- _class:/g, '<!-- _class:');
      const r = renderProbe(deck, `split-panel-points-${venue}`, { format: 'html', keep: true });
      try {
        const page = await browser.newPage();
        await page.goto(`file://${r.out}`, { waitUntil: 'load', timeout: 120_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: `window.__probeSectionOverflow = ${probeSectionOverflow.toString()};` });
        const got = await page.evaluate((sample, probed, displayFace) => {
          const display = new RegExp(displayFace);
          const cv = document.createElement('canvas').getContext('2d');
          const lineCount = (el) => {
            const rg = document.createRange();
            rg.selectNodeContents(el);
            const fs = parseFloat(getComputedStyle(el).fontSize);
            const tops = [];
            for (const q of [...rg.getClientRects()].filter((x) => x.width > 1).sort((x, y) => x.top - y.top)) {
              if (!tops.length || q.top - tops[tops.length - 1] > fs * 0.6) tops.push(q.top);
            }
            return tops.length;
          };
          return [...document.querySelectorAll('section')].map((sec) => {
            const unit = 2160 / sec.clientHeight;
            const right = sec.querySelector('.panel-right');
            const list = right.querySelector(':scope > ul, :scope > ol');
            const lis = [...list.children].filter((x) => x.tagName === 'LI');
            const geo = {};
            const faces = {};
            const role = (name, el, box = el) => {
              const cs = getComputedStyle(el);
              const lh = cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight);
              if (!geo[name]) {
                const up = cs.textTransform === 'uppercase';
                const t = up ? sample.toUpperCase() : sample;
                cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                const bs = getComputedStyle(box);
                const width = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
                geo[name] = [Math.round((width / (cv.measureText(t).width / t.length + (parseFloat(cs.letterSpacing) || 0))) * 10) / 10, Math.round(lh * unit)];
                if (up) faces[name] = 'f';
                else if (display.test(cs.fontFamily)) faces[name] = 'd';
              }
              // The exact line height, not the stored whole px: a probe's ~10 body lines a point at
              // 163.5 px read as 164 put 4 px a point into the solved `row` (the second checker's
              // dh.md slide 7, 25 px over at hall, read 0%).
              return lineCount(el) * lh * unit;
            };
            // Each point's text height; a grid's first point reads its own geometry (`0` roles).
            const grid = getComputedStyle(list).display === 'grid';
            const heights = lis.map((li, k) => {
              const pre = grid && k === 0 ? '0' : '';
              const lead = li.querySelector(':scope > strong');
              const sub = li.querySelector(':scope > ul, :scope > ol');
              let h = lead ? role(`title${pre}`, lead) : 0;
              if (sub) for (const b of sub.children) h += role(`body${pre}`, b);
              return h;
            });
            // Rows by top edge; a row is as tall as its tallest point.
            const rows = [];
            lis.forEach((li, k) => {
              const t = li.getBoundingClientRect().top;
              const row = rows.find((x) => Math.abs(x.top - t) < 2);
              if (row) row.h = Math.max(row.h, heights[k]); else rows.push({ top: t, h: heights[k] });
            });
            // `proof`'s rows are `1fr` (`--cards-track` under `stretch`); capstone's are content height.
            const eq = grid && /fr/.test(getComputedStyle(list).gridAutoRows);
            // A `1fr` row does not grow: a point taller than its share clips inside itself, and the
            // export reads the tallest row's excess (its `squeezed` measure), so an `eq` register's
            // text is its tallest row and its budget is one row's share.
            let text = eq ? Math.max(...rows.map((x) => x.h)) : rows.reduce((a, x) => a + x.h, 0);
            const h3 = right.querySelector(':scope > h3');
            const p = right.querySelector(':scope > p');
            let subText = 0;
            let paraText = 0;
            if (h3) subText = role('sub', h3);
            if (p) paraText = role('para', p);
            text += subText + paraText;
            // The export's own measure of the column: its `dy` past the box, in layout px.
            const cells = [...sec.querySelectorAll(probed[0])];
            const res = window.__probeSectionOverflow(sec, ...probed);
            const cell = res.overCells.find((c) => cells[c.index] === right);
            return { geo, faces, rows: rows.length, eq, k: cell ? (cell.dy - text / unit) * unit : null };
          });
        }, SAMPLE.join(' '), [CLIP_CELL_SELECTOR, FRAME_TOLERANCE, IGNORED_CLIP_SELECTOR], 'Playfair');
        await page.close();
        if (got.length !== probes.length) die(`${venue}: ${got.length} measured sections for ${probes.length} probes.`);
        const by = {};
        probes.forEach((p, i) => {
          if (got[i].k == null) die(`the ${p.reg} ${p.shape} ${p.tag} probe's column did not overflow at ${venue} — lengthen it.`);
          ((by[p.reg] ||= {})[p.shape] ||= {})[p.tag] = got[i];
        });
        for (const [reg, shapes] of Object.entries(by)) {
          const R = (out[reg] ||= {});
          for (const [shape, t] of Object.entries(shapes)) {
            const g = shape === 'ol' ? ((R.ordered ||= {})) : R;
            const row = t.B ? (t.B.k - t.A.k) / (t.B.rows - t.A.rows) : 0;
            for (const [role, v] of Object.entries({ ...t.A.geo, ...(t.P?.geo || {}) })) (g[role] ||= {})[venue] = v;
            for (const [role, f] of Object.entries({ ...t.A.faces, ...(t.P?.faces || {}) })) (R.faces ||= {})[role] = f;
            (g.row ||= {})[venue] = Math.round(row);
            // The budget: what `used` may reach, FRAME_TOLERANCE included.
            (g.budget ||= {})[venue] = Math.round(FRAME_TOLERANCE - (t.A.k - (t.A.eq ? 0 : t.A.rows * row)));
            if (t.H) {
              (g.subAt ||= {})[venue] = Math.round(t.H.k - t.A.k);
              (g.paraAt ||= {})[venue] = Math.round(t.P.k - t.H.k);
            }
            if (t.M) (g.subAtHeader ||= {})[venue] = Math.round(t.M.k - t.A.k);
            if (GRID[reg]) Object.assign(R, { grid: 1 }, t.A.eq ? { eq: 1 } : {});
            if (!ORDERED.has(reg.split(' ')[0])) R.ul = 1;
          }
        }
      } finally {
        r.cleanup();
      }
    }
  } finally {
    await browser.close();
  }
  // An ordered shape the same as the unordered one (to half a character, or 4 px) is not stored.
  for (const R of Object.values(out)) {
    const o = R.ordered;
    if (!o) continue;
    const same = Object.entries(o).every(([k, v]) => Object.entries(v).every(([ven, x]) => [x].flat().every((y, j) => Math.abs(y - [R[k][ven]].flat()[j]) <= (Array.isArray(x) && !j ? 0.5 : 4))));
    if (same) delete R.ordered;
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    console.log('\n  split-panel · points column line geometry · [characters a line holds, px a line takes] of a 2160-high slide');
    for (const [reg, g] of Object.entries(out)) {
      console.log(`\n    ${reg}`);
      for (const [k, v] of Object.entries(g)) console.log(`      ${k.padEnd(10)} ${JSON.stringify(v)}`);
    }
    console.log('\n  Write it into the manifest as venueCapacity.points (--json prints that object).');
  }
}

main().catch((e) => die(e.stack || String(e)));
