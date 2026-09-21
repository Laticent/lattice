/**
 * lift-label-set.js — take the author's label set OUT of a section's markdown-it
 * HTML, and remove the paragraph it rode in on.
 *
 * WHY THIS IS NOT IN `label-set.js`, WHICH IS WHERE IT STARTED. That module is
 * pure grammar — strings in, plain data out — and the deck LINTER imports it, on
 * both the CLI and in the browser bundle the docs Studio loads. The lift is the
 * one part that needs an HTML extractor (`plain-text.js`), and no linter caller
 * wants it: `lint-core` and `prose-budgets` need `parseInlineSet` and the
 * catalog, nothing more. Keeping the lift here means the Studio route no longer
 * carries `liftLabelSet` or `stripTags`/`plainText` at all — measured, after the
 * route budget caught the growth this construct put in that bundle.
 *
 * So the split is by INPUT, not by convenience: `label-set.js` parses a string an
 * author typed; this module parses markdown-it's OUTPUT. A caller that has the
 * first does not need the second, and the DOM arm of a transformer wants neither
 * (it reads `textContent`, which is already past both stages).
 *
 * Pure: strings in, plain data out. No DOM, no markdown-it, no fs (HARD RULE #1).
 */

const { parseInlineSet } = require('./label-set');
const { plainText } = require('./plain-text');

/**
 * Lift the author's label set out of a section's HTML, or report that there is none.
 *
 * Read from a ONE-CODE paragraph whose whole text is the bracketed set — a KNOWN
 * POSITION, which is the whole reason this module does not register itself with
 * the inline-code dispatcher (see the header). A known position competes with
 * nothing; a global rule would have to out-guess the pill grammar at every span
 * in every deck.
 *
 * EVERY one-code paragraph is a candidate, not just the first, and that is the
 * bug this function exists to keep fixed. A slide routinely carries an EYEBROW in
 * exactly this shape — `` `Retention · 2026 cohorts` `` — and it sets ABOVE the
 * set. Testing only the first match found the eyebrow, failed to parse it, gave
 * up, and an authored set rendered as a subtitle while the key never appeared.
 * `matrix-grid` documents the same trap from the other side: its axis eyebrow is
 * discriminated by holding TWO code spans, so a one-code paragraph there is an
 * ordinary eyebrow and must survive this scan untouched. `parseInlineSet`
 * returning `null` for a non-set is what makes that safe — the pass-through is
 * load-bearing, not defensive.
 *
 * WHY IT LIVES HERE rather than in the first adopter. `heatmap` defined it and
 * exported it from the component; a second adopter would have imported across
 * components (against HARD RULE #1) or re-derived it and re-met the trap above.
 * Four components now share it.
 *
 * The matched paragraph is REMOVED from the html, so the set NAMES the members
 * instead of also printing as a stray eyebrow above the figure.
 *
 * @param {string} html  the section's html
 * @returns {{html: string, set: Array|null}}  html with the set paragraph removed
 *   (unchanged when there is no set), and the parsed set or `null`.
 */
function liftLabelSet(html) {
  // A fresh regex per call: a module-level /g regex carries `lastIndex` between
  // calls, and two charts on one slide would then start the second scan wherever
  // the first stopped. (The original kept one and reset it by hand at the top of
  // every call, which works until someone returns early.)
  const re = /<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const set = parseInlineSet(plainText(m[1]));
    if (set) return { html: html.slice(0, m.index) + html.slice(m.index + m[0].length), set };
  }
  return { html, set: null };
}

module.exports = { liftLabelSet };
