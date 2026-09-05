/**
 * INLINE-CODE DIRECTIVES — the one dispatcher both render paths call.
 *
 *   `[x]` `[-]` `[ ]` `[/]`   → a state mark   (lib/core/state-marks.js)
 *   `{LABEL}:shape:c4:lg`     → a shaped pill  (lib/core/inline-pills.js)
 *   `\{LABEL}` / `\[x]`       → ESCAPED: the literal, backslash stripped
 *   anything else             → untouched
 *
 * WHY THIS FILE EXISTS RATHER THAN TWO CALLS AT EACH SITE. The markdown-it plugin and
 * the runtime's DOM mirror both need dispatch order AND the escape rule. Written twice,
 * they drift — which is not hypothetical here: the escape below replaces one that worked
 * on only one of them.
 *
 * THE ESCAPE IS A BACKSLASH, AND IT HAD TO BE. The first cut used CommonMark's
 * double-backtick form, reading the backtick run off `token.markup`. That works on the
 * engine path and is INVISIBLE on the other one: marp-core renders `` `{LIVE}` `` and
 * `` ``{LIVE}`` `` to the same `<code>{LIVE}</code>`, so the DOM mirror cannot tell them
 * apart and converted both. The fidelity probe proved it — the runtime produced a pill
 * and a mark the engine did not.
 *
 * A backslash survives into the DOM (markdown-it keeps it literal inside a code span),
 * so both paths see the same thing and agree. The double-backtick special case is gone
 * with it: `` ``{LIVE}`` `` now dispatches like the single form on BOTH paths, which is
 * consistent, and CommonMark's double form is for embedding backticks anyway, not for
 * asking to be left alone.
 *
 * STRIPPING IS CONDITIONAL, and that is the part worth reading. `\` is only an escape
 * when what follows WOULD have dispatched. `` `\[a-z]` `` is a regex character class and
 * `` `\d+` `` is a regex — neither would dispatch, so neither is touched. Stripping
 * unconditionally would have quietly corrupted both.
 */

const { stateHtml, stateElement, parseInlineState } = require('./state-marks.js');
const { pillHtml, pillElement, parse: parsePill, resolveMods } = require('./inline-pills.js');

/** Would this text dispatch to a mark or a pill? */
function dispatches(text) {
  if (parseInlineState(text)) return true;
  const p = parsePill(text);
  return !!(p && resolveMods(p.mods));
}

/**
 * If `text` is an escape, return what the reader should SEE (backslash removed).
 * Otherwise null — the caller leaves the code exactly as it was.
 */
function escapedText(text) {
  if (typeof text !== 'string' || text.length < 2 || text.charCodeAt(0) !== 0x5c /* \ */) return null;
  const rest = text.slice(1);
  return dispatches(rest) ? rest : null;
}

/** Dispatch to HTML — the markdown-it path. Null = leave the `<code>` alone. */
function renderHtml(text) {
  return stateHtml(text) || pillHtml(text);
}

/** Dispatch to an element — the runtime's DOM path. Null = leave the `<code>` alone. */
function renderElement(doc, text) {
  return stateElement(doc, text) || pillElement(doc, text);
}

module.exports = { dispatches, escapedText, renderHtml, renderElement };
