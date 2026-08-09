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
 * CLI:
 *   node tools/changelog.js --bump          # print: major|minor|patch
 *   node tools/changelog.js --notes         # print the Unreleased body (release notes)
 *   node tools/changelog.js --check         # exit 0 if Unreleased has content, else 1
 *   node tools/changelog.js --next <semver> # print the next version for the computed bump
 *
 * Exports the pure functions for tools/release.js and the unit tests.
 */

const fs   = require('node:fs');
const path = require('node:path');

const PRECEDENCE = { patch: 0, minor: 1, major: 2 };

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
  const md = readChangelog();
  const section = extractUnreleased(md);
  if (!section) { console.error('error: no ## Unreleased section in CHANGELOG.md'); return 1; }

  if (argv.includes('--check')) {
    try { computeBump(section.body); return 0; }
    catch (e) { console.error(e.message); return 1; }
  }
  if (argv.includes('--bump')) {
    process.stdout.write(computeBump(section.body) + '\n');
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
    process.stdout.write(nextVersion(cur, computeBump(section.body)) + '\n');
    return 0;
  }
  console.error('usage: changelog.js [--bump | --notes | --check | --next <version>]');
  return 1;
}

module.exports = {
  extractUnreleased,
  extractVersion,
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
