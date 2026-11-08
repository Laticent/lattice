/**
 * overflow-corpus-ratchet — the pure verdict behind tools/check-overflow-corpus.js.
 *
 * Split out so the rule can be tested without a browser (test/unit/tools/overflow-corpus-ratchet.test.js).
 *
 * THE BASELINE NAMES THE DECKS IT SWEPT (`swept`), not only how many (`decksSwept`). Before #2060 a
 * deck missing from `decks` was read as clean, so a deck that entered the corpus after the last bless
 * had no floor at all: `examples/position-marks.md` was born clipping three pages and surfaced, on the
 * first night that measured it, as a "regression against baseline: clean". With a `swept` list, a deck
 * outside it is UNFLOORED. It fails by name, clean or not, until a bless records it. A legacy baseline
 * with no `swept` keeps the old reading, and the caller says so.
 */

function judge(rows, base) {
  const swept = Array.isArray(base.swept) ? new Set(base.swept) : null;
  const errors = rows.filter((r) => r.error);
  const regressions = [];
  const improvements = [];
  const unfloored = [];
  for (const r of rows) {
    if (r.error) continue;
    if (swept && !swept.has(r.deck)) { unfloored.push(r.deck); continue; }
    const was = base.decks?.[r.deck] || [];
    const added = r.pages.filter((p) => !was.includes(p));
    const gone = was.filter((p) => !r.pages.includes(p));
    if (added.length) regressions.push({ deck: r.deck, added, now: r.pages, was });
    else if (gone.length) improvements.push({ deck: r.deck, gone });
  }
  const clipped = rows.filter((r) => !r.error && r.pages.length);
  const total = clipped.reduce((n, r) => n + r.pages.length, 0);
  return {
    ok: !regressions.length && !errors.length && !unfloored.length,
    regressions, improvements, unfloored, errors, clipped, total, legacy: !swept,
  };
}

function blessed(rows) {
  const clipped = rows.filter((r) => r.pages.length);
  return {
    $comment: 'Ratchet for tools/check-overflow-corpus.js — pages the export CLIPS, per deck. Lower is better; re-bless only with the PR that earns it. `swept` names every deck the blessing run covered: a deck in `swept` but absent from `decks` is clean; a deck absent from `swept` has no floor and fails by name.',
    totalSlides: clipped.reduce((n, r) => n + r.pages.length, 0),
    decksSwept: rows.length,
    swept: rows.map((r) => r.deck).sort(),
    decks: Object.fromEntries(clipped.map((r) => [r.deck, r.pages])),
  };
}

/** One line for the nightly report: cost per deck, so a slowdown shows before the job ceiling does. */
function costLine({ decks, seconds, jobs }) {
  return `⏱ sweep cost — ${decks} decks in ${Math.round(seconds)}s at ${jobs} workers: ${(seconds / Math.max(1, decks)).toFixed(2)} s/deck`;
}

module.exports = { judge, blessed, costLine };
