'use strict';
/**
 * tools/agent-pack-eval.mjs's reply parser. The nightly eval judges the deck `deckFrom` pulls out
 * of a model's reply; until 2026-11-19 a lazy match stopped at the deck's own first code or
 * mermaid fence, so a correct deck with a code slide was judged as one slide and blamed on the
 * pack. No model call and no key: this imports the parser only.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', '..', 'tools', 'agent-pack-eval.mjs')).href);
const DECK = ['---', 'theme: indaco', '---', '', '<!-- _class: code -->', '', '## Run it.', '', '```ts', 'run();', '```', '', '---', '', '<!-- _class: closing silent -->', '', '## Done.'].join('\n');

test('deckFrom keeps a deck whole when it holds its own code fence', async () => {
  const { deckFrom } = await load();
  assert.equal(deckFrom(`Here it is:\n\n\`\`\`markdown\n${DECK}\n\`\`\`\n\nEnjoy.`), `${DECK}\n`);
});

test('deckFrom reads a four-backtick wrapper, skips an earlier non-deck fence, and takes a bare reply as is', async () => {
  const { deckFrom } = await load();
  assert.equal(deckFrom(`\`\`\`\`md\n${DECK}\n\`\`\`\``), `${DECK}\n`);
  assert.equal(deckFrom(`\`\`\`yaml\ntheme: indaco\n\`\`\`\n\n\`\`\`markdown\n${DECK}\n\`\`\``), `${DECK}\n`);
  assert.equal(deckFrom(DECK), `${DECK}\n`);
});
