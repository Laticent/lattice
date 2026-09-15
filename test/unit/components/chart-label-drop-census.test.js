/**
 * Census: no chart in the shipped corpus silently drops a human-readable name.
 *
 * THE FAMILY DROPS LABELS ON PURPOSE, and that is not the defect. Three
 * mechanisms decline to paint a name when the geometry genuinely cannot hold
 * it, each with its reasoning written where it lives:
 *
 *   1. `placeLabels` HIDE-OVERLAP (`svg-label.js`) — a label that still
 *      collides after every anchor, ring and nudge is dropped rather than
 *      painted through its neighbor. Two overprinted names are not one
 *      readable name plus one lost, they are two lost, and the reader cannot
 *      tell it happened. Callers: `quadrant`, `scatter`.
 *   2. The category GAP-CULL (`cartesian.js` § buildCategoryLabels) — below a
 *      pitch of one line height the rows genuinely cannot all be named, so the
 *      gap cull comes back and some names survive rather than none.
 *   3. Per-caller THINNING — `line` blanks an interior category before the
 *      substrate ever sees it, so the axis reads FY2024 … FY2026. The point is
 *      still plotted; only its tick is thinned.
 *
 * TWO MECHANISMS THIS CENSUS CANNOT SEE, named so the coverage claim below is not
 * read wider than it is. It instruments `placeLabels` and `buildCategoryLabels`, so
 * it is blind to (a) `quadrant`'s 16-item ceiling, past which no name is offered to
 * the placement pass at all, and (b) `word-cloud`'s `packCloud`, a third path it
 * never patched. (b) is not hypothetical: `examples/seq-ramp-canvas-aware.md` loses
 * the word "leverage" at landscape and square and has since before this census was
 * written, which makes "the decks we ship never reach any drop path" false as a
 * statement about the whole family. Both are covered instead by
 * `test/unit/components/label-drops.test.js`, through the render-time channel
 * (#2171), which sees every mechanism because it is fed by the drop sites rather
 * than by a patch over two of them.
 *
 * So the invariant worth pinning is not "the kernel can never drop a name" —
 * that would demand overprinting, which loses more. It is that **the decks WE
 * ship never reach any of those paths**, which is what makes our corpus the
 * reference for how to author one. Measured at 9f9d0eb: 1,314 chart renders
 * across 275 shipped decks plus the chart-fit fixture, at three orientations,
 * drop nothing. Quote a base with that number — the corpus grows, so a count
 * taken from a moving HEAD will not reproduce.
 *
 * An AUTHOR is not equally protected, and this census deliberately does not
 * claim they are. Five long names in one quadrant loses two, and twenty rows
 * on a `bar` loses ten — both at the shipped sizes, both silent, both reached
 * by the detector arms below. Warning the author is real work and needs a
 * render-time diagnostic channel the family does not have; it is not in scope
 * here, and pinning our own corpus does not close it.
 *
 * WHY THIS EXISTS. That property held when it was written and NOTHING guarded
 * it. `quadrant`'s `FS.dotLabel` is pinned to 9.5 — the global minimum set by
 * one fourteen-initiative stress slide — and its own docblock asks the next
 * editor to "validate a change here against the corpus, not against the two
 * fixtures", with no way to do so. That plea had already been ignored once:
 * #1544 raised the size ~10%, the stress slide went fourteen names in and
 * thirteen out, and it was committed into a gallery PDF before the adversarial
 * trio caught it. Measured here while writing this: at `dotLabel` 10.5 the
 * corpus loses 6 names, at 12 it loses 30. Every one of those is silent.
 *
 * WHY THE DETECTOR ARMS ARE NOT DECORATION. Arms 2 and 3 feed inputs that MUST
 * drop, and they do double duty. They prove the census can fail — a guard
 * nothing exercises is not a guard — and they prove the instrumentation below
 * is actually installed, which a passing arm 1 alone cannot distinguish from a
 * patch that silently missed its target. If the monkey-patch stops taking
 * effect, arms 2 and 3 go red rather than arm 1 going quietly green forever.
 *
 * TWO FALSE POSITIVES THIS COUNTER HIT FIRST, both worth keeping out:
 *   - `line`'s blanked interior label is an EMPTY string, not a lost one, so
 *     the counter must weigh only non-empty labels or it reports mechanism 3
 *     as data loss on every `line` slide in the tree.
 *   - Counting `<text>` elements document-wide rather than per call attributes
 *     one builder's output to another. Each patched call is measured on its
 *     own return value.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const P = (p) => path.join(ROOT, p);

// ── Instrumentation ────────────────────────────────────────────────────
// Both kernels are patched BEFORE `chart-family` is required, because every
// caller destructures these functions at ITS OWN require time. Patch after and
// the callers hold the originals and the census measures nothing. `node --test`
// gives each test file its own process, so the mutated cache cannot leak.
const labelMod = require(P('lib/components/chart/_chart-family/svg-label.js'));
const cartMod = require(P('lib/components/chart/_chart-family/cartesian.js'));

/** Names dropped by the render currently under way, or null when not counting. */
let dropped = null;
const note = (mechanism, what) => { if (dropped) dropped.push(`${mechanism}: ${what}`); };

/**
 * A CALLER MAY PLACE THE SAME NAMES SEVERAL TIMES AND KEEP ONE RESULT.
 * `quadrant` sizes its dot labels per slide (#1605) by walking a ladder of
 * font sizes largest-first and taking the first rung where every name places —
 * so a crowded slide legitimately produces up to nine placement passes, eight
 * of them REJECTED. Counting every pass reported 141 losses on a corpus that
 * loses nothing; counting only the last is fragile the moment a caller reorders
 * its search.
 *
 * So calls are grouped by the set of names they placed, and a group counts as
 * a loss only when EVERY attempt in it dropped something — which is exactly
 * "the caller had no option that kept all the names". A caller that places once
 * is the same rule with one attempt, so nothing about the single-pass case
 * changes.
 */
const attempts = new Map();
const realPlaceLabels = labelMod.placeLabels;
labelMod.placeLabels = function patchedPlaceLabels(items, opts) {
  const out = realPlaceLabels.call(this, items, opts);
  if (dropped) {
    const key = items.map((it) => it?.text ?? '').join('\u0000');
    const lost = out.map((r, i) => (r?.hidden ? items[i]?.text || `item #${i}` : null)).filter(Boolean);
    const prior = attempts.get(key);
    // Keep the BEST attempt seen for this set of names.
    if (!prior || lost.length < prior.length) attempts.set(key, lost);
  }
  return out;
};

const realCategoryLabels = cartMod.buildCategoryLabels;
cartMod.buildCategoryLabels = function patchedCategoryLabels(o) {
  const svg = realCategoryLabels.call(this, o);
  // Non-empty only: an interior label a caller blanked itself is thinning
  // (mechanism 3), not loss. Measured on THIS call's own output.
  const want = (o.labels || []).filter((s) => String(s).trim()).length;
  const got = (svg.match(/<text/g) || []).length;
  if (got < want) note('categoryCull', `${want - got} of ${want} on the ${o.axis} axis`);
  return svg;
};

const { transformChartSection } = require(P('lib/components/chart/_chart-family/chart-family.js'));
const { shippedDecks } = require(P('test/helpers/decks.js'));

// A PLAIN parser. The transform reads the `<ul>` / `<li>` tree, and the
// engine's parser has the pill plugin installed, which consumes the very
// trailing inline code the chart kernels read their values from.
const md = new MarkdownIt({ html: true });

/** Every orientation a deck can be authored at — a name can fit at one and not another. */
const ORIENTATIONS = ['landscape', 'portrait', 'square'];

/**
 * Render one chart slide and report the names it dropped.
 * Returns `null` when the section is not a chart the family claims.
 */
function dropsFor(body, cls, orientation) {
  dropped = [];
  attempts.clear();
  let res = null;
  let threw = null;
  try {
    res = transformChartSection(md.render(body), cls, orientation);
  } catch (err) {
    // A kernel that THROWS is a different defect and a louder one. It is not
    // this census's to diagnose, but swallowing it would hide it entirely, so
    // it is reported as a loss rather than passing as "not a chart".
    threw = err;
  }
  // Fold in the best attempt per name-set, then stop counting, so a later
  // un-instrumented call cannot append to this slide's total.
  for (const lost of attempts.values()) {
    for (const name of lost) dropped.push(`placeLabels: ${name}`);
  }
  attempts.clear();
  const out = dropped;
  dropped = null;
  if (threw) return [`threw: ${threw.message}`];
  return res?.transformed ? out : null;
}

/**
 * BLANKED TO SPACES, NOT DELETED, and matching BOTH closers — `lint-core.js`'s
 * `withoutCodeCommentMarkers` idiom, for its reasons (HARD RULE #15).
 *
 * Deleting a multi-character marker in one pass can RECONSTITUTE it from the
 * text either side: `<!<!----` loses the inner `<!--` and the remaining halves
 * close up into a fresh one. Spaces cannot combine into a marker, so one pass
 * suffices. `--!>` is a real closer the HTML parser honors and a single-closer
 * regex walks straight past it, swallowing the rest of the slide as comment.
 * And an UNTERMINATED `<!--` matches nothing at all, so the raw marker reaches
 * the transform as content — the second pass neutralizes what the first leaves.
 *
 * Newlines survive the blanking (unlike lint-core's, which runs over code
 * fences where that does not matter): this body is scanned for a `^##` heading,
 * and collapsing a multi-line comment to one run of spaces would weld the next
 * heading onto the previous line.
 */
const blankRun = (m) => m.replace(/[^\n]/g, ' ');

/** Each `<!-- _class: … -->` section of a deck, with its title for reporting. */
function* chartSections(file) {
  const src = fs.readFileSync(P(file), 'utf8');
  for (const chunk of src.split(/^---\s*$/m)) {
    const m = chunk.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
    if (!m) continue;
    const body = chunk.replace(/<!--[\s\S]*?--!?>/g, blankRun).replace(/<!--|--!?>/g, blankRun);
    const titleMatch = body.match(/^##\s+(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : '(untitled)';
    yield { cls: m[1].trim(), body, title };
  }
}

/**
 * The corpus. `shippedDecks()` is the shared answer to "which files are decks"
 * — examples, kits, galleries and the baseline decks — reused rather than
 * re-derived so a new deck directory cannot quietly fall out of this census.
 *
 * Plus `test/fixtures/chart-fit.md`, which `shippedDecks()` correctly excludes
 * (it is a fixture, not a deck we ship) and which this census correctly wants:
 * it is the family's own hostile corpus, the one `check:chart-fit` renders at
 * all three sizes, and it carries the longest category names in the tree.
 */
function corpus() {
  return [...shippedDecks(), 'test/fixtures/chart-fit.md'];
}

describe('chart label drop census', () => {
  test('no shipped deck drops a name, at any orientation', () => {
    const losses = [];
    let renders = 0;
    for (const file of corpus()) {
      for (const { cls, body, title } of chartSections(file)) {
        for (const orientation of ORIENTATIONS) {
          const drops = dropsFor(body, cls, orientation);
          if (drops === null) continue;
          renders++;
          for (const d of drops) losses.push(`${file} → "${title}" [${cls}, ${orientation}]\n      ${d}`);
        }
      }
    }

    // A census that swept nothing passes vacuously. The corpus is ~1,500
    // renders; a floor well under that catches a broken walk without pinning
    // a number that moves every time a deck is added.
    assert.ok(renders > 800, `census swept only ${renders} chart renders — the corpus walk is broken`);

    assert.deepEqual(
      losses, [],
      `\n  ${losses.length} name(s) silently dropped in the shipped corpus:\n    ${losses.join('\n    ')}\n\n`
      + '  A dropped name is invisible: the chart looks finished and the name is simply gone.\n'
      + '  Fix the slide (fewer or shorter names, a split, a different component) or the\n'
      + '  sizing that made it stop fitting — do not widen this census.\n',
    );
  });

  // ── Detector arms ────────────────────────────────────────────────────
  // These prove the arm above can fail, and that the patches are live.

  test('DETECTOR: placeLabels drop is visible to this census', () => {
    // Five three-line names inside ONE quadrant — the shape HIDE-OVERLAP's own
    // docblock names as unlayoutable, at the shipped font size. No constant is
    // poked: this rides the public transform, so it keeps working if the
    // kernel's internals are rewritten.
    const body = `
## Hostile.

- Strategic Bets
  - Comprehensive quarterly revenue recognition overhaul \`3, 70\`
  - Consolidated multi-region settlement reconciliation \`3.2, 72\`
  - Automated counterparty exposure attestation service \`3.4, 74\`
  - Distributed ledger provenance verification program \`3.1, 71\`
  - Enterprise-wide procurement rationalization mandate \`3.3, 73\`
- Quick Wins
- Defer
- Time Sinks
`;
    const drops = dropsFor(body, 'quadrant', 'landscape');
    assert.ok(drops && drops.length > 0, 'the hostile quadrant dropped nothing — placeLabels instrumentation is not installed');
    assert.ok(drops.every((d) => d.startsWith('placeLabels:')), `expected placeLabels drops, got:\n  ${drops.join('\n  ')}`);
  });

  test('DETECTOR: category gap-cull is visible to this census', () => {
    // Twenty rows in a 180-unit viewBox puts the band pitch below one line
    // height, where the gap cull is the documented behavior.
    const body = `## Hostile.\n\n${
      Array.from({ length: 20 }, (_, i) => `- Business unit number ${i + 1} \`${10 + i}\``).join('\n')}`;
    const drops = dropsFor(body, 'bar', 'landscape');
    assert.ok(drops && drops.length > 0, 'the 20-row bar culled nothing — buildCategoryLabels instrumentation is not installed');
    assert.ok(drops.every((d) => d.startsWith('categoryCull:')), `expected categoryCull drops, got:\n  ${drops.join('\n  ')}`);
  });

  test('a blanked interior tick is thinning, not loss', () => {
    // `line` blanks an interior category itself. The point stays plotted, so
    // this must NOT register — the arm that keeps the counter honest.
    const body = `
## Category names long enough to overhang the plot edge.

- Financial Year 2024 (restated) \`4.2\`
- Financial Year 2025 (restated) \`5.1\`
- Financial Year 2026 (forecast) \`6.4\`
`;
    for (const orientation of ORIENTATIONS) {
      assert.deepEqual(
        dropsFor(body, 'line', orientation), [],
        `a blanked interior tick registered as a dropped name at ${orientation}`,
      );
    }
  });
});
