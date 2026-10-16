/**
 * Unit: the code plugin's `@code{…}` record (lib/plugins/code/shared/record.js, code.syntax.mjs,
 * code.render.js) and its lint rules (lib/authoring/lint-core.js, rule 12c).
 * Design: engineering/decisions/2026-10-15-code-plugin.md §7.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../../../lib/engine/index.js');
const record = require('../../../lib/plugins/code/shared/record.js');
const { lintTextWith } = require('../../../lib/authoring/lint-core.js');

const render = (md) => createEngine().render(md).html;
const pre = (html, n = 0) => [...html.matchAll(/<pre[\s\S]*?<\/pre>/g)][n]?.[0] ?? '';
const FENCE = '```ts\nconst a = 1;\n/* two\nlines */\nlet b = 2;\n```\n';

describe('the record reader', () => {
  test('reads every field, and line targets in the `_focus: line` grammar', () => {
    const r = record.readBody(record.recordBody('@code{title="src/a, b.ts", numbers, start=12, focus=3-5 9, mark=2, diff, wrap, format, width=48, dialect=PostgreSQL}'));
    assert.equal(r.ok, true);
    assert.deepEqual({ ...r.value, focus: [...r.value.focus], mark: [...r.value.mark] }, {
      title: 'src/a, b.ts', numbers: true, start: 12, focus: [3, 4, 5, 9], mark: [2], diff: true, wrap: true,
      format: true, width: 48, dialect: 'postgresql',
    });
  });

  test('says what it cannot read, and keeps what it can', () => {
    assert.match(record.readBody('{wat}').problems[0], /not anything code options takes/);
    const r = record.readBody('{numbers, focus=x, width=4}');
    assert.equal(r.ok, false);
    assert.equal(r.value.numbers, true);
    assert.equal(r.problems.length, 2);
  });

  test('`format=off` turns a deck default off; the bare word turns it on', () => {
    assert.equal(record.readBody('{format}').value.format, true);
    assert.equal(record.readBody('{format=off}').value.format, false);
  });

  test('`indent=` takes 2, 4 or tab and `quotes=` single or double; anything else is named', () => {
    assert.deepEqual(record.readBody('{indent=tab, quotes=single}').value, { indent: 'tab', quotes: 'single' });
    assert.deepEqual(record.readBody('{indent=2, quotes=double}').value, { indent: '2', quotes: 'double' });
    assert.match(record.readBody('{indent=3}').problems[0], /"3" is not one of 2, 4, tab/);
    assert.match(record.readBody('{quotes=back}').problems[0], /"back" is not one of single, double/);
    assert.deepEqual(record.deckDefaults('code: indent=4, quotes=single\n'), { indent: '4', quotes: 'single' });
    // A tab is as wide as the indent; `tab` draws four columns, and unset is the caller's (CSS's 8).
    assert.deepEqual(['2', '4', 'tab'].map(record.tabColumns), [2, 4, 4]);
  });

  test('only exactly `@code{…}` is a record', () => {
    assert.equal(record.recordBody('@code{numbers}'), '{numbers}');
    assert.equal(record.recordBody('@code {numbers}'), null);
    assert.equal(record.recordBody('@codes{numbers}'), null);
  });

  test('the deck default reads from top-level `code:` in the front matter', () => {
    assert.deepEqual(record.deckDefaults('theme: indaco\ncode: numbers, wrap\n'), { numbers: true, wrap: true });
    assert.deepEqual(record.deckDefaults('style:\n  code: numbers\n'), {});
  });
});

describe('rendering a record', () => {
  test('`indent=` stamps the panel, so a tab draws at that width; the deck default does too', () => {
    const tabbed = '```go\nfunc f() {\n\treturn\n}\n```\n';
    assert.match(pre(render(`# A\n\n\`@code{indent=tab}\`\n${tabbed}`)), /^<pre class="lat-code" data-indent="tab">/);
    assert.match(pre(render(`---\ncode: indent=2\n---\n\n# A\n\n${tabbed}`)), /^<pre class="lat-code" data-indent="2">/);
    assert.match(pre(render(`# A\n\n${tabbed}`)), /^<pre class="lat-code">/, 'no indent, no attribute: CSS keeps 8');
  });

  test('the record line renders nothing; the fence below carries it', () => {
    const html = render(`# A\n\n\`@code{numbers}\`\n\n${FENCE}`);
    assert.doesNotMatch(html, /@code/);
    assert.match(pre(html), /^<pre class="lat-code lat-code-numbers">/);
  });

  test('numbers, focus and mark land on SOURCE lines, across a multi-line comment', () => {
    const html = pre(render(`# A\n\n\`@code{numbers, start=7, focus=4, mark=3}\`\n${FENCE}`));
    assert.match(html, /data-focus-style="spotlight" data-focus-axis="line"/);
    assert.match(html, /<span class="ln lat-recede" data-n="7"><span class="hljs-keyword">const<\/span>/);
    assert.match(html, /<span class="ln lat-recede lat-mark" data-n="9"><span class="hljs-comment">lines \*\/<\/span><\/span>/);
    assert.match(html, /<span class="ln lat-focus" data-n="10"><span class="hljs-keyword">let<\/span>/);
  });

  test('a title is a bar inside the panel, escaped', () => {
    const html = pre(render(`# A\n\n\`@code{title="<b>a.ts"}\`\n${FENCE}`));
    assert.match(html, /<span class="lat-code-title">&lt;b&gt;a\.ts<\/span><code class="language-ts">/);
  });

  test('diff keeps the markers and highlights the rest in the fence language', () => {
    const html = pre(render('# A\n\n`@code{diff}`\n```ts\n const a = 1;\n-let b = 2;\n+let b = 3;\n```\n'));
    assert.match(html, /<span class="ln" data-diff="del"><span class="lat-diff-mark">-<\/span><span class="hljs-keyword">let<\/span>/);
    assert.match(html, /<span class="ln" data-diff="ins"><span class="lat-diff-mark">\+<\/span><span class="hljs-keyword">let<\/span>/);
  });

  test('three-digit numbers widen the number column', () => {
    assert.match(pre(render(`# A\n\n\`@code{numbers, start=98}\`\n${FENCE}`)), /data-digits="3"/);
    assert.doesNotMatch(pre(render(`# A\n\n\`@code{numbers}\`\n${FENCE}`)), /data-digits/);
  });

  test('`wrap` alone splits the block into lines, which carry its hanging indent', () => {
    const html = pre(render(`# A\n\n\`@code{wrap}\`\n${FENCE}`));
    assert.match(html, /class="lat-code lat-code-wrap"/);
    assert.match(html, /^<pre class="lat-code lat-code-wrap"><code class="language-ts"><span class="ln">/);
  });

  test('the deck default applies to every fence, and a record overrides it', () => {
    const html = render(`---\ncode: numbers, wrap\n---\n\n# A\n\n${FENCE}\n---\n\n# B\n\n\`@code{title=x}\`\n${FENCE}`);
    assert.match(pre(html, 0), /class="lat-code lat-code-numbers lat-code-wrap"/);
    assert.match(pre(html, 1), /class="lat-code lat-code-numbers lat-code-wrap"><span class="lat-code-title">x<\/span>/);
  });

  test('a record that is not directly above a fence stays inline code', () => {
    assert.match(render('# A\n\n`@code{numbers}`\n\nText.\n'), /<code>@code\{numbers\}<\/code>/);
    assert.match(render('# A\n\nWrite `@code{numbers}` above a fence.\n'), /<code>@code\{numbers\}<\/code>/);
  });

  test('a caption span above a fence on a `code` slide is still a caption', () => {
    const html = render(`<!-- _class: code -->\n\n\`Before · the old load\`\n\n## A\n\n${FENCE}`);
    // The layout lifts the lone code span into the masthead as the slide's eyebrow: that is the shape
    // a record must never take, and the one a caption must keep.
    assert.match(html, /<div class="masthead-lede"><p><code>Before · the old load<\/code><\/p><h2>A<\/h2>/);
  });

  test('a fence another plugin draws takes no options, so a deck default cannot reach the diagram', () => {
    const html = render('---\ncode: numbers, diff\n---\n\n# A\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
    const block = /<pre[^>]*><code class="language-mermaid">[\s\S]*?<\/code><\/pre>/.exec(html)?.[0] || '';
    assert.ok(block, 'the mermaid source block renders');
    assert.doesNotMatch(block, /class="ln|lat-diff-mark|lat-code-numbers/);
  });
});

describe('a record and the slide directives share one line model', () => {
  test("a slide's `_focus: line` marks the record's line spans instead of nesting new ones", () => {
    const html = pre(render(`<!-- _focus: line 4 -->\n\n# A\n\n\`@code{numbers}\`\n${FENCE}`));
    assert.match(html, /<span class="ln lat-focus" data-n="4">/);
    assert.doesNotMatch(html, /<span class="ln[^"]*"><span class="ln/);
  });

  test("the block's own `focus=` wins over a slide's `_focus: line`", () => {
    const html = pre(render(`<!-- _focus: line 1 -->\n\n# A\n\n\`@code{focus=4}\`\n${FENCE}`));
    assert.match(html, /<span class="ln lat-focus">/);
    assert.equal((html.match(/lat-focus/g) || []).length, 1);
    assert.match(html, /^<pre[^>]*>[\s\S]*<span class="ln lat-recede"><span class="hljs-keyword">const/);
  });

  test('`_build: lines` steps the record\'s line spans', () => {
    const html = pre(render(`<!-- _build: lines -->\n\n# A\n\n\`@code{numbers}\`\n${FENCE}`));
    assert.match(html, /<span class="ln" data-n="1" data-build-step="1">/);
    assert.match(html, /<span class="ln" data-n="4" data-build-step="4">/);
  });
});

describe('lint rule 12c', () => {
  const rules = (md) => lintTextWith(md, { names: new Set(), modifiers: new Set() }).filter((f) => f.rule.startsWith('code-'));
  test('an unreadable record', () => {
    assert.deepEqual(rules(`# A\n\n\`@code{wat}\`\n${FENCE}`).map((f) => f.rule), ['code-record']);
  });
  test('an orphan record', () => {
    assert.deepEqual(rules('# A\n\n`@code{numbers}`\n\nText.\n').map((f) => f.rule), ['code-record-orphan']);
  });
  test('a line reference past the end, in a record and in `_focus: line`', () => {
    assert.match(rules(`# A\n\n\`@code{focus=5}\`\n${FENCE}`)[0].message, /names line 5, and the block below has 4 lines/);
    assert.match(rules(`<!-- _focus: line 3-6 -->\n\n# A\n\n${FENCE}`)[0].message, /names line 5, 6/);
  });
  test('a record inside a fence is code, not a record', () => {
    assert.deepEqual(rules('# A\n\n````md\n`@code{wat}`\n```ts\nx\n```\n````\n'), []);
  });
  test('a clean record says nothing', () => {
    assert.deepEqual(rules(`# A\n\n\`@code{numbers, focus=1-4}\`\n${FENCE}`), []);
  });
});

describe('lint rule 12c and formatting', () => {
  const rules = (md) => lintTextWith(md, { names: new Set(), modifiers: new Set() }).filter((f) => f.rule.startsWith('code-'));
  test('a block that asks to be formatted in a language no formatter reads', () => {
    assert.deepEqual(rules('# A\n\n`@code{format}`\n```go\npackage main\n```\n').map((f) => f.rule), ['code-format-unsupported']);
  });
  test('a deck default passes an unsupported block over quietly', () => {
    assert.deepEqual(rules('---\ncode: format\n---\n\n# A\n\n```go\npackage main\n```\n'), []);
  });
  test('a block that asks to be formatted is still range-checked: the source is what renders', () => {
    assert.deepEqual(rules('# A\n\n`@code{format, focus=9}`\n```ts\nconst a={b:1}\n```\n').map((f) => f.rule), ['code-line-range']);
  });
  test('a record on the line under a sentence continues it, and is reported as configuring nothing', () => {
    const found = rules('# A\n\nRun this:\n`@code{numbers}`\n```ts\nx\n```\n');
    assert.deepEqual(found.map((f) => f.rule), ['code-record-orphan']);
    assert.match(found[0].message, /under a sentence/);
    assert.deepEqual(rules('# A\n\n## Setup\n`@code{numbers}`\n```ts\nx\n```\n'), [], 'a heading ends its block');
    assert.deepEqual(rules('# A\n\n<!-- note --!>\n`@code{numbers}`\n```ts\nx\n```\n'), [], 'a comment closed with --!> ends its block');
  });
  test('an absurd line range is reported, not expanded', () => {
    const t0 = Date.now();
    const found = rules('# A\n\n`@code{focus=1-20000000}`\n```ts\nx\n```\n');
    assert.ok(Date.now() - t0 < 1000, 'returns at once');
    assert.deepEqual(found.map((f) => f.rule), ['code-record']);
  });
});

describe('a record inside a blockquote (followups.d/2710-p4)', () => {
  const lint = (body) => lintTextWith(`---\nmarp: true\n---\n\n# A\n\n${body}`, { names: new Set(), modifiers: new Set() })
    .filter((f) => /^code-/.test(f.rule));
  const quoted = (q, record) => [`${q}Note`, q.trimEnd(), `${q}\`${record}\``, `${q}\`\`\`ts`, `${q}const a = 1;`, `${q}\`\`\``].join('\n');

  test('the render applies it, so the lint checks it: a bad range, a bad word, at any depth', () => {
    for (const q of ['> ', '> > ', '>']) {
      assert.deepEqual(lint(quoted(q, '@code{focus=9}')).map((f) => f.rule), ['code-line-range'], `${JSON.stringify(q)}: range`);
      assert.deepEqual(lint(quoted(q, '@code{numbrs}')).map((f) => f.rule), ['code-record'], `${JSON.stringify(q)}: word`);
      assert.deepEqual(lint(quoted(q, '@code{focus=1}')), [], `${JSON.stringify(q)}: a good record says nothing`);
    }
  });

  test('an orphan inside a quote is named, and an unquoted record is still read once', () => {
    assert.deepEqual(lint('> `@code{numbers}`\n>\n> Just words.').map((f) => f.rule), ['code-record-orphan']);
    assert.equal(lint(`\`@code{focus=9}\`\n\`\`\`ts\na\n\`\`\``).length, 1);
  });
});
