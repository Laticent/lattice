/**
 * Slot-label lift — for named-slot layouts (decision, compare-prose,
 * …), each top-level card's leading text is *structurally*
 * the slot label, not editorial emphasis. Wrap it in <strong> so the
 * corner-tag CSS triggers without authors having to type `**Label**`.
 *
 * Input: the inner HTML of a single <li>, as produced by the markdown
 * pipeline. The expected shape after markdown-it parsing is:
 *
 *   <p>Lead text</p><ul>...</ul>           // explicit <p> wrapper
 *   Lead text<ul>...</ul>                  // no <p> when inline-only
 *
 * Behavior:
 *   - If there's no nested ul/ol body, return input unchanged.
 *   - If the lead is empty/whitespace, return input unchanged.
 *   - If the lead is ALREADY a single <strong>…</strong> span, return
 *     input with the lead unwrapped from any <p> but otherwise intact
 *     (idempotent — running twice yields the same result).
 *   - Otherwise, wrap the trimmed lead in <strong>…</strong>.
 *
 * Inline markup inside the lead (em/code/etc.) stays nested inside the
 * lifted <strong> by default; that matches the visual intent (the whole
 * label carries the heading style).
 *
 * `opts.chipTail` (used by `actors`): a TRAILING run of inline <code>
 * chips is metadata (the actor-name pill), not heading text — it is kept
 * as a sibling AFTER the lifted <strong> so layout CSS targeting
 * `li > code` (grid placement, pill chrome) still matches.
 */
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
  // surrounding whitespace) so they remain siblings of the <strong> label.
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
  if (/^<strong>[\s\S]*<\/strong>$/.test(lead)) return `${lead}${tail}${body}`;
  return `<strong>${lead}</strong>${tail}${body}`;
}

/**
 * The layouts whose top-level list items carry a named slot label — the
 * canonical list, so the two render paths can't disagree about WHICH layouts
 * lift. It used to be written twice (a class regex in the markdown-it plugin, a
 * selector string in lib/runtime/index.js) and they drifted: `premise` and
 * `q-and-a` were added to the plugin only, so on a Marp-rendered deck a premise
 * ledger's row terms came out as plain text with no corner tag (#1256).
 *
 * A LAYOUT BELONGS HERE WHEN ITS ITEM LABEL IS A HEADER. A header is bold because
 * the layout says so; an author typing `**…**` to get one is writing a declaration
 * the layout already owns, and the emphasis they meant as decoration has quietly
 * become load-bearing. Registering the layout is what makes the asterisks a NO-OP:
 * every path skips an li whose lead is already a `<strong>` (`liftSlotLabel` below,
 * the plugin, and the runtime each carry that guard), so a deck written the old way
 * renders identically while new decks write `- Label` and get the same header.
 *
 * `inventory` joined for exactly that reason. Without the asterisks its lead is a
 * bare text node in a `font-weight:400` li, so the entry name rendered as body
 * prose; the lift gives it the 700/display/`--fs-h3` treatment
 * `inventory.styles.css` has always described. It needed its authoring shape moved
 * from the inline `- **Lead.** body` to the nested `- Lead` / `  - body` at the same
 * time: the lift takes the whole lead up to the first nested list, so an inline body
 * has nothing to delimit it and would be swallowed into the label. That is not
 * hypothetical — it is what a bare `redline` row did, and why redline's decks moved
 * to the nested shape too.
 *
 * `matrix-2x2` AND `verdict-grid` DO NOT BELONG HERE, and the reason is the trap in
 * reading a `<strong>` COUNT as evidence. Both were registered in a first cut of
 * #2113 because dropping their asterisks left them with zero `<strong>` — but their
 * weight never came from the `<strong>`. It comes from the card li
 * (`font-weight:700` in both), so their labels were ALREADY bold from the layout,
 * which is the property this registry exists to give. Registering them was inert at
 * best: `verdict-grid` neutralises the element outright
 * (`verdict-grid.styles.css:92`, `strong { font-weight:inherit }`), and `matrix-2x2`
 * had no `strong` rule at all, so a lifted label fell through to
 * `base.elements.css`'s `section strong { font-weight:600 }` and came out one step
 * LIGHTER than the plain lead it replaced. The fix for `matrix-2x2` was the
 * inherit rule verdict-grid already had, not a place on this list. Count the pixels
 * a reader sees, not the elements in the tree.
 */
const SLOT_LAYOUTS = Object.freeze([
  'compare-prose', 'decision', 'split-panel', 'split-compare', 'statute-stack',
  'regulatory-update', 'authority-chain', 'redline', 'timeline', 'list-criteria',
  'actors', 'kpi', 'stats', 'q-and-a', 'premise',
  'inventory',
]);

/**
 * `list-steps` staged-flow variants that lift. These modifier words are generic
 * enough to appear on unrelated slides, so they only ever lift on a `list-steps`
 * host — never on any section that happens to carry the word.
 */
const LIST_STEPS_LIFT_VARIANTS = Object.freeze(['chevron', 'converge', 'ghost']);

/** Class-string test for the markdown-it path. `-` is excluded from the word
 *  boundaries so `timeline` can't match inside the `timeline-list` chart class. */
function slotLayoutPattern() {
  return new RegExp(`(?<![\\w-])(${SLOT_LAYOUTS.join('|')})(?![\\w-])`);
}

/** The equivalent CSS selector list for the live-DOM (runtime) path. */
function slotLayoutSelector() {
  return [
    ...SLOT_LAYOUTS.map((n) => `section.${n}`),
    ...LIST_STEPS_LIFT_VARIANTS.map((v) => `section.list-steps.${v}`),
  ].join(', ');
}

module.exports = {
  liftSlotLabel,
  SLOT_LAYOUTS,
  LIST_STEPS_LIFT_VARIANTS,
  slotLayoutPattern,
  slotLayoutSelector,
};
