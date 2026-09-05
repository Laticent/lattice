#!/usr/bin/env node
/**
 * Generate BACKLOG.md — the committed, one-way mirror of the open GitHub
 * issue queue. The lock-in insurance from the kanban-light project-management
 * model (engineering/decisions/2026-06-14-github-project-management.md):
 * issues own work *status*, decision docs own *design*, and this mirror keeps
 * a readable snapshot of the queue in the repo so leaving GitHub costs zero
 * knowledge. One-way: it never feeds back into issues.
 *
 * The render is a PURE function of the issue list (no timestamps), so a
 * scheduled run only produces a commit when the queue actually changed.
 *
 * Issue data comes from `gh issue list` (in the sync-backlog workflow); this
 * tool just shapes it. Run it locally against a captured JSON to preview:
 *
 * Usage:
 *   gh issue list --state open --limit 1000 \
 *     --json number,title,labels,assignees,url | node tools/sync-backlog.js --input -
 *   node tools/sync-backlog.js --input issues.json        # from a file
 *   node tools/sync-backlog.js --input issues.json --out BACKLOG.md
 *   node tools/sync-backlog.js --input issues.json --check # diff only, exit 1 on drift
 *
 * Flags:
 *   --input <file|->  Issues JSON (array). `-` reads stdin. Required for the CLI.
 *   --out <file>      Output path (default: BACKLOG.md at repo root).
 *   --check           Render in memory and diff against --out; exit 1 on drift.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// The kanban columns, in board order, keyed by their `status:` label. Open
// issues with no status label land in "Inbox" so nothing falls off the board.
const COLUMNS = [
  ['status:backlog', 'Backlog'],
  ['status:ready', 'Ready'],
  ['status:in-progress', 'In progress'],
  ['status:review', 'In review'],
];
const INBOX = 'Inbox (no status)';

// Priority order for sorting within a column (most urgent first). Issues with
// no priority label sort last.
const PRIORITY_RANK = { 'priority:critical': 0, 'priority:high': 1, 'priority:medium': 2, 'priority:low': 3 };

const labelNames = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

/** The board column an issue belongs to (its `status:` label, else Inbox). */
function columnFor(issue) {
  const names = new Set(labelNames(issue));
  for (const [label, title] of COLUMNS) if (names.has(label)) return title;
  return INBOX;
}

/** Short priority/area/assignee suffix for a backlog line. */
function metaFor(issue) {
  const names = labelNames(issue);
  const bits = [];
  const prio = names.find((n) => n.startsWith('priority:'));
  if (prio) bits.push(prio.slice('priority:'.length));
  const areas = names.filter((n) => n.startsWith('area:')).map((n) => n.slice('area:'.length));
  if (areas.length) bits.push(areas.join(', '));
  const who = (issue.assignees || []).map((a) => (typeof a === 'string' ? a : a.login));
  if (who.length) bits.push(who.map((u) => `@${u}`).join(' '));
  return bits;
}

function sortIssues(a, b) {
  const names = (i) => labelNames(i);
  const rank = (i) => {
    const p = names(i).find((n) => n.startsWith('priority:'));
    return p && p in PRIORITY_RANK ? PRIORITY_RANK[p] : 99;
  };
  return rank(a) - rank(b) || a.number - b.number;
}

/**
 * Render the full BACKLOG.md body from an array of open issues. Pure — same
 * input always yields the same bytes (no timestamps), so it only churns when
 * the queue changes.
 */
function renderBacklog(issues) {
  const open = (issues || []).filter((i) => (i.state || 'OPEN').toUpperCase() !== 'CLOSED');
  const byColumn = new Map([...COLUMNS.map(([, t]) => t), INBOX].map((t) => [t, []]));
  for (const issue of open) byColumn.get(columnFor(issue)).push(issue);

  // Surface the triage queue at the top — PUSH the intake gate's flag into the
  // committed mirror instead of relying on someone pulling a board filter. The
  // banner is part of the pure render, so it appears and clears automatically as
  // `needs:triage` cards come and go (sync-backlog re-runs on every label event).
  const needTriage = open
    .filter((i) => labelNames(i).includes('needs:triage'))
    .sort((a, b) => a.number - b.number);
  const triageBanner = needTriage.length
    ? `> ⚠️ **${needTriage.length} card${needTriage.length === 1 ? '' : 's'} need triage** ` +
      `(missing \`area:\`/\`type:\`/\`priority:\`): ` +
      `${needTriage.map((i) => `[#${i.number}](${i.url || '#'})`).join(', ')}.\n\n`
    : '';

  const sections = [];
  for (const title of [...COLUMNS.map(([, t]) => t), INBOX]) {
    const rows = byColumn.get(title).sort(sortIssues);
    sections.push(`## ${title} (${rows.length})\n`);
    if (!rows.length) {
      sections.push('_none_\n');
      continue;
    }
    for (const issue of rows) {
      const meta = metaFor(issue);
      const suffix = meta.length ? ` — ${meta.join(' · ')}` : '';
      const link = issue.url ? `[#${issue.number}](${issue.url})` : `#${issue.number}`;
      sections.push(`- ${link} ${issue.title}${suffix}`);
    }
    sections.push('');
  }

  return `<!-- Auto-generated by tools/sync-backlog.js — DO NOT EDIT.
     The one-way mirror of the open GitHub issue queue. Issues are the source
     of truth for work status; this file is a committed snapshot regenerated by
     the sync-backlog workflow. See engineering/workflow.md § Work queue. -->

# Backlog

The live, claimable work queue — a read-only mirror of [open issues](https://github.com/Laticent/lattice/issues),
grouped by board column. Design lives in \`engineering/decisions/\`; this tracks
only *status*. **${open.length} open** item${open.length === 1 ? '' : 's'}.

${triageBanner}${sections.join('\n').trimEnd()}\n`;
}

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { input: null, out: path.join(ROOT, 'BACKLOG.md'), check: false };
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
  const body = renderBacklog(readInput(args.input));

  if (args.check) {
    const current = fs.existsSync(args.out) ? fs.readFileSync(args.out, 'utf8') : '';
    if (current !== body) {
      console.error(`✗ ${path.relative(ROOT, args.out)} is stale relative to the open issue queue. Run: npm run sync:backlog`);
      process.exit(1);
    }
    process.exit(0);
  }

  fs.writeFileSync(args.out, body);
  console.log(`[sync-backlog] wrote ${path.relative(ROOT, args.out)}`);
}

if (require.main === module) main();

module.exports = { renderBacklog, columnFor, metaFor, COLUMNS, INBOX };
