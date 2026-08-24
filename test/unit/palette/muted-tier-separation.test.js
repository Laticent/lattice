/**
 * Unit: `checkMutedTierFloors`' SEPARATION arm — an ink measured against another INK.
 *
 * `--text-muted` and `--text-secondary` are both defined as "quieter than body"
 * (design/theming.md). A contrast FLOOR cannot express that: an ink that clears
 * 4.5:1 against the canvas clears it just as well sitting on top of the body ink.
 * So the gate carries a second predicate — an OKLab distance between two INKS,
 * with no canvas in it.
 *
 * THE SECOND ROW IS WHY THIS FILE EXISTS. Until #1776's follow-up the arm measured
 * `--text-muted` alone, and the asymmetry was an accident rather than a judgment:
 * `--text-secondary` carries the same contract, is repaired against the same two
 * surfaces a few lines apart in `lib/theme/derive.js`, and its committed worst
 * (0.0384, cuoio/light) is 0.0004 from muted's — the same number to within noise.
 * #1776 gave the STUDIO meter that row and left this gate without it, so the two
 * surfaces that measure the same contract disagreed about which tokens it covers.
 *
 * `--text-label` is the same predicate applied to the OPPOSITE role: accent-hued
 * EMPHASIS rather than a quiet tier, separated from body by HUE on palettes with
 * chroma to spare. It is measured because on cuoio it had stopped being either —
 * label #6F604F against body #6b5d4f is dL 0.0109 / da -0.0002 / db 0.0045, a
 * kicker nobody can see is a kicker, with AA green the whole time.
 *
 * Driven through the real gate over a MUTATED COPY of the whole corpus, not over a
 * synthetic one-file dir: `checkMutedTierFloors` fails closed on a thin scan
 * (`found only N theme file(s)`), so a one-file fixture would pass this test for
 * the wrong reason — the empty-scan guard firing rather than the tier being caught.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkMutedTierFloors } = require('../../../tools/check-ownership.js');

const THEMES = path.join(__dirname, '../../../themes');

/**
 * Copy the corpus, collapsing `token` onto `--text-body` on the first palette that
 * declares both — the exact defect the arm exists to catch, and nothing else.
 *
 * The mutation COPIES `--text-body`'s declaration TEXT rather than resolving it to a
 * hex. That needs no resolver here (the gate has one, and it is the thing under test),
 * and it collapses the pair in BOTH modes at once, including the `light-dark()` and
 * `var(--scheme-dark-…)` forms the corpus actually uses — a single hex would collapse
 * one arm and leave the other measuring something else.
 */
function corpusWithCollapse(token) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latt-quiet-tier-'));
  let patched = null;
  for (const f of fs.readdirSync(THEMES)) {
    const src = fs.readFileSync(path.join(THEMES, f), 'utf8');
    let out = src;
    const bodyDecl = src.match(/^\s*--text-body\s*:\s*([^;]+);/m);
    const re = new RegExp(`^(\\s*${token}\\s*:\\s*)[^;]+;`, 'm');
    if (!patched && f.endsWith('.css') && bodyDecl && re.test(src)) {
      out = src.replace(re, `$1${bodyDecl[1].trim()};`);
      patched = { theme: f.replace(/\.css$/, '') };
    }
    fs.writeFileSync(path.join(dir, f), out);
  }
  assert.ok(patched, `no palette declares ${token} beside --text-body — the mutation is inert`);
  return { dir, ...patched };
}

describe('checkMutedTierFloors · the ink-vs-ink separation arm', () => {
  test('the live tree is clean', () => {
    const errors = [];
    checkMutedTierFloors(errors);
    assert.deepEqual(errors, []);
  });

  /**
   * BOTH tiers, separately, and the failure has to NAME the one that collapsed —
   * an aggregate count would let the second row be dropped again without a test
   * going red, which is the shape of the gap this file closes.
   */
  for (const token of ['--text-muted', '--text-secondary', '--text-label']) {
    test(`BITES: ${token} collapsed onto --text-body fails the gate`, () => {
      const { dir, theme } = corpusWithCollapse(token);
      const errors = [];
      checkMutedTierFloors(errors, dir);
      fs.rmSync(dir, { recursive: true, force: true });
      assert.notDeepEqual(errors, [], `${token} sitting ON --text-body must fail`);
      const named = errors.filter((e) => e.includes(token) && e.includes(theme));
      assert.ok(named.length > 0,
        `the failure must name ${token} on ${theme}; got:\n  ${errors.slice(0, 4).join('\n  ')}`);
      assert.match(named[0], /separation floor/);
    });
  }

  /**
   * The corpus copy alone must be clean, so the mutations above are the only reason
   * those runs fail. Without this, a copy that silently lost its import chain would
   * make every mutation "pass" for a reason that has nothing to do with the tier.
   */
  test('an UNMUTATED copy of the corpus is clean through the same path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latt-quiet-tier-'));
    for (const f of fs.readdirSync(THEMES)) {
      fs.copyFileSync(path.join(THEMES, f), path.join(dir, f));
    }
    const errors = [];
    checkMutedTierFloors(errors, dir);
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(errors, []);
  });
});
