/**
 * Unit: a splittable component's ordinal continues across the pages of a run.
 *
 * One structural element per page means a numbered component splits into a run of
 * one-item pages — and a private CSS counter is reset by every fresh `<ol>`/`<ul>`,
 * so page two restarts at 01. Measured on a real portrait render before the fix:
 * a three-item `list-criteria` read `01 · 01 · 01`, which tells the reader there
 * are three first criteria.
 *
 * The kernel already does its half. `auto-split.js` writes `--lat-split-offset` on
 * every body page of every run (the count of items on PRIOR pages), and
 * `collections.js` sets `start="N"` on a split `<ol>`. A component picks the offset
 * up with `counter-reset: <name> var(--lat-split-offset, 0)` — the pattern
 * `list-steps`, `q-and-a` and `authority-chain` were already using — or it uses the
 * BUILT-IN `list-item` counter, which `start="N"` seeds for free (`premise`).
 *
 * WHAT THIS ASSERTS: every component that (a) declares a split axis, so a run of its
 * pages exists, and (b) resets a PRIVATE counter, seeds that reset from the offset.
 * Two failures it would have caught are the same failure twice — a component enrolled
 * for splitting whose counter nobody re-read, and a new private counter added to a
 * component that was already enrolled.
 *
 * SOURCE-LEVEL, on purpose. The rendered check needs a browser and one deck per
 * component; this needs neither, and the defect is fully visible in the declaration.
 * `examples/split-structure.md` carries the rendered evidence for the real surface.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const COMPONENTS = path.join(ROOT, 'lib/components');

/**
 * Counters that are NOT ordinals — a `counter()` used to print a DATUM the author
 * supplied, seeded from a custom property that IS the value. Continuing those across
 * a run would be meaningless: they count nothing.
 */
const NOT_AN_ORDINAL = new Map([
  ['journey', ['mood', 'volume']], // `counter-reset: mood var(--mood)` — prints the item's own score
]);

/** Every component directory, as { name, dir }. */
function components() {
  return fs.readdirSync(COMPONENTS, { withFileTypes: true })
    .filter((b) => b.isDirectory())
    .flatMap((b) => fs.readdirSync(path.join(COMPONENTS, b.name), { withFileTypes: true })
      .filter((c) => c.isDirectory())
      .map((c) => ({ name: c.name, dir: path.join(COMPONENTS, b.name, c.name) })));
}

/** Does the manifest declare a split axis (`capacity.axis` or `adapt.capacity.axis`)? */
function declaresAxis({ name, dir }) {
  const file = path.join(dir, `${name}.manifest.json`);
  if (!fs.existsSync(file)) return false;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cap = m.capacity || m.adapt?.capacity || {};
  return Boolean(cap.axis);
}

/** Every `counter-reset` declaration in the component's stylesheet, as { name, value, line }. */
function counterResets({ name, dir }) {
  const file = path.join(dir, `${name}.styles.css`);
  if (!fs.existsSync(file)) return [];
  const out = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    // Skip comment-only lines — the prose explaining the pattern is not a declaration.
    if (/^\s*(\*|\/\*|\/\/)/.test(line)) return;
    for (const m of line.matchAll(/counter-reset:\s*([^;}]+)/g)) {
      // A declaration may reset several counters: `counter-reset: a b c`.
      const decl = m[1].trim();
      // Split into `name [value]` pairs; a value is a number or a var()/function call.
      const tokens = decl.match(/[\w-]+(?:\s*\((?:[^()]|\([^()]*\))*\))?/g) || [];
      for (let t = 0; t < tokens.length; t += 1) {
        const tok = tokens[t];
        if (/^\d/.test(tok) || tok.includes('(')) continue; // a value, not a name
        const next = tokens[t + 1];
        const value = next && (/^\d/.test(next) || next.includes('(')) ? next : '';
        out.push({ name: tok, value, line: i + 1 });
      }
    }
  });
  return out;
}

describe('split runs — a numbered component keeps counting', () => {
  const splittable = components().filter(declaresAxis);

  test('the fixture itself is real — components declare axes and reset counters', () => {
    assert.ok(splittable.length >= 20, `expected the enrolled set, found ${splittable.length}`);
    assert.ok(splittable.some((c) => counterResets(c).length), 'no counter-reset found anywhere');
  });

  for (const c of splittable) {
    const resets = counterResets(c);
    if (!resets.length) continue;
    test(`${c.name} seeds every ordinal counter from --lat-split-offset`, () => {
      const exempt = NOT_AN_ORDINAL.get(c.name) || [];
      const unseeded = resets.filter((r) => !exempt.includes(r.name)
        && !r.value.includes('--lat-split-offset'));
      assert.deepEqual(unseeded.map((r) => `${r.name} (line ${r.line})`), [],
        `${c.name} splits into a run of pages, but ${unseeded.length} counter(s) reset per page, `
        + 'so every page restarts at 01. Seed them: '
        + '`counter-reset: <name> var(--lat-split-offset, 0)`.');
    });
  }

  test('every exemption is still real — a stale entry fails', () => {
    for (const [name, counters] of NOT_AN_ORDINAL) {
      const c = components().find((x) => x.name === name);
      assert.ok(c, `NOT_AN_ORDINAL names ${name}, which is not a component`);
      const declared = counterResets(c).map((r) => r.name);
      for (const counter of counters) {
        assert.ok(declared.includes(counter),
          `NOT_AN_ORDINAL exempts ${name}'s "${counter}" counter, which no longer exists`);
      }
    }
  });
});
