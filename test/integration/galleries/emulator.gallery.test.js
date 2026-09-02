/**
 * Integration: rebuild gallery.md through the lattice emulator and
 * assert the produced PDF matches the expected page count.
 *
 * Slow (~15s on cache miss; instant on hit). Lives under
 * test/integration so it doesn't run on the unit-test inner loop.
 *
 * The expected page count is inlined (was a shared fixture; that
 * fixture was deleted in Phase 3 of the docs refactor — per-component
 * decks self-derive their counts via expectedGallerySlideCount(), and
 * each surviving top-level deck owns its expected count inline).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runEmulator } = require('../../helpers/render');
const { pageCount }   = require('../../helpers/pdf');

const GALLERY = path.join(__dirname, '..', 'baseline-decks', 'gallery.md');
// 116 since the `closing numbered` demo was deleted with the variant itself —
// `numbered` is a divider modifier now, a bookend is not a section. `closing` is
// still covered twice over (plain at the top of the deck, `accent` near the end),
// so the every-component floor holds. Was 117 when cycle (progression) and
// policy-recommendation (legal) graduated in; 115 for the full-coverage
// extension, 87 before that.
const EXPECTED_PAGES = 116;

describe('emulator.gallery', () => {
  test('emulator: gallery.md builds and produces expected page count', { timeout: 180000 }, () => {
    const pdf = runEmulator(GALLERY);
    assert.equal(pageCount(pdf), EXPECTED_PAGES, 'gallery.md page count drifted');
  });
});
