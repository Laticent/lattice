/**
 * surface-registers.js — which deck-level REGISTER tokens survive a split page's class swap.
 *
 * A deck-level register (`finish:`, `mode:`, `stamp:`, `corners:` … —
 * lib/base/base.registers.docs.md) reaches every slide as a class token, stamped by the
 * deck-class propagation kernels (lib/integrations/markdown-it/plugins.js and its runtime
 * mirror). The splitter then REPLACES the class list of every page it re-authors — a cover is
 * a `content lat-split-cover form` field, not a `checklist` — in `roleOpenTag`
 * (lib/core/split-envelope.js). Before this module that swap carried the canvas axis
 * (`dark` / `light` / `print`) and nothing else, so a `finish: atrium` deck rendered its split
 * covers and every carousel page with NO finish, while the same run's auto-split body pages
 * (built with the additive `addClass`) kept it. One run disagreed with itself (#2305).
 *
 * The rule this module states: A REGISTER THAT DECORATES THE PAGE RIDES; A REGISTER THAT
 * COMPOSES A LAYOUT DOES NOT. A cover is still a page of the deck the author styled, so the
 * surface, marker, heading and card treatments the author chose deck-wide belong on it —
 * the same lens as the canvas-ownership note (engineering/decisions/
 * 2026-09-22-canvas-ownership-declare-what-you-mean.md): a rule that decorates declares only
 * the decoration, so it composes with whatever frame it lands on.
 *
 * TWO registers do not ride, and both for the reason `roleOpenTag` already gives for a
 * layout-scoped modifier: they describe how ONE layout composes, and the cover is a different
 * layout.
 *   · `claim-*` — how a frame stages its claim (`claim-bleed` is a SEMI-universal variant,
 *     lib/components/index.js — valid only on frames that declare it).
 *   · `cards-*` — where a card row puts its spare height; `stampCardsAlign` fills it from the
 *     authored component's manifest default, so on a split page it would be the replaced
 *     layout's default wearing a register's name.
 *
 * Every predicate is the register's OWN token list, imported rather than re-listed
 * (HARD RULE #15), so a value added to a register rides without an edit here. Pure & fs-free.
 */

const { isFinishVariantClass } = require('./resolve-finish');
const { MODE_TOKENS } = require('./resolve-mode');
const { STAMP_STYLE_TOKENS } = require('./resolve-stamp');
const { TONE_STYLE_TOKENS } = require('./resolve-tone-style');
const {
  isSpectrumStyleToken, isSpectrumEdgeToken, isSpectrumCardToken, isSpectrumCardEdgeToken, isSpectrumTrimToken,
} = require('./resolve-spectrum');
const { isCornersToken } = require('./resolve-corners');
const { isGuardsToken } = require('./resolve-guards');
const { RULE_TOKENS } = require('./resolve-rule');
const { EYEBROW_TOKENS } = require('./resolve-eyebrow');
const { INLINE_CODE_TOKENS } = require('./resolve-inline-code');
const { HEADLINE_TOKENS } = require('./resolve-headline');
const { LIFT_TOKENS } = require('./resolve-lift');
const { BACKDROP_TOKENS } = require('./resolve-backdrop');

const LISTED = new Set([
  ...MODE_TOKENS, ...STAMP_STYLE_TOKENS, ...TONE_STYLE_TOKENS, ...RULE_TOKENS, ...EYEBROW_TOKENS,
  ...INLINE_CODE_TOKENS, ...HEADLINE_TOKENS, ...LIFT_TOKENS, ...BACKDROP_TOKENS,
]);

/**
 * True when `token` is a deck-level surface register that must survive a split page's class
 * swap. The finish axis counts whole: the bare `finish` compositor, any `finish-<name>` preset,
 * and the `finish-none` per-slide opt-out — a slide that opted out keeps opting out once split.
 */
function isSurfaceRegisterToken(token) {
  const t = String(token || '');
  if (t === 'finish' || t === 'finish-none' || isFinishVariantClass(t)) return true;
  return LISTED.has(t)
    || isSpectrumStyleToken(t) || isSpectrumEdgeToken(t) || isSpectrumCardToken(t)
    || isSpectrumCardEdgeToken(t) || isSpectrumTrimToken(t)
    || isCornersToken(t) || isGuardsToken(t);
}

module.exports = { isSurfaceRegisterToken };
