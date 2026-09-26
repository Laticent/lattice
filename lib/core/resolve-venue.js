/**
 * lib/core/resolve-venue.js
 *
 * The deck front-matter `venue:` register names WHERE the deck will be seen, and the
 * engine derives the type size from it. An author knows the room; they do not know
 * which font multiplier the back row needs. What decides legibility is the angle text
 * takes up in the eye, and for slide text that reduces to one number: how many
 * screen-heights away the back row sits (a bigger room gets a bigger screen, so the
 * screen's own size cancels out). The four venues are four bands of that number, one
 * per rung of the projection ladder the engine already has (lib/core/scale-fit.js).
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
 * The rung is a request: a slide too full for it steps down, and LEVEL
 * (scale-fit.js rule 7) keeps every slide on one shared rung. `lint:deck` warns,
 * rather than notes, when a slide is over its budget at the venue.
 *
 * The derivation — the equation, the reading thresholds and the room table — is
 * engineering/typography.md §7 "Venue". Sibling of lift:/mode:/corners: a thin map from
 * a value to a class token appended to every <section>, overridable per slide. Pure +
 * dependency-free so it bundles into the browser runtime; shared by plugins.js and
 * runtime/index.js so both render paths produce identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

// Recognized values → the class each stamps. `laptop` is the designed size: no class.
const VENUE_REGISTER = Object.freeze({
  laptop: '',
  huddle: 'venue-huddle',
  conference: 'venue-conference',
  hall: 'venue-hall',
});

/** The recognized venue names (for the deck-lint vocabulary + docs). */
const VENUE_NAMES = Object.freeze(Object.keys(VENUE_REGISTER));

/** The per-slide class tokens a venue stamps. */
const VENUE_TOKENS = Object.freeze(Object.values(VENUE_REGISTER).filter(Boolean));

/** The `--fs-scale` each venue class requests — pinned against the CSS by the unit test. */
const VENUE_SCALE = Object.freeze({ laptop: 1, huddle: 1.15, conference: 1.3, hall: 1.5 });

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

/** Map a venue value to its class token ('' for laptop, empty and unknown). */
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
  isVenueToken,
  readFrontMatterVenue,
  isKnownVenue,
  venueClass,
  venueClassFromSource,
};
