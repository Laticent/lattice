/**
 * The theme's ribbon stays the theme's on every element (2026-09-24-one-style-delivery-spine.md §8.2).
 *
 * `--sp-fill-rainbow-*` captures the theme's `--spectrum` with `var()` inside a `:root` block, so a
 * `spectrum-card: rainbow` rail can show the theme's ribbon on a `spectrum: solid` deck. That only
 * holds if no slide-level rule redefines `--spectrum`: every browser host PACKS `:root` onto the
 * slide itself (lib/engine/css.js `packSelector`), and there `var(--spectrum)` resolves against
 * whatever the slide set. The STYLE classes used to set it, so the pinned rail drew the quieter bar
 * in the Studio preview, the Playground and the Studio player while the CLI, which ships `:root`
 * unpacked, drew it right. A STYLE now sets `--spectrum-style`, and the bar reads `--spectrum-bar`.
 *
 * `print` is the one sanctioned exception: paper is grayscale, and a pinned rainbow on a print
 * slide SHOULD turn gray with everything else.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SANCTIONED = new Set(['section.print']);

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith('.css') ? [p] : [];
  });
}

test('no rule outside :root redefines --spectrum or --spectrum-vertical, except print', () => {
  const offenders = [];
  for (const file of cssFiles(path.join(ROOT, 'lib'))) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (!/(^|;|\s)--spectrum(-vertical)?\s*:/.test(m[2])) continue;
      const selectors = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        if (/^:root$|^:where\(:root\)$/.test(sel) || SANCTIONED.has(sel)) continue;
        offenders.push(`${path.relative(ROOT, file)}: ${sel}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a slide-level rule that redefines --spectrum breaks the :root rainbow capture in every packed host; set --spectrum-style instead',
  );
});

test('the bar and the rails read --spectrum-bar, and the STYLE classes set --spectrum-style', () => {
  const variants = fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.variants.css'), 'utf8');
  assert.match(variants, /--spectrum-bar:\s*var\(--spectrum-style,\s*var\(--spectrum\)\)/);
  for (const style of ['solid', 'duo', 'mono']) {
    assert.match(variants, new RegExp(`section\\.spectrum-${style}\\s*\\{\\s*--spectrum-style:`));
  }
});
