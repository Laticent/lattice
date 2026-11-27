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
// (named in the bless commit's subject), here, and compares the two fresh renders with floor 0:
// any pixel past the anti-aliasing fuzz counts. Same machine, so an unchanged source renders
// identically (measured: no pixel past the fuzz on 3 real controls, decks and galleries).
//   · 'machine': the two renders match. The drift against the golden is the cross-machine band.
//     It passes only for a nightly bless's source with no dependency or workspace-package change
//     since (controlPasses).
//   · 'source': the fresh render moved from its source commit's render. Something on the render
//     path changed since; on main the nightly will bless it, on a branch look at it.
//   · 'unavailable': the control could not answer honestly (resolveSource lists why), or the
//     source commit's tree would not build or render. Never read as a pass.

// The commit whose SOURCE rendered a golden: { sha, nightly, depsChanged } or { error }.
// Pure: every git call goes through `git(args)`, which returns trimmed stdout or throws on a
// non-zero exit. A nightly bless commit names its source in its subject ("nightly bless of
// <sha>", read by `blessFrom`): the bless renders main at that sha and merges later, so the
// merge commit can already carry a render change the golden never saw. Any other commit that
// last wrote the golden (a hand bless, a revert of a bless) is its own source with nightly
// false, and such a control never passes (controlPasses).
// It is { error } when no commit here can answer honestly:
//   · the golden has local changes, or was never committed;
//   · the clone is SHALLOW and the lookup lands on its cut-off commit, which only looks as if it
//     wrote every file (measured in the sandbox: 614 of 655 committed PDFs), or the clone is
//     shallow and its cut-off list could not be read (fail closed);
//   · the bless's source sha is older than a shallow clone's history;
//   · git itself fails.
// depsChanged: any of `renderInputs` differs between that sha and the WORKING TREE. They are
// the files the control tree cannot carry: it borrows this checkout's installed packages
// (tools/lib/base-tree.mjs), so the lockfile is the input. Workspace packages are not: the tree
// links its own copies (ownWorkspaces) and builds them. Compared with the working tree, not
// HEAD, because the renders run what is on disk.
export function resolveSource(golden, { git, cutoffs, isShallow, renderInputs, blessFrom }) {
  try {
    if (isShallow && !cutoffs.size) return { error: 'the clone is shallow and its cut-off list could not be read; run `git fetch --unshallow` and try again' };
    if (git(['status', '--porcelain', '--', golden])) return { error: 'the golden has local changes (a local --bless), so no commit rendered it' };
    const line = git(['log', '-1', '--format=%H%x09%s', '--', golden]);
    if (!line) return { error: 'the golden was never committed' };
    const [last, ...subject] = line.split('\t');
    if (cutoffs.has(last)) return { error: `this clone's history stops at ${last.slice(0, 8)}, so the commit that rendered the golden is not here; run \`git fetch --unshallow\` and try again` };
    const from = blessFrom(subject.join('\t'));
    let sha = last;
    if (from) {
      try {
        sha = git(['rev-parse', '--verify', `${from}^{commit}`]);
      } catch {
        return { error: `its bless rendered from ${from.slice(0, 8)}, which this clone does not have; run \`git fetch --unshallow\` and try again` };
      }
    }
    let depsChanged = false;
    try {
      git(['diff', '--quiet', sha, '--', ...renderInputs]);
    } catch {
      depsChanged = true;
    }
    return { sha, nightly: Boolean(from), depsChanged };
  } catch (err) {
    return { error: `git could not answer (${String(err?.message || err).split('\n')[0]})` };
  }
}

// Environment settings that change a render and would reach BOTH control renders alike, so the
// control could not see them: the PDF photo layer's speed, quality and scale switches, and the
// test runner's marker, which turns the fast photo on (lattice.js PDF_PHOTO_FAST). The control
// refuses to run under any of them (the third review of #3589, finding 2).
export function renderEnvOverrides(env) {
  return Object.keys(env).filter((k) => k.startsWith('LATTICE_PDF_') || k === 'NODE_TEST_CONTEXT').sort();
}

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

// Whether a control clears its drift. Only a 'machine' verdict against a NIGHTLY bless's source
// does: a golden last written by any other commit (a hand bless, a revert) has a guessed source,
// and a guess cannot pass a gate (the #3589 maker-checker, finding 2).
// Nor does one whose dependencies moved since that source: both renders borrow this checkout's
// node_modules, so a dependency's effect cannot show (finding 3).
export function controlPasses(c) {
  return c?.verdict === 'machine' && c.nightly === true && !c.depsChanged;
}

// The line printed under a drifting row.
export function controlLine(c) {
  const at = c.sha ? c.sha.slice(0, 8) : '—';
  if (c.verdict === 'machine' && c.nightly && c.depsChanged) return `   ↳ control @${at}: same render here, but dependencies changed since @${at} and the control cannot see them; not counted as a pass`;
  if (c.verdict === 'machine' && c.nightly) return `   ↳ control @${at}: same render here → cross-machine band (no pixel past the anti-aliasing fuzz), not a source change`;
  if (c.verdict === 'machine') return `   ↳ control @${at}: same render here, but no nightly bless wrote this golden, so @${at} is a guess; not counted as a pass`;
  if (c.verdict === 'source') return `   ↳ control @${at}: render moved since this bless (worst ${(c.worst * 100).toFixed(2)}%) → source drift; on a branch, look at it`;
  return `   ↳ control: unavailable (${c.error}); treat the drift as unexplained`;
}

// The host the run rendered on: the two facts a drift number depends on.
export function hostLine({ chrome, cpu, cores }) {
  return `host: ${chrome || 'Chrome (version unknown)'} · ${cpu || 'CPU unknown'} · ${cores} cores. ` +
    'Goldens are blessed on a GitHub runner; drift against them includes the cross-machine band.';
}
