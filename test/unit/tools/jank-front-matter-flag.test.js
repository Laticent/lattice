/**
 * `--front-matter` refusals — tools/check-jank.js (#2168).
 *
 * WHY A TEST AND NOT A READING OF THE REGEX. Every refusal in this flag guards the same
 * failure: an entry the engine cannot read injects NOTHING, the gated mark never renders,
 * and the sweep reports a confident CLEAN over a mark that was never on the page. That is
 * the exact false clean `check-jank` exists to prevent, so a validation nobody has watched
 * reject is a decoration — the same argument the rest of this tool's flag list is built on.
 *
 * These arms spawn the CLI because the validation runs at module scope and exits the
 * process. They are cheap on purpose: every refusal below fires BEFORE the manifest is
 * resolved and long before Chromium launches, so this file adds no render to the suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'tools', 'check-jank.js');

function run(...args) {
  const r = spawnSync(process.execPath, [CLI, 'content', ...args], { encoding: 'utf8', timeout: 30000 });
  return { status: r.status, err: `${r.stdout || ''}${r.stderr || ''}` };
}

// A REFUSAL IS EXIT 2, NEVER EXIT 1. Exit 1 is this tool's "a collision or drift was
// found", so a wrapper keying on the code would read a mistyped flag as a found defect —
// inverting the contract. The whole flag list shares this rule.
function refuses(args, match) {
  const { status, err } = run(...args);
  assert.equal(status, 2, `expected a setup refusal (exit 2), got ${status} for ${args.join(' ')}\n${err}`);
  assert.match(err, match);
}

test('an entry that is not a mapping is refused', () => {
  refuses(['--front-matter', 'paginate true'], /is not a mapping entry/);
});

test('an empty value is refused — it would set nothing', () => {
  refuses(['--front-matter', 'paginate:'], /empty value/);
});

test('a key the engine cannot read is refused', () => {
  // `my key: 1` parses as something other than the directive the caller meant, so the
  // sweep would run without it and report clean.
  refuses(['--front-matter', 'my key: 1'], /unusable key/);
});

test('a line break is refused rather than escaped', () => {
  // Front matter is line-oriented and closed by a `---` line, so a value carrying a
  // newline can append arbitrary keys or end the block and make the rest of it body text.
  refuses(['--front-matter', 'a: 1\nb: 2'], /line break/);
});

test('the two keys the sweep owns are refused, and each names its flag', () => {
  // `size:` IS the family selector and `style:` is --style's channel, emitted as a block
  // scalar. A second copy of either is a duplicate mapping key that YAML resolves
  // silently — the caller would override the rig's own control with nothing said.
  refuses(['--front-matter', 'size: 4:3'], /cannot set 'size'[\s\S]*--family/);
  refuses(['--front-matter', 'style: x'], /cannot set 'style'[\s\S]*--style/);
});

test('the same key twice is refused, and the message shows both values', () => {
  const { status, err } = run('--front-matter', 'paginate: true', '--front-matter', 'paginate: false');
  assert.equal(status, 2, err);
  assert.match(err, /sets 'paginate' twice/);
  assert.match(err, /'true'[\s\S]*'false'/);
});

test('the flag is REPEATABLE — a second entry does not replace the first', () => {
  // THE DEFECT THIS PINS. The argv parser stores flags in a Map, so a plain `set` per
  // occurrence kept only the LAST entry: `--front-matter 'paginate: true' --front-matter
  // 'header: x'` would have swept with no pagination at all and reported a clean verdict
  // over an absent mark. The duplicate-key refusal above is what makes this observable
  // without a render — it can only fire if BOTH entries survived parsing.
  const { status, err } = run('--front-matter', 'paginate: true', '--front-matter', 'paginate: x');
  assert.equal(status, 2, err);
  assert.match(err, /sets 'paginate' twice/, 'only one entry survived the parser');
});

test('a valid entry is accepted — the refusals are not refusing everything', () => {
  // The arm that keeps this file honest: seven rejections prove nothing if the flag
  // rejects every input. This one must get PAST validation, so it fails later and for a
  // different reason — the bogus anchor — not with a --front-matter message.
  const { status, err } = run('--front-matter', 'paginate: true', '--anchor', 'nosuch::after', '--max', '2');
  assert.equal(status, 2, err);
  assert.doesNotMatch(err, /--front-matter/, 'a valid entry must not be refused');
  assert.match(err, /nosuch::after/);
});
