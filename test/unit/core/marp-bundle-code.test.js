/**
 * Unit: the Export-to-Marp bundle and the code plugin (engineering/decisions/2026-10-15-code-plugin.md,
 * defect 9 and §7).
 *
 *   1. `withoutCodeRecords` takes the `@code{…}` record lines out of the exported bytes, found by the
 *      engine's own block rule, so Marp does not print them as inline code.
 *   2. The config's engine rebuilds bash on the recipient's highlight.js from the code plugin's shell
 *      grammar. This runs the SAME source the bundle ships (`configSource`) against a real
 *      highlight.js core holding stock bash, the shape marp-core's own instance has. That a real
 *      marp-cli honors it is pinned in test/integration/export/marp-bundle-shell-grammar.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { withoutCodeRecords, withRuntimeScriptsReport, RUNTIME_SCRIPT_SRCS } = require('../../../lib/core/marp-bundle');
const { configSource } = require('../../../lib/core/marp-bundle-html');

describe('withoutCodeRecords', () => {
  test('a record directly above a fence goes, and the fence stays', () => {
    const md = '# A\n\n`@code{numbers, focus=2}`\n```ts\nconst a = 1;\n```\n';
    assert.equal(withoutCodeRecords(md), '# A\n\n```ts\nconst a = 1;\n```\n');
  });

  test('blank lines between the record and its fence are allowed, as in the engine', () => {
    assert.equal(withoutCodeRecords('`@code{numbers}`\n\n```ts\nx\n```\n'), '\n```ts\nx\n```\n');
  });

  test('a record inside a list item goes too', () => {
    assert.equal(withoutCodeRecords('- item\n\n  `@code{numbers}`\n  ```ts\n  x\n  ```\n'), '- item\n\n  ```ts\n  x\n  ```\n');
  });

  test('a record on a list item\'s first line goes, and the item keeps its marker and its fence', () => {
    const md = '- one\n- `@code{title=app.js}`\n  ```js\n  x()\n  ```\n- three\n';
    const out = withoutCodeRecords(md);
    assert.equal(out, '- one\n-\n  ```js\n  x()\n  ```\n- three\n');
    assert.equal((require('markdown-it')().render(out).match(/<li>/g) || []).length, 3, 'still three items');
  });

  test('a record quoted inside a fence, or with no fence below it, stays text', () => {
    const quoted = '````md\n`@code{numbers}`\n```ts\nx\n```\n````\n';
    assert.equal(withoutCodeRecords(quoted), quoted);
    const orphan = '`@code{numbers}`\n\n# Next\n';
    assert.equal(withoutCodeRecords(orphan), orphan);
  });

  test('a deck with no record comes back byte-identical, CRLF included', () => {
    const md = '# A\r\n\r\n```ts\r\nx\r\n```\r\n';
    assert.equal(withoutCodeRecords(md), md);
    assert.equal(withoutCodeRecords('`@code{numbers}`\r\n```ts\r\nx\r\n```\r\n'), '```ts\r\nx\r\n```\r\n');
  });

  test('the bundle kernel applies it, so both producers ship no record line', () => {
    const { markdown } = withRuntimeScriptsReport('# A\n\n`@code{numbers}`\n```ts\nx\n```\n');
    assert.doesNotMatch(markdown, /@code\{/);
    assert.match(markdown, /```ts\nx\n```/);
  });
});

describe('the bundle config rebuilds bash on the recipient\'s highlight.js', () => {
  function engineOf() {
    const ctx = {};
    vm.runInNewContext(`${configSource(RUNTIME_SCRIPT_SRCS)}\nthis.engine = engine;`, ctx);
    return ctx.engine;
  }
  function stockHljs() {
    const hl = require('highlight.js/lib/core').newInstance();
    hl.registerLanguage('bash', require('highlight.js/lib/languages/bash'));
    return hl;
  }
  const LIST = 'docker compose up -d --build';

  test('a command and its flags are colored after the engine runs, and not before', () => {
    const hl = stockHljs();
    assert.doesNotMatch(hl.highlight(LIST, { language: 'bash' }).value, /hljs-params|>docker</);
    engineOf()({ marp: { highlightjs: hl, use: () => 'used' } });
    const out = hl.highlight(LIST, { language: 'bash' }).value;
    assert.match(out, /<span class="hljs-built_in">docker<\/span>/);
    assert.match(out, /<span class="hljs-params">--build<\/span>/);
    assert.equal(hl.getLanguage('sh').name, 'Shell', 'the aliases follow');
  });

  test('a second run is a no-op, and a highlighter without bash is left alone', () => {
    const hl = stockHljs();
    const engine = engineOf();
    engine({ marp: { highlightjs: hl, use: () => 'used' } });
    const once = hl.highlight(LIST, { language: 'bash' }).value;
    engine({ marp: { highlightjs: hl, use: () => 'used' } });
    assert.equal(hl.highlight(LIST, { language: 'bash' }).value, once);
    const bare = require('highlight.js/lib/core').newInstance();
    assert.equal(engine({ marp: { highlightjs: bare, use: () => 'used' } }), 'used');
    assert.equal(bare.getLanguage('bash'), undefined);
  });

  test('a marp without a highlighter still renders', () => {
    assert.equal(engineOf()({ marp: { use: () => 'used' } }), 'used');
  });
});
