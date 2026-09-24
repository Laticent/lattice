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
 *   - No `--fin-texture-opaque` layer has one: the texture paints ABOVE the wash.
 *
 * A "solid-canvas stop" is a gradient stop whose COLOR is the canvas itself —
 * `var(--fin-canvas)` with or without a fallback (`var(--fin-canvas, var(--bg))`, the
 * Studio generator's form), or `var(--bg)` — at any position or none. It is found by
 * splitting each gradient into its stops, not by a text pattern: an earlier regex
 * (`var(--fin-canvas) N%`) missed the fallback form, a fractional or `calc()` position
 * and a stop with no position. A stop that MIXES the canvas (`color-mix(…)`,
 * `rgb(from var(--fin-canvas) … / 0)`) starts with another function, so it is a tint or a
 * clear stop, not the canvas.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.finish.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The top-level comma-separated arguments of `fn(…)`, or the whole value split the same way. */
function args(value) {
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

/** How many of a layer's gradient stops are the solid canvas. */
function solidCanvasStops(layer) {
  let n = 0;
  // Every gradient in the layer (a layer is one gradient, but be generous), by its argument list.
  for (const m of layer.matchAll(/(?:repeating-)?(?:linear|radial|conic)-gradient\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < layer.length && depth; i++) {
      if (layer[i] === '(') depth++;
      else if (layer[i] === ')') depth--;
    }
    for (const stop of args(layer.slice(from, i - 1))) if (/^var\(\s*--(?:fin-canvas|bg)(?=[\s,)])/.test(stop)) n++;
  }
  return n;
}

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
    if (edge && fullBleed && layers(edge).some(solidCanvasStops)) bad.push(name);
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
      if (solidCanvasStops(l) && washLayerIsFullBleed(block, i)) bad.push(`${name} layer ${i + 1} of ${ls.length}`);
    });
  }
  assert.deepEqual(bad, [], 'end every upper layer on rgb(from var(--fin-canvas) r g b / 0) instead');
});

test('no export-face TEXTURE layer ends on the solid canvas — the texture paints above the wash', () => {
  const bad = [];
  for (const [name, block] of presets()) {
    const tex = slot(block, '--fin-texture-opaque');
    if (!tex || tex === 'none') continue;
    layers(tex).forEach((l, i) => {
      if (solidCanvasStops(l)) bad.push(`${name} texture layer ${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('the check catches every way to write the defect (the failing arms)', () => {
  const tail = ', color-mix(in srgb, var(--text-heading) 5%, var(--fin-canvas)) 100%)';
  for (const stop of ['var(--fin-canvas) 62%', 'var(--fin-canvas, var(--bg)) 60%', 'var(--fin-canvas) 62.5%', 'var(--bg) 60%', 'var(--fin-canvas)', 'var(--fin-canvas) calc(50% + 2px)']) {
    assert.equal(solidCanvasStops(`radial-gradient(78% 78% at 50% 50%, ${stop}${tail}`), 1, stop);
  }
  // …and none of the forms that are NOT the canvas.
  for (const stop of ['rgb(from var(--fin-canvas) r g b / 0) 62%', 'color-mix(in srgb, var(--accent) 12%, var(--fin-canvas)) 0%', 'var(--fin-canvas-ink) 10%']) {
    assert.equal(solidCanvasStops(`radial-gradient(78% 78% at 50% 50%, ${stop}${tail}`), 0, stop);
  }
});
