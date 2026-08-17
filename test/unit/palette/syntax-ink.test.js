const test = require('node:test');
const assert = require('node:assert');
const { deriveSyntaxInks, syntaxInkSeeds, SYNTAX_INK_ROLES } = require('../../../tools/build-docs-portal.js');
const { contrastRatio, oklabDistance, oklchToHex, hexToOklch } = require('../../../lib/theme/color.js');
const { AA, MARGIN, MIN_DIST } = require('../../../lib/theme/cat-ink.js');

/**
 * The Studio editor's SYNTAX INK tier, held to its contract on a population far wider than
 * the eighteen shipped palettes.
 *
 * WHY THIS FILE EXISTS, and it is not a nicety. `deriveSyntaxInks`'s docblock used to say the
 * `exhausted` failure arm is unreachable on the shipped palettes and cite "the gate in
 * test/unit/palette/syntax-ink.test.js" — a file that did not exist. Three independent reviewers
 * found the dangling citation, in a change whose entire subject is references to things that are
 * not there. The honest fix was to write it rather than delete the sentence, because the claim it
 * makes is worth having: the same hostile sweep was being run by hand and quoted in the record
 * ("60,000 palettes, zero sub-AA, zero collapses") with no committed script behind it, which made
 * a load-bearing number unverifiable by anyone but its author.
 *
 * `checkSyntaxInkContrast` (tools/check-ownership.js) covers what SHIPPED — the emitted values in
 * `lattice-tokens.generated.css`. This covers what the RECIPE does on inputs no palette has
 * presented yet, which is the half a gate over the generated file structurally cannot see.
 */

/**
 * THE ROLES HELD TO THE SEPARATION CONTRACT, PINNED HERE AS A LITERAL — deliberately NOT imported
 * from the module under test. Importing it makes the assertion self-referential: emptying
 * `SYNTAX_INK_REPELLED` in the producer would empty this loop too, and the sweep would pass while
 * checking nothing. That is the exact trap an independent checker caught in
 * `checkSyntaxInkContrast` (which had reused the producer's own floors), and it was reproduced
 * here before being noticed — the mutation "SYNTAX_INK_REPELLED = []" ran GREEN against an earlier
 * cut of this file. A test's expectations belong to the test.
 */
const REPELLED = ['string', 'number'];

/** Deterministic LCG — a fixed seed, so a failure reproduces exactly. */
function rng(seed = 20260817) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** A random sRGB-representable hex, spread across the whole lightness/chroma space. */
function randomHex(r) {
  return oklchToHex({ L: r(), C: r() * 0.32, h: r() * 360 });
}

/** The worse of the two canvas contrasts — the number the recipe actually solves against. */
const worst = (ink, bg, bgAlt) => Math.min(contrastRatio(ink, bg), contrastRatio(ink, bgAlt));

/**
 * A seed with NO legible shade is a fact about the canvas pair, not a solver failure: contrast
 * against a fixed surface is monotone in lightness, so if neither pole clears, nothing does.
 * Those rows are reported through `illegible` and are excluded from the contract assertions —
 * asserting AA on them would be asserting the impossible.
 */
function noLegibleShade(seed, bg, bgAlt) {
  const { C, h } = hexToOklch(seed);
  const floor = AA + MARGIN;
  return (
    worst(oklchToHex({ L: 0, C, h }), bg, bgAlt) < floor && worst(oklchToHex({ L: 1, C, h }), bg, bgAlt) < floor
  );
}

test('deriveSyntaxInks holds its contract on 20,000 random palettes', () => {
  const r = rng();
  let solved = 0;
  let reported = 0;
  const violations = [];

  for (let i = 0; i < 20_000; i += 1) {
    const bg = randomHex(r);
    const bgAlt = randomHex(r);
    const seeds = Object.fromEntries(SYNTAX_INK_ROLES.map((role) => [role, randomHex(r)]));
    const avoid = [randomHex(r), randomHex(r), randomHex(r)];

    let out;
    assert.doesNotThrow(() => {
      out = deriveSyntaxInks({ seeds, bg, bgAlt, avoid });
    }, `deriveSyntaxInks threw on bg ${bg} / bgAlt ${bgAlt}`);

    // Every role comes back with a value, always — the caller decides what to do about a
    // reported one, but it never gets `undefined`.
    for (const role of SYNTAX_INK_ROLES) {
      assert.match(out.inks[role], /^#[0-9a-f]{6}$/i, `${role} is not a hex on bg ${bg}`);
    }

    if (out.illegible.length || out.exhausted.length) {
      reported += 1;
      continue; // a reported palette is the caller's throw, not a contract breach
    }
    solved += 1;

    for (const role of SYNTAX_INK_ROLES) {
      if (noLegibleShade(seeds[role], bg, bgAlt)) continue;
      const w = worst(out.inks[role], bg, bgAlt);
      if (w < AA) violations.push(`AA: ${role} ${out.inks[role]} on ${bg}/${bgAlt} = ${w.toFixed(3)}`);
    }

    // Only the repelled roles carry the separation contract; `keyword` is deliberately allowed
    // to coincide with `--text-heading` (a monochrome palette choosing its ink as its accent).
    for (const role of REPELLED) {
      if (noLegibleShade(seeds[role], bg, bgAlt)) continue;
      const others = [...avoid, ...SYNTAX_INK_ROLES.filter((x) => x !== role).map((x) => out.inks[x])];
      for (const other of others) {
        const d = oklabDistance(out.inks[role], other);
        if (d < MIN_DIST - 1e-9) {
          violations.push(`SEP: ${role} ${out.inks[role]} vs ${other} = ${d.toFixed(4)} on ${bg}/${bgAlt}`);
        }
      }
    }
  }

  assert.deepStrictEqual(violations.slice(0, 5), [], `${violations.length} contract violation(s)`);
  // A sweep that solved nothing would pass every assertion above vacuously.
  assert.ok(solved > 5_000, `only ${solved} of 20,000 palettes solved — the sweep is not exercising the recipe`);
  assert.ok(reported > 0, 'no palette was reported — the failure arms are never being reached');
});

test('the role sets are what this file assumes — a fourth role would silently go unchecked', () => {
  // The sweep pins `REPELLED` as a literal so it cannot be hollowed out by a producer edit. The
  // cost of that is drift: if a role is added upstream, the loop above would quietly stop covering
  // it. So the assumption is asserted rather than left implicit.
  assert.deepStrictEqual(SYNTAX_INK_ROLES, ['keyword', 'string', 'number']);
  for (const role of REPELLED) assert.ok(SYNTAX_INK_ROLES.includes(role), `${role} is not a role`);
});

test('a straddling canvas is REPORTED, never silently best-effort', () => {
  // --bg near-white and --bg-alt near-black: one surface wants a dark ink, the other a light
  // one, so no single value serves both. This used to fall through to `bestEffortInk` and emit a
  // 1.63:1 value with nothing said — while a ~0.02 cosmetic near-collision threw and broke the
  // whole docs-token build. That asymmetry was exactly backwards.
  const out = deriveSyntaxInks({
    seeds: { keyword: '#006FA8', string: '#ecc48d', number: '#F78C6C' },
    bg: '#FFFFFF',
    bgAlt: '#111111',
    avoid: ['#0A1628', '#1E3A5F', '#6B7F9A'],
  });
  assert.deepStrictEqual(out.illegible.sort(), ['keyword', 'number', 'string']);
});

test('a seed that already clears comes back UNCHANGED', () => {
  // The property that keeps `keyword` visually identical to `--accent` on 34 of 36 shipped
  // palette-modes: an unrepelled role whose seed already clears is not repainted.
  const out = deriveSyntaxInks({
    seeds: { keyword: '#1E3A5F', string: '#2F6B12', number: '#8A5A00' },
    bg: '#FFFFFF',
    bgAlt: '#F2F5FA',
    avoid: ['#0A1628', '#6B7F9A', '#A69882'],
  });
  assert.strictEqual(out.inks.keyword, '#1E3A5F');
  assert.deepStrictEqual(out.illegible, []);
  assert.deepStrictEqual(out.exhausted, []);
});

test('the a11y palettes seed string/number from their own status pair, not from --hljs-*', () => {
  // The color-vision accommodation: those four inherit onyx's syntax family (green 144deg /
  // yellow-green 104deg), which is the red-green axis two of them exist to avoid.
  for (const name of ['a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia', 'a11y-achromatopsia']) {
    assert.deepStrictEqual(syntaxInkSeeds(name), { keyword: 'accent', string: 'pass', number: 'warn' }, name);
  }
  for (const name of ['indaco', 'cuoio', 'onyx', 'concrete']) {
    assert.deepStrictEqual(
      syntaxInkSeeds(name),
      { keyword: 'accent', string: 'hljs-string', number: 'hljs-number' },
      `${name} keeps its own syntax hues — onyx is a monochrome BRAND, not an accommodation`,
    );
  }
});
