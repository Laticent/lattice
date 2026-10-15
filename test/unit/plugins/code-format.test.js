/**
 * Unit: the code-format plugin (lib/plugins/code-format/). Design:
 * engineering/decisions/2026-10-15-code-plugin.md §6.
 *
 * THE GOLDEN OUTPUTS ARE THE POINT. Every formatter is pinned to an exact version in package.json,
 * and each adapter's output on a fixed input is held here, so a release that changes how code is
 * formatted fails this file and arrives as a reviewed diff, never a surprise in an exported deck.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/plugins/code-format/shared/adapters.mjs');
const loadPlan = () => import('../../../lib/plugins/code-format/shared/plan.mjs');

const GOLDEN = [
  ['ts', `export async function load(id:string):Promise<User>{const hit=cache.get(id);if(hit)return hit;return api.get(\`/users/\${id}\`)}\n`, {},
    `export async function load(id: string): Promise<User> {\n  const hit = cache.get(id);\n  if (hit) return hit;\n  return api.get(\`/users/\${id}\`);\n}\n`],
  ['js', 'const a={b:1,c:[1,2,3]}\n', {}, 'const a = { b: 1, c: [1, 2, 3] };\n'],
  ['json', '{"a":1,"b":[1,2]}\n', {}, '{ "a": 1, "b": [1, 2] }\n'],
  ['css', 'a{color:red;margin:0}\n', {}, 'a {\n  color: red;\n  margin: 0;\n}\n'],
  ['yaml', 'a:   1\nb: [1,2]\n', {}, 'a: 1\nb: [1, 2]\n'],
  ['graphql', 'query{user(id:1){name}}\n', {}, 'query {\n  user(id: 1) {\n    name\n  }\n}\n'],
  ['html', '<div><p>hi</p></div>\n', {}, '<div><p>hi</p></div>\n'],
  ['php', '<?php function f($a){return $a+1;}\n', {}, '<?php function f($a)\n{\n    return $a + 1;\n}\n'],
  ['xml', '<a><b x="1">t</b></a>\n', {}, '<a><b x="1">t</b></a>\n'],
  ['java', 'class A{void m(){int x=1;}}\n', {}, 'class A {\n\n  void m() {\n    int x = 1;\n  }\n}\n'],
  ['py', 'def f(a,b):\n  return {"a":a,"b":b,"sum":a+b,"product":a*b}\n', { width: 40 },
    'def f(a, b):\n    return {\n        "a": a,\n        "b": b,\n        "sum": a + b,\n        "product": a * b,\n    }\n'],
  ['sql', 'select a,b from t where x>1', { dialect: 'postgresql' }, 'select\n  a,\n  b\nfrom\n  t\nwhere\n  x > 1'],
];

describe('code-format — each adapter, against its golden output', () => {
  for (const [lang, code, opts, want] of GOLDEN) {
    test(`${lang}`, async () => {
      const { formatBlock } = await load();
      const r = await formatBlock({ lang, code, opts });
      assert.equal(r.ok, true, r.error);
      assert.equal(r.text, want);
    });
  }

  test('a width moves the break', async () => {
    const { formatBlock } = await load();
    const code = 'const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n';
    assert.equal((await formatBlock({ lang: 'ts', code, opts: { width: 100 } })).text.split('\n').length, 2);
    assert.ok((await formatBlock({ lang: 'ts', code, opts: { width: 40 } })).text.split('\n').length > 2);
  });
});

describe('code-format — failure never mangles', () => {
  test('invalid code is refused with where, not reformatted', async () => {
    const { formatBlock } = await load();
    const r = await formatBlock({ lang: 'ts', code: 'const = ;\n', opts: {} });
    assert.equal(r.ok, false);
    assert.match(r.error, /\(1:7\)/);
  });

  test('a language no formatter reads says so', async () => {
    const { formatBlock } = await load();
    assert.deepEqual(await formatBlock({ lang: 'go', code: 'package main\n', opts: {} }), { ok: false, error: 'no formatter here reads go' });
  });
});

describe('code-format — the plan and the splice', () => {
  const DECK = '---\ncode: format\n---\n\n# A\n\n```ts\nconst a={b:1}\n```\n\n`@code{format=off}`\n```ts\nconst  keep = 1\n```\n\n- a list\n  ```ts\n  const  nested = 1\n  ```\n';

  test('a deck default formats every block, a record turns one off, a nested fence keeps its layout', async () => {
    const { planFormat } = await loadPlan();
    assert.deepEqual(planFormat(DECK).map((j) => [j.lang, j.code]), [['ts', 'const a={b:1}\n']]);
  });

  test('a failed block keeps its text and is reported', async () => {
    const { planFormat, applyFormat } = await loadPlan();
    const md = '`@code{format}`\n```ts\nconst = ;\n```\n';
    const jobs = planFormat(md);
    const out = applyFormat(md, jobs, new Map([[jobs[0].id, { ok: false, error: 'Unexpected token (1:7)' }]]));
    assert.equal(out.markdown, md);
    assert.deepEqual(out.skipped, [{ lang: 'ts', line: 2, error: 'Unexpected token (1:7)' }]);
  });

  test('a result that would close its own fence early is refused', async () => {
    const { planFormat, applyFormat } = await loadPlan();
    const md = '`@code{format}`\n```md\ntext\n```\n';
    const jobs = planFormat(md);
    const out = applyFormat(md, jobs, new Map([[jobs[0].id, { ok: true, text: 'text\n```\nescaped\n' }]]));
    assert.equal(out.markdown, md);
    assert.match(out.skipped[0].error, /close its own fence/);
  });
});

describe('code-format — the bake (the CLI half)', () => {
  test('formats through its worker process and leaves the rest of the deck alone', () => {
    const { bake } = require('../../../lib/plugins/code-format/code-format.bake.js');
    const md = '# A\n\n`@code{format, numbers}`\n```ts\nconst a={b:1}\n```\n\nText.\n';
    assert.equal(bake(md, { quiet: true }), '# A\n\n`@code{format, numbers}`\n```ts\nconst a = { b: 1 };\n```\n\nText.\n');
  });

  test('a deck that formats nothing is returned as it came, and spawns nothing', () => {
    const { bake } = require('../../../lib/plugins/code-format/code-format.bake.js');
    const md = '# A\n\n```ts\nconst a={b:1}\n```\n';
    assert.equal(bake(md, { quiet: true }), md);
  });
});
