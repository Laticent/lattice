// A renderable copy of another commit's tree, for a SAME-MACHINE comparison.
//
// Two renders on one machine are byte-identical; a golden blessed on another machine is not,
// because Skia rasterizes the PDF's photo layer through CPU-dispatched code paths
// (engineering/pipeline.md §4a). So the honest way to ask "did the source change?" is to
// render the other commit HERE and compare render with render. tools/golden-diff.mjs does
// that against a PR's base; tools/regression-gate.mjs `--control` does it against the commit
// that last blessed each drifting golden. Both build the tree with this function.
//
// It is an export of the commit WITHOUT its PDFs, not a worktree. The render reads none of
// them, so a second copy of every PDF (151 MB of the tree's 237 MB) buys nothing, and in CI's
// blobless clone a worktree would also fetch every PDF that differs. Nothing the render runs
// calls git, so plain files are enough. The tree reuses this checkout's node_modules:
// rendering needs the commit's own lib/ and dist/, not its own dependency install.
// Measured 2026-11-27 in the 4-core sandbox: about 50 s to export and build.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Returns { root } once built, or { error } if it could not be. Never throws.
export function buildBaseTree({ repoRoot, ref, dir }) {
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const tar = `${dir}.tar`;
    execFileSync('git', ['archive', '--format=tar', '-o', tar, ref, '--', '.', ':(exclude)*.pdf'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('tar', ['-xf', tar, '-C', dir]);
    rmSync(tar, { force: true });
    execFileSync('ln', ['-s', join(repoRoot, 'node_modules'), join(dir, 'node_modules')]);
    try {
      execFileSync(process.execPath, ['tools/build.js', '--only-uncommitted'], { cwd: dir, stdio: 'ignore' });
    } catch {
      // A step unrelated to rendering can fail under a symlinked node_modules (the agent
      // kit checks its bundler banners). What rendering needs is checked below.
    }
    if (!existsSync(join(dir, 'dist', 'lattice.css'))) throw new Error('build produced no dist/lattice.css');
    return { root: dir };
  } catch (err) {
    return { error: String(err.message || err).split('\n')[0] };
  }
}
