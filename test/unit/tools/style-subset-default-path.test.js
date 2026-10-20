/**
 * Unit: a style subset rendered through `-c` takes the SAME mask and the SAME minified spelling as the
 * default render (engineering/decisions/2026-10-18-on-demand-styles.md §7).
 *
 * The engine masks a slide-own `::after { content }` (lib/engine/css.js `isPaginationTarget`), and the
 * mask reads the selector's SPELLING: on the minified text the default render ships it fires, on the
 * source spelling (`:is(.a, .b)` with a space) it does not. Feeding the unminified modules through `-c`
 * therefore made claim.md differ from the default render with no module missing. The audit now feeds
 * `dist/styles-min` modules, and this test pins the two facts that make that sound:
 *
 *   1. `-c <copy of dist/lattice-min.css>` renders byte-identically to the default render;
 *   2. every rule a claim.md subset carries is, rule for rule, a rule of the default render, so the mask
 *      (the `content: none` commented out on the slide's own `::after`) is the same on both sides.
 *
 * dist is gitignored; skipped when the style modules are not built (`npm run css:build`).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildIndex, scanDocument, neededModules } = require('../../../tools/style-needs');
const { runtimeTokensFor, readModules } = require('../../../tools/style-needs-lattice');

const ROOT = path.resolve(__dirname, '../../..');
const built = fs.existsSync(path.join(ROOT, 'dist/styles-min/manifest.json')) && fs.existsSync(path.join(ROOT, 'dist/lattice-min.css'));

const render = (deck, out, extra = []) => execFileSync('node', [path.join(ROOT, 'lattice.js'), path.join(ROOT, deck), out, '-q', ...extra], { maxBuffer: 1 << 27 });
const deckSheet = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
// Rules as TEXT, comments kept: the mask leaves its trace as a comment (`{/* content: none; */}`), which
// a parser would drop. Both sheets are minified, so a flat `prelude{declarations}` scan is exact; a rule
// inside an at-rule block is read as its own pair.
// A statement ahead of a rule (`@layer a,b;`) belongs to no rule, so the prelude is read after the last `;`.
const ruleSet = (css) => new Set([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => `${m[1].split(';').pop().trim()}{${m[2]}}`));

describe('style subset through the default render path', { skip: !built && 'dist/styles-min is not built' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'subset-path-'));
  const deck = 'examples/claim.md';

  test('-c <copy of lattice-min.css> is byte-identical to the default render', () => {
    const copy = path.join(tmp, 'full-min.css');
    fs.copyFileSync(path.join(ROOT, 'dist/lattice-min.css'), copy);
    render(deck, path.join(tmp, 'default.html'));
    render(deck, path.join(tmp, 'copy.html'), ['-c', copy]);
    assert.ok(fs.readFileSync(path.join(tmp, 'default.html')).equals(fs.readFileSync(path.join(tmp, 'copy.html'))));
  });

  test('claim.md through a minified subset carries only rules of the default render, mask included', () => {
    const html = fs.readFileSync(path.join(tmp, 'default.html'), 'utf8');
    const modules = readModules(ROOT);
    const index = buildIndex(modules);
    const doc = new JSDOM(html).window.document;
    const flags = neededModules(index, scanDocument(doc.documentElement), undefined, runtimeTokensFor(index));
    assert.ok(flags.filter(Boolean).length < modules.length, 'the subset should drop modules, or this test proves nothing');
    const min = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/styles-min/manifest.json'), 'utf8')).modules;
    const subset = min.filter((_, i) => flags[i]).map((m) => fs.readFileSync(path.join(ROOT, 'dist/styles-min', m.file), 'utf8')).join('');
    const subsetFile = path.join(tmp, 'subset.css');
    fs.writeFileSync(subsetFile, subset);
    render(deck, path.join(tmp, 'subset.html'), ['-c', subsetFile]);

    const full = ruleSet(deckSheet(html));
    const sub = ruleSet(deckSheet(fs.readFileSync(path.join(tmp, 'subset.html'), 'utf8')));
    assert.ok(sub.size > 0 && sub.size < full.size, `subset has ${sub.size} rules, default ${full.size}`);
    const foreign = [...sub].filter((r) => !full.has(r));
    assert.deepEqual(foreign.slice(0, 3), [], `${foreign.length} subset rules are not in the default render`);
    // The rule the unminified spelling used to leave unmasked.
    const masked = [...sub].filter((r) => /\.claim-bleed:after\{\/\* content: none; \*\/\}$/.test(r));
    assert.ok(masked.length > 0, 'the slide-own ::after content mask must fire on the subset path');
  });
});
