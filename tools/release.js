#!/usr/bin/env node
/**
 * Release orchestrator: Changesets versions and publishes the engine and its libraries.
 *
 * Run locally or from .github/workflows/release.yml (dispatch) and release-publish.yml (the push
 * the release PR's merge makes). ALL release logic lives here, so the workflows stay thin
 * triggers and every step is reproducible on a laptop.
 *
 * WHAT PUBLISHES. `tools/release-packages.js` PUBLISH_SET: `@laticent/lattice` and twelve
 * libraries, each on its own version line. Six more libraries are held back by
 * `.changeset/config.json` `ignore`. Decision: engineering/decisions/2026-10-07-first-npm-release.md
 * §11, and issue #3449 for the owner's rulings.
 *
 * TWO PHASES, because `main` takes no direct pushes (the "Main Merge Queue" ruleset, #1439). The
 * release commit goes up as a PR like every other change; the tags are cut afterwards, on the
 * squashed commit the queue merged.
 *
 *   --prepare   cut the release COMMIT on the current branch. No tag, no publish, no push.
 *     1. Check the tree, the publish set (strict), every changeset and every fragment.
 *     2. Ask npm whether the engine's current version is published.
 *        - BOOTSTRAP (the engine is 1.0.0 or a 1.0.0-rc.N, not on npm, and untagged): the first
 *          release. Nothing is bumped: the engine ships at the version it carries and each library
 *          at its own (0.1.0). Pending fragments and changesets are archived into
 *          changelog/pre-release-archive.md, because the curated release-notes/1.0.0.md covers
 *          1.0.0 and its candidates. Each package's CHANGELOG.md gets its first section.
 *        - A release candidate already on npm (1.0.0-rc.1) versions like any other release: any
 *          pending engine changeset, whatever its bump, takes 1.0.0-rc.N to 1.0.0.
 *        - Otherwise the engine's version must already be on npm; an unpublished one means the
 *          previous release never finished, and the fix is a Release (publish) run, not a bump.
 *     3. Convert every pending changelog.d/ fragment into a changeset for the engine
 *        (tools/changesets.js), then `changeset version`, then refresh package-lock.json.
 *     4. `npm run build`, then commit `release: <name>`.
 *
 *   --publish   on merged main: publish whatever is not on npm yet, then tag it.
 *     1. Check the tree, build:check, the publish set (strict).
 *     2. Plan: every publish-set package whose version is not on npm, or has no
 *        `<name>@<version>` tag. Nothing in the plan is a quiet no-op.
 *     3. If the engine is in the plan: refuse when `v<version>` already tags something (the
 *        August v1.0.0 tag must be retired first, slice D), write the GitHub Release notes and
 *        build the release zip. Both happen BEFORE anything reaches npm, so their failure leaves
 *        nothing half-published.
 *     4. `changeset publish` (`--tag next` when the engine ships a pre-release, so npm's `latest`
 *        is never moved to a candidate by us): npm publish in each package folder, in dependency order (it sorts
 *        the plan into rounds with @pnpm/deps.graph-sequencer, so ltt and the other leaf
 *        libraries go before cadenza, and the engine goes last). Provenance comes from
 *        NPM_CONFIG_PROVENANCE, which release-publish.yml sets.
 *     5. Tag each package npm now has, plus `v<version>` for the engine; with --push, push only
 *        those tags. A package still missing from npm fails the run after the tags for the rest
 *        are pushed, so a re-run publishes only what is left.
 *
 *   --plan      the publish gate: print the plan and write `release=true|false` to $GITHUB_OUTPUT.
 *
 * Flags:
 *   --dry-run      --prepare: print the plan, change nothing (safe on a dirty tree).
 *                  --publish: run everything with npm's dry-run on, tag locally, never push.
 *   --push         --publish: push the new tags to origin.
 *   --skip-checks  skip the build:check gate (CI ran it).
 *
 * Every phase writes `version=<engine version>` (and more) to $GITHUB_OUTPUT when it is set.
 */
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const cl = require('./changelog.js');
const cs = require('./changesets.js');
const rp = require('./release-packages.js');

const ROOT = path.resolve(__dirname, '..');
const NOTES_DIR = 'release-notes';
/** The one version the bootstrap release ships as it stands (or one of its release candidates). */
const BOOTSTRAP_VERSION = '1.0.0';
/** A release candidate of the bootstrap version: `1.0.0-rc.1`, `1.0.0-rc.2`, … (issue #3518, owner answer 1). */
const BOOTSTRAP_RC = /^1\.0\.0-rc\.[1-9]\d*$/;
/**
 * The npm dist-tag a pre-release publishes under. We never point `latest` at a candidate ourselves; whether the
 * registry sets `latest` on a brand-new package's first publish anyway is unverified (RELEASE.md).
 */
const PRERELEASE_DIST_TAG = 'next';
const REPO_URL = 'https://github.com/Laticent/lattice';
const CHANGESET_BIN = path.join(ROOT, 'node_modules', '.bin', 'changeset');

// ── small helpers ────────────────────────────────────────────────────────────

/** Is this the first release's version: 1.0.0 itself or one of its release candidates? */
function isBootstrapVersion(version) {
  return version === BOOTSTRAP_VERSION || BOOTSTRAP_RC.test(String(version));
}

/** A semver pre-release carries a `-` before any `+build` suffix: `1.0.0-rc.1`, never `1.0.0`. */
function isPrerelease(version) {
  return String(version).split('+')[0].includes('-');
}

/** The version whose curated notes a release uses: `1.0.0-rc.1` → `1.0.0`. */
function notesVersion(version) {
  return String(version).split('+')[0].split('-')[0];
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: opts.cwd || ROOT, encoding: 'utf8', ...opts }).trim();
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd || ROOT, stdio: 'inherit', env: opts.env || process.env });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` exited ${r.status}`);
  }
  return r.status;
}

function emit(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''));
}

function tagExists(tag, cwd = ROOT) {
  return Boolean(git(['tag', '--list', tag], { cwd }));
}

/**
 * Is `name@version` on npm? `npm view` prints the version when it is and fails with E404 when it
 * is not; anything else (no network, a registry error) throws, because guessing "not published"
 * would re-run a bootstrap and guessing "published" would skip a publish.
 */
function npmHasVersion(name, version) {
  const r = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.trim().length > 0;
  if (/E404|404 Not Found|is not in this registry/.test(`${r.stdout}${r.stderr}`)) return false;
  throw new Error(`npm view ${name}@${version} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ')}`);
}

function requireCleanTree(cwd = ROOT) {
  const dirty = git(['status', '--porcelain'], { cwd });
  if (dirty) throw new Error(`the working tree is dirty; commit or stash first:\n${dirty}`);
}

function fail(problems, what) {
  throw new Error(`${what}:\n  - ${problems.join('\n  - ')}`);
}

/** The shared pre-flight: the publish set, every changeset, every fragment. */
function preflight(root, { strict = true } = {}) {
  const problems = [
    ...rp.publishSetProblems({ strict, root }),
    ...cs.changesetProblems(path.join(root, cs.CHANGESET_DIRNAME)),
    ...cl.fragmentProblems(path.join(root, cl.FRAGMENT_DIRNAME)),
  ];
  return problems;
}

// ── changelog sections ───────────────────────────────────────────────────────

/**
 * Add `## <version>` with `body` to a package's CHANGELOG.md, where Changesets would put it: above
 * the newest version section, or at the end when there is none yet (so an intro paragraph under
 * the `# <name>` heading stays on top, and every later `changeset version` stacks below it).
 * Returns false when the section is already there.
 */
function prependChangelogSection(file, name, version, body) {
  const prior = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# ${name}\n`;
  // The whole version escaped, not only its dots: a version is data, and a `+` or `(` in a build
  // suffix would otherwise change the pattern.
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^## ${escaped}\\s*$`, 'm').test(prior)) return false;
  const block = `## ${version}\n\n${body.trim()}\n`;
  const at = prior.search(/^#{1,6}\s+\d+\.\d+/m);
  const next = at >= 0
    ? `${prior.slice(0, at)}${block}\n${prior.slice(at)}`
    : `${prior.replace(/\n+$/, '')}\n\n${block}`;
  fs.writeFileSync(file, next);
  return true;
}

function changelogHasVersion(file, version) {
  return fs.existsSync(file) && Boolean(cl.extractVersion(fs.readFileSync(file, 'utf8'), version));
}

/** The top-level bullets of `## <version>` in a package CHANGELOG, first line of each. */
function changelogFirstLines(file, version) {
  if (!fs.existsSync(file)) return [];
  const section = cl.extractVersion(fs.readFileSync(file, 'utf8'), version);
  if (!section) return [];
  return section.body
    .split('\n')
    .filter((l) => /^- \S/.test(l) && !/^- Updated dependencies/.test(l))
    .map((l) => l.slice(2).trim());
}

/**
 * The GitHub Release body for an engine release: the curated release-notes/<version>.md when it
 * exists, then one line per package published with it, built from the first line of each entry.
 */
function releaseNotes(root, version, items) {
  // A candidate's own curated notes win; without them it borrows the notes of the version it leads to.
  const own = path.join(root, NOTES_DIR, `${version}.md`);
  const curated = fs.existsSync(own) ? own : path.join(root, NOTES_DIR, `${notesVersion(version)}.md`);
  const out = [];
  if (isPrerelease(version)) {
    out.push(
      `> **Release candidate.** \`${version}\` is on npm under the \`${PRERELEASE_DIST_TAG}\` tag: ` +
      `\`npm install @laticent/lattice@${PRERELEASE_DIST_TAG}\`. The notes below describe ${notesVersion(version)}, which follows it.`,
      '',
    );
  }
  if (fs.existsSync(curated)) out.push(fs.readFileSync(curated, 'utf8').trim(), '');
  const engineFirst = [...items].sort((a, b) => (b.name === rp.ENGINE) - (a.name === rp.ENGINE) || a.name.localeCompare(b.name));
  out.push('## Packages in this release', '');
  for (const p of engineFirst) {
    const lines = changelogFirstLines(path.join(p.dir, 'CHANGELOG.md'), p.version);
    const label = `\`${p.name}\` ${p.version}`;
    if (lines.length === 1) out.push(`- ${label}: ${lines[0]}`);
    else out.push(`- ${label}`, ...lines.map((l) => `  - ${l}`));
  }
  const fitted = cl.fitReleaseBody(`${out.join('\n')}\n`, version);
  return fitted.body;
}

// ── prepare ──────────────────────────────────────────────────────────────────

/**
 * Decide what this release is. Pure apart from `registry` and the tag lookup, both injectable.
 * @returns {{ mode: 'bootstrap'|'version', engine: object }}
 */
function releaseMode(root, {
  registry = npmHasVersion, hasTag = (t) => tagExists(t, root),
  engineTags = () => git(['tag', '--list', `${rp.ENGINE}@*`], { cwd: root }).split('\n').filter(Boolean),
} = {}) {
  const engine = rp.workspacePackages(root).find((p) => p.name === rp.ENGINE);
  if (!engine) throw new Error(`no workspace declares ${rp.ENGINE}`);
  const published = registry(engine.name, engine.version);
  const tagged = hasTag(`${engine.name}@${engine.version}`);
  // The bootstrap is the FIRST release only. Once any engine version is tagged (1.0.0-rc.1, say), a hand-set
  // 1.0.0 or rc.2 must not re-run it: it would archive the pending changesets unbumped and call 1.0.0 a
  // "first release". Those versions come from `changeset version` instead.
  const shipped = engineTags();
  if (!published && !tagged && isBootstrapVersion(engine.version) && !shipped.length) return { mode: 'bootstrap', engine };
  if (!published) {
    if (!tagged && shipped.length && isBootstrapVersion(engine.version)) {
      throw new Error(
        `${engine.name}@${engine.version} is not on npm, but ${shipped.join(', ')} already shipped, so this is not the first release. ` +
        'Set the engine back to the version npm has and let a changeset move it (RELEASE.md § After rc.1).',
      );
    }
    throw new Error(
      `${engine.name}@${engine.version} is versioned but not on npm, so the previous release never finished. ` +
      'Run Release (publish) on main (workflow_dispatch) to publish it; do not cut another version on top.',
    );
  }
  return { mode: 'version', engine };
}

function bootstrapPrepare(root, { dry, date }) {
  const notes = path.join(root, NOTES_DIR, `${BOOTSTRAP_VERSION}.md`);
  if (!fs.existsSync(notes)) throw new Error(`the first release needs its curated notes at ${NOTES_DIR}/${BOOTSTRAP_VERSION}.md`);
  const fragments = cl.readFragments(path.join(root, cl.FRAGMENT_DIRNAME)).filter((f) => f.body.trim());
  const changesets = cs.readChangesets(path.join(root, cs.CHANGESET_DIRNAME));
  const pkgs = rp.publishable(root);
  const version = pkgs.find((p) => p.name === rp.ENGINE).version;
  const rc = isPrerelease(version);

  console.log(`Release plan: BOOTSTRAP — the first npm release, nothing is bumped.`);
  if (rc) console.log(`  pre-release: every package publishes under the npm \`${PRERELEASE_DIST_TAG}\` tag`);
  for (const p of pkgs) console.log(`  ${p.name}@${p.version}`);
  console.log(`  archive: ${fragments.length} fragment(s) and ${changesets.length} changeset(s) → changelog/pre-release-archive.md`);
  if (dry) return { name: `v${version}` };

  if (fragments.length || changesets.length) {
    const body = [
      fragments.length ? cs.fragmentsAsMarkdown(fragments) : '',
      changesets.length ? `### Changesets\n\n${cs.changesetsAsMarkdown(changesets) || '(empty changesets only)'}` : '',
    ].filter(Boolean).join('\n\n');
    cs.appendToArchive(
      `Folded into ${version} at release (${date})`,
      `Entries that landed after the Changesets cutover and before the first npm release. ${version} ships them; its notes are the curated \`release-notes/1.0.0.md\`, so they are archived here verbatim, as the earlier fragments were.`,
      body,
      path.join(root, 'changelog', 'pre-release-archive.md'),
    );
    for (const f of fragments) fs.rmSync(f.file);
    for (const c of changesets) fs.rmSync(c.file);
  }
  for (const p of pkgs) {
    const notesLink = `[release notes](${REPO_URL}/blob/main/${NOTES_DIR}/${BOOTSTRAP_VERSION}.md)`;
    let line;
    if (p.name !== rp.ENGINE) line = rc ? `- First release on npm, under the \`${PRERELEASE_DIST_TAG}\` tag with ${rp.ENGINE} ${version}.` : '- First release on npm.';
    else if (rc) line = `- Release candidate for ${BOOTSTRAP_VERSION}, on npm under the \`${PRERELEASE_DIST_TAG}\` tag: \`npm install ${rp.ENGINE}@${PRERELEASE_DIST_TAG}\`. What ${BOOTSTRAP_VERSION} does: ${notesLink}.`;
    else line = `- First release on npm. What it does, and how to install it: ${notesLink}.`;
    prependChangelogSection(path.join(p.dir, 'CHANGELOG.md'), p.name, p.version, line);
  }
  return { name: `v${version}` };
}

function versionPrepare(root, { dry, date, engine, lock = true }) {
  const fragments = cl.readFragments(path.join(root, cl.FRAGMENT_DIRNAME)).filter((f) => f.body.trim());
  const changesets = cs.readChangesets(path.join(root, cs.CHANGESET_DIRNAME))
    .filter((c) => (cs.parseChangeset(c.text).releases || []).length);
  if (!fragments.length && !changesets.length) {
    throw new Error('nothing to release: no pending changeset in .changeset/ and no fragment in changelog.d/.');
  }
  // A release candidate becomes the release only on purpose. A library changeset alone can still move the
  // engine, because Changesets patches a dependent whose range the library leaves, and semver's patch of
  // 1.0.0-rc.1 is 1.0.0: that would publish 1.0.0 to `latest` as a side effect. Fragments all become engine
  // changesets, so they count as naming it.
  const namesEngine = fragments.length > 0
    || changesets.some((c) => (cs.parseChangeset(c.text).releases || []).some((r) => r.name === rp.ENGINE));
  const tally = {};
  for (const f of fragments) tally[cs.fragmentBump(f)] = (tally[cs.fragmentBump(f)] || 0) + 1;
  console.log('Release plan: version with Changesets.');
  console.log(`  changesets: ${changesets.length} pending`);
  console.log(`  fragments:  ${fragments.length} to convert into ${rp.ENGINE} changesets ${JSON.stringify(tally)}`);
  if (dry) {
    console.log('  (dry run: `changeset version` would run next; `npx changeset status --verbose` previews the bumps)');
    return { name: '(dry run)' };
  }
  const before = new Map(rp.workspacePackages(root).map((p) => [p.name, p.version]));
  cs.convertFragments({ fragmentDir: path.join(root, cl.FRAGMENT_DIRNAME), changesetDir: path.join(root, cs.CHANGESET_DIRNAME) });
  run(CHANGESET_BIN, ['version'], { cwd: root });
  if (lock) run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root });
  const afterAll = rp.workspacePackages(root);
  const after = afterAll.find((p) => p.name === rp.ENGINE);
  if (isPrerelease(engine.version) && !isPrerelease(after.version) && !namesEngine) {
    throw new Error(
      `this release would move ${rp.ENGINE} ${engine.version} → ${after.version} although no pending changeset names the engine ` +
      '(a library bump left the engine\'s dependency range). The real release needs its own engine changeset; add one, or hold the ' +
      'library bump. Discard this working tree: nothing was committed.',
    );
  }
  const majors = afterAll.filter((p) => crossesMajor(before.get(p.name), p.version)).map((p) => `${p.name} ${before.get(p.name)} → ${p.version}`);
  return { name: after.version !== engine.version ? `v${after.version}` : `libraries-${date}`, majors };
}

/**
 * Does `from` → `to` cross a major line? For a 0.x package, reaching 1.0.0 counts: it ends the 0.x line.
 * A release that does waits for a human merge (release.yml), because the number is a promise to every user
 * and the old tool's history shows how often an entry is marked breaking by mistake (95 of 1,674 fragments).
 */
function crossesMajor(from, to) {
  if (!from || !to || from === to) return false;
  return Number(String(to).split('.')[0]) > Number(String(from).split('.')[0]);
}

function prepare({ root = ROOT, dry = false, skipChecks = false, registry, hasTag, build = true } = {}) {
  const problems = preflight(root);
  if (problems.length) {
    if (!dry) fail(problems, 'release refused');
    console.warn(`warning: a real --prepare would refuse:\n  - ${problems.join('\n  - ')}\n`);
  }
  if (!dry) {
    requireCleanTree(root);
    if (!skipChecks) run(process.execPath, [path.join(root, 'tools', 'build.js'), '--check', '--exclude-uncommitted'], { cwd: root });
  }
  const date = new Date().toISOString().slice(0, 10);
  const { mode, engine } = releaseMode(root, { registry, hasTag });
  const { name, majors = [] } = mode === 'bootstrap' ? bootstrapPrepare(root, { dry, date }) : versionPrepare(root, { dry, date, engine });
  if (dry) {
    console.log('\n[dry-run] no files changed.');
    return { mode, name };
  }
  if (build) run('npm', ['run', 'build'], { cwd: root });

  // The release surface: every manifest, every package CHANGELOG, the lock, both entry folders
  // and the archive. Anything else the build touched means the tree was stale before the release.
  const surface = [
    'package-lock.json', cs.CHANGESET_DIRNAME, cl.FRAGMENT_DIRNAME, 'changelog/pre-release-archive.md',
    ...rp.workspacePackages(root).flatMap((p) => [path.join(p.rel, 'package.json'), path.join(p.rel, 'CHANGELOG.md')]),
  ].filter((f) => fs.existsSync(path.join(root, f)) || git(['ls-files', f], { cwd: root }));
  git(['add', '--all', '--', ...surface], { cwd: root });
  const stray = git(['status', '--porcelain'], { cwd: root }).split('\n').filter((l) => l && l[1] !== ' ').map((l) => l.slice(3));
  if (stray.length) {
    throw new Error(`the build changed files outside the release surface:\n  ${stray.join('\n  ')}\n\`npm run build\` on a clean tree should be a no-op.`);
  }
  git(['commit', '-m', `release: ${name}`], { cwd: root });
  const version = rp.workspacePackages(root).find((p) => p.name === rp.ENGINE).version;
  emit({ version, name, branch: `release/${name}`, needs_review: String(majors.length > 0), majors: majors.join('; ') });
  if (majors.length) console.log(`\nMajor version crossed, so the release PR will NOT auto-merge:\n  ${majors.join('\n  ')}`);
  console.log(`\nPrepared ${name} (${mode}). Next: push the branch, open the PR, let the queue merge it; Release (publish) takes over.`);
  return { mode, name, version, majors };
}

// ── publish ──────────────────────────────────────────────────────────────────

/** What a publish run has to do: each publish-set package not on npm, or not tagged. */
function publishPlan(root, { registry = npmHasVersion, hasTag = (t) => tagExists(t, root) } = {}) {
  return rp.publishable(root)
    .map((p) => ({ ...p, onNpm: registry(p.name, p.version), tagged: hasTag(`${p.name}@${p.version}`) }))
    .filter((p) => !p.onNpm || !p.tagged);
}

function planCommand({ root = ROOT, registry, hasTag } = {}) {
  const problems = rp.publishSetProblems({ strict: true, root });
  if (problems.length) fail(problems, 'publish refused');
  const plan = publishPlan(root, { registry, hasTag });
  const engine = rp.workspacePackages(root).find((p) => p.name === rp.ENGINE);
  for (const p of plan) console.log(`  ${p.name}@${p.version}${p.onNpm ? ' (on npm; tag only)' : ''}`);
  if (!plan.length) console.log('Nothing to publish: every package is on npm and tagged.');
  // engine_due: the engine's GitHub Release is still to come, so the workflow checks its name is free first.
  const engineDue = plan.some((p) => p.name === rp.ENGINE) && !(hasTag || ((t) => tagExists(t, root)))(`v${engine.version}`);
  emit({ release: plan.length ? 'true' : 'false', version: engine.version, engine_due: String(engineDue) });
  return plan;
}

/**
 * Ask npm again, a few times, before calling a package missing. A brand-new package can read as a 404 for a
 * little while after `npm publish` succeeds (the registry's edge cache answered the plan's lookup a minute
 * earlier), and calling it missing would leave it untagged and the engine without its GitHub Release.
 */
function settledOnNpm(registry, name, version, retryMs, tries = 4) {
  for (let i = 0; i < tries; i++) {
    // A registry error (a timeout, a 5xx) here counts as "not yet", never as a crash: by now npm may already
    // hold every package, and throwing would skip pushing the tags and writing the workflow outputs. After the
    // last try the package is reported missing, which a re-run repairs.
    try {
      if (registry(name, version)) return true;
    } catch {
      // fall through to the retry
    }
    if (i < tries - 1 && retryMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs);
  }
  return false;
}

function publish({
  root = ROOT, dry = false, push = false, skipChecks = false, registry = npmHasVersion, hasTag, retryMs = 15000,
  changesetBin = CHANGESET_BIN,
} = {}) {
  hasTag = hasTag || ((t) => tagExists(t, root));
  if (!dry) requireCleanTree(root);
  if (!skipChecks) run(process.execPath, [path.join(root, 'tools', 'build.js'), '--check', '--exclude-uncommitted'], { cwd: root });
  const problems = rp.publishSetProblems({ strict: true, root });
  if (problems.length) fail(problems, 'publish refused');

  const plan = publishPlan(root, { registry, hasTag });
  if (!plan.length) {
    console.log('Nothing to publish: every package is on npm and tagged.');
    emit({ release: 'false', engine_released: 'false' });
    return { published: [], tags: [] };
  }
  console.log(`Publish plan${dry ? ' (DRY RUN: npm publish --dry-run, local tags only)' : ''}:`);
  for (const p of plan) console.log(`  ${p.name}@${p.version}${p.onNpm ? ' (already on npm; tag only)' : ''}`);

  const engine = plan.find((p) => p.name === rp.ENGINE);
  const vtag = engine ? `v${engine.version}` : null;
  // The engine's GitHub Release is due when `v<version>` does not exist yet. That covers the normal
  // run and the recovery run whose engine reached npm before the job died.
  const releaseDue = Boolean(engine && !hasTag(vtag));
  let notesFile = null;
  if (engine && !engine.onNpm && !releaseDue) {
    throw new Error(
      `${vtag} already tags ${git(['rev-list', '-n', '1', vtag], { cwd: root }).slice(0, 9)}, but ${engine.name}@${engine.version} ` +
      'is not on npm. That is the August tag: retire it first (issue #3449, release-day step 3: tag its commit v0.9.0, ' +
      `delete ${vtag}). Nothing was published.`,
    );
  }
  // Only a release commit can unlock a publish: each package going to npm must carry its `## <version>`
  // section, which `changeset version` (or the first release) writes in the release PR. Without this, a push
  // to main after the August tag was retired could publish whatever main held, with no changelog for it.
  const unprepared = plan.filter((p) => !p.onNpm && !changelogHasVersion(path.join(p.dir, 'CHANGELOG.md'), p.version));
  if (unprepared.length) {
    throw new Error(
      `${unprepared.map((p) => `${p.name}@${p.version}`).join(', ')} ha${unprepared.length === 1 ? 's' : 've'} no \`## <version>\` ` +
      'section in its CHANGELOG.md, so this is not a release commit. Cut one with Release (prepare). Nothing was published.',
    );
  }
  if (releaseDue) {
    if (isBootstrapVersion(engine.version) && !fs.existsSync(path.join(root, NOTES_DIR, `${BOOTSTRAP_VERSION}.md`))) {
      throw new Error(`${NOTES_DIR}/${BOOTSTRAP_VERSION}.md is missing; the first release ships its curated notes. Nothing was published.`);
    }
    // Notes and zip BEFORE npm: either failing must leave nothing half-published.
    fs.mkdirSync(path.join(root, 'release'), { recursive: true });
    notesFile = path.join(root, 'release', `notes-${vtag}.md`);
    // The release's packages: this run's plan, plus any a previous attempt at this same commit already
    // published and tagged (a recovery run), so the notes list the whole release, not only what was left.
    const atHead = new Set(git(['tag', '--points-at', 'HEAD'], { cwd: root }).split('\n').filter(Boolean));
    const shipped = rp.publishable(root).filter((p) => plan.some((q) => q.name === p.name) || atHead.has(`${p.name}@${p.version}`));
    fs.writeFileSync(notesFile, releaseNotes(root, engine.version, shipped));
    run(process.execPath, [path.join(root, 'tools', 'build-release-zip.js'), '--skip-check'], { cwd: root });
  }

  const env = { ...process.env };
  if (dry) env.npm_config_dry_run = 'true';
  // A pre-release engine takes the whole run to `next`: the libraries it ships with are its candidates too.
  // A libraries-only run keeps npm's default.
  // A recovery run at the candidate's own commit (the engine published and tagged, a library left over) is
  // still the candidate's run: the engine's tag on HEAD says so.
  const workspaceEngine = rp.workspacePackages(root).find((p) => p.name === rp.ENGINE);
  const engineAtHead = git(['tag', '--points-at', 'HEAD'], { cwd: root }).split('\n').includes(`${rp.ENGINE}@${workspaceEngine.version}`);
  const prerelease = isPrerelease(workspaceEngine.version) && Boolean(engine || engineAtHead);
  const publishArgs = prerelease ? ['publish', '--tag', PRERELEASE_DIST_TAG] : ['publish'];
  const status = plan.some((p) => !p.onNpm) ? run(changesetBin, publishArgs, { cwd: root, env, allowFail: true }) : 0;

  // Tag what npm now has. A dry run counts a successful `changeset publish` as "would publish".
  const tags = [];
  const missing = [];
  for (const p of plan) {
    const onNpm = p.onNpm || (dry ? status === 0 : settledOnNpm(registry, p.name, p.version, retryMs));
    if (!onNpm) { missing.push(`${p.name}@${p.version}`); continue; }
    const t = `${p.name}@${p.version}`;
    if (!hasTag(t)) git(['tag', t], { cwd: root });
    tags.push(t);
  }
  const engineReleased = releaseDue && !missing.includes(`${engine.name}@${engine.version}`);
  if (engineReleased && !hasTag(vtag)) { git(['tag', vtag], { cwd: root }); tags.push(vtag); }
  if (push && !dry && tags.length) run('git', ['push', 'origin', ...tags.map((t) => `refs/tags/${t}`)], { cwd: root });

  emit({ release: 'true', engine_released: String(engineReleased), version: engine ? engine.version : '', prerelease: String(prerelease) });
  console.log(`\n${dry ? '[dry-run] would publish and tag' : 'Tagged'}: ${tags.join(', ') || 'nothing'}${push && !dry ? ' (pushed)' : ''}`);
  if (notesFile) console.log(`  notes: ${path.relative(root, notesFile)}`);
  if (missing.length) {
    throw new Error(`not on npm after \`changeset publish\` (exit ${status}): ${missing.join(', ')}. Re-run Release (publish) to retry only these.`);
  }
  return { published: plan, tags, notesFile, engineReleased, distTag: prerelease ? PRERELEASE_DIST_TAG : null };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(argv = process.argv.slice(2)) {
  const has = (f) => argv.includes(f);
  const dry = has('--dry-run');
  const phases = ['--prepare', '--publish', '--plan'].filter(has);
  if (phases.length > 1) throw new Error(`pick one phase, not ${phases.join(' and ')}`);
  if (has('--bump') || argv.some((a) => a.startsWith('--bump='))) {
    throw new Error('--bump is gone: each changeset names its own bump (.changeset/README.md).');
  }
  if (has('--publish')) return publish({ dry, push: has('--push'), skipChecks: has('--skip-checks') });
  if (has('--plan')) return planCommand();
  if (has('--prepare') || dry) return prepare({ dry, skipChecks: has('--skip-checks') });
  throw new Error([
    'pick a phase. A release is cut in two steps, because main takes no direct pushes:',
    '  npm run release:dry        preview the next release, change nothing',
    '  npm run release:prepare    cut the release commit (then push a branch and open a PR)',
    '  npm run release:publish    after it merges: publish to npm, tag, push the tags',
    'See RELEASE.md § How to cut a release.',
  ].join('\n'));
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`release: ${e.message}`);
    process.exit(1);
  }
}

module.exports = {
  BOOTSTRAP_VERSION,
  PRERELEASE_DIST_TAG,
  isBootstrapVersion,
  isPrerelease,
  notesVersion,
  npmHasVersion,
  prependChangelogSection,
  changelogFirstLines,
  releaseNotes,
  releaseMode,
  crossesMajor,
  settledOnNpm,
  bootstrapPrepare,
  versionPrepare,
  prepare,
  publishPlan,
  planCommand,
  publish,
  main,
};
