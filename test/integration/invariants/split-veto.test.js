/**
 * SPLIT VETO — the measured pass's "can a split actually fix this?" gate, on a real render.
 *
 * `measureOverflow` (lattice-emulator.js) refuses to hand a slide to the splitter when the
 * NON-collection content already fills the box: splitting a slide whose height comes from a tall
 * figure or paragraph just copies that block onto every piece and never fits, and it balloons the
 * deck pass after pass. Right rule, but it was measured two ways that were both wrong on a real
 * portrait render, and each failure mode is SILENT — the slide clips, the author is told only on
 * stderr, and the fix looks like "write less":
 *
 *   1. the collection was measured with `offsetHeight`, which in a bounded flex stage reports the
 *      SQUEEZED box: a checklist's `<ul>` inside `section.checklist > .cell-stage { display:flex }`
 *      measured 0 (scrollHeight 312), so the gate concluded the list contributed nothing to the
 *      overflow — the exact opposite of the truth;
 *   2. the headroom counted the framing LEDE and the trailing NOTE as immovable, though the
 *      envelope hoists both OFF the body pages (§0a) — so the room a body page will really have
 *      was under-reported by their combined height.
 *
 * This drives the real emulator, because the gate lives inside a `page.evaluate` measuring real
 * layout — there is no honest unit-level stand-in (HARD RULE #23). The fixture is the minimal
 * shape that reproduced it: a checklist over its `hard` bound, with a long lede AND a long
 * below-note, in a portrait box.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { ROOT, runEmulator } = require('../../helpers/render');
const { splitSections } = require('../../../lib/core/split-sections');

describe('split veto — a hoistable lede + note must not veto the split', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'split-veto-hoist.md');

  test('the slide splits into a real envelope instead of clipping', { timeout: 180000 }, () => {
    const pdf = runEmulator(FIXTURE, { timeout: 120000 });
    const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
    const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
    const sections = splitSections(html.slice(at)).filter((p) => p.type === 'section');

    assert.ok(sections.length >= 3, `expected the one slide to split, got ${sections.length} section(s)`);
    const roles = sections.map((p) => (p.openTag.match(/\sdata-split-role="([^"]*)"/) || [])[1] || null);
    assert.equal(roles[0], 'cover', `the run must open with a cover — roles were ${JSON.stringify(roles)}`);
    assert.ok(roles.slice(1).every((r) => r === 'body'), `the rest are body pages — ${JSON.stringify(roles)}`);

    // The two hoists the veto has to account for, landing where §0a says: the lede on the COVER,
    // the note on the LAST body page only.
    assert.match(sections[0].inner, /split-feat-lede/, 'the lede did not reach the cover');
    const noted = sections.filter((p) => /lat-split-note/.test(p.inner));
    assert.equal(noted.length, 1, 'the below-note must ride exactly one page');
    assert.equal(noted[0].inner, sections.at(-1).inner, 'and that page is the LAST body page');

    // Every checklist item survives the cut (§8 rule 6, at the render surface).
    const items = sections.reduce((n, p) => n + (p.inner.match(/<li\b/g) || []).length, 0);
    assert.equal(items, 8, `all eight items must survive the split, found ${items}`);
  });
});

/**
 * §8 rule 8's legibility floor and the overflow probe answer two ORTHOGONAL questions, and a
 * slide can fail both. When the legibility branch was written it `return`ed early on `under`,
 * so a single small viewBox figure anywhere on a slide took that slide off the overflow list
 * entirely: no ring, no `⚠ OVERFLOW` line, and — worst — autosplit never saw it, so a
 * perfectly splittable checklist shipped clipped with content lost off-cell. Exactly the
 * outcome overflow-probe.js's own header forbids. Both signals must be reported.
 */
describe('type floor + overflow — two axes, never one instead of the other', () => {
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'split-illegible-and-clipping.md');

  test('a slide that is BOTH illegible and over-full still splits, and says both', { timeout: 180000 }, () => {
    // Run the emulator directly rather than through the cached helper: the assertion is about
    // what it REPORTS on stderr, which the cache does not keep.
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lat-split-')), 'both.pdf');
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), FIXTURE, out], {
      cwd: ROOT, encoding: 'utf8', timeout: 150000,
    });
    assert.equal(res.status, 0, `emulator failed:\n${res.stderr}`);
    // The legibility axis is still REPORTED — it rides along, it does not replace the split.
    assert.match(res.stderr, /TYPE FLOOR/, `stderr did not carry the type-floor warning:\n${res.stderr}`);
    const html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
    const at = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
    const sections = splitSections(html.slice(at)).filter((p) => p.type === 'section');
    assert.ok(sections.length >= 3,
      `the figure must not veto the split — got ${sections.length} section(s)`);
    const roles = sections.map((p) => (p.openTag.match(/\sdata-split-role="([^"]*)"/) || [])[1] || null);
    assert.equal(roles[0], 'cover');
    // Every item survives the cut, on both axes at once (§8 rule 6 at the render surface).
    const items = sections.reduce((n, p) => n + (p.inner.match(/<li\b/g) || []).length, 0);
    assert.equal(items, 12, `all twelve items must survive, found ${items}`);
  });
});
