const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

// #1897. `parseStream` produces `surface_reads`, the number the pick-surface bake-off's
// whole paginated-read argument rests on. It shipped de-duplicating by `message.id` and
// therefore under-counted to ZERO, and the only thing that caught it was re-running a paid
// bake-off and noticing an implausible artifact. These fixtures pin the frame shapes so the
// next regression costs nothing.
//
// The module is ESM and the harness around it is a script — importing THAT parses
// process.argv, prints a plan and exits — which is why the function lives in its own file.
const load = async () => (await import('../../../tools/intent-bakeoff/parse-stream.mjs')).parseStream;
const loadNote = async () => (await import('../../../tools/intent-bakeoff/runs-note.mjs')).RUNS_NOTE;

const line = (o) => `${JSON.stringify(o)}\n`;
const assistant = (o) => line({ type: 'assistant', ...o });
const toolUse = (id, name = 'Read') => ({ type: 'tool_use', id, name });
const result = () => line({ type: 'result', result: '{}', num_turns: 2 });

describe('parseStream tool-call accounting', () => {
  // THE REGRESSION. The CLI splits ONE assistant message across several frames sharing a
  // single `message.id`, one per content block. De-duplicating by that id kept only the
  // first frame, so a Read following a text or thinking block vanished.
  test('counts a tool_use in a later frame of the same message.id', async () => {
    const parseStream = await load();
    for (const first of [{ type: 'text', text: 'Let me read it.' }, { type: 'thinking', thinking: '…' }]) {
      const stdout =
        assistant({ uuid: 'u1', message: { id: 'm1', content: [first] } }) +
        assistant({ uuid: 'u2', message: { id: 'm1', content: [toolUse('toolu_a')] } }) +
        result();
      assert.deepEqual(parseStream(stdout).toolUses, { Read: 1 }, `first block: ${first.type}`);
    }
  });

  // What the message.id de-dup was REACHING for, done exactly: a re-delivered frame repeats
  // the tool_use id; two genuine calls never share one.
  test('de-duplicates a re-delivered frame by the tool_use id, not the frame', async () => {
    const parseStream = await load();
    const stdout =
      assistant({ uuid: 'u1', message: { id: 'm1', content: [toolUse('toolu_a')] } }) +
      assistant({ uuid: 'u2', message: { id: 'm2', content: [toolUse('toolu_a')] } }) +
      result();
    assert.deepEqual(parseStream(stdout).toolUses, { Read: 1 });
  });

  test('counts two distinct calls as two', async () => {
    const parseStream = await load();
    const stdout =
      assistant({ uuid: 'u1', message: { id: 'm1', content: [toolUse('toolu_a')] } }) +
      assistant({ uuid: 'u2', message: { id: 'm2', content: [toolUse('toolu_b')] } }) +
      result();
    assert.deepEqual(parseStream(stdout).toolUses, { Read: 2 });
    assert.deepEqual(parseStream(stdout).toolCalls.map((c) => c.id), ['toolu_a', 'toolu_b']);
  });

  // A synthesized frame can carry a tool_use no model emitted.
  test('skips is_meta frames', async () => {
    const parseStream = await load();
    const stdout =
      assistant({ uuid: 'u1', is_meta: true, message: { id: 'm1', content: [toolUse('toolu_a')] } }) +
      result();
    assert.deepEqual(parseStream(stdout).toolUses, {});
  });

  // `supersedes` can name a uuid delivered EARLIER, so the skip set must be complete before
  // any counting happens — it is, because collection and counting are two passes.
  test('drops a superseded frame even when the supersedes arrives later', async () => {
    const parseStream = await load();
    const stdout =
      assistant({ uuid: 'u1', message: { id: 'm1', content: [toolUse('toolu_a')] } }) +
      assistant({ uuid: 'u2', supersedes: ['u1'], message: { id: 'm2', content: [toolUse('toolu_b')] } }) +
      result();
    assert.deepEqual(parseStream(stdout).toolUses, { Read: 1 });
    assert.deepEqual(parseStream(stdout).toolCalls.map((c) => c.id), ['toolu_b']);
  });

  test('the ledger and the counts cannot disagree', async () => {
    const parseStream = await load();
    const stdout =
      assistant({ uuid: 'u1', message: { id: 'm1', content: [toolUse('toolu_a'), toolUse('toolu_b', 'Grep')] } }) +
      result();
    const { toolUses, toolCalls } = parseStream(stdout);
    assert.equal(Object.values(toolUses).reduce((a, b) => a + b, 0), toolCalls.length);
    assert.deepEqual(toolUses, { Read: 1, Grep: 1 });
  });

  test('non-JSON lines and a missing result do not throw', async () => {
    const parseStream = await load();
    const { toolUses, result: r } = parseStream('not json\n\n{bad\n');
    assert.deepEqual(toolUses, {});
    assert.equal(r, null);
  });

  // The banner is the artifact's only instruction to a reader, and it was wrong once: it
  // said "quote `model_tokens`" after that advice had been withdrawn, because correcting the
  // generator did not rewrite two JSONs that cost $10 to regenerate. Pin them to one source.
  test('every committed artifact carries the current runs banner', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const RUNS_NOTE = await loadNote();
    const dir = path.join(__dirname, '..', '..', '..', 'tools', 'intent-bakeoff');
    for (const f of ['pick-surface-agent-runs.json', 'pick-surface-agent-runs-confusable.json']) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      assert.equal(doc._note, RUNS_NOTE, `${f}: _note has drifted from tools/intent-bakeoff/runs-note.mjs`);
    }
  });

  // The committed artifacts must agree with the parser that wrote them.
  test('every committed run ledger reconciles with its counts', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.join(__dirname, '..', '..', '..', 'tools', 'intent-bakeoff');
    for (const f of ['pick-surface-agent-runs.json', 'pick-surface-agent-runs-confusable.json']) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const run of doc.runs) {
        const ids = run.tool_calls.map((c) => c.id);
        assert.equal(new Set(ids).size, ids.length, `${f} ${run.condition}${run.replicate}: duplicate tool_use id`);
        assert.equal(run.tool_calls.length, run.tool_uses_total, `${f} ${run.condition}${run.replicate}: ledger vs total`);
        assert.equal(
          run.tool_calls.filter((c) => c.name === 'Read').length, run.surface_reads,
          `${f} ${run.condition}${run.replicate}: Read ledger vs surface_reads`,
        );
      }
    }
  });
});
