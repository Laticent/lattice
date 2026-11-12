/**
 * Unit: `scanMarkdown` (lib/core/style-markdown-scan.mjs), the guess at a deck's tokens from its Markdown alone. It is a HINT for the
 * Playground loader (a miss is caught by the scan of the rendered HTML), so the tests pin what it reads and that it stays cheap.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { scanWork } = require('../../helpers/work-count');

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

  // Work, not milliseconds (HARD RULE #32). Two guards keep a hostile source cheap: a line longer than 4,000 characters is
  // skipped, so no per-line regex ever sees more than that, and every other line is read on its own. The count covers
  // each string search and regex exec; a reader that looks ahead through the rest of the text from every line fails it.
  test('stays linear on a pathological source: long lines are skipped, short ones read once', async () => {
    const { scanMarkdown } = await load();
    const long = `<!-- _class: ${' '.repeat(200000)}x\n${'| '.repeat(100000)}\n${'<'.repeat(100000)} class=`;
    const skipped = scanWork(() => scanMarkdown(long));
    assert.ok(!skipped.result.c.has('x'), 'a line past the cap is not read');
    assert.ok(skipped.scanned <= 16 * long.length, `read ${skipped.scanned} characters for ${long.length}`);
    // The same three shapes just under the cap, 200 times over, so every line IS read.
    const block = `<!-- _class: ${' '.repeat(3900)}x\n${'| '.repeat(1950)}\n${'<'.repeat(3900)} class="y"`;
    const short = Array.from({ length: 200 }, () => block).join('\n');
    const read = scanWork(() => scanMarkdown(short));
    assert.ok(read.result.c.has('x') && read.result.c.has('y'), 'a line under the cap is read');
    assert.ok(read.scanned <= 16 * short.length, `read ${read.scanned} characters for ${short.length}`);
  });
});
