/**
 * lib/core/resolve-venue.js
 *
 * The deck front-matter `venue:` register names WHERE the deck will be seen, and the
 * engine derives the type size from it. An author knows the room; they do not know
 * which font multiplier the back row needs. What decides legibility is the angle text
 * takes up in the eye, and for slide text that reduces to one number: how many
 * screen-heights away the back row sits (a bigger room gets a bigger screen, so the
 * screen's own size cancels out). The four venues are four bands of that number, one
 * per rung of the projection ladder `scale-l` / `scale-xl` / `scale-2xl` already name.
 *
 *   venue: laptop      → (no class)          ≤ 3 screen-heights  1.0x   the default
 *   venue: huddle      → `venue-huddle`      ~4.5                1.15x  4–6 people, a TV
 *   venue: conference  → `venue-conference`  5–7                 1.3x   10–30 people
 *   venue: hall        → `venue-hall`        7–10                1.5x   50–2,000 people
 *
 * Each class sets `--fs-scale` to its rung and `--venue-meta-lift`, which raises the
 * meta role (eyebrows, captions, labels, the running header and page number) by more
 * than the body, because the smallest text is the first to fail at distance. The CSS
 * is in lib/base/base.modifiers.css, declared BEFORE the `scale-*` classes, so a slide
 * that also carries `scale-*` gets that scale and keeps the venue's label lift.
 *
 * The rung is a SETTING, not a request (owner ruling 2026-09-27): every slide renders at
 * it, like desktop zoom, and a slide too full for it clips rather than shrinking.
 * `lint:deck` warns when a slide is over its budget at the venue, and the ring and the
 * export's OVERFLOW line name it.
 *
 * HANDHELD VENUES (owner ruling 2026-11-05, engineering/decisions/2026-10-28-fit-everywhere-model.md
 * §18). The four rooms are measured for a 16:9 deck on a projected screen. A square post or a
 * story is mostly seen in a hand, so two more venues name that:
 *
 *   venue: phone   → `venue-phone`    the slide fills a phone's width (about 390pt)
 *   venue: tablet  → `venue-tablet`   the slide sits upright on a tablet (about 820 x 1180pt)
 *
 * and the SHAPE decides what each venue's type step is (VENUE_SCALE_BY_FAMILY): `phone` is the
 * default for square, tall and strip decks, and `laptop` stays the default for a wide one. The
 * default is applied by the stylesheet off the section's `data-family` stamp, so it follows the
 * box a slide actually renders at; an explicit `venue: laptop` therefore stamps `venue-laptop`,
 * so a social deck can still ask for the designed size. Venue is the only thing that changes a
 * text size: the narrow-box exceptions that used to shrink or enlarge type are gone (§18).
 *
 * The derivation — the equation, the reading thresholds and the room table — is
 * engineering/typography.md §7 "Venue". Sibling of lift:/mode:/corners: a thin map from
 * a value to a class token appended to every <section>, overridable per slide. Pure +
 * dependency-free so it bundles into the browser runtime; shared by plugins.js and
 * runtime/index.js so both render paths produce identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

// Recognized values → the class each stamps. Every venue stamps a class, `laptop` included: on a
// square, tall or strip deck the unstamped default is `phone`, so the designed size needs a name.
const VENUE_REGISTER = Object.freeze({
  laptop: 'venue-laptop',
  huddle: 'venue-huddle',
  conference: 'venue-conference',
  hall: 'venue-hall',
  phone: 'venue-phone',
  tablet: 'venue-tablet',
});

/** The recognized venue names (for the deck-lint vocabulary + docs). */
const VENUE_NAMES = Object.freeze(Object.keys(VENUE_REGISTER));

/** The per-slide class tokens a venue stamps. */
const VENUE_TOKENS = Object.freeze(Object.values(VENUE_REGISTER).filter(Boolean));

/** The `--fs-scale` each venue class requests on a WIDE deck — pinned against the CSS by the unit test. */
const VENUE_SCALE = Object.freeze({ laptop: 1, huddle: 1.15, conference: 1.3, hall: 1.5, phone: 1, tablet: 1 });

/**
 * The `--fs-scale` each venue requests, by the deck's shape family (lib/adaptive/families.js) —
 * pinned against base.modifiers.css by test/unit/parsing/resolve-venue.test.js.
 *
 *  - wide: the room ladder as measured. A 16:9 deck is not read in a hand, so phone and tablet
 *    are the designed size.
 *  - square: `phone` (the default) is x1.5, which reads at about 16pt on a 390pt phone and lands
 *    on the measured hall rung, so every capacity budget measured there applies exactly. The rooms
 *    keep their ladder: a square deck holds 44+ characters a line even at hall.
 *  - tall / strip: the designed size already reads at 17pt on a phone, so `phone` is x1. The rooms
 *    rise less than on 16:9 (x1.1 / x1.17 / x1.22), because x1.5 on a tall box left under 35
 *    characters a line; x1.22 keeps about 35. `tablet` steps DOWN: a tablet held at reading distance
 *    shows a tall slide larger than a phone does (the strip shape least, so it keeps more).
 */
const VENUE_SCALE_BY_FAMILY = Object.freeze({
  wide: VENUE_SCALE,
  square: Object.freeze({ laptop: 1, huddle: 1.15, conference: 1.3, hall: 1.5, phone: 1.5, tablet: 0.75 }),
  tall: Object.freeze({ laptop: 1, huddle: 1.1, conference: 1.17, hall: 1.22, phone: 1, tablet: 0.6 }),
  strip: Object.freeze({ laptop: 1, huddle: 1.1, conference: 1.17, hall: 1.22, phone: 1, tablet: 0.72 }),
});

/** The venue a deck of this family gets when `venue:` is absent or unknown. */
function defaultVenue(family) {
  return family === 'square' || family === 'tall' || family === 'strip' ? 'phone' : 'laptop';
}

/** The venue a slide renders at: its own (`venue-*` class or `venue:` value) or its family's default. */
function effectiveVenue(value, family = 'wide') {
  const key = typeof value === 'string' ? value.trim().toLowerCase().replace(/^venue-/, '') : '';
  return Object.hasOwn(VENUE_REGISTER, key) ? key : defaultVenue(family);
}

/** The type step a slide renders at, from its venue and its family. */
function venueScale(value, family = 'wide') {
  const fam = VENUE_SCALE_BY_FAMILY[family] ? family : 'wide';
  return VENUE_SCALE_BY_FAMILY[fam][effectiveVenue(value, fam)];
}

/**
 * The MEASURED rung ('1' designed, 'l' x1.15, 'xl' x1.3, '2xl' x1.5) a capacity budget reads for
 * this venue and family: the smallest measured rung at or above the venue's real step, so a budget
 * never promises room the slide does not have. A step under x1 reads the designed rung.
 */
function venueRung(value, family = 'wide') {
  const s = venueScale(value, family);
  if (s <= 1) return '1';
  if (s <= 1.15) return 'l';
  if (s <= 1.3) return 'xl';
  return '2xl';
}

/** True when `token` is a venue class. */
function isVenueToken(token) {
  return VENUE_TOKENS.includes(String(token || ''));
}

/** Extract the raw `venue:` value from a deck source's front matter, or null. */
function readFrontMatterVenue(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  return frontMatterName(m[1], 'venue');
}

/** True if `value` is a recognized venue. */
function isKnownVenue(value) {
  return typeof value === 'string' && Object.hasOwn(VENUE_REGISTER, value.trim().toLowerCase());
}

/** Map a venue value to its class token ('' for empty and unknown: the family's default applies). */
function venueClass(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(VENUE_REGISTER, key) ? VENUE_REGISTER[key] : '';
}

/** Convenience: read `venue:` from a full deck source + map it to its class token. */
function venueClassFromSource(md) {
  return venueClass(readFrontMatterVenue(md) || '');
}

module.exports = {
  VENUE_REGISTER,
  VENUE_NAMES,
  VENUE_TOKENS,
  VENUE_SCALE,
  VENUE_SCALE_BY_FAMILY,
  defaultVenue,
  effectiveVenue,
  venueScale,
  venueRung,
  isVenueToken,
  readFrontMatterVenue,
  isKnownVenue,
  venueClass,
  venueClassFromSource,
};
