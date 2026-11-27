// `regress --control`: tell host noise from a source change, on THIS machine.
//
// A drift verdict compares a fresh local render with a golden the nightly blessed on a GitHub
// runner. Those differ even when no source changed: the PDF's photo layer is Skia raster, and
// Skia's rasterization is CPU-dispatched, so it is not bit-identical across hosts
// (engineering/pipeline.md §4a). Measured 2026-11-27: Chrome 157.0.8103.50 (CI's pinned build)
// and 158.0.8127.36 wrote byte-identical PDFs in the sandbox, and both drifted from the golden
// by the same 0.10–0.30% on the same pages, with every content stream and font identical and only
// the raster photo XObjects different. The browser version was not the cause; the machine was.
//
// The control renders each drifting golden again at the commit its nightly bless RENDERED FROM
// (named in the bless commit's subject; any other writer's own commit), here, and
// compares the two fresh renders. Same machine, so an unchanged source gives an identical render:
//   · 'machine': the fresh render matches its bless commit's render. The drift against the
//     golden is the cross-machine band, not a change in the source.
//   · 'source': the fresh render moved from its bless commit's render. Something on the render
//     path changed since that bless; on main the nightly will bless it, on a branch look at it.
//   · 'unavailable': the control could not run (the golden was never committed, or that
//     commit's tree would not build or render). Never read as a pass.

// One verdict from the per-page comparison of the two fresh renders.
//   pages: pixelDiff's perPage rows ({ pixels, total }), pixels === -1 for a page-count change.
//   floor: the same per-page fraction the golden check uses.
export function controlVerdict(pages, floor) {
  const moved = pages.filter((p) => p.pixels === -1 || (p.total ? p.pixels / p.total > floor : p.pixels > 0));
  const worst = pages.reduce((m, p) => Math.max(m, p.pixels === -1 ? 1 : p.total ? p.pixels / p.total : p.pixels > 0 ? 1 : 0), 0);
  return { verdict: moved.length ? 'source' : 'machine', moved: moved.map((p) => p.page), worst };
}

// Group drifting goldens by the commit that last blessed them, so each commit's tree is built
// once. `shaOf(golden)` returns that commit, or '' when the golden was never committed.
export function groupByBlessCommit(items, shaOf) {
  const groups = new Map();
  for (const item of items) {
    const sha = shaOf(item.golden) || '';
    if (!groups.has(sha)) groups.set(sha, []);
    groups.get(sha).push(item);
  }
  return groups;
}

// The line printed under a drifting row.
export function controlLine(c) {
  const at = c.sha ? `${c.sha.slice(0, 8)}${c.nightly === false ? ' (last written by a commit that is not a nightly bless; assumed to have rendered from its own tree)' : ''}` : '—';
  if (c.verdict === 'machine') return `   ↳ control @${at}: same render here → cross-machine band, not a source change`;
  if (c.verdict === 'source') return `   ↳ control @${at}: render moved since this bless (worst ${(c.worst * 100).toFixed(2)}%) → source drift; on a branch, look at it`;
  return `   ↳ control @${at}: unavailable (${c.error}); treat the drift as unexplained`;
}

// The host the run rendered on: the two facts a drift number depends on.
export function hostLine({ chrome, cpu, cores }) {
  return `host: ${chrome || 'Chrome (version unknown)'} · ${cpu || 'CPU unknown'} · ${cores} cores. ` +
    'Goldens are blessed on a GitHub runner; drift against them includes the cross-machine band.';
}
