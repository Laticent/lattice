#!/usr/bin/env node
/**
 * Deterministic changelog → semver-bump engine.
 *
 * The single source of truth for "what kind of release is this?" is the
 * `## Unreleased` section of CHANGELOG.md, kept in Keep-a-Changelog form
 * (### Added / Changed / Deprecated / Removed / Fixed / Security). This
 * module maps the categories present there to a bump level — no commit
 * parsing, no guessing — so a human writes the notes and the machine reads
 * the bump back out.
 *
 * Mapping (highest wins):
 *   major  — a `### Removed` section with content, OR any bullet flagged
 *            breaking (`**Breaking:**` lead, or the `BREAKING CHANGE` token).
 *            Matches the documented contract policy: removed/renamed exports,
 *            dropped themes, a raised Node floor, or a breaking change to a
 *            stable layout/token surface.
 *   minor  — `### Added`, `### Changed`, or `### Deprecated` with content.
 *            New components/themes/modifiers, additive exports, deprecations.
 *   patch  — only `### Fixed` / `### Security`. Bug/security fixes, internal
 *            (Mermaid CSS) churn.
 *
 * An empty `## Unreleased` is an error — there is nothing to release.
 *
 * WHERE NEW ENTRIES GO — `changelog.d/`, not this file's `## Unreleased`.
 * Appending to one shared section is what made `CHANGELOG.md` conflict on every
 * rebase and eject PR after PR from the merge queue (#1593: seven ejections in
 * one evening, every one a mechanical "keep both entries"). New entries are
 * written as per-PR FRAGMENT files — `changelog.d/<slug>.<category>.md` — which
 * two PRs never both touch, so the conflict cannot occur. The fragments are
 * folded into `## Unreleased` and deleted by the RELEASE, which is serialized;
 * nothing regenerates `CHANGELOG.md` per-PR, so this does not trade one
 * generated-from-everything artifact (#1594) for another.
 *
 * Everything below reads the two sources as ONE body: the bump, the notes and
 * the `--check` all see `## Unreleased` plus every pending fragment.
 *
 * CLI:
 *   node tools/changelog.js --bump          # print: major|minor|patch
 *   node tools/changelog.js --notes         # print the release notes (Unreleased + fragments)
 *   node tools/changelog.js --check         # exit 0 if there is releasable content, else 1
 *   node tools/changelog.js --fragments     # list the pending fragments, one per line
 *   node tools/changelog.js --next <semver> # print the next version for the computed bump
 *
 * Exports the pure functions for tools/release.js, tools/check-ownership.js and
 * the unit tests.
 */

const fs   = require('node:fs');
const path = require('node:path');

const PRECEDENCE = { patch: 0, minor: 1, major: 2 };

// ── Per-PR fragments (changelog.d/) ──────────────────────────────────────
//
// The CATEGORY LIVES IN THE FILENAME, not in front matter. That is the whole
// reason the bump stays trustworthy: deriving the release level is a readdir,
// so it cannot be confused by prose, and a category typo is a filename that
// matches no pattern — a loud gate failure, never a fragment silently binned
// as "unrecognized" and dropped from the bump.
const FRAGMENT_DIRNAME    = 'changelog.d';
const FRAGMENT_CATEGORIES = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];
const FRAGMENT_TITLES     = Object.fromEntries(
  FRAGMENT_CATEGORIES.map((c) => [c, c[0].toUpperCase() + c.slice(1)]),
);
// Keep-a-Changelog order — the order assembled sections appear in.
const FRAGMENT_ORDER = FRAGMENT_CATEGORIES;
const FRAGMENT_NAME_RE = new RegExp(`^([a-z0-9][a-z0-9._-]*?)\\.(${FRAGMENT_CATEGORIES.join('|')})\\.md$`);

const FRAGMENT_DIR = path.join(__dirname, '..', FRAGMENT_DIRNAME);

/**
 * EVERY file in `changelog.d/` except its own README, sorted by filename so
 * assembly is deterministic. `category` is null for a name that doesn't parse —
 * `fragmentProblems` is what rejects those; readers never guess.
 *
 * "Every file", not "every `.md`". A first cut filtered on `.endsWith('.md')`
 * BEFORE the pattern, which put a whole class of typo one character to the left
 * of the loud failure the README promises: `1699-x.changed.mdx` and
 * `1700-x.changed.md.bak` were skipped silently, never assembled, AND never
 * deleted by the release (it only removes fragments it read) — so an entry would
 * sit in the directory across every future release, invisible. Scanning
 * everything and rejecting what doesn't parse is the only shape where "a typo is
 * a gate failure" is true.
 */
function readFragments(dir = FRAGMENT_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== 'README.md')
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const m = FRAGMENT_NAME_RE.exec(name);
      return {
        file: path.join(dir, name),
        name,
        slug: m ? m[1] : null,
        category: m ? m[2] : null,
        body: fs.readFileSync(path.join(dir, name), 'utf8'),
      };
    });
}

/**
 * The gate's assertions, as plain strings (empty = clean). Lives here rather
 * than in check-ownership.js so the format has ONE definition: the same module
 * that assembles a fragment decides what a valid one looks like.
 *
 * Fails both ways, the SANCTIONED_* idiom: a malformed fragment errors, AND a
 * missing `changelog.d/` errors — a gate that scans nothing is also a claim
 * (the empty-scan guard from #1535 / #1547).
 */
function fragmentProblems(dir = FRAGMENT_DIR) {
  const problems = [];
  if (!fs.existsSync(dir)) {
    problems.push(
      `${FRAGMENT_DIRNAME}/ is missing — it is where every changelog entry now goes ` +
      `(HARD RULE #10). Restore it with its README; do not append to CHANGELOG.md \`## Unreleased\`.`,
    );
    return problems;
  }
  if (!fs.existsSync(path.join(dir, 'README.md'))) {
    problems.push(`${FRAGMENT_DIRNAME}/README.md is missing — the fragment contract has no written home.`);
  }
  for (const f of readFragments(dir)) {
    const at = `${FRAGMENT_DIRNAME}/${f.name}`;
    if (!f.category) {
      problems.push(
        `${at}: name does not parse as \`<slug>.<category>.md\`. The slug is lower-case ` +
        `[a-z0-9._-] and the category is one of ${FRAGMENT_CATEGORIES.join(' · ')} — ` +
        `e.g. \`1593-changelog-fragments.changed.md\`. The category picks the release bump, ` +
        `so an unparseable name is a dropped entry, not a cosmetic problem.`,
      );
      continue;
    }
    if (/\r/.test(f.body)) {
      problems.push(`${at}: carries CR line endings — fragments are LF-only (see engineering/decisions/2026-08-04-line-endings-lf-boundaries.md).`);
    }
    if (f.body.charCodeAt(0) === 0xfeff) problems.push(`${at}: starts with a BOM — fragments are plain LF UTF-8.`);
    const lines = f.body.split('\n');
    if (lines.some((l) => /^(<{7}|={7}|>{7})(\s|$)/.test(l))) {
      problems.push(`${at}: carries merge-conflict markers.`);
    }
    const heading = lines.find((l) => /^#{1,3}\s/.test(l));
    if (heading) {
      problems.push(
        `${at}: carries a markdown heading (\`${heading.trim()}\`). A fragment is bullets only — ` +
        `the \`### ${FRAGMENT_TITLES[f.category]}\` heading is written by the assembler at release time.`,
      );
    }
    if (!lines.some((l) => /^[-*]\s+\S/.test(l))) {
      problems.push(`${at}: has no top-level \`- \` bullet. A fragment is one or more Keep-a-Changelog bullets.`);
    }
  }
  return problems;
}

/**
 * Fold pending fragments into `## Unreleased` as ONE block at the TOP of the
 * section, `### <Category>` headings in Keep-a-Changelog order, exactly one
 * heading per category. Pure — returns new markdown, touches no files.
 *
 * TOP, not "appended to the matching heading wherever it already is". A first
 * cut reused any existing `### Changed` in the section, which on this corpus
 * put a brand-new entry ~1,700 lines down inside a year-old subsection — the
 * pre-1.0 `## Unreleased` is an accumulated log with several `###` blocks and
 * an `### Earlier (Unreleased)` tail, not one release's worth of notes. Newest
 * first is how every hand-appended entry landed and how the file reads.
 *
 * One heading per category is guaranteed by construction (the whole block is
 * emitted in one pass). The one cost: on this pre-1.0 corpus a category that
 * ALSO has an older `###` heading further down gets a second one above it —
 * cosmetic, in a section that already carries several, and gone at the first
 * release roll, which leaves `## Unreleased` empty.
 */
function assembleUnreleased(md, fragments = readFragments()) {
  const usable = fragments.filter((f) => f.category && f.body.trim());
  if (!usable.length) return md;
  const section = extractUnreleased(md);
  if (!section) throw new Error('no ## Unreleased section found in CHANGELOG.md');

  const byCategory = new Map();
  for (const f of usable) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f.body.replace(/\r/g, '').trim());
  }

  const block = [];
  for (const category of FRAGMENT_ORDER) {
    const bullets = byCategory.get(category);
    if (!bullets) continue;
    block.push(`### ${FRAGMENT_TITLES[category]}`, '', ...bullets.join('\n\n').split('\n'), '');
  }

  // Rebuild the section head rather than splicing into it: the blank run under
  // `## Unreleased` is normalized to exactly one, so assembling release after
  // release cannot stack blank lines.
  const lines = md.split('\n');
  const rest = lines.slice(section.start + 1, section.end);
  while (rest.length && !rest[0].trim()) rest.shift();
  lines.splice(section.start + 1, section.end - section.start - 1, '', ...block, ...rest);
  return lines.join('\n');
}

/** The releasable body: `## Unreleased` with every pending fragment folded in. */
function unreleasedWithFragments(md, fragments = readFragments()) {
  const section = extractUnreleased(assembleUnreleased(md, fragments));
  return section ? section.body : null;
}

/**
 * Slice out the body of the `## Unreleased` section: everything between its
 * heading and the next `## ` heading (a released version) or EOF.
 * Returns { start, end, body } with line indices into the source, or null
 * if there is no Unreleased heading.
 */
function extractUnreleased(md) {
  const lines = md.split('\n');
  const startLine = lines.findIndex((l) => /^##\s+\[?unreleased\]?\s*$/i.test(l));
  if (startLine === -1) return null;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^##\s+(?!#)/.test(lines[i])) { endLine = i; break; }
  }
  const body = lines.slice(startLine + 1, endLine).join('\n');
  return { start: startLine, end: endLine, body };
}

/**
 * Slice out the body of a RELEASED section — `## <version>`, with or without
 * the ` - <date>` suffix `rollUnreleased` writes and with or without the
 * `[1.2.3]` link form. Same shape as extractUnreleased, or null if absent.
 *
 * This is what lets the release notes be REDERIVED on main after the release
 * PR merges: the notes file lives in the gitignored release/ dir, so the
 * publish phase cannot inherit it from the prepare phase — it reads the
 * dated section the prepare phase committed instead.
 */
function extractVersion(md, version) {
  const v = String(version).trim().replace(/^v/, '');
  // Only ever called with package.json's version. Refuse anything that isn't
  // one, so a garbage input can't match `## Unreleased` and ship in-progress
  // notes as a release body.
  if (!/^\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/.test(v)) return null;
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+\\[?v?${escaped}\\]?\\s*(?:[-–—]\\s*\\S.*)?$`, 'i');
  const lines = md.split('\n');
  const startLine = lines.findIndex((l) => heading.test(l));
  if (startLine === -1) return null;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^##\s+(?!#)/.test(lines[i])) { endLine = i; break; }
  }
  return { start: startLine, end: endLine, body: lines.slice(startLine + 1, endLine).join('\n') };
}

/** A category heading has content if a `- `/`* ` bullet follows before the next heading. */
function categoriesWithContent(body) {
  const lines = body.split('\n');
  const found = new Set();
  let current = null;
  for (const line of lines) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) { current = h[1].toLowerCase(); continue; }
    if (current && /^\s*[-*]\s+\S/.test(line)) found.add(current);
  }
  return found;
}

/** True if any bullet is flagged breaking. */
function hasBreakingMarker(body) {
  return body
    .split('\n')
    .some((l) =>
      /^\s*[-*]\s+\*\*breaking/i.test(l) ||  // - **Breaking:** …
      /\bBREAKING CHANGE\b/.test(l),          // conventional footer token
    );
}

/** Map a category heading string to a bump level, or null if unrecognized. */
function levelForCategory(heading) {
  if (/\b(removed|breaking)\b/i.test(heading)) return 'major';
  if (/\b(added|changed|deprecated)\b/i.test(heading)) return 'minor';
  if (/\b(fixed|security)\b/i.test(heading)) return 'patch';
  return null;
}

/**
 * Compute the bump level from an Unreleased body. Throws if there is no
 * releasable content.
 */
function computeBump(body) {
  const cats = categoriesWithContent(body);
  if (cats.size === 0) {
    throw new Error('## Unreleased has no entries — nothing to release. Add changelog items first.');
  }
  let best = null;
  if (hasBreakingMarker(body)) best = 'major';
  for (const cat of cats) {
    const lvl = levelForCategory(cat);
    if (lvl && (best === null || PRECEDENCE[lvl] > PRECEDENCE[best])) best = lvl;
  }
  // A category with content but no recognized level (e.g. a custom heading)
  // still counts as releasable; treat it as at least a patch.
  if (best === null) best = 'patch';
  return best;
}

/** Increment a `x.y.z` (optionally `v`-prefixed) version by a bump level. */
function nextVersion(current, level) {
  const m = String(current).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`unparseable version: ${current}`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (level === 'major') { maj += 1; min = 0; pat = 0; }
  else if (level === 'minor') { min += 1; pat = 0; }
  else if (level === 'patch') { pat += 1; }
  else throw new Error(`unknown bump level: ${level}`);
  return `${maj}.${min}.${pat}`;
}

/** The release notes for the GitHub Release body = the trimmed Unreleased body. */
function releaseNotes(body) {
  return body.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * GitHub rejects a Release body over 125,000 characters. Lattice's
 * `## Unreleased` is currently the whole changelog (~1.4 MB of notes), so an
 * untrimmed body fails the release at its very last step — after the tag is
 * already pushed and unrepeatable. Trim on a line boundary and say so in the
 * body; the changelog remains the complete record either way.
 */
const RELEASE_BODY_MAX = 125000;

function fitReleaseBody(notes, version, max = RELEASE_BODY_MAX) {
  if (notes.length <= max) return { body: notes, truncated: false };
  const tail =
    '\n\n---\n\n' +
    `_Notes truncated to fit GitHub's ${max.toLocaleString('en-US')}-character limit. ` +
    `The complete entry is [\`CHANGELOG.md\` § ${version}](CHANGELOG.md)._\n`;
  const lines = notes.split('\n');
  let body = '';
  for (const line of lines) {
    if (body.length + line.length + 1 > max - tail.length) break;
    body += line + '\n';
  }
  return { body: body.trimEnd() + tail, truncated: true, keptLines: body.split('\n').length - 1 };
}

/**
 * Roll the changelog for a release: rename `## Unreleased` to
 * `## <version> - <date>` and seed a fresh empty `## Unreleased` above it.
 */
function rollUnreleased(md, version, dateStr) {
  const section = extractUnreleased(md);
  if (!section) throw new Error('no ## Unreleased section found in CHANGELOG.md');
  const lines = md.split('\n');
  const fresh = ['## Unreleased', '', `## ${version} - ${dateStr}`];
  lines.splice(section.start, 1, ...fresh);
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────
function readChangelog() {
  const p = path.join(__dirname, '..', 'CHANGELOG.md');
  return fs.readFileSync(p, 'utf8');
}

function main(argv) {
  const problems = fragmentProblems();
  if (problems.length) {
    console.error(`error: ${FRAGMENT_DIRNAME}/ has ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  const fragments = readFragments();

  if (argv.includes('--fragments')) {
    for (const f of fragments) process.stdout.write(`${f.category}\t${FRAGMENT_DIRNAME}/${f.name}\n`);
    return 0;
  }

  const md = readChangelog();
  // Every reader below sees ONE body: `## Unreleased` plus the pending fragments.
  const section = extractUnreleased(assembleUnreleased(md, fragments));
  if (!section) { console.error('error: no ## Unreleased section in CHANGELOG.md'); return 1; }

  if (argv.includes('--check')) {
    try { computeBump(section.body); return 0; }
    catch (e) { console.error(e.message); return 1; }
  }
  if (argv.includes('--bump')) {
    // `--check` has always caught this; --bump and --next threw a raw stack trace at
    // whoever ran them on an empty changelog. Now that adding an entry means adding a
    // FILE rather than editing one, "nothing to release" is a state a human reaches by
    // ordinary means, and it deserves the same one-line answer.
    try { process.stdout.write(`${computeBump(section.body)}\n`); }
    catch (e) { console.error(`error: ${e.message}`); return 1; }
    return 0;
  }
  if (argv.includes('--notes')) {
    process.stdout.write(releaseNotes(section.body));
    return 0;
  }
  const nextIdx = argv.indexOf('--next');
  if (nextIdx !== -1) {
    const cur = argv[nextIdx + 1];
    if (!cur) { console.error('error: --next requires a current version'); return 1; }
    try { process.stdout.write(`${nextVersion(cur, computeBump(section.body))}\n`); }
    catch (e) { console.error(`error: ${e.message}`); return 1; }
    return 0;
  }
  console.error('usage: changelog.js [--bump | --notes | --check | --fragments | --next <version>]');
  return 1;
}

module.exports = {
  extractUnreleased,
  extractVersion,
  FRAGMENT_DIRNAME,
  FRAGMENT_DIR,
  FRAGMENT_CATEGORIES,
  FRAGMENT_TITLES,
  FRAGMENT_NAME_RE,
  readFragments,
  fragmentProblems,
  assembleUnreleased,
  unreleasedWithFragments,
  categoriesWithContent,
  hasBreakingMarker,
  levelForCategory,
  computeBump,
  nextVersion,
  releaseNotes,
  fitReleaseBody,
  RELEASE_BODY_MAX,
  rollUnreleased,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
