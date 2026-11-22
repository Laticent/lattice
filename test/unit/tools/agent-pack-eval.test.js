'use strict';
/**
 * tools/agent-pack-eval.mjs's reply parser. The nightly eval judges the deck `deckFrom` pulls out
 * of a model's reply; until 2026-11-19 a lazy match stopped at the deck's own first code or
 * mermaid fence, so a correct deck with a code slide was judged as one slide and blamed on the
 * pack. No model call and no key: these import the parser and the one-deck judge only.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');

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

// `--judge` used to write `<deck>.pdf` beside the deck, so judging a committed example overwrote its golden PDF
// (it happened to examples/split-horizontal.pdf). The PDF goes to `--out` now, `.scratch/agent-pack-eval` by default.
const ROOT = path.join(__dirname, '..', '..', '..');
const tmpDir = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-pack-judge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('judgeOne hands the judge a PDF path inside the out folder, never beside the deck', async (t) => {
  const { judgeOne } = await load();
  const dir = tmpDir(t);
  const deck = path.join(dir, 'examples', 'split-horizontal.md');
  const out = path.join(dir, 'out');
  const seen = [];
  const result = judgeOne(deck, out, (d, pdf) => {
    seen.push([d, pdf]);
    return { problems: [] };
  });
  assert.deepEqual(result, { problems: [] });
  assert.deepEqual(seen, [[deck, path.join(out, 'split-horizontal.pdf')]]);
  assert.ok(fs.statSync(out).isDirectory(), 'the out folder is created for the render');
});

test('the default out folder is .scratch/agent-pack-eval, outside every committed folder', async () => {
  const { DEFAULT_OUT, judgeOne } = await load();
  assert.equal(DEFAULT_OUT, path.join(ROOT, '.scratch', 'agent-pack-eval'));
  assert.equal(judgeOne.length, 1, 'outDir and judgeFn are optional: --judge with no --out lands in DEFAULT_OUT');
});

// It renders, so it runs where a browser is (a laptop, the integration tier) and skips in the render-free unit job;
// the judgeOne test above is the pin that job runs.
const chrome = resolveChrome();
test(
  '--judge renders into --out and leaves the folder the deck sits in untouched',
  { skip: skipWithoutChrome(chrome) },
  (t) => {
    const dir = tmpDir(t);
    const deck = path.join(dir, 'deck.md');
    fs.writeFileSync(deck, '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# Judged\n');
    const out = path.join(dir, 'out');
    const run = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'agent-pack-eval.mjs'), '--judge', deck, '--out', out], {
      encoding: 'utf8',
      env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).slides, 1);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['deck.md', 'out'], 'nothing is written beside the deck');
    assert.ok(fs.statSync(path.join(out, 'deck.pdf')).size > 0, 'the PDF is in --out');
  },
);
