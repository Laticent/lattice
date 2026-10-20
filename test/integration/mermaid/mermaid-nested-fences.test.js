/**
 * Integration: a Mermaid fence in a blockquote or a list item is drawn by the CLI, as the browser draws it
 * (followups.d/2739-p7).
 *
 * The CLI's line walker opens a fence only at 0-3 spaces with no `>` prefix, so these two shapes shipped as
 * highlighted source and every later figure's `data-mmd-idx` shifted against the Studio's. Three fences in
 * document order, quoted, list-nested, plain: all three must draw, indexes 0, 1, 2, and the source must
 * not survive in the file.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
---

# Quoted

> \`\`\`mermaid
> flowchart LR
>   QuotedA --> QuotedB
> \`\`\`

---

# Nested

10. Tenth step:

    \`\`\`mermaid
    flowchart LR
      NestedA --> NestedB
    \`\`\`

---

# Plain

\`\`\`mermaid
flowchart LR
  PlainA --> PlainB
\`\`\`
`;

test('a quoted, a list-nested and a plain Mermaid fence all draw, in order', { timeout: 180000 }, () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nested-fences-'));
	const md = path.join(dir, 'deck.md');
	fs.writeFileSync(md, DECK);
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, path.join(dir, 'deck.pdf'), '--quiet', '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 170000 });
	assert.equal(r.status, 0, `the CLI failed: ${r.stderr}`);
	const html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
	assert.deepEqual([...html.matchAll(/data-mmd-idx="(\d+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i), ['0', '1', '2']);
	assert.doesNotMatch(html, /flowchart LR/, 'no fence survives as source');
	for (const label of ['QuotedA', 'NestedA', 'PlainA']) assert.match(html, new RegExp(label), `${label} is drawn`);
	assert.match(html, /<blockquote>\s*<div class="mermaid-svg"/, 'the quoted figure stays inside its quote');
});

// A fence two spaces in under a bullet is opened by the flat walker too; its figure must keep the item's indent,
// or it lands at column 0, leaves the list and takes the rest of the list with it (followups.d/2739-p11).
test('a fence indented under a bullet draws inside its list item, and the list goes on', { timeout: 180000 }, () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nested-fences-'));
	const md = path.join(dir, 'deck.md');
	fs.writeFileSync(md, '---\ntheme: indaco\n---\n\n# Bullets\n\n- First point:\n\n  ```mermaid\n  flowchart LR\n    BulletA --> BulletB\n  ```\n\n- Second point.\n');
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, path.join(dir, 'deck.pdf'), '--quiet', '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 170000 });
	assert.equal(r.status, 0, `the CLI failed: ${r.stderr}`);
	const html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
	assert.match(html, /<li>\s*<p>First point:<\/p>\s*<div class="mermaid-svg"[\s\S]*?<\/svg><\/div>\s*<\/li>\s*<li>\s*<p>Second point\.<\/p>\s*<\/li>/, 'the figure is inside the first item, and the second item follows in the same list');
});
