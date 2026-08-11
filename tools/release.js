#!/usr/bin/env node
/**
 * Release orchestrator — the deterministic, changelog-driven release.
 *
 * Run locally or from .github/workflows/release.yml (manual dispatch). It
 * keeps ALL release logic here so CI is a thin trigger and the same flow is
 * reproducible on a laptop.
 *
 * TWO PHASES, because `main` does not take direct pushes. The "Main Merge
 * Queue" ruleset requires a PR + the merge queue + a green `ci`, so the
 * release commit CANNOT be pushed to main by anyone — bot or human (issue
 * #1439). It goes up as a PR like every other change, and the tag is cut
 * afterwards, on the squashed commit the queue actually merged:
 *
 *   --prepare   cut the release COMMIT on a branch. No tag, no zip, no push —
 *               a tag here would name a commit the queue is about to rewrite.
 *   --publish   on merged main: tag THAT commit, rebuild the zip from it, and
 *               regenerate the notes from the changelog section --prepare
 *               committed (release/ is gitignored, so nothing survives the
 *               phase boundary except what is in git).
 *
 * --prepare sequence:
 *   1. Require a clean tree (a release is cut from committed state).
 *   2. Gate on build:check (no stale / colliding dist/).
 *   3. Read the bump level — `auto` derives it from CHANGELOG `## Unreleased`
 *      (tools/changelog.js); an explicit patch|minor|major overrides.
 *   4. Compute the next version from package.json.
 *   5. `npm version <next> --no-git-tag-version` (updates package.json + lock).
 *   6. Roll the changelog: `## Unreleased` → `## <version> - <date>`, fresh
 *      empty Unreleased seeded above it.
 *   7. `npm run build` — regenerate dist/ (the emulator bundle inlines
 *      package.json, so the version bump restales it).
 *   8. Commit `release: v<version>` (hooks run — dist is fresh).
 *
 * --publish sequence (HEAD = the merged release commit on main):
 *   1. Require a clean tree; gate on build:check.
 *   2. Read the version from package.json; refuse if `v<version>` already tags
 *      something (the release already went out).
 *   3. Rederive release/notes-v<version>.md from the `## <version>` section.
 *   4. Tag HEAD, build the release zip from it.
 *   5. With --push: push the TAG (the commit is already on main via the queue).
 *
 * Flags:
 *   --prepare                       phase 1 — cut the release commit
 *   --publish                       phase 2 — tag + package a merged release
 *   --bump=auto|patch|minor|major   default auto (read from the changelog)
 *   --dry-run                       print the plan; change nothing. Safe on a
 *                                   dirty tree.
 *   --push                          --publish only: push the tag to origin
 *   --skip-checks                   skip the build:check gate (CI ran it)
 *
 * Both phases append `version=<x.y.z>` to $GITHUB_OUTPUT when it is set, so
 * the workflows never re-derive the version themselves.
 */

const { spawnSync, execFileSync } = require('node:child_process');
const fs   = require('node:fs');
const path = require('node:path');
const cl   = require('./changelog.js');

const ROOT          = path.resolve(__dirname, '..');
const PKG_PATH      = path.join(ROOT, 'package.json');
const CHANGELOG     = path.join(ROOT, 'CHANGELOG.md');
const RELEASE_DIR   = path.join(ROOT, 'release');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
}
const DRY        = process.argv.includes('--dry-run');
const PREPARE    = process.argv.includes('--prepare');
const PUBLISH    = process.argv.includes('--publish');
const PUSH       = process.argv.includes('--push');
const SKIP_CHECK = process.argv.includes('--skip-checks');
const BUMP_ARG   = String(arg('bump', 'auto'));

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
}
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nrelease aborted: \`${cmd} ${args.join(' ')}\` exited ${r.status}.`);
    process.exit(1);
  }
}

/** Hand the version back to the calling workflow, so CI never re-derives it. */
function emitVersion(version) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
}

function requireCleanTree() {
  if (git(['status', '--porcelain'])) {
    console.error('error: working tree is dirty. Commit or stash before releasing.');
    process.exit(1);
  }
}

/**
 * Phase 2 — tag + package a release commit that is ALREADY on main.
 *
 * The version is read from package.json rather than recomputed: the bump
 * decision was made (and reviewed) in phase 1, and the merged commit is now
 * the only truth about what shipped.
 */
function publish() {
  requireCleanTree();
  if (!SKIP_CHECK) run(process.execPath, [path.join(ROOT, 'tools', 'build.js'), '--check']);

  const version = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;
  const tag = `v${version}`;

  if (git(['tag', '--list', tag])) {
    console.error(`error: tag ${tag} already exists — that version has already been released.`);
    process.exit(1);
  }

  // The notes file lives in the gitignored release/ dir, so phase 1's copy is
  // long gone. Rederive it from the dated section phase 1 committed.
  const section = cl.extractVersion(fs.readFileSync(CHANGELOG, 'utf8'), version);
  if (!section) {
    console.error(`error: CHANGELOG.md has no ## ${version} section — is HEAD the merged release commit?`);
    process.exit(1);
  }
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const notesFile = path.join(RELEASE_DIR, `notes-${tag}.md`);
  const fitted = cl.fitReleaseBody(cl.releaseNotes(section.body), version);
  if (fitted.truncated) {
    console.warn(
      `warning: the ${version} changelog section exceeds GitHub's ${cl.RELEASE_BODY_MAX}-character\n` +
      `  Release-body limit; the notes were trimmed to ${fitted.keptLines} lines with a pointer to CHANGELOG.md.`,
    );
  }
  fs.writeFileSync(notesFile, fitted.body);

  // Zip first, tag second: the archive is of HEAD, not of the tag, so nothing
  // depends on the order — and this way a failed zip build doesn't leave a
  // stray local tag that blocks the retry.
  run(process.execPath, [path.join(ROOT, 'tools', 'build-release-zip.js')]);
  run('git', ['tag', tag]);
  // The commit reached main through the merge queue; only the tag needs pushing.
  if (PUSH) run('git', ['push', 'origin', tag]);

  emitVersion(version);
  console.log(`\nPublished ${tag} at ${git(['rev-parse', '--short', 'HEAD'])}.`);
  console.log(`  tag:   ${tag}${PUSH ? ' (pushed)' : ' (local — push it with `git push origin ' + tag + '`)'}`);
  console.log(`  notes: ${path.relative(ROOT, notesFile)}`);
  console.log(`  zip:   release/lattice-${tag}.zip`);
}

function main() {
  // Must be a git repo.
  try { git(['rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (_e) { console.error('error: not a git repository.'); process.exit(1); }

  if (PREPARE && PUBLISH) {
    console.error('error: --prepare and --publish are separate phases — pass one.');
    process.exit(1);
  }
  if (PUBLISH) return publish();
  if (!PREPARE && !DRY) {
    console.error([
      'error: pick a phase — a release is cut in two steps, because main takes',
      'no direct pushes (the "Main Merge Queue" ruleset).',
      '',
      '  npm run release:dry        preview the bump, change nothing',
      '  npm run release:prepare    cut the release commit → push a branch → PR',
      '  npm run release:publish    after it merges: tag main, zip, notes',
      '',
      'See RELEASE.md § How to cut a release.',
    ].join('\n'));
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const current = pkg.version;

  // Per-PR entries live in changelog.d/ (#1593) — fold them in before anything
  // reads the section, so the bump AND the notes see them. Refuse on a
  // malformed fragment rather than silently dropping the entry from a release
  // that cannot be re-cut.
  const problems = cl.fragmentProblems();
  if (problems.length) {
    console.error(`error: ${cl.FRAGMENT_DIRNAME}/ has ${problems.length} problem(s) — fix before releasing:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const fragments = cl.readFragments();
  const md = cl.assembleUnreleased(fs.readFileSync(CHANGELOG, 'utf8'), fragments);
  const section = cl.extractUnreleased(md);
  if (!section) { console.error('error: no ## Unreleased section in CHANGELOG.md'); process.exit(1); }

  // Resolve bump level (deterministic from the changelog, or explicit).
  let level;
  if (BUMP_ARG === 'auto') {
    try { level = cl.computeBump(section.body); }
    catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
  } else if (['patch', 'minor', 'major'].includes(BUMP_ARG)) {
    // An override still needs notes, so the section must have content.
    try { cl.computeBump(section.body); }
    catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
    level = BUMP_ARG;
  } else {
    console.error(`error: --bump must be auto|patch|minor|major (got "${BUMP_ARG}")`);
    process.exit(1);
  }

  const next = cl.nextVersion(current, level);
  const date = new Date().toISOString().slice(0, 10);
  const notes = cl.releaseNotes(section.body);

  console.log(`Release plan:`);
  console.log(`  bump:    ${level}${BUMP_ARG === 'auto' ? ' (from CHANGELOG ## Unreleased)' : ' (override)'}`);
  console.log(`  version: ${current} → ${next}`);
  console.log(`  date:    ${date}`);
  console.log(
    `  notes:   ${notes.split('\n').length} lines from ## Unreleased` +
    `${fragments.length ? ` + ${fragments.length} ${cl.FRAGMENT_DIRNAME}/ fragment(s)` : ''}\n`,
  );

  if (DRY) {
    console.log('--- release notes preview ---');
    console.log(notes.trimEnd());
    console.log('\n[dry-run] no files changed, no tag created.');
    return;
  }

  // Real run from here — require a clean tree and a fresh dist.
  requireCleanTree();
  if (!SKIP_CHECK) run(process.execPath, [path.join(ROOT, 'tools', 'build.js'), '--check']);

  // Bump version, roll changelog, rebuild dist.
  run('npm', ['version', next, '--no-git-tag-version']);
  // Assemble from the file on disk (not the in-memory `md` above, which predates
  // `npm version`), then consume the fragments: a fragment that survived the roll
  // would be re-released in the next cut.
  fs.writeFileSync(
    CHANGELOG,
    cl.rollUnreleased(cl.assembleUnreleased(fs.readFileSync(CHANGELOG, 'utf8'), fragments), next, date),
  );
  for (const f of fragments) fs.rmSync(f.file);
  run('npm', ['run', 'build']);

  // Commit only (hooks run; dist is fresh so freshness gates pass). No tag and
  // no zip: the queue squashes this commit into a NEW sha on main, so anything
  // cut here would name a commit that never lands. Phase 2 does both.
  // `changelog.d` stages the fragment DELETIONS the roll just made.
  git(['add', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'dist', cl.FRAGMENT_DIRNAME]);

  // `npm run build` regenerates 36 artifacts; only those four are the release
  // surface. If it touched anything else the tree was stale before the release
  // started — and the symptom would otherwise surface two phases later, as
  // `--publish` refusing a dirty tree with no hint of why. Name it here.
  const stray = git(['status', '--porcelain'])
    .split('\n')
    .filter((l) => l && l[1] !== ' ')
    .map((l) => l.slice(3));
  if (stray.length) {
    console.error(
      `error: the build changed files outside the release surface:\n  ${stray.join('\n  ')}\n` +
      'Commit (or revert) them first — `npm run build` on a clean tree should be a no-op.',
    );
    process.exit(1);
  }

  run('git', ['commit', '-m', `release: v${next}`]);

  emitVersion(next);
  console.log(`\nPrepared v${next} — the release commit is on ${git(['rev-parse', '--abbrev-ref', 'HEAD'])}.`);
  console.log('  next: push the branch, open the PR, get it merged through the queue,');
  console.log('        then run `npm run release:publish` on the merged main.');
}

main();
