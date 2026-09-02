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
 *
 * WHAT THIS DOES NOT PROVE, stated because a gate that reads broader than it is, is worse than
 * a narrow one:
 *
 *   · It checks the DECLARATION, not the rendered page. For the AXIS-driven components the proxy
 *     is sound and was confirmed the hard way — measured on a real portrait render, a three-item
 *     `list-criteria` read `01 · 01 · 01` before the seed and `01 · 02 · 03` after. For the seven
 *     RECIPE-driven ones (`compare-code`, `compare-prose`, `decision`, `redline`, `glossary`,
 *     `list-tabular`, `split-panel`) it proves nothing either way: their strategies re-author the
 *     body, and measured on their own galleries at `portrait` none of them renders a numeric
 *     ordinal on a split page — nor on an unsplit one, because those counters live in variants the
 *     galleries do not exercise. Their seeds are insurance, not a demonstrated fix.
 *   · A recipe-driven run receives NO `--lat-split-offset` at all today. `applyRails` computes it
 *     with `countAxis(inner, 'item')` whatever axis the run was cut on, so a `row`-axis run
 *     (`glossary`, `compare-table`) gets none and a `col`-axis one (`roadmap`) gets a count of the
 *     wrong thing. Until that is fixed, seeding a recipe-driven counter changes nothing at render
 *     time — which is exactly why those seeds cannot be read as evidence.
 *   · It reads only `<name>.styles.css`. A counter in `base.modifiers.css`, in a theme, or in a
 *     second stylesheet in the component directory is invisible to it.
 *
 * The population was itself a hole: the first version selected on `capacity.axis` alone while the
 * engine enrolls on `axis || split`, so it was blind to those same seven components — four of
 * which carried unseeded counters. Found by the HARD RULE #25 red team.
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
 *
 * It was empty, and it held `journey`'s `mood`/`volume` before that — added while `journey` was
 * enrolled, then left behind when `journey` was backed out, where it became dead weight the
 * staleness check below still certified because it asked whether the COUNTER existed rather than
 * whether the EXEMPTION was doing anything. An allowlist that cannot tell a live entry from a
 * dead one is the defect every other allowlist in this repo (`SANCTIONED_HEX`,
 * `SANCTIONED_MARGINS`, `SANCTIONED_GLYPH_*`) fails on by design. An entry needs BOTH halves:
 * the counter must exist, AND its component must be enrolled.
 *
 * `journey` is enrolled again (2026-09-02, `journey-stages`, portrait only), so both halves hold
 * and the two entries are back. THE TEST FOR AN ENTRY IS MECHANICAL, and both counters pass it
 * twice over:
 *
 *   · NEITHER IS EVER INCREMENTED. `journey.styles.css` contains no `counter-increment` at all,
 *     so neither counter counts anything. `counter-reset: mood var(--mood)` followed by
 *     `content: counter(mood)` is the CSS idiom for printing a custom property as text — the
 *     reset IS the value. Seeding it from `--lat-split-offset` would print `offset + mood`: a
 *     mood of 4 on page three would read 6. The seed this gate asks for is not a no-op here, it
 *     is a corruption.
 *   · NEITHER RULE REACHES A SPLIT PAGE. Both are scoped to `.journey-task`, the LANDSCAPE grid
 *     chip. `journey-stages` splits only the portrait `.journey-vtask` stack and declines at
 *     landscape, so the two declarations are not on any page of any run.
 *
 * The first bullet is the durable reason and the one to check when the next candidate arrives:
 * a counter with no `counter-increment` anywhere in its stylesheet is a value-printer, not an
 * ordinal, and continuing it across a run is meaningless by construction.
 */
const NOT_AN_ORDINAL = new Map([
  ['journey', ['mood', 'volume']],
]);

/** Every component directory, as { name, dir }. */
function components() {
  return fs.readdirSync(COMPONENTS, { withFileTypes: true })
    .filter((b) => b.isDirectory())
    .flatMap((b) => fs.readdirSync(path.join(COMPONENTS, b.name), { withFileTypes: true })
      .filter((c) => c.isDirectory())
      .map((c) => ({ name: c.name, dir: path.join(COMPONENTS, b.name, c.name) })));
}

/**
 * Is this component enrolled for splitting?
 *
 * `axis || split`, WHICH IS THE ENGINE'S OWN PREDICATE (`lattice-emulator.js`: the capacity map
 * takes a component when `axis || m.split`). The first version of this gate asked only about
 * `capacity.axis` and was therefore blind to every component enrolled by a carousel RECIPE —
 * `compare-code`, `compare-prose`, `decision`, `redline`, `glossary`, `list-tabular` and
 * `split-panel`, 7 of the 30 enrolled — four of which carry unseeded private counters. A gate
 * whose population is narrower than the engine's certifies the components it cannot see.
 */
function declaresAxis({ name, dir }) {
  const file = path.join(dir, `${name}.manifest.json`);
  if (!fs.existsSync(file)) return false;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cap = m.capacity || m.adapt?.capacity || {};
  return Boolean(cap.axis || m.split);
}

/** Every `counter-reset` declaration in the component's stylesheet, as { name, value, line }. */
function counterResets({ name, dir }) {
  const file = path.join(dir, `${name}.styles.css`);
  if (!fs.existsSync(file)) return [];
  const out = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    // Skip comment-only lines — the prose explaining the pattern is not a declaration.
    if (/^\s*(\*|\/\*|\/\/)/.test(line)) return;
    // `counter-set` restarts a run exactly as `counter-reset` does — `counter-set: qa 5` on a
    // body page is the same defect in another property, and the first version matched neither it
    // nor anything outside this one file (see the coverage note in the docblock).
    for (const m of line.matchAll(/counter-(?:reset|set):\s*([^;}]+)/g)) {
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
      // BOTH halves. The counter must still exist AND its component must still be
      // enrolled — an exemption on a component that no longer splits suppresses nothing
      // and would sit here forever reading as a considered decision.
      assert.ok(declaresAxis(c),
        `NOT_AN_ORDINAL exempts counters on ${name}, which no longer declares a split axis, `
        + 'so the exemption suppresses nothing. Remove it.');
      const declared = counterResets(c).map((r) => r.name);
      for (const counter of counters) {
        assert.ok(declared.includes(counter),
          `NOT_AN_ORDINAL exempts ${name}'s "${counter}" counter, which no longer exists`);
      }
    }
  });
});
