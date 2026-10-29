/**
 * chains — score split policies on edit chains, not single edits: authored -> edited -> authored
 * (an edit and its undo), from the rows a fit-harness run already has. The single-edit jank
 * number cannot see a slide that an edit split and its undo leaves split, or a live plan that
 * ends unlike a fresh export (2026-10-28-fit-everywhere-model.md §9).
 *
 * Policies, each a decision per step from the slide's fit facts (does it fit whole; with 20% or
 * 30% spare):
 *   stateless  margin-20 every step: what a cold export decides.
 *   h2030      hysteresis-20-30: whole stays whole until it overflows; split rejoins at 30% spare.
 *   h2030+C    the same, but a split slide also rejoins when it fits at a content size no larger
 *              than the size at which it last fit whole (fix C).
 * and two starting points: seeded from the cold decision (fix A), or typed live (the slide was
 * written in the editor, so its first decision is "whole while it fits").
 *
 * Edits are ordered by content size relative to the authored slide, for fix C's "no larger than"
 * test: shorter text, one member fewer and 10% shorter text are smaller; 10% longer text, long
 * words, one member more and 40% longer text are larger.
 *
 * Pure and fs-free. The rows are fit-greedy rows (fit facts) and structural rows (split pages).
 */

const RANK = { shorter: -3, remove: -2, nudgeDown: -1, orig: 0, nudgeUp: 1, longwords: 1, add: 2, longer: 3 };
const EDITS = Object.keys(RANK).filter((k) => k !== 'orig');

const POLICIES = {
  stateless: { memory: false, historyRejoin: false, entry: 'm20' },
  h2030: { memory: true, historyRejoin: false, entry: 'm20' },
  'h2030+C': { memory: true, historyRejoin: true, entry: 'm20' },
  // No entry margin: the cold decision is plain fit, so a slide typed live and a fresh export
  // start from the same decision. Memory keeps only the rejoin band and fix C.
  'h0-30+C': { memory: true, historyRejoin: true, entry: 'fits' },
  'stateless-fit': { memory: false, historyRejoin: false, entry: 'fits' },
};

/** One policy's decisions over a chain of variants. `facts[v]` = { fits, m20, m30 }. */
function run(policy, chain, facts, start) {
  const p = POLICIES[policy];
  const out = [];
  let whole = null;
  let lastWholeRank = null;
  for (const v of chain) {
    const f = facts[v];
    if (!p.memory || whole === null) {
      whole = (start === 'live' && p.memory) || p.entry === 'fits' ? f.fits : f.fits && f.m20;
    } else if (whole) {
      whole = f.fits;
    } else {
      whole = f.m30 || (p.historyRejoin && f.fits && lastWholeRank !== null && RANK[v] <= lastWholeRank);
    }
    if (whole) lastWholeRank = Math.max(lastWholeRank ?? Number.NEGATIVE_INFINITY, RANK[v]);
    out.push(whole);
  }
  return out;
}

/**
 * Per cell (`size@venue`) and policy x start: the share of edit/undo chains where the undo
 * restores the authored page count, the share where the edit changes it, and the share where
 * the live plan after the undo differs from a fresh (cold) decision on the same content.
 */
function chainStats(rows) {
  const k = (r) => `${r.src}#${r.slide}#${r.size}#${r.venue}`;
  const slides = new Map();
  for (const r of rows) {
    if (r.arm !== 'fit-greedy' && r.arm !== 'structural') continue;
    if (!(r.variant in RANK)) continue;
    const s = slides.get(k(r)) ?? { cell: `${r.size}@${r.venue}`, g: {}, st: {} };
    (r.arm === 'fit-greedy' ? s.g : s.st)[r.variant] = r;
    slides.set(k(r), s);
  }
  const acc = {};
  for (const s of slides.values()) {
    if (!s.g.orig || !s.st.orig) continue;
    const facts = {};
    const pagesOf = {};
    for (const v of Object.keys(s.g)) {
      const g = s.g[v];
      if (!s.st[v]) continue;
      facts[v] = { fits: g.how === 'fits', m20: g.how === 'fits' && !!g.margin?.[0.2], m30: g.how === 'fits' && !!g.margin?.[0.3] };
      pagesOf[v] = { whole: 1, split: s.st[v].pages.length };
    }
    if (!facts.orig) continue;
    for (const e of EDITS) {
      if (!facts[e]) continue;
      const chain = ['orig', e, 'orig'];
      for (const policy of Object.keys(POLICIES)) {
        for (const start of POLICIES[policy].memory ? ['cold', 'live'] : ['cold']) {
          const d = run(policy, chain, facts, start);
          const pages = d.map((w, i) => (w ? pagesOf[chain[i]].whole : pagesOf[chain[i]].split));
          // The fresh decision this policy's own cold export makes on the authored content.
          const coldWhole = POLICIES[policy].entry === 'fits' ? facts.orig.fits : facts.orig.fits && facts.orig.m20;
          const cold = coldWhole ? 1 : pagesOf.orig.split;
          const id = `${s.cell}|${policy}|${start}`;
          const a = (acc[id] ??= { cell: s.cell, policy, start, chains: 0, editMoves: 0, undoStrands: 0, liveVsCold: 0 });
          a.chains++;
          if (pages[1] !== pages[0]) a.editMoves++;
          if (pages[1] !== pages[0] && pages[2] !== pages[0]) a.undoStrands++;
          if (pages[2] !== cold) a.liveVsCold++;
        }
      }
    }
  }
  return Object.values(acc);
}

/** A markdown section: one row per cell, policy and start. */
function chainReport(rows) {
  const stats = chainStats(rows).sort((a, b) => a.cell.localeCompare(b.cell) || a.policy.localeCompare(b.policy) || a.start.localeCompare(b.start));
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
  const lines = [
    '## Edit chains (authored -> edit -> undo)',
    '',
    '**Edit moves**: the edit changes the page count. **Undo strands**: of those, the undo does not restore it. **Live vs cold**: after the undo, the live plan differs from a fresh decision on the same content. Starts: `cold` seeds memory from the cold decision (fix A); `live` is a slide typed in the editor.',
    '',
    '| Cell | Policy | Start | Chains | Edit moves | Undo strands | Live vs cold |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const s of stats) lines.push(`| ${s.cell} | ${s.policy} | ${s.start} | ${s.chains} | ${pct(s.editMoves, s.chains)} | ${pct(s.undoStrands, s.editMoves)} | ${pct(s.liveVsCold, s.chains)} |`);
  return lines.join('\n');
}

module.exports = { run, chainStats, chainReport, RANK, POLICIES };
