/**
 * Integration: a `list` row is sized from its content, on the real render.
 *
 * `list` lays its rows out as a one-column grid, each row `minmax(min-content, ceiling)`
 * (lib/components/inventory/list/list.styles.css § Spine). Every source-level test of that
 * shape passed while two geometric defects shipped on the branch that built it, so this file
 * measures the rendered DOM instead:
 *
 *  - a row that wraps must keep its text inside its box on a FULL wide slide. The old
 *    equal-share bands pushed a wrapped row's second line out of its pill, and an `auto`
 *    floor did it again, because a grid clamps an automatic minimum to a fixed maximum;
 *  - a member ALONE on a split page must fill the page. The split-page fill rule
 *    (base.modifiers.css § Split BODY pages) grows a row with `flex` and `align-content:
 *    stretch`, neither of which reaches a capped track, and every list at square/tall/strip
 *    splits one member per page — so each page showed a pill atop an empty stage;
 *  - `stretch` fills the stage, and `center` does not.
 *
 * See engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §12.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

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

const deck = (front, body) => `---\nmarp: true\ntheme: indaco\n${front}---\n\n${body.trim()}\n`;

const WRAP = 'A long line may spend twenty words, and this one spends them to show where the wrap lands.';
const WIDE = deck('', `
<!-- _class: list -->

## Five pills, one wrapping.

1. ${WRAP}
2. Short lines give some air back.
3. The rows share what the stage has left.
4. No row ever shrinks below its text.
5. Five is a comfortable wide list.

---

<!-- _class: list takeaway numbered -->

## Four gloss rows.

1. State the bar plainly
   - Each criterion is a pass-or-fail line, not a preference, and it says so.
2. Order by veto power
   - The criterion most likely to kill the decision goes first.
3. Keep the list short
   - Three gates decide; six gates stall.
4. Name the owner
   - Somebody signs for each gate.

---

<!-- _class: list cards-stretch -->

## Stretch fills.

- One.
- Two.
- Three.

---

<!-- _class: list cards-center -->

## Center does not.

- One.
- Two.
- Three.
`);
const PORTRAIT = deck('size: portrait\n', `
<!-- _class: list -->

## A portrait list splits one row per page.

- The first point.
- The second point.
- The third point.
- The fourth point.
`);

/** Per list section: stage height, each row's box height, and the worst line-box spill. */
function measure() {
  return [...document.querySelectorAll('section.list')].map((s) => {
    const ul = s.querySelector(':scope > .cell-stage > :is(ul, ol)');
    const rows = [...ul.children].map((li) => {
      const box = li.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(li);
      let spill = 0;
      for (const r of range.getClientRects()) spill = Math.max(spill, box.top - r.top, r.bottom - box.bottom);
      return { h: box.height, spill };
    });
    return { stage: s.querySelector('.cell-stage').clientHeight, split: s.classList.contains('lat-split-native'), rows };
  });
}

describe('list rows are sized from their content (rendered)', () => {
  const chrome = resolveChrome();
  let browser;
  let wide;
  let portrait;
  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const read = async (md, key) => {
      const page = await browser.newPage();
      await page.goto(`file://${renderHtml(md, { key })}`, { waitUntil: 'networkidle0' });
      const out = await page.evaluate(measure);
      await page.close();
      return out;
    };
    wide = await read(WIDE, 'list-row-fit-wide');
    portrait = await read(PORTRAIT, 'list-row-fit-portrait');
  });
  after(async () => { if (browser) await browser.close(); });

  test('no row lets its text leave its box on a full wide slide', () => {
    for (const [i, s] of wide.slice(0, 2).entries()) {
      for (const r of s.rows) assert.ok(r.spill <= 1, `slide ${i + 1}: a line box sits ${r.spill}px outside its row`);
    }
  });

  test('a wrapped row is taller than its one-line siblings', () => {
    const [first, second] = wide[0].rows;
    assert.ok(first.h > second.h + 10, `the wrapped row (${first.h}px) must grow past a one-liner (${second.h}px)`);
  });

  test('stretch fills the stage and center does not', () => {
    const fill = (s) => (s.rows.reduce((a, r) => a + r.h, 0)) / s.stage;
    assert.ok(fill(wide[2]) > 0.85, `cards-stretch rows fill ${Math.round(fill(wide[2]) * 100)}% of the stage`);
    assert.ok(fill(wide[3]) < 0.6, `cards-center rows fill ${Math.round(fill(wide[3]) * 100)}% of the stage`);
  });

  test('a member alone on a split page fills the page', () => {
    const lone = portrait.filter((s) => s.split && s.rows.length === 1);
    assert.ok(lone.length > 0, 'the portrait list must split to one member per page for this test to mean anything');
    for (const s of lone) {
      assert.ok(s.rows[0].h / s.stage > 0.6, `a lone member is ${Math.round(s.rows[0].h)}px on a ${s.stage}px stage`);
    }
  });
});
