/**
 * THE BOTTOM-LAYER RULE for a finish's export face (lib/base/base.finish.css).
 *
 * On print and in the Studio's raster export, a finish swaps each slot to its
 * `--fin-*-opaque` mirror, and every full-bleed fade there must end opaque, or the
 * PDF rasterizer draws it through gray. But only the BOTTOM layer may end on the
 * SOLID canvas. A layer painted above it that ends solid paints the slide color over
 * everything below it. `halo`'s vignette and `nimbus`'s four blooms all did, so the
 * committed examples/finish-backdrops.pdf showed a blank white slide with a gray rim
 * on both, and no gate saw it (2026-09-23-portable-packages.md §1).
 *
 * So this walks every shipped preset and asserts, on the export face:
 *   - A full-bleed `--fin-edge-opaque` has no solid-canvas stop. The edge pseudo
 *     paints above the whole backdrop, so nothing in it is ever the bottom layer. A
 *     corner patch (ledger's fold) covers only its corner and is exempt.
 *   - `--fin-wash-opaque` has a solid-canvas stop in its LAST full-bleed layer at most.
 *     The wash layers sit under the texture, and the last one listed is the bottom. A
 *     layer sized to a strip is exempt: it covers only its strip.
 *
 * A "solid-canvas stop" is a bare `var(--fin-canvas) N%` gradient stop. A stop that
 * MIXES the canvas (`color-mix(…, var(--fin-canvas)) N%`) is a tint, not the canvas,
 * and ends in `)) N%`, so the pattern doesn't match it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.finish.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const SOLID_CANVAS_STOP = /var\(--fin-canvas\)\s+\d+%/g;

/** Every `section.finish-<name> { … }` preset block, by name. */
function presets() {
  const out = new Map();
  for (const m of CSS.matchAll(/section\.finish-([a-z][a-z0-9-]*)\s*\{([^}]*)\}/g)) out.set(m[1], m[2]);
  return out;
}

/** A custom property's value within one block, or null. */
function slot(block, name) {
  const m = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\s*:([^;]*);`).exec(block);
  return m ? m[1].trim() : null;
}

/** Split a background-image value into its top-level layers. */
function layers(value) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out;
}

test('the census reads the shipped presets (halo and nimbus among them)', () => {
  const names = [...presets().keys()];
  assert.ok(names.includes('halo') && names.includes('nimbus'), `found: ${names.join(', ')}`);
});

test('no FULL-BLEED export-face edge ends on the solid canvas — it paints over everything', () => {
  const bad = [];
  for (const [name, block] of presets()) {
    const edge = slot(block, '--fin-edge-opaque');
    // A corner patch (ledger's fold, sized 9.4cqi) covers only its corner.
    const fullBleed = /^(cover|auto|100% 100%)$/.test(slot(block, '--fin-edge-size') || 'auto');
    if (edge && fullBleed && edge.match(SOLID_CANVAS_STOP)) bad.push(name);
  }
  assert.deepEqual(bad, [], 'end the edge on rgb(from var(--fin-canvas) r g b / 0) instead');
});

/**
 * Is wash layer `i` FULL-BLEED? The compositor lists texture layers first, then wash
 * layers, and `--fin-size` carries one entry per layer in that order. A layer sized to
 * a strip (strata's `100% 0.31cqi` hairline) covers only that strip, so what it paints
 * over is the strip, not the slide.
 */
function washLayerIsFullBleed(block, i) {
  const tex = slot(block, '--fin-texture-opaque');
  const texCount = !tex || tex === 'none' ? 1 : layers(tex).length; // `none` still holds one slot
  const sizes = layers(slot(block, '--fin-size') || 'auto');
  const size = sizes[texCount + i] ?? sizes[sizes.length - 1];
  return /^(cover|auto|100% 100%)$/.test(size);
}

test('only the LAST full-bleed export-face wash layer may end on the solid canvas', () => {
  const bad = [];
  for (const [name, block] of presets()) {
    const wash = slot(block, '--fin-wash-opaque');
    if (!wash || wash === 'none') continue;
    const ls = layers(wash);
    ls.slice(0, -1).forEach((l, i) => {
      if (l.match(SOLID_CANVAS_STOP) && washLayerIsFullBleed(block, i)) bad.push(`${name} layer ${i + 1} of ${ls.length}`);
    });
  }
  assert.deepEqual(bad, [], 'end every upper layer on rgb(from var(--fin-canvas) r g b / 0) instead');
});

test('the pattern catches the defect it exists for (the failing arm)', () => {
  const broken = 'radial-gradient(78% 78% at 50% 50%, var(--fin-canvas) 62%, color-mix(in srgb, var(--text-heading) 5%, var(--fin-canvas)) 100%)';
  assert.equal(broken.match(SOLID_CANVAS_STOP)?.length, 1);
  const fixed = broken.replace('var(--fin-canvas) 62%', 'rgb(from var(--fin-canvas) r g b / 0) 62%');
  assert.equal(fixed.match(SOLID_CANVAS_STOP), null);
});
