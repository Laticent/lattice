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

// A caption written straight under the closing fence (no blank line) used to join the baked figure's HTML block and
// show its markdown raw; the Studio renders it as a paragraph (followups.d/2739-p12).
test('a caption line straight under a fence renders as markdown, flat, quoted and list-nested', { timeout: 180000 }, () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nested-fences-'));
	const md = path.join(dir, 'deck.md');
	fs.writeFileSync(md, '---\ntheme: indaco\n---\n\n# Flat\n\n```mermaid\nflowchart LR\n  A --> B\n```\nFlat **one**.\n\n---\n\n# Quoted\n\n> ```mermaid\n> flowchart LR\n>   C --> D\n> ```\n> Quoted **two**.\n\n---\n\n# Listed\n\n- Item:\n\n  ```mermaid\n  flowchart LR\n    E --> F\n  ```\n  Listed **three**.\n- Next item.\n');
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, path.join(dir, 'deck.pdf'), '--quiet', '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 170000 });
	assert.equal(r.status, 0, `the CLI failed: ${r.stderr}`);
	const html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
	for (const word of ['one', 'two', 'three']) {
		assert.match(html, new RegExp(`<p>\\w+ <strong>${word}</strong>\\.</p>`), `the "${word}" caption is a paragraph with real bold`);
		assert.doesNotMatch(html, new RegExp(`\\*\\*${word}\\*\\*`), `no raw markdown for "${word}"`);
	}
	assert.match(html, /<blockquote>\s*<div class="mermaid-svg"[\s\S]*?<p>Quoted <strong>two<\/strong>\.<\/p>\s*<\/blockquote>/, 'the quoted caption stays inside its quote');
	assert.match(html, /<li>Next item\.<\/li>|<li>\s*<p>Next item\.<\/p>\s*<\/li>/, 'the list goes on');
});

// On a `diagram` slide the figure is the subject: a bulleted fence keeps the slide-level splice it always had, so it
// fills the stage instead of shrinking to its list item's width (the P2 checker found the shrink).
test('a fence indented under a bullet on a diagram slide still fills the stage', { timeout: 180000 }, () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nested-fences-'));
	const md = path.join(dir, 'deck.md');
	fs.writeFileSync(md, '---\ntheme: indaco\n---\n\n<!-- _class: diagram -->\n\n## Flow\n\n- The flow:\n\n  ```mermaid\n  flowchart LR\n    DiagA --> DiagB\n  ```\n');
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, path.join(dir, 'deck.pdf'), '--quiet', '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 170000 });
	assert.equal(r.status, 0, `the CLI failed: ${r.stderr}`);
	const html = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
	assert.match(html, /DiagA/);
	assert.doesNotMatch(html, /<li>[\s\S]*?<div class="mermaid-svg"[\s\S]*?<\/li>/, 'the figure is not inside the list item');
});
