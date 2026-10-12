/**
 * The data the Studio's fence door reads instead of the registry (lib/packages/fence-door.generated.json),
 * pinned to what the CLI's door reads live, and the rules both doors share (code-door-fence.mjs
 * `planFencePlugins`, `fenceCaptureNotes`, `rebuiltFromAlternatives`). HARD RULE #1: the two doors
 * cannot drift on which slides a shipped pass rebuilds or which fence names a shipped plugin owns.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DATA = require('../../../lib/packages/fence-door.generated.json');
const { rebuiltAlternatives, rebuiltBy } = require('../../../lib/transformers/rebuilt-classes.js');
const { PLUGINS } = require('../../../lib/plugins/registry.generated.js');
const { renderFenceDoor } = require('../../../tools/build-packages-index.js');

const load = () => import('../../../lib/packages/code-door-fence.mjs');

describe('the generated fence-door data', () => {
  test('is current: regenerating changes nothing', () => {
    assert.equal(fs.readFileSync(path.join(__dirname, '../../../lib/packages/fence-door.generated.json'), 'utf8'), renderFenceDoor());
  });

  test('the rebuilt-slide list is the registry’s own', () => {
    assert.deepEqual(DATA.rebuilt, rebuiltAlternatives().map((a) => ({ pass: a.pass, classes: [...a.classes] })));
  });

  test('the shipped fence names are the live plugin table’s, aliases included', () => {
    const live = new Set();
    for (const p of PLUGINS) for (const [fence, decl] of Object.entries(p.fences || {})) {
      live.add(fence);
      for (const a of decl.aliases || []) live.add(a.name);
    }
    assert.deepEqual(DATA.shippedFences, [...live].sort());
  });

  test('a function built from the generated list answers as the live one does, on every class set the registry names', async () => {
    const { rebuiltFromAlternatives } = await load();
    const studio = rebuiltFromAlternatives(DATA.rebuilt);
    const sets = [[], ['content'], ['dark'], ['video', 'dark'], ['closing', 'qr'], ['closing'], ...DATA.rebuilt.map((a) => a.classes), ...DATA.rebuilt.map((a) => [...a.classes, 'extra'])];
    for (const set of sets) assert.equal(studio(set), rebuiltBy(set), `class set ${JSON.stringify(set)}`);
    assert.equal(studio(['video']), 'video');
    assert.equal(studio(['split-panel']), null, 'a layout-only set denies nothing');
  });
});

describe('highlight languages and activation', () => {
  test('the generated language list is highlight.js’s own, aliases included', () => {
    const hljs = require('highlight.js');
    const live = new Set();
    for (const l of hljs.listLanguages()) {
      live.add(l);
      for (const a of hljs.getLanguage(l)?.aliases || []) live.add(a);
    }
    assert.deepEqual(DATA.highlightLanguages, [...live].sort());
    assert.ok(DATA.highlightLanguages.includes('python') && DATA.highlightLanguages.includes('js'));
  });

  test('activePluginNames: only the plugins the deck’s plugins: line names, in any YAML spelling', async () => {
    const { activePluginNames } = await load();
    const installed = ['a-plug', 'b-plug', 'c-plug'];
    assert.deepEqual([...activePluginNames('---\nplugins: [a-plug, c-plug]\n---\n', installed)], ['a-plug', 'c-plug']);
    assert.deepEqual([...activePluginNames('---\nplugins:\n  - b-plug\n---\n', installed)], ['b-plug']);
    assert.deepEqual([...activePluginNames('no front matter', installed)], []);
  });
});

describe('planFencePlugins: which plugins a door runs', () => {
  const host = { shipped: ['math', 'mermaid'] };

  test('an ordinary plugin runs and says nothing', async () => {
    const { planFencePlugins } = await load();
    assert.deepEqual(planFencePlugins([{ name: 'gantt-plugin', fence: 'gantt' }], host), { run: [{ name: 'gantt-plugin', fence: 'gantt' }], notes: [] });
  });

  test('two plugins on one fence name run for neither, and one line names both', async () => {
    const { planFencePlugins } = await load();
    const r = planFencePlugins([{ name: 'a', fence: 'x' }, { name: 'b', fence: 'x' }], host);
    assert.deepEqual(r.run, []);
    assert.match(r.notes[0], /plugins a and b both declare the fence `x`/);
  });

  test('a shipped fence, a malformed one and a highlight language are refused, each with its reason', async () => {
    const { planFencePlugins } = await load();
    const r = planFencePlugins([{ name: 'a', fence: 'mermaid' }, { name: 'b', fence: 'Bad Name' }, { name: 'c', fence: 'js' }, { name: 'd', fence: 'fine' }], { ...host, isLanguage: (n) => n === 'js' });
    assert.deepEqual(r.run.map((p) => p.name), ['d']);
    assert.match(r.notes.join('\n'), /plugin a is not run: `mermaid` is a fence a shipped plugin owns/);
    assert.match(r.notes.join('\n'), /plugin b is not run: its fence name "Bad Name" is not lower-case/);
    assert.match(r.notes.join('\n'), /plugin c is not run: `js` is a code language the engine highlights/);
  });

  test('a name that is a hyphen-prefix of another’s refuses both', async () => {
    const { planFencePlugins } = await load();
    const r = planFencePlugins([{ name: 'a', fence: 'x' }, { name: 'a-b', fence: 'y' }], host);
    assert.deepEqual(r.run, []);
    assert.equal(r.notes.length, 2);
  });
});

describe('fenceCaptureNotes', () => {
  test('one line each for a long block, a rebuilt slide (once per slide and pass), a nested section and the overflow', async () => {
    const { fenceCaptureNotes } = await load();
    const fences = new Map([['gantt', 'gp']]);
    const notes = fenceCaptureNotes({ tooLong: [{ pkg: 'gp', slide: 0 }], shadowed: [{ slide: 1, pass: 'video', pkg: 'gp' }, { slide: 1, pass: 'video', pkg: 'gp' }, { slide: 2, pass: 'nested-section', pkg: 'gp' }], tooMany: 3 }, fences);
    assert.equal(notes.length, 4);
    assert.match(notes[0], /`gantt` block on slide 1 is too long for the plugin gp/);
    assert.match(notes[1], /slide 2 is rebuilt by the shipped `video` pass/);
    assert.match(notes[2], /slide 3 holds a raw <section>/);
    assert.match(notes[3], /3 plugin blocks past the 400/);
  });
});

describe('fencePlaceholder: what stands where a plugin the deck did not list would draw', () => {
  test('names the plugin, carries none of the author’s text, and escapes the name', async () => {
    const { fencePlaceholder } = await load();
    const html = fencePlaceholder('gantt-plugin');
    assert.match(html, /^<div data-lattice-plugin-off="gantt-plugin" role="note">/);
    assert.match(html, /<strong>gantt-plugin<\/strong>/);
    assert.match(html, /not listed in this deck's plugins:/);
    const hostile = fencePlaceholder('x"><script>alert(1)</script>');
    assert.doesNotMatch(hostile, /<script/);
    assert.ok(!fencePlaceholder('a\u001b[2Jb').includes('\u001b'), 'a control character is not printed');
  });

  test('the engine’s stylesheet draws it from tokens and the shape table only (HARD RULES #3, #20, #29)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');
    const start = css.indexOf("A PLUGIN'S FENCE THE DECK DID NOT LIST");
    const block = css.slice(start, css.indexOf('Marp Core converts unicode emoji', start));
    assert.ok(start > 0 && block.length > 500, 'the placeholder rule is in the stylesheet');
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no hex literal');
    assert.doesNotMatch(block, /(^|[\s;{])margin[a-z-]*\s*:/, 'no margin');
    assert.match(block, /var\(--shape-spark\)/, 'the mark is the shape table’s');
    assert.doesNotMatch(block, /animation|@keyframes/, 'it is still: an export capture must not move');
  });
});
