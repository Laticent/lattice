/**
 * lib/core/office-icons.js: an editable PowerPoint or LibreOffice always draws its icons as native shapes; nothing else
 * switches.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iconsAsShapes } = require('../../../lib/core/office-icons.js');

test('only an editable office file draws its icons as shapes', () => {
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true }), true);
  assert.equal(iconsAsShapes({ format: 'odp', editable: true }), true);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: false }), false, 'a picture-per-slide file draws the page as it is');
  assert.equal(iconsAsShapes({ format: 'odp' }), false, 'not editable unless said');
  for (const format of ['pdf', 'html', 'png', 'imageset']) assert.equal(iconsAsShapes({ format, editable: true }), false, format);
});
