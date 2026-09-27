/**
 * Unit: the Export-to-Marp split baker (lib/core/bake-splits.js).
 *
 * The guarantee: a deck whose `split: headings` boundaries have been BAKED into
 * literal `---` renders to the IDENTICAL slides as the original under the live
 * `headingSplit` divider — same count AND same per-slide content. That's what
 * lets a baked deck render correctly in vanilla Marp (which only splits on `---`)
 * with no dependency on our plugin. Proven by rendering both through lib/engine
 * and comparing the visible text of every section.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const latticeEngine = require('../../../lib/engine');
const { bakeSplits } = require('../../../lib/core/bake-splits');

const REPO = path.join(__dirname, '..', '..', '..');
const engine = latticeEngine.createEngine();

// Per-section visible text (tags stripped, whitespace collapsed) — a structural
// fingerprint of how the deck divided.
function sectionTexts(src) {
  const html = engine.render(src).html;
  return html.split(/(?=<section[\s>])/).filter((s) => /^<section[\s>]/.test(s))
    .map((s) => s.slice(0, s.indexOf('</section>') + 1))
    .map((s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

// The original (headings mode) and the baked (rule mode) must yield identical slides.
function assertBakeParity(headingsSrc, label) {
  const before = sectionTexts(headingsSrc);
  const baked = bakeSplits(headingsSrc);
  const after = sectionTexts(baked);
  assert.deepEqual(after, before, `${label}: baked (rule) slides must equal original (headings) slides`);
  return before.length;
}

const fmH = (body) => `---\nmarp: true\nsplit: headings\n---\n\n${body}`;

describe('bakeSplits — parity with the live divider', () => {
  test('plain ## outline', () => {
    assert.equal(assertBakeParity(fmH('# Lead\n\nintro\n\n## One\n\na\n\n## Two\n\nb\n'), 'outline'), 3);
  });

  test('eyebrow + `_class` lead-in pulls onto the new slide', () => {
    const n = assertBakeParity(fmH(
      '# Lead\n\nintro\n\n<!-- _class: cards-grid -->\n\n`Kicker`\n\n## Two\n\nbody\n'), 'lead-in');
    assert.equal(n, 2);
  });

  test('hybrid: author `---` is preserved', () => {
    assertBakeParity(fmH('# A\n\nfirst\n\n---\n\nsecond\n\n## B\n\nx\n'), 'hybrid');
  });

  test('fence-safe + h3 never splits', () => {
    assertBakeParity(fmH('# A\n\n```md\n## not a slide\n```\n\n### sub\n\n## Real\n'), 'fence/h3');
  });

  test('baked source carries split: rule and literal `---`', () => {
    const baked = bakeSplits(fmH('# A\n\n## B\n\n## C\n'));
    assert.match(baked, /^---\r?\n[\s\S]*split: rule[\s\S]*?\r?\n---\r?\n/, 'front matter states split: rule');
    const bodyOnly = baked.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    assert.equal((bodyOnly.match(/^---[ \t]*$/gm) || []).length, 2, 'two body separators baked in');
  });

  test('a rule deck is returned unchanged in body', () => {
    const src = '---\nmarp: true\nsplit: rule\n---\n\n# A\n\n## still A\n\n---\n\n## B\n';
    const baked = bakeSplits(src);
    assert.equal(sectionTexts(baked).length, sectionTexts(src).length);
  });
});

describe('bakeSplits — corpus parity', () => {
  const decks = [
    ...globMd(path.join(REPO, 'examples')),
    path.join(REPO, 'test', 'integration', 'baseline-decks', 'gallery.md'),
  ].filter((f) => fs.existsSync(f));

  for (const file of decks) {
    const name = path.relative(REPO, file);
    test(`${name}: bake(headings) ≡ live headings split`, () => {
      // Force headings on every deck, bake, and confirm the slides are identical.
      const src = forceHeadings(fs.readFileSync(file, 'utf8'));
      assertBakeParity(src, name);
    });
  }
});

function globMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
}

// Force a deck's front matter to split: headings (insert or replace the key).
function forceHeadings(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  if (!m) return `---\nmarp: true\nsplit: headings\n---\n\n${src}`;
  const body = m[1].replace(/^\s*split:.*$/m, '').replace(/\n{2,}/g, '\n').trim();
  return `---\n${body}\nsplit: headings\n---\n${src.slice(m[0].length)}`;
}

// ── stripPaneMarkers: Export-to-Marp's pane bake ──
// Marp cannot carve a pane, and it reads every HTML comment that is not its own directive as a
// SPEAKER NOTE, so a panes deck exported with its markers put "pane: list" in the presenter's
// notes. The bake drops the markers the carve would read and nothing else.
describe('stripPaneMarkers', () => {
  const { stripPaneMarkers } = require('../../../lib/core/bake-splits');
  const deck = [
    '---', 'theme: indaco', '---', '',
    '## Title', '', '<!-- panes: 35/65 -->', '<!-- pane: list -->', '', '- one', '',
    '<!-- pane: table -->', '', '| a |', '|---|', '| 1 |', '',
    '```md', '<!-- pane: list -->', '```', '', '- <!-- pane: list -->', '',
  ].join('\n');

  test('drops every top-level marker and layout line, and keeps both panes\' content, stacked', () => {
    const out = stripPaneMarkers(deck);
    assert.doesNotMatch(out.split('```md')[0], /<!--\s*panes?:/);
    assert.match(out, /- one\n[\s\S]*\| a \|/);
    assert.match(out, /^---\ntheme: indaco\n---\n/, 'front matter untouched');
  });

  test('keeps the panes apart: two lists stay two lists (a dropped marker was their separator)', () => {
    const lists = '## T\n\n<!-- pane: list -->\n\n- a\n\n<!-- pane: list -->\n\n- b\n';
    const out = stripPaneMarkers(lists);
    assert.equal((out.match(/<!-- markdownlint-capture -->/g) || []).length, 2, 'one inert comment per run of markers');
    const MarkdownIt = require('markdown-it');
    assert.equal((new MarkdownIt({ html: true }).render(out).match(/<ul>/g) || []).length, 2);
  });

  test('leaves a marker quoted in a code sample or a list item as written', () => {
    const out = stripPaneMarkers(deck);
    assert.match(out, /```md\n<!-- pane: list -->\n```/);
    assert.match(out, /- <!-- pane: list -->/);
  });

  test('is the identity on a deck without panes', () => {
    const plain = '---\ntheme: indaco\n---\n\n## A\n\n<!-- _class: kpi -->\n';
    assert.equal(stripPaneMarkers(plain), plain);
  });
});
