/**
 * NO PRODUCER TEACHES THE OLD FORM (engineering/decisions/2026-10-17-meta-record.md §15, slice E, "the cut"). The engine
 * reads a slide's settings only from its `<!-- @meta{…} -->` record. An old directive comment (`<!-- _class: … -->`,
 * `<!-- _pane: … -->`, `<!-- _footer: … -->`, a running `<!-- class: … -->`) or a bare `<!-- {…} -->` record sets
 * nothing, so a newcomer who copies one from a doc page, an AI prompt or a component skeleton gets a default slide.
 *
 * test/unit/core/meta-sweep-corpus.test.js keeps the shipped DECKS clean, and it rightly skips fenced code. This test
 * covers what that one cannot see: the samples and prose that TEACH a deck, fenced or inline, in
 *   - the public docs site (docs/src/content/**),
 *   - every `*.docs.md` under lib/ (the agent kit copies them),
 *   - the AI prompt sources (PROMPT_SOURCES below), and
 *   - every component manifest's skeleton and sample fields (what the scaffolder and the gallery write).
 *
 * A line passes when it names the old form AS old: it also says "old", "legacy", "lint error" or "migrate". A fenced
 * block tagged as Marp (```marp …) is Marp's own text. A file that keeps the old form on purpose is in KEEP with its
 * reason; a stale entry fails, so the list only shrinks. To fix a hit, write the migration kernel's output
 * (`node lib/cli/migrate-meta.mjs meta --stdout <file>`), never a hand-spelled record.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

/** An old setting comment: a spot directive (`_class`, `_pane`, `_footer`, `_lens`, …), a running `class:`, a bare record. */
const OLD_FORM = /<!--\s*(?:_[A-Za-z]|\{|class\s*:)/;
/** A line that introduces the old form as old. */
const NAMED_AS_OLD = /\b(?:old|older|legacy|lint error|migrat\w*)\b/i;

/** The AI prompt sources: each one writes the slide syntax a model then copies. */
const PROMPT_SOURCES = Object.freeze([
  'docs/src/lib/architect-knowledge.js',
  'docs/src/components/studio/architect-agent.ts',
  'lib/core/deck-settings.prose.js',
  'lib/core/deck-settings.js',
  'lib/layout/ai.js',
]);

/** The manifest fields that hold a slide's Markdown (lib/components/manifest.schema.json). */
const MANIFEST_SLIDE_FIELDS = new Set(['skeleton', 'sample', 'venueProbe']);

/** Files that keep the old form on purpose, each with the reason. */
const KEEP = Object.freeze({
  'docs/src/content/docs/spec/lfm.md':
    'The LFM 1.0 spec, generated from spec/LFM-1.0.md: 1.x defines the directive comment. Its intro (tools/build-spec-docs.js) says the 2.0 record replaces it.',
  'docs/src/content/docs/spec/diagnostics.md':
    'Generated from spec/diagnostics.md, the frozen rule registry; a rule text quotes the directive it was written for.',
  'docs/src/content/catalog/libraries/lente.md':
    'Documents the standalone @laticent/lente package, whose default lens carrier is the `_lens` comment; the page says Lattice installs the record carrier.',
});

function listed(spec) {
  return execSync(`git ls-files -co --exclude-standard ${spec}`, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
}

/** The text files in scope, docs pages and lib docs plus the prompt sources. */
function textSources() {
  const pages = listed('docs/src/content').filter((f) => /\.mdx?$/.test(f));
  const libDocs = listed('lib').filter((f) => f.endsWith('.docs.md'));
  return [...pages, ...libDocs, ...PROMPT_SOURCES];
}

/** Every line of `text` that writes the old form as a setting, as `line: text`. */
function oldFormLines(text) {
  const hits = [];
  let fence = null;
  text.split('\n').forEach((line, i) => {
    const open = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      if (!fence) fence = { char: open[1][0], len: open[1].length, info: open[2].trim() };
      else if (open[1][0] === fence.char && open[1].length >= fence.len && !open[2].trim()) fence = null;
      return;
    }
    if (fence && /\bmarp\b/i.test(fence.info)) return;
    if (OLD_FORM.test(line) && !NAMED_AS_OLD.test(line)) hits.push(`${i + 1}: ${line.trim().slice(0, 140)}`);
  });
  return hits;
}

/** Every slide-Markdown string in a manifest, with its JSON path. */
function manifestSlides(node, at = '') {
  if (Array.isArray(node)) return node.flatMap((v, i) => manifestSlides(v, `${at}[${i}]`));
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' && MANIFEST_SLIDE_FIELDS.has(k) ? [{ at: `${at}.${k}`, text: v }] : manifestSlides(v, `${at}.${k}`));
}

test('no doc page, lib doc or AI prompt writes an old setting comment as a setting', () => {
  const found = [];
  for (const rel of textSources()) {
    if (KEEP[rel]) continue;
    for (const hit of oldFormLines(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) found.push(`${rel}:${hit}`);
  }
  assert.deepEqual(found, [], `Old directive comments teach a slide that renders its default layout. Write the record the migration writes (node lib/cli/migrate-meta.mjs meta --stdout <file>):\n${found.join('\n')}`);
});

test('no component manifest skeleton or sample holds an old setting comment', () => {
  const found = [];
  for (const rel of listed('lib').filter((f) => f.endsWith('.manifest.json'))) {
    for (const { at, text } of manifestSlides(JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')))) {
      if (OLD_FORM.test(text)) found.push(`${rel} ${at}`);
    }
  }
  assert.deepEqual(found, [], `A skeleton written with the old comment scaffolds a default slide:\n${found.join('\n')}`);
});

test('every KEEP entry still exists and still holds the old form (the list only shrinks)', () => {
  const stale = Object.keys(KEEP).filter((rel) => {
    const file = path.join(ROOT, rel);
    return !fs.existsSync(file) || !OLD_FORM.test(fs.readFileSync(file, 'utf8'));
  });
  assert.deepEqual(stale, [], `stale KEEP entries: drop them:\n${stale.join('\n')}`);
});

test('the scanner flags a setting, and passes the old form named as old and Marp text', () => {
  assert.deepEqual(oldFormLines('<!-- _class: title -->\n# H'), ['1: <!-- _class: title -->']);
  assert.equal(oldFormLines('`<!-- _pane: bar -->` picks the pane').length, 1);
  assert.equal(oldFormLines('<!-- {layout=cards} -->').length, 1);
  assert.equal(oldFormLines('```markdown\n<!-- _class: kpi -->\n```').length, 1);
  assert.deepEqual(oldFormLines('<!-- @meta{layout=title} -->'), []);
  assert.deepEqual(oldFormLines('The old `<!-- _class: … -->` comment is a lint error.'), []);
  assert.deepEqual(oldFormLines('```marp\n<!-- _class: lead -->\n```'), []);
});
