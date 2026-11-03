/**
 * lib/core/office-icons.js: an editable PowerPoint or LibreOffice draws its icons as native shapes unless the export's
 * switch is off, and never as the font under `fonts: system-emoji`, which embeds no icon font.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iconsAsShapes } = require('../../../lib/core/office-icons.js');

test('only an editable office file switches; shapes unless the switch is off', () => {
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true }), true, 'no switch is the default');
  assert.equal(iconsAsShapes({ format: 'odp', editable: true, shapes: true }), true);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true, shapes: false }), false);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: false, shapes: true }), false, 'a picture-per-slide file draws the page as it is');
  assert.equal(iconsAsShapes({ format: 'odp' }), false, 'not editable unless said');
  for (const format of ['pdf', 'html', 'png', 'imageset']) assert.equal(iconsAsShapes({ format, editable: true }), false, format);
});

test('system emoji embeds no icon font, so the switch off still gives shapes', () => {
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true, shapes: false, emojiTier: 'system' }), true);
});
