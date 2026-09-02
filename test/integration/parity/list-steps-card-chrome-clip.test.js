/**
 * PROTECTED-machinery regression — a dense `list-steps` strip must not have the
 * bottom border, radius and shadow shorn off EVERY card by the stage clip.
 *
 * The strip is `ol { display:flex; flex:1 }` inside `.cell-stage`, a bounded
 * clipping cell (flex:1; min-height:0; overflow:clip). A flex item's default
 * `min-height:auto` floors an item at its CONTENT height, so without an explicit
 * `min-height:0` the `ol` refused to shrink to the stage: one dense step grew the
 * row past the cell and `overflow:clip` sheared the card chrome. `align-items:
 * stretch` gives every card the tallest card's height, so a single overstuffed
 * step took all four cards' bottom edges with it — and in the case that started
 * this (measured at `size: hd`: a 460.3px row in a 438.2px stage) not one word of
 * text was actually lost. Pure chrome damage, on cards that were not even full.
 * Landscape hits it first: a 16:9 stage is the shortest one a four-column strip
 * has to fit into.
 *
 * Two arms, and the second is why this file is not just a CSS text assertion:
 *
 *   1. DENSE — cards full to the last line, but the text fits. Every card's
 *      border box must stay inside the stage's clip edge, and the real
 *      overflow probe must read `over:false`.
 *   2. OVERSTUFFED — a body that genuinely cannot fit. The probe must STILL read
 *      `over:true`. Releasing the floor buys a closed card frame; it must not buy
 *      it by swallowing an overflow the export's "Content clipped" tag exists to
 *      report (the same silent-clip trap contact-overflow-preserved.test.js
 *      guards, from the other direction).
 *
 * Drop `min-height:0` from `section.list-steps ol` and arm 1 fails twice over —
 * the cards hang past the clip edge AND the probe flips to `over:true`.
 *
 * Needs Chromium + the emulator (renders the deck, measures the laid-out DOM).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, probeSectionOverflow } = require('../../../lib/core/overflow-probe');

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// `size:` is omitted on purpose — hd (1280x720) is the default and the shortest
// landscape stage, which is where the shear was reported.
function deck(sample) {
  return `---\nmarp: true\ntheme: indaco\n---\n\n${sample.trim()}\n`;
}

// Four steps whose bodies fill the cards to the last line at hd. Before the fix
// this row measured 460.3px against a 438.2px stage — every card lost its bottom
// border, and no text was clipped at all.
const DENSE = `<!-- _class: list-steps -->

## Dense material, four steps.

1. Scope the commitment
   - Name the obligation, the counterparty, and the date it binds.
   - Say what happens if the date slips, in one clause, and then say who hears about it first and on what day.
2. Price the exposure
   - Model the downside at P50 and P95, then state the number you would defend.
   - Attach the assumption that moves the answer most, and the range it moves over.
3. Assign the owner
   - One name, not a team. The owner reports on the cadence below.
   - Escalation path is named here, not discovered later when it is needed.
4. Set the review
   - Monthly until the risk closes, then quarterly through the term.
   - The review reads this slide back and marks each step green or red.
`;

// Step 01 carries roughly double what a card holds — a real overflow the author
// must be told about, not a layout the engine can absorb.
const OVERSTUFFED = `<!-- _class: list-steps -->

## Far over capacity.

1. Scope the commitment
   - Name the obligation, the counterparty, and the date it binds, together with the reporting line that carries it and the ledger entry it lands in.
   - Say what happens if the date slips, in one clause, and then say who hears about it first and on what day, and what they are expected to do about it.
   - A third bullet nobody has room for, which is the point of this fixture.
2. Price the exposure
   - Model the downside at P50 and P95, then state the number you would defend.
   - Attach the assumption that moves the answer most.
3. Assign the owner
   - One name, not a team.
4. Set the review
   - Monthly until the risk closes.
`;

describe('a dense list-steps strip keeps its card chrome inside the stage clip', () => {
  const chrome = resolveChrome();
  let browser;

  if (!chrome) {
    test('SKIPPED — no Chromium available', { skip: true }, () => {});
    return;
  }
  process.env.CHROME_PATH = chrome;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  async function measure(sample, key) {
    const html = renderHtml(deck(sample), { key, timeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    // probeSectionOverflow is self-contained (its helpers nest inside its body,
    // per overflow-probe.js's injection contract), so puppeteer can serialize it
    // and run the REAL probe in-page against the section. No eval.
    const over = (await page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1, IGNORED_CLIP_SELECTOR)).over;
    const cards = await page.$eval('section.list-steps', (sec) => {
      const stage = sec.querySelector(':scope > .cell-stage');
      const clipEdge = stage.getBoundingClientRect().bottom;
      return [...stage.querySelectorAll(':scope > ol > li')].map((li) => ({
        // How far the card's BORDER BOX hangs past the cell that clips it.
        shorn: +(li.getBoundingClientRect().bottom - clipEdge).toFixed(2),
      }));
    });
    await page.close();
    return { over, cards };
  }

  test('a dense strip: no card hangs past the clip edge, and nothing overflows', async () => {
    const { over, cards } = await measure(DENSE, 'list-steps-dense-strip');
    assert.equal(cards.length, 4, 'fixture should render four step cards');
    for (const [i, card] of cards.entries()) {
      assert.ok(
        card.shorn <= 0.5,
        `REGRESSION: step card ${i + 1} hangs ${card.shorn}px past the .cell-stage clip edge, so its ` +
          'bottom border, radius and shadow are sheared off. `min-height:0` on `section.list-steps ol` ' +
          'is missing or ineffective — the flex `min-height:auto` floor is holding the row at its ' +
          'content height (see list-steps.styles.css).',
      );
    }
    assert.equal(over, false, 'a dense-but-fitting strip must not report overflow');
  });

  test('an overstuffed strip still reports overflow — the fix must not swallow it', async () => {
    const { over } = await measure(OVERSTUFFED, 'list-steps-overstuffed-strip');
    assert.equal(
      over,
      true,
      'REGRESSION: a step body far past the card was silently clipped instead of reporting overflow. ' +
        'Releasing the row\'s min-height floor must let an over-long body spill out of the card and ' +
        'trip the probe — giving the card `overflow:clip` would hide it from the export warning.',
    );
  });
});
