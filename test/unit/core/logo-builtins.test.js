const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { BUILTIN_LOGOS, LATTICE_MARK_SVG, resolveLogoRef, svgDataUri } = require('../../../lib/core/logo-builtins');

const MARK_FILE = path.join(__dirname, '..', '..', '..', 'lib', 'base', '_logo', 'lattice-mark-min.svg');

describe('logo built-ins', () => {
  it('keeps the inlined mark byte-identical to the file it came from', () => {
    // The kernel is shared with the browser bundle, which has no filesystem, so the
    // SVG is inlined there. This is what stops the two copies from parting: edit
    // lib/base/_logo/lattice-mark-min.svg and this fails until the constant follows.
    const onDisk = fs.readFileSync(MARK_FILE, 'utf8').trim();
    assert.equal(LATTICE_MARK_SVG, onDisk, 'lib/core/logo-builtins.js LATTICE_MARK_SVG has drifted from lib/base/_logo/lattice-mark-min.svg');
  });

  it('resolves the built-in name to a data URI an <img> can load anywhere', () => {
    const src = resolveLogoRef('lattice');
    assert.ok(src.startsWith('data:image/svg+xml,'), `expected a data URI, got ${src.slice(0, 40)}`);
    assert.equal(decodeURIComponent(src.slice('data:image/svg+xml,'.length)), LATTICE_MARK_SVG);
  });

  it('is forgiving about how the name is typed', () => {
    for (const written of ['lattice', 'Lattice', '  LATTICE  ', 'LaTtIcE']) {
      assert.ok(resolveLogoRef(written).startsWith('data:'), `${JSON.stringify(written)} should resolve`);
    }
  });

  it('leaves every other value alone', () => {
    // A path, a URL, an already-inlined data URI and the demo brand mark are all
    // things an author meant literally — resolution must not touch them.
    for (const value of ['../lib/base/_logo/acme-logo.svg', '/brand/mark.svg', 'https://x.test/m.svg#icon', 'data:image/png;base64,AAAA', 'acme']) {
      assert.equal(resolveLogoRef(value), value);
    }
  });

  it('passes through a missing value rather than inventing one', () => {
    assert.equal(resolveLogoRef(null), null);
    assert.equal(resolveLogoRef(undefined), undefined);
    assert.equal(resolveLogoRef(''), '');
  });

  it('encodes the characters that would break an attribute or a URI', () => {
    // `#` ends a URI's path, `"` ends the attribute, `<`/`>` would be markup. A miss
    // here is a broken image on whichever surface nobody re-tested.
    const uri = svgDataUri('<svg><text>a#b"c<d>e%f</text></svg>');
    for (const raw of ['#', '"', '<', '>', '%3C']) {
      if (raw === '%3C') assert.ok(uri.includes(raw), 'markup should arrive percent-encoded');
      else assert.ok(!uri.slice('data:image/svg+xml,'.length).includes(raw), `${raw} should not survive raw`);
    }
  });

  it('offers exactly one name, and it is ours', () => {
    // `acme-logo.svg` is deliberately NOT a built-in: it stands in for the author's
    // own brand, which by definition cannot resolve from a name.
    assert.deepEqual(Object.keys(BUILTIN_LOGOS), ['lattice']);
  });
});
