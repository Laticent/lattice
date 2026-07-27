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
