/**
 * The size registry (lib/engine/sizes.js) — the engine's own table of named
 * canvases, and the `@size` block the build stamps into the Marp-facing
 * artifacts.
 *
 * Two properties matter here, and they pull in opposite directions:
 *   1. the registry is what the RENDERER resolves against (no stylesheet
 *      involved), and
 *   2. the block it emits is what MARP reads, so it has to round-trip through
 *      the engine's own `@size` parser byte-for-byte.
 * Together they are the whole contract of
 * engineering/decisions/2026-08-16-size-registry-ownership.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SIZES, DEFAULT_SIZE, DEFAULT_SIZE_NAME, sizeFor, isRegisteredSize, sizeBlock } = require('../../../lib/engine/sizes');
const { parseSizes } = require('../../../lib/engine/css');
const { orientationFor } = require('../../../lib/engine/css');

const ROOT = path.join(__dirname, '..', '..', '..');

describe('the size registry', () => {
  test('every entry is a positive px canvas', () => {
    for (const [name, geom] of Object.entries(SIZES)) {
      for (const axis of ['width', 'height']) {
        assert.match(geom[axis], /^\d+px$/, `${name}.${axis} is not a bare px length: ${geom[axis]}`);
        assert.ok(parseFloat(geom[axis]) > 0, `${name}.${axis} is not positive`);
      }
    }
  });

  test('the presentation formats are registered, with their aliases', () => {
    // #399 / 2026-06-16-social-mobile-portrait-sizes.md. The alias must resolve to
    // the SAME box as the name it abbreviates — a deck may write either.
    for (const [alias, canonical] of [['16:9', 'hd'], ['1:1', 'square'], ['4:5', 'portrait'], ['9:16', 'story'], ['4k', '4K']]) {
      assert.deepEqual(SIZES[alias], SIZES[canonical], `'${alias}' and '${canonical}' must be the same canvas`);
    }
    for (const s of ['hd', 'standard', '4K', 'square', 'portrait', 'story', 'reel', 'mobile']) {
      assert.ok(isRegisteredSize(s), `'${s}' is not registered`);
    }
  });

  test('an absent or unregistered name resolves to the hd default, never undefined', () => {
    // The renderer must always have a box: a typo'd `size:` renders at the default
    // and `lint:deck` is what tells the author. A throw here would take out the render.
    assert.deepEqual(sizeFor(undefined), DEFAULT_SIZE);
    assert.deepEqual(sizeFor(''), DEFAULT_SIZE);
    assert.deepEqual(sizeFor('portraite'), DEFAULT_SIZE);
    assert.deepEqual(sizeFor('constructor'), DEFAULT_SIZE, 'inherited Object properties must not resolve as sizes');
    assert.equal(isRegisteredSize('constructor'), false);
    assert.deepEqual(DEFAULT_SIZE, SIZES[DEFAULT_SIZE_NAME]);
  });

  test('the registry spans all four adaptive families', () => {
    // If a family had no registered canvas, every reflow rule keyed on it would be
    // unreachable by construction — the #1218 class, one level up.
    const families = new Set(Object.values(SIZES).map((g) => {
      const a = parseFloat(g.width) / parseFloat(g.height);
      return a > 1.05 ? 'wide' : a > 0.9 ? 'square' : a > 0.5 ? 'tall' : 'strip';
    }));
    assert.deepEqual([...families].sort(), ['square', 'strip', 'tall', 'wide']);
  });

  test('orientationFor agrees with the registry on every entry', () => {
    // The classifier and the table are separate modules; a canvas that landed in a
    // family nobody expected would show up here rather than in a render.
    for (const [name, geom] of Object.entries(SIZES)) {
      const { name: orientation, scale } = orientationFor(geom);
      assert.ok(['landscape', 'square', 'portrait'].includes(orientation), `${name} classified as '${orientation}'`);
      assert.ok(scale >= 1 && scale <= 2.4, `${name} scale out of band: ${scale}`);
    }
  });
});

describe('the Marp `@size` stamp', () => {
  test('round-trips through the engine\'s own @size parser', () => {
    // What the build writes, Marp reads with the same grammar parseSizes implements.
    const parsed = parseSizes(`/* @theme lattice\n${sizeBlock()}\n */`);
    assert.equal(parsed.size, Object.keys(SIZES).length);
    for (const [name, geom] of Object.entries(SIZES)) {
      assert.deepEqual(parsed.get(name), geom, `'${name}' did not survive the stamp`);
    }
  });

  test('no SOURCE stylesheet declares @size — the engine owns geometry', () => {
    // The other half of the gate in tools/check-ownership.js, asserted here too so a
    // reintroduced table fails the fast suite and not only the build gate.
    const offenders = [];
    const roots = [path.join(ROOT, 'themes'), path.join(ROOT, 'lib')];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.css') && /@size\s+[A-Za-z0-9:_-]+\s+\S+\s+\S+/.test(fs.readFileSync(p, 'utf8'))) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    };
    for (const r of roots) walk(r);
    assert.deepEqual(offenders, [], 'source CSS declares @size — geometry belongs to lib/engine/sizes.js');
  });

  test('the Marp-facing artifacts DO carry the full table', () => {
    // Marp is the one consumer that reads geometry from the stylesheet, and it only
    // ever sees dist/. A missing stamp is a silently wrong page size in every
    // exported deck, which no in-repo render would notice.
    for (const rel of ['dist/lattice.css', 'dist/lattice.min.css', 'dist/themes/cuoio.min.css', 'dist/marp-kit/lattice.min.css']) {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) continue; // marp-kit is built on demand
      const parsed = parseSizes(fs.readFileSync(file, 'utf8'));
      for (const [name, geom] of Object.entries(SIZES)) {
        assert.deepEqual(parsed.get(name), geom, `${rel} is missing or has drifted on @size ${name}`);
      }
    }
  });
});
