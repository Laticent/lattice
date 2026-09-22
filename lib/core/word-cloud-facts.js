/**
 * What a word cloud is FOR, in numbers — so narration can read the rank instead of
 * reciting the counts.
 *
 * ── THE COMPONENT'S OWN DOCS DECIDE THIS ──────────────────────────────────────
 *
 * `word-cloud.docs.md` is unusually explicit that the exact weights are not the
 * read:
 *
 *   "Word size encodes frequency or weight; not a precise data viz."
 *   "the eye reads 'biggest' and 'second biggest' before any precise ratio.
 *    Reach for word-cloud when the RANK matters more than the COUNT."
 *   "The cloud lands what the corpus is about; the silhouette and the biggest
 *    words are the read."
 *
 * And under "When NOT to use": "If the audience needs to know that 'manifest' is
 * 1.6x 'function', the spiral packing actively misleads."
 *
 * So the narration that shipped — "time-to-value, five. security, four.
 * onboarding, four. pricing, three. …", nine flat sentences of rendering inputs —
 * was not merely dull. It read the component as the precise data viz its own docs
 * say it is not, and on the 20-term stress-test slide it read twenty numbers aloud
 * and explained nothing. This kernel computes the rank facts instead: who leads,
 * by how much, how concentrated the head is, and where the tail starts.
 *
 * ── WHY A KERNEL RATHER THAN NARRATION-LOCAL ARITHMETIC ───────────────────────
 *
 * `word-cloud.transform.js` builds the SVG `<desc>` a screen reader hears, and it
 * has the same flat shape ("Sized by frequency, largest first — a, b, c, …"). It
 * is deliberately NOT changed in this pass — that would move rendered bytes for a
 * reason nobody asked for — but it is the second caller this kernel exists to
 * serve, and putting the derivation in `lib/core` is what makes improving it later
 * a one-line change rather than a second implementation. (HARD RULE #1.)
 */

/**
 * TIERS, not a sorted list. Equal weights are one rank, and saying so is the
 * difference between "security four, onboarding four" and "security and
 * onboarding at four each" — the second is how a person describes a tie and the
 * first is how a spreadsheet does.
 *
 * Ordering inside a tier is SOURCE ORDER, preserved by a stable sort, because the
 * author's order is the only signal available and the packer uses it too.
 */
function tiersOf(items) {
  const live = items.filter((w) => Number.isFinite(w.weight));
  const sorted = live
    .map((w, i) => ({ ...w, i }))
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  const tiers = [];
  for (const w of sorted) {
    const last = tiers[tiers.length - 1];
    if (last && last.weight === w.weight) last.words.push(w.text);
    else tiers.push({ weight: w.weight, words: [w.text] });
  }
  return tiers;
}

/**
 * Every derived fact, from `[{ text, weight }]`.
 *
 * NON-FINITE WEIGHTS ARE EXCLUDED FROM THE ARITHMETIC AND COUNTED SEPARATELY.
 * `word-cloud.docs.md` names this as the component's real hazard: "a non-numeric
 * or non-finite weight (e.g. a typo) is silently mapped to the MIDDLE of the
 * scale rather than erroring. That silence is the actual hazard." Folding a typo
 * into a share calculation would make narration state a proportion the slide does
 * not show, so they are held out — and `unweighted` lets a caller mention the
 * words without pricing them.
 */
function summarizeCloud(items) {
  const list = Array.isArray(items) ? items : [];
  const tiers = tiersOf(list);
  const weighted = tiers.reduce((n, t) => n + t.words.length, 0);
  const unweighted = list.filter((w) => !Number.isFinite(w.weight)).map((w) => w.text);
  const total = tiers.reduce((sum, t) => sum + t.weight * t.words.length, 0);

  const top = tiers[0] || null;
  const second = tiers[1] || null;

  // A SHARED lead is not a lead. `focal`'s whole claim is that "one single term
  // dominates"; if three words tie at the top there is no single biggest word,
  // the picture shows three equals, and a narrator saying "X leads" would name
  // one arbitrarily. Callers check `soleLeader` before using `leader`.
  const soleLeader = !!top && top.words.length === 1;

  // Share of total weight carried by the top tier and by the top three WORDS —
  // the concentration read, and the one number that survives the docs' warning
  // about precise ratios, because it describes the HEAD against the whole rather
  // than one word against another.
  const headWords = [];
  for (const t of tiers) {
    for (const w of t.words) {
      if (headWords.length < 3) headWords.push({ text: w, weight: t.weight });
    }
    if (headWords.length >= 3) break;
  }
  const headWeight = headWords.reduce((n, w) => n + w.weight, 0);

  const bottom = tiers[tiers.length - 1] || null;

  return {
    count: weighted,
    unweighted,
    tiers,
    total,
    leader: soleLeader ? top.words[0] : null,
    leaderWeight: top ? top.weight : null,
    soleLeader,
    topTier: top,
    secondTier: second,
    /** How far clear the top tier is of the next — in weight, and as a ratio. */
    leadMargin: top && second ? top.weight - second.weight : null,
    leadRatio: top && second && second.weight > 0 ? top.weight / second.weight : null,
    headWords,
    headShare: total > 0 ? headWeight / total : null,
    /** The quietest tier — the "mentioned once" tail a presenter waves at rather than reads. */
    tailTier: bottom && tiers.length > 1 ? bottom : null,
    /** Every word at or below the bottom tier's weight, for a caller that wants to name the tail. */
    tailWords: bottom && tiers.length > 1 ? bottom.words : [],
  };
}

module.exports = { summarizeCloud, tiersOf };
