/**
 * lib/core/resolve-delivery.mjs
 *
 * The deck front-matter `delivery:` register — HOW MUCH a narrated deck gestures, and how
 * loudly. It is the preset axis of engineering/decisions/2026-09-25-vetrina-delivery-presets.md
 * (§6):
 *
 *   delivery: restrained   the default — boardroom, a board member reading the sent file alone
 *   delivery: expressive   a sales room, a prospect, a lightning talk, a lunch-and-learn
 *   delivery: somber       bad news, a loss, a memorial — nothing moves that does not have to
 *
 * WHAT A DELIVERY DECIDES. HOW each narrated sentence is expressed: restrained focuses every part
 * the narration names, expressive leads with the cursor and inks every act, somber gestures once, on
 * the scene's key beat. WHAT a sentence names is never the delivery's call: the narrator binds it
 * and the component's manifest `scene` says how to find it (2026-09-27 note, superseding the budget
 * model of the 2026-09-25 note §3).
 *
 * WHY A DECK REGISTER, the reason `pace:` gives (resolve-pace.mjs): the author's directorial
 * choice has to travel with the deck. A layoff announcement must not play expressively because
 * the recipient's browser remembered a sales demo.
 *
 * ESM and self-contained for the reason `resolve-pace.mjs` states: the docs production build is
 * Rollup, which will not resolve named exports off a CommonJS file outside its root. So the
 * linter (CommonJS, HARD RULE #7) keeps its own copy of the NAMES in `lint-core.js`, and
 * `test/unit/core/delivery-names.test.js` pins the two lists and the two parses against each
 * other.
 */

/** The registered delivery names. */
export const DELIVERY_NAMES = ['restrained', 'expressive', 'somber'];

/** The name a deck gets when it declares none. */
export const DEFAULT_DELIVERY = 'restrained';

import * as expressive from './delivery-styles/expressive.mjs';
import * as restrained from './delivery-styles/restrained.mjs';
import * as somber from './delivery-styles/somber.mjs';

/**
 * EACH DELIVERY IS ITS OWN STYLE FILE (engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md).
 * `lib/core/delivery-styles/<name>.mjs` owns everything that delivery does: its `look` (the numbers
 * the focus and the caption read) and its `express(act, ctx)`, which says what one narrated sentence
 * does in that delivery's own vocabulary. The three share the act vocabulary and nothing else, so a
 * change to one cannot move the other two. This table only gathers them.
 *
 *   budget   the most text-resolved moments one slide may spend (a bullet, a row). 999 = no cap.
 *            A chart the narrator binds is not budgeted at all: its style decides every sentence.
 *   floor    the salience a text-resolved moment needs after the slide's first.
 *   ink      where the Studio also draws Vetrina ink and shows its cursor: `'none'` or `'all'`.
 *   strength the ink's weight.
 *   dim      the opacity the rest recedes to.
 *   dimInner the opacity a walked group's other units recede to (a line's other points).
 *   fade     the crossfade of one handoff, in ms: never two foci.
 *   hold     `'aside'` keeps the focus through a short aside that names nothing.
 *   caption  `'crawl'` lights each word as it is said; `'still'` shows the line in one ink.
 *   wordFocus with the captions off, light the spoken word inside the focused text.
 *   motion   the Vetrina motion tier (`full` or `legible`).
 */
export const DELIVERY_STYLES = Object.freeze({ restrained, expressive, somber });

export const DELIVERY_PRESETS = Object.freeze({
  restrained: restrained.look,
  expressive: expressive.look,
  somber: somber.look,
});

/** True when `value` names a registered delivery. */
export function isKnownDelivery(value) {
  return typeof value === 'string' && DELIVERY_NAMES.includes(value.trim().toLowerCase());
}

/**
 * The raw `delivery:` line and its parsed value, or null when the deck declares none. One parse,
 * two callers: this resolver and lint-core's `unknown-delivery` rule, which mirrors it
 * character for character (the parity is pinned).
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {{ line: string, value: string }|null}
 */
export function deliveryLine(md) {
  const block = String(md ?? '').match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!block) return null;
  const line = block[1].match(/^[ \t]*delivery:[ \t]*(.*)$/m);
  if (!line) return null;
  // The shared front-matter scalar rule (`frontMatterScalar`, lib/core/front-matter-key.js),
  // mirrored rather than imported for the Rollup reason above: a trailing ` # comment` is cut,
  // one pair of surrounding quotes is dropped.
  const cut = line[1].search(/[ \t]#/);
  const value = (cut === -1 ? line[1] : line[1].slice(0, cut))
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
    .toLowerCase();
  return { line: line[0].trim(), value };
}

/**
 * The deck's declared delivery name, or null when it declares none or declares an unknown one.
 * An unknown value is null rather than the default, so a typo falls through at play time and is
 * reported at authoring time — the division every sibling register uses.
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {string|null}
 */
export function frontMatterDelivery(md) {
  const value = deliveryLine(md)?.value ?? null;
  return value !== null && DELIVERY_NAMES.includes(value) ? value : null;
}

/**
 * The preset a delivery plays under: the deck's own, else the default.
 *
 * @param {string|null|undefined} name a delivery name, usually from `frontMatterDelivery`
 * @returns {{ name: string, budget: number, floor: number, ink: 'none'|'all', dim: number, dimInner: number, fade: number, hold: 'none'|'aside', caption: 'crawl'|'still', wordFocus: boolean, strength: 'quiet'|'notable', motion: 'full'|'legible' }}
 */
export function resolveDelivery(name) {
  const key = isKnownDelivery(name) ? String(name).trim().toLowerCase() : DEFAULT_DELIVERY;
  return { name: key, ...DELIVERY_PRESETS[key] };
}
