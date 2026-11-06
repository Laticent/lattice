/**
 * `ctx.fences()` (lib/core/plugin-fences.mjs): a bake receives the fences the ENGINE parses, never a reader of its own
 * (engineering/decisions/2026-11-06-plugin-patterns.md §4, D2 slice 3). Each case states the engine's reading.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pluginFences } = require('../../../lib/core/plugin-fences.mjs');

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
