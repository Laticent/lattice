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
 *   npm run card -- --check card.yml  # validate only
 *   cat card.yml | npm run card -- -  # read YAML from stdin
 *
 * Exit codes:
 *   0  the card is valid and was printed
 *   1  the card is invalid; every problem is listed on stderr
 *   2  usage error (no file, unreadable file, or YAML that does not parse)
 */

const fs = require('node:fs');
const YAML = require('yaml');
const { renderCard } = require('./agent-card');

function usage(message) {
  if (message) console.error(`card: ${message}`);
  console.error('usage: npm run card -- [--check] <card.yml | ->');
  process.exit(2);
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => a !== '--check');
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

const result = renderCard(card);
if (!result.ok) {
  console.error('card: not valid, fix these and run again:');
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(check ? `card: OK (${card.card}, ${result.lines.length} lines)` : result.text);
