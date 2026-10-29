/**
 * ratchet — the fit harness's nightly guard: per component, per box and venue, the clipped and
 * lost-content slides of the split that SHIPS today, compared against a committed baseline.
 *
 * It counts the `structural` arm only, because that is the engine's real export path; the
 * policy arms are simulated until P2 builds one (2026-10-28-fit-everywhere-model.md §9). It
 * complements `tools/check-overflow-corpus.js`, which renders every shipped deck at its own
 * size: this one renders each component's gallery at the boxes and venues its author did not
 * write it for, and also counts lost text.
 *
 * A count may only go down. A source the baseline does not name starts at zero, so a new
 * component that clips is named on its first night.
 *
 * NOT SCORED IS A RESULT, NOT A SILENCE. A gallery whose renders fail, or whose markup the
 * harness rejects, produces no rows. Comparing only the rows a run produced would read such a
 * run as clean: every render failing would report "no count rose". So the caller passes the
 * cells it EXPECTED (every gallery × box × venue), and a cell with no rows is `unscored`. The
 * baseline records the cells already unscored when it was blessed (the diagram gallery's split
 * emits broken markup), so they stay visible; a cell that is newly unscored fails.
 *
 * Pure and fs-free, so it is unit-tested.
 */

const clipsContent = (r) => r.pages.some((p) => !p.fits && p.cut !== 'footer');

/**
 * { [src]: { [`${size}@${venue}`]: { clip, lost } | { unscored: true } } } over the original
 * slides of one arm. `expected` is [src, cell] pairs; an expected cell with no rows is unscored.
 */
function tally(rows, expected = [], arm = 'structural') {
  const out = {};
  for (const r of rows) {
    if (r.arm !== arm || r.variant !== 'orig') continue;
    const cell = `${r.size}@${r.venue}`;
    const t = ((out[r.src] ??= {})[cell] ??= { clip: 0, lost: 0 });
    if (clipsContent(r)) t.clip++;
    if (r.lost) t.lost++;
  }
  for (const [src, cell] of expected) (out[src] ??= {})[cell] ??= { unscored: true };
  return out;
}

/**
 * regressions: a count above its baseline, a new source that clips or loses, or a cell scored
 * at bless time that this run did not score. wins: a count that fell. scored: a cell unscored
 * at bless time that this run scored (bless to start tracking it).
 */
function compare(baseline, now) {
  const regressions = [];
  const wins = [];
  const scored = [];
  for (const [src, cells] of Object.entries(now)) {
    for (const [cell, t] of Object.entries(cells)) {
      const b = baseline[src]?.[cell];
      if (t.unscored) {
        if (!b?.unscored) regressions.push({ src, cell, metric: 'unscored' });
        continue;
      }
      if (b?.unscored) {
        scored.push({ src, cell, now: t });
        continue;
      }
      const base = b ?? { clip: 0, lost: 0 };
      for (const k of ['clip', 'lost']) {
        if (t[k] > base[k]) regressions.push({ src, cell, metric: k, was: base[k], now: t[k] });
        else if (t[k] < base[k]) wins.push({ src, cell, metric: k, was: base[k], now: t[k] });
      }
    }
  }
  const cells = Object.values(now).flatMap((c) => Object.values(c));
  const nothingScored = cells.length === 0 || cells.every((t) => t.unscored);
  return { regressions, wins, scored, nothingScored };
}

/** The report lines, each with the marker the nightly workflow reads; the verdict line first. */
function format({ regressions, wins, scored = [], nothingScored = false }) {
  const line = (x) => (x.metric === 'unscored' ? `- ${x.src} at ${x.cell}: NOT SCORED (no rows; render failed or rejected)` : `- ${x.src} at ${x.cell}: ${x.metric} ${x.was} -> ${x.now}`);
  const out = [];
  const unscored = regressions.filter((x) => x.metric === 'unscored');
  const rose = regressions.filter((x) => x.metric !== 'unscored');
  if (nothingScored) out.push('fit ratchet: NOTHING SCORED — no verdict; this run measured no gallery');
  else if (unscored.length) out.push(`fit ratchet: ${unscored.length} cell(s) NOT SCORED that the baseline scores — no verdict for them`);
  if (rose.length) out.push(`fit ratchet: ${rose.length} count(s) ROSE above the baseline`);
  if (!nothingScored && !regressions.length) out.push('fit ratchet: no count rose above the baseline');
  out.push(...unscored.map(line), ...rose.map(line));
  if (wins.length) out.push(`fit ratchet: ${wins.length} count(s) fell; bank them with --bless`, ...wins.map(line));
  if (scored.length) out.push(`fit ratchet: ${scored.length} cell(s) scored for the first time; bless to start tracking them`, ...scored.map((x) => `- ${x.src} at ${x.cell}: clip ${x.now.clip}, lost ${x.now.lost}`));
  return out.join('\n');
}

/** Exit status for a run: 0 clean, 1 a count rose, 3 not (fully) scored. */
function exitCode({ regressions, nothingScored }) {
  if (nothingScored || regressions.some((x) => x.metric === 'unscored')) return 3;
  return regressions.length ? 1 : 0;
}

module.exports = { tally, compare, format, exitCode, clipsContent };
