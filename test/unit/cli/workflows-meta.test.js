// Meta-coverage for .claude/workflows/*.js — the parameterized orchestration
// scripts (HARD RULE #25, engineering/orchestration.md). These files run inside
// the Workflow harness's async wrapper (injected globals + top-level return), so
// they are NOT standard Node modules: they can't be require()'d and are excluded
// from Biome. That leaves them un-linted and un-run by anything else, so this is
// their only automated guard against silent rot — it checks two things a
// regression would break: (1) each script still parses as the harness runs it, and (2) each declares the
// hard agent cap the >10-agent gate exemption reads (orchestration.md §cost-controls).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WORKFLOWS_DIR = path.join(__dirname, '../../../.claude/workflows');

const scripts = fs.existsSync(WORKFLOWS_DIR)
  ? fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.js'))
  : [];

describe('.claude/workflows meta', () => {
  test('there is at least one workflow to guard', () => {
    // If this fails, either the dir moved or the design-competition shape was
    // deleted — both should be a conscious decision, not a silent drift.
    assert.ok(scripts.length >= 1, 'expected at least one .claude/workflows/*.js');
  });

  for (const file of scripts) {
    const full = path.join(WORKFLOWS_DIR, file);

    test(`${file} parses as the harness runs it`, () => {
      // Parsed the way the Workflow harness runs it: the body of an async function, so a top-level
      // `return` and `await` are legal, with `export` dropped from the `meta` line. This used to be
      // `node --check`, which leaned on Node 22's tolerant module detection; Node 24 parses a file with
      // `export` as an ES module, where a top-level `return` is illegal, and failed a script that runs.
      // `vm.Script` only compiles: nothing in the script runs. A syntax regression throws here with the
      // parser's message and the file name.
      const body = fs.readFileSync(full, 'utf8').replace(/^export\s+(?=const\s)/gm, '');
      assert.doesNotThrow(() => new vm.Script(`(async function () {\n${body}\n})`, { filename: full }));
    });

    test(`${file} declares a positive maxAgents cap`, () => {
      // The >10-agent gate exempts a named workflow ONLY when its cap is readable
      // off the committed file (orchestration.md cost-control #1). No cap → not
      // exempt → the exemption would be a loophole. Guard the invariant statically
      // (matches a top-level `const maxAgents = N` or a `maxAgents: N` meta field).
      const src = fs.readFileSync(full, 'utf8');
      const match = src.match(/maxAgents\s*[:=]\s*(\d+)/);
      assert.ok(match, `${file} must declare a numeric \`maxAgents\` cap`);
      assert.ok(Number(match[1]) > 0, `${file} maxAgents must be a positive integer`);
    });
  }
});
