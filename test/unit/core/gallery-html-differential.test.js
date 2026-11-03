/**
 * Segno R4, the gallery gate: `lib/cli/gallery-gate.js` and the Studio's `library/gallery-gate.ts` stopped
 * parsing rendered galleries with their own spec parser (parse5, DOMParser) and read them with remote-ref.js
 * `remoteRefsInHtml`, which is `scanHtml` plus a refusal wherever the reader is unsure (D7 of
 * engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md). The old reader is frozen in
 * tools/segno-legacy/gallery-elements.js. Two promises are held here:
 *   1. On every rendered deck and gallery in the repo the two readers return the same references.
 *   2. Wherever the old reader refuses, the new one refuses too: on seeded token soups, foreign-content
 *      structures and diagram soups. Where the new one is neither unsure nor refusing a diagram, it lists
 *      every reference the old one did. A gate that refuses less is a beacon the gate stopped seeing
 *      (HARD RULE #22).
 * The arms that must fail: the new reader with its diagram text cut out, and one that ignores its unsure spans.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const remoteRef = require('../../../lib/core/remote-ref.js');
const { legacyRemoteRefsInHtml } = require('../../../tools/segno-legacy/gallery-elements.js');
const { rng, gen, genForeign } = require('../../fixtures/html-ref-soups.js');

const ROOT = path.resolve(__dirname, '../../..');
const { remoteRefsInHtml } = remoteRef;
const show = (html) => JSON.stringify(html.length > 200 ? `${html.slice(0, 200)}…` : html);
const UNSURE = 'policy:markup a browser may build differently';
const DIAGRAM = /^policy:a <.+?> (?:diagram holding markup|marked as a Mermaid diagram)/;

// Diagram hosts as a render and an author write them, with highlight spans, comments and misnesting.
const DIAGRAM_PIECES = ['<code class="language-mermaid">', '<pre class=mermaid>', '<div class="mermaid">', '</code>', '</pre>', '</div>', '<p>', '</p>', '<b>', '</b>', '<span class="hljs-string">', '</span>', 'img: x', 'https://x.test/m.png', '&#58;', '//x.test/n', '<!--', '-->', '<style>a{}</style>', '<td>', '<table>', 'text ', '"', '<br>', '&quot;', '&lt;img&gt;', '&ltimg ', 'img\0: x', '&ampcolon;'];
const genDiagram = (r) => {
  let out = '';
  const n = 2 + Math.floor(r() * 14);
  for (let k = 0; k < n; k++) out += r() < 0.5 ? DIAGRAM_PIECES[Math.floor(r() * DIAGRAM_PIECES.length)] : gen(r).slice(0, 20);
  return out;
};

/** Null when `scan` refuses wherever the old reader does, or a description of the first input where it does not. */
function weaker(scan, html) {
  const old = legacyRemoteRefsInHtml(html);
  const now = scan(html);
  if (old.length && !now.length) return `${show(html)}: the old reader refuses (${old[0]}), this one admits it`;
  if (now.some((u) => u.startsWith(UNSURE) || DIAGRAM.test(u))) return null;
  // The input stream folds CR to LF, which the new reader leaves to the readers after it: compare modulo the fold.
  const fold = (u) => u.replace(/\r\n?/g, '\n');
  const have = new Set(now.map(fold));
  const lost = old.filter((u) => !have.has(fold(u)));
  return lost.length ? `${show(html)}: lost ${JSON.stringify(lost.slice(0, 3))}` : null;
}

describe('the gallery gate reads markup with remoteRefsInHtml (Segno R4)', () => {
  test('every rendered deck and gallery in the repo: the same references as the parse5 reader', () => {
    const engine = require('../../../lib/engine/index.js').createEngine();
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.gallery\.md$|(?:^|\/)gallery\.md$|^examples\/|^test\/integration\/baseline-decks\//.test(f));
    assert.ok(files.length > 400, `only ${files.length} files`);
    assert.ok(files.filter((f) => f.endsWith('.gallery.md')).length > 90, 'the component and chart-kind galleries are missing');
    const bad = [];
    for (const f of files) {
      const { html } = engine.render(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      const old = JSON.stringify([...new Set(legacyRemoteRefsInHtml(html))].sort());
      const now = JSON.stringify([...new Set(remoteRefsInHtml(html))].sort());
      if (old !== now) bad.push(`${f}\n  parse5 ${old.slice(0, 200)}\n  scan   ${now.slice(0, 200)}`);
    }
    assert.deepEqual(bad, []);
  });

  for (const [name, make, seed, count] of [
    ['token soups', gen, 21, 20_000],
    ['foreign-content structures', genForeign, 22, 20_000],
    ['diagram soups', genDiagram, 23, 20_000],
  ]) {
    test(`${count} seeded ${name}: refuses wherever the parse5 reader refuses`, () => {
      const r = rng(seed);
      for (let k = 0; k < count; k++) {
        const html = make(r);
        const why = weaker(remoteRefsInHtml, html);
        if (why) assert.fail(why);
      }
    });
  }

  test('picked cases: a highlighted fence, a clone the tree builder makes, a comment in a diagram', () => {
    const fence = '<pre><code class="language-mermaid"><span class="hljs-section">flowchart</span>\n  A[<span class="hljs-string">&quot;x&quot;</span>] --&gt; B\n</code></pre>';
    assert.deepEqual(remoteRefsInHtml(fence), []);
    assert.ok(remoteRefsInHtml(fence.replace('flowchart</span>', 'img</span>: x')).includes('policy:an image shape (`img:`)'));
    // A `<code>` its ancestor closes is rebuilt around the text after it, class and all.
    assert.ok(remoteRefsInHtml('<span><code class="mermaid"></span>img: x</code>').some((u) => DIAGRAM.test(u)));
    assert.ok(legacyRemoteRefsInHtml('<p><code class="mermaid">a</p><p>img: x</p>').length > 0);
    assert.ok(remoteRefsInHtml('<p><code class="mermaid">a</p><p>img: x</p>').length > 0);
    // A comment is not text: `img<!---->:` is `img:` to the runtime.
    assert.ok(remoteRefsInHtml('<div class="mermaid">img<!---->: x</div>').length > 0);
    // Raw text is not decoded; RCDATA is.
    assert.deepEqual(remoteRefsInHtml('<style>a{b:url(&#x2f;/x.test/a)}</style>'), []);
    assert.ok(remoteRefsInHtml('<img src="&#x2f;/x.test/a">').includes('//x.test/a'));
    // The tree builder drops a NUL from text, so `img\0:` is `img:` to the runtime (the red team's input).
    assert.ok(remoteRefsInHtml('<code class="language-mermaid">A@{ img\0: "/\0/evil.test/a.png" }</code>').includes('policy:an image shape (`img:`)'));
    // A legacy reference with no `;` decodes in text even before a letter: `&ltimg` is `<img`.
    assert.ok(remoteRefsInHtml('<div class="mermaid">A["&ltimg alt=x&gt;"]</div>').includes('policy:an HTML media tag in a label'));
    // A Mermaid class on an element the runtime does not draw says so, and the unsure reason says where.
    assert.ok(remoteRefsInHtml('<span class=mermaid>x</span>')[0].includes('marked as a Mermaid diagram'));
    assert.ok(remoteRefsInHtml('<p>x<svg><style>a{}</style></svg>')[0].endsWith('(foreign-content, at character 9)'));
  });

  test('the failing arm: a reader that ignores unsure spans admits what parse5 refuses', () => {
    const blind = (html) => remoteRefsInHtml(html).filter((u) => !u.startsWith(UNSURE));
    const r = rng(22);
    let caught = 0;
    for (let k = 0; k < 2000; k++) if (weaker(blind, genForeign(r))) caught++;
    assert.ok(caught > 20, `the arm caught ${caught} of 2,000`);
  });

  test('the failing arm: a reader with its diagram text cut out admits what parse5 refuses', () => {
    const blind = (html) => remoteRefsInHtml(html.replace(/class=("?)[^">\s]*mermaid[^">\s]*\1/gi, 'class=x'));
    const r = rng(23);
    let caught = 0;
    for (let k = 0; k < 2000; k++) if (weaker(blind, genDiagram(r))) caught++;
    assert.ok(caught > 50, `the arm caught ${caught} of 2,000`);
  });
});
