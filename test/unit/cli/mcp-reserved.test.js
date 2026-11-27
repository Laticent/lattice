/**
 * Unit: `lattice mcp` is a reserved verb (initiative #3531, E8 #3539).
 *
 * The MCP server is planned (engineering/decisions/2026-11-17-use-case-layer.md §10 step 6) but not
 * built. Before 1.0 the verb is held so that shipping the server later breaks no one: without the
 * reservation `lattice mcp` read `mcp` as a deck file, and taking the word back after 1.0 would
 * change what an existing command does.
 *
 *   1. `lattice mcp` (and `lattice mcp --help`) prints one line, names no date or shape, links the
 *      docs and exits 1 without rendering.
 *   2. `lattice ./mcp` still reaches the render path: a deck file named `mcp` keeps working.
 *   3. Completion and both help screens offer the verb, and the reference documents its anchor.
 *
 * Each arm has a failing side: remove the dispatch in lattice.js and arms 1 and 3 fail; widen it
 * to match `./mcp` and arm 2 fails.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'lattice.js');
const RESERVED = /^lattice mcp: the MCP server is not available in this version\. See https:\/\/lattice\.style\/reference\/cli\/#lattice-mcp\n$/;
const run = (args, cwd = ROOT) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 60_000 });

test('lattice mcp prints one line, exits 1 and renders nothing', () => {
  for (const args of [['mcp'], ['mcp', '--help'], ['mcp', 'serve']]) {
    const r = run(args);
    assert.equal(r.status, 1, `${args.join(' ')}: exit code`);
    assert.match(r.stderr, RESERVED, `${args.join(' ')}: stderr`);
    assert.equal(r.stdout, '', `${args.join(' ')}: stdout`);
  }
});

test('the line promises no date and no shape', () => {
  const line = run(['mcp']).stderr;
  assert.doesNotMatch(line, /\b(soon|coming|later|next|planned|will|20\d\d|v?\d+\.\d+)\b/i);
});

test('lattice ./mcp still reads a file named mcp as the deck', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mcp-file-'));
  try {
    // No such file: the render path answers with its own missing-file error, not the reservation.
    const r = run(['./mcp', 'out.pdf'], dir);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stderr, /MCP server/);
    assert.match(r.stderr, /mcp/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('completion, both help screens and the reference offer the verb', () => {
  const C = require('../../../lib/cli/complete.js');
  assert.ok(C.SUBCOMMANDS.some(([name]) => name === 'mcp'), 'SUBCOMMANDS lists mcp');
  assert.match(C.protocolOutput(['mc']), /^mcp\t/m);
  assert.match(run(['--help']).stdout, /^ {2}lattice mcp {2,}/m);
  assert.match(run(['--help', 'all']).stdout, /^ {2}lattice mcp {2,}/m);
  const ref = fs.readFileSync(path.join(ROOT, 'docs/src/content/docs/reference/cli.md'), 'utf8');
  assert.match(ref, /^## `lattice mcp`$/m, 'reference/cli.md has the section the line links to');
  assert.match(ref, /lattice \.\/mcp/, 'reference/cli.md says how to render a file named mcp');
});
