/**
 * lib/core/card-ink-policy — WHEN a spotlight card needs an ink, read from its classes.
 *
 * A spotlight card thinner than 60% opaque lets the photo show through, so the theme's own ink is
 * read against the photo. This is the question the linter asks (`thin-card-no-ink`) and the Studio
 * asks before it samples anything; the arithmetic that answers WHICH ink lives in card-ink.mjs,
 * which re-exports this file. The two are separate because lint-core ships to the browser and has
 * a byte ceiling (docs/route-budget.json, `lintCoreGz`): it needs the class readers and none of
 * the pixel maths.
 *
 * Pure and DOM-free (HARD RULE #1), an .mjs so the Studio can import it and lint-core can `require` it.
 */

/** A spotlight card thinner than this (percent opaque) needs an explicit ink. */
export const THIN_BACKING = 60;

const NAMED_BACKING = Object.freeze({ 'card-solid': 100, 'card-soft': 80, 'card-sheer': 55, 'card-clear': 0 });
const LEVEL_CLASS = /^card-o(\d{1,2})$/;
// The levels image.styles.css paints: every 5% from 5 to 95 except the two a name already holds
// (`soft` 80, `sheer` 55). `card-o0`, `card-o55` and `card-o80` have no rule, so they set nothing;
// a test pins this list to BACKING_LEVELS in lib/core/resolve-image-card.js.
export const PAINTED_LEVELS = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 65, 70, 75, 85, 90, 95]);
const INK_CLASSES = ['ink-light', 'ink-dark'];

/**
 * The card's opacity, in percent, that a class list sets; `null` when it sets none. Two backing
 * classes on one slide is an authoring error (`conflicting-variants` says so), but the page still
 * paints one: every rule has the same specificity and the `card-oN` levels sit after the four
 * names in image.styles.css, so a level beats a name, and within each the last class wins.
 */
export function backingPercent(classes) {
  let named = null;
  let level = null;
  for (const c of classes || []) {
    if (Object.hasOwn(NAMED_BACKING, c)) named = NAMED_BACKING[c];
    else {
      const m = LEVEL_CLASS.exec(c);
      if (m && PAINTED_LEVELS.includes(Number(m[1]))) level = Number(m[1]);
    }
  }
  return level ?? named;
}

/** `light` or `dark` when a class list names an ink; `null` when it does not. */
export function inkOf(classes) {
  let found = null;
  for (const c of classes || []) if (INK_CLASSES.includes(c)) found = c.slice('ink-'.length);
  return found;
}

/**
 * The card a slide ends up with: its own class on an axis wins, then the deck's `image-card:`
 * words (as the classes they stamp), then the layout's default (a solid card, no ink).
 */
export function effectiveCard(slideClasses, deckClasses = []) {
  const backing = backingPercent(slideClasses) ?? backingPercent(deckClasses) ?? 100;
  const ink = inkOf(slideClasses) ?? inkOf(deckClasses);
  return { backing, ink };
}

/**
 * Whether a slide has a thin spotlight card and no ink to read it by. Only a spotlight card
 * qualifies: a statement's ink is fixed white on a dark scrim, so thinning it never leaves the
 * theme's ink on a photo. The composition is the one the slide NAMES; the linter cannot see the
 * one the engine resolves from the photo's shape, but the Studio can and passes it in.
 */
export function needsInk(slideClasses, deckClasses = [], composition) {
  const named = composition ?? ((slideClasses || []).includes('spotlight') || (slideClasses || []).includes('full') ? 'spotlight' : null);
  if (named !== 'spotlight') return false;
  const { backing, ink } = effectiveCard(slideClasses, deckClasses);
  return ink === null && backing < THIN_BACKING;
}
