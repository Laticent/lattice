/**
 * The CLI plugin door's sanitizer page inlines remote-ref.js's siblings as page scripts (lib/packages/code-door-worker.js
 * `asPageScript`), and an `.mjs` sibling (the CSS tokenizer, Segno P5) through `esmExpression`. A page script that quietly
 * lost an export would leave the remote check half-loaded (HARD RULE #22), so every form it cannot carry must throw.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { esmExpression } = require('../../../lib/packages/code-door-worker.js');

const ROOT = path.join(__dirname, '..', '..', '..');

function fixture(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-door-esm-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'mod.mjs');
  fs.writeFileSync(file, body);
  return file;
}

test('esmExpression: the CSS tokenizer inlines with exactly the names Node exports from it', () => {
  const file = path.join(ROOT, 'lib/core/css-tokens.mjs');
  const page = vm.runInNewContext(esmExpression(file));
  const node = Object.keys(require(file)).filter((k) => k !== '__esModule' && k !== 'module.exports');
  assert.deepEqual(Object.keys(page).sort(), node.sort());
  assert.equal(page.cssUrls('a{b:url("x.png")}')[0].value, 'x.png');
});

test('esmExpression: a multi-name export throws, so no name is dropped quietly', (t) => {
  const file = fixture(t, 'export const a = 1, b = 2;\nexport function c() { return a + b; }\n');
  assert.throws(() => esmExpression(file), /exports a, b, c, but the page script would carry a, c/);
});

test('esmExpression: import, export lists, default and async exports are refused', (t) => {
  for (const body of ['import x from "./y.mjs";\nexport const a = 1;\n', 'const a = 1;\nexport { a };\n', 'export default 1;\n', 'export async function a() {}\n']) {
    assert.throws(() => esmExpression(fixture(t, body)), /code door: mod\.mjs/, body);
  }
});
