/**
 * Does this table's FIRST COLUMN hold row labels? — the one bet base cannot make.
 *
 * `lib/base/base.elements.css` declines first-column emphasis on the universal
 * table on purpose, and its reasoning is the spec for this module: giving
 * `td:first-child` weight and heading ink is right when the first column names
 * the row, and wrong on "a leading ordinal (`| # | Finding |`), a status tick, a
 * citation index, or a single-column table — where every cell would render
 * bold". A component that knows its first column is a label says so itself.
 *
 * The `table` component means ANY table, so it cannot know per component the way
 * `obligation-matrix` does — it has to decide per table. This is that decision,
 * kept pure and fs-free so the markdown-it token path and the DOM path reach the
 * same verdict on the same table (HARD RULE #1). Neither path may re-implement
 * it (HARD RULE #7's rule, applied to the same class of problem).
 *
 * WHAT IT IS NOT. It is not a confidence score and it does not guess. It turns
 * the bet OFF on four enumerated shapes and leaves it ON otherwise, because the
 * cost is asymmetric: a false OFF loses emphasis the author can restore with
 * `row-label`, while a false ON bolds a column of numbers AND silently swallows
 * their `**bold**` (the emphasis sets the same property pair as `section
 * strong`). Both are recoverable only because `row-label` / `no-row-label`
 * overrule this module entirely — the author always has the last word.
 *
 * MEASURED, and the SCOPE is part of the measurement: every markdown table under
 * `examples/`, `exemplars/`, `test/integration/baseline-decks/` and
 * `lib/components/` — 227 of them, of which 203 carry a named label header, 22 an
 * empty header cell over a label column, and 2 resolve OFF. Widen the scope (to
 * all of `lib/`, say) and the totals move, because prose docs carry tables too;
 * the corpus test in test/unit/core/table-row-label.test.js walks exactly these
 * four roots, which is what makes the number re-derivable rather than folklore.
 *
 * THE TWO OFF CASES ARE DELIBERATE — the demonstration slides in
 * examples/universal-table.md, where a year column shows the rule declining and
 * `row-label` forces it back on over the same data. They are the corpus's only
 * negative cases. Re-derive after changing a deck; an earlier draft of this
 * block still said "224 … ZERO match any OFF shape" after the same commit had
 * added those slides, which is how a measured number rots into a claim.
 *
 * See engineering/decisions/2026-09-20-table-component.md.
 */

/** The class stamped on a `<table>` whose first column IS a row label. */
const ROW_LABEL_CLASS = 'lat-row-label';

/**
 * A header cell that names an INDEX rather than a subject. Anchored and
 * whole-string: `Reference` is a subject, `Ref.` is an index. Deliberately
 * short and closed — a header we do not recognize means "a label", which is the
 * ON arm, and that is the safe direction (see the asymmetry note above).
 */
const INDEX_HEADER = /^(?:#|№|no\.?|num(?:ber)?|idx|index|ref\.?|id|item\s*#|line\s*#|s\/?n)$/i;

/**
 * A cell that is only a number — a count, a money figure, a percentage, a year,
 * a ratio, a dimension. Markdown emphasis and inline-code fences are stripped
 * before the test, so `` `42` `` and `**42**` read as numeric like `42` does.
 */
const NUMERIC_CELL = /^[-+±~<>=]?\s*[$€£¥]?\d[\d\s.,:_/×x−–-]*\s*(?:%|pp|bps|[a-z]{1,4})?$/i;

/** A cell that is only a state marker — `[x]` `[-]` `[ ]` `[/]`, nothing else. */
const MARKER_CELL = /^\[[x\-/ ]\]$/i;

/** An em-dash / en-dash / bullet placeholder standing in for "no value". */
const PLACEHOLDER_CELL = /^(?:[—–-]+|n\/?a|none|tbd|\.{3}|…)$/i;

/**
 * Normalize a cell to the text the tests above expect: drop inline-code fences
 * and markdown emphasis marks, collapse whitespace. Both call sites hand us
 * source-ish text (markdown inline, or a DOM `textContent`), so neither has
 * already done this.
 */
function cellText(raw) {
  return String(raw == null ? '' : raw)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_]{1,3}(?=\S)([\s\S]*?\S)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The verdict for ONE table.
 *
 * @param {object} table
 * @param {string[]} table.headers      header-row cells, in order (may be empty)
 * @param {string[]} table.firstColumn  the first cell of each BODY row, in order
 * @returns {boolean} true when the first column should read as a row label
 */
function firstColumnIsRowLabel({ headers = [], firstColumn = [] } = {}) {
  // A single-column table has no "first column" to distinguish — every cell
  // would render bold, which is base.elements.css's fourth counterexample.
  // Measured off the HEADER count, not the body: a ragged body row is a broken
  // table, and guessing the shape from the widest row would make the verdict
  // depend on which row happens to be malformed.
  if (headers.length < 2) return false;

  // An index column names nothing. Only the header can say so — the cells are
  // numbers either way, and a numeric first column is already caught below.
  if (INDEX_HEADER.test(cellText(headers[0]))) return false;

  // Nothing to judge. Not an error: a header-only table renders fine, it just
  // has no body cells to emphasize.
  const cells = firstColumn.map(cellText).filter((c) => c !== '');
  if (cells.length === 0) return false;

  // A column of pure data, or of bare status marks, is not a set of labels.
  // Placeholders are ignored rather than counted either way, so one `—` in an
  // otherwise textual column does not flip the verdict, and a column of nothing
  // BUT placeholders falls out through the `cells.length` guard above.
  const judged = cells.filter((c) => !PLACEHOLDER_CELL.test(c));
  if (judged.length === 0) return false;
  if (judged.every((c) => NUMERIC_CELL.test(c))) return false;
  if (judged.every((c) => MARKER_CELL.test(c))) return false;

  return true;
}

/**
 * Resolve the verdict against the slide's own class tokens, which overrule it.
 *
 * @param {string[]} classTokens  the section's `_class` tokens
 * @param {object} table          as `firstColumnIsRowLabel`
 * @returns {boolean}
 */
function resolveRowLabel(classTokens, table) {
  const tokens = Array.isArray(classTokens) ? classTokens : [];
  // Explicit beats measured, in both directions, and `no-row-label` wins a slide
  // carrying both — the opt-OUT is the one an author reaches for after seeing the
  // wrong thing, so a stray `row-label` beside it must not win.
  //
  // PER-SLIDE ONLY, and the caller is why: the markdown-it rule that feeds this
  // runs BEFORE `deck_class_propagate`, so a deck-level `class: no-row-label` has
  // not reached the section yet and is silently ignored. Moving the rule later is
  // not free — it would also land after the badge plugins, which replace a cell's
  // children with an `html_inline` token that the text extractor skips, changing
  // what this function reads. Documented as per-slide in base.docs.md instead.
  if (tokens.includes('no-row-label')) return false;
  if (tokens.includes('row-label')) return true;
  return firstColumnIsRowLabel(table);
}

module.exports = {
  ROW_LABEL_CLASS,
  INDEX_HEADER,
  NUMERIC_CELL,
  MARKER_CELL,
  PLACEHOLDER_CELL,
  cellText,
  firstColumnIsRowLabel,
  resolveRowLabel,
};
