/**
 * THE SPLIT TRIGGER — the two conditions under which the Fit Ladder's SPLIT move fires, pinned
 * on real renders because there is no honest unit-level stand-in (HARD RULE #23).
 *
 *   1. It fires on STRUCTURE — a collection of more than one member — and reads no measurement.
 *   2. It fires at the PRESENTATION families — square · tall · strip — and never at `wide`.
 *
 * Rule 1 REVERSED on 2026-09-01 (`2026-09-01-autosplit-splits-on-structure.md`). It used to read
 * "it fires on measured FIT, never on a slide's authored count", and the fixture below used to
 * assert that an over-budget slide which FITS is left alone. It is now twelve pages, because
 * twelve items is twelve things. Rule 2 is unchanged.
 *
 * Both rules shipped on #1234 with NO test that fails when they are reverted — the adversarial
 * trio mutated each one and watched every gate stay green. That is how this file came to exist,
 * and it is why rule 1's pin is HERE rather than in a unit test: the trigger is an emulator-level
 * mechanism, so a unit test on the kernel cannot see it. (The unit block the old ADR cited as its
 * pin passed against the pre-change kernel too.)
 *
 * Two committed fixtures, both plain `checklist` decks past the component's `capacity.hard` of 9:
 *
 *   split-trigger-fits-tall.md      12 items at `portrait` — comfortably inside the box.
 *   split-trigger-overfull-wide.md  20 items at `hd`       — genuinely does not fit.
 *
 * The first now pins that FIT IS IRRELEVANT: the slide is divided even though nothing about it
 * overflows. The second is re-rendered at `square` as a control — same bytes but the `size:` line
 * — so the landscape assertion cannot pass through a regression that disabled splitting entirely.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { ROOT, runEmulator } = require('../../helpers/render');
const { splitSections } = require('../../../lib/core/split-sections');

const pagesOf = (pdf) => {
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
  return splitSections(html.slice(at)).filter((p) => p.type === 'section');
};

describe('the split trigger is STRUCTURE, and fit is not consulted', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'split-trigger-fits-tall.md');

  test('a slide that FITS its box is still divided — one item per page', { timeout: 180000 }, () => {
    // Twelve items in a 1080x1920 box they occupy about a third of. Nothing here overflows, so
    // under the measured trigger this stayed one page; the structural trigger divides it anyway,
    // because twelve items is twelve things and the reader should meet them one at a time.
    //
    // This fixture is the sharpest one available for rule 1 precisely because it does NOT
    // overflow: a fixture that clips would split under either trigger and prove nothing.
    const pages = pagesOf(runEmulator(FIXTURE, { timeout: 120000 }));
    assert.equal(pages.length, 13, `expected a cover + 12 body pages, got ${pages.length}`);
    const items = pages.reduce((n, p) => n + (p.inner.match(/<li\b/g) || []).length, 0);
    assert.equal(items, 12, 'all twelve items survive the cut');
    for (const body of pages.filter((p) => /data-split-role="body"/.test(p.openTag))) {
      assert.equal((body.inner.match(/<li\b/g) || []).length, 1, 'every body page holds exactly one item');
    }
    assert.match(pages[0].openTag, /data-split-role="cover"/, 'the run opens on a cover');
    // …and every page of the run is stamped, so the rail and the carousel can find them.
    assert.ok(pages.every((p) => /data-split-run=/.test(p.openTag)), 'every page carries the run id');
  });

  test('the cut is DETERMINISTIC — the same source renders the same page count twice', { timeout: 240000 }, () => {
    // The property the measured trigger could not offer. Two independent renders of the same
    // bytes had to agree only up to whatever Chromium measured; now the page count is a function
    // of the markup, so it is the same number every time.
    const a = pagesOf(runEmulator(FIXTURE, { timeout: 120000 })).length;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-determinism-'));
    const out = path.join(dir, 'again.pdf');
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), FIXTURE, out], {
      cwd: ROOT, encoding: 'utf8', timeout: 150000,
    });
    assert.equal(res.status, 0, `emulator failed:\n${res.stderr}`);
    const html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
    const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
    assert.equal(splitSections(html.slice(at)).filter((p) => p.type === 'section').length, a);
  });
});

describe('the split move does not run at a landscape @size', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'split-trigger-overfull-wide.md');

  test('an over-full WIDE deck rings and clips — it is never paginated', { timeout: 180000 }, () => {
    // Twenty items at `hd`. Here they genuinely do NOT fit, so this is the case where the splitter
    // COULD act and is forbidden to. The count is chosen so the SAME file overflows at `square`
    // too (the control below) — that is what makes the pair isolate the gate and nothing else.
    // Run the emulator directly rather than through the cache: the assertion is partly about what
    // it reports on stderr, which the cache does not keep.
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lat-trigger-')), 'wide.pdf');
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), FIXTURE, out], {
      cwd: ROOT, encoding: 'utf8', timeout: 150000,
    });
    assert.equal(res.status, 0, `emulator failed:\n${res.stderr}`);

    const html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
    const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
    const pages = splitSections(html.slice(at)).filter((p) => p.type === 'section');
    assert.equal(pages.length, 1, `landscape must not paginate — got ${pages.length} pages`);
    // Assert on the SECTION tags, not the document: the inlined stylesheet legitimately contains
    // `section[data-split-role="cover"]` rules whether or not any page is stamped with one.
    assert.ok(pages.every((p) => !/data-split-role=/.test(p.openTag)),
      'no split envelope may be built at wide');

    // …and the overflow is REPORTED rather than silently swallowed. This is the honest half of the
    // bargain: the engine declines to fix it, so it has to say so. Note the report is stderr only —
    // the ring is stripped before printing, so the exported artifact carries no marker (which is
    // why `lint:deck`'s `capacity-overflow` fix text must not promise one).
    const said = `${res.stdout}${res.stderr}`;
    assert.match(said, /OVERFLOW/, `an over-full landscape slide must be reported:\n${said}`);
  });

  test('the SAME file at a square @size does paginate — the gate is the only difference', { timeout: 180000 }, () => {
    // The control, and it is what makes the test above mean anything. Without it that test passes
    // for any reason that stops splitting at all — a broken seam, a manifest typo, a dead
    // `resplitDoc` — and would keep passing straight through a regression that disabled pagination
    // everywhere. Here the bytes are identical but for the `size:` line, and the outcomes are
    // opposite: 1 clipped page at `hd`, a cover plus body pages at `square`.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-trigger-'));
    const src = path.join(dir, 'tall.md');
    fs.writeFileSync(src, fs.readFileSync(FIXTURE, 'utf8').replace(/^size: hd$/m, 'size: square'));
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), src, path.join(dir, 'tall.pdf')], {
      cwd: ROOT, encoding: 'utf8', timeout: 150000,
    });
    assert.equal(res.status, 0, `emulator failed:\n${res.stderr}`);
    const html = fs.readFileSync(path.join(dir, 'tall.html'), 'utf8');
    const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
    const pages = splitSections(html.slice(at)).filter((p) => p.type === 'section');
    assert.ok(pages.length > 1, `the same over-full content must paginate at a square @size — got ${pages.length}`);
    assert.match(html, /data-split-role="cover"/, 'and the run opens with a cover');
    // Nothing is lost across the cut (§8 rule 6 at the render surface).
    const items = pages.reduce((n, p) => n + (p.inner.match(/<li\b/g) || []).length, 0);
    assert.equal(items, 20, `all twenty items must survive the split, found ${items}`);
  });
});
