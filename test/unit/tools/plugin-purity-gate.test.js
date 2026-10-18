/**
 * `checkPluginPurity` — G1 of the npm-plugin threat model
 * (engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.1, owner decision 1, 2026-10-18).
 *
 * The principle (§4): plugin and component code takes data in and returns markup out. It never
 * reaches the network, storage or our OpenRouter key. Nothing enforced that, so the gate walks every
 * source file under `lib/plugins`, `lib/components` and `lib/runtime`, parses it, and fires on an
 * identifier or key string from the forbidden list. A hit is fine only with a sanction that carries
 * its justification and the exact count; a stale or moved sanction fires too.
 *
 * It is a TRIPWIRE for an in-tree contributor adding `fetch` by accident, not a defense against
 * obfuscation (`globalThis['fe'+'tch']` passes), and the note says so.
 *
 * Probes live in a temp tree, never the real one (see runtime-markup-sink-gate.test.js).
 */
const { test, describe, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkPluginPurity, SANCTIONED_PURITY_HITS, PURITY_NAMES } = require('../../../tools/check-ownership.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-purity-'));
const dirs = ['lib/plugins/probe', 'lib/components/probe', 'lib/runtime'];
for (const d of dirs) fs.mkdirSync(path.join(TMP, d), { recursive: true });
const written = [];
afterEach(() => {
  for (const f of written.splice(0)) fs.rmSync(f, { force: true });
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Run the real gate over the temp tree with `files` ({ 'lib/plugins/probe/x.js': src }) as its only source. */
function gate(files, sanctions = []) {
  for (const [rel, src] of Object.entries(files)) {
    const abs = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src);
    written.push(abs);
  }
  const errors = [];
  checkPluginPurity(errors, sanctions, TMP);
  return errors;
}
const P = 'lib/plugins/probe/x.js';

describe('checkPluginPurity: code that MUST fire', () => {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB']) {
    test(`a plugin that uses ${name} fires`, () => {
      const errors = gate({ [P]: `export function f() { return ${name}; }\n` });
      assert.equal(errors.length, 1, errors.join('\n'));
      assert.match(errors[0], new RegExp(`${P}.*${name}`));
    });
  }
  test('a property access fires (window.fetch, navigator.sendBeacon)', () => {
    assert.equal(gate({ [P]: 'export const a = () => window.fetch("x");\n' }).length, 1);
    assert.equal(gate({ [P]: 'export const a = () => navigator.sendBeacon("x");\n' }).length, 1);
  });
  test('our OpenRouter key names fire as strings', () => {
    assert.equal(gate({ [P]: 'export const k = "OPEN_ROUTER' + '_KEY";\n' }).length, 1);
    assert.equal(gate({ [P]: 'export const k = localKey("lattice-db-or-key");\nfunction localKey(x){return x}\n' }).length, 1);
  });
  test('a component is covered too', () => {
    assert.equal(gate({ 'lib/components/probe/y.js': 'fetch("x");\n' }).length, 1);
  });
  test('the runtime is covered too', () => {
    assert.equal(gate({ 'lib/runtime/z.mjs': 'fetch("x");\n' }).length, 1);
  });
  test('a file that does not parse fires rather than passing unread', () => {
    const errors = gate({ [P]: 'function (((' });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does not parse/);
  });
});

describe('checkPluginPurity: code that must NOT fire', () => {
  test('the word in a comment or an ordinary string is not a use', () => {
    assert.deepEqual(gate({ [P]: '// fetch(\n/* sendBeacon */\nexport const s = "we never call fetch";\n' }), []);
  });
  test('a local variable that merely contains the name is fine', () => {
    assert.deepEqual(gate({ [P]: 'export const prefetchCount = 1; const fetchLater = 2;\n' }), []);
  });
  test('test files, vendored libraries, minified and generated files are not scanned', () => {
    assert.deepEqual(gate({ 'lib/plugins/probe/x.test.js': 'fetch("x");\n', 'lib/plugins/probe/lib.min.js': 'fetch("x");\n', 'lib/plugins/probe/a.generated.js': 'fetch("x");\n', 'lib/plugins/probe/vendor/v.js': 'fetch("x");\n' }), []);
  });
  test('a clean file passes', () => {
    assert.deepEqual(gate({ [P]: 'export function render(x) { return `<p>${x}</p>`; }\n' }), []);
  });
});

describe('checkPluginPurity: sanctions', () => {
  const sanction = (over = {}) => ({ file: P, name: 'fetch', count: 1, justification: 'the deck’s own markdown', ...over });
  test('a sanction with a justification and the exact count silences the hit', () => {
    assert.deepEqual(gate({ [P]: 'fetch("deck.md");\n' }, [sanction()]), []);
  });
  test('a second use beyond the sanctioned count fires', () => {
    const errors = gate({ [P]: 'fetch("a");\nfetch("b");\n' }, [sanction()]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /2.*sanction.*1|moved/i);
  });
  test('a sanction for a file that no longer has the hit is stale and fires', () => {
    const errors = gate({ [P]: 'export const ok = 1;\n' }, [sanction()]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /stale/);
  });
  test('a sanction with no justification fires', () => {
    const errors = gate({ [P]: 'fetch("x");\n' }, [sanction({ justification: '' })]);
    assert.ok(errors.some((e) => /justification/.test(e)), errors.join('\n'));
  });
});

describe('the real tree', () => {
  test('passes with the committed sanctions, and every sanction names a forbidden name', () => {
    const errors = [];
    checkPluginPurity(errors);
    assert.deepEqual(errors, []);
    for (const s of SANCTIONED_PURITY_HITS) assert.ok(PURITY_NAMES.includes(s.name), s.name);
  });
});
