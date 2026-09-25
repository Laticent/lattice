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
 * WHAT A PRESET DECIDES, AND WHAT IT NEVER DOES. A preset sets the BUDGET (how many moments on a
 * slide get a gesture), filters the VOCABULARY (ink, content marks, the cursor) and picks the
 * STRENGTH and MOTION. It never decides which moments matter: that is a fact about the content,
 * ranked by the Guide's salience plan, so a somber deck and an expressive deck point at the same
 * important numbers — one of them at fewer of them, more quietly (§3).
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

/**
 * What each preset lets the Guide do on one slide. Every field is a decision the design note
 * made in §6, stated once here so the Studio and (later) the exported player read one table.
 *
 *   budget   the most gestures one slide may spend. Authored `_focus` moments are spent first
 *            and are never cut; the salience plan fills the rest by rank.
 *   ink      may the Guide draw ink (underline, wash, bracket, ring, tap) and show its cursor?
 *   marks    may it mark the CONTENT — spotlight a list item, a table row, a chart mark?
 *            `'top'` marks only the slide's top-ranked moment; `'all'` marks every gestured one.
 *   floor    the salience a moment needs to gesture after the slide's first gesture. `1` keeps
 *            plain prose to one move per slide (a divider's "Section 01." kicker, a quote's
 *            attribution); `0` lets a teaching deck walk every block the budget allows.
 *   strength `quiet` everywhere, or `notable` on the top-ranked moment.
 *   motion   the Vetrina motion tier the stage runs at (`full` or `legible`).
 */
export const DELIVERY_PRESETS = Object.freeze({
  restrained: Object.freeze({ budget: 2, floor: 1, ink: true, marks: 'none', strength: 'quiet', motion: 'legible' }),
  expressive: Object.freeze({ budget: 4, floor: 0, ink: true, marks: 'top', strength: 'notable', motion: 'full' }),
  somber: Object.freeze({ budget: 1, floor: 1, ink: false, marks: 'all', strength: 'quiet', motion: 'legible' }),
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
 * @returns {{ name: string, budget: number, floor: number, ink: boolean, marks: 'none'|'top'|'all', strength: 'quiet'|'notable', motion: 'full'|'legible' }}
 */
export function resolveDelivery(name) {
  const key = isKnownDelivery(name) ? String(name).trim().toLowerCase() : DEFAULT_DELIVERY;
  return { name: key, ...DELIVERY_PRESETS[key] };
}
