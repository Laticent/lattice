/**
 * Unit: lib/core/resolve-venue.js — the `venue:` register (engineering/typography.md §7
 * "Venue", fit-everywhere-model.md §18). Pins the copies of each venue's step against one
 * another: the resolver's VENUE_SCALE_BY_FAMILY, the `venue-*` rules in base.modifiers.css
 * (the room ladder, and the shape-narrowed and default rules for square, tall and strip decks),
 * and lint-core's reading of a venue as a measured rung. Also pins that every venue rule comes
 * BEFORE `scale-*` in the CSS, which is what lets a slide's own `scale-*` win.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  VENUE_NAMES, VENUE_TOKENS, VENUE_SCALE, VENUE_SCALE_BY_FAMILY, defaultVenue, effectiveVenue, venueScale, venueRung,
  venueClass, venueClassFromSource, isKnownVenue, isVenueToken, venueOfTokens,
} = require('../../../lib/core/resolve-venue');
const lint = require('../../../lib/authoring/lint-core');

const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');

test('six venues, each stamping its own class', () => {
  assert.deepEqual([...VENUE_NAMES], ['laptop', 'huddle', 'conference', 'hall', 'phone', 'tablet']);
  assert.equal(venueClass('laptop'), 'venue-laptop');
  assert.equal(venueClass('Phone'), 'venue-phone');
  assert.equal(venueClass('stadium'), '');
  assert.deepEqual([...VENUE_TOKENS], VENUE_NAMES.map((n) => `venue-${n}`));
});

test('the default follows the shape: laptop on a wide deck, phone on a social one', () => {
  assert.equal(defaultVenue('wide'), 'laptop');
  for (const f of ['square', 'tall', 'strip']) assert.equal(defaultVenue(f), 'phone');
  assert.equal(effectiveVenue('', 'square'), 'phone');
  assert.equal(effectiveVenue('stadium', 'tall'), 'phone');
  assert.equal(effectiveVenue('venue-hall', 'tall'), 'hall');
  assert.equal(venueScale('', 'square'), 1.5);
  assert.equal(venueScale('hall', 'story'), 1.5, 'an unknown family reads as wide');
});

test('the room ladder is the designed size plus the three scale-* rungs', () => {
  const rungs = ['l', 'xl', '2xl'].map((k) => {
    const m = css.match(new RegExp(`section\\.scale-${k}\\s*\\{[^}]*--fs-scale:\\s*([\\d.]+)`));
    assert.ok(m, `scale-${k} declares --fs-scale`);
    return Number(m[1]);
  });
  assert.deepEqual(['laptop', 'huddle', 'conference', 'hall'].map((n) => VENUE_SCALE[n]), [1, ...rungs]);
  assert.equal(VENUE_SCALE_BY_FAMILY.wide, VENUE_SCALE);
});

test('the CSS gives every venue on every shape the step VENUE_SCALE_BY_FAMILY names', () => {
  const decl = (sel) => {
    const at = css.indexOf(`${sel} {`) >= 0 ? css.indexOf(`${sel} {`) : css.indexOf(`${sel}  `) >= 0 ? css.indexOf(`${sel}  `) : css.indexOf(sel);
    assert.ok(at >= 0, `no rule ${sel}`);
    const m = css.slice(at).match(/^[^{]*\{[^}]*--fs-scale:\s*([\d.]+)/);
    assert.ok(m, `${sel} declares --fs-scale`);
    return Number(m[1]);
  };
  // The room ladder, as on a wide deck.
  for (const v of ['huddle', 'conference', 'hall']) assert.equal(decl(`section.venue-${v}`), VENUE_SCALE[v], v);
  // Square: the default rule (no venue named) is phone; tablet steps down; the rooms keep the ladder.
  assert.equal(decl('section:where([data-family="square"]):not(.venue-laptop, .venue-huddle, .venue-conference, .venue-hall, .venue-tablet, .chart-frame)'), VENUE_SCALE_BY_FAMILY.square.phone);
  assert.equal(decl('section.venue-tablet:where([data-family="square"])'), VENUE_SCALE_BY_FAMILY.square.tablet);
  for (const v of ['huddle', 'conference', 'hall']) assert.equal(VENUE_SCALE_BY_FAMILY.square[v], VENUE_SCALE[v], `square ${v}`);
  // Tall and strip: the rooms rise less, phone is the designed size, tablet steps down by shape.
  for (const v of ['huddle', 'conference', 'hall']) {
    const s = decl(`section.venue-${v}:where([data-family="tall"], [data-family="strip"])`);
    assert.equal(s, VENUE_SCALE_BY_FAMILY.tall[v], `tall ${v}`);
    assert.equal(s, VENUE_SCALE_BY_FAMILY.strip[v], `strip ${v}`);
  }
  assert.equal(decl('section.venue-tablet:where([data-family="tall"])'), VENUE_SCALE_BY_FAMILY.tall.tablet);
  assert.equal(decl('section.venue-tablet:where([data-family="strip"])'), VENUE_SCALE_BY_FAMILY.strip.tablet);
  for (const f of ['tall', 'strip']) assert.equal(VENUE_SCALE_BY_FAMILY[f].phone, 1);
});

// Charts keep laptop until the chart reflow lands (owner, 2026-11-13): no handheld default rule may reach a chart
// section, or 40 chart slides that fit at laptop clip at phone. The chart text kernel reads an unstamped slide as
// laptop (venueOfTokens), so the CSS and the kernel agree.
test('the handheld default skips a chart section', () => {
  const defaults = [...css.matchAll(/section:where\(\[data-family="(?:square|tall)"\](?:, \[data-family="strip"\])?\):not\(([^)]*)\)\s*\{/g)];
  assert.equal(defaults.length, 2, 'the square default and the tall/strip default');
  for (const m of defaults) assert.ok(m[1].split(',').map((t) => t.trim()).includes('.chart-frame'), `default rule leaves out .chart-frame: ${m[0]}`);
  assert.equal(venueOfTokens(['roadmap', 'chart-frame']), 'laptop');
});

test('no tall or strip room venue leaves fewer than about 35 characters a line', () => {
  // The designed tall size reads about 43 characters a line on a 1080-wide box (measured,
  // fit-everywhere-model.md §18); a step of s leaves 43 / s. The 17em tight threshold is ~35.
  for (const f of ['tall', 'strip']) for (const v of ['huddle', 'conference', 'hall']) {
    assert.ok(43 / VENUE_SCALE_BY_FAMILY[f][v] >= 35, `${f} ${v}`);
  }
});

test('every venue rule precedes scale-*, so a slide\'s own scale-* wins', () => {
  const scaleAt = css.indexOf('section.scale-l ');
  for (const sel of ['section.venue-hall ', 'section:where([data-family="square"])', 'section.venue-tablet:where([data-family="strip"])']) {
    assert.ok(css.indexOf(sel) >= 0 && css.indexOf(sel) < scaleAt, sel);
  }
});

test('lint reads a venue at the smallest measured rung at or above its step, by shape', () => {
  assert.equal(venueRung('hall', 'wide'), '2xl');
  assert.equal(venueRung('', 'square'), '2xl', 'square phone is x1.5, the hall rung');
  assert.equal(venueRung('tablet', 'square'), '1');
  assert.equal(venueRung('huddle', 'tall'), 'l');
  assert.equal(venueRung('hall', 'tall'), 'xl', 'x1.22 reads the x1.3 budgets, never the x1.15 ones');
  assert.equal(venueRung('', 'tall'), '1');
  assert.equal(venueRung('phone', 'wide'), '1');
  const value = { l: 1.15, xl: 1.3, '2xl': 1.5 };
  for (const t of ['venue-huddle', 'venue-conference', 'venue-hall']) {
    assert.equal(value[lint.FONT_SCALE_KEYS[t]], VENUE_SCALE[t.replace('venue-', '')], t);
  }
  assert.equal(lint.venueClassFromFrontMatter('venue: hall  # big room'), 'venue-hall');
  assert.equal(lint.venueClassFromFrontMatter('venue: laptop'), 'venue-laptop');
  assert.equal(lint.venueClassFromFrontMatter('venue: stadium'), null);
});

test('front matter → class, case-insensitive, unknown → none', () => {
  assert.equal(venueClassFromSource('---\nvenue: Conference\n---\n\n# x\n'), 'venue-conference');
  assert.equal(venueClassFromSource('---\nvenue: stadium\n---\n\n# x\n'), '');
  assert.equal(isKnownVenue('HALL'), true);
  assert.equal(isKnownVenue('tablet'), true);
  assert.equal(isVenueToken('venue-phone'), true);
  assert.equal(isVenueToken('scale-l'), false);
});
