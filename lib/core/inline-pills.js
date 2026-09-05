/**
 * INLINE PILLS — `{LABEL}` in inline code becomes a shaped, colored pill.
 *
 *   `{LIVE}`                 → capsule pill, accent
 *   `{BETA}:tag:c4`          → sharp tag, categorical slot 4
 *   `{1}:circle:c5`          → circular badge
 *   `{DECIDE}:diamond`       `{STEP 2}:chevron-right`   `{CRITICAL}:tag-bordered`
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
 * `((X))` circle. Measured against all 12,493 single-backtick spans in this
 * repo, that grammar captures 147 of them that the author meant literally:
 *
 *   118  decks and docs QUOTING our own state markers — `[x]` `[-]` `[ ]` `[/]`.
 *        (The functional markers are bare at a bullet's start and were never at
 *        risk; it is the slides TEACHING the syntax that break. One of them,
 *        checklist.gallery.md:107, says "`[?]` renders as literal text" — which
 *        under that grammar would have rendered as a pill.)
 *    29  ordinary code prose: `[data-mark]`, `{ ok, scene }`,
 *        `(slides, registry, lensId)`, `(0,2,2)`.
 *
 * The ADR ruled out `:` `@` `#` `!` as sigils for exactly this reason — "inline
 * code routinely starts with `:root`, `@media`" — and never ran the same test on
 * brackets, which are the most loaded characters in a repo whose decks are about
 * code. One brace pair plus the guard below measures ZERO collisions repo-wide.
 * The eight shape NAMES from the ADR all survive; only the spelling moved from
 * bracket geometry to a modifier word.
 */

/** Shape names — the ADR's map, unchanged; `pill` is what a bare `{X}` gets. */
const SHAPES = Object.freeze([
  'pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond',
]);

/** Ordinal color slots. NOT color names: `--cat-blue` is sky blue on indaco and
 * deep red on burgundy, so a `:blue` modifier would lie to a portable deck. The ADR
 * proposed `:c1`–`:c8` mapping onto `--cat-blue`…`--cat-mauve`; HARD RULE #11 has since
 * retired those names for the role-based `--cat-N-fill` / `--cat-N-mark` set, and there
 * are TWELVE of them, so the slots run `:c1`–`:c12` and land on a token that already
 * exists rather than one the ADR named. */
const COLORS = Object.freeze(
  Array.from({ length: 12 }, (_, i) => `c${i + 1}`),
);
const SIZES = Object.freeze(['sm', 'md', 'lg']);

/**
 * A pill LABEL is one word, two at most — the budget `lib/authoring/prose-budgets.js`
 * already sets for this slot. That is also what separates a pill from a JS object
 * literal an author wrote as code: every `{ ok, scene }` / `{ canonical: true }` in
 * this repo either pads its braces or carries a comma. Requiring the value to be
 * trimmed and comma-free is what takes the collision count to zero, and it costs a
 * pill nothing it was ever allowed to hold.
 */
function isLabel(v) {
  return v.length > 0 && v === v.trim() && !v.includes(',');
}

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
const RESERVED_MARKERS = new Set(['x', '-', '/', ' ']);

/**
 * Parse one code_inline token's text.
 * @returns {{value:string, mods:string[]}|null} null = leave the `<code>` literal.
 */
function parse(text) {
  if (typeof text !== 'string' || text.length < 3) return null;
  if (text.charCodeAt(0) !== 0x7b /* { */) return null; // O(1) reject; literals never allocate
  const close = text.indexOf('}', 1);
  if (close < 1) return null;
  const value = text.slice(1, close);
  if (RESERVED_MARKERS.has(value)) return null;
  if (!isLabel(value)) return null;
  const tail = text.slice(close + 1);
  if (tail && tail[0] !== ':') return null;
  return { value, mods: tail ? tail.slice(1).split(':') : [] };
}

/**
 * Sort modifiers into their axes, so `:tag:c4` and `:c4:tag` are the same pill.
 * An UNRECOGNIZED or repeated modifier fails the whole thing back to literal
 * rather than being dropped: a silently ignored `:c9` renders a pill the author
 * did not ask for and cannot see is wrong, where a literal `<code>{X}:c9</code>`
 * on the slide is obvious in the first review pass. Same instinct as the ADR's
 * loud `??name??` for a missing variable — never guess, never silently drop.
 * @returns {{shape:string, c:string|null, size:string|null}|null}
 */
function resolveMods(mods) {
  let shape = null;
  let c = null;
  let size = null;
  for (const m of mods) {
    if (SHAPES.includes(m)) {
      if (shape) return null;
      shape = m;
    } else if (COLORS.includes(m)) {
      if (c) return null;
      c = m;
    } else if (SIZES.includes(m)) {
      if (size) return null;
      size = m;
    } else {
      return null;
    }
  }
  return { shape: shape || 'pill', c, size };
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/* Module scope so the literal is evaluated once rather than per call. Measured at
 * 164.6ns vs 159.1ns per call — V8 already caches the compiled pattern, so this is
 * hygiene, not a win: `esc` runs on the pill path only, 99 times across every markdown
 * file in the repo.
 *
 * The parser itself uses NO REGEX AT ALL, which is where the speed actually comes from:
 * ~6.1ns per span, measured over this repo's real distribution of 115,516 single-
 * backtick spans (three runs, 6.1/6.1/6.3). A 500-span deck costs about 3 microseconds,
 * which is dust beside mermaid and the render itself. `parse` rejects on one
 * `charCodeAt` before allocating anything, so the 99.9% of spans that are ordinary code
 * never reach a slice, a trim or a split — `test/unit/core/inline-pills.test.js` pins
 * that shape so an "improvement" cannot quietly reintroduce a regex or move the reject
 * after the first allocation. */
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
function resolve(text) {
  const parsed = parse(text);
  if (!parsed) return null;
  const axes = resolveMods(parsed.mods);
  if (!axes) return null;
  return { value: parsed.value, ...axes };
}

/** Render to an HTML string — the markdown-it path, which emits `html_inline`. */
function pillHtml(text) {
  const p = resolve(text);
  if (!p) return null;
  const attrs = ['class="lat-pill"', `data-shape="${p.shape}"`];
  if (p.c) attrs.push(`data-c="${p.c}"`);
  if (p.size) attrs.push(`data-size="${p.size}"`);
  return `<span ${attrs.join(' ')}>${esc(p.value)}</span>`;
}

/**
 * Build the pill as a real element — the runtime's DOM path. `textContent`, never
 * markup, so an author's label cannot become nodes however hostile it is.
 * @param {Document} doc
 */
function pillElement(doc, text) {
  const p = resolve(text);
  if (!p) return null;
  const el = doc.createElement('span');
  el.className = 'lat-pill';
  el.setAttribute('data-shape', p.shape);
  if (p.c) el.setAttribute('data-c', p.c);
  if (p.size) el.setAttribute('data-size', p.size);
  el.textContent = p.value;
  return el;
}

module.exports = {
  parse, resolveMods, resolve, pillHtml, pillElement, isLabel,
  SHAPES, COLORS, SIZES, RESERVED_MARKERS,
};
