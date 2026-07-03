/**
 * Unit: the chat Markdown renderer. The Architect replies in Markdown; the bubble
 * showed it raw. This renders a safe subset to HTML — the key property being that
 * it's XSS-safe (everything escaped first), so a model reply can never inject a
 * live tag. Pure → fully verifiable here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/ai/chat-markdown.js');
}

describe('renderMarkdown', () => {
  test('renders bold, italic, and inline code', async () => {
    const { renderMarkdown } = await load();
    const h = renderMarkdown('Make it **bold**, a bit *italic*, and `code`.');
    assert.match(h, /<strong>bold<\/strong>/);
    assert.match(h, /<em>italic<\/em>/);
    assert.match(h, /<code>code<\/code>/);
  });

  test('inline code is protected — numbers in code are not mangled', async () => {
    const { renderMarkdown } = await load();
    const h = renderMarkdown('slide `10` and a plain 10 here');
    assert.match(h, /<code>10<\/code>/);
    // the bare " 10 " must NOT become a <code> (the old sentinel bug)
    assert.match(h, /plain 10 here/);
  });

  test('renders a bullet list and an ordered list', async () => {
    const { renderMarkdown } = await load();
    const ul = renderMarkdown('- one\n- two');
    assert.match(ul, /<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
    const ol = renderMarkdown('1. first\n2. second');
    assert.match(ol, /<ol[^>]*><li>first<\/li><li>second<\/li><\/ol>/);
  });

  test('renders a fenced code block, escaping its contents', async () => {
    const { renderMarkdown } = await load();
    const h = renderMarkdown('Try:\n```js\nconst x = a < b && c > d;\n```');
    assert.match(h, /<pre class="db-md-pre"><code>const x = a &lt; b &amp;&amp; c &gt; d;<\/code><\/pre>/);
    // markdown inside a fence is NOT formatted
    const h2 = renderMarkdown('```\n**not bold**\n```');
    assert.doesNotMatch(h2, /<strong>/);
  });

  test('a slide body with a chart fence renders as a code block', async () => {
    const { renderMarkdown } = await load();
    const h = renderMarkdown('```chart\nbar\n10\n```');
    assert.match(h, /<pre class="db-md-pre"><code>bar\n10<\/code><\/pre>/);
  });

  test('headings render as emphasized lines', async () => {
    const { renderMarkdown } = await load();
    assert.match(renderMarkdown('# Title'), /<div class="db-md-h">Title<\/div>/);
    assert.match(renderMarkdown('### Sub'), /<div class="db-md-h">Sub<\/div>/);
  });

  test('safe links pass; javascript: and data: are rejected (kept as text)', async () => {
    const { renderMarkdown } = await load();
    const ok = renderMarkdown('see [docs](https://example.com/x)');
    assert.match(ok, /<a href="https:\/\/example\.com\/x" target="_blank" rel="noopener noreferrer">docs<\/a>/);
    const bad = renderMarkdown('[x](javascript:alert(1))');
    assert.doesNotMatch(bad, /<a /);
    assert.match(bad, /\[x\]\(javascript:alert\(1\)\)/); // left as literal text
  });

  test('escapes HTML so a model reply cannot inject a tag', async () => {
    const { renderMarkdown } = await load();
    const h = renderMarkdown('hi <img src=x onerror=alert(1)> there');
    assert.doesNotMatch(h, /<img/);
    assert.match(h, /&lt;img/);
  });

  test('multi-line prose becomes a paragraph with <br> between lines', async () => {
    const { renderMarkdown } = await load();
    const h = renderMarkdown('line one\nline two');
    assert.match(h, /<p>line one<br>line two<\/p>/);
  });

  test('empty input → empty string (no throw)', async () => {
    const { renderMarkdown } = await load();
    assert.equal(renderMarkdown(''), '');
    assert.equal(renderMarkdown(null), '');
  });
});

describe('renderMarkdownStream (live, partial-syntax safe)', () => {
  test('a closed construct renders styled even while more streams behind it', async () => {
    const { renderMarkdownStream } = await load();
    // "**done** and then *par" — the bold is closed, the italic is still open.
    const h = renderMarkdownStream('**done** and then *par');
    assert.match(h, /<strong>done<\/strong>/);
  });

  test('an open code fence is held back, not flashed as a <pre> tail', async () => {
    const { renderMarkdownStream } = await load();
    const h = renderMarkdownStream('Here is code:\n```js\nconst x = 1');
    assert.doesNotMatch(h, /<pre/); // the open fence + its body are withheld
    assert.match(h, /Here is code:/); // everything before the fence still renders
  });

  test('a closed fence renders as a code block (closing fence not mistaken for partial)', async () => {
    const { renderMarkdownStream } = await load();
    const h = renderMarkdownStream('```\nconst x = 1\n```');
    assert.match(h, /<pre class="db-md-pre"><code>const x = 1<\/code><\/pre>/);
  });

  test('an unclosed inline-code span is withheld until its backtick closes', async () => {
    const { renderMarkdownStream } = await load();
    assert.doesNotMatch(renderMarkdownStream('use the `slot'), /`/); // dangling backtick hidden
    assert.match(renderMarkdownStream('use the `slot`'), /<code>slot<\/code>/);
  });

  test('a half-typed link is withheld until ](url) completes', async () => {
    const { renderMarkdownStream } = await load();
    assert.doesNotMatch(renderMarkdownStream('see [the docs](http'), /\[the docs\]/);
    assert.match(renderMarkdownStream('see [the docs](https://x.com)'), /<a href="https:\/\/x\.com"/);
  });

  test('empty / null input → empty string (no throw)', async () => {
    const { renderMarkdownStream } = await load();
    assert.equal(renderMarkdownStream(''), '');
    assert.equal(renderMarkdownStream(null), '');
  });
});

describe('scrollJumpState', () => {
  test('hidden when content does not overflow', async () => {
    const { scrollJumpState } = await load();
    assert.deepEqual(scrollJumpState({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 }), { top: false, bottom: false });
  });

  test('at the top of a long thread: offer "to bottom" only', async () => {
    const { scrollJumpState } = await load();
    assert.deepEqual(scrollJumpState({ scrollTop: 0, scrollHeight: 1000, clientHeight: 300 }), { top: false, bottom: true });
  });

  test('at the bottom: offer "to top" only', async () => {
    const { scrollJumpState } = await load();
    assert.deepEqual(scrollJumpState({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 }), { top: true, bottom: false });
  });

  test('in the middle: offer both', async () => {
    const { scrollJumpState } = await load();
    assert.deepEqual(scrollJumpState({ scrollTop: 400, scrollHeight: 1000, clientHeight: 300 }), { top: true, bottom: true });
  });
});
