/**
 * The exported player must hand a text extractor ONE copy of the deck, not two.
 *
 * WHY THIS EXISTS. The player is the only shipped artifact that carries the deck's words
 * TWICE at once: the slide stack in `#lp-stage` and the prose projection in
 * `#lp-doc > #lp-article`. Both are always in the document — the view switch is a CSS
 * rule, not a mount. That is deliberate and worth keeping (it is what makes the file work
 * with scripting off), but it collides with how every reader-mode text extractor decides
 * what is on the page.
 *
 * Mozilla's Readability — which Firefox's Reader View and its "shake to summarize" run on,
 * and which Safari and Chrome's reading modes approximate — checks visibility by reading
 * the `hidden` attribute, the INLINE `style` attribute and `aria-hidden`. It never
 * consults computed style. So a pane hidden only by a stylesheet rule is invisible to the
 * reader and fully visible to the extractor, and the summarizer received every sentence
 * twice: measured 2255 extracted words for a 1080-word deck. That is not merely untidy —
 * Firefox caps summarization at 3000 words on-device, so the duplication halves the deck
 * that fits under the cap, and it feeds a model the same paragraph twice.
 *
 * WHAT IS PINNED. `setView` mirrors the CSS view-hide onto the inactive pane's `hidden`
 * attribute. Two properties make that safe, and BOTH are asserted below, because either
 * one breaking is a real defect rather than a cosmetic one:
 *
 *   1. The attribute goes ONLY where the CSS already hides the pane. If it ever lands on
 *      a pane a reader can see, we are hiding real content from assistive technology and
 *      from search — the cloaking failure mode. Asserted against COMPUTED display, not
 *      against our own intent.
 *   2. Exactly one pane is extractable at a time, so the deck is never double-fed.
 *
 * This gate deliberately does NOT depend on Readability itself. Adding the library to
 * pin someone else's heuristic would buy a test that fails when they tune a threshold;
 * the mechanism above is ours, and it is what actually has to hold. The end-to-end claim
 * — that extraction drops to a single copy in a real browser — was measured directly
 * against `@mozilla/readability` when this landed and is recorded in the re-bless note in
 * `test/unit/export/html-player.test.js`.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const puppeteer = require('puppeteer');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');

// A small deck, not the 116-slide gallery: this gate is about a DOM attribute on two
// container elements, and it holds identically at any slide count. The prose is real
// sentences because the projection skips empty slides, and a deck of bare headings would
// let a broken projection pass by producing nothing to compare.
const DECK_SOURCE = `---
theme: indaco
---

# The invisible half

Most of what makes a thing good is hidden from the person who buys it.

---

## Handle, don't judge

- Pick each one up
  - Flex the sole, look inside, and say nothing to anyone for a full minute.
- Mark the three you would spend your own money on
  - Write down why before you hear anyone else's reason.

---

## What a welt actually does

A welt is a strip of leather joining the upper to the outsole. It turns the sole into a
part a cobbler can swap without touching the rest of the shoe, which is why repair pays.

---

## Two things to start on Monday

- Separate the parts that wear from the parts that last
- Make the join a standard, not a weld
`;

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

// Which pane each view SHOWS. The other one is the one that must carry `hidden`.
const VIEWS = [
  { view: 'present', shows: '#lp-stage', hides: '#lp-doc' },
  { view: 'read-slides', shows: '#lp-stage', hides: '#lp-doc' },
  { view: 'read-article', shows: '#lp-doc', hides: '#lp-stage' },
];

describe('exported player — one extractable copy of the deck per view', () => {
  let browser;
  let dir;
  let playerPath;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-extract-'));
    const src = path.join(dir, 'deck.md');
    fs.writeFileSync(src, DECK_SOURCE);
    playerPath = path.join(dir, 'player.html');
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), src, playerPath, '--player', '-q'], {
      cwd: ROOT, encoding: 'utf8', timeout: 900000,
    });
    assert.equal(res.status, 0, `player render failed:\n${res.stderr}`);
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--allow-file-access-from-files'],
    });
  });
  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  // The SHIPPED markup carries no `hidden` on either pane. That is the no-JS floor: with
  // scripting off nothing runs `setView`, and playerCss lays every slide out in a column.
  // A `hidden` baked into the file would blank that fallback.
  test('the shipped file marks neither pane hidden (the no-JS floor)', { timeout: 900000 }, () => {
    const html = fs.readFileSync(playerPath, 'utf8');
    for (const id of ['lp-stage', 'lp-doc']) {
      const tag = html.match(new RegExp(`<div id="${id}"[^>]*>`));
      assert.ok(tag, `expected a <div id="${id}"> in the shipped player`);
      assert.doesNotMatch(tag[0], /\bhidden\b/, `${id} must not ship pre-hidden — it would blank the no-JS floor`);
    }
  });

  for (const { view, shows, hides } of VIEWS) {
    test(`${view}: only the visible pane is extractable`, { timeout: 900000 }, async () => {
      const page = await browser.newPage();
      await page.goto(`file://${playerPath}`, { waitUntil: 'load' });
      // Drive the REAL control rather than calling setView — this asserts what a reader
      // who clicks the tab actually gets.
      await page.evaluate((v) => {
        const btn = document.querySelector(`#lp-bar [data-lp-btn="${v}"]`);
        if (!btn) throw new Error(`no view control for ${v}`);
        btn.click();
      }, view);

      const state = await page.evaluate(
        ({ shows, hides }) => {
          const read = (sel) => {
            const el = document.querySelector(sel);
            return el && { hidden: el.hasAttribute('hidden'), display: getComputedStyle(el).display };
          };
          return { shown: read(shows), hidden: read(hides) };
        },
        { shows, hides },
      );
      await page.close();

      assert.ok(state.shown && state.hidden, 'both panes must exist in the player');

      // 1. The pane the reader SEES is never hidden from an extractor. This is the
      //    cloaking guard: if these ever disagree we are serving text nobody can read.
      assert.notEqual(state.shown.display, 'none', `${shows} should be visible in ${view}`);
      assert.equal(state.shown.hidden, false, `${shows} is visible in ${view} — it must not carry hidden`);

      // 2. The pane the reader CANNOT see is hidden from the extractor too, so the deck
      //    is fed once. The computed-display assertion is what makes this a no-op
      //    visually rather than a change we merely believe is one.
      assert.equal(state.hidden.display, 'none', `${hides} should be CSS-hidden in ${view}`);
      assert.equal(state.hidden.hidden, true, `${hides} is hidden in ${view} — it must carry hidden so it is not extracted`);
    });
  }
});
