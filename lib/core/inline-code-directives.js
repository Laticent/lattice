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
 *   resolve   (text, off, probe) → the kind's fields, or null. Truthy means the span renders. `off`, the
 *             plugins this deck did not load, reaches every function, so a first-party row can
 *             leave a plugin's service alone (a pill's `icon=`, lib/plugins/services.js). With
 *             `probe` true a row may return `true` instead of building the fields: `dispatches`
 *             asks only whether the span renders (the escape, `offPlugin`, `hub-spoke-grammar`).
 *             A row that ignores `probe` is still right, only slower. Render itself calls `html`.
 *   html      text → an HTML string (the markdown-it path), or null
 *   element   (doc, text) → a real element (the runtime's DOM path), or null
 *   lead      the char code every span this kind renders opens with, or ANY to ask regardless.
 *             A plugin row's is its sigil's (`^`, `!`), filled in below. `BY_LEAD` indexes the rows
 *             by it, so ordinary code (99% of spans) is asked of no row, where it used to cost a
 *             full check per row. Each resolver already rejects a span that does not open with
 *             its own character, so the table changes no result, only the call count.
 *   diagnose  (text, off, explain) → why an ATTEMPT at this kind does not render, or null. It drives
 *             `lint:deck` and the escape: a backslash before a broken attempt keeps it literal
 *             without leaving the backslash on the slide. With `explain` false a row may return
 *             `true` instead of the reason: the escape only needs to know, and a reason can cost
 *             (an icon's "did you mean" searches the whole set). A row that ignores it is right too.
 *
 * Marks, pills and sparks are the first-party rows, and they render byte-identically to the hand
 * list this table replaced (test/unit/core/inline-code-table.test.js). A PLUGIN adds a row through
 * its manifest's `contributes.inline` (lib/plugins/inline.generated.js, written by
 * tools/build-plugin-registry.js); the resolver refuses a row whose sigil another row claims.
 * The host keeps the dispatch ORDER and the ESCAPE, the two parts that must not drift between
 * render paths (engineering/decisions/2026-09-29-inline-icons.md § 6a).
 */
const ANY = -1;

/** A row as the dispatcher reads it: frozen, with a `lead`. A plugin row has none of its own; its
 *  sigil is its lead. */
const normalize = (k) => Object.freeze({ ...k, lead: k.lead ?? (k.sigil ? k.sigil.charCodeAt(0) : ANY) });

const FIRST_PARTY = Object.freeze([
  Object.freeze({
    name: 'state', plugin: null, sigil: null, lead: 0x5b /* [ */,
    resolve: parseInlineState, html: stateHtml, element: stateElement, diagnose: null,
  }),
  Object.freeze({
    name: 'pill', plugin: null, sigil: null, alias: '', lead: 0x7b /* { */,
    resolve: pills.resolve, html: pills.pillHtml, element: pills.pillElement, diagnose: pills.attempt,
  }),
  Object.freeze({
    name: 'spark', plugin: null, sigil: '~', lead: 0x7e /* ~ */,
    resolve: sparks.resolve, html: sparks.sparkHtml, element: sparks.sparkElement, diagnose: sparks.diagnose,
  }),
].map(normalize));
const SIGILED = Object.freeze([...FIRST_PARTY, ...PLUGIN_INLINE.map(normalize)]);

/**
 * THE NAMED FORM — `@kind{…}`, one spelling for every inline kind that takes a record
 * (engineering/decisions/2026-10-14-plugin-inline-door.md). The word after `@` names the KIND, never
 * the plugin: the avatars plugin's kind is `avatar`, so `@avatar{Ada}` is `!{Ada}`. The sigils stay as
 * ALIASES, and the named form is resolved by rewriting it to its alias and asking that kind's own
 * row, so a kind needs no code for it and the two spellings cannot render differently.
 *
 * Segno never sees the `@`: the host peels `@kind` off and hands the `{…}` record on, so the
 * notation's grammar (and its tag set) is untouched. Before the host claims it, `@avatar{…}` is a
 * span Segno cannot parse, which is why it was literal code. The `{` must follow the name directly:
 * `@ada`, `@laticent/segno` and `@avatar {Ada}` stay code.
 *
 * A pill has no sigil; its row declares `alias: ''`, so `@pill{LIVE}` is `{LIVE}`. A state mark is not a
 * record and declares none, so it has no named form.
 * A name with no row here (a zip plugin's kind, drawn by the code door after the render) resolves
 * to nothing and stays `<code>`, which is what lets the door find it.
 */
const NAMED_RE = /^@([a-z][a-z0-9-]*)(\{[\s\S]*)$/;
// A row's alias is DECLARED: its sigil (a plugin's comes from its manifest's `contributes.inline`), or
// `alias` for a kind whose short form has no sigil (the pill's is the bare record, `''`).
const ALIASES = new Map(SIGILED.filter((k) => k.sigil || typeof k.alias === 'string').map((k) => [k.name, { row: k, prefix: k.sigil || k.alias }]));

/** `@kind{…}` → the row that draws it and the text in that row's own spelling; null for anything else,
 *  and for a kind whose plugin this deck did not load. */
function namedTarget(text, off) {
  if (typeof text !== 'string' || text.charCodeAt(0) !== 0x40 /* @ */) return null;
  const m = NAMED_RE.exec(text);
  const a = m ? ALIASES.get(m[1]) : null;
  if (!a || (a.row.plugin && off?.has(a.row.plugin))) return null;
  return { row: a.row, text: a.prefix + m[2] };
}

/** The span in its alias spelling when it is a named form of a kind this host draws, else unchanged:
 *  for a reader that knows only the sigil (`lint:deck`'s per-kind diagnostics). Admission is not
 *  asked, so a named span reads the same with its plugin on or off, as its alias does. */
function canonicalText(text) {
  return namedTarget(text, null)?.text ?? text;
}

/**
 * A drawn kind stamps the span it was handed as `data-src`, so an editor can find the author's span
 * without a source map (the Studio's spark-fit fix keys on it). The row hands the kind the ALIAS
 * text, so the host puts the author's own spelling back: an editor must find `@spark{…}`, not a
 * `~{…}` nobody wrote. Only the host element's `data-src` is the span's.
 */
const ATTR_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escAttr = (v) => String(v).replace(/[&<>"]/g, (ch) => ATTR_ESCAPES[ch]);
function withAuthorSrc(html, text) {
  // The host element's opening tag only, as the DOM path sets it on the host element only: a nested
  // child's `data-src` is not the span's.
  return typeof html === 'string' ? html.replace(/^(<[^>]*?) data-src="[^"]*"/, (_m, open) => `${open} data-src="${escAttr(text)}"`) : html;
}

const NAMED_ROW = normalize({
  name: 'named', plugin: null, sigil: null, lead: 0x40 /* @ */,
  resolve: (text, off, probe) => { const t = namedTarget(text, off); return t ? t.row.resolve(t.text, off, probe) : null; },
  html: (text, off) => { const t = namedTarget(text, off); return t ? withAuthorSrc(t.row.html(t.text, off), text) : null; },
  element: (doc, text, off) => {
    const t = namedTarget(text, off);
    const el = t ? t.row.element(doc, t.text, off) : null;
    if (el?.hasAttribute?.('data-src')) el.setAttribute('data-src', text);
    return el;
  },
  diagnose: (text, off, explain) => { const t = namedTarget(text, off); return t?.row.diagnose ? t.row.diagnose(t.text, off, explain) : null; },
});
const KINDS = Object.freeze([...SIGILED, NAMED_ROW]);

for (const k of KINDS) {
  if (k.lead !== ANY && !(k.lead >= 0 && k.lead < 128)) throw new Error(`inline kind "${k.name}": lead must be an ASCII char (BY_LEAD indexes 0-127)`);
}

/**
 * THE LEAD TABLE: first character → the rows worth asking, in table order. Indexed by char code
 * for ASCII, so ordinary code (a letter, `-`, `/`) lands on an empty list and costs one array read.
 * Two cheaper-looking shapes were measured and lost (`npm run parser:bakeoff:segno`, ordinary code):
 * a `row.lead` test inside the row loop cost 103 ns, because first-party and plugin rows are
 * different object shapes and the property load went megamorphic; and a `for…of` over the list cost
 * 12 ns a span for the iterator alone, so the dispatcher's loops are indexed. A non-ASCII lead gets
 * only the ANY rows.
 */
const ANY_ROWS = Object.freeze(KINDS.filter((k) => k.lead === ANY));
const BY_LEAD = Array.from({ length: 128 }, (_, c) =>
  Object.freeze(KINDS.filter((k) => k.lead === c || k.lead === ANY)));
/**
 * BY_LEAD as one bit a character: 1 where some row is worth asking. `dispatches` and `escapedText`
 * read it BEFORE `rowsAsked`, so ordinary code never enters the row loop's function at all
 * (followup 2718-p3). That is not the same cost twice: measured over the bench fixture, a span that
 * reached `rowsAsked` and found an empty list cost 19-27 ns once the process had dispatched real
 * kinds and escapes through it (the loop's call sites go polymorphic, and a backslash's `slice(1)`
 * hands it a second string representation), against 8 ns for this one typed-array read.
 */
const LEADS = Uint8Array.from(BY_LEAD, (rows) => (rows.length ? 1 : 0));

/** The rows worth asking about THIS text: those whose lead is its first character (see BY_LEAD),
 *  less the plugins this deck did not load. `off` is the engine's set of them (lib/plugins/host-grammar.mjs);
 *  the runtime passes none and uses every row, reading admission from the engine's markup instead,
 *  the `data-lattice-off` stamp `offPlugin` decides (spec/LPM.md § 3.2.1). The shared hot path of `dispatches`, `renderHtml`, `renderElement`. */
function rowsAsked(text, off) {
  // The range test is not decoration: indexing with NaN or a code past 127 takes V8's slow keyed-load
  // path and cost 8 ns a span, measured.
  const c = typeof text === 'string' ? text.charCodeAt(0) : NaN;
  const rows = c >= 0 && c < 128 ? BY_LEAD[c] : ANY_ROWS;
  if (rows.length === 0 || !off || !off.size) return rows;
  return rows.filter((k) => !k.plugin || !off.has(k.plugin));
}

/**
 * The plugin whose absence is the only reason this text renders literal — or null. Two shapes:
 * the plugin's own row (`^{database}`), and a first-party row that calls the plugin's service (an
 * icon-only pill, `{icon=bucket}`, which has nothing to show without the drawing). Asked as "does
 * it draw with every plugin on, and with this one back on?", so it covers both without knowing
 * which rows call which services. The engine stamps the literal span
 * `data-lattice-off="<plugin>"`, as it stamps an unadmitted plugin's fence, so the runtime's pass
 * (which has no `off`) leaves it as code too (spec/LPM.md § 3.2.1).
 */
function offPlugin(text, off) {
  if (!off?.size || dispatches(text, off) || !dispatches(text, null)) return null;
  for (const name of [...off].sort()) {
    const rest = new Set(off);
    rest.delete(name);
    if (dispatches(text, rest)) return name;
  }
  return null;
}

/** Would this text dispatch to any kind? Ordinary code stops at its first character (LEADS), so
 *  that one read is the whole cost of the span. */
function dispatches(text, off) {
  const c = typeof text === 'string' ? text.charCodeAt(0) : NaN;
  if (c >= 0 && c < 128 && LEADS[c] === 0) return false;
  return dispatchesRows(text, off);
}
function dispatchesRows(text, off) {
  const rows = rowsAsked(text, off);
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i];
    if (k.resolve(text, off, true)) return true;
  }
  return false;
}

/** Is this text a broken attempt at some kind (the reason), or not one at all (null)? */
function diagnose(text, off) {
  const rows = rowsAsked(text, off);
  for (let i = 0; i < rows.length; i++) {
    const why = rows[i].diagnose ? rows[i].diagnose(text, off) : null;
    if (why) return why;
  }
  return null;
}

/** Is this text a broken attempt at some kind? `diagnose` as a yes/no, which skips the messages. */
function attempted(text, off) {
  const rows = rowsAsked(text, off);
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i];
    if (k.diagnose?.(text, off, false)) return true;
  }
  return false;
}

/**
 * If `text` is an escape, return what the reader should SEE (backslash removed).
 * Otherwise null — the caller leaves the code exactly as it was.
 */
function escapedText(text) {
  if (typeof text !== 'string' || text.length < 2 || text.charCodeAt(0) !== 0x5c /* \ */) return null;
  // What follows the backslash opens no kind (a regex's `\d+`): nothing to strip, and no slice.
  const c = text.charCodeAt(1);
  if (c < 128 && LEADS[c] === 0) return null;
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
  return dispatches(rest) || attempted(rest) ? rest : null;
}

/** Dispatch to HTML — the markdown-it path. Null = leave the `<code>` alone. */
function renderHtml(text, off) {
  const rows = rowsAsked(text, off);
  for (let i = 0; i < rows.length; i++) {
    const html = rows[i].html(text, off);
    if (html) return html;
  }
  return null;
}

/** Dispatch to an element — the runtime's DOM path. Null = leave the `<code>` alone. */
function renderElement(doc, text, off) {
  const rows = rowsAsked(text, off);
  for (let i = 0; i < rows.length; i++) {
    const el = rows[i].element(doc, text, off);
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

/** The kinds a named span can call, with each one's alias, in table order: what the editor offers after `@`. */
const NAMED_KINDS = Object.freeze([...ALIASES].map(([name, a]) => Object.freeze({ name, plugin: a.row.plugin, alias: `${a.prefix}{…}` })));

module.exports = { dispatches, diagnose, escapedText, offPlugin, renderHtml, renderElement, rowsAsked, canonicalText, ESCAPED_ATTR, OFF_ATTR, KINDS, FIRST_PARTY, NAMED_KINDS };
