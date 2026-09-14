#!/usr/bin/env node
/**
 * Audit the open issue queue against the Definition of Ready, and replay the
 * intake gate over it.
 *
 * The intake bar (engineering/workflow.md § The intake bar) was justified by
 * numbers — how many open cards nobody can pull, and how many the grandfathering
 * cutoff spares. A number asserted in a PR body stops being checkable the moment
 * the session ends, so this is the script that produces them. It answers two
 * questions:
 *
 *   1. HOW BAD IS IT — how many open cards carry the two Definition-of-Ready
 *      fields, and which field is missing when they do not. (Measured 2026-09-14:
 *      318 open, 100 pass, 218 fail, and all 218 were missing the SWIMLANE.)
 *   2. WHAT WOULD THE GATE DO — replay computeTriage over every card as filed and
 *      count the `needs:definition` flags, with the cutoff and without it. That
 *      difference is the blast radius grandfathering buys.
 *
 * It reads the SAME issue JSON as tools/sync-backlog.js, plus `createdAt` /
 * `created_at`, so one fetch feeds both. It never writes to GitHub.
 *
 * Usage:
 *   gh issue list --state open --limit 1000 \
 *     --json number,title,body,labels,createdAt | node tools/audit-queue-dor.js --input -
 *   node tools/audit-queue-dor.js --input issues.json          # from a file
 *   node tools/audit-queue-dor.js --input issues.json --list    # print the failing numbers
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseForm } = require(path.join(__dirname, '..', '.github', 'scripts', 'issue-form.js'));
const { computeTriage, DOR_CUTOFF } = require(path.join(__dirname, '..', '.github', 'scripts', 'triage.js'));

const labelNames = (i) => (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
const createdAt = (i) => i.createdAt || i.created_at;

/**
 * @param {object[]} issues open issues (pull requests must already be filtered out)
 * @returns the DoR tally plus the flag counts with and without the cutoff
 */
function auditQueue(issues) {
  const open = (issues || []).filter((i) => !i.pull_request);
  const fail = { both: [], swimlane: [], acceptance: [] };
  let pass = 0;
  let flaggedLive = 0;
  let flaggedAgeBlind = 0;

  for (const issue of open) {
    const form = parseForm(issue.body || '');
    if (form.swimlane && form.acceptance) pass++;
    else if (!form.swimlane && !form.acceptance) fail.both.push(issue.number);
    else if (!form.swimlane) fail.swimlane.push(issue.number);
    else fail.acceptance.push(issue.number);

    // Replay the DoR arm as if the card were arriving now. The card's real labels
    // are passed through, minus the flag itself: the axes do not influence this
    // arm at all, but `feedback` does — it is the exemption — so dropping the
    // labels entirely would count an exempt end-user report as flagged.
    const asFiled = { labels: labelNames(issue).filter((n) => n !== 'needs:definition'), form };
    if (computeTriage({ ...asFiled, createdAt: createdAt(issue) }).add.includes('needs:definition')) {
      flaggedLive++;
    }
    // The counterfactual: the same card with the cutoff disabled. Passing the
    // cutoff itself is the cheapest way to say "as if every card were new".
    if (computeTriage({ ...asFiled, createdAt: DOR_CUTOFF }).add.includes('needs:definition')) {
      flaggedAgeBlind++;
    }
  }

  const failing = fail.both.length + fail.swimlane.length + fail.acceptance.length;
  return { open: open.length, pass, failing, fail, flaggedLive, flaggedAgeBlind };
}

function report(a, { list = false } = {}) {
  const lines = [
    `open issues:              ${a.open}`,
    `meet the DoR:             ${a.pass}`,
    `fail it:                  ${a.failing}`,
    `  missing both fields:    ${a.fail.both.length}`,
    `  missing swimlane only:  ${a.fail.swimlane.length}`,
    `  missing acceptance only:${a.fail.acceptance.length}`,
    '',
    `intake gate replay (DOR_CUTOFF = ${DOR_CUTOFF}):`,
    `  flagged as it stands:   ${a.flaggedLive}`,
    `  flagged if age-blind:   ${a.flaggedAgeBlind}   <- the storm grandfathering avoids`,
  ];
  if (list) {
    lines.push('', `failing card numbers: ${[...a.fail.both, ...a.fail.swimlane, ...a.fail.acceptance].sort((x, y) => x - y).join(', ')}`);
  }
  return lines.join('\n');
}

function main(argv) {
  const at = argv.indexOf('--input');
  if (at === -1 || !argv[at + 1]) {
    console.error('usage: audit-queue-dor.js --input <file|-> [--list]');
    process.exit(64);
  }
  const src = argv[at + 1];
  const raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  console.log(report(auditQueue(JSON.parse(raw)), { list: argv.includes('--list') }));
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { auditQueue, report };
