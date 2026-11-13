'use strict';
/**
 * §8 decision 3 of engineering/decisions/2026-10-16-media-plugins.md: `>` became a Segno tag (`>{…}` is `@video{…}`). A tag
 * also stops a top-level value from starting with it, so a slot that read an inline code span starting with `>` (`>50%`) would
 * stop reading it. This census holds the proof the decision asked for: every inline code span in a shipped deck that starts with
 * `>` is either a video record or ordinary code no reader treats as a record (Segno's `isDirective` says null), and the set of
 * them is pinned, so a new one is looked at. The other half of the proof is `npm run identity:check`, which rendered all 458
 * shipped decks byte-identically to `main` with the tag added (PR evidence).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');
const { isDirective } = require('@laticent/segno/read');

const ROOT = path.resolve(__dirname, '../../..');
// The decks `tools/render-identity.mjs` renders: examples/, the baseline decks and every gallery under lib/.
function decks() {
  const out = [];
  const walk = (d, keep) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, keep);
      else if (keep(e.name)) out.push(p);
    }
  };
  walk(path.join(ROOT, 'examples'), (n) => n.endsWith('.md'));
  walk(path.join(ROOT, 'test/integration/baseline-decks'), (n) => n.endsWith('.md'));
  walk(path.join(ROOT, 'lib'), (n) => n.endsWith('.gallery.md'));
  return out.sort();
}

test('every shipped `>` code span is a video record or code no reader takes as a record', () => {
  const md = new MarkdownIt({ html: true });
  const found = new Set();
  for (const file of decks()) {
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.type === 'code_inline' && /^\s*>/.test(t.content)) {
          const text = t.content.trim();
          if (text.startsWith('>{')) continue; // a video record: the tag's own job
          assert.equal(isDirective(text), null, `${path.relative(ROOT, file)}: \`${text}\` would open a record`);
          found.add(text);
        }
        if (t.children) walk(t.children);
      }
    };
    walk(md.parse(fs.readFileSync(file, 'utf8'), {}));
  }
  // Prose about blockquotes and CSS child selectors. A new entry: check whether a slot on its slide reads it as a value.
  assert.deepEqual([...found].sort(), ['>', '> .cell-stage']);
});
