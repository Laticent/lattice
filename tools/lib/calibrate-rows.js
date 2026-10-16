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
const { FRAME_TOLERANCE, probeSectionOverflow, CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR } = require('../../lib/core/overflow-probe.js');

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
  // The badge registers (`phase`, `milestone`, `milestone lettered`) rename the STEP badge; `vertical`
  // stacks the steps (one column, a row cost); `capsule` centers a row of cards with a pill badge
  // and a display-face title (Amendment (10)).
  'list-steps': { bare: ['nested'], vertical: ['nested'], 'vertical compact': ['nested'], phase: ['nested'], milestone: ['nested'], 'milestone lettered': ['nested'], capsule: ['nested'] },
  // Two cards in one row, a title over a body (Amendment (9)); `vertical` stacks them, one column.
  'compare-prose': { bare: ['nested'], transition: ['nested'], mirror: ['nested'], chosen: ['nested'], decision: ['nested'], vertical: ['nested'], 'mirror chosen': ['nested'], 'chosen vertical': ['nested'] },
  // A ring of stages in one row, each a name over one clause (Amendment (9)).
  cycle: { bare: ['nested'] },
};
// Columns per register; 0 is ONE ROW of every item (list-steps), where a step's width is the
// stage's shared by the step count, so each role's characters are measured per count (ONE_ROW).
// At six steps the columns reach their minimum width and the row stops sharing (the budget drops by
// a line), so a longer row keeps its count row.
const COLS = { 'cards-grid': 2, 'cards-grid three': 3, 'cards-grid four': 4, 'list-steps': 0, 'list-steps phase': 0, 'list-steps milestone': 0, 'list-steps milestone lettered': 0, 'list-steps capsule': 0, 'compare-prose': 0, 'compare-prose transition': 0, 'compare-prose mirror': 0, 'compare-prose chosen': 0, 'compare-prose decision': 0, 'compare-prose mirror chosen': 0, cycle: 0 };
// The item counts a one-row register is measured at, from two (lint reads a count's characters at
// index `count - 2`). compare-prose is two cards by contract. cycle documents three to six stages,
// but at six a hall column is narrower than the probe's longest word (every role reads 10.7 there,
// the word, not the column), so a six-stage ring keeps its count row, as list-steps does.
const ONE_ROW_AT = { 'list-steps': [2, 3, 4, 5], 'compare-prose': [2], cycle: [2, 3, 4, 5] };
// list-steps lays out a ROW only as an ordered list (`1.`), the form it documents; written with `-`
// it is a plain vertical list, which keeps its count row.
const ORDERED_ONLY = new Set(['list-steps']);
// cycle styles only `ul > li` (an `ol` renders as a plain list), and compare-prose writes `1.` only
// in `axis`, which this rig does not measure: both are measured unordered only, and the row is
// stored with `ul: 1` so lint keeps an ordered slide on its count row.
const UNORDERED_ONLY = new Set(['compare-prose', 'cycle']);
// Universal modifiers a register may be measured with that restyle the masthead as well as the
// stage (`compact` tightens both): such a register stores its own `frame`.
const OWN_FRAME = ['compact'];
// A ring the stage CENTERS (cycle: `justify-content: safe center`). An overflowing probe's text runs
// out of its card, so the card's bottom padding, the ring's reserved arc band and its ↻ mark (drawn
// half below the ring) sit inside the text's overflow and never reach the overhead. On a real slide
// near the edge the ring is centered, and the export flags it once the mark's overhang passes the
// free space below it: overhang − (stage − ring) / 2 > FRAME_TOLERANCE. So the probe lets the list
// grow to its content (the whole ring counted), and the budget gives back the overhang past the
// tolerance, twice halved: talk slide 3 (four short stages) clips at huddle by 12 px and read 20%
// under without it (Amendment (9)). compare-prose is NOT grown: its stage does not center, and its
// card's bottom padding is squeezable — the export flags nothing until text leaves the card
// (kaizen slide 10 at huddle, 25 px into the padding, renders whole). `list-steps capsule` centers
// its row of cards the same way (`justify-content: safe center`), with no mark below it: grown, its
// cards' bottom padding is counted (Amendment (10)). Keyed by the slide's classes.
const GROW = ['cycle', 'list-steps capsule'];

const SAMPLE = 'you recall syntax patterns and standards so the path is known and the job is to follow it without error while the team learns what a real answer should look like before anyone writes code'.split(' ');
const prose = (n, from = 0) => cap(Array.from({ length: n }, (_, i) => SAMPLE[(i + from) % SAMPLE.length]).join(' '));

/** One probe slide: long enough in every role that each wraps and the stage overflows. */
// Words in a nested body. Two compare-prose cards share the whole stage, so a 40-word body leaves
// the laptop probe with no eyebrow short of the stage's foot; a probe that fits measures nothing.
const BODY_WORDS = { 'compare-prose': 110 };
// Components whose slide may close on a NOTE, a paragraph under the list inside the stage
// (compare-prose `:is(ul, ol) + p`): measured as its own role, with the block's cost (`noteAt`).
const NOTE = new Set(['compare-prose']);
// Components whose overflow is read with the export's own probe (`probeSectionOverflow`) rather
// than the stage's scroll height. A note sits under the squeezed cards, so the cards' text runs
// down past it, and a scroll height takes the larger of the two where the export measures the
// cards against the note's top: the sum, which is what the model adds.
const PROBED = new Set(['compare-prose']);
function probe({ cls, shape, n, eyebrow, callout, ol, note }) {
  const bodyWords = BODY_WORDS[cls.split(' ')[0]] || 40;
  const mark = (i) => (ol ? `${i + 1}.` : '-');
  const pad = (i) => ' '.repeat(mark(i).length + 1);
  const items = Array.from({ length: n }, (_, i) => (shape === 'nested'
    ? `${mark(i)} ${prose(24, i)}\n${pad(i)}- ${prose(bodyWords, i + 3)}.`
    // 60 words, not 40: with list rows at --fs-body (16pt at laptop) four 40-word takeaway items
    // no longer overflowed, and a probe that fits measures nothing. Length does not move the
    // geometry, only whether the stage overflows.
    : `${mark(i)} ${prose(60, i)}.`)).join('\n');
  return `<!-- _class: ${cls} -->\n\n${eyebrow ? `\`Calibration · ${prose(18).toUpperCase()}\`\n\n` : ''}## ${prose(16)}.\n\n${items}\n${note ? `\n${prose(30, 7)}.\n` : ''}${callout ? `\n> ${prose(22, 5)}.\n` : ''}`;
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
        const ONE_ROW = ONE_ROW_AT[comp];
        for (const shape of shapes.flatMap((x) => (ORDERED_ONLY.has(comp) ? [`${x}.ol`] : UNORDERED_ONLY.has(comp) ? [x] : [x, `${x}.ol`]))) {
          // One row: the frame probes (no eyebrow, no callout) at four items, or the first count
          // measured where four is not one (compare-prose's two cards).
          const a = cols === 1 ? 4 : 2 * cols || (ONE_ROW.includes(4) ? 4 : ONE_ROW[0]);
          const b = cols === 1 ? 7 : 4 * cols;
          const tags = { A: { n: a, eyebrow: 1, callout: 1 }, B: { n: b, eyebrow: 1, callout: 1 }, E: { n: a, eyebrow: 0, callout: 1 }, C: { n: a, eyebrow: 1, callout: 0 }, S: { n: a + 1, eyebrow: 1, callout: 1 } };
          // Measured against the no-eyebrow probe (E): with an eyebrow, a callout and the note under
          // a 16-word heading, the hall stage is squeezed to nothing and the cards' overflow stops
          // adding to the note's.
          if (NOTE.has(comp) && !cols) tags.N = { n: a, eyebrow: 0, callout: 1, note: 1 };
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
        await page.addScriptTag({ content: `window.__probeSectionOverflow = ${probeSectionOverflow.toString()};` });
        const got = await page.evaluate((sample, growing, probed) => {
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
            const grow = growing.some((g) => g.split(' ').every((c) => sec.classList.contains(c)));
            const stage = sec.querySelector('.cell-stage');
            const list = stage.querySelector(':scope > ul, :scope > ol');
            if (grow) list.style.minHeight = 'auto';
            // What the list's own decorations hang below it (cycle's ↻ mark), once it is grown.
            const hang = grow && /center/.test(getComputedStyle(stage).justifyContent) ? Math.max(0, list.scrollHeight - list.clientHeight) : 0;
            const lis = [...list.children].filter((x) => x.tagName === 'LI');
            // Every role's text as [range, the element whose font sets it, the item it belongs to].
            const roles = { eyebrow: [], heading: [], title: [], body: [], callout: [], note: [] };
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
              // A lead the transform wraps in <strong> is drawn as a corner tag (compare-prose,
              // base.card-tag.css): its font, not the item's, sets its lines.
              const tag = li.firstChild === li.firstElementChild && li.firstElementChild?.tagName === 'STRONG' && getComputedStyle(li.firstElementChild).textTransform === 'uppercase' ? li.firstElementChild : null;
              roles.title.push([rg, tag || li, k]);
              if (tag) roles.tagged = true;
              if (sub) for (const b of sub.children) roles.body.push([whole(b), b, k]);
            });
            for (const p of sec.querySelectorAll('.cell-coda blockquote p')) roles.callout.push([whole(p), p]);
            for (const p of stage.querySelectorAll(':scope > p')) roles.note.push([whole(p), p]);
            const geo = {};
            const perItem = lis.map(() => 0);
            let text = 0;
            const tagged = roles.tagged === true;
            delete roles.tagged;
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
                // A tag is absolutely placed in the padding the card reserves for one tag line
                // (base.card-tag.css `--card-tag-h`), so its lines move nothing: it costs no height.
                if (k == null) text += rows.length * geo[role].lh;
                else if (!(role === 'title' && tagged)) perItem[k] += rows.length * geo[role].lh;
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
              tagged, hang: hang * unit, rows: tops.length, cols: Math.max(...tops.map((x) => lis.filter((li) => Math.abs(li.getBoundingClientRect().top - x.top) < 2).length)),
              span: Math.round((lastW / firstW) * 100) / 100,
              // Overflow past the stage, minus the text: overhead minus space, in slide px.
              k: ((probed ? (({ scrollH, clientH }) => scrollH - clientH)(window.__probeSectionOverflow(sec, ...probed)) : stage.scrollHeight - stage.clientHeight) - text) * unit,
              over: stage.scrollHeight > stage.clientHeight,
              // Characters to a tenth (a narrow column holds 16, so a tenth is half a percent); a line's
              // height to the whole px, half a px a line against a budget near 1500.
              geo: Object.fromEntries(Object.entries(geo).map(([role, g]) => [role, [Math.round((g.width / g.advance) * 10) / 10, Math.round(g.lh * unit)]])),
            };
          });
        }, SAMPLE.join(' '), GROW, PROBED.has(comp) && [CLIP_CELL_SELECTOR, FRAME_TOLERANCE, IGNORED_CLIP_SELECTOR]);
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
            // A register measured with a universal modifier that tightens the masthead too (`compact`)
            // keeps its own frame (Amendment (10)); every other register shares the component's.
            const own = OWN_FRAME.some((t) => reg.split(' ').includes(t));
            const fr = own ? (R.frame ||= {}) : frame;
            for (const [k, v] of Object.entries(f)) {
              const had = fr[k]?.[venue];
              if (had == null) (fr[k] ||= {})[venue] = v;
              // Half a character a line, or 4 px: past either, the frame is not the same frame.
              else if ([had].flat().some((x, j) => Math.abs(x - [v].flat()[j]) > (Array.isArray(v) && !j ? 0.5 : 4))) die(`${reg} ${shape} at ${venue}: the frame's ${k} reads ${JSON.stringify(v)}, not ${JSON.stringify(had)} — the frame is not shared, so one row cannot hold it.`);
            }
            const g = shape.endsWith('.ol') ? ((R.ordered ||= {})[shape.slice(0, -3)] ||= {}) : (R[shape] ||= {});
            // A centered ring flags at half its overhang's slope (GROW, above).
            const budget = (A) => Math.round(FRAME_TOLERANCE - (A.k - A.rows * row - f.eyebrowAt - f.calloutAt) - Math.max(0, A.hang - FRAME_TOLERANCE));
            if (t.B) {
              for (const role of ['title', 'body']) if (t.A.geo[role] && !(role === 'title' && t.A.tagged)) (g[role] ||= {})[venue] = t.A.geo[role];
              // The budget: what `used` may reach, FRAME_TOLERANCE included.
              (g.budget ||= {})[venue] = budget(t.A);
              R.cols = t.A.cols;
            } else {
              // One row: a role's characters for 2, 3, … steps. The budget is one number where every count
              // reads it within 2 px, and one per count where it does not: a badge that wraps at five
              // narrow steps (`list-steps milestone`, `MILESTONE 05`) costs a line at five steps only,
              // and the least of them would charge a three-step slide for it (Amendment (10)).
              const ONE_ROW = ONE_ROW_AT[comp];
              for (const role of ['title', 'body']) if (t.A.geo[role] && !(role === 'title' && t.A.tagged)) (g[role] ||= {})[venue] = [ONE_ROW.map((n) => t[`A${n}`].geo[role][0]), t.A.geo[role][1]];
              const per = ONE_ROW.map((n) => budget(t[`A${n}`]));
              (g.budget ||= {})[venue] = Math.max(...per) - Math.min(...per) <= 2 ? Math.min(...per) : per;
              R.cols = 0;
            }
            (g.row ||= {})[venue] = Math.round(row);
            // A note: its lines at its own geometry, and what its block adds past them. Measured on a
            // one-row register only: stacked (`vertical`), the note costs 238 px where this model
            // charges 168 (the checker's probe, Amendment (9)), so a stacked slide with a note keeps
            // its count row.
            if (t.N && !t.B) {
              (g.note ||= {})[venue] = t.N.geo.note;
              (g.noteAt ||= {})[venue] = Math.round(t.N.k - t.E.k);
            }
            if (t.S && t.S.span > 1.2) R.span = t.S.span;
            if (UNORDERED_ONLY.has(comp)) R.ul = 1;
            // A tag title costs no height, so it stores no geometry; lint charges it nothing.
            if (t.A.tagged) R.tag = 1;
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
