#!/usr/bin/env node
/**
 * calibrate-panel — the claim panel's LINE GEOMETRY, for `calibrate-capacity split-panel --panel`.
 *
 * On `split-panel proof` the slide clips in its 31% claim panel, not its list: rendered at hall,
 * shortening the heading or the lede un-clips a real slide and shortening the points does not
 * (2026-09-25-font-scale-fit.md, Amendment (5)). Word counts could not tell the rest apart — a
 * 47-character heading over a 154-character lede clips at hall and a 50 / 160 one fits — and
 * LINE counts separate every one (Amendment (6)). So the row is the panel's LINE GEOMETRY, not a
 * word count: for each text role (eyebrow, heading, the `proof` question, the lede) the characters
 * a line holds and the height a line takes, and the height the panel's text column holds, per
 * venue. Lint wraps the slide's own text into those lines and adds the heights.
 *
 * Heights are in px of a 2160-high slide (the rig renders at `size: 4k`, where a layout px IS that
 * unit and FRAME_TOLERANCE is 12 of them); a 720-high deck reads the same geometry a third the size.
 * Characters per line = the role's box width ÷ (its font size × the font's average advance per
 * character), the advance measured on PANEL_PROSE in the role's own font — a flat character count,
 * which wraps the shipped panels' heading, question and lede lines right in 56/60, 51/52 and 56/60
 * cases (Amendment (6)).
 *
 * Usage (through calibrate-capacity, or directly): node tools/lib/calibrate-panel.js [--json]
 */

const { BUILDERS, gradedDeck, renderProbe, words, cap } = require('./calibrate-core.js');
const { resolveChrome } = require('./resolve-chrome.js');
const { FRAME_TOLERANCE } = require('../../lib/core/overflow-probe.js');

const JSON_OUT = process.argv.includes('--json');
function die(msg) {
  console.error(msg);
  process.exit(1);
}

const PANEL_PROSE = 'you recall syntax patterns and standards so the path is known and the job is to follow it without error while the team learns what a real answer should look like before anyone writes code'.split(' ');
const prose = (n) => cap(Array.from({ length: n }, (_, i) => PANEL_PROSE[i % PANEL_PROSE.length]).join(' '));
const PANEL_POINTS = {
  // The real `proof` shape: a scenario signal and two proof cards, at the length the shipped decks write.
  proof: `- You know you're here when\n  - ${cap(words(12))}.\n- ${cap(words(3))}\n  - ${cap(words(10))}.\n- ${cap(words(3))}\n  - ${cap(words(10))}.`,
  default: Array.from({ length: 3 }, () => BUILDERS['split-panel'](10)).join('\n'),
};
PANEL_POINTS.capstone = PANEL_POINTS.proof;
// The registers the panel geometry is measured for; `capstone` rides on `proof`.
const PANEL_REGISTERS = { bare: 'split-panel', proof: 'split-panel proof', capstone: 'split-panel proof capstone' };
const PANEL_VENUES = { laptop: null, huddle: 'l', conference: 'xl', hall: '2xl' };
async function main() {
  const chrome = resolveChrome();
  if (!chrome) die('no Chromium (set CHROME_PATH) — nothing was measured.');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const out = {};
  try {
    for (const [venue, scale] of Object.entries(PANEL_VENUES)) {
      // One slide per register, each with an eyebrow, a heading, a lede that opens on a
      // question and runs long enough to overflow the panel at every venue (so the panel's
      // fixed overhead can be read off its scrollHeight), and the register's usual points.
      const regs = Object.entries(PANEL_REGISTERS);
      const deck = gradedDeck({
        comp: 'split-panel', size: '4k', scale, steps: regs,
        slideFor: ([reg]) => ({ slide: `\`Calibration · eyebrow\`\n\n## ${prose(6)}.\n\n*What does a real answer look like?* ${prose(160)}.\n\n${PANEL_POINTS[reg] || PANEL_POINTS.default}` }),
      }).replace(/<!-- _class: split-panel -->/g, (() => { let i = 0; return () => `<!-- _class: ${regs[i++][1]} -->`; })());
      const r = renderProbe(deck, `split-panel-lines-${venue}`, { format: 'html', keep: true });
      try {
        const page = await browser.newPage();
        await page.goto(`file://${r.out}`, { waitUntil: 'load', timeout: 120_000 });
        await page.evaluate(() => document.fonts.ready);
        const rows = await page.evaluate((sample, tol) => {
          const cv = document.createElement('canvas').getContext('2d');
          return [...document.querySelectorAll('section.split-panel')].map((sec) => {
            const unit = 2160 / sec.clientHeight;
            const L = sec.querySelector('.panel-left');
            const p = L.querySelector(':scope > p');
            const em = p.querySelector('em:first-child');
            const q = em && getComputedStyle(em).display === 'block' ? em : null;
            const roles = { eyebrow: L.querySelector('.panel-eyebrow'), heading: L.querySelector(':scope > h2'), question: q, lede: p };
            const geo = {};
            for (const [role, el] of Object.entries(roles)) {
              if (!el) continue;
              const cs = getComputedStyle(el);
              const fs = parseFloat(cs.fontSize);
              const text = cs.textTransform === 'uppercase' ? sample.toUpperCase() : sample;
              cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
              const advance = cv.measureText(text).width / text.length + (parseFloat(cs.letterSpacing) || 0);
              const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight);
              geo[role] = [Math.round((el.clientWidth / advance) * 10) / 10, Math.round(lh * unit * 10) / 10];
            }
            // Lines a box's text takes: its client rects grouped by top (an inline run in another
            // font sits a few px off the line it shares), skipping any above `below`.
            const lines = (el, below = -Infinity) => {
              const range = document.createRange();
              range.selectNodeContents(el);
              const tops = [];
              const rects = [...range.getClientRects()].filter((q) => q.width > 1 && q.top >= below).sort((a, b) => a.top - b.top);
              for (const q of rects) if (!tops.length || q.top - tops[tops.length - 1] > parseFloat(getComputedStyle(el).fontSize) * 0.6) tops.push(q.top);
              return tops.length;
            };
            const n = {
              eyebrow: roles.eyebrow && lines(roles.eyebrow), heading: lines(roles.heading),
              question: q && lines(q), lede: lines(p, q ? q.getBoundingClientRect().bottom - 1 : -Infinity),
            };
            // Everything in the column that is not a line of text — the panel's padding, each
            // block's padding, the question's gap — is overhead the budget absorbs. A slide with
            // no eyebrow or no question keeps that block's padding in the budget, which errs toward
            // a warning by at most a line.
            const text = Object.entries(n).reduce((a, [role, k]) => a + (k ? (k * geo[role][1]) / unit : 0), 0);
            geo.budget = Math.round((L.clientHeight - (L.scrollHeight - text) + tol) * unit);
            geo.overflowed = L.scrollHeight > L.clientHeight;
            return geo;
          });
        }, PANEL_PROSE.join(' '), FRAME_TOLERANCE);
        await page.close();
        rows.forEach((g, i) => {
          if (!g.overflowed) die(`the ${regs[i][0]} probe did not overflow at ${venue}, so its overhead cannot be read — lengthen the probe lede.`);
          delete g.overflowed;
          const reg = (out[regs[i][0]] ||= {});
          for (const [k, v] of Object.entries(g)) (reg[k] ||= {})[venue] = v;
        });
      } finally {
        r.cleanup();
      }
    }
  } finally {
    await browser.close();
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else {
    console.log('\n  split-panel · claim panel line geometry · [characters a line holds, px a line takes] of a 2160-high slide');
    for (const [reg, g] of Object.entries(out)) {
      console.log(`\n    ${reg}`);
      for (const [k, v] of Object.entries(g)) console.log(`      ${k.padEnd(9)} ${typeof v === 'number' ? v : Object.entries(v).map(([ven, x]) => `${ven} ${JSON.stringify(x)}`).join(' · ')}`);
    }
    console.log('\n  Write it into the manifest as venueCapacity.panel.lines (--json prints that object).');
  }
}

main().catch((e) => die(e.stack || String(e)));
