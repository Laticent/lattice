#!/usr/bin/env node
/**
 * Assemble the GitHub release zip — the curated, unzip-and-use
 * distribution. It complements (does not replace) two other artifacts:
 * GitHub's auto-generated "Source code" archive (the whole repo) and the
 * npm tarball (`files` allowlist). This zip is the "download, unzip, use
 * Lattice" bundle, including the things npm deliberately drops — the
 * gallery PDFs and example-deck PDFs — so the component reference and
 * showcase are browsable offline.
 *
 * Built with `git archive` from HEAD, which makes the zip:
 *   - tracked-only — no node_modules, .scratch, .vscode, or stray renders;
 *   - deterministic for a given commit;
 *   - sourced from the committed/tagged state a release is cut from.
 * Because it archives HEAD (not the working tree), uncommitted changes are
 * NOT included — the tool refuses to run on a dirty tree unless
 * --allow-dirty. The repo layout is preserved under a `lattice-v<x.y.z>/`
 * prefix so the relative PDF links in dist/docs/components.md
 * (../../lib/components/...) resolve inside the unzipped tree.
 *
 * Output: release/lattice-v<version>.zip (release/ is gitignored — the zip
 * is uploaded to the GitHub Release, never committed).
 *
 * Caveat worth knowing: PDF *export* (the emulator) shells out to
 * Chromium + mmdc, which a zip can't carry. The genuinely standalone
 * surface is the CSS/runtime drop-in and the offline HTML/PDF reference.
 *
 * Flags:
 *   --skip-check    Skip the build:check dist-freshness gate.
 *   --allow-dirty   Archive HEAD even if the working tree is dirty.
 */

const { execFileSync, spawnSync } = require('node:child_process');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT     = path.resolve(__dirname, '..');
const pkg      = require(path.join(ROOT, 'package.json'));
const VERSION  = pkg.version;
const PREFIX   = `lattice-v${VERSION}/`;
const OUT_DIR  = path.join(ROOT, 'release');
const OUT_FILE = path.join(OUT_DIR, `lattice-v${VERSION}.zip`);

// Curated full-showcase set, repo-relative. `git archive` includes only
// tracked files under each path, so untracked HTML / *.tmp.md renders are
// excluded for free. lib/ carries both the engine runtime deps
// (lib/transformers, lib/core, lib/components/**/*.transform.js,
// lib/integrations) and the 142 gallery PDFs the component reference links.
// NOT 'dist' — see DISK_PATHS below. `git archive` is tracked-only, and dist/ is
// built, not committed, so listing it here made the whole command exit 128 with
// `fatal: pathspec 'dist' did not match any files`, and merely dropping it would
// have shipped a showcase zip with no engine in it — silently.
const PATHSPECS = [
  'lib',                   // engine deps + per-component css/docs/manifests + gallery PDFs
  'themes',                // all palette files
  'examples',              // showcase decks + their PDFs
  'design/skill.md',       // authoring contract
  'design/design-system.md',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
];

const argv       = process.argv.slice(2);
const skipCheck  = argv.includes('--skip-check');
const allowDirty = argv.includes('--allow-dirty');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

function main() {
  // 1. Must be a git repo — the zip is built from a tagged commit.
  try {
    git(['rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_e) {
    console.error('error: not a git repository — the release zip is built from a tagged commit.');
    process.exit(1);
  }

  // 2. Clean tree — `git archive` reads HEAD, not the working tree, so a
  //    dirty tree would silently ship stale content.
  const dirty = git(['status', '--porcelain']).trim();
  if (dirty && !allowDirty) {
    console.error('error: working tree is dirty. This zip is built from HEAD (git archive),');
    console.error('       so uncommitted changes would NOT be included. Commit or stash first,');
    console.error('       or pass --allow-dirty to archive HEAD as-is.');
    process.exit(1);
  }

  // 3. dist/ freshness gate — never zip a stale or colliding dist/.
  if (!skipCheck) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.js'), '--check', '--exclude-uncommitted'], {
      cwd: ROOT, stdio: 'inherit',
    });
    if (r.status !== 0) {
      console.error('\nerror: build:check failed — refusing to package a stale dist/.');
      console.error('       Run `npm run build`, commit, then retry.');
      process.exit(1);
    }
  }

  // 4. Assemble.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(OUT_FILE, { force: true });
  git(['archive', '--format=zip', `--prefix=${PREFIX}`, '-o', OUT_FILE, 'HEAD', '--', ...PATHSPECS], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  // dist/ is BUILT, not committed, so `git archive` cannot see it — it has to be
  // added from the working tree. Without this the zip is an engine-less showcase:
  // no lattice.css, no emulator, no marp-kit, and dist/docs/components.md's
  // relative PDF links (the reason the lattice-v<x>/ prefix exists) resolve to
  // nothing. `zip -r` appends into the archive git archive just wrote, under the
  // same prefix, so the layout is identical to what shipped before.
  const distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error('[build-release-zip] dist/ is missing — it is built, not committed.');
    console.error('       Run `npm run build`, then retry.');
    process.exit(1);
  }
  const staged = path.join(OUT_DIR, PREFIX.replace(/\/$/, ''));
  fs.rmSync(staged, { recursive: true, force: true });
  fs.mkdirSync(staged, { recursive: true });
  fs.cpSync(distDir, path.join(staged, 'dist'), { recursive: true });
  spawnSync('zip', ['-qr', OUT_FILE, PREFIX.replace(/\/$/, '')], { cwd: OUT_DIR, stdio: 'inherit' });
  fs.rmSync(staged, { recursive: true, force: true });

  const bytes = fs.statSync(OUT_FILE).size;
  console.log(`[build-release-zip] ${path.relative(ROOT, OUT_FILE)}  (${(bytes / 1e6).toFixed(1)} MB)`);
  console.log(`  prefix:    ${PREFIX}`);
  console.log(`  attach to: GitHub Release v${VERSION}`);
}

main();
