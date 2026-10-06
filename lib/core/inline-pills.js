/**
 * INLINE PILLS — `{LABEL}` in inline code becomes a shaped, colored pill.
 *
 *   `{LIVE}`                 → capsule pill, accent
 *   `{BETA, tag, c4}`        → sharp tag, categorical slot 4
 *   `{1, circle, c5}`        → circular badge
 *   `{DECIDE, diamond}`      `{STEP 2, chevron-right}`   `{CRITICAL, tag-bordered}`
 *
 * SPELLED IN SEGNO'S NOTATION (Segno phase 2, engineering/decisions/2026-09-28-segno-unified-
 * inline-notation.md): a pill is a record whose first item is its label and whose other items
 * are shape, color and size words in any order (`{BETA, c4, tag}` is the same pill), or
 * `name=value` (`{BETA, shape=tag}`). Segno reads it with the core `pill` slot
 * (lib/core/segno-slots.js); this file keeps what only a pill knows — the reserved labels and
 * the output. The colon spelling (`{BETA}:tag:c4`) it replaced is what the history below
 * measured; the argument for braces over bracket geometry is unchanged.
 *
 * WHY THIS EXISTS. `list-tabular` carried eight variants and five of them —
 * `metric`, `register`, `outline`, `solid`, `rule` — never move a grid cell.
 * Measured: they set 16, 19, 3, 3 and 2 properties, none of them `grid-column`
 * or `grid-row`. All five are the APPEARANCE of one slot, promoted to a
 * whole-slide class because an author had no way to say "this value is a filled
 * pill" on the value itself. Here, shape and color are a property of the
 * OCCURRENCE. (The other three — `def`, `spec`, `stacked` — genuinely re-point
 * the grid, and this grammar does not replace them.)
 *
 * THE KERNEL (HARD RULE #1). Pure: no DOM, no markdown-it, no fs. The
 * markdown-it plugin and the runtime's DOM mirror both call `render()` from
 * here, so the two paths cannot drift.
 *
 * WHY `{…}` AND NOT THE ADR'S BRACKET GEOMETRY. The design note
 * (`engineering/decisions/2026-05-11-inline-code-directives.md`) locked a
 * Mermaid-style map where the BRACKET picks the shape — `[X]` tag, `(X)` chip,
 * `((X))` circle. Brackets are the most loaded characters in a repo whose decks are
 * about code, and the ADR never ran on them the test it ran on `:` `@` `#` `!`
 * ("inline code routinely starts with `:root`, `@media`"). Run on the decks we SHIP —
 * a couple of hundred of them, some thousands of inline-code spans — the two grammars
 * compare like this:
 *
 *   bracket geometry  27 spans the author meant literally — a span whose WHOLE text is
 *                     `[…]`, `[[…]]`, `(…)` or `((…))`, which is what that map dispatches
 *                     on. 13 of the 27 are decks QUOTING our own state markers (exactly
 *                     `[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`; the functional ones are bare at a bullet's
 *                     start and were never at risk — it is the slides TEACHING the syntax
 *                     that break, one of which says "`[?]` renders as literal text"). The
 *                     other 14 are ordinary prose, and they are the whole list: `(cont.)`
 *                     ×2, `(0,2,2)` ×2, `[data-mark]` ×2, `[?]` ×2, `[ REDACTED ]`, `[*]`,
 *                     `((round))`, `[square]`, `(rounded)`, `[!]`. The predicate is spelled
 *                     out because a reviewer could not re-derive "14" from an earlier draft
 *                     that only gave four examples and got 6.
 *
 *   one brace pair    36 spans, in exactly two decks — 22 in `examples/inline-pills.md`,
 *   (what we ship)    which exists to demonstrate the grammar, and 14 in
 *                     `examples/inline-code-literal.md`, which sets `inline-code: literal`
 *                     and renders them as the text they are. Zero in every other deck.
 *
 * THAT LAST SENTENCE IS A MEASUREMENT, NOT YET A GATE, and saying so is the point. A
 * corpus-wide census that re-walks every deck on every run and fails on a dispatching span
 * outside those two decks was built, and it is NOT in this change: it went through four
 * review rounds of its own, each finding a defect in the one before, and a register should
 * not wait on a test helper. It lands on its own branch, where its churn costs nobody a
 * merge. Until then, treat the four figures above the way you would any number in a
 * comment — re-derive before you rely on them.
 *
 * WHY THE CORPUS SIZE IS APPROXIMATE AND THOSE FOUR FIGURES ARE NOT. The 27 / 36 / 22 / 14
 * are properties of what the decks SAY and have survived every re-measurement, including a
 * rebase; the corpus SIZE is a property of how many decks exist that day and moves whenever
 * anyone adds one. An exact "249 decks, 6,775 spans" was written into this comment and was
 * false eleven commits later, overtaken by a routine rebase — which is the defect this
 * paragraph was rewritten to fix, committed inside the fix. So the size is a floor here,
 * and the exact number belongs in a test rather than in prose.
 *
 * WHY THE NUMBERS HERE DO NOT MATCH THE ONES THIS PARAGRAPH USED TO CARRY (12,551 spans,
 * 147 bracket collisions). Those were taken over a wider glob — `examples/`, `lib/`,
 * `docs/src`, `test/integration` — which sweeps in `*.docs.md` prose that is never
 * projected, so it is not the surface that can collide with anything. Nothing re-derived
 * them and a comment cannot fail, so they could only rot; a review round found them
 * restated in five places with two different corpus definitions. Re-running that wider
 * method gives more spans every month and 161 bracket collisions — a fifth more spans than
 * the 12,551 it was taken on, and the conclusion did not move. Asking the same question of every `*.md` in the tree
 * is a third answer again (~370 dispatching spans, almost all of them this feature's own
 * documentation), and it is the least useful one: engineering prose reaches no slide.
 * The eight shape NAMES from the ADR all survive; only the spelling moved from
 * bracket geometry to a modifier word.
 */

/** Shape names — the ADR's map, unchanged; `pill` is what a bare `{X}` gets. */
const SHAPES = Object.freeze([
  'pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond',
]);

/** Ordinal color slots. NOT color names: `--cat-blue` is sky blue on indaco and
 * deep red on burgundy, so a `:blue` modifier would lie to a portable deck. The ADR
 * proposed `c1`–`c8` mapping onto `--cat-blue`…`--cat-mauve`; HARD RULE #11 has since
 * retired those names for the role-based `--cat-N-fill` / `--cat-N-mark` set, and there
 * are TWELVE of them, so the slots run `c1`–`c12` and land on a token that already
 * exists rather than one the ADR named. */
const COLORS = Object.freeze(
  Array.from({ length: 12 }, (_, i) => `c${i + 1}`),
);
const SIZES = Object.freeze(['sm', 'md', 'lg']);

/**
 * RESERVED: the four state markers. An author who has learned to write `- [x]` at the
 * start of a bullet will reach for `` `{x}` `` inline, and without this they get a
 * capsule pill containing the letter "x" — not "nothing happened", which is obvious in
 * review, but a plausible-looking wrong artifact that survives it. Worse, the four
 * behaved THREE ways: `{x}` `{-}` `{/}` became pills and `{ }` fell to literal on the
 * space, so the vocabulary was inconsistent with itself as well as with the bare form.
 *
 * They render literal for now, and `lint:deck` points at the bare form. This is a
 * RESERVATION, not a refusal on principle: drawing a real state mark here is the right
 * answer and it needs universal `.state` CSS that does not exist yet (today it is
 * scoped to four components plus the `heat` modifier). Reserving the labels now means
 * that can land later without breaking a deck that had used `{x}` as a pill.
 */
// Only the four markers that read as a CHECKBOX typed into braces. `[!]` and `[?]` are
// state markers too, but `{!}` and `{?}` are established single-glyph PILLS — an alert
// diamond, a help circle (examples/inline-pills.md) — and nobody reaching for a checkbox
// types them. Reserving them would turn a working pill into literal text.
const RESERVED_MARKERS = new Set(['x', '-', '/', ' ']);

let slot = null;
const pillSlot = () => (slot ??= require('./segno-slots.js').coreSlot('pill'));

/**
 * An icon-only pill with options: `{icon=gateway, c2}`. Segno binds the first bare word to the
 * label, so `c2` would print as the label and the pill would lose its color (HARD RULE #25 red
 * team, on the note's own headline spelling). When the pill names an icon and its "label" is one
 * of the pill's own option words, read it again as an icon-only pill whose bare words are all
 * options. A label that really is such a word is quoted: `{"lg", icon=x}`.
 */
const PILL_WORDS = new Set([...SHAPES, ...COLORS, ...SIZES]);
let iconOnly = null;
const iconOnlySlot = () => (iconOnly ??= require('./segno-spec.js').compileSlot({
  label: 'a pill', positional: [], params: require('./segno-slots.js').CORE.pill.params,
}, 'core.pill.icon-only'));
/** The pill's bound value, re-read as icon-only when its label is really an option word. */
function bindPill(text) {
  const r = pillSlot().read(text);
  if (!r.ok || r.value.icon === undefined || !PILL_WORDS.has(String(r.value.value || '').toLowerCase())) return r;
  if (/^\{\s*"/.test(text)) return r; // a quoted label is a label
  const again = iconOnlySlot().read(text);
  return again.ok ? again : r;
}

/**
 * THE ICON, FROM WHOEVER OFFERS IT. `{S3, icon=bucket, c4}` asks the host for the icons plugin's
 * services (lib/plugins/services.js), never the plugin itself
 * (engineering/decisions/2026-09-29-inline-icons.md § 5.2, § 6a). With the plugin off — not
 * installed, or not loaded for this deck (`off`) — there is no service, and the pill shows its
 * label alone; an icon-only pill (`{icon=database}`) then has nothing to show and stays literal.
 */
const { service } = require('../plugins/services.js');

/**
 * Read one code_inline token's text as a pill.
 * @param {Set<string>|null} [off] the plugins this deck did not load
 * @returns {{value:string, shape:string, c:string|null, size:string|null, icon:string|null}|null}
 *   null = leave the `<code>` literal: not a record at all (the O(1) reject), a record the pill
 *   slot refuses, a reserved label, or an icon the set does not have. Never guess, never silently
 *   drop: a `{X, c13}` stays literal on the slide, which is obvious in the first review pass,
 *   where a pill missing its color is not.
 */
function read(text, off) {
  if (typeof text !== 'string' || text.length < 3) return null;
  if (text.charCodeAt(0) !== 0x7b /* { */) return null; // O(1) reject; literals never allocate
  if (isDirective(text) !== 'directive') return null;
  const r = bindPill(text);
  if (!r.ok) return null;
  const v = r.value;
  let icon = null;
  if (v.icon !== undefined) {
    const known = service('icons', 'known', off);
    if (known) {
      icon = known(v.icon);
      if (!icon) return null;
    }
  }
  if (v.value === undefined || v.value === '') {
    if (!icon) return null;
  } else if (RESERVED_MARKERS.has(v.value)) return null;
  return { value: v.value || '', shape: v.shape || 'pill', c: v.color ? `c${v.color}` : null, size: v.size || null, icon };
}

/**
 * The icon a pill's `icon=` names, as a Segno-style spelling (canonical name, the word written, and
 * where it sits in the span), for `lint:deck`'s one-spelling-per-deck rule: `{Orders, icon=db}` is
 * the `database` icon written as its alias. Null when the pill names no icon the set knows.
 */
function iconSpelling(text, off) {
  if (typeof text !== 'string' || text[0] !== '{' || isDirective(text) !== 'directive') return null;
  const known = service('icons', 'known', off);
  const r = bindPill(text);
  if (!known || !r.ok || r.value.icon === undefined) return null;
  const canonical = known(r.value.icon);
  if (!canonical) return null;
  const p = segnoParse(text);
  const item = p.ok && p.item.value.kind === 'record' ? p.item.value.items.find((it) => it.name === 'icon') : null;
  if (!item || item.value.kind !== 'scalar') return null;
  return { param: 'name', canonical, written: String(r.value.icon).trim().toLowerCase(), from: item.value.from, to: item.value.to, shortcut: false, named: true };
}

/** Why a span that opens like a pill (`{` then a non-space) does not render as one, for
 * `lint:deck`; null when it renders, or is not a pill attempt at all. */
function diagnose(text, off) {
  if (typeof text !== 'string' || isDirective(text) !== 'directive' || text[0] !== '{') return null;
  const r = bindPill(text);
  if (!r.ok) return r.diagnostics[0].message;
  const v = r.value;
  if (v.icon !== undefined) {
    const known = service('icons', 'known', off);
    if (known && !known(v.icon)) {
      const why = service('icons', 'whyUnknown', off);
      return why ? why(v.icon) : `"${v.icon}" is not an icon`;
    }
  }
  // An empty pill (`{""}`) is not an attempt at anything; it stays literal, as it always did.
  if (v.value === undefined || v.value === '') return null;
  return RESERVED_MARKERS.has(v.value) ? `\`{${v.value}}\` is reserved for a state mark` : null;
}

/**
 * Why a span is a broken pill ATTEMPT — what a backslash may strip
 * (lib/core/inline-code-directives.js), so `\{A|B}`, the escape `pill-literal` suggests, leaves no
 * visible backslash — or null. `diagnose` less three shapes that are someone else's braces, so they
 * never lose a backslash:
 *
 *   a backslash anywhere in the span  LaTeX (`\\{a,b\\}`, `{\\frac{a}{b}}`) and BRE regex (`\\{2,3\\}`):
 *                                     escaping the opener alone would strip one backslash of two
 *   a regex interval                  `{2,5}` `{3}` `{2,}` — digits and one comma, no space
 *   a template tag                    `{{name}}`, Handlebars and Mustache
 *
 * A shape that is genuinely ambiguous (`{8, 80}`, a quadrant point quoted in prose) stays an
 * attempt, so a backslash in front of it renders the literal.
 */
const NOT_A_PILL = /\\|^\{\d*,?\d*\}$|^\{\{/;
function attempt(text, off) {
  if (typeof text !== 'string' || NOT_A_PILL.test(text)) return null;
  return diagnose(text, off);
}

/**
 * Why this pill renders literal BECAUSE OF ITS ICON — it reads as a pill but `icon=` names no
 * icon (`{X, icon=lambda}`, `{icon=nope}`) — or null. `lint:deck` coaches that case on its own:
 * the label is fine, so the quoting advice for a reserved character would be wrong.
 */
function iconProblem(text, off) {
  if (typeof text !== 'string' || isDirective(text) !== 'directive' || text[0] !== '{') return null;
  const r = bindPill(text);
  if (!r.ok || r.value.icon === undefined) return null;
  const known = service('icons', 'known', off);
  if (!known || known(r.value.icon)) return null;
  const why = service('icons', 'whyUnknown', off);
  return why ? why(r.value.icon) : `"${r.value.icon}" is not an icon`;
}

const { isDirective, parse: segnoParse } = require('@laticent/segno/read');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/* Module scope so the literal is evaluated once rather than per call. Measured at
 * 164.6ns vs 159.1ns per call — V8 already caches the compiled pattern, so this is
 * hygiene, not a win: `esc` runs on the pill path only, 65 times across every tracked
 * markdown file in the repo.
 *
 * THE PARSER USES NO REGEX AT ALL, which is where the speed comes from — but read the
 * number carefully, because two earlier versions of this comment got it wrong in the same
 * way. Cold, one pass over the real corpus in a fresh process: ~78ns/span (three runs:
 * 78.0 / 77.0 / 82.4). A deeply-warmed micro-benchmark reports ~6ns, and THAT IS NOT THE
 * RENDER PATH: `parse` is called a few hundred times per deck, never in a hot loop, so the
 * cold figure is the representative one. The conclusion is unchanged either way — 500
 * spans at 78ns is 39 microseconds, dust beside mermaid and the render itself.
 *
 * METHOD, because the count moves with it: `git ls-files '*.md'`, fenced blocks stripped,
 * inline-code spans only — of order 10^5, and it read 1,364 files and 104,601 spans when
 * the timing above was taken. No current figure is quoted here on purpose: two were, and
 * both were stale within a fortnight of being written. A different glob or fence rule gives
 * a different total again — an independent checker measuring this got 111,805 with its own.
 * Nothing depends on the number, only on its order of magnitude: 500 spans at 78ns is
 * still dust, and so is 5,000.
 *
 * `parse` rejects on one `charCodeAt` before allocating, so upwards of 99.7% of spans (all
 * but the few hundred that open with `{`) never reach a slice, a trim or a split.
 * `test/unit/core/inline-pills.test.js` pins that shape. */
const ESCAPE_RE = /[&<>"]/g;
/** The value is AUTHOR text landing in markup — escape it. */
function esc(s) {
  return String(s).replace(ESCAPE_RE, (ch) => ESCAPES[ch]);
}

/**
 * THE ONE DECISION both render paths share: code text → the pill's parts, or null.
 * Each path then builds its own output from these — a string on the markdown-it side,
 * a real element on the DOM side. Deliberately NOT "kernel returns HTML": the runtime
 * mirror runs inside an already-sanitized preview document, where assigning markup is
 * exactly the post-sanitize injection HARD RULE #22 exists to stop. Handing it fields
 * instead of markup means there is nothing to sanction and nothing to sanitize.
 * @returns {{value:string, shape:string, c:string|null, size:string|null}|null}
 */
const resolve = read;

/** Render to an HTML string — the markdown-it path, which emits `html_inline`. */
function pillHtml(text, off) {
  const p = resolve(text, off);
  if (!p) return null;
  const attrs = ['class="lat-pill"', `data-shape="${p.shape}"`];
  if (p.c) attrs.push(`data-c="${p.c}"`);
  if (p.size) attrs.push(`data-size="${p.size}"`);
  // The icon leads the label. Its drawing may not be on this surface yet (a browser fetches it per
  // deck, lib/plugins/plugin-data.js): then the span stays literal rather than quietly drawing a
  // pill without the icon the author asked for. (With the plugin OFF, `p.icon` is null and the
  // pill shows its label alone — that is the plugin contract, not a missing drawing.)
  const icon = p.icon ? service('icons', 'drawHtml', off)?.(p.icon, 'lat-pill-icon') : null;
  if (p.icon && !icon) return null;
  // An icon-only pill has no words, so it names itself; beside a label the icon is decorative.
  if (!p.value) attrs.push('role="img"', `aria-label="${esc(p.icon.replace(/-/g, ' '))}"`);
  return `<span ${attrs.join(' ')}>${icon || ''}${esc(p.value)}</span>`;
}

/**
 * Build the pill as a real element — the runtime's DOM path. `textContent`, never
 * markup, so an author's label cannot become nodes however hostile it is.
 * @param {Document} doc
 */
function pillElement(doc, text, off) {
  const p = resolve(text, off);
  if (!p) return null;
  const icon = p.icon ? service('icons', 'drawElement', off)?.(doc, p.icon, 'lat-pill-icon') : null;
  if (p.icon && !icon) return null;
  const el = doc.createElement('span');
  el.className = 'lat-pill';
  el.setAttribute('data-shape', p.shape);
  if (p.c) el.setAttribute('data-c', p.c);
  if (p.size) el.setAttribute('data-size', p.size);
  if (!p.value) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', p.icon.replace(/-/g, ' '));
  }
  if (icon) el.appendChild(icon);
  if (p.value) el.appendChild(doc.createTextNode(p.value));
  return el;
}

/**
 * What may come next after `text` (a pill with its words so far, e.g. `{LIVE, tag}`) — every
 * word the kernel accepts added before the closing brace, shape then color then size, and the
 * first axis with any. The Studio's autocomplete offers that axis.
 * @returns {{ next: string, words: {label: string, axis: string}[] } | null}
 */
function nextWords(text) {
  if (!resolve(text)) return null;
  const words = [];
  for (const [axis, list] of [['shape', SHAPES], ['color', COLORS], ['size', SIZES]]) {
    for (const label of list) if (resolve(withWord(text, label))) words.push({ label, axis });
  }
  return words.length ? { next: words[0].axis, words } : null;
}

/** `{LIVE, tag}` with one more word before its closing brace: `{LIVE, tag, c4}`. */
function withWord(text, word) {
  const close = text.lastIndexOf('}');
  return `${text.slice(0, close).trimEnd()}, ${word}${text.slice(close)}`;
}

module.exports = {
  resolve, diagnose, attempt, iconProblem, iconSpelling, pillHtml, pillElement, nextWords, withWord,
  SHAPES, COLORS, SIZES, RESERVED_MARKERS,
};
