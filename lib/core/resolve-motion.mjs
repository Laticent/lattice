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

// ── Eligibility: does this deck animate a chart at all? ─────────────────────────────────
//
// Three readers used to answer this, and they disagreed three ways: the exporter matched
// `motion-(on|build|together|rise)` case-sensitively, the Studio panel hand-rolled a fourth
// regex, and the live cascade (`anima-host-sel.ts`) used neither. The measured results on one
// deck: `motion: On` animated live and exported a still; a legacy `chart-anima` slide animated
// live and exported a still; a `motion-build` slide shipped 22 KB of player and never moved.
//
// So the rule lives here once. It mirrors `slidePlay` / `parseDeckMotion` in
// `docs/src/playground/anima-host-sel.ts`, which stays canonical for the RUNTIME cascade —
// this is the EXPORT-TIME question ("ship the player at all?"), which the runtime cannot
// answer because by then the bundle is already in or out of the file.
//
// PLAY IS THE SOLE SWITCH. `motion-build` / `motion-together` / `motion-rise` are STYLE
// parameters and do not opt a slide in; `motion-off` opts it out. The legacy `chart-anima`
// alias does opt in, and forgetting it is what made a live deck export a still.

/** The per-slide tokens that turn Play ON. Style/speed tokens are deliberately absent. */
export const SLIDE_PLAY_ON_CLASSES = ['motion-on', 'chart-anima'];

/** True when the deck's own front matter turns Play on. Case-insensitive, because the shared
 *  scalar rule lower-cases nothing and `parseDeckMotion` does — `motion: On` is `on`. */
export function deckPlaysMotion(md) {
  const m = deckMotionScalars(md).motion;
  return typeof m === 'string' && m.trim().toLowerCase() === 'on';
}

/** True when the RENDERED markup carries a slide that explicitly opts in. Matches a real
 *  element tag, so a deck merely documenting the class in a fenced code block (where `<` is
 *  escaped to `&lt;`) does not trip it. */
export function markupHasSlideOptIn(docHtml) {
  const html = String(docHtml ?? '');
  return SLIDE_PLAY_ON_CLASSES.some((cls) => new RegExp(`<section\\b[^>]*\\sclass="[^"]*\\b${cls}\\b`, 'i').test(html));
}

/** True when the deck SOURCE carries a slide opt-in — the same question against markdown
 *  rather than rendered HTML, for surfaces (the Studio panel) that only have the source. */
export function sourceHasSlideOptIn(md) {
  const src = String(md ?? '');
  return SLIDE_PLAY_ON_CLASSES.some((cls) => new RegExp(`<!--[^>]*\\b${cls}\\b`, 'i').test(src));
}

/** The whole export-time question: would any chart in this deck move? */
export function deckAnimatesCharts(md, docHtml) {
  return deckPlaysMotion(md) || markupHasSlideOptIn(docHtml);
}

/** The Studio's question, from source alone. */
export function sourceAnimatesCharts(md) {
  return deckPlaysMotion(md) || sourceHasSlideOptIn(md);
}
