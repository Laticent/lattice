/**
 * live-author-html — the count behind the CLI's warning that a plain `.html` export keeps the
 * deck's own script live (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 10).
 * The export bytes do not change; what is pinned is that the CLI says so, and only when it is true.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { countLiveAuthorHtml, formatLiveAuthorHtmlWarning } = require('../../../lib/core/live-author-html');

test('an author <script> and an on… handler are counted', () => {
  const html = '<section><img src=x onerror="top.p=1"><script>window.q=1</script></section>';
  assert.deepEqual(countLiveAuthorHtml(html), { scripts: 1, handlers: 1, urls: 0 });
});

test("the engine's own marked scripts are not the deck's", () => {
  const html = '<script data-lattice-script>run()</script><script data-lattice-script="">x()</script>';
  assert.deepEqual(countLiveAuthorHtml(html), { scripts: 0, handlers: 0, urls: 0 });
});

test('a data script does not run, so it is not counted; a module does', () => {
  assert.equal(countLiveAuthorHtml('<script type="application/json">{}</script>').scripts, 0);
  assert.equal(countLiveAuthorHtml("<script type='text/x-template'>t</script>").scripts, 0);
  assert.equal(countLiveAuthorHtml('<script type="module">m()</script>').scripts, 1);
  assert.equal(countLiveAuthorHtml('<SCRIPT TYPE="text/javascript" src="a.js"></SCRIPT>').scripts, 1);
  assert.equal(countLiveAuthorHtml('<script type="">x()</script>').scripts, 1);
});

test('text inside a script or a style is not an attribute', () => {
  const html = '<script data-lattice-script>el.innerHTML = "<img onerror=boom>"</script>'
    + '<style>.x::after{content:"<b onclick=y>"}</style><p>plain onload= prose</p>';
  assert.deepEqual(countLiveAuthorHtml(html), { scripts: 0, handlers: 0, urls: 0 });
});

test('every handler on every element counts, in any case and quoting', () => {
  const html = '<svg onload=a()><rect ONCLICK="b()" onmouseover=\'c()\'/></svg><div/onfocus=d()>';
  assert.equal(countLiveAuthorHtml(html).handlers, 4);
});

test('a word that merely starts with "on" in an attribute name is not a handler', () => {
  assert.equal(countLiveAuthorHtml('<div data-one="1" none="2" class="online">x</div>').handlers, 0);
});

test('the warning names the file, the counts and --player; and is silent on a clean deck', () => {
  assert.deepEqual(formatLiveAuthorHtmlWarning({ scripts: 0, handlers: 0 }, 'deck.html'), []);
  const [head, tail] = formatLiveAuthorHtmlWarning({ scripts: 2, handlers: 1 }, 'deck.html');
  assert.match(head, /deck\.html keeps the deck's own HTML live: 2 <script>s and 1 on… handler\. Whoever opens the file runs them\./);
  const [three] = formatLiveAuthorHtmlWarning({ scripts: 1, handlers: 2, urls: 1 }, 'deck.html');
  assert.match(three, /1 <script>, 2 on… handlers and 1 javascript: URL or srcdoc frame\./);
  assert.match(tail, /--player/);
  const [side] = formatLiveAuthorHtmlWarning({ scripts: 1, handlers: 0 }, 'deck.html', { sidecar: true });
  assert.match(side, /deck\.html \(the HTML sidecar\) .*1 <script>\. Whoever opens the file runs it\./);
});

test("a handler on a script's own opening tag still counts", () => {
  assert.deepEqual(countLiveAuthorHtml('<script src="a.js" onload="b()"></script>'), { scripts: 1, handlers: 1, urls: 0 });
});

test('a srcdoc frame and a javascript: URL run code too', () => {
  const html = '<iframe srcdoc="&lt;script&gt;x()&lt;/script&gt;"></iframe><a href="javascript:alert(1)">a</a>'
    + "<a href=' javascript:void(0)'>b</a><svg><a xlink:href=\"javascript:y()\"><text>c</text></a></svg>";
  assert.equal(countLiveAuthorHtml(html).urls, 4);
  assert.equal(countLiveAuthorHtml('<a href="https://example.com/javascript:">ok</a><img src="javascript.png">').urls, 0);
});
