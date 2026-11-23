#!/usr/bin/env node
/**
 * Agent card generator — validate a card's YAML and print the finished card.
 * The author-facing way to build the 🚦 pre-merge, 📋 standup, 🎯 continuation
 * and ❓ decision cards: you write the facts, this wraps them to 38 columns,
 * puts the layout and the CAPS in place, and fences the result. Contract:
 * engineering/workflow.md §One layout for all four cards.
 *
 * Usage:
 *   npm run card -- card.yml          # print the fenced card
 *   npm run card -- --base main card.yml   # pre-merge: diff the GROWTH section against another ref
 *   npm run card -- --no-growth card.yml   # pre-merge: leave the GROWTH section out
 *   npm run card -- --check card.yml  # validate only
 *   npm run card -- --table fleet.yml # fleet board as one markdown table
 *   cat card.yml | npm run card -- -  # read YAML from stdin
 *   npm run card -- --living 3427 card.yml   # create or edit PR #3427's living handoff comment
 *
 * Signature (engineering/decisions/2026-11-22-two-person-relay.md, D3): with LATTICE_ACTOR set to a
 * key in `.github/actors.json`, the printed card ends with `— <name> · session_<id>`, the line that
 * goes above the usual footers. Unset: the card prints unsigned with a one-line warning on stderr.
 * Set to a key the roster lacks: the card is refused (exit 1) with how to set it. `--check` signs
 * nothing.
 *
 * Living comment (engineering/workflow.md §Relay): `--living <PR>` posts the card as the PR's one
 * `<!-- relay-handoff -->` comment, under a BATON block, editing it in place if it exists. Only the
 * baton holder may (push first). The YAML may carry a `relay:` block (`traps`, `unverified`,
 * `claims` lists) that prints under the card; it is read only with `--living`, and `--check`
 * validates it so the living card can be dry-run first.
 *
 * Exit codes:
 *   0  the card is valid and was printed
 *   1  the card is invalid; every problem is listed on stderr
 *   2  usage error (no file, unreadable file, or YAML that does not parse)
 */

const fs = require('node:fs');
const YAML = require('yaml');
const { renderCard, renderFleetTable } = require('./agent-card');

function usage(message) {
  if (message) console.error(`card: ${message}`);
  console.error('usage: npm run card -- [--check] [--table] <card.yml | ->');
  process.exit(2);
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const noGrowth = args.includes('--no-growth');
const table = args.includes('--table');
let growthBase = 'origin/main';
let livingPr = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--check' || a === '--no-growth' || a === '--table') continue;
  if (a === '--living') {
    livingPr = Number(args[++i]);
    if (!Number.isInteger(livingPr) || livingPr <= 0) usage('--living needs a pull request number, e.g. --living 3427');
    continue;
  }
  if (a === '--base' || a.startsWith('--base=')) {
    const value = a === '--base' ? args[++i] : a.slice('--base='.length);
    if (!value || value.startsWith('--')) usage('--base needs a git ref, e.g. --base origin/main');
    growthBase = value;
    continue;
  }
  files.push(a);
}
if (files.length !== 1) usage('give exactly one card file (or - for stdin)');

let source;
try {
  source = fs.readFileSync(files[0] === '-' ? 0 : files[0], 'utf8');
} catch (err) {
  usage(`cannot read ${files[0]}: ${err.message}`);
}

/**
 * A trailing `#` comment on a value cuts the value there: `state: merged # PR 12`
 * keeps "merged" and drops the rest, and a bare `#2778` does the same. Refuse
 * any trailing comment so the card never prints a sentence with its tail gone.
 * Comments on their own line above a key are fine.
 */
function swallowedReferences(node, path = [], found = []) {
  if (YAML.isScalar(node)) {
    if (node.comment) {
      const where = path.join('.') || '(root)';
      const cutAt = `${node.value} #${node.comment.trim()}`.slice(0, 40);
      found.push(`${where}: "${cutAt}" has a trailing # comment that cuts the value; put the whole value in quotes, or move the comment to its own line`);
    }
  } else if (YAML.isMap(node)) {
    for (const pair of node.items) swallowedReferences(pair.value, [...path, String(pair.key)], found);
  } else if (YAML.isSeq(node)) {
    for (let i = 0; i < node.items.length; i++) swallowedReferences(node.items[i], [...path, i], found);
  }
  return found;
}

let doc;
try {
  doc = YAML.parseDocument(source);
} catch (err) {
  usage(`the YAML does not parse: ${err.message.split('\n')[0]}`);
}
if (doc.errors.length) usage(`the YAML does not parse: ${doc.errors[0].message.split('\n')[0]}`);
const cut = swallowedReferences(doc.contents);
if (cut.length) {
  console.error('card: not valid, fix these and run again:');
  for (const e of cut) console.error(`  - ${e}`);
  process.exit(1);
}
const card = doc.toJS();

// The living comment's extra lists ride in a `relay:` block the card schema does not know.
let relayExtra = {};
if (card && Object.hasOwn(card, 'relay')) {
  // --check validates the block too, so the exact living card can be dry-run before it is posted.
  const ok =
    (livingPr || check) &&
    card.relay &&
    typeof card.relay === 'object' &&
    Object.entries(card.relay).every(
      ([k, v]) => ['traps', 'unverified', 'claims'].includes(k) && Array.isArray(v) && v.every((t) => typeof t === 'string' && t.trim()),
    );
  if (!ok) {
    console.error('card: not valid, fix these and run again:');
    console.error('  - relay: is read only with --living (or validated with --check), and holds only traps / unverified / claims lists of strings');
    process.exit(1);
  }
  relayExtra = card.relay;
  delete card.relay;
}

// The pre-merge card's GROWTH section comes from git, never from the YAML (owner's D3, 2026-11-19):
// what this branch adds and removes against the base, by kind. tools/pr-growth.js.
if (card && Object.hasOwn(card, 'growth')) {
  console.error('card: not valid, fix these and run again:');
  console.error('  - growth: is read from git by npm run card; remove it from the YAML');
  process.exit(1);
}
if (card && card.card === 'pre-merge' && !noGrowth && !check) {
  try {
    card.growth = require('./pr-growth').growth({ base: growthBase });
  } catch (err) {
    console.error(`card: could not read growth from git against ${growthBase} (${err.message.split('\n')[0]}); pass --base <ref> or --no-growth`);
    process.exit(1);
  }
}

const result = table ? renderFleetTable(card) : renderCard(card);
if (!result.ok) {
  console.error('card: not valid, fix these and run again:');
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (check) {
  console.log(`card: OK (${card.card}, ${result.lines.length} lines)`);
  process.exit(0);
}
const relay = require('./relay-core');
let actor;
try {
  actor = relay.resolveActor(process.env, relay.loadRoster());
} catch (err) {
  console.error(`card: cannot read the actor roster: ${err.message}`);
  process.exit(1);
}
if (actor.status === 'invalid') {
  console.error(`card: not signed: ${actor.message}`);
  process.exit(1);
}
const sign = actor.status === 'ok' ? relay.signature(actor.name, relay.sessionId(process.env)) : null;
if (actor.status === 'unset') console.error(`card: warning: ${actor.message}`);
if (livingPr) {
  try {
    const { url, created } = relay.postLiving({
      pr: livingPr,
      card,
      extra: relayExtra,
      cardText: result.text,
      signatureLine: sign,
      holderName: actor.status === 'ok' ? actor.name : null,
      env: process.env,
    });
    console.log(`card: living comment ${created ? 'created' : 'updated'}: ${url}`);
  } catch (err) {
    console.error(`card: --living ${livingPr}: ${err.message}`);
    process.exit(err instanceof relay.RelayError ? err.code : 3);
  }
} else {
  console.log(sign ? `${result.text}\n\n${sign}` : result.text);
}
