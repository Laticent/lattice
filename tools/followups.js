#!/usr/bin/env node
/**
 * List and validate followups.d/ — the in-repo ledger of pending work that has no issue.
 *
 * A continuation brief used to tag an item `[no ticket]` and leave it only in a PR comment
 * and a chat transcript. In the two months before this ledger, 29 of 506 merged PRs left
 * 79 such items in their final brief, while 4 handoff issues were filed after #2215 made
 * them the rule. Each item now gets one file here, like changelog.d/: one file per item,
 * so parallel PRs never edit the same region. The PR that finishes an item deletes its file. Contract: followups.d/README.md.
 *
 * The FORMAT IS DEFINED ONCE, here. `checkFollowups` in tools/check-ownership.js only
 * surfaces what `followupProblems()` reports, as checkChangelogFragments does for
 * tools/changelog.js.
 *
 * Usage:
 *   node tools/followups.js            # one line per item: file · origin PR · title
 *   node tools/followups.js --check    # exit 1 on a malformed item
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'followups.d');
const NAME = /^(\d+)-p\d+-[a-z0-9][a-z0-9-]*\.md$/;
// The fields a continuation brief carries per item (engineering/workflow.md §The continuation
// brief). A new item must carry `done when`: without an acceptance check, nobody can close it.
const REQUIRED_FIELD = /\bdone when\b/i;

function parse(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  const title = (m[2].match(/^# (.+)$/m) || [])[1];
  return { meta, body: m[2], title };
}

/** Every item as { file, origin, priority, title }, sorted by file name. */
function listFollowups() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((file) => {
      const p = parse(fs.readFileSync(path.join(DIR, file), 'utf8')) || { meta: {} };
      return { file, origin: p.meta.origin, priority: p.meta.priority, title: p.title, backfill: p.meta.backfill === 'true' };
    });
}

/** One string per defect. A missing followups.d/ is a defect too: a gate that scans nothing is also a claim. */
function followupProblems() {
  if (!fs.existsSync(DIR)) return ['followups.d/ is missing — the ledger of unticketed pending work lives there (followups.d/README.md).'];
  const problems = [];
  for (const file of fs.readdirSync(DIR)) {
    if (file === 'README.md') continue;
    const where = `followups.d/${file}`;
    const name = file.match(NAME);
    if (!name) { problems.push(`${where}: name must be <origin-pr>-p<n>-<slug>.md (lower-case slug).`); continue; }
    const p = parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    if (!p) { problems.push(`${where}: needs YAML front matter between --- fences.`); continue; }
    if (p.meta.origin !== name[1]) problems.push(`${where}: front matter \`origin: ${name[1]}\` must match the file name.`);
    if (!/^P\d+$/.test(p.meta.priority || '')) problems.push(`${where}: front matter needs \`priority: P<n>\`.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.meta.recorded || '')) problems.push(`${where}: front matter needs \`recorded: YYYY-MM-DD\`.`);
    if (!p.title) problems.push(`${where}: needs one \`# <the change, one line>\` heading.`);
    // Backfilled items are verbatim copies of older briefs, and one of them predates the
    // `done when` field. Rewriting it would change the record, so a backfill is exempt.
    if (p.meta.backfill !== 'true' && !REQUIRED_FIELD.test(p.body)) problems.push(`${where}: needs a \`done when\` line — the acceptance check a reviewer can run.`);
  }
  return problems;
}

function main() {
  if (process.argv.includes('--check')) {
    const problems = followupProblems();
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(problems.length ? 1 : 0);
  }
  const items = listFollowups();
  for (const i of items) console.log(`${i.file}  ·  #${i.origin} ${i.priority}  ·  ${i.title}`);
  console.log(`\n${items.length} pending item(s) with no issue — contract: followups.d/README.md`);
  // A backfilled item was copied from an old brief and never checked against main, so it
  // may be done or duplicated. Say so on every listing until the triage pass clears them.
  const untriaged = items.filter((i) => i.backfill).length;
  if (untriaged) console.log(`⚠ ${untriaged} of them are backfilled and NEED TRIAGE (\`backfill: true\`): some are done or duplicated. Drop the flag once an item is checked.`);
}

if (require.main === module) main();

module.exports = { followupProblems, listFollowups };
