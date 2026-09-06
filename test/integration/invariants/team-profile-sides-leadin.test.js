/**
 * `sides` lead-in rows — two paragraphs must stack, and unused rows must cost nothing.
 *
 * This suite exists because ONE hunk produced both halves of the same defect, four days
 * apart, and no gate in the tree could see either.
 *
 * FIRST HALF — collision. The stage places its two labels and two rosters EXPLICITLY,
 * because an earlier `grid-auto-flow: column` renumbered every cell when an ordinary
 * lead-in sentence appeared between the `##` and the first `###`. Pinning fixed the
 * renumbering and introduced a collision: every `> p` was pinned to ONE named area, and
 * two grid items in one area do not stack — they paint on top of each other. A slide with
 * two lead-in sentences rendered them in byte-identical rects, both unreadable.
 *
 * SECOND HALF — the repair's own regression, which is the more interesting one. The fix
 * gave the lead-in six spare rows to auto-place into. Declared `auto`, those rows are
 * STRETCHABLE: `align-content: stretch` hands a share of the stage's free space to every
 * track whose max sizing function is `auto`, so six EMPTY spares became six equal slices
 * of dead space. The wide grid hid it (its last row is `minmax(0, 1fr)`, which eats the
 * free space first); the tall/strip grid has no flexible track and did not — measured at
 * 118.9px per spare, pushing the first label 713.6px down a slide carrying no lead-in at
 * all. So the spares past the first are `min-content`, which is never stretched.
 *
 * WHY A TEST AND NOT A GATE. `check:family-tiers`' overflow oracle records clip / no clip,
 * and the clip status never changed — the oracle reported "as recorded" while the layout
 * moved 700px. `golden-diff` watches committed goldens, and the committed deck is WIDE with
 * zero lead-ins, so it renders the one shape the change cannot affect. Both stayed green.
 * The property that actually broke is geometric and per-size, so it is asserted here.
 *
 * The fixture is `portrait` deliberately: `tall` is the family with no flexible track, so
 * it is the one where an unused spare has somewhere to steal from. A wide fixture would
 * pass this suite while the bug shipped.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { ROOT, runEmulator } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors footer-band.test.js. */
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

describe('team-profile sides — lead-in paragraphs stack, and unused rows cost nothing', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'team-profile-sides-leadin.md');
  let browser;
  let slides;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const page = await browser.newPage();
    // The deck's own `portrait` canvas — the viewport the emulator measures at. Reading the
    // stage at another size lays it out differently and reports numbers nobody renders.
    await page.setViewport({ width: 1080, height: 1350 });
    await page.goto('file://' + path.resolve(pdf.replace(/\.pdf$/, '.html')), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));
    slides = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('section.team-profile.sides').forEach((s) => {
        const stage = s.querySelector(':scope > .cell-stage');
        if (!stage) return;
        const paras = [...stage.children].filter((e) => e.tagName === 'P');
        out.push({
          family: s.getAttribute('data-family'),
          paraCount: paras.length,
          // Rounded: sub-pixel jitter between runs is not what this asserts.
          paraTops: paras.map((p) => Math.round(p.getBoundingClientRect().top)),
          // The six lead-in tracks, in order. Index 0 is the one deliberately left
          // stretchable (it is the single lead-in row the pre-fix grid already had, and
          // keeping it is what makes a 0- or 1-paragraph slide measure as it did before).
          spares: getComputedStyle(stage).gridTemplateRows.split(/\s+/).slice(0, 6).map((v) => Math.round(parseFloat(v))),
          rosters: stage.querySelectorAll(':scope > ul.team-roster').length,
          // Paragraph tops are viewport-relative; the stage top makes them comparable
          // ACROSS slides, which is what the "a second lead-in does not move the first"
          // assertion needs (different slides sit at different viewport offsets).
          stageTop: Math.round(stage.getBoundingClientRect().top),
        });
      });
      return out;
    });
    await page.close();
  });

  after(async () => { if (browser) await browser.close(); });

  test('the fixture actually rendered all three sides slides in the tall family', () => {
    assert.equal(slides.length, 3, `expected 3 sides slides, got ${slides.length}`);
    // Vacuity guard: every assertion below is about the tall grid specifically. If the
    // stamp ever stops resolving, the suite must fail loudly rather than pass on a
    // family whose flexible last row hides the defect it exists to catch.
    for (const s of slides) assert.equal(s.family, 'tall', `expected data-family="tall", got ${s.family}`);
    for (const s of slides) assert.equal(s.rosters, 2, 'each sides slide keeps both rosters');
    assert.deepEqual(slides.map((s) => s.paraCount), [0, 1, 2], 'fixture shapes are 0, 1 and 2 lead-ins');
  });

  test('no two lead-in paragraphs share a top', () => {
    for (const s of slides) {
      const tops = s.paraTops;
      assert.equal(new Set(tops).size, tops.length,
        `two lead-ins painted at the same top (${JSON.stringify(tops)}) — they are in one grid area and do not stack`);
    }
  });

  test('lead-ins run down the slide in document order', () => {
    const two = slides.find((s) => s.paraCount === 2);
    assert.ok(two.paraTops[1] > two.paraTops[0],
      `the second lead-in must sit below the first, got ${JSON.stringify(two.paraTops)}`);
  });

  test('an unused spare row measures zero, so it cannot steal the stage', () => {
    for (const s of slides) {
      // Spare 0 is stretchable by design; spares 1..5 are `min-content` and must be
      // exactly 0 whenever no paragraph occupies them. This is the assertion that fails
      // if they are ever declared `auto` again.
      const unused = s.spares.slice(Math.max(1, s.paraCount));
      for (const [i, px] of unused.entries()) {
        assert.equal(px, 0,
          `spare row ${i + Math.max(1, s.paraCount)} measured ${px}px on a slide with ${s.paraCount} lead-in(s) — ` +
          'an unused lead-in track must not take a share of the stage');
      }
    }
  });

  // NOT "a no-lead-in slide spends 0 on all six spares" — that assertion was written
  // first and is wrong on purpose. Spare 0 is deliberately left stretchable so a slide
  // with zero or one lead-in measures exactly as it did before the spare rows existed
  // (verified at all four @sizes against a build of the parent commit). Asserting 0
  // there would pin the opposite of the intended design; test 4 above already covers
  // the five rows that must cost nothing.
  //
  // What no other assertion covers is the collision fix's real contract: adding a
  // SECOND lead-in must not move the FIRST. The pre-fix grid satisfied this trivially
  // and uselessly — both paragraphs sat at the same top because they were the same
  // cell. Pairing it with the distinct-tops assertion is what makes the pair meaningful.
  test('a second lead-in does not move the first', () => {
    const one = slides.find((s) => s.paraCount === 1);
    const two = slides.find((s) => s.paraCount === 2);
    const stageRelative = (s) => s.paraTops[0] - s.stageTop;
    assert.equal(stageRelative(two), stageRelative(one),
      `the first lead-in sits at ${stageRelative(one)}px with one paragraph and ` +
      `${stageRelative(two)}px with two — adding a paragraph must not move the one above it`);
  });
});
