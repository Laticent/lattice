/**
 * `ctx.fences()` (lib/core/plugin-fences.mjs): a bake receives the fences the ENGINE parses, never a reader of its own
 * (engineering/decisions/2026-11-06-plugin-patterns.md §4, D2 slice 3). Each case states the engine's reading.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pluginFences, foldedFenceLines } = require('../../../lib/core/plugin-fences.mjs');
const { bakeDeck } = require('../../../lib/plugins/host-bake.js');

const MERMAID = { fences: { mermaid: { aliases: [] } } };
const fences = (src) => pluginFences(src, MERMAID);
const bodies = (src) => fences(src).map((f) => f.body);

describe('the fences the engine parses', () => {
  test('a top-level fence: its span covers the opener to the closer, its body is the content', () => {
    const src = '# A\n\n```mermaid\ngraph LR; A-->B\n```\n';
    const [f] = fences(src);
    assert.equal(src.slice(f.start, f.end), '```mermaid\ngraph LR; A-->B\n```');
    assert.deepEqual([f.body, f.marker, f.prefix, f.level], ['graph LR; A-->B\n', '```', '', 0]);
  });
  test('tildes and longer runs are fences; a longer closer closes', () => {
    assert.deepEqual(bodies('~~~mermaid\nx\n~~~~\n'), ['x\n']);
    assert.deepEqual(bodies('````mermaid\nx\n````\n'), ['x\n']);
  });
  test('offsets index the whole source: the front matter is skipped, not dropped', () => {
    const src = '---\ntitle: t\n---\n\n```mermaid\nx\n```\n';
    const [f] = fences(src);
    assert.equal(src.slice(f.start, f.end), '```mermaid\nx\n```');
  });
  test('a fence in a list item or a quote keeps its prefix; its body is the engine\'s, prefix removed', () => {
    const [li] = fences('- item\n\n  ```mermaid\n  graph TB; E-->F\n  ```\n');
    assert.deepEqual([li.prefix, li.body], ['  ', 'graph TB; E-->F\n']);
    const [q] = fences('> ```mermaid\n> graph TB; G-->H\n> ```\n');
    assert.deepEqual([q.prefix, q.body], ['> ', 'graph TB; G-->H\n']);
  });
  test('NOT a fence where the engine reads something else: an HTML block, a math block, another fence, a comment', () => {
    assert.deepEqual(bodies('<div>\n~~~mermaid\ngraph LR; C-->D\n~~~\n</div>\n'), []);
    assert.deepEqual(bodies('$$\n```mermaid\nx\n```\n$$\n'), []);
    assert.deepEqual(bodies('````markdown\n```mermaid\nx\n```\n````\n'), []);
    assert.deepEqual(bodies('<!--\n```mermaid\nx\n```\n-->\n'), []);
  });
  test('an unclosed fence is not handed over: splicing it would take what follows', () => {
    assert.deepEqual(bodies('```mermaid\nx\n\n---\n\n# next slide\n'), []);
    // A tab is four columns to the engine, so a tab-indented closer does not close: the fence runs on, unclosed.
    assert.deepEqual(bodies('```mermaid\nx\n\t```\n'), []);
  });
  test('a closed fence whose body holds a thematic break is a fence: the engine never splits a slide inside it', () => {
    assert.deepEqual(bodies('```mermaid\ngraph LR\n***\nA-->B\n```\n'), ['graph LR\n***\nA-->B\n']);
  });
  test('another plugin\'s fence and a name that merely starts the same are not this plugin\'s', () => {
    assert.deepEqual(bodies('```json\n{}\n```\n```mermaidish\nx\n```\n'), []);
    assert.deepEqual(bodies('```mermaid {"theme":"dark"}\nx\n```\n'), ['x\n']);
  });
  test('an alias the manifest declares counts', () => {
    assert.deepEqual(pluginFences('```plot\nx\n```\n', { fences: { functionplot: { aliases: ['plot'] } } }).map((f) => f.body), ['x\n']);
  });
});

describe('a fence the engine folds into an HTML block: the export says so (D2 slice 3 changed its bytes)', () => {
  const folded = (src) => foldedFenceLines(src, MERMAID).map((f) => f.line);
  const helps = (src) => foldedFenceLines(src, MERMAID).map((f) => f.blankLineHelps);
  test('the opener\'s source line, front matter counted; a fence after a blank line is a fence, not folded', () => {
    assert.deepEqual(folded('<div>\n~~~mermaid\nx\n~~~\n</div>\n'), [2]);
    assert.deepEqual(folded('---\ntitle: t\n---\n\n<div>\n```mermaid\nx\n```\n</div>\n'), [6]);
    assert.deepEqual(folded('<div>\n\n```mermaid\nx\n```\n\n</div>\n'), []);
  });
  test('NOT folded: a commented-out diagram, another plugin\'s fence, a top-level fence', () => {
    assert.deepEqual(folded('<!--\n```mermaid\nx\n```\n-->\n'), []);
    assert.deepEqual(folded('<div>\n```json\n{}\n```\n</div>\n'), []);
    assert.deepEqual(folded('```mermaid\nx\n```\n'), []);
  });
  test('a <pre>, <script>, <style> or <textarea> block runs to its closing tag: a blank line does not help, so the advice differs', () => {
    assert.deepEqual(helps('<div>\n```mermaid\nx\n```\n</div>\n'), [true]);
    assert.deepEqual(folded('<pre>\n\n```mermaid\nx\n```\n</pre>\n'), [3]);
    assert.deepEqual(helps('<pre>\n\n```mermaid\nx\n```\n</pre>\n'), [false]);
  });
  test('inside a block, an opener within an HTML comment or within another fence is not reported (the checker\'s probes)', () => {
    assert.deepEqual(folded('<div>\n<!--\n```mermaid\nx\n```\n-->\n</div>\n'), []);
    assert.deepEqual(folded('<div>\n```text\n```mermaid\n```\n</div>\n'), []);
    assert.deepEqual(folded('<div>\n<!-- a note --> \n```mermaid\nx\n```\n</div>\n'), [3], 'a comment closed on its own line hides nothing');
  });
  test('the warning names the AUTHOR\'s lines when the CLI rewrote the source (--print, --size add front matter)', () => {
    const warnings = [];
    const bakers = [{ name: 'mermaid', load: () => ({ bake: (src) => src }) }];
    const grammar = [{ name: 'mermaid', requires: [], optional: [], fences: { mermaid: { aliases: [] } }, detect: null }];
    const author = '<div>\n```mermaid\nx\n```\n</div>\n';
    bakeDeck(`---\nprint: true\n---\n\n${author}`, {}, { bakers, grammar, defaults: ['mermaid'], authorSource: author, warn: (m) => warnings.push(m) });
    assert.match(warnings[0], /the fence on line 2 sits/);
    bakeDeck('<pre>\n```mermaid\nx\n```\n</pre>\n', {}, { bakers, grammar, defaults: ['mermaid'], warn: (m) => warnings.push(m) });
    assert.match(warnings[1], /Move it out of the HTML block/);
  });
  test('bakeDeck warns once for the plugin, naming the lines, and the bake still runs', () => {
    const warnings = [];
    let ran = 0;
    const bakers = [{ name: 'mermaid', load: () => ({ bake: (src) => { ran++; return src; } }) }];
    const grammar = [{ name: 'mermaid', requires: [], optional: [], fences: { mermaid: { aliases: [] } }, detect: null }];
    const src = '# A\n\n<div>\n```mermaid\nx\n```\n</div>\n\n<div>\n```mermaid\ny\n```\n</div>\n';
    bakeDeck(src, {}, { bakers, grammar, defaults: ['mermaid'], warn: (m) => warnings.push(m) });
    assert.equal(ran, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /plugin "mermaid": the fences on lines 4, 10 sit inside an HTML block/);
    assert.match(warnings[0], /Leave a blank line after the HTML tag/);
  });
  test('no warning for a deck with no folded fence', () => {
    const warnings = [];
    const bakers = [{ name: 'mermaid', load: () => ({ bake: (src) => src }) }];
    bakeDeck('```mermaid\nx\n```\n', {}, { bakers, grammar: [{ name: 'mermaid', requires: [], optional: [], fences: { mermaid: { aliases: [] } }, detect: null }], defaults: ['mermaid'], warn: (m) => warnings.push(m) });
    assert.deepEqual(warnings, []);
  });
});
