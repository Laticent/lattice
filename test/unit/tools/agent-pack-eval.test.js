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

// --- The paid run's harness, with the network stubbed (HARD RULE #32) and no key read (#24). ---
// `run` takes its network (`fetchImpl` for the price list, `complete` for a chat call), its judge and its
// clock as `deps`, so these tests count calls and dollars without a socket, a browser or OUR key.

// Two providers: the cap must use the dearer one (1e-6 in, 1e-5 out), never the cheap listing.
const ENDPOINTS = {
  data: {
    endpoints: [
      { pricing: { prompt: '0.0000001', completion: '0.000001' } },
      { pricing: { prompt: '0.000001', completion: '0.00001' } },
    ],
  },
};
const pricesFetch = async (url) => (String(url).endsWith('/models/test/cheap/endpoints') ? { ok: true, json: async () => ENDPOINTS } : { ok: false, status: 404 });
const kitDir = (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(path.join(dir, 'components'));
  fs.writeFileSync(path.join(dir, 'start.md'), 'NEW START: see [layouts](./layouts.md).\n');
  fs.writeFileSync(path.join(dir, 'layouts.md'), 'LAYOUTS BODY\n');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'x');
  return dir;
};
const deckReply = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# A deck\n';
/** A stub `complete`: records each call, answers from `script(call)`, reports `cost` USD. */
const stubComplete = (calls, { cost = 0.001, reported = true, script = () => deckReply } = {}) =>
  async (req) => {
    calls.push(req);
    return { text: script(req, calls.length), finish: 'stop', tokensIn: 100, tokensOut: 50, cost: reported ? cost : 0, costReported: reported, latencyMs: 0 };
  };
const passJudge = () => ({ slides: 8, layouts: ['a', 'b', 'c', 'd'], errors: 0, warnings: 0, suggestions: 0, problems: [] });
const deps = (t, calls, extra = {}) => ({
  fetchImpl: pricesFetch,
  complete: stubComplete(calls, extra),
  judgeFn: passJudge,
  now: () => 0,
  log: () => {},
  kitDir: extra.kit ?? kitDir(t),
  allowSpend: true,
  hasKey: true,
});

test('nightlyModel alternates Haiku and DeepSeek day by day, across the year end too', async () => {
  const { nightlyModel, MODELS } = await load();
  const days = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'].map((d) => nightlyModel(new Date(`${d}T03:17:00Z`)));
  for (let i = 1; i < days.length; i++) assert.notEqual(days[i], days[i - 1], `${i}: two nights in a row on ${days[i]}`);
  assert.deepEqual(new Set(days), new Set([MODELS.haiku, MODELS.deepseek]));
});

test('parseArgs: the small arm defaults to Haiku 5.5, --model nightly resolves, bad options throw', async () => {
  const { parseArgs, ARMS, nightlyModel } = await load();
  assert.equal(ARMS.small.model, process.env.AGENT_PACK_SMALL_MODEL || 'anthropic/claude-haiku-5.5');
  const when = new Date('2026-11-27T03:17:00Z');
  const o = parseArgs(['--arm', 'retrieval', '--model', 'nightly', '--repeat', '3', '--max-usd', '0.5'], when);
  assert.deepEqual([o.arms, o.model, o.repeat, o.maxUsd, o.limit], [['retrieval'], nightlyModel(when), 3, 0.5, 10]);
  assert.equal(parseArgs([]).maxUsd, 1, 'a cap is always set');
  assert.throws(() => parseArgs(['--arm', 'small', '--old', 'x.md']), /compares start\.md/);
  assert.throws(() => parseArgs(['--max-usd', '0']), /out of range/);
  assert.throws(() => parseArgs(['--repeat', '1.5']), /out of range/);
  assert.throws(() => parseArgs(['--arm', 'nope']), /unknown arm/);
});

test('ten fixed briefs, unique slugs, the first three unchanged so nights compare', async () => {
  const { BRIEFS } = await load();
  assert.deepEqual(
    BRIEFS.map((b) => b.slug),
    ['board-ask', 'teaching', 'data-review', 'postmortem', 'launch', 'investor-update', 'architecture', 'research', 'all-hands-policy', 'fundraising'],
  );
  assert.match(BRIEFS[0].text, /^Write a deck for a board meeting\. Our company wants approval to open a second warehouse in Rotterdam\./);
});

test('readRequests takes READ lines only from a reply that holds no deck; serveKitFiles stays inside the kit', async (t) => {
  const { readRequests, serveKitFiles } = await load();
  assert.deepEqual(readRequests('READ: ./layouts.md#cards\nREAD: `../secret.txt`'), ['./layouts.md#cards', '../secret.txt']);
  assert.deepEqual(readRequests(`${deckReply}\nREAD: ./layouts.md`), [], 'a deck with a stray READ line is a deck');
  const root = kitDir(t);
  fs.writeFileSync(path.join(root, 'components', 'cards.md'), 'CARDS\n');
  const kit = path.join(root, 'components');
  // The kit is components/ here, so ../secret.txt is a real file one level up: it must still be refused.
  const { served, text } = serveKitFiles(['./cards.md#x', '../secret.txt', '/etc/passwd', 'missing.md'], kit);
  assert.deepEqual(served, ['cards.md']);
  assert.match(text, /CARDS/);
  assert.match(text, /\.\.\/secret\.txt\n\n\(not served: outside the kit\)/);
  assert.match(text, /\/etc\/passwd\n\n\(not served: outside the kit\)/);
  assert.match(text, /missing\.md\n\n\(not served: no such file in the kit\)/);
});

test('a dry run prices the plan and makes no chat call', async (t) => {
  const { run, parseArgs } = await load();
  const calls = [];
  const d = { ...deps(t, calls), allowSpend: false };
  const logs = [];
  d.log = (s) => logs.push(s);
  const code = await run(parseArgs(['--arm', 'retrieval', '--model', 'test/cheap', '--out', tmpDir(t)]), d);
  assert.equal(code, 0);
  assert.equal(calls.length, 0);
  assert.match(logs.join('\n'), /10 deck\(s\) on test\/cheap.*Dry run/s);
});

test('--max-usd stops before the call that could cross it, and exits 3', async (t) => {
  const { run, parseArgs } = await load();
  const calls = [];
  const out = tmpDir(t);
  // Each call's ceiling here is about USD 0.0603 (6000 tokens out at 1e-5, ~300 in at 1e-6); each reports USD 0.05.
  // Cap 0.2: after three calls USD 0.15 is spent, and 0.15 + 0.0603 > 0.2, so the fourth never goes.
  const code = await run(parseArgs(['--arm', 'start', '--model', 'test/cheap', '--repeat', '2', '--max-usd', '0.2', '--out', out]), deps(t, calls, { cost: 0.05 }));
  assert.equal(code, 3);
  assert.equal(calls.length, 3);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.stoppedAtCap, true);
  assert.ok(summary.cost <= 0.2, `spent ${summary.cost}`);
  assert.equal(summary.rows.length, 3);
  assert.match(fs.readFileSync(path.join(out, 'summary.md'), 'utf8'), /STOPPED at the cap after 3 of \d+/);
});

test('a cost OpenRouter does not report counts at its worst case, so the cap still holds', async (t) => {
  const { run, parseArgs } = await load();
  const calls = [];
  const out = tmpDir(t);
  const code = await run(parseArgs(['--arm', 'start', '--model', 'test/cheap', '--repeat', '2', '--max-usd', '0.2', '--out', out]), deps(t, calls, { reported: false }));
  assert.equal(code, 3);
  assert.equal(calls.length, 3, 'three ceilings of ~0.0602 fit under 0.2, a fourth does not');
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')).cost <= 0.2);
});

test('paired mode runs old then new on the SAME model for each brief and repeat, and counts the pairs', async (t) => {
  const { run, parseArgs } = await load();
  const calls = [];
  const kit = kitDir(t);
  const old = path.join(tmpDir(t), 'old-start.md');
  fs.writeFileSync(old, 'OLD START\n');
  const out = tmpDir(t);
  let n = 0;
  // The old start.md's decks fail, the new one's pass: the pair counts must say "new only".
  const judgeFn = (deckPath) => ({ ...passJudge(), problems: path.basename(deckPath).includes('-old-') ? ['x'] : [] });
  const code = await run(parseArgs(['--arm', 'start', '--model', 'test/cheap', '--limit', '2', '--repeat', '2', '--temperature', '0.7', '--old', old, '--out', out]), {
    ...deps(t, calls, { kit }),
    judgeFn,
    now: () => n++,
  });
  assert.equal(code, 1, 'a failed deck fails the run');
  assert.equal(calls.length, 8);
  assert.deepEqual(new Set(calls.map((c) => c.model)), new Set(['test/cheap']));
  assert.deepEqual(calls.map((c) => c.messages[0].content.startsWith('OLD') ? 'old' : 'new'), ['old', 'new', 'old', 'new', 'old', 'new', 'old', 'new']);
  assert.deepEqual(calls.map((c) => c.seed), [0, 0, 1, 1, 0, 0, 1, 1]);
  assert.ok(calls.every((c) => c.temperature === 0.7));
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.deepEqual(s.aggregate.paired, { pairs: 4, both: 0, oldOnly: 0, newOnly: 4, neither: 0 });
  assert.deepEqual(s.aggregate.table.map((g) => [g.variant, g.n, g.passed]), [['old', 4, 0], ['new', 4, 4]]);
  const row = s.rows[0];
  for (const k of ['model', 'arm', 'variant', 'brief', 'repeat', 'errors', 'warnings', 'pass', 'tokensIn', 'tokensOut', 'cost', 'latencyMs']) assert.ok(k in row, `row has ${k}`);
});

test('the retrieval arm serves the files the model names, then judges the deck from the second turn', async (t) => {
  const { run, parseArgs } = await load();
  const calls = [];
  const out = tmpDir(t);
  const script = (req) => (req.messages.length === 2 ? 'READ: ./layouts.md' : deckReply);
  const code = await run(parseArgs(['--arm', 'retrieval', '--model', 'test/cheap', '--limit', '1', '--out', out]), deps(t, calls, { script }));
  assert.equal(code, 0);
  assert.equal(calls.length, 2);
  assert.match(calls[0].messages[1].content, /READ: <path as start\.md links it>/);
  assert.deepEqual(calls[1].messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.match(calls[1].messages[3].content, /LAYOUTS BODY/);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.deepEqual([s.rows[0].calls, s.rows[0].fetched, s.rows[0].pass], [2, ['layouts.md'], true]);
  assert.equal(fs.readFileSync(path.join(out, 'retrieval-board-ask-r0.md'), 'utf8'), deckReply);
});

test('a reply cut off at max_tokens fails as truncated, and its cost still counts', async (t) => {
  const { run, parseArgs } = await load();
  const out = tmpDir(t);
  const d = deps(t, []);
  d.complete = async () => ({ text: deckReply, finish: 'length', tokensIn: 1, tokensOut: 6000, cost: 0.01, costReported: true, latencyMs: 0 });
  assert.equal(await run(parseArgs(['--arm', 'start', '--model', 'test/cheap', '--limit', '1', '--out', out]), d), 1);
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.match(s.rows[0].problems[0], /hit max_tokens/);
  assert.equal(s.cost, 0.01);
});

test('the cap is checked again before a retrieval second turn, and a capped deck carries no verdict', async (t) => {
  const { run, parseArgs } = await load();
  const calls = [];
  const out = tmpDir(t);
  const script = (req) => (req.messages.length === 2 ? 'READ: ./layouts.md' : deckReply);
  // The first call fits (0 + ~0.0603 <= 0.105) and reports 0.05; the second's ceiling (~0.0604) would cross 0.105.
  const code = await run(parseArgs(['--arm', 'retrieval', '--model', 'test/cheap', '--max-usd', '0.105', '--out', out]), deps(t, calls, { cost: 0.05, script }));
  assert.equal(code, 3);
  assert.equal(calls.length, 1, 'the second turn never went');
  const s = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.deepEqual([s.rows.length, s.rows[0].capped, s.rows[0].pass, s.failed, s.aggregate.table.length], [1, true, null, 0, 0]);
});

test('a READ of a folder is answered with a note, not a crash that books a failed deck', async (t) => {
  const { serveKitFiles } = await load();
  const kit = kitDir(t);
  const { served, text } = serveKitFiles(['./components/', 'components', '.'], kit);
  assert.deepEqual(served, []);
  assert.equal(text.match(/not served: no such file in the kit/g).length, 3);
});

test('the cap is priced from the dearest provider, and a price that could void it stops the run before any call', async (t) => {
  const { loadPrice, run, parseArgs } = await load();
  assert.deepEqual(await loadPrice('test/cheap', pricesFetch), { in: 0.000001, out: 0.00001 });
  for (const bad of ['-1', 'n/a', undefined]) {
    const calls = [];
    const d = deps(t, calls);
    d.fetchImpl = async () => ({ ok: true, json: async () => ({ data: { endpoints: [{ pricing: { prompt: bad, completion: '0.00001' } }] } }) });
    assert.equal(await run(parseArgs(['--arm', 'start', '--model', 'test/cheap', '--out', tmpDir(t)]), d), 2, `price ${bad}`);
    assert.equal(calls.length, 0);
  }
});
