/**
 * The deck-level motion register, read from front matter.
 *
 * WHY THIS EXISTS. On the live surfaces the Playground reads `motion:` / `motion-style:` /
 * `motion-speed:` straight off the editor's source and hands the values to `parseDeckMotion`.
 * An EXPORTED deck has no source to read — front matter is consumed at render time and never
 * reaches the artifact — so the exporter must lift the three raw scalars out of the markdown
 * and bake them into the player. That is all this module does.
 *
 * IT DELIBERATELY DOES NOT PARSE THEM. Which strings are valid, how a missing style falls
 * back, what `on` implies for a class-less chart — that meaning lives in ONE place,
 * `parseDeckMotion` in docs/src/playground/anima-host-sel.ts, and the exported chart player
 * bundles that same function. A second interpretation here is exactly the drift HARD RULE #1
 * exists to prevent: a forwarded file and the live Playground would disagree about what a deck
 * asked for, and nothing would catch it.
 *
 * It also does not hand-roll the SCALAR rule. `front-matter-key.js` is CJS and this is ESM the
 * export pipeline imports, but only NAMED CJS exports defeat Rollup — a DEFAULT import
 * interops fine, which is how `player-core.mjs` has always consumed
 * `lib/core/resolve-color-mode.js`. So the shared reader is used directly and there is no
 * mirror to keep in sync. (A first draft did hand-roll it, `checkFmScalarReaders` caught it,
 * and the parity test then caught the hand-rolled version disagreeing with the shared rule on
 * a quoted value — the gate and the test both worked.)
 */

import frontMatterKey from './front-matter-key.js';

const { frontMatterValue } = frontMatterKey;

/** The three keys the motion register reads, in the order the cascade resolves them. */
export const MOTION_KEYS = ['motion', 'motion-style', 'motion-speed'];

/** The YAML body of a deck's front matter, or '' when it declares none. */
function frontMatterBody(md) {
  const block = String(md ?? '').match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  return block ? block[1] : '';
}

/**
 * The deck's three raw motion scalars, or nulls. Feed them to `parseDeckMotion` — do not
 * interpret them here.
 *
 * @param {string} md deck source, or the leading `---`-fenced block
 * @returns {{motion: string|null, style: string|null, speed: string|null}}
 */
export function deckMotionScalars(md) {
  const fm = frontMatterBody(md);
  if (!fm) return { motion: null, style: null, speed: null };
  return {
    motion: frontMatterValue(fm, 'motion'),
    style: frontMatterValue(fm, 'motion-style'),
    speed: frontMatterValue(fm, 'motion-speed'),
  };
}

/**
 * True when the author asked the EXPORTED player to ship the still rather than the motion.
 *
 * A separate question from `motion:`, deliberately. `motion:` says whether the deck animates;
 * this says whether a FORWARDED FILE carries that motion — which costs bytes and changes what
 * a recipient sees. Default is to inherit `motion:`, so the common case needs no new key; an
 * author sending a board deck sets `player-motion: off` and keeps motion while presenting.
 *
 * @param {string} md deck source
 * @returns {boolean}
 */
export function playerMotionSuppressed(md) {
  const fm = frontMatterBody(md);
  return fm ? frontMatterValue(fm, 'player-motion') === 'off' : false;
}
