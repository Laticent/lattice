const test = require('node:test');
const assert = require('node:assert/strict');
const { exportCanvas, RASTER_FORMATS, FOUR_K_FACTOR } = require('../../../lib/core/export-canvas.js');

test('a 4K deck exports PDF, PPTX and ODP at HD unless the author asks otherwise', () => {
  for (const format of RASTER_FORMATS) {
    assert.deepEqual(exportCanvas({ deckSize: '4k', format }), { size: 'hd', loweredFrom4k: true });
    assert.deepEqual(exportCanvas({ deckSize: '4K', format }), { size: 'hd', loweredFrom4k: true });
  }
  assert.deepEqual(exportCanvas({ deckSize: '4k', requested: '4k', format: 'pdf' }), { size: '4k', loweredFrom4k: false });
  assert.deepEqual(exportCanvas({ deckSize: '4k', requested: 'square', format: 'pptx' }), { size: 'square', loweredFrom4k: false });
});

test('other decks and other formats keep their own canvas', () => {
  assert.deepEqual(exportCanvas({ deckSize: 'hd', format: 'pdf' }), { size: null, loweredFrom4k: false });
  assert.deepEqual(exportCanvas({ format: 'pdf' }), { size: null, loweredFrom4k: false });
  assert.deepEqual(exportCanvas({ deckSize: 'square', format: 'pptx' }), { size: null, loweredFrom4k: false });
  for (const format of ['html', 'imageset', 'png']) assert.equal(exportCanvas({ deckSize: '4k', format }).size, null);
  assert.ok(FOUR_K_FACTOR.pdf > 1 && FOUR_K_FACTOR.pptx > 1 && FOUR_K_FACTOR.odp > 1);
});
