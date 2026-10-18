/**
 * Unit: the code formatter (lib/authoring/code-format/). Design:
 * engineering/decisions/2026-10-15-code-plugin.md §6 and §9.
 *
 * THE GOLDEN OUTPUTS ARE THE POINT. Every formatter is pinned to an exact version in package.json,
 * and each adapter's output on a fixed input is held here, so a release that changes how code is
 * formatted fails this file and arrives as a reviewed diff. Formatting is an authoring step (it
 * rewrites the source), so a deck someone formatted never moves when a formatter is upgraded.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/authoring/code-format/adapters.mjs');
const loadPlan = () => import('../../../lib/authoring/code-format/plan.mjs');
const loadCli = () => import('../../../lib/authoring/code-format/fmt-cli.mjs');

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

// `indent=` and `quotes=` (followups.d/2710-p2): one golden per formatter per option, so each
// formatter's reading of the option is pinned as tightly as its default output above.
const STYLE_IN = {
  ts: 'function f(a:string){if(a){return "x"+a}}\n',
  css: 'a{content:"x";color:red}\n',
  yaml: 'a:\n  b: "x"\n',
  json: '{"a":{"b":1}}\n',
  php: '<?php function f($a){return "a".$a;}\n',
  java: 'class A{void m(){String s="x";}}\n',
  py: 'def f(a):\n  if a:\n    return "x"\n',
  sql: "select a,b from t where x='y'",
};
const STYLE_GOLDEN = [
  ['ts', { indent: '4' }, 'function f(a: string) {\n    if (a) {\n        return "x" + a;\n    }\n}\n'],
  ['ts', { indent: 'tab' }, 'function f(a: string) {\n\tif (a) {\n\t\treturn "x" + a;\n\t}\n}\n'],
  ['ts', { quotes: 'single' }, "function f(a: string) {\n  if (a) {\n    return 'x' + a;\n  }\n}\n"],
  ['css', { indent: 'tab', quotes: 'single' }, "a {\n\tcontent: 'x';\n\tcolor: red;\n}\n"],
  // YAML forbids a tab in indentation, so Prettier keeps spaces, at the tab's width.
  ['yaml', { indent: 'tab', quotes: 'single' }, "a:\n    b: 'x'\n"],
  // JSON's grammar requires double quotes: `quotes=single` changes nothing.
  ['json', { quotes: 'single' }, '{ "a": { "b": 1 } }\n'],
  ['php', { indent: '2', quotes: 'single' }, "<?php function f($a)\n{\n  return 'a' . $a;\n}\n"],
  // Java's `"…"` is a String and `'x'` a char: the quote is meaning, so it stays.
  ['java', { indent: 'tab', quotes: 'single' }, 'class A {\n\n\tvoid m() {\n\t\tString s = "x";\n\t}\n}\n'],
  ['py', { indent: '2' }, 'def f(a):\n  if a:\n    return "x"\n'],
  ['py', { indent: 'tab', quotes: 'single' }, "def f(a):\n\tif a:\n\t\treturn 'x'\n"],
  ['sql', { indent: '4' }, "select\n    a,\n    b\nfrom\n    t\nwhere\n    x = 'y'"],
  // sql-formatter reads no quote option, and the adapter passes none: in SQL a quote is meaning.
  ['sql', { indent: 'tab', quotes: 'double' }, "select\n\ta,\n\tb\nfrom\n\tt\nwhere\n\tx = 'y'"],
];

describe('code-format — indent= and quotes=, against their golden outputs', () => {
  for (const [lang, opts, want] of STYLE_GOLDEN) {
    test(`${lang} ${JSON.stringify(opts)}`, async () => {
      const { formatBlock } = await load();
      const r = await formatBlock({ lang, code: STYLE_IN[lang], opts });
      assert.equal(r.ok, true, r.error);
      assert.equal(r.text, want);
    });
  }

  test('a tab counts four columns toward the width, as the panel draws it', async () => {
    const { formatBlock } = await load();
    // `call(alpha, beta, gamma, delta);` is 32 columns, three tabs deep: 44 at a tab of 4, 38 at 2.
    // At width 40 it must break, which it would not if a tab counted Prettier's default 2.
    const code = 'function f(){if(a){if(b){call(alpha, beta, gamma, delta)}}}\n';
    const out = (await formatBlock({ lang: 'ts', code, opts: { indent: 'tab', width: 40 } })).text;
    assert.doesNotMatch(out, /^\t\t\tcall\(alpha, beta, gamma, delta\);$/m);
    const roomy = (await formatBlock({ lang: 'ts', code, opts: { indent: 'tab', width: 44 } })).text;
    assert.match(roomy, /^\t\t\tcall\(alpha, beta, gamma, delta\);$/m, 'guard: 44 columns fits it whole');
  });

  test('the planner hands a block its record\'s indent and quotes, over the deck default', async () => {
    const { planFormat } = await loadPlan();
    const md = '---\ncode: indent=4, quotes=single\n---\n\n```ts\na\n```\n\n`@code{indent=tab, numbers}`\n```ts\nb\n```\n';
    assert.deepEqual(planFormat(md, { all: true }).jobs.map((j) => j.opts), [
      { indent: '4', quotes: 'single' },
      { indent: 'tab', quotes: 'single' },
    ]);
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

describe('code-format — which blocks the planner takes', () => {
  const langs = (plan) => plan.jobs.map((j) => [j.lang, j.code]);

  test('`all` takes every top-level block a formatter reads; format=off, nested and plugin fences stay', async () => {
    const { planFormat } = await loadPlan();
    const md = '# A\n\n```ts\nconst a={b:1}\n```\n\n`@code{format=off}`\n```js\nconst  keep = 1\n```\n\n```mermaid\nflowchart LR\n```\n\n- list\n  ```ts\n  const  nested = 1\n  ```\n';
    assert.deepEqual(langs(planFormat(md, { all: true })), [['ts', 'const a={b:1}\n']]);
  });

  test('without `all`, only the blocks that ask: their record, or the deck default', async () => {
    const { planFormat } = await loadPlan();
    const md = '# A\n\n```ts\nconst a=1\n```\n\n`@code{format}`\n```ts\nconst b=2\n```\n';
    assert.deepEqual(langs(planFormat(md)), [['ts', 'const b=2\n']]);
    assert.equal(planFormat(`---\ncode: format\n---\n\n${md}`).jobs.length, 2);
  });

  test('a fence inside an HTML comment or an HTML block is not a fence', async () => {
    const { planFormat } = await loadPlan();
    const md = '<!--\n```js\nconst   inNote=1\n```\n-->\n\n<div>\n\n```js\nx\n```\n\n</div>\n';
    assert.deepEqual(langs(planFormat(md, { all: true })), [['js', 'x\n']], 'only the fence markdown-it sees');
    assert.deepEqual(langs(planFormat('<!--\n```js\nconst   inNote=1\n```\n-->\n', { all: true })), []);
  });

  test('a record on the line under a sentence continues it, so it asks nothing, as the render reads it', async () => {
    const { planFormat } = await loadPlan();
    assert.equal(planFormat('Run this:\n`@code{format}`\n```ts\nconst a=1\n```\n').jobs.length, 0);
    assert.equal(planFormat('Run this:\n\n`@code{format}`\n```ts\nconst a=1\n```\n').jobs.length, 1);
  });

  test('a closing fence indented four spaces does not close, as CommonMark reads it', async () => {
    const { planFormat } = await loadPlan();
    const [job] = planFormat('```yaml\na:   1\n    ```\nb:   2\n```\n', { all: true }).jobs;
    assert.equal(job.code, 'a:   1\n    ```\nb:   2\n');
  });

  test('a diff block, and a block in a language no formatter reads, are left alone and reported when asked', async () => {
    const { planFormat } = await loadPlan();
    const plan = planFormat('`@code{format, diff}`\n```js\n-a\n+b\n```\n\n`@code{format}`\n```go\npackage main\n```\n\n```go\nx\n```\n', { all: true });
    assert.equal(plan.jobs.length, 0);
    assert.deepEqual(plan.skipped.map((s) => [s.lang, s.line, /diff|no formatter/.test(s.error)]), [['js', 3, true], ['go', 9, true]]);
  });
});

describe('code-format — the splice', () => {
  test('a formatted body goes back in place, and the change is a character range of the original', async () => {
    const { planFormat, applyFormat } = await loadPlan();
    const md = '# A\n\n```ts\nconst a={b:1}\n```\n\nText.\n';
    const plan = planFormat(md, { all: true });
    const out = applyFormat(md, plan, new Map([[plan.jobs[0].id, { ok: true, text: 'const a = { b: 1 };\n' }]]), { all: true });
    assert.equal(out.markdown, '# A\n\n```ts\nconst a = { b: 1 };\n```\n\nText.\n');
    assert.deepEqual(out.changes, [{ from: md.indexOf('const'), to: md.indexOf('const') + 'const a={b:1}'.length, insert: 'const a = { b: 1 };' }]);
    // Applying the change to the original gives the same text: what an editor dispatches.
    const [c] = out.changes;
    assert.equal(md.slice(0, c.from) + c.insert + md.slice(c.to), out.markdown);
  });

  test('a failed block keeps its text and is reported', async () => {
    const { planFormat, applyFormat } = await loadPlan();
    const md = '`@code{format}`\n```ts\nconst = ;\n```\n';
    const plan = planFormat(md);
    const out = applyFormat(md, plan, new Map([[plan.jobs[0].id, { ok: false, error: 'Unexpected token (1:7)' }]]));
    assert.equal(out.markdown, md);
    assert.deepEqual(out.changes, []);
    assert.deepEqual(out.skipped, [{ lang: 'ts', line: 3, error: 'Unexpected token (1:7)' }]);
  });

  test('a result that would close its own fence early is refused', async () => {
    const { planFormat, applyFormat } = await loadPlan();
    const md = '`@code{format}`\n```md\ntext\n```\n';
    const plan = planFormat(md);
    const out = applyFormat(md, plan, new Map([[plan.jobs[0].id, { ok: true, text: 'text\n```\nescaped\n' }]]));
    assert.equal(out.markdown, md);
    assert.match(out.skipped[0].error, /close its own fence/);
  });
});

describe('lattice fmt — formatDeck', () => {
  test('formats the deck, and leaves the rest of it alone', async () => {
    const { formatDeck } = await loadCli();
    const r = await formatDeck('# A\n\n`@code{numbers}`\n```ts\nconst a={b:1}\n```\n\nText.\n');
    assert.equal(r.text, '# A\n\n`@code{numbers}`\n```ts\nconst a = { b: 1 };\n```\n\nText.\n');
    assert.equal(r.changes, 1);
  });

  test('keeps the file\'s line endings and byte-order mark', async () => {
    const { formatDeck } = await loadCli();
    const r = await formatDeck('\uFEFF# A\r\n\r\n```ts\r\nconst a={b:1}\r\n```\r\n');
    assert.equal(r.text, '\uFEFF# A\r\n\r\n```ts\r\nconst a = { b: 1 };\r\n```\r\n');
  });

  test('a deck with nothing to change comes back byte-identical', async () => {
    const { formatDeck } = await loadCli();
    const md = '# A\n\n```ts\nconst a = { b: 1 };\n```\n';
    const r = await formatDeck(md);
    assert.equal(r.text, md);
    assert.equal(r.changed, false);
  });

  test('--check exits 1 when a block would change and writes nothing', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-')), 'deck.md');
    const md = '# A\n\n```ts\nconst a={b:1}\n```\n';
    fs.writeFileSync(file, md);
    const cli = path.join(__dirname, '..', '..', '..', 'lattice.js');
    const check = spawnSync(process.execPath, [cli, 'fmt', file, '--check'], { encoding: 'utf8' });
    assert.equal(check.status, 1, check.stderr);
    assert.equal(fs.readFileSync(file, 'utf8'), md);
    const write = spawnSync(process.execPath, [cli, 'fmt', file], { encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    assert.match(fs.readFileSync(file, 'utf8'), /const a = \{ b: 1 \};/);
    assert.equal(spawnSync(process.execPath, [cli, 'fmt', file, '--check'], { encoding: 'utf8' }).status, 0);
  });
});
