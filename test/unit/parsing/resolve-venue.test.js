/**
 * Unit: lib/core/resolve-venue.js — the `venue:` register (engineering/typography.md §7
 * "Venue"). Pins the three copies of each venue's rung against one another: the resolver's
 * VENUE_SCALE, the `venue-*` rules in base.modifiers.css, and lint-core's FONT_SCALE_KEYS
 * (which the capacity budgets are read through). Also pins that the venue rules come BEFORE
 * `scale-*` in the CSS, which is what lets a slide's own `scale-*` win.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  VENUE_NAMES, VENUE_TOKENS, VENUE_SCALE, venueClass, venueClassFromSource, isKnownVenue, isVenueToken,
} = require('../../../lib/core/resolve-venue');
const lint = require('../../../lib/authoring/lint-core');
const { SCALE_STEPS } = require('../../../lib/core/scale-fit');

const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');

test('four venues, laptop first and classless', () => {
  assert.deepEqual([...VENUE_NAMES], ['laptop', 'huddle', 'conference', 'hall']);
  assert.equal(venueClass('laptop'), '');
  assert.deepEqual([...VENUE_TOKENS], ['venue-huddle', 'venue-conference', 'venue-hall']);
});

test('one venue per rung of the scale ladder', () => {
  assert.deepEqual(Object.values(VENUE_SCALE).sort((a, b) => b - a), [...SCALE_STEPS]);
});

test('the CSS gives each venue class the rung VENUE_SCALE names', () => {
  for (const name of VENUE_NAMES.filter((n) => n !== 'laptop')) {
    const m = css.match(new RegExp(`section\\.venue-${name}\\s*\\{[^}]*--fs-scale:\\s*([\\d.]+)`));
    assert.ok(m, `venue-${name} declares --fs-scale`);
    assert.equal(Number(m[1]), VENUE_SCALE[name]);
  }
});

test('the venue rules precede scale-*, so a slide\'s own scale-* wins', () => {
  assert.ok(css.indexOf('section.venue-hall') < css.indexOf('section.scale-l '));
});

test('lint reads each venue class at the same rung', () => {
  const value = { l: 1.15, xl: 1.3, '2xl': 1.5 };
  for (const t of VENUE_TOKENS) {
    assert.equal(value[lint.FONT_SCALE_KEYS[t]], VENUE_SCALE[t.replace('venue-', '')], t);
  }
  assert.equal(lint.venueClassFromFrontMatter('venue: hall  # big room'), 'venue-hall');
  assert.equal(lint.venueClassFromFrontMatter('venue: laptop'), null);
});

test('front matter → class, case-insensitive, unknown → none', () => {
  assert.equal(venueClassFromSource('---\nvenue: Conference\n---\n\n# x\n'), 'venue-conference');
  assert.equal(venueClassFromSource('---\nvenue: stadium\n---\n\n# x\n'), '');
  assert.equal(isKnownVenue('HALL'), true);
  assert.equal(isVenueToken('venue-huddle'), true);
  assert.equal(isVenueToken('scale-l'), false);
});
