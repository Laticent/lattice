/**
 * INLINE-CODE DIRECTIVES — the one dispatcher both render paths call.
 *
 *   `[x]` `[-]` `[!]` `[?]` `[ ]` `[/]` → a state mark (lib/core/state-marks.js)
 *   `{LABEL, shape, c4, lg}`  → a shaped pill  (lib/core/inline-pills.js)
 *   `~{12 14 17, bar, lg}`    → a spark, a word-sized chart (lib/core/inline-sparks.js)
 *
 * Pills and sparks are written in Segno's notation and read by its slots
 * (lib/core/segno-slots.js): a spark is a TAGGED record, so `~` is part of the grammar and
 * nothing here inspects it. The order below is only which slot is asked first; a span
 * one slot reads, no other slot can.
 *   `\{LABEL}` / `\[x]` / `\~{…}` → ESCAPED: the literal, backslash stripped
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
const pills = require('./inline-pills.js');
const sparks = require('./inline-sparks.js');
const { INLINE: PLUGIN_INLINE } = require('../plugins/inline.generated.js');

/**
 * THE TABLE. One row per inline-code KIND, asked in order; the first row that renders a span
 * wins. Kinds never overlap — a span is a mark (`[x]`), an untagged record (a pill), or a record
 * behind one tag character (`~{` a spark, `^{` an icon), and Segno's parse decides which — so the
 * order only says who is asked first.
 *
 *   name      the kind, for diagnostics and the escape
 *   plugin    null for a first-party row; the plugin that contributes it otherwise
 *   sigil     the tag before `{` (`~`, `^`), or null for marks and pills
 *   resolve   (text, off) → the kind's fields, or null. Truthy means the span renders. `off`, the
 *             plugins this deck did not load, reaches every function, so a first-party row can
 *             leave a plugin's service alone (a pill's `icon=`, lib/plugins/services.js).
 *   html      text → an HTML string (the markdown-it path), or null
 *   element   (doc, text) → a real element (the runtime's DOM path), or null
 *   diagnose  text → why an ATTEMPT at this kind does not render, or null. It drives `lint:deck`
 *             and the escape: a backslash before a broken attempt keeps it literal without
 *             leaving the backslash on the slide.
 *
 * Marks, pills and sparks are the first-party rows, and they render byte-identically to the hand
 * list this table replaced (test/unit/core/inline-code-table.test.js). A PLUGIN adds a row through
 * its manifest's `contributes.inline` (lib/plugins/inline.generated.js, written by
 * tools/build-plugin-registry.js); the resolver refuses a row whose sigil another row claims.
 * The host keeps the dispatch ORDER and the ESCAPE, the two parts that must not drift between
 * render paths (engineering/decisions/2026-09-29-inline-icons.md § 6a).
 */
const FIRST_PARTY = Object.freeze([
  Object.freeze({
    name: 'state', plugin: null, sigil: null,
    resolve: parseInlineState, html: stateHtml, element: stateElement, diagnose: null,
  }),
  Object.freeze({
    name: 'pill', plugin: null, sigil: null,
    resolve: pills.resolve, html: pills.pillHtml, element: pills.pillElement, diagnose: pills.attempt,
  }),
  Object.freeze({
    name: 'spark', plugin: null, sigil: '~',
    resolve: sparks.resolve, html: sparks.sparkHtml, element: sparks.sparkElement, diagnose: sparks.diagnose,
  }),
]);
const KINDS = Object.freeze([...FIRST_PARTY, ...PLUGIN_INLINE]);

/** The rows a render may use: every first-party row, and each plugin row whose plugin is on.
 *  `off` is the engine's set of plugins this deck did not load (lib/plugins/host-grammar.mjs).
 *  The runtime passes none and uses every row: it reads admission from the engine's markup
 *  instead, the `data-lattice-off` stamp `offPlugin` decides (spec/LPM.md § 3.2.1). */
function rowsFor(off) {
  if (!off?.size) return KINDS;
  return KINDS.filter((k) => !k.plugin || !off.has(k.plugin));
}

/**
 * The plugin whose row WOULD draw this text, when that plugin is in `off` — or null. The engine
 * stamps the span it leaves literal for that reason `data-lattice-off="<plugin>"`, as it stamps an
 * unadmitted plugin's fence, so the runtime's pass (which has no `off`) leaves it as code too.
 */
function offPlugin(text, off) {
  if (!off?.size) return null;
  for (const k of PLUGIN_INLINE) if (off.has(k.plugin) && k.resolve(text, null)) return k.plugin;
  return null;
}

/** Would this text dispatch to any kind? */
function dispatches(text, off) {
  for (const k of rowsFor(off)) if (k.resolve(text, off)) return true;
  return false;
}

/** Is this text a broken attempt at some kind (the reason), or not one at all (null)? */
function diagnose(text, off) {
  for (const k of rowsFor(off)) {
    const why = k.diagnose ? k.diagnose(text, off) : null;
    if (why) return why;
  }
  return null;
}

/**
 * If `text` is an escape, return what the reader should SEE (backslash removed).
 * Otherwise null — the caller leaves the code exactly as it was.
 */
function escapedText(text) {
  if (typeof text !== 'string' || text.length < 2 || text.charCodeAt(0) !== 0x5c /* \ */) return null;
  const rest = text.slice(1);
  // EVERY row decides the escape, whatever this deck loaded. The runtime and the flowchart reader
  // have no `off` to pass, so an escape that depended on admission read `\^{database}` two ways on
  // an icons-off deck: the engine kept the backslash and the runtime stripped it (HARD RULE #25
  // inversion lens). The escape is about the author's text, not about what renders.
  // A broken ATTEMPT escapes too. It would render literal anyway, but `lint:deck` warns on it
  // (`spark-literal`, `pill-literal`), and the backslash is how an author says "I meant the
  // text": keeping it on the slide would make that fix cost a visible character. Each row's
  // `diagnose` answers only for a real attempt: a spark needs a digit or a spark word, so
  // LaTeX's `\~{}` keeps its backslash, and the pill row is `attempt`, so LaTeX's `\{a,b\}` and a
  // regex's `\{2,3\}` keep both of theirs.
  return dispatches(rest) || diagnose(rest) ? rest : null;
}

/** Dispatch to HTML — the markdown-it path. Null = leave the `<code>` alone. */
function renderHtml(text, off) {
  for (const k of rowsFor(off)) {
    const html = k.html(text, off);
    if (html) return html;
  }
  return null;
}

/** Dispatch to an element — the runtime's DOM path. Null = leave the `<code>` alone. */
function renderElement(doc, text, off) {
  for (const k of rowsFor(off)) {
    const el = k.element(doc, text, off);
    if (el) return el;
  }
  return null;
}

/**
 * THE ATTRIBUTE THAT MAKES AN ESCAPE STICK.
 *
 * Stripping the backslash is destructive: `\{LIVE}` becomes `{LIVE}`, which is a valid
 * INPUT to this same grammar. So a second pass over the same document converts the
 * literal the author asked for into the pill they asked to avoid — and the runtime's
 * `runAllContentTransforms()` runs many times per document (bootstrap, initAndRun, the
 * body MutationObserver, front-matter resolution). Measured: the literal existed for one
 * frame and was then replaced.
 *
 * The invariant every neighboring mirror states and this one did not: A RUNTIME MIRROR
 * MUST BE A NO-OP ON ENGINE OUTPUT. `pill-tag.js` says "re-tagging an already-tagged
 * `<code>` is a no-op"; `transformVerdictGridBadges` skips items that already carry a
 * `.badge`. This is that guard.
 *
 * BOTH paths stamp it, and that is what closes the second surface: the docs Studio
 * composes ENGINE-rendered HTML together with the runtime in one document, so the engine
 * has already stripped the backslash before the runtime's FIRST pass ever runs. Without a
 * mark on the element there is nothing left in the DOM to distinguish "an escape already
 * resolved" from "a live directive".
 */
const ESCAPED_ATTR = 'data-lat-escaped';

/** The engine's admission marker (spec/LPM.md § 3.2.1), on a span left literal because the plugin
 *  that would draw it is not loaded. A pass never draws a `<code>` that carries it. */
const OFF_ATTR = 'data-lattice-off';

module.exports = { dispatches, diagnose, escapedText, offPlugin, renderHtml, renderElement, ESCAPED_ATTR, OFF_ATTR, KINDS, FIRST_PARTY };
