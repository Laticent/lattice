#!/usr/bin/env node
/**
 * Generate backlog.d/ — the committed, one-way mirror of the open GitHub issue queue, one
 * file per open issue. The lock-in insurance from the kanban-light project-management model
 * (engineering/decisions/2026-06-14-github-project-management.md): issues own work *status*,
 * decision docs own *design*, and this mirror keeps a readable snapshot of the queue in the
 * repo so leaving GitHub costs zero knowledge. One-way: it never feeds back into issues.
 *
 * ONE FILE PER ISSUE, named by number, for two reasons. A reader opens the one card it needs
 * instead of a 66 KB list, and `npm run backlog` (tools/backlog.js) lists or filters the whole
 * queue, followups.d/ included. And a sync touches only the cards that changed, so its diff
 * says exactly which issues moved. Contract: backlog.d/README.md.
 *
 * The render is a PURE function of the issue list (no timestamps), so a scheduled run only
 * produces a commit when the queue actually changed.
 *
 * Issue data comes from `gh issue list` (in the sync-backlog workflow); this tool just shapes
 * it. Run it locally against a captured JSON to preview:
 *
 * Usage:
 *   gh issue list --state open --limit 1000 \
 *     --json number,title,labels,assignees,url,state,body | node tools/sync-backlog.js --input -
 *   node tools/sync-backlog.js --input issues.json                 # writes backlog.d/
 *   node tools/sync-backlog.js --input issues.json --out <dir>
 *   node tools/sync-backlog.js --input issues.json --check         # diff only, exit 1 on drift
 *
 * Flags:
 *   --input <file|->  Issues JSON (array). `-` reads stdin. Required for the CLI.
 *   --out <dir>       Output folder (default: backlog.d/ at repo root).
 *   --check           Render in memory and diff against --out; exit 1 on drift.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { parseForm } = require(path.join(ROOT, '.github', 'scripts', 'issue-form.js'));

// The kanban columns, in board order, keyed by their `status:` label. An open issue with no
// status label is written as `status: none`, so nothing falls off the board.
const COLUMNS = ['status:backlog', 'status:ready', 'status:in-progress', 'status:review'];

const labelNames = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

/** The column's slug, as written into a file's `status:` field. */
function statusSlug(issue) {
  const names = new Set(labelNames(issue));
  for (const label of COLUMNS) if (names.has(label)) return label.slice('status:'.length);
  return 'none';
}

const labelValues = (issue, prefix) =>
  labelNames(issue).filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length)).sort();

/** A field value that a missing parse leaves visibly missing, never silently blank. */
const orMissing = (v, what) => (v?.trim() ? v.trim() : `_missing — ${what}_`);

/**
 * One open issue's file: `backlog.d/<number>.md`. Named by NUMBER only, so a retitle edits the
 * file in place instead of renaming it. Pure: same issue, same bytes.
 *
 * Front matter carries the four taxonomy axes, so a reader can filter without opening GitHub.
 * The body carries a form's Summary and the two Definition of Ready fields (engineering/workflow.md
 * §Definition of Ready), parsed by the SAME parseForm the triage gate uses. The verdict can still
 * differ: the gate grandfathers old cards and exempts `feedback`, and this file does neither. The
 * rest of the issue body is not copied: the link has it, and every edit to a long discussion would
 * otherwise churn the mirror.
 */
function renderIssueFile(issue) {
  const form = parseForm(issue.body || '');
  const who = (issue.assignees || []).map((a) => (typeof a === 'string' ? a : a.login)).sort();
  const flags = labelNames(issue).filter((n) => n.startsWith('needs:')).sort();
  const meta = [
    ['issue', issue.number],
    ['status', statusSlug(issue)],
    ['area', labelValues(issue, 'area:').join(', ')],
    ['type', labelValues(issue, 'type:').join(', ')],
    ['priority', labelValues(issue, 'priority:').join(', ')],
    ['assignees', who.join(', ')],
    ['flags', flags.join(', ')],
    ['url', issue.url || ''],
  ];
  const title = String(issue.title || '').replace(/\s+/g, ' ').trim();
  const sections = [];
  if (form.summary?.trim()) sections.push(`## Summary\n\n${form.summary.trim()}`);
  sections.push(`## Swimlane\n\n${orMissing(form.swimlane, 'no governing doc on the issue')}`);
  sections.push(`## Done when\n\n${orMissing(form.acceptance, 'no acceptance check on the issue')}`);
  return `---\n${meta.map(([k, v]) => `${k}: ${v}`.trimEnd()).join('\n')}\n`
    + 'generated: tools/sync-backlog.js — do not edit; edit the issue\n---\n\n'
    + `# ${title}\n\n${sections.join('\n\n')}\n`;
}

/**
 * Every open issue as { '<number>.md': body }. backlog.d/README.md is hand-written and is
 * never part of the render, so the sync can neither write nor delete it.
 */
function renderBacklogFiles(issues) {
  const open = (issues || []).filter((i) => (i.state || 'OPEN').toUpperCase() !== 'CLOSED');
  const files = {};
  for (const issue of open.sort((a, b) => a.number - b.number)) files[`${issue.number}.md`] = renderIssueFile(issue);
  return files;
}

/** The generated files currently in `dir` (every `<number>.md`; README.md is not one). */
function existingFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => GENERATED.test(f)).sort();
}
const GENERATED = /^\d+\.md$/;

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { input: null, out: path.join(ROOT, 'backlog.d'), check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--check') args.check = true;
  }
  return args;
}

function readInput(input) {
  const raw = input === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(input, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('expected a JSON array of issues');
  return data;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('sync-backlog: --input <file|-> is required (issues JSON from `gh issue list`).');
    process.exit(2);
  }
  const files = renderBacklogFiles(readInput(args.input));
  const stale = existingFiles(args.out).filter((f) => !(f in files));
  const rel = path.relative(ROOT, args.out);

  if (args.check) {
    const drift = Object.entries(files)
      .filter(([f, body]) => !fs.existsSync(path.join(args.out, f)) || fs.readFileSync(path.join(args.out, f), 'utf8') !== body)
      .map(([f]) => f);
    if (drift.length || stale.length) {
      console.error(`✗ ${rel}/ is stale relative to the open issue queue: ${drift.length} file(s) to write, ${stale.length} to delete. Run: npm run sync:backlog`);
      process.exit(1);
    }
    process.exit(0);
  }

  fs.mkdirSync(args.out, { recursive: true });
  for (const [f, body] of Object.entries(files)) {
    const p = path.join(args.out, f);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== body) fs.writeFileSync(p, body);
  }
  for (const f of stale) fs.unlinkSync(path.join(args.out, f)); // a closed issue's file goes
  console.log(`[sync-backlog] ${rel}/: ${Object.keys(files).length} open issue(s), ${stale.length} closed file(s) removed`);
}

if (require.main === module) main();

module.exports = { renderBacklogFiles, renderIssueFile, statusSlug, existingFiles };
