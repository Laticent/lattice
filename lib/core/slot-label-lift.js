/**
 * Slot-label lift — for named-slot layouts (decision, compare-prose,
 * …), each top-level card's leading text is *structurally*
 * the slot label, not editorial emphasis. Wrap it in the engine's own label
 * element, `<span class="lat-label">`, so the corner-tag CSS triggers without
 * authors typing anything.
 *
 * BOLD IS EMPHASIS, NEVER STRUCTURE (R4, W3 of
 * engineering/decisions/2026-11-19-deterministic-authoring-audit.md). The label
 * used to be a `<strong>`, and an item that already started with `**…**` was left
 * alone, so the author's bold run BECAME the label: `- **A** rest` turned A into the
 * tag and left "rest" outside it. Now the whole lead is the label, whatever inline
 * markup it holds; a `<strong>` inside it is the author's emphasis and nothing more.
 *
 * Input: the inner HTML of a single <li>, as produced by the markdown
 * pipeline. The expected shape after markdown-it parsing is:
 *
 *   <p>Lead text</p><ul>...</ul>           // explicit <p> wrapper
 *   Lead text<ul>...</ul>                  // no <p> when inline-only
 *
 * Behavior (this string kernel; the markdown-it lift and the runtime mirror label every top-level
 * lead on a slot layout, nested body or not, except the NESTED_ONLY newcomers below):
 *   - If there's no nested ul/ol body, return input unchanged.
 *   - If the lead is empty/whitespace, return input unchanged.
 *   - If the lead is ALREADY one `<span class="lat-label">…</span>`, return it
 *     unwrapped from any <p> but otherwise intact (idempotent — running twice
 *     yields the same result).
 *   - Otherwise, wrap the trimmed lead in `<span class="lat-label">…</span>`.
 *
 * Inline markup inside the lead (strong/em/code/etc.) stays nested inside the
 * label; that matches the visual intent (the whole label carries the heading style).
 *
 * `opts.chipTail` (used by `actors`): a TRAILING run of inline <code>
 * chips is metadata (the actor-name pill), not heading text — it is kept
 * as a sibling AFTER the label so layout CSS targeting
 * `li > code` (grid placement, pill chrome) still matches.
 */
const LABEL_CLASS = 'lat-label';
const LABEL_OPEN = `<span class="${LABEL_CLASS}">`;
const LABEL_CLOSE = '</span>';

function liftSlotLabel(liInner, opts = {}) {
  // Match `<ul>` or `<ol>` with optional attributes (e.g. <ol start="2">).
  const m = liInner.match(/^([\s\S]*?)(<(?:ul|ol)(?:\s[^>]*)?>[\s\S]*)$/);
  if (!m) return liInner;
  let lead = m[1].trim();
  const body = m[2];
  if (!lead) return liInner;
  const pMatch = lead.match(/^<p>([\s\S]*)<\/p>$/);
  if (pMatch) lead = pMatch[1].trim();
  // For chip-tail layouts, split off a trailing run of <code> chips (with
  // surrounding whitespace) so they remain siblings of the label.
  let tail = '';
  if (opts.chipTail) {
    // Trailing run of `<code>…</code>` chips. The chip BODY is written as the
    // UNROLLED `(?:[^<]|<(?!\/code>))*` — every char that is not the start of the
    // closing `</code>` — rather than the lazy `[\s\S]*?`: it matches the same
    // language (content up to the next `</code>`) but its two alternatives are
    // disjoint (`[^<]` vs. a `<` not beginning `</code>`), so each chip is
    // unambiguously delimited and the `+` run can't backtrack over the body — the
    // nested-quantifier shape (a lazy `*?` under a `+`) a static analyzer (CodeQL)
    // flags as ReDoS is gone. (The outer `\s*(?:…)+$` could in isolation cost O(n²)
    // on a long PURE-whitespace prefix, but `lead` is already `.trim()`-ed above, so
    // that prefix never survives to here — the real input is a bounded `<li>` label.)
    const codeTail = lead.match(/(\s*(?:<code\b[^>]*>(?:[^<]|<(?!\/code>))*<\/code>\s*)+)$/);
    if (codeTail && codeTail.index > 0) {
      tail = codeTail[1];
      lead = lead.slice(0, codeTail.index).trim();
    }
  }
  if (!lead) return liInner;
  if (isOneLabel(lead)) return `${lead}${tail}${body}`;
  return `${LABEL_OPEN}${lead}${LABEL_CLOSE}${tail}${body}`;
}

/**
 * Walk `<span …>` / `</span>` tags from `from`; returns the end offset of the tag that closes the
 * span opened at `from` (depth back to 0), or -1. Hand-scanned with indexOf: no regex to backtrack.
 */
function spanCloseEnd(html, from) {
  let depth = 0;
  let at = from;
  for (;;) {
    const lt = html.indexOf('<', at);
    if (lt < 0) return -1;
    const close = html.startsWith('</span', lt);
    const open = !close && html.startsWith('<span', lt) && /[\s>]/.test(html[lt + 5] || '');
    const gt = html.indexOf('>', lt);
    if (gt < 0) return -1;
    if (open) depth++;
    else if (close) depth--;
    if ((open || close) && depth === 0) return gt + 1;
    at = gt + 1;
  }
}

/**
 * The FIRST engine label in `html`, read as a balanced element: `{ start, end, inner }` (offsets
 * of the whole `<span class="lat-label">…</span>`, and its inner HTML), or null. Readers that
 * name a member (split titles, carousel points, the next-card pointer) take the label from here,
 * never from a `<strong>`: an author's bold is emphasis, not a name (R4, W3).
 */
function findLabel(html) {
  const start = String(html || '').indexOf(LABEL_OPEN);
  if (start < 0) return null;
  const end = spanCloseEnd(html, start);
  if (end < 0) return null;
  return { start, end, inner: html.slice(start + LABEL_OPEN.length, end - LABEL_CLOSE.length) };
}

/** True when `html` is exactly one engine label span (no sibling after its close). */
function isOneLabel(html) {
  if (!html.startsWith(LABEL_OPEN) || !html.endsWith(LABEL_CLOSE)) return false;
  // Walk the span nesting so `<span class="lat-label">a</span> b <span>c</span>` is not one label.
  return spanCloseEnd(html, 0) === html.length;
}

/**
 * The layouts whose top-level list items carry a named slot label — the
 * canonical list, so the two render paths can't disagree about WHICH layouts
 * lift. It used to be written twice (a class regex in the markdown-it plugin, a
 * selector string in lib/runtime/index.js) and they drifted: `premise` and
 * `q-and-a` were added to the plugin only, so on a Marp-rendered deck a premise
 * ledger's row terms came out as plain text with no corner tag (#1256).
 */
const SLOT_LAYOUTS = Object.freeze([
  'compare-prose', 'decision', 'split-panel', 'split-compare', 'statute-stack',
  'regulatory-update', 'authority-chain', 'redline', 'timeline',
  'actors', 'kpi', 'stats', 'q-and-a', 'premise',
  // W3 (bold is emphasis, never structure): these two read their row title / action eyebrow from
  // the author's `**bold**` until 2026-11; they take it from the lift now.
  'inventory', 'citation-card',
]);

/**
 * `list-steps` staged-flow variants that lift. These modifier words are generic
 * enough to appear on unrelated slides, so they only ever lift on a `list-steps`
 * host — never on any section that happens to carry the word.
 */
const LIST_STEPS_LIFT_VARIANTS = Object.freeze(['chevron', 'converge', 'ghost']);

/**
 * Every HOST-SCOPED lift: a variant word that lifts only on its host layout. `list-steps` above,
 * and `math matrix` (and `math matrix decompose`), whose legend rows are `- shape` with the value
 * nested under it: the row's label was its `**bold**` lead until W3 (bold is emphasis, never
 * structure). The plain `math` legend (`- $X$ — design matrix`) is prose and does not lift.
 */
const HOST_VARIANT_LIFTS = Object.freeze({
  'list-steps': LIST_STEPS_LIFT_VARIANTS,
  math: Object.freeze(['matrix']),
});

const word = (w) => new RegExp(`(?<![\\w-])${w}(?![\\w-])`);

/** Class-string test for the markdown-it path. `-` is excluded from the word
 *  boundaries so `timeline` can't match inside the `timeline-list` chart class. */
function slotLayoutPattern() {
  return new RegExp(`(?<![\\w-])(${SLOT_LAYOUTS.join('|')})(?![\\w-])`);
}

/** True when a slide with this class string lifts its list leads (whole-token matches). */
function liftsOnClass(klass) {
  const k = String(klass || '');
  if (slotLayoutPattern().test(k)) return true;
  return Object.entries(HOST_VARIANT_LIFTS).some(([host, vs]) => word(host).test(k) && vs.some((v) => word(v).test(k)));
}

/**
 * Lift members that label an item ONLY when it has a nested body under it. These three read a bold
 * lead as their title until W3, so an un-migrated `- **Lead.** detail` row (a deck outside the repo,
 * an agent's habit) must degrade to body text with a bold word rather than turn into one long title.
 * Every other lift layout labels every top-level lead, as it always did (a `kpi` value may stand
 * alone). The kernel's own `liftSlotLabel` already requires a nested body for every layout.
 */
const NESTED_ONLY = Object.freeze(['inventory', 'citation-card']);
function nestedOnlyOnClass(klass) {
  const k = String(klass || '');
  return NESTED_ONLY.some((n) => word(n).test(k)) || (word('math').test(k) && word('matrix').test(k));
}
/** The same set as a CSS selector, for the runtime path. */
function nestedOnlySelector() {
  return [...NESTED_ONLY.map((n) => `section.${n}`), 'section.math.matrix'].join(', ');
}

/** The equivalent CSS selector list for the live-DOM (runtime) path. */
function slotLayoutSelector() {
  return [
    ...SLOT_LAYOUTS.map((n) => `section.${n}`),
    ...Object.entries(HOST_VARIANT_LIFTS).flatMap(([host, vs]) => vs.map((v) => `section.${host}.${v}`)),
  ].join(', ');
}

module.exports = {
  liftSlotLabel,
  findLabel,
  LABEL_CLASS,
  SLOT_LAYOUTS,
  LIST_STEPS_LIFT_VARIANTS,
  HOST_VARIANT_LIFTS,
  liftsOnClass,
  nestedOnlyOnClass,
  nestedOnlySelector,
  slotLayoutPattern,
  slotLayoutSelector,
};
