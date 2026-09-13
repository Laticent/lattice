/**
 * Unit: lib/core/pkg-root.js — the one package-root walk.
 *
 * Two callers depend on it agreeing with itself: lattice-emulator.js resolves
 * sibling assets (themes/, dist/lattice.css) through it, and
 * lib/components/index.js resolves manifest.schema.json through it. The schema
 * and the manifests it governs must come from ONE tree, or the bundle validates
 * the live tree against a contract from somewhere else — see
 * engineering/decisions/2026-09-13-bundle-era-skew.md.
 *
 * The walk matters most where __dirname DIFFERS between the loose source and
 * the bundle (lib/components/ vs dist/), which is exactly why a fixed `..`
 * cannot work and why both call sites must land on the same answer.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pkgRootFrom } = require('../../../lib/core/pkg-root.js');
const ROOT = path.join(__dirname, '..', '..', '..');

test('finds the repo root from every layout the two callers actually use', () => {
  const real = fs.realpathSync(ROOT);
  // The loose source: __dirname IS lib/components.
  assert.equal(fs.realpathSync(pkgRootFrom(path.join(ROOT, 'lib', 'components'))), real);
  // The bundle: __dirname is <root>/dist. Both must agree, or schema and
  // manifests come from different trees.
  assert.equal(fs.realpathSync(pkgRootFrom(path.join(ROOT, 'dist'))), real);
  // The repo root itself.
  assert.equal(fs.realpathSync(pkgRootFrom(ROOT)), real);
});

test('stops at the NEAREST package.json, not the outermost', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkgroot-'));
  try {
    const outer = path.join(tmp, 'outer');
    const inner = path.join(outer, 'node_modules', 'thing');
    const deep = path.join(inner, 'lib', 'components');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(outer, 'package.json'), '{}');
    fs.writeFileSync(path.join(inner, 'package.json'), '{}');
    // An installed consumer must resolve to the INSTALLED package, not the host app.
    assert.equal(pkgRootFrom(deep), inner);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('returns the starting directory when no package.json exists anywhere', () => {
  // This is the branch that keeps the schema read on its ENOENT path — a miss
  // here must stay silent rather than throw, so the fallback stays quiet.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkgroot-none-'));
  try {
    const deep = path.join(tmp, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });
    // /tmp has no package.json above it on a normal machine; guard the assumption.
    const walked = pkgRootFrom(deep);
    assert.ok(walked === deep || fs.existsSync(path.join(walked, 'package.json')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
