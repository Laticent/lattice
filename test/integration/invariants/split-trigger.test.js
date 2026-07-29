/**
 * THE SPLIT TRIGGER — the two conditions under which the Fit Ladder's SPLIT move fires, pinned
 * on real renders because there is no honest unit-level stand-in (HARD RULE #23).
 *
 *   1. It fires on measured FIT, never on a slide's authored count against `capacity.hard`.
 *   2. It fires at the PRESENTATION families — square · tall · strip — and never at `wide`.
 *
 * Both are owner rulings (2026-07-29-autosplit-is-not-a-toggle.md §"Two corrections"), and both
 * shipped on #1234 with NO test that fails when they are reverted. That is how this file came to
 * exist: the adversarial trio mutated each one and watched every gate stay green.
 *
 *   · Remove `&& familyFor(...) !== 'wide'` from `AUTOSPLIT_APPLIES` → `npm test` 4490/4490 and
 *     `test:integration:pr` 383/383 both pass. Every landscape deck silently re-paginates.
 *   · The unit block in test/unit/core/auto-split.test.js that the ADR cited as "the unit pin"
 *     for rule 1 passes against the PRE-change kernel too — it cannot fail, because the count
 *     trigger never lived in `resplitDoc`. It lived in `autoSplitDeck` plus the emulator's
 *     `DEFERRED_BY_COUNT` wiring, and that wiring fed the measured loop a NON-empty list. Handing
 *     `resplitDoc` an empty verdict was always a no-op.
 *
 * So the pin has to be here, at the emulator, which is where both mechanisms actually live. Two
 * committed fixtures, so the decision note's before/after is reproducible rather than a number in
 * prose — both are plain `checklist` decks well past the component's `capacity.hard` of 9:
 *
 *   split-trigger-fits-tall.md      12 items at `portrait` — over budget, and it FITS.
 *   split-trigger-overfull-wide.md  20 items at `hd`       — over budget, and it does NOT fit.
 *
 * The second one is re-rendered at `square` as a control: same bytes but the `size:` line, and it
 * paginates there. Without that pair the landscape assertion would keep passing through a
 * regression that disabled splitting everywhere.
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

describe('the split trigger is FIT, not the authored count', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'split-trigger-fits-tall.md');

  test('a slide past `capacity.hard` that FITS its box is left exactly as authored', { timeout: 180000 }, () => {
    // Twelve items against `hard: 9` — a third over budget — in a 1080x1920 box they occupy about
    // a third of. Under the deleted count trigger this came out as a cover plus two body pages,
    // two of them mostly white; the author stayed inside the geometry and got three slides they
    // did not write. The whole content of rule 1 is that this is now ONE page.
    const pages = pagesOf(runEmulator(FIXTURE, { timeout: 120000 }));
    assert.equal(pages.length, 1, `an over-budget slide that fits must not be divided — got ${pages.length} pages`);
    assert.equal((pages[0].inner.match(/<li\b/g) || []).length, 12, 'and it keeps all twelve items');
    // No envelope was built: no cover, no run, no continuation rail.
    assert.doesNotMatch(pages[0].openTag, /data-split-(?:role|run)=/, 'no split envelope on an unsplit slide');
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
