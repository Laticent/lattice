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

  test('the shipped inline kinds are the live dispatcher table\'s, so a zip plugin cannot take one', () => {
    const { FIRST_PARTY, KINDS } = require('../../../lib/core/inline-code-directives.js');
    assert.deepEqual(DATA.shippedKinds, [...new Set([...FIRST_PARTY, ...KINDS.filter((k) => k.plugin)].map((k) => k.name))].sort());
    assert.equal(DATA.shippedKinds.includes('named'), false, 'the dispatcher\'s own row is not a kind');
    for (const k of ['state', 'pill', 'spark', 'icon', 'avatar']) assert.ok(DATA.shippedKinds.includes(k), k);
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
    const plan = planFencePlugins([{ name: 'gantt-plugin', fence: 'gantt' }], host);
    assert.deepEqual({ run: plan.run, notes: plan.notes }, { run: [{ name: 'gantt-plugin', fence: 'gantt' }], notes: [] });
    assert.deepEqual([...plan.fences], [['gantt', 'gantt-plugin']]);
    assert.deepEqual([...plan.kinds], []);
  });

  test('inline kinds (the inline door): a kinds-only plugin runs, a shared kind draws for neither, a shipped kind is refused', async () => {
    const { planFencePlugins } = await load();
    const kindHost = { ...host, shippedKinds: ['icon', 'pill'] };
    const alone = planFencePlugins([{ name: 'mentions', fence: '', kinds: ['mention'] }], kindHost);
    assert.deepEqual(alone.run.map((p) => p.name), ['mentions']);
    assert.deepEqual([...alone.kinds], [['mention', 'mentions']]);
    // Two plugins on one kind: neither draws it, one line names both; a plugin with a fence of its own still runs that.
    const shared = planFencePlugins([{ name: 'a-plug', fence: 'aa', kinds: ['tag'] }, { name: 'b-plug', fence: '', kinds: ['tag'] }], kindHost);
    assert.deepEqual(shared.run.map((p) => p.name), ['a-plug']);
    assert.deepEqual([...shared.kinds], []);
    assert.deepEqual([...shared.fences], [['aa', 'a-plug']]);
    assert.ok(shared.notes.some((n) => /a-plug and b-plug both declare the inline kind `@tag\{…\}`/.test(n)), shared.notes.join('\n'));
    // A kind Lattice draws (it gained it after the plugin was installed): only that kind is left out; the rest runs.
    const taken = planFencePlugins([{ name: 'my-icons', fence: 'iconfence', kinds: ['icon', 'glyph'] }], kindHost);
    assert.deepEqual(taken.run.map((p) => p.name), ['my-icons']);
    assert.deepEqual([...taken.kinds], [['glyph', 'my-icons']]);
    assert.deepEqual([...taken.fences], [['iconfence', 'my-icons']]);
    assert.ok(taken.notes.some((n) => /my-icons's inline kind `@icon\{…\}` is one Lattice now draws itself/.test(n)), taken.notes.join('\n'));
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

describe('placeholder size: remembered from output, declared in the manifest', () => {
  test('aspectOfOutput reads the first svg’s viewBox or width and height, reduced, in range, else null', async () => {
    const { aspectOfOutput } = await load();
    assert.equal(aspectOfOutput('<div><svg class="x" viewBox="0 0 520 130">'), '4/1');
    assert.equal(aspectOfOutput('<svg width="400" height="100">'), '4/1');
    assert.equal(aspectOfOutput('<svg viewBox="0 0 1e9 2">'), '999/1', 'clamped into the schema’s range');
    for (const none of ['<p>x</p>', '<svg>', '<svg viewBox="0 0 0 10">', '<svg viewBox="a b c d">', '']) assert.equal(aspectOfOutput(none), null, none);
  });

  test('placeholderHint keeps only a known placement, a W/H ratio for a figure and a known size for a chip', async () => {
    const { placeholderHint } = await load();
    assert.deepEqual(placeholderHint(null), { placement: 'figure' });
    assert.deepEqual(placeholderHint({ aspect: '16/9' }), { placement: 'figure', aspect: '16/9' });
    assert.deepEqual(placeholderHint({ placement: 'stage', aspect: '4/1', size: 'xl' }), { placement: 'stage' });
    assert.deepEqual(placeholderHint({ placement: 'chip' }), { placement: 'chip', size: 'md' });
    assert.deepEqual(placeholderHint({ placement: 'chip', size: 'xl' }), { placement: 'chip', size: 'xl' });
    for (const bad of ['16:9', '0/5', '1000/2', '4/1;color:red', 'x"><script>', 5]) assert.deepEqual(placeholderHint({ aspect: bad }), { placement: 'figure' }, String(bad));
    assert.deepEqual(placeholderHint({ placement: 'x"><b>', size: '"' }), { placement: 'figure' });
  });

  test('the placeholder’s attributes come only from the validated hint', async () => {
    const { fencePlaceholder } = await load();
    assert.match(fencePlaceholder('g', { aspect: '16/9' }), /data-placement="figure" style="--lp-w:16;--lp-h:9"/);
    assert.match(fencePlaceholder('g', { placement: 'stage' }), /data-placement="stage" role="note"/);
    assert.match(fencePlaceholder('g', { placement: 'chip', size: 'lg' }), /data-placement="chip" data-size="lg"/);
    assert.doesNotMatch(fencePlaceholder('g', { aspect: 'x"><script>' }), /script|style=/);
  });

  test('the schema accepts a placeholder.aspect and refuses anything else on it', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../lib/plugins/plugin.schema.json'), 'utf8'));
    const ph = schema.$defs.fence.properties.placeholder;
    assert.equal(ph.additionalProperties, false);
    assert.deepEqual(ph.properties.placement.enum, ['stage', 'figure', 'chip']);
    assert.deepEqual(ph.properties.size.enum, ['sm', 'md', 'lg', 'xl']);
    const re = new RegExp(ph.properties.aspect.pattern);
    for (const ok of ['16/9', '4/1', '999/999']) assert.ok(re.test(ok), ok);
    for (const no of ['16:9', '0/5', '1000/1', '4 / 1', '4/']) assert.ok(!re.test(no), no);
  });
});

describe('fencePlaceholder: what stands where a plugin the deck did not list would draw', () => {
  test('names the plugin, carries none of the author’s text, and escapes the name', async () => {
    const { fencePlaceholder } = await load();
    const html = fencePlaceholder('gantt-plugin');
    assert.match(html, /^<div data-lattice-plugin-off="gantt-plugin" data-placement="figure" role="note">/);
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
