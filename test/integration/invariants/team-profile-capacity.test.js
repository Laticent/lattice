/**
 * team-profile — every composition seats the roster it advertises, and the CODA
 * reflow fires on a coda and ONLY on a coda.
 *
 * Three properties, each of which shipped broken and none of which any gate could see.
 *
 * ONE — `lead` lost a name at its own sweet spot. The ranked band tiles at
 * `--person-cols`, fixed at 4, so a hero plus FIVE reports wrapped to a second row that
 * landed 184px below the stage. Six, seven and eight people all overflowed by exactly
 * 184px — the signature of one whole row outside the box rather than a gradual squeeze —
 * and this was with nothing else on the slide: no coda, a one-line headline, the count
 * the manifest calls the sweet spot. The band now widens a column per extra person.
 *
 * TWO — a coda takes 121px out of a 16:9 stage (512px to 391px, measured), and the
 * default card is tall by construction: a circle with three lines stacked under it. Two
 * rows of six people no longer fit, so the bottom row's notes were cut mid-sentence. The
 * card turns on its side, which makes a row `max(portrait, words)` instead of their sum.
 *
 * THREE — and this is the one a reviewer should care most about, because the FIRST fix
 * for TWO was wrong in a way that looked right. The reflow was keyed on
 * `:has(> .cell-coda, > .cell-footer)`, on the reasonable-sounding premise that chrome
 * is chrome. A footer costs the stage NOTHING (512px with, 512px without), so that
 * selector fired on every footered slide — which is most of them, this component's own
 * gallery included, where it rendered a face BESIDE a name under a headline reading
 * "seats each face OVER a name, a role, and one line". The slide contradicted its own
 * caption and every gate stayed green. Assertion three is the one that would have caught
 * it, and it is why the fixture's third slide carries a footer and no coda.
 *
 * WHY A TEST AND NOT A GATE. `check-overflow-corpus` reads clip / no clip against a
 * per-deck baseline, so it can only see property ONE and only for decks in the corpus;
 * it is blind to property THREE entirely, because the footered slide never clipped — it
 * just silently stopped being the composition it claims to be. `golden-diff` watches
 * committed goldens, and the committed gallery renders clean either way. The properties
 * are geometric, so they are asserted geometrically.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors team-profile-sides-leadin.test.js. */
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

describe('team-profile — capacity holds, and the coda reflow fires only on a coda', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'team-profile-capacity.md');
  let browser;
  let slides;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const page = await browser.newPage();
    // The deck's own 16:9 canvas — the viewport the emulator measures at. Reading the
    // stage at another size lays it out differently and reports numbers nobody renders.
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('file://' + path.resolve(pdf.replace(/\.pdf$/, '.html')), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));
    slides = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('section.team-profile').forEach((s) => {
        const stage = s.querySelector(':scope > .cell-stage');
        const ul = stage?.querySelector(':scope > ul.team-roster');
        if (!ul) return;
        const stageBox = stage.getBoundingClientRect();
        const people = [...ul.querySelectorAll(':scope > li.person')];
        out.push({
          cls: s.className,
          hasCoda: !!s.querySelector(':scope > .cell-coda'),
          hasFooter: !!s.querySelector(':scope > .cell-footer'),
          people: people.length,
          // How far the lowest card's bottom clears the stage. Rounded: sub-pixel
          // jitter between runs is not what this asserts.
          overflow: Math.round(Math.max(0, ...people.map((p) => p.getBoundingClientRect().bottom - stageBox.bottom))),
          // The card's own axis — 'column' is portrait-over-words, 'row' is the reflow.
          // Read off a real person, not the rule, so a selector that fails to match
          // fails this test rather than passing on the CSS text.
          dir: getComputedStyle(people[0]).flexDirection,
          // Distinct tops = distinct rows. This is how "the ranked band is ONE row" is
          // asserted without hard-coding a pixel position that theme tuning would move.
          bandRows: new Set(people.slice(1).map((p) => Math.round(p.getBoundingClientRect().top))).size,
        });
      });
      return out;
    });
    await page.close();
  });

  after(async () => { if (browser) await browser.close(); });

  test('the fixture rendered all three shapes', () => {
    // Vacuity guard: every assertion below names a specific slide by its chrome, so a
    // fixture that stopped producing one of them must fail loudly rather than pass by
    // asserting nothing.
    assert.equal(slides.length, 3, `expected 3 team-profile slides, got ${slides.length}`);
    for (const s of slides) assert.equal(s.people, 6, 'each slide carries six people');
    assert.deepEqual(
      slides.map((s) => [s.hasCoda, s.hasFooter]),
      [[false, false], [true, false], [false, true]],
      'shapes are: lead/bare, default/coda, default/footer',
    );
  });

  test('a `lead` hero plus five reports keeps the band to ONE row', () => {
    const lead = slides.find((s) => s.cls.includes('lead'));
    assert.equal(lead.bandRows, 1,
      `the ranked band wrapped to ${lead.bandRows} rows — the second lands off the stage and takes a name with it`);
    assert.equal(lead.overflow, 0, `the lead slide clipped by ${lead.overflow}px`);
  });

  test('a coda turns the card on its side, and nothing clips', () => {
    const coda = slides.find((s) => s.hasCoda);
    assert.equal(coda.dir, 'row', 'a coda slide reflows the card to portrait-beside-words');
    assert.equal(coda.overflow, 0, `the coda slide clipped by ${coda.overflow}px`);
  });

  test('a FOOTER does not reflow the card — it costs the stage nothing', () => {
    // The assertion that catches the wrong fix. A footer is chrome, but it is chrome the
    // stage does not pay for, so a footered slide must render the composition it claims:
    // portrait OVER the words.
    const footer = slides.find((s) => s.hasFooter);
    assert.equal(footer.dir, 'column',
      'a footered slide reflowed to the row card — the footer costs the stage nothing, so the default composition must stand');
    assert.equal(footer.overflow, 0, `the footer slide clipped by ${footer.overflow}px`);
  });
});
