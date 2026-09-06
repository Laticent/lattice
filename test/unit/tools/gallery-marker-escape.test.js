/**
 * A generated GALLERY deck escapes the state markers its manifest prose quotes; the
 * generated DOCS page does not.
 *
 * One manifest string feeds two outputs with opposite rules. `<name>.docs.md` is ordinary
 * markdown read by a human, where a backslash is visible noise. `<name>.gallery.md` is a
 * rendered DECK, where `[x]` inside inline code decodes to a state mark — so an
 * anti-pattern slide reading "Only `[x]` … map to the mark palette" would show four
 * anonymous discs and teach the opposite of what it says. That shipped once.
 *
 * The escape therefore lives in the deck generator, not in the manifest: written into the
 * manifest it would leak a literal backslash into every docs page and into
 * `dist/docs/components.json`, and a manifest author would have to know a deck grammar
 * exists.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHECKLIST = path.join(ROOT, 'lib', 'components', 'inventory', 'checklist');

describe('generated galleries — quoted state markers stay literal on a slide', () => {
  const gallery = fs.readFileSync(path.join(CHECKLIST, 'checklist.gallery.md'), 'utf8');
  const docs = fs.readFileSync(path.join(CHECKLIST, 'checklist.docs.md'), 'utf8');
  const manifest = fs.readFileSync(path.join(CHECKLIST, 'checklist.manifest.json'), 'utf8');

  test('the anti-pattern slide escapes the markers it quotes', () => {
    assert.match(gallery, /`\\\[x\]`/, 'the gallery deck quotes `[x]` unescaped — it will render a disc');
  });

  test('the docs page does NOT — a backslash there is visible noise', () => {
    assert.doesNotMatch(docs, /`\\\[[x\-/ ]\]`/, 'an escape leaked into the docs prose');
    assert.match(docs, /`\[x\]`/, 'the docs page should quote the marker plainly');
  });

  test('the manifest is untouched — the escape is a deck concern', () => {
    assert.doesNotMatch(manifest, /`\\\\\[[x\-/ ]\]`/, 'an escape leaked into the manifest');
  });

  test('no generated gallery quotes an unescaped marker anywhere', () => {
    // The census: a NEW component whose manifest quotes `[x]` in prose gets the same
    // treatment for free. Without this the next one silently ships discs.
    const bad = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.gallery.md')) {
          const src = fs.readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '');
          for (const line of src.split('\n')) {
            // a bare `[x]` span that is NOT preceded by a backslash
            for (const m of line.matchAll(/(?<!\\)`(\[[x\-/ ]\])`/g)) {
              bad.push(`${path.relative(ROOT, p)}: ${m[1]}`);
            }
          }
        }
      }
    };
    walk(path.join(ROOT, 'lib', 'components'));
    assert.deepEqual(bad, [], `a generated gallery quotes a marker that will render as a disc:\n${bad.join('\n')}`);
  });
});
