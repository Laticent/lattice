#!/usr/bin/env node
/**
 * calibrate-rows — the LINE GEOMETRY of a list or card component, for
 * `calibrate-capacity <component> --rows`.
 *
 * A count row says "4 items of 14 words fit at hall". It cannot see where a line breaks: a
 * `list takeaway` item written as a title over a body takes two lines whatever its word count, and
 * a 12-word item takes one line or two depending on its characters (#2361 P2; the same finding as
 * the claim panel, 2026-09-25-font-scale-fit.md Amendment (6)). So this rig measures what lint
 * needs to wrap the slide's own text, the way `calibrate-panel.js` does for the claim panel.
 *
 * THE MODEL. A standard-frame slide is its masthead (eyebrow, heading), its stage (the clipping
 * cell, one or more columns of items) and its coda (a trailing `> …` callout). The stage takes
 * whatever height the masthead and coda leave, so the slide overflows when its TEXT LINES plus a
 * fixed overhead exceed the slide. That overhead is linear: a constant, plus a cost per ROW of
 * items (gaps, card padding), plus a cost when an eyebrow or a callout is present. Each item is a
 * `title` (its own text) over zero or more `body` lines (its nested items); a row is as tall as its
 * tallest item. The rig renders overflowing probes, counts every role's lines, and solves:
 *
 *   used = Σ lines × px-a-line  +  rows × row  +  (eyebrow ? eyebrow : 0)  +  (callout ? callout : 0)
 *   fits  ⇔  used ≤ budget
 *
 * from four probes: (eyebrow, callout, a rows), (…, b rows), (no eyebrow, …), (…, no callout).
 * Characters a line holds = the role's measured line width ÷ its font's average advance, measured
 * on a fixed English sample (calibrate-panel.js's method). Heights are whole px of a 2160-high
 * slide (`size: 4k`, where FRAME_TOLERANCE is 12 of them).
 *
 * Each register is measured in each SHAPE it is written in: `flat` (one-line items) and `nested`
 * (a title over body items), because `list takeaway` lays the two out differently
 * (list.styles.css `:has(> li > :is(ul,ol))`).
 *
 * Usage (through calibrate-capacity, or directly): node tools/lib/calibrate-rows.js <component> [--json]
 */

const { gradedDeck, renderProbe, cap } = require('./calibrate-core.js');
const { resolveChrome } = require('./resolve-chrome.js');
const { FRAME_TOLERANCE } = require('../../lib/core/overflow-probe.js');

const JSON_OUT = process.argv.includes('--json');
function die(msg) {
  console.error(msg);
  process.exit(1);
}

// The registers each component is measured in, with the shapes it is written in and its columns.
// A register not listed is judged by its count row.
const ROWS = {
  list: { bare: ['flat'], takeaway: ['flat', 'nested'], 'takeaway numbered': ['flat', 'nested'] },
  'cards-grid': { bare: ['nested'], three: ['nested'], four: ['nested'] },
  'list-steps': { bare: ['nested'] },
};
// Columns per register; 0 is ONE ROW of every item (list-steps), where a step's width is the
// stage's shared by the step count, so each role's characters are measured per count (ONE_ROW).
// At six steps the columns reach their minimum width and the row stops sharing (the budget drops by
// a line), so a longer row keeps its count row.
const COLS = { 'cards-grid': 2, 'cards-grid three': 3, 'cards-grid four': 4, 'list-steps': 0 };
const ONE_ROW = [2, 3, 4, 5];
// list-steps lays out a ROW only as an ordered list (`1.`), the form it documents; written with `-`
// it is a plain vertical list, which keeps its count row.
const ORDERED_ONLY = new Set(['list-steps']);

const SAMPLE = 'you recall syntax patterns and standards so the path is known and the job is to follow it without error while the team learns what a real answer should look like before anyone writes code'.split(' ');
const prose = (n, from = 0) => cap(Array.from({ length: n }, (_, i) => SAMPLE[(i + from) % SAMPLE.length]).join(' '));

/** One probe slide: long enough in every role that each wraps and the stage overflows. */
function probe({ cls, shape, n, eyebrow, callout, ol }) {
  const mark = (i) => (ol ? `${i + 1}.` : '-');
  const pad = (i) => ' '.repeat(mark(i).length + 1);
  const items = Array.from({ length: n }, (_, i) => (shape === 'nested'
    ? `${mark(i)} ${prose(24, i)}\n${pad(i)}- ${prose(40, i + 3)}.`
    // 60 words, not 40: with list rows at --fs-body (16pt at laptop) four 40-word takeaway items
    // no longer overflowed, and a probe that fits measures nothing. Length does not move the
    // geometry, only whether the stage overflows.
    : `${mark(i)} ${prose(60, i)}.`)).join('\n');
  return `<!-- _class: ${cls} -->\n\n${eyebrow ? `\`Calibration · ${prose(18).toUpperCase()}\`\n\n` : ''}## ${prose(16)}.\n\n${items}\n${callout ? `\n> ${prose(22, 5)}.\n` : ''}`;
}
const VENUES = { laptop: null, huddle: 'l', conference: 'xl', hall: '2xl' };

async function main() {
  const comp = process.argv[2];
  if (!ROWS[comp]) die(`--rows measures ${Object.keys(ROWS).join(', ')}; not '${comp}'.`);
  const chrome = resolveChrome();
  if (!chrome) die('no Chromium (set CHROME_PATH) — nothing was measured.');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const out = {};
  try {
    for (const [venue, scale] of Object.entries(VENUES)) {
      const probes = [];
      for (const [reg, shapes] of Object.entries(ROWS[comp])) {
        const cls = reg === 'bare' ? comp : `${comp} ${reg}`;
        const cols = COLS[cls] ?? 1;
        // An ordered list (`1.`) draws an ordinal beside each item on some registers, which narrows
        // its lines: measured as well, and stored under `ordered` where it differs.
        for (const shape of shapes.flatMap((x) => (ORDERED_ONLY.has(comp) ? [`${x}.ol`] : [x, `${x}.ol`]))) {
          const a = cols === 1 ? 4 : 2 * cols || 4;
          const b = cols === 1 ? 7 : 4 * cols;
          const tags = { A: { n: a, eyebrow: 1, callout: 1 }, B: { n: b, eyebrow: 1, callout: 1 }, E: { n: a, eyebrow: 0, callout: 1 }, C: { n: a, eyebrow: 1, callout: 0 }, S: { n: a + 1, eyebrow: 1, callout: 1 } };
          if (!cols) {
            delete tags.B;
            for (const n of ONE_ROW) tags[`A${n}`] = { n, eyebrow: 1, callout: 1 };
          }
          for (const [tag, o] of Object.entries(tags)) {
            if (tag === 'S' && cols <= 1) continue;
            probes.push({ reg, shape, tag, slide: probe({ cls, shape: shape.replace('.ol', ''), ol: shape.endsWith('.ol'), ...o }) });
          }
        }
      }
      const deck = gradedDeck({ comp, size: '4k', scale, steps: probes, slideFor: (p) => ({ slide: p.slide }) })
        .replace(/<!-- _class: [^>]*-->\n\n<!-- _class:/g, '<!-- _class:');
      const r = renderProbe(deck, `${comp}-rows-${venue}`, { format: 'html', keep: true });
      try {
        const page = await browser.newPage();
        await page.goto(`file://${r.out}`, { waitUntil: 'load', timeout: 120_000 });
        await page.evaluate(() => document.fonts.ready);
        const got = await page.evaluate((sample) => {
          const cv = document.createElement('canvas').getContext('2d');
          // The line boxes of a range: its client rects grouped by top (a run in another font sits
          // a few px off the line it shares).
          const lineRects = (range, fs) => {
            const rows = [];
            for (const q of [...range.getClientRects()].filter((x) => x.width > 1).sort((x, y) => x.top - y.top)) {
              const last = rows[rows.length - 1];
              if (last && q.top - last.top <= fs * 0.6) {
                last.left = Math.min(last.left, q.left);
                last.right = Math.max(last.right, q.right);
              } else rows.push({ top: q.top, left: q.left, right: q.right });
            }
            return rows;
          };
          return [...document.querySelectorAll('section')].filter((s) => s.querySelector('.cell-stage')).map((sec) => {
            const unit = 2160 / sec.clientHeight;
            const stage = sec.querySelector('.cell-stage');
            const list = stage.querySelector(':scope > ul, :scope > ol');
            const lis = [...list.children].filter((x) => x.tagName === 'LI');
            // Every role's text as [range, the element whose font sets it, the item it belongs to].
            const roles = { eyebrow: [], heading: [], title: [], body: [], callout: [] };
            const whole = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return rg; };
            const eb = sec.querySelector('.cell-masthead p');
            if (eb) roles.eyebrow.push([whole(eb), eb.querySelector('code') || eb]);
            const h = sec.querySelector('.cell-masthead h2');
            roles.heading.push([whole(h), h]);
            lis.forEach((li, k) => {
              const sub = li.querySelector(':scope > ul, :scope > ol');
              const rg = document.createRange();
              rg.setStart(li, 0);
              if (sub) rg.setEndBefore(sub); else rg.setEnd(li, li.childNodes.length);
              roles.title.push([rg, li, k]);
              if (sub) for (const b of sub.children) roles.body.push([whole(b), b, k]);
            });
            for (const p of sec.querySelectorAll('.cell-coda blockquote p')) roles.callout.push([whole(p), p]);
            const geo = {};
            const perItem = lis.map(() => 0);
            let text = 0;
            for (const [role, list] of Object.entries(roles)) {
              if (!list.length) continue;
              let width = 0;
              let lines0 = 0;
              for (const [rg, el, k] of list) {
                const cs = getComputedStyle(el);
                const fs = parseFloat(cs.fontSize);
                // An inline run (the eyebrow's code span) sits on its block's strut, so a line is as
                // tall as the larger of the two line heights.
                const lhOf = (c) => (c.lineHeight === 'normal' ? parseFloat(c.fontSize) * 1.2 : parseFloat(c.lineHeight));
                const lh = Math.max(lhOf(cs), el.parentElement && getComputedStyle(el).display === 'inline' ? lhOf(getComputedStyle(el.parentElement)) : 0);
                const rows = lineRects(rg, fs);
                for (const q of rows) width = Math.max(width, q.right - q.left);
                // A block role's line is its content box; the widest wrapped line falls short of it by
                // up to a word. A title shares its item's box with an ordinal or a pill, so it keeps
                // the widest line.
                const box = role === 'eyebrow' ? el.parentElement : el;
                const bs = getComputedStyle(box);
                if (role !== 'title') width = Math.max(width, box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight));
                if (!geo[role]) {
                  const t = cs.textTransform === 'uppercase' ? sample.toUpperCase() : sample;
                  cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                  geo[role] = { advance: cv.measureText(t).width / t.length + (parseFloat(cs.letterSpacing) || 0), lh };
                }
                if (k == null) text += rows.length * geo[role].lh;
                else perItem[k] += rows.length * geo[role].lh;
                lines0 += rows.length;
              }
              geo[role].width = width;
              geo[role].lines = lines0;
            }
            // Rows: items grouped by their top edge; a row is as tall as its tallest item.
            const tops = [];
            lis.forEach((li, k) => {
              const t = li.getBoundingClientRect().top;
              const row = tops.find((x) => Math.abs(x.top - t) < 2);
              if (row) row.h = Math.max(row.h, perItem[k]); else tops.push({ top: t, h: perItem[k] });
            });
            text += tops.reduce((a, x) => a + x.h, 0);
            const firstW = lis[0].getBoundingClientRect().width;
            const lastW = lis[lis.length - 1].getBoundingClientRect().width;
            return {
              rows: tops.length, cols: Math.max(...tops.map((x) => lis.filter((li) => Math.abs(li.getBoundingClientRect().top - x.top) < 2).length)),
              span: Math.round((lastW / firstW) * 100) / 100,
              // Overflow past the stage, minus the text: overhead minus space, in slide px.
              k: (stage.scrollHeight - stage.clientHeight - text) * unit,
              over: stage.scrollHeight > stage.clientHeight,
              // Characters to a tenth (a narrow column holds 16, so a tenth is half a percent); a line's
              // height to the whole px, half a px a line against a budget near 1500.
              geo: Object.fromEntries(Object.entries(geo).map(([role, g]) => [role, [Math.round((g.width / g.advance) * 10) / 10, Math.round(g.lh * unit)]])),
            };
          });
        }, SAMPLE.join(' '));
        await page.close();
        if (got.length !== probes.length) die(`${venue}: ${got.length} measured sections for ${probes.length} probes.`);
        const by = {};
        probes.forEach((p, i) => {
          if (!got[i].over) die(`the ${p.reg} ${p.shape} ${p.tag} probe did not overflow at ${venue} — lengthen it.`);
          ((by[p.reg] ||= {})[p.shape] ||= {})[p.tag] = got[i];
        });
        // The masthead and coda roles (eyebrow, heading, callout) and their block costs are the
        // standard frame's, the same on every register: stored once, as `frame`, and checked here.
        const frame = (out.frame ||= {});
        for (const [reg, shapes] of Object.entries(by)) {
          const R = (out[reg] ||= {});
          for (const [shape, t] of Object.entries(shapes)) {
            // One row: nothing to separate a row's cost from the budget's, so it stays in the budget.
            const row = t.B ? (t.B.k - t.A.k) / (t.B.rows - t.A.rows) : 0;
            const f = { eyebrow: t.A.geo.eyebrow, heading: t.A.geo.heading, callout: t.A.geo.callout, eyebrowAt: Math.round(t.A.k - t.E.k), calloutAt: Math.round(t.A.k - t.C.k) };
            for (const [k, v] of Object.entries(f)) {
              const had = frame[k]?.[venue];
              if (had == null) (frame[k] ||= {})[venue] = v;
              // Half a character a line, or 4 px: past either, the frame is not the same frame.
              else if ([had].flat().some((x, j) => Math.abs(x - [v].flat()[j]) > (Array.isArray(v) && !j ? 0.5 : 4))) die(`${reg} ${shape} at ${venue}: the frame's ${k} reads ${JSON.stringify(v)}, not ${JSON.stringify(had)} — the frame is not shared, so one row cannot hold it.`);
            }
            const g = shape.endsWith('.ol') ? ((R.ordered ||= {})[shape.slice(0, -3)] ||= {}) : (R[shape] ||= {});
            const budget = (A) => Math.round(FRAME_TOLERANCE - (A.k - A.rows * row - f.eyebrowAt - f.calloutAt));
            if (t.B) {
              for (const role of ['title', 'body']) if (t.A.geo[role]) (g[role] ||= {})[venue] = t.A.geo[role];
              // The budget: what `used` may reach, FRAME_TOLERANCE included.
              (g.budget ||= {})[venue] = budget(t.A);
              R.cols = t.A.cols;
            } else {
              // One row: a role's characters for 2, 3, … steps; the budget is the least any count reads.
              for (const role of ['title', 'body']) if (t.A.geo[role]) (g[role] ||= {})[venue] = [ONE_ROW.map((n) => t[`A${n}`].geo[role][0]), t.A.geo[role][1]];
              (g.budget ||= {})[venue] = Math.min(...ONE_ROW.map((n) => budget(t[`A${n}`])));
              R.cols = 0;
            }
            (g.row ||= {})[venue] = Math.round(row);
            if (t.S && t.S.span > 1.2) R.span = t.S.span;
          }
        }
      } finally {
        r.cleanup();
      }
    }
  } finally {
    await browser.close();
  }
  // An ordered shape that wraps and costs the same as the unordered one is not stored.
  for (const R of Object.values(out)) {
    if (!R.ordered) continue;
    for (const [shape, g] of Object.entries(R.ordered)) {
      const u = R[shape];
      const same = u && Object.entries(g).every(([k, v]) => Object.entries(v).every(([ven, x]) => [x].flat().every((y, j) => Math.abs(y - [u[k][ven]].flat()[j]) <= (k === 'title' || k === 'body' ? (j ? 1 : 0.5) : 4))));
      if (same) delete R.ordered[shape];
    }
    if (!Object.keys(R.ordered).length) delete R.ordered;
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`\n  ${comp} · row line geometry · [characters a line holds, px a line takes] of a 2160-high slide`);
    const show = (name, g) => {
      console.log(`\n    ${name}`);
      for (const [k, v] of Object.entries(g)) {
        if (v && typeof v === 'object' && !v.laptop) show(`${name} · ${k}`, v);
        else console.log(`      ${k.padEnd(10)} ${typeof v === 'number' ? v : Object.entries(v).map(([ven, x]) => `${ven} ${JSON.stringify(x)}`).join(' · ')}`);
      }
    };
    for (const [reg, g] of Object.entries(out)) show(reg, g);
    console.log('\n  Write it into the manifest as venueCapacity.rows (--json prints that object).');
  }
}

main().catch((e) => die(e.stack || String(e)));
