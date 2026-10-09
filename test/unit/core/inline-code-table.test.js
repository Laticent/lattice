/**
 * The inline-code dispatcher is a TABLE now (engineering/decisions/2026-09-29-inline-icons.md
 * § 6a, phase 1a): marks, pills and sparks are its first-party rows, and a plugin adds a row
 * through `contributes.inline`. This pins the promise that made the refactor safe — every span in
 * the tracked corpus dispatches, escapes and renders exactly as the hand-written list did — and
 * the table's own contract: order, the escape, and a plugin row leaving when its plugin is off.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '../../..');
const table = require('../../../lib/core/inline-code-directives.js');
const { stateHtml, stateElement, parseInlineState } = require('../../../lib/core/state-marks.js');
const pills = require('../../../lib/core/inline-pills.js');
const sparks = require('../../../lib/core/inline-sparks.js');
const { EXCLUDE_MIRRORS_SHELL } = require('../../helpers/generated-mirrors.js');

/** The hand-written dispatcher the table replaced, verbatim in behavior. */
const legacy = {
  dispatches: (t) => !!(parseInlineState(t) || sparks.resolve(t) || pills.resolve(t)),
  escapedText(text) {
    if (typeof text !== 'string' || text.length < 2 || text.charCodeAt(0) !== 0x5c) return null;
    const rest = text.slice(1);
    return legacy.dispatches(rest) || sparks.diagnose(rest) || pills.attempt(rest) ? rest : null;
  },
  renderHtml: (t) => stateHtml(t) || pills.pillHtml(t) || sparks.sparkHtml(t),
  renderElement: (doc, t) => stateElement(doc, t) || pills.pillElement(doc, t) || sparks.sparkElement(doc, t),
};

/** Every inline-code span in every tracked Markdown file, fenced blocks left out. */
function corpusSpans() {
  const files = execSync(`git ls-files '*.md' ${EXCLUDE_MIRRORS_SHELL}`, { cwd: ROOT }).toString().trim().split('\n');
  const spans = new Set();
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');
    for (const m of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) spans.add(m[1]);
  }
  // A span the icons plugin READS (`^{database}`, a pill's `icon=`) is new: the hand list never saw
  // one, so it has no "before" to equal; the plugin's fixtures pin those. Every other span — TeX's
  // `^{o}` included — must come out exactly as before, with the plugin ON.
  const { KINDS } = require('../../../lib/core/inline-code-directives.js');
  const pluginReads = (t) => KINDS.some((k) => k.plugin && (k.resolve(t) || k.diagnose(t)));
  return [...spans].filter((s) => !/\bicon\s*=/.test(s) && !pluginReads(s) && !pluginReads(s.replace(/^\\/, '')));
}

describe('the inline-code table — first-party rows are byte-identical to the hand list', () => {
  const spans = corpusSpans();
  const firstParty = table.FIRST_PARTY.map((k) => k.name);
  // With no plugin row in play the whole table must equal the old list; plugin rows are ruled out
  // by switching their plugins off, so this holds whatever plugins ship.
  const off = new Set(table.KINDS.filter((k) => k.plugin).map((k) => k.plugin));

  test('the first-party rows are marks, pills and sparks, in that order', () => {
    assert.deepEqual(firstParty, ['state', 'pill', 'spark']);
    assert.deepEqual(table.KINDS.slice(0, 3), [...table.FIRST_PARTY]);
  });

  test(`every corpus span renders to the same HTML (${spans.length} distinct spans)`, () => {
    assert.ok(spans.length > 1000, `expected a real corpus, got ${spans.length} spans`);
    let rendered = 0;
    for (const s of spans) {
      const want = legacy.renderHtml(s);
      assert.equal(table.renderHtml(s, off), want, s);
      if (want) rendered++;
    }
    assert.ok(rendered > 50, `the corpus should hold real directives, found ${rendered}`);
  });

  test('every corpus span, and its backslash form, escapes the same way, with every plugin on', () => {
    for (const s of spans) {
      assert.equal(table.escapedText(s), legacy.escapedText(s), s);
      assert.equal(table.escapedText(`\\${s}`), legacy.escapedText(`\\${s}`), `\\${s}`);
      assert.equal(table.dispatches(s, off), legacy.dispatches(s), s);
      assert.equal(table.renderHtml(s), legacy.renderHtml(s), `${s} (plugins on)`);
    }
  });

  test('someone else\'s braces keep every backslash: TeX accents, superscripts, an empty pill', () => {
    // The red team's repro: the icon row once counted any `^{x}` as an attempt, so `\^{o}` lost
    // its backslash in a deck that writes no icon.
    for (const s of ['\\^{o}', '\\^{e}', '\\^{2}', '\\^{1,2}', '\\^{x', '\\^{\\o}', '\\{""}', '\\{"", c3}']) {
      assert.equal(table.escapedText(s), null, s);
    }
  });

  test('the DOM path builds the same element', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    for (const s of spans) {
      const want = legacy.renderElement(doc, s);
      const got = table.renderElement(doc, s, off);
      assert.equal(got ? got.outerHTML : null, want ? want.outerHTML : null, s);
    }
  });
});

describe('the inline-code table — against a FROZEN copy of the pre-table outputs', () => {
  // The oracle above calls today's kernels, so it proves the table equals them, not that they
  // still equal what shipped (HARD RULE #25 checker: this PR also changed the pill slot). The golden
  // is every directive-shaped span in the tracked corpus, plus edge cases, rendered and escaped by
  // the dispatcher at c1172cd, before the table. Regenerate it only for an intended change.
  const GOLDEN = require('./inline-code-table.golden.json');
  const { KINDS } = table;
  const iconReads = (t) => KINDS.some((k) => k.plugin && k.resolve(t.replace(/^\\/, '')));
  test(`every frozen span renders and escapes as it did (${Object.keys(GOLDEN).length} spans)`, () => {
    let compared = 0;
    for (const [span, [html, esc, escBackslash]] of Object.entries(GOLDEN)) {
      if (iconReads(span)) continue; // `^{database}` is new syntax: it was literal before, by design
      assert.equal(table.renderHtml(span), html, `render ${span}`);
      assert.equal(table.escapedText(span), esc, `escape ${span}`);
      assert.equal(table.escapedText(`\\${span}`), escBackslash, `escape \\${span}`);
      compared++;
    }
    assert.ok(compared > 1000, `compared ${compared}`);
  });
});

describe('the inline-code table — plugin rows', () => {
  test('every plugin row names its plugin, a tag sigil and the four functions', () => {
    for (const k of table.KINDS.filter((r) => r.plugin)) {
      assert.match(k.sigil, /^[~^!]$/, k.name);
      for (const fn of ['resolve', 'html', 'element', 'diagnose']) assert.equal(typeof k[fn], 'function', `${k.name}.${fn}`);
    }
  });

  test('a plugin that is off leaves its rows out of the render, but never out of the escape', () => {
    // The escape is about the author's text, not what renders, so it must not depend on admission:
    // the runtime and the flowchart reader have no `off` to pass, and they must agree with the engine.
    const icon = table.KINDS.find((k) => k.plugin === 'icons');
    assert.ok(icon, 'the icons plugin contributes a row');
    const off = new Set(['icons']);
    assert.equal(table.renderHtml('^{database}', off), null);
    assert.equal(table.dispatches('^{database}', off), false);
    assert.equal(table.escapedText.length, 1, 'escapedText takes no admission set');
    assert.equal(table.escapedText('\\^{database}'), '^{database}');
  });

  test('the resolver\'s copy of the host rows matches the table', () => {
    const { HOST_INLINE } = require('../../../lib/plugins/resolve');
    assert.deepEqual([...HOST_INLINE.kinds], table.FIRST_PARTY.map((k) => k.name));
    assert.deepEqual({ ...HOST_INLINE.sigils }, Object.fromEntries(table.FIRST_PARTY.filter((k) => k.sigil).map((k) => [k.sigil, k.name])));
  });
});
