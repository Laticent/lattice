/**
 * A `spectrum: solid|duo|mono` register paints a deck-wide top bar, and a slide's own explicit bar
 * wins over it -- as `accent` and a semantic `tone-edge` already win over the default rainbow
 * (2026-07-03-status-marker-style-variants.md §9). The register rule sets `border-image-source` at
 * (0,3,1), above those rules' (0,2,1), so without an exclusion it painted over both and a
 * `tone-fail` slide lost its failure color. The exclusion mirrors each rule's own gate and sits in
 * `:where()` so the register keeps (0,3,1) against every other rule.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.variants.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = CSS.match(/section:is\(\.spectrum-solid[^{]*\{/)?.[0] ?? '';

test('the style register finds its rule', () => {
  assert.ok(rule, 'register selector not found in base.variants.css');
});

test('the register excludes an accent slide', () => {
  assert.match(rule, /:not\(:where\([^)]*section\.accent,/);
});

test('the register excludes split-panel and split-compare, whose own two-segment bar is the top edge', () => {
  assert.match(rule, /:not\(:where\(\.split-panel, \.split-compare,/);
});

test('the register excludes a SEMANTIC tone-edge only, so a bare tone-edge keeps the spectrum', () => {
  assert.match(rule, /:is\(\.tone-pass, \.tone-warn, \.tone-fail, \.tone-skip\)\.tone-edge/);
});

test('the exclusion is wrapped in :where() so the register keeps its specificity', () => {
  assert.match(rule, /:not\(:where\(/);
});

// A semantic tone-edge on a split frame: the tone bar replaces the ribbon rather than stacking on it.
const toneEdge = (sel) => CSS.match(new RegExp(`${sel}[^{}]*\\{[^}]*\\}`, 'g')) ?? [];

test('a semantic tone-edge on a split frame drops the section border its own rule paints', () => {
  const block = CSS.match(/section\.split-panel:is\([^{]*\.tone-edge,\s*section\.split-compare:is\([^{]*\.tone-edge\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(block, /border-top:\s*none/);
  assert.match(block, /--_bar-t:\s*0px/);
});

test('a semantic tone-edge recolors each split frame\'s ribbon with --tone-color', () => {
  assert.ok(toneEdge('section\\.split-panel:is').some((r) => /--_ribbon:\s*linear-gradient\(var\(--tone-color\)/.test(r)));
  assert.ok(toneEdge('section\\.split-compare:is').some((r) => /\.compare-right\s*\{[^}]*linear-gradient\(var\(--tone-color\)/.test(r)));
});

// The tone RAIL and GLOW styles on an auto-split page: the semantic and the style ride as
// `data-split-mods`, so each rule must match that form as well as the class (followups.d/2645).
test('every semantic tone supplies --tone-color from data-split-mods, with or without tone-edge', () => {
  for (const t of ['pass', 'warn', 'fail', 'skip']) {
    assert.match(CSS, new RegExp(`\\nsection\\[data-split-mods~="tone-${t}"\\]\\s*\\{\\s*--tone-color:`), `tone-${t}`);
  }
});

test('the default rail, the explicit rail and the glow ring each match the split-page form', () => {
  const rail = CSS.match(/section:is\([^{]*\)\s*\{\s*--tone-rail:\s*inset calc\(0\.55[^}]*box-shadow/)?.[0] ?? '';
  assert.match(rail, /\[data-split-mods~="tone-warn"\]/);
  assert.match(CSS, /section:is\(\.tone-rail, \[data-split-mods~="tone-rail"\]\)\s*\{/);
  assert.match(CSS, /\[data-split-mods~="tone-skip"\]\):is\(\.tone-glow, \[data-split-mods~="tone-glow"\]\)\s*\{/);
});
