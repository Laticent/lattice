#!/usr/bin/env node
/**
 * Stage the engine's publish folder: put the files `@laticent/lattice` ships into
 * `packages/lattice/`, so `npm pack` / `npm publish` there build the same tarball the
 * repository root used to.
 *
 * Why the folder exists: Changesets only versions workspace packages, and the engine lived at
 * the repository root, which no workspace tool lists (engineering/decisions/2026-10-07-first-npm-release.md
 * §8, option A). So `packages/lattice/package.json` holds the engine's published fields, and the
 * source stays where it is. This script is that folder's `prepack`; its `postpack` runs it again
 * with `--clean`.
 *
 * What it copies: every positive entry of `packages/lattice/package.json` `files` (`lattice.js`,
 * `lib/`, `dist/`, `themes/`, the shipped docs, README, CHANGELOG, the licenses), from the
 * repository root. The negated entries (`!**\/*.pdf`, `!dist/agent-kit/`, ...) are left to npm,
 * which applies them at pack time exactly as it did at the root, so the file set cannot drift
 * from the `files` list. Files are hard-linked where the file system allows it (no extra disk,
 * about a second for ~185 MB) and copied otherwise.
 *
 * It does NOT build. The `prepack` runs `npm run build` at the root first; a caller that only
 * wants the listing (the installed-package test) has a built tree already.
 *
 * Usage:
 *   node tools/stage-engine-package.js           stage (replaces any earlier staging)
 *   node tools/stage-engine-package.js --clean   remove the staged entries; package.json stays
 *
 * The staged entries are gitignored (`/packages/lattice/*` in .gitignore, package.json kept).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PKG_DIR = path.join(ROOT, 'packages', 'lattice');
const MANIFEST = path.join(PKG_DIR, 'package.json');
/** The names npm packs from any folder it walks (npm-packlist's always-included set). */
const ALWAYS_PACKED = /^(readme|license|licence|copying)(\.[^.]*)?$/i;

/** The top-level paths the package ships: the positive `files` entries, without a trailing slash. */
function stagedEntries(manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))) {
  const entries = (manifest.files || [])
    .filter((f) => !f.startsWith('!'))
    .map((f) => (f.startsWith('/') ? f : path.posix.normalize(f).replace(/\/+$/, '')));
  for (const e of entries) {
    // A glob or a parent path would copy something the list does not name, or write outside the
    // folder; `.` (from `./`) would make clean() remove the folder, manifest and all; `packages`
    // would stage the folder into itself.
    const top = e.split('/')[0];
    if (/[*?[\]{}]/.test(e) || e.split('/').includes('..') || path.isAbsolute(e) || ['', '.', 'package.json', 'packages', 'node_modules'].includes(top)) {
      throw new Error(`stage-engine-package: cannot stage the files entry "${e}": name a plain path inside the repository`);
    }
  }
  return entries;
}

/** Link `from` to `to`, or copy it when the file system refuses a hard link. */
function place(from, to) {
  try {
    fs.linkSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
  }
}

function stageTree(from, to) {
  const st = fs.lstatSync(from);
  if (st.isSymbolicLink()) return; // npm does not pack symlinks; the root never shipped one
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) stageTree(path.join(from, name), path.join(to, name));
    return;
  }
  if (st.isFile()) place(from, to);
}

/** Remove the staged entries from `dest`; its package.json stays. */
function clean(entries, dest = PKG_DIR) {
  for (const e of entries) {
    // Every entry roots at its first segment (`design/skill.md` stages under `design/`).
    fs.rmSync(path.join(dest, e.split('/')[0]), { recursive: true, force: true });
  }
}

/**
 * Stage the shipped entries into `dest` (default: the publish folder). A caller that wants a
 * private copy (a test that runs beside others walking the tree) passes its own folder, with
 * `packages/lattice/package.json` copied in.
 */
function stage(entries, dest = PKG_DIR) {
  clean(entries, dest);
  const missing = entries.filter((e) => !fs.existsSync(path.join(ROOT, e)));
  if (missing.length) {
    throw new Error(`stage-engine-package: the package ships ${missing.join(', ')}, which the repository does not have. Run \`npm run build\` first.`);
  }
  for (const e of entries) {
    const to = path.join(dest, e);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    stageTree(path.join(ROOT, e), to);
    // npm ships a README or LICENSE from every folder it packs, listed in `files` or not, so
    // `design/skill.md` brought `design/README.md` along at the root. Stage those too.
    for (let dir = path.dirname(e); dir !== '.'; dir = path.dirname(dir)) {
      for (const name of fs.readdirSync(path.join(ROOT, dir))) {
        if (ALWAYS_PACKED.test(name) && fs.statSync(path.join(ROOT, dir, name)).isFile() && !fs.existsSync(path.join(dest, dir, name))) {
          place(path.join(ROOT, dir, name), path.join(dest, dir, name));
        }
      }
    }
  }
}

if (require.main === module) {
  try {
    const entries = stagedEntries();
    if (process.argv.includes('--clean')) clean(entries);
    else stage(entries);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { PKG_DIR, MANIFEST, stagedEntries, stage, clean };
