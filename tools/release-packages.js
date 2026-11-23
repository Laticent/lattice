/**
 * Which `@laticent/*` packages a release publishes, and the checks that hold that list true.
 *
 * The owner set the 1.0.0 publish list on 2026-11-23 (issue #3449): the engine plus twelve
 * libraries, each on its own version line. Six more libraries exist and must NOT publish yet;
 * `.changeset/config.json` `ignore` holds them back, and each joins a later weekly release by
 * moving from `IGNORED` here and from `ignore` there, in one reviewed PR.
 *
 * Every workspace package is in exactly one of three places:
 *
 *   PUBLISH_SET    publishes. `changeset publish` puts it on npm when its version is not there.
 *   IGNORED        public in its package.json, but Changesets skips it (config `ignore`).
 *   private        `"private": true`. npm refuses to publish it, and so does Changesets.
 *
 * Two checks, one function. `publishSetProblems()` (the default, used by `build:check` and the
 * unit test) holds the classification on any commit, and tolerates the two PRs the 1.0.0 plan is
 * still waiting on: #3451 makes `markup` and `lastra` public, and the Segno desk's rename turns
 * `@laticent/segno-markdown` into `@laticent/segno-languages`. `{ strict: true }` is the release's
 * preflight: every package in PUBLISH_SET must exist and be public, so a release cut before those
 * PRs land stops before it opens a PR, rather than publishing an engine whose dependencies 404.
 *
 * Decision: engineering/decisions/2026-10-07-first-npm-release.md §11.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.changeset', 'config.json');
const ENGINE = '@laticent/lattice';

/** The owner's 1.0.0 list: the engine and twelve libraries (2026-11-23). */
const PUBLISH_SET = Object.freeze([
  ENGINE,
  '@laticent/cadenza',
  '@laticent/calco',
  '@laticent/fluido',
  '@laticent/lastra',
  '@laticent/lente',
  '@laticent/ltt',
  '@laticent/markup',
  '@laticent/mosaico',
  '@laticent/segno',
  '@laticent/segno-languages',
  '@laticent/squadra',
  '@laticent/trama',
]);

/** Public libraries that wait for a later weekly release. Must equal `.changeset/config.json` `ignore`. */
const IGNORED = Object.freeze([
  '@laticent/filo',
  '@laticent/fuoco',
  '@laticent/suono',
  '@laticent/tavola',
  '@laticent/vetrina',
  '@laticent/veduta',
]);

/**
 * Publish-set members the default check lets be private or missing, because an open PR fixes
 * each before 1.0.0. The strict check ignores this list. Delete an entry once its PR merges; a
 * stale entry is harmless but says something untrue.
 *   markup, lastra       #3451 drops `private`
 *   segno-languages      the Segno desk's rename of @laticent/segno-markdown (B9)
 */
const PENDING = Object.freeze(['@laticent/markup', '@laticent/lastra', '@laticent/segno-languages']);

/** A workspace that never publishes, mapped to the publish-set package that replaces it (B9). */
const PENDING_RENAMES = Object.freeze({ '@laticent/segno-markdown': '@laticent/segno-languages' });

/** Every workspace package: name, version, folder, private flag and `@laticent/*` runtime deps. */
function workspacePackages(root = ROOT) {
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return (rootManifest.workspaces || []).map((rel) => {
    const dir = path.join(root, rel);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })
      .filter((d) => d.startsWith('@laticent/'));
    return { name: pkg.name, version: pkg.version, rel, dir, private: pkg.private === true, deps };
  });
}

function readConfig(configPath = CONFIG_PATH) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Problems with the classification, as plain strings (empty = clean).
 * @param {{ strict?: boolean, root?: string, configPath?: string }} [opts]
 */
function publishSetProblems({ strict = false, root = ROOT, configPath = path.join(root, '.changeset', 'config.json') } = {}) {
  const problems = [];
  const pkgs = workspacePackages(root);
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  let config;
  try {
    config = readConfig(configPath);
  } catch (e) {
    return [`.changeset/config.json is unreadable: ${e.message}`];
  }

  const ignore = [...(config.ignore || [])].sort();
  if (JSON.stringify(ignore) !== JSON.stringify([...IGNORED].sort())) {
    problems.push(
      `.changeset/config.json \`ignore\` (${ignore.join(', ') || 'empty'}) differs from IGNORED in tools/release-packages.js ` +
      `(${IGNORED.join(', ')}). Move a library between the two lists in both files at once.`,
    );
  }
  if (config.privatePackages?.tag !== false) {
    problems.push('.changeset/config.json `privatePackages.tag` must be false: a private package gets no release tag.');
  }

  for (const p of pkgs) {
    const inSet = PUBLISH_SET.includes(p.name);
    const ignored = IGNORED.includes(p.name);
    if (inSet && ignored) problems.push(`${p.name} is in both PUBLISH_SET and IGNORED.`);
    // A public package that is in neither list would publish the first time anyone ran a release.
    if (!inSet && !ignored && !p.private) {
      problems.push(
        `${p.name} (${p.rel}) is public but in neither PUBLISH_SET nor IGNORED, so the next release would publish it ` +
        'without anyone deciding to. Add it to one list, or mark it "private": true.',
      );
    }
    if (inSet && p.private && (strict || !PENDING.includes(p.name))) {
      problems.push(`${p.name} is in PUBLISH_SET but "private": true, so npm would refuse it and the engine's install would 404.`);
    }
    // A published package that depends on an unpublished one installs with an E404. The default
    // check excuses a dependency that a pending rename replaces (segno-markdown, B9).
    if (inSet && !p.private) {
      for (const d of p.deps) {
        if (!byName.has(d) || PUBLISH_SET.includes(d)) continue;
        if (!strict && PENDING_RENAMES[d]) continue;
        problems.push(`${p.name} depends on ${d}, which is not in PUBLISH_SET, so installing ${p.name} from npm would fail.`);
      }
    }
  }
  for (const name of PUBLISH_SET) {
    if (!byName.has(name) && (strict || !PENDING.includes(name))) {
      problems.push(`${name} is in PUBLISH_SET but no workspace declares it.`);
    }
  }
  return problems;
}

/** The publish-set packages present in the workspace, ordered with the engine last. */
function publishable(root = ROOT) {
  return workspacePackages(root)
    .filter((p) => PUBLISH_SET.includes(p.name) && !p.private)
    .sort((a, b) => (a.name === ENGINE) - (b.name === ENGINE) || a.name.localeCompare(b.name));
}

module.exports = { ROOT, ENGINE, PUBLISH_SET, IGNORED, PENDING, PENDING_RENAMES, workspacePackages, publishSetProblems, publishable };
