// A split cover's intro (lib/core/split-envelope.js `introOf`): a layout's `{n}` template reads only as a count of
// several. "1 parts" printed on the cover of a code slide whose lines fit one page (one-reading-size-per-venue.md 7 at
// portrait, 2026-11-17); with one part the cover carries its title alone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { introOf } = require('../../../lib/core/split-envelope');

test('a count template reads from two parts up', () => {
  assert.equal(introOf({ intro: '{n} parts' }, 3), '3 parts');
  assert.equal(introOf({ intro: '{n} parts' }, 2), '2 parts');
});

test('one part: no count, so the cover carries its title alone', () => {
  assert.equal(introOf({ intro: '{n} parts' }, 1), null);
});

test('a template with no count is the layout\'s own words, whatever the count', () => {
  assert.equal(introOf({ intro: 'Both implementations' }, 1), 'Both implementations');
});
