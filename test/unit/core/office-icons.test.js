/**
 * lib/core/office-icons.js: an editable PowerPoint or LibreOffice draws its icons as native shapes unless the deck or the
 * flag says `font`, and never as the font under `fonts: system-emoji`, which embeds no icon font.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseOfficeIcons, resolveOfficeIcons, iconsAsShapes, DEFAULT_OFFICE_ICONS } = require('../../../lib/core/office-icons.js');

test('shapes is the default, and a word that is not a mode is reported and falls back to it', () => {
  assert.equal(DEFAULT_OFFICE_ICONS, 'shapes');
  assert.deepEqual(parseOfficeIcons(''), { mode: 'shapes', unknown: null });
  assert.deepEqual(parseOfficeIcons(' Font '), { mode: 'font', unknown: null });
  assert.deepEqual(parseOfficeIcons('glyphs'), { mode: 'shapes', unknown: 'glyphs' });
});

test('a written flag wins over the deck line; an empty one does not', () => {
  assert.equal(resolveOfficeIcons('font', undefined), 'font');
  assert.equal(resolveOfficeIcons('font', 'shapes'), 'shapes');
  assert.equal(resolveOfficeIcons('shapes', 'font'), 'font');
  assert.equal(resolveOfficeIcons('font', '  '), 'font');
});

test('only an editable office file switches, and system emoji always means shapes there', () => {
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true, mode: 'shapes' }), true);
  assert.equal(iconsAsShapes({ format: 'odp', editable: true, mode: 'shapes' }), true);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true, mode: 'font' }), false);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true, mode: 'font', emojiTier: 'system' }), true);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: false, mode: 'shapes' }), false, 'a picture-per-slide file draws the page as it is');
  assert.equal(iconsAsShapes({ format: 'odp', mode: 'shapes' }), false, 'not editable unless said');
  for (const format of ['pdf', 'html', 'png', 'imageset']) assert.equal(iconsAsShapes({ format, editable: true, mode: 'shapes' }), false, format);
  assert.equal(iconsAsShapes({ format: 'pptx', editable: true, mode: undefined }), true, 'no mode is the default');
});
