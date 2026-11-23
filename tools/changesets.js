/**
 * The changeset side of HARD RULE #10: what a valid `.changeset/*.md` looks like, how a legacy
 * `changelog.d/` fragment becomes one, and how pending entries are archived.
 *
 * A changeset is the file `changeset add` writes:
 *
 *   ---
 *   "@laticent/lattice": minor
 *   "@laticent/ltt": patch
 *   ---
 *
 *   Charts now render in dark mode without a second pass.
 *
 *   Engineering detail, as long as it needs to be. Only the first line reaches the release notes.
 *
 * Fragments still work (issue #3449: 19 open PRs carried them on the cutover day). The release
 * converts each pending fragment into a changeset for `@laticent/lattice` before it runs
 * `changeset version`, with the bump its filename's category always picked (`tools/changelog.js`
 * `levelForCategory`, and `**Breaking:**` for major). Converting is mechanical, so a PR that
 * carries a fragment needs no change.
 *
 * Decision: engineering/decisions/2026-10-07-first-npm-release.md §11.
 */
const fs = require('node:fs');
const path = require('node:path');
const cl = require('./changelog.js');
const { PUBLISH_SET, ENGINE, workspacePackages } = require('./release-packages.js');

// Changesets' own changeset reader (ESM; Node >= 22.12 loads it with require, and the engines floor is 22.13).
// The gate runs it so a changeset `changeset version` would reject fails when it lands, not on release day.
const changesetsParseModule = require('@changesets/parse');
const changesetsParse = changesetsParseModule.default || changesetsParseModule;

const ROOT = path.resolve(__dirname, '..');
const CHANGESET_DIRNAME = '.changeset';
const CHANGESET_DIR = path.join(ROOT, CHANGESET_DIRNAME);
const ARCHIVE = path.join(ROOT, 'changelog', 'pre-release-archive.md');
const BUMPS = ['patch', 'minor', 'major'];
/** Files in `.changeset/` that are not changesets. */
const NOT_CHANGESETS = new Set(['README.md', 'config.json']);

/**
 * Parse one changeset. Returns `{ releases: [{ name, type }], summary }`, or `{ error }`.
 * Same grammar Changesets reads (`@changesets/parse`): a `---` front matter of `"name": bump`
 * lines, then the summary.
 */
function parseChangeset(text) {
  const m = /^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/.exec(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  if (!m) return { error: 'does not open with a `---` front matter block' };
  const releases = [];
  for (const raw of m[1].split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const r = /^(["']?)(@?[a-z0-9][\w./-]*)\1\s*:\s*(\w+)$/.exec(line);
    if (!r) return { error: `front matter line \`${line}\` is not \`"<package>": patch|minor|major\`` };
    releases.push({ name: r[2], type: r[3] });
  }
  return { releases, summary: m[2].trim() };
}

/** Every changeset file in `dir`, sorted by name. */
function readChangesets(dir = CHANGESET_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !NOT_CHANGESETS.has(e.name) && !e.name.endsWith('.cjs'))
    .map((e) => e.name)
    .sort()
    .map((name) => ({ name, file: path.join(dir, name), text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/**
 * The gate's assertions (empty = clean). A changeset the release cannot read would fail
 * `changeset version` on release day, after the queue had landed every PR, so the gate reads
 * each one when it lands instead.
 */
function changesetProblems(dir = CHANGESET_DIR, publishSet = PUBLISH_SET, versions = currentVersions()) {
  const problems = [];
  if (!fs.existsSync(path.join(dir, 'config.json'))) {
    problems.push(`${CHANGESET_DIRNAME}/config.json is missing — Changesets cannot run without it.`);
  }
  if (!fs.existsSync(path.join(dir, 'README.md'))) {
    problems.push(`${CHANGESET_DIRNAME}/README.md is missing — the changeset contract has no written home.`);
  }
  for (const c of readChangesets(dir)) {
    const at = `${CHANGESET_DIRNAME}/${c.name}`;
    if (!c.name.endsWith('.md')) {
      problems.push(`${at}: is not a .md file. Changesets reads \`.changeset/*.md\` only, so this entry would never release.`);
      continue;
    }
    if (/\r/.test(c.text)) problems.push(`${at}: carries CR line endings — changesets are LF-only.`);
    if (c.text.charCodeAt(0) === 0xfeff) problems.push(`${at}: starts with a BOM — changesets are plain LF UTF-8.`);
    if (c.text.split('\n').some((l) => /^(<{7}|={7}|>{7})(\s|$)/.test(l))) problems.push(`${at}: carries merge-conflict markers.`);
    const parsed = parseChangeset(c.text);
    if (parsed.error) {
      problems.push(`${at}: ${parsed.error}.`);
      continue;
    }
    // Then Changesets' own reader, which is what `changeset version` uses: its YAML rejects what the grammar
    // above lets through, an unquoted `@scope/name` key or a package named twice.
    try {
      changesetsParse(c.text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
    } catch (e) {
      problems.push(`${at}: Changesets cannot read it (${String(e.message).split('\n')[0]}). Quote each package name, once each: "@laticent/ltt": patch.`);
      continue;
    }
    // An empty changeset (`changeset add --empty`) records "nothing to release"; it is valid.
    if (!parsed.releases.length) continue;
    for (const r of parsed.releases) {
      if (!publishSet.includes(r.name)) {
        problems.push(
          `${at}: names ${r.name}, which does not publish. A changeset may name only ${publishSet.join(', ')} ` +
          '(tools/release-packages.js PUBLISH_SET); `changeset version` would fail on release day.',
        );
      }
      if (!BUMPS.includes(r.type)) problems.push(`${at}: bump \`${r.type}\` for ${r.name} is not patch, minor or major.`);
      // Changesets takes a `major` on 0.1.0 to 1.0.0, which ends the library's 0.x line for good. Under semver a
      // 0.x library breaks in a minor; leaving 0.x is a decision for its own reviewed PR, not a side effect.
      if (r.type === 'major' && /^0\./.test(versions.get(r.name) || '')) {
        problems.push(
          `${at}: \`major\` for ${r.name} (${versions.get(r.name)}) would release it as 1.0.0. A breaking change to a 0.x ` +
          'library takes `minor` (.changeset/README.md); moving a library to 1.0 is its own decision.',
        );
      }
    }
    const first = parsed.summary.split('\n')[0] || '';
    if (!first.trim()) {
      problems.push(`${at}: has no summary. Its first line is what the release notes print.`);
    } else if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>)/.test(first)) {
      problems.push(
        `${at}: the first line (\`${first.slice(0, 60)}\`) is a heading, bullet or quote. It must be one plain ` +
        'sentence: the release notes print it as a bullet of their own.',
      );
    }
  }
  return problems;
}

/** Each workspace package's version, by name; empty when the repository cannot be read (a fixture). */
function currentVersions() {
  try {
    return new Map(workspacePackages(ROOT).map((p) => [p.name, p.version]));
  } catch {
    return new Map();
  }
}

/** The bump a fragment always picked: `**Breaking:**` is major, otherwise its category's level. */
function fragmentBump(fragment) {
  if (cl.hasBreakingMarker(fragment.body)) return 'major';
  return cl.levelForCategory(fragment.category) || 'patch';
}

/**
 * A fragment as a changeset for the engine. The first bullet's text is the first line; every
 * other line keeps its wording.
 */
function fragmentToChangeset(fragment) {
  if (!fragment.category) throw new Error(`changelog.d/${fragment.name}: name does not parse; run build:check`);
  const lines = fragment.body.replace(/\r/g, '').trim().split('\n');
  // The first bullet's paragraph, unwrapped onto ONE line: fragments wrap at ~80 columns, and the
  // release notes print a changeset's first line, so a wrapped first line would print half a sentence.
  let end = 1;
  while (end < lines.length && /^ {2,}\S/.test(lines[end]) && !/^ {2,}[-*]\s/.test(lines[end])) end++;
  const first = lines.slice(0, end).map((l, i) => (i ? l.trim() : l.replace(/^[-*]\s+/, ''))).join(' ');
  // The rest keeps its wording; continuation lines lose the two-space bullet indent.
  const rest = lines.slice(end).map((l) => (/^ {2}\S/.test(l) ? l.slice(2) : l));
  const summary = [first, ...rest].join('\n');
  return {
    name: `fragment-${fragment.slug}-${fragment.category}.md`,
    text: `---\n"${ENGINE}": ${fragmentBump(fragment)}\n---\n\n${summary}\n`,
  };
}

/**
 * Write each pending fragment as a changeset and delete the fragment. Returns the names written.
 * Refuses on a malformed fragment rather than dropping its entry from a release.
 */
function convertFragments({ fragmentDir = path.join(ROOT, cl.FRAGMENT_DIRNAME), changesetDir = CHANGESET_DIR } = {}) {
  const problems = cl.fragmentProblems(fragmentDir);
  if (problems.length) throw new Error(`changelog.d/ has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  const written = [];
  for (const f of cl.readFragments(fragmentDir)) {
    if (!f.body.trim()) continue;
    const c = fragmentToChangeset(f);
    const dest = path.join(changesetDir, c.name);
    if (fs.existsSync(dest)) throw new Error(`${CHANGESET_DIRNAME}/${c.name} already exists; refusing to overwrite it`);
    fs.writeFileSync(dest, c.text);
    fs.rmSync(f.file);
    written.push(c.name);
  }
  return written;
}

/**
 * Append a block to the pre-release archive under `heading`, after a blank line. The archive is
 * frozen history: entries keep their wording and order.
 */
function appendToArchive(heading, intro, body, archive = ARCHIVE) {
  const prior = fs.readFileSync(archive, 'utf8').replace(/\n+$/, '\n');
  fs.writeFileSync(archive, `${prior}\n## ${heading}\n\n${intro.trim()}\n\n${body.trim()}\n`);
}

/** Fragments as Keep-a-Changelog markdown: one `###` block per category, in the usual order. */
function fragmentsAsMarkdown(fragments) {
  const out = [];
  for (const category of cl.FRAGMENT_CATEGORIES) {
    const bodies = fragments.filter((f) => f.category === category && f.body.trim()).map((f) => f.body.replace(/\r/g, '').trim());
    if (bodies.length) out.push(`### ${category[0].toUpperCase()}${category.slice(1)}`, '', bodies.join('\n\n'), '');
  }
  return out.join('\n').trim();
}

/** Changesets as markdown: each as a bullet naming its packages, the summary under it. */
function changesetsAsMarkdown(changesets) {
  return changesets
    .map((c) => {
      const p = parseChangeset(c.text);
      if (p.error) throw new Error(`${CHANGESET_DIRNAME}/${c.name}: ${p.error}`);
      if (!p.releases.length) return null;
      const [first, ...rest] = p.summary.split('\n');
      const who = p.releases.map((r) => `${r.name} ${r.type}`).join(', ');
      return [`- ${first} (${who})`, ...rest.map((l) => (l ? `  ${l}` : ''))].join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  CHANGESET_DIRNAME,
  CHANGESET_DIR,
  ARCHIVE,
  parseChangeset,
  readChangesets,
  changesetProblems,
  fragmentBump,
  fragmentToChangeset,
  convertFragments,
  appendToArchive,
  fragmentsAsMarkdown,
  changesetsAsMarkdown,
};
