/**
 * Unit: `scanMarkdown` (lib/core/style-markdown-scan.mjs), the guess at a deck's tokens from its Markdown alone. It is a HINT for the
 * Playground loader (a miss is caught by the scan of the rendered HTML), so the tests pin what it reads and that it stays cheap.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/core/style-markdown-scan.mjs');

describe('scanMarkdown', () => {
  test('reads class directives, front matter, raw HTML classes and the elements Markdown becomes', async () => {
    const { scanMarkdown } = await load();
    const md = '---\nfinish: atrium\nmode: dark\nclass: lead\n---\n\n<!-- _class: kpi attention -->\n\n# Title\n\n- one\n\n| a | b |\n|---|---|\n\n<div class="x y">z</div>\n\n```mermaid\nA-->B\n```\n';
    const { c, t } = scanMarkdown(md);
    for (const w of ['finish', 'finish-atrium', 'dark', 'lead', 'kpi', 'attention', 'x', 'y', 'mermaid', 'language-mermaid']) assert.ok(c.has(w), `class ${w}`);
    for (const el of ['h1', 'ul', 'li', 'table', 'td', 'pre', 'code', 'svg']) assert.ok(t.has(el), `tag ${el}`);
  });

  test('words inside a fenced code block are not classes, and a comment end stops a directive', async () => {
    const { scanMarkdown } = await load();
    const { c } = scanMarkdown('```\n<!-- _class: secret -->\n```\n\n<!-- _class: real --> trailing\n');
    assert.ok(!c.has('secret'));
    assert.ok(c.has('real'));
    assert.ok(!c.has('trailing'));
  });

  test('stays linear on a pathological source', async () => {
    const { scanMarkdown } = await load();
    const t0 = Date.now();
    scanMarkdown(`<!-- _class: ${' '.repeat(200000)}x\n${'| '.repeat(100000)}\n${'<'.repeat(100000)} class=`);
    assert.ok(Date.now() - t0 < 1000, 'a hostile line must not cost seconds');
  });
});
