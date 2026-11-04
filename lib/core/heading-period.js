/**
 * lib/core/heading-period.js — the heading-period switch, decided and applied in ONE place.
 *
 * `no-period` strips a trailing period from a slide's headings; `with-period` adds one to a heading
 * that does not already end in terminal punctuation. Which one a slide gets is the switch precedence
 * (lib/core/switches.mjs): `with-period` > `no-period` > neither, so a deck-wide `class: no-period`
 * and one slide's `with-period` give that slide its period.
 *
 * Two callers, one rule (HARD RULE #1): the engine's markdown-it plugins (`stripHeadingPeriods` /
 * `addHeadingPeriods`, lib/integrations/markdown-it/plugins.js), which edit a heading's last text
 * token, and the runtime (`syncHeadingPeriods`, lib/runtime/index.js), which edits a heading's last
 * text node in a Marp render, where no engine plugin ran.
 */
const { switchOn } = require('./switches');

/** Terminal punctuation: a heading that ends in one of these gets no added period. */
const TERMINAL = /[.!?:…]$/;

/** The period switch for a slide's class tokens: true (add), false (strip), or null (leave). */
function headingPeriodOf(tokens) {
  return switchOn('period', tokens, null);
}

/**
 * A heading's last text run, with the switch applied. `on` is `headingPeriodOf`'s answer.
 * The strip takes a LONE trailing period only, never an ellipsis (`To be continued...` stays as
 * typed). That also makes it idempotent, which the runtime needs: it reapplies the rule on every
 * content pass, and a strip of "one dot" ate an ellipsis a dot per pass (found by the checker).
 */
function withHeadingPeriod(text, on) {
  if (on === false) return text.replace(/(^|[^.])\.\s*$/, '$1');
  if (on === true) return TERMINAL.test(text) ? text : `${text}.`;
  return text;
}

module.exports = { headingPeriodOf, withHeadingPeriod };
