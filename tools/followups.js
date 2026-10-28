#!/usr/bin/env node
/**
 * List and validate followups.d/ — the in-repo ledger of pending work that has no issue.
 *
 * A continuation brief used to tag an item `[no ticket]` and leave it only in a PR comment
 * and a chat transcript. In the two months before this ledger, 29 of 506 merged PRs left
 * 79 such items in their final brief, while 4 handoff issues were filed after #2215 made
 * them the rule. Each item now gets one file here, like changelog.d/: one file per item,
 * so parallel PRs never edit the same region. The PR that finishes an item deletes its file.
 * Contract: followups.d/README.md.
 *
 * The FORMAT IS DEFINED ONCE, here. `checkFollowups` in tools/check-ownership.js only
 * surfaces what `followupProblems()` reports, as checkChangelogFragments does for
 * tools/changelog.js.
 *
 * Usage:
 *   node tools/followups.js            # one line per item: area · severity · file · title
 *   node tools/followups.js --check    # exit 1 on a malformed item
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'followups.d');
const NAME = /^(\d+)-p(\d+)-[a-z0-9][a-z0-9-]*\.md$/;
// An item's EVIDENCE FOLDER: the same name without `.md`, beside it. It holds what a reader needs
// to reproduce the item's findings (scripts, fixtures, small data, notes), and it lives exactly as
// long as the item: the gate refuses a folder whose item is gone. Text only, and capped, so it stays
// an evidence kit rather than a corpus. Contract: followups.d/README.md §Evidence folders.
const EVIDENCE_NAME = /^(\d+)-p(\d+)-[a-z0-9][a-z0-9-]*$/;
const EVIDENCE_CAP = 512 * 1024;
// The fields a continuation brief carries per item (engineering/workflow.md §The continuation
// brief). A new item must carry `done when`: without an acceptance check, nobody can close it.
// Anchored to a line start, so a title that merely says "done when" does not count.
const REQUIRED_FIELD = /^\s*done when\s*—/im;

// The three fields that make an item ACTABLE without its origin PR open, in the issue
// taxonomy's own words (.github/labels.json), so promoting an item to an issue maps 1:1:
//   area     — one `area:*` label name, without the prefix. Read from labels.json, so a new
//              area needs no edit here.
//   severity — the `priority:*` word. `critical` is refused: "drop everything" needs a board
//              column and an owner, which is what an issue is for.
//   swimlane — the governing doc, as a repo path that must exist, optionally followed by a
//              section (`engineering/decisions/x.md §8.1`). It is the issue Definition of
//              Ready's swimlane field: without it a reader gets "the runbook is note §8.1"
//              and no way to find the note.
// `priority: P<n>` is a different thing and stays: the item's position in the brief that left it.
const SEVERITIES = ['high', 'medium', 'low'];

// WHY IT WAS NOT DONE NOW. A follow-up is a deferral, and HARD RULE #18 allows only three: the
// work is genuinely large, something outside this repo blocks it, or it is off the path of the
// change that found it. Small and moderate work on the path is fixed in the PR, not filed. Before
// this field, 149 items were filed in the 14 days to 2026-10-28, 89 of them `severity: low`
// (engineering/decisions/2026-10-28-raise-before-ask.md §4). The field names which exit the item
// takes and why, in one line:
//   deferred: large — <why it does not fit this PR>
//   deferred: blocked — <the thing outside our control it waits on>
//   deferred: off-path — <the surface, and why the change that found it does not touch it>
// The gate checks only the SHAPE; whether the reason is true is the reviewer's and the checker's.
// Items recorded before the rule are exempt by date AND origin, so the old ledger is not rewritten:
// a new item needs both an old date and an old origin PR to skip it.
const DEFERRED = /^(large|blocked|off-path)\s+—\s+\S/;
const DEFERRED_SINCE = { recorded: '2026-10-29', origin: 2952 };
const needsDeferred = (meta) => (meta.recorded || '') >= DEFERRED_SINCE.recorded || Number(meta.origin) > DEFERRED_SINCE.origin;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/** A file (not a folder) inside the repo. A `../` path or a directory is not a governing doc. */
function isRepoFile(root, rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return false;
  try { return fs.statSync(abs).isFile(); } catch { return false; }
}

/** The `area:*` names from .github/labels.json, without the prefix. */
function knownAreas(root = ROOT) {
  const labels = JSON.parse(fs.readFileSync(path.join(root, '.github', 'labels.json'), 'utf8'));
  return labels.map((l) => l.name).filter((n) => n.startsWith('area:')).map((n) => n.slice('area:'.length));
}

function parse(src) {
  // No CRLF handling: .gitattributes normalizes committed files to LF.
  const m = src.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  // Skip fenced blocks, so a `# comment` inside quoted material is not taken as the title.
  const prose = m[2].replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');
  const title = (prose.match(/^# (.+)$/m) || [])[1];
  return { meta, body: m[2], title };
}

/** Every item as { file, origin, priority, area, severity, swimlane, title }, sorted by file name. */
function listFollowups(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((file) => {
      const p = parse(fs.readFileSync(path.join(dir, file), 'utf8')) || { meta: {} };
      const { origin, priority, area, severity, swimlane } = p.meta;
      const readme = path.join(dir, file.replace(/\.md$/, ''), 'README.md');
      const evidence = fs.existsSync(readme) && fs.lstatSync(readme).isFile() && !fs.lstatSync(path.dirname(readme)).isSymbolicLink();
      return { file, origin, priority, area, severity, swimlane, title: p.title, backfill: p.meta.backfill === 'true', evidence };
    });
}

/** One string per defect. A missing followups.d/ is a defect too: a gate that scans nothing is also a claim. */
function followupProblems(dir = DIR, root = ROOT) {
  if (!fs.existsSync(dir)) return ['followups.d/ is missing — the ledger of unticketed pending work lives there (followups.d/README.md).'];
  const problems = [];
  const areas = knownAreas(root);
  for (const file of fs.readdirSync(dir)) {
    if (file === 'README.md') continue;
    const where = `followups.d/${file}`;
    const st = fs.lstatSync(path.join(dir, file));
    if (st.isSymbolicLink()) { problems.push(`${where}: a symbolic link; an item and its evidence are files and folders.`); continue; }
    if (st.isDirectory()) {
      problems.push(...evidenceProblems(dir, file));
      continue;
    }
    const name = file.match(NAME);
    if (!name) { problems.push(`${where}: name must be <origin-pr>-p<n>-<slug>.md (lower-case slug).`); continue; }
    const p = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!p) { problems.push(`${where}: needs YAML front matter between --- fences.`); continue; }
    if (p.meta.origin !== name[1]) problems.push(`${where}: front matter \`origin: ${name[1]}\` must match the file name.`);
    if (p.meta.priority !== `P${name[2]}`) problems.push(`${where}: front matter \`priority: P${name[2]}\` must match the file name.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.meta.recorded || '')) problems.push(`${where}: front matter needs \`recorded: YYYY-MM-DD\`.`);
    if (!p.title) problems.push(`${where}: needs one \`# <the change, one line>\` heading.`);
    if (!areas.includes(p.meta.area)) problems.push(`${where}: front matter needs \`area:\` set to one of ${areas.join(', ')} (.github/labels.json).`);
    if (p.meta.severity === 'critical') problems.push(`${where}: \`severity: critical\` belongs on an issue, not here. File one with priority:critical and delete this file.`);
    else if (!SEVERITIES.includes(p.meta.severity)) problems.push(`${where}: front matter needs \`severity:\` set to one of ${SEVERITIES.join(', ')}.`);
    const doc = (p.meta.swimlane || '').split(/\s+/)[0];
    if (!doc) problems.push(`${where}: front matter needs \`swimlane:\` — the governing doc, as a repo path.`);
    else if (!isRepoFile(root, doc)) problems.push(`${where}: \`swimlane: ${doc}\` is not a file in the repo.`);
    // Backfilled items are verbatim copies of older briefs, and one of them predates the
    // `done when` field. Rewriting it would change the record, so a backfill is exempt.
    if (p.meta.backfill !== 'true' && !REQUIRED_FIELD.test(p.body)) problems.push(`${where}: needs a \`done when\` line — the acceptance check a reviewer can run.`);
    if (needsDeferred(p.meta) && !DEFERRED.test(p.meta.deferred || '')) {
      problems.push(`${where}: front matter needs \`deferred: large|blocked|off-path — <why>\`. Small or moderate work on the path is fixed in the PR, not filed (HARD RULE #18, followups.d/README.md §Why it was not done now).`);
    }
  }
  return problems;
}

/**
 * The files under `rel` that git would see, as paths relative to `base`: what `git check-ignore`
 * reports is left out, so a `.DS_Store` or a local `node_modules/` the clean checkout never holds
 * does not fail the gate here and pass it in CI. Outside a repository nothing is ignored. Each path
 * goes in as `./name`: git reads a leading `:` as pattern syntax (`:(icase)x`), and fails the
 * whole batch on it.
 */
function visibleEntries(base, rel) {
  const entries = fs.readdirSync(path.join(base, rel)).map((e) => path.join(rel, e));
  if (!entries.length) return entries;
  const r = spawnSync('git', ['-C', base, 'check-ignore', '--stdin', '-z'], { input: entries.map((e) => `./${e}`).join('\0'), encoding: 'utf8' });
  // Exit 0: some are ignored; 1: none are; anything else (not a repository): treat none as ignored.
  const ignored = r.status === 0 ? new Set(r.stdout.split('\0').filter(Boolean).map((e) => e.replace(/^\.\//, ''))) : new Set();
  return entries.filter((e) => !ignored.has(e));
}

/**
 * The defects of one evidence folder: its name, its item, its README, and what it holds. A file
 * is text when its first 8 KB hold no NUL byte, which is how git itself tells binary from text.
 * Only what git would see counts (`visibleEntries`): a folder holding nothing else is no folder.
 */
function evidenceProblems(dir, name) {
  const where = `followups.d/${name}/`;
  const base = path.join(dir, name);
  const files = [];
  const problems = [];
  const walk = (rel) => {
    for (const r of visibleEntries(base, rel)) {
      const st = fs.lstatSync(path.join(base, r));
      if (st.isSymbolicLink()) problems.push(`${where}${r}: a symbolic link; evidence is a copy, not a pointer.`);
      else if (st.isDirectory()) walk(r);
      else if (st.isFile()) files.push([r, st.size]);
      else problems.push(`${where}${r}: not a regular file; evidence is text files and folders.`);
    }
  };
  walk('');
  if (!files.length && !problems.length) return [];
  if (!EVIDENCE_NAME.test(name)) return [`${where}: an evidence folder is named like its item without \`.md\` (<origin-pr>-p<n>-<slug>/).`];
  if (!fs.existsSync(path.join(dir, `${name}.md`))) {
    problems.unshift(`${where}: its item followups.d/${name}.md is gone. An evidence folder lives exactly as long as its item: delete it in the PR that deletes the item.`);
  }
  if (!files.some(([r]) => r === 'README.md')) {
    problems.push(`${where}: needs a README.md saying what the folder holds, the commit it ran against, and how to run it.`);
  }
  let bytes = 0;
  for (const [r, size] of files) {
    bytes += size;
    const fd = fs.openSync(path.join(base, r), 'r');
    const head = Buffer.alloc(Math.min(size, 8192));
    fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    if (head.includes(0)) problems.push(`${where}${r}: binary. Evidence folders hold text only (scripts, fixtures, data, notes).`);
  }
  if (bytes > EVIDENCE_CAP) problems.push(`${where}: ${bytes} bytes, over the ${EVIDENCE_CAP}-byte (${EVIDENCE_CAP / 1024} KB) cap. Keep the kit that reproduces the finding, not the corpus it ran on.`);
  return problems;
}

function main() {
  if (process.argv.includes('--check')) {
    const problems = followupProblems();
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(problems.length ? 1 : 0);
  }
  const items = listFollowups().sort((a, b) => (a.area || '~').localeCompare(b.area || '~')
    || (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || a.file.localeCompare(b.file));
  for (const i of items) console.log(`${i.area} · ${i.severity}  ·  ${i.file}${i.evidence ? ' (+ evidence/)' : ''}  ·  ${i.title}`);
  console.log(`\n${items.length} pending item(s) with no issue — contract: followups.d/README.md`);
  // A backfilled item was copied from an old brief and never checked against main, so it
  // may be done or duplicated. Say so on every listing until the triage pass clears them.
  const untriaged = items.filter((i) => i.backfill).length;
  if (untriaged) console.log(`⚠ ${untriaged} of them are backfilled and NEED TRIAGE (\`backfill: true\`): some are done or duplicated. Drop the flag once an item is checked.`);
}

if (require.main === module) main();

module.exports = { followupProblems, listFollowups, knownAreas, SEVERITIES, SEVERITY_RANK, EVIDENCE_CAP };
