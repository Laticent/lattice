/**
 * Unit: the admission rules an npm plugin passes before the door runs it (threat-model note
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.1 G2, §6 decisions 7 and 8).
 * Each refusal has a case that fails when the rule is taken out.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { admitNpmBundle, externalRefusal } = require('../../../lib/packages/npm-plugin-admission.js');
const { npmLayerRefusal, npmRefusals, judgeWindowsRows } = require('../../../lib/core/os-sandbox.js');

const sha = (c) => crypto.createHash('sha256').update(c).digest('hex');
const GOOD = 'function render(f){ return "<p>" + f.body.length + "</p>"; }\nexport { render as default };';

describe('admitNpmBundle', () => {
  test('a self-contained bundle at its pinned hash is admitted', () => {
    assert.deepEqual(admitNpmBundle({ name: 'x', code: GOOD, sha256: sha(GOOD) }), { ok: true, sha256: sha(GOOD) });
    // Bytes that are not UTF-8 decode to other bytes, so a grant digest (text) and a render digest (bytes) would never meet.
    const bad = Uint8Array.from([0x78, 0xff]);
    assert.match(admitNpmBundle({ name: 'x', code: bad, sha256: sha(bad) }).reason, /not UTF-8 text/);
    assert.equal(admitNpmBundle({ name: 'x', code: new TextEncoder().encode(GOOD), sha256: sha(GOOD) }).ok, true, 'bytes are accepted as downloaded');
  });

  test('a bundle that is not the pinned bytes is refused (a silent update)', () => {
    const r = admitNpmBundle({ name: 'x', code: `${GOOD}\n// changed`, sha256: sha(GOOD) });
    assert.equal(r.ok, false);
    assert.match(r.reason, /not the pinned/);
  });

  test('no pin, a malformed pin, no name and no code are each refused', () => {
    assert.match(admitNpmBundle({ name: 'x', code: GOOD }).reason, /no SHA-256 is pinned/);
    assert.match(admitNpmBundle({ name: 'x', code: GOOD, sha256: 'abc' }).reason, /no SHA-256 is pinned/);
    assert.match(admitNpmBundle({ code: GOOD, sha256: sha(GOOD) }).reason, /no name/);
    assert.match(admitNpmBundle({ name: 'x', sha256: sha(GOOD) }).reason, /no code/);
    assert.equal(admitNpmBundle(null).ok, false);
  });

  const left = {
    'a static import': 'import x from "lodash";\nfunction render(){return x}\nexport { render as default };',
    'a side-effect import': 'import "./x.js";\nfunction render(){return ""}\nexport { render as default };',
    'a re-export': 'export { a } from "dep";\nfunction render(){return ""}\nexport { render as default };',
    'export *': 'export * from "dep";\nfunction render(){return ""}\nexport { render as default };',
    'a dynamic import': 'async function render(){ return (await import("dep")).x }\nexport { render as default };',
    'import.meta': 'function render(){ return import.meta.url }\nexport { render as default };',
    'a require call': 'const x = require("lodash");\nfunction render(){return x}\nexport { render as default };',
    'esbuild’s __require helper for an external': 'var __require = (x) => { throw Error("Dynamic require of " + x) };\nvar d = __require("lodash");\nfunction render(){return d}\nexport { render as default };',
    'a comma-called require': 'function render(){ return (0, require)("dep") }\nexport { render as default };',
    'module.require': 'function render(){ return module.require("dep") }\nexport { render as default };',
    'globalThis.require': 'function render(){ return globalThis.require("dep") }\nexport { render as default };',
    'a require taken by reference': 'const r = require;\nfunction render(){return r("dep")}\nexport { render as default };',
    'importScripts': 'importScripts("https://x/y.js");\nfunction render(){return ""}\nexport { render as default };',
    'a require call nested in a function': 'function render(){ return (() => require("dep"))() }\nexport { render as default };',
    // A classic script reads these as comments and a module does not, so the check and the worker saw different code (the red team).
    'an HTML open comment hiding a line from the module parse': 'var a = 1 <!-- c /*\nvar r = importScripts;\n// */\nfunction render(){return ""}\nexport { render as default };',
    'an HTML close comment at the start of a line': 'var n = 1;\n  --> hidden\nfunction render(){return ""}\nexport { render as default };',
  };
  for (const [what, code] of Object.entries(left)) {
    test(`a bundle with ${what} left external is refused`, () => {
      const r = admitNpmBundle({ name: 'x', code, sha256: sha(code) });
      assert.equal(r.ok, false);
      assert.match(r.reason, /not a self-contained bundle/);
    });
  }

  test('`n-->0` mid-line, and `<!--` in a string, are not HTML comments', () => {
    const code = 'function render(f){ var n = 2; while (n-->0); return "<!-- x -->"; }\nexport { render as default };';
    assert.equal(admitNpmBundle({ name: 'x', code, sha256: sha(code) }).ok, true);
  });

  test('the words import( and require( in a string or a comment are not a dependency', () => {
    const code = '// require("x") and import("y")\nfunction render(){ return "import(\\"a\\") require(\\"b\\")"; }\nexport { render as default };';
    assert.equal(admitNpmBundle({ name: 'x', code, sha256: sha(code) }).ok, true);
  });

  test('a bundle that does not parse is refused rather than run unread', () => {
    const code = 'function render( {';
    assert.match(admitNpmBundle({ name: 'x', code, sha256: sha(code) }).reason, /does not parse/);
    assert.match(externalRefusal('let ;'), /does not parse/);
  });
});

describe('npmLayerRefusal (decision 7)', () => {
  const layer = (os) => ({ os, summary: `layer ${os}` });
  test('on is admitted everywhere', () => {
    for (const p of ['linux', 'darwin', 'win32']) assert.equal(npmLayerRefusal(layer('on'), p), null);
  });
  test('OFF is refused everywhere', () => {
    for (const p of ['linux', 'darwin', 'win32']) assert.match(npmLayerRefusal(layer('off'), p), /reads OFF/);
  });
  test('unmeasured is a failed probe on every platform, so it refuses (decision 13: macOS and Windows are measured now)', () => {
    for (const p of ['linux', 'darwin', 'win32']) assert.match(npmLayerRefusal(layer('unmeasured'), p), /cannot be (measured|determined)/);
  });
  test('a missing or malformed layer counts as OFF', () => {
    for (const bad of [undefined, null, {}, { os: 'maybe' }, 'on', 5]) assert.match(npmLayerRefusal(bad, 'darwin'), /counts as OFF/, JSON.stringify(bad));
  });

  test('npmRefusals names only the npm plugins of a job, and none when the layer is admissible', () => {
    const job = { a: { npm: true }, b: {}, c: { npm: true, fence: true } };
    assert.deepEqual(Object.keys(npmRefusals(job, layer('off'), 'linux')), ['a', 'c']);
    assert.deepEqual(Object.keys(npmRefusals(job, undefined, 'linux')), ['a', 'c'], 'no layer at all counts as OFF');
    assert.deepEqual(npmRefusals(job, layer('on'), 'linux'), {});
  });
});

describe('judgeWindowsRows (decision 13: Windows is read from chrome://sandbox)', () => {
  test('every renderer locked down reads on; one not sandboxed reads off; none listed, or an unknown state, reads unmeasured', () => {
    assert.equal(judgeWindowsRows(['1234\tRenderer\tLockdown\tUntrusted', '5678\tRenderer\tLockdown\tUntrusted']), true);
    assert.equal(judgeWindowsRows(['1234\tRenderer\tLockdown', '5678\tRenderer\tNot Sandboxed']), false);
    assert.equal(judgeWindowsRows([]), null);
    assert.equal(judgeWindowsRows(['1234\tRenderer\tsomething new']), null);
    // What a real windows-latest runner's page held (2026-10-19): the table rows, then the policy JSON, which names
    // renderers and no state. The JSON must not turn four locked-down renderers into `null`.
    const real = ['9248\tRenderer\t\tRenderer\tLockdown\tS-1-16-0 Untrusted\t\u279501111001100110000100000020010000', '4868\tRenderer\t\tRenderer\tLockdown\tS-1-16-0 Untrusted\t\u279501111001100110000100000020010000', '    "name": "RendererAppContainer"', '    "tag": "renderer!kRenderer",'];
    assert.equal(judgeWindowsRows(real), true);
    assert.equal(judgeWindowsRows(['    "tag": "renderer!kRenderer",']), null, 'policy JSON alone is no reading');
  });
});

