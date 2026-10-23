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
      const evidence = fs.existsSync(path.join(dir, file.replace(/\.md$/, ''), 'README.md'));
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
    if (fs.lstatSync(path.join(dir, file)).isDirectory()) {
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
  }
  return problems;
}

/**
 * The defects of one evidence folder: its name, its item, its README, and what it holds. A file
 * is text when its first 8 KB hold no NUL byte, which is how git itself tells binary from text.
 */
function evidenceProblems(dir, name) {
  const where = `followups.d/${name}/`;
  if (!EVIDENCE_NAME.test(name)) return [`${where}: an evidence folder is named like its item without \`.md\` (<origin-pr>-p<n>-<slug>/).`];
  const problems = [];
  if (!fs.existsSync(path.join(dir, `${name}.md`))) {
    problems.push(`${where}: its item followups.d/${name}.md is gone. An evidence folder lives exactly as long as its item: delete it in the PR that deletes the item.`);
  }
  if (!fs.existsSync(path.join(dir, name, 'README.md'))) {
    problems.push(`${where}: needs a README.md saying what the folder holds, the commit it ran against, and how to run it.`);
  }
  let bytes = 0;
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, name, rel))) {
      const r = path.join(rel, entry);
      const abs = path.join(dir, name, r);
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) problems.push(`${where}${r}: a symbolic link; evidence is a copy, not a pointer.`);
      else if (st.isDirectory()) walk(r);
      else {
        bytes += st.size;
        const head = fs.readFileSync(abs).subarray(0, 8192);
        if (head.includes(0)) problems.push(`${where}${r}: binary. Evidence folders hold text only (scripts, fixtures, data, notes).`);
      }
    }
  };
  walk('');
  if (bytes > EVIDENCE_CAP) problems.push(`${where}: ${(bytes / 1024).toFixed(0)} KB, over the ${EVIDENCE_CAP / 1024} KB cap. Keep the kit that reproduces the finding, not the corpus it ran on.`);
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
