/**
 * THE PAGE NUMBER IS ONE MARK — a real-surface invariant (#2206).
 *
 * Renders one deck carrying EVERY frame kind through the real emulator and asks a
 * browser, of each paginated slide: how many page-number marks actually paint, and
 * which node draws them?
 *
 * Why this tier and not a unit test (HARD RULE #23). The defect being locked out is a
 * CASCADE fact, not a markup fact. Before this change the mark a slide got was decided
 * by its frame's `kind`: a real `<span class="lat-pagination">` in the footer Cell on
 * the two chrome-hosting frames, the `section::after` PSEUDO on the other nine. The
 * markup was correct in both cases; what differed was which rule won. The two ways
 * this can regress are both invisible to jsdom:
 *
 *   · the retirement rule loses on specificity → BOTH marks paint, overprinted in the
 *     same corner (this happened on the way in — the first draft was (0,1,2) against
 *     the engine scaffold's (0,1,3), and seven slides of bloom-engineering-journey
 *     drew two numerals on top of each other);
 *   · the Tile stops reaching a frame → NEITHER paints, and the page number is simply
 *     gone from a deck that asked for it.
 *
 * Only a browser laying out the real lattice.css can tell either from correct output,
 * which is the same reason chrome-suppression.test.js sits in this tier.
 *
 * Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

/** Best-effort Chromium path — mirrors chrome-suppression.test.js. */
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

// ALL ELEVEN FRAME KINDS, one slide each. The two chrome-hosting frames (`minimal`,
// `standard`) are reached through an ordinary `content` slide — that is the frame a plain
// Form slide takes — and the nine sovereign frames through the component that docks each
// one: title, divider, closing, premise, split-panel, split-compare, image, scene,
// compare-code.
//
// THE FIRST CUT CARRIED FIVE OF THE NINE, and the four it left out are why this comment
// says so. Its docblock claimed the full set; `image`, `scene`, `compare-code` and
// `split-compare` were absent. The maker-checker pass then found a real regression on a
// PROSE-FREE `image` slide — the page number's own text defeated `wrapImageText`'s "is
// there any prose?" guard, so a slide that is meant to stay unwrapped got wrapped, the
// span was folded into `.image-text` as static body copy across the photo, and the pseudo
// came back beside it. This file's predicate WOULD have caught it: `marksOn` reads the
// pseudo off the section and counts shown spans anywhere beneath it, so that slide reports
// `pseudo: true, elements: 1` and fails. The suite was not vacuous; it was under-populated,
// and the shape it was missing was the shape that broke. The bare `image` slide below has
// NO prose deliberately — that is the case, not an oversight.
//
// `silent` is deliberately absent: it SUPPRESSES the number, and the bookends carry it on
// every deck we ship, so a silent slide would assert the opposite invariant.
const DECK = `---
marp: true
theme: indaco
paginate: true
footer: "Footer Text"
---

<!-- _class: title -->
# Title frame
\`ONE MARK\`

---

<!-- _class: content -->
## Chrome-hosting frame
A plain Form slide takes the root frame, which holds the number in its footer Cell.

---

<!-- _class: divider -->
## Divider frame

---

<!-- _class: premise -->
## Premise frame

- The question this slide exists to put
- A second line so the stage is not empty

---

<!-- _class: split-panel -->
## Split-panel frame

- Left panel
  - The claim on the left
- Right panel
  - The evidence on the right

---

<!-- _class: closing -->
# Closing frame
\`END\`

---

<!-- _class: split-compare -->

\`Decision required\`

## Split-compare frame

One sentence of context.

- Alternative option
  - First fact about the alternative
- Preferred option
  - First fact about the preferred path

---

<!-- _class: image -->

![bg](../../test/integration/baseline-decks/assets/sample-photo-wide.jpg)

---

<!-- _class: scene -->

## Scene frame

<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="75" r="40" fill="var(--accent)"/></svg>

What the exhibit shows, in one line.

---

<!-- _class: compare-code -->

## Compare-code frame

\`Before\`

\`\`\`js
const before = 1;
\`\`\`

\`After\`

\`\`\`js
const after = 2;
\`\`\`
`;

/**
 * For one section: does the PSEUDO paint, and how many `.lat-pagination` elements are
 * actually shown? "Shown" walks the chain from the span UP TO AND INCLUDING the section
 * — the counting rule engineering/jank.md §census states, and both ends of it cost a
 * measurement there. A player frame outside the slide must not decide whether a slide's
 * own mark is shown; the span's OWN `display: none` must.
 */
async function marksOn(page, n) {
  return page.evaluate((n) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
    if (!sec) return null;
    const af = getComputedStyle(sec, '::after');
    // "PAINTS A NUMERAL", not "exists". The retirement rule EMPTIES the pagination pseudo
    // (`content: ''`) instead of deleting its box, because one treatment co-opts that box
    // for a decorative mask (`mark-asterisks`, base.treatments.css) and `content: none`
    // took the mask with it. So a retired pseudo computes `content: ""` and a live one
    // computes `"7"`. Testing only for `none` would call every retired pseudo a painting
    // one — which is what this predicate did before the retirement changed, and it is a
    // deliberate weakening: this file no longer proves the box is gone, only that no
    // second numeral is drawn. The box carries no background or border of its own, so
    // there is nothing else for it to draw.
    const drawsText = (c) => Boolean(c) && c !== 'none' && c !== 'normal' && c !== '""' && c !== "''";
    const pseudo = drawsText(af.content) && af.display !== 'none';
    const shown = [...sec.querySelectorAll('.lat-pagination')].filter((el) => {
      for (let node = el; node; node = node.parentElement) {
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (node === sec) break;
      }
      return true;
    });
    const r = shown[0]?.getBoundingClientRect();
    const secR = sec.getBoundingClientRect();
    return {
      cls: sec.className,
      pseudo,
      elements: shown.length,
      text: shown[0]?.textContent ?? null,
      // The berth, as insets from the section's own box — comparable across slides.
      right: r ? Math.round((secR.right - r.right) * 10) / 10 : null,
      bottom: r ? Math.round((secR.bottom - r.bottom) * 10) / 10 : null,
    };
  }, n);
}

describe('the page number is ONE mark on every frame kind (real render)', () => {
  let browser;
  let page;
  let rows;
  before(async () => {
    const html = renderHtml(DECK, { key: 'pagination-one-mark' });
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
    rows = [];
    for (let n = 1; n <= 10; n++) rows.push(await marksOn(page, n));
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  test('every slide of the deck was found', () => {
    assert.equal(rows.filter(Boolean).length, 10, 'expected ten laid-out sections');
  });

  test('exactly one page-number element paints on every slide', () => {
    for (const r of rows) assert.equal(r.elements, 1, `${r.cls}: expected one .lat-pagination, got ${r.elements}`);
  });

  test('the pagination PSEUDO is retired everywhere the element exists', () => {
    for (const r of rows) assert.equal(r.pseudo, false, `${r.cls}: the ::after pseudo still paints beside the element`);
  });

  test('each slide shows its own number', () => {
    assert.deepEqual(rows.map((r) => r.text), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  test('the mark takes the SAME berth on every frame kind', () => {
    // This is the half a markup test cannot reach, and the reason the unification is a
    // change of NODE and not of picture: a sovereign frame's section-level span and a
    // chrome-hosting frame's footer-Cell span have different box models and different
    // parents, and they must still land in the same corner at the same insets. The
    // element inherits the `--pagination-inset` hook the pseudo had
    // (lib/forms/cell/pagination-right), which is what makes that true by construction.
    const rights = [...new Set(rows.map((r) => r.right))];
    const bottoms = [...new Set(rows.map((r) => r.bottom))];
    assert.equal(rights.length, 1, `right insets differ across frames: ${JSON.stringify(rows.map((r) => [r.cls, r.right]))}`);
    assert.equal(bottoms.length, 1, `bottom insets differ across frames: ${JSON.stringify(rows.map((r) => [r.cls, r.bottom]))}`);
  });
});
