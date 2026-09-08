/**
 * TWO COMPONENTS CANNOT BOTH OWN A CLASS TOKEN.
 *
 * A component is selected by its id as a class (`_class: stats` → `section.stats`),
 * and a component VARIANT is a second bare token on the same attribute
 * (`_class: math stats` → `section.math.stats`). Nothing in the naming scheme keeps
 * those two namespaces apart, so a variant token can collide with a component id and
 * pull that component's whole stylesheet onto a slide it was never written for.
 *
 * FOUR SUCH COLLISIONS EXIST. This file is their ledger: all four are now GUARDED, and a
 * fifth fails the first test below. Three of them were recorded here as pre-existing when
 * `stats` was fixed, and closed by #2132; each was measured before and after against the
 * BUILT bundle, and all six affected slides (the three variant samples and the three
 * component samples) render pixel-identical at 150 DPI across the change — so no leaked
 * rule was load-bearing, and the guard costs no specificity.
 *
 * The FIRST one guarded was `stats`, claimed by both `evidence/stats` and the `math`
 * component's variant, and it was INVISIBLE until math moved onto the Form frame. `evidence/stats` scopes almost everything to `> .cell-stage`, and a sovereign
 * math slide had no stage, so only two loose rules (`section.stats h2`,
 * `section.stats h3`) ever reached one, and math declared the same title centering
 * itself. The wrap gave every math slide a stage and a `.form` class, and the sheet
 * landed in full: a centered masthead lede, and `font-style: italic` +
 * `padding-bottom: var(--sp-lg)` on the estimate and the interpretation line —
 * properties math does not declare, so specificity could not settle it.
 *
 * Two arms, and they check different things.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const COMPONENTS = path.join(ROOT, 'lib/components');

/** Every component id in the tree — a directory holding `<id>.manifest.json`. */
function componentIds() {
  const ids = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = path.join(dir, e.name);
      if (fs.existsSync(path.join(d, `${e.name}.manifest.json`))) ids.add(e.name);
      walk(d);
    }
  };
  walk(COMPONENTS);
  return ids;
}

/** `{ '<component>:<variant>': true }` for every variant token any component declares. */
function variantTokens() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = path.join(dir, e.name);
      const mf = path.join(d, `${e.name}.manifest.json`);
      if (fs.existsSync(mf)) {
        const man = JSON.parse(fs.readFileSync(mf, 'utf8'));
        for (const v of man.variants || []) {
          if (!out.has(v)) out.set(v, []);
          out.get(v).push(e.name);
        }
      }
      walk(d);
    }
  };
  walk(COMPONENTS);
  return out;
}

/**
 * THE LEDGER. Four component-id / variant-token collisions exist in the tree, and all four
 * are GUARDED. A FIFTH fails the first test below rather than shipping as a silent style
 * leak — which is what the `stats` one did for as long as it was structurally impossible to
 * observe.
 *
 * How much each actually leaked was MEASURED, not reasoned about: render the variant's own
 * committed sample, extract every selector naming the colliding component out of the built
 * bundle, and ask the browser which of them match an element on that slide. `leakedBefore`
 * is that measurement, taken with the guard stashed.
 *
 * `leakedBefore: 0` (bullet) is a LATENT collision guarded anyway. Zero is not safety: it is
 * exactly what `stats` measured until math moved onto the Form frame and every math slide
 * gained a `.cell-stage`. A latent collision is one structural change away from a live one,
 * and `:where()` costs no specificity, so the guard is free.
 */
const KNOWN_COLLISIONS = {
  stats: {
    variantOwner: 'math',
    componentOwner: 'stats',
    status: 'guarded',
    guardedFile: 'lib/components/evidence/stats/stats.styles.css',
    guard: ':where(:not(.math))',
    // How many selectors the guard check must see. A filter that starts matching FEWER
    // is the failure this number exists to catch; see the two bugs recorded at the check.
    selectorsChecked: 25,
    // Measured: 4 rules from evidence/stats matched a `math stats` slide before the
    // guard — the masthead lede centering, the stage flex, `section.stats h2`, and
    // `section.stats > .cell-stage > p` (italic + --sp-lg bottom padding on both the
    // estimate and the interpretation line). 0 after.
    leakedBefore: 4,
  },
  bullet: {
    variantOwner: 'list',
    componentOwner: 'bullet',
    status: 'guarded',
    guardedFile: 'lib/components/chart/bullet/bullet.styles.css',
    guard: ':where(:not(.list))',
    selectorsChecked: 11,
    // Measured 0 before AND 0 after: this one was LATENT, and it is guarded anyway.
    // `stats` measured zero too, right up until math moved onto the Form frame and every
    // math slide gained a `.cell-stage` — a latent collision is one structural change away
    // from a live one, and the guard costs nothing (#2132).
    leakedBefore: 0,
  },
  decision: {
    variantOwner: 'compare-prose',
    componentOwner: 'decision',
    status: 'guarded',
    guardedFile: 'lib/components/comparison/decision/decision.styles.css',
    guard: ':where(:not(.compare-prose))',
    selectorsChecked: 25,
    // Measured against the BUILT bundle, the way this ledger's counts always are: 16 of 53
    // selectors naming `.decision` matched a `compare-prose decision` slide before, 6 after.
    // All 25 in `decision.styles.css` are now guarded and none of them reaches the slide.
    //
    // THE SIX THAT REMAIN ARE NOT A LEAK, and the distinction is why this took a render to
    // settle. Three are `compare-prose`'s OWN rules (`section.compare-prose.decision …`) —
    // its variant, its sheet. The other three live in `compare-prose.styles.css` and name
    // `section.decision` DELIBERATELY, beside `section.compare-prose`, in one rule list: its
    // own comment says "decision and compare-prose lift the leading text of each top-level
    // <li> into a flush top-left corner tag — same recipe". A shared recipe authored in the
    // variant owner's own sheet is not a component's stylesheet reaching a slide it was never
    // written for, which is what this file is about.
    leakedBefore: 16,
  },
  quadrant: {
    variantOwner: 'radar',
    componentOwner: 'quadrant',
    status: 'guarded',
    guardedFile: 'lib/components/chart/quadrant/quadrant.styles.css',
    guard: ':where(:not(.radar))',
    selectorsChecked: 37,
    // Measured: 3 of 42 before, 1 after. The one left is `chart-family.css`'s
    // `section.form.quadrant:not(.claim-hero):not(.claim-bleed) .chart-body {
    // container-type: size }` — the rule the issue called the sharp edge — and it is not a
    // leak either: the line directly above it is `section.form.radar…` with the identical
    // declaration, so a `radar quadrant` slide gets `container-type: size` from its OWN arm
    // whether or not the quadrant one matches.
    leakedBefore: 3,
  },
};

test('every component-id / variant-token collision is known and accounted for', () => {
  const ids = componentIds();
  const variants = variantTokens();
  const found = [];
  for (const [token, owners] of variants) {
    if (ids.has(token)) found.push({ token, variantOwners: owners });
  }
  for (const f of found) {
    const known = KNOWN_COLLISIONS[f.token];
    assert.ok(
      known,
      `NEW COLLISION: the variant token \`${f.token}\` (declared by ${f.variantOwners.join(', ')}) `
      + `is also the component id \`${f.token}\`. A slide authored \`_class: ${f.variantOwners[0]} ${f.token}\` `
      + 'picks up every rule in that component\'s stylesheet its structure happens to match. '
      + 'Measure the leak, then either rename the variant, guard the component sheet the way '
      + 'lib/components/evidence/stats/stats.styles.css does, or record it here with its count.',
    );
    assert.ok(
      f.variantOwners.includes(known.variantOwner),
      `${f.token}: expected the variant owner to be ${known.variantOwner}, got ${f.variantOwners.join(', ')}`,
    );
  }
  // And the reverse: an entry here that no longer describes a real collision is stale.
  for (const token of Object.keys(KNOWN_COLLISIONS)) {
    assert.ok(
      found.some((f) => f.token === token),
      `${token} is listed as a known collision but is no longer both a component id and a variant token — `
      + 'delete the entry, and the guard it names if it has one.',
    );
  }
});

test('the guarded component sheet carries its guard on EVERY section selector', () => {
  // A guard on some selectors and not others is worse than none: it makes the leak
  // intermittent and structure-dependent, which is exactly how this one hid.
  for (const [token, k] of Object.entries(KNOWN_COLLISIONS)) {
    if (k.status !== 'guarded') continue; // recorded, not guarded — see the ledger above
    const css = fs.readFileSync(path.join(ROOT, k.guardedFile), 'utf8');
    // Strip comments — a selector quoted in prose is not a rule.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // TWO WAYS THIS FILTER WAS WRONG, and both let a guarded-looking sheet hide an
    // unguarded rule. Found by an inversion pass, not by the gate.
    //
    //   · `startsWith('section.stats')` misses `section.form.stats …`, because the
    //     component token does not have to come first. Measured against the sheet this
    //     gate exists for, the old filter checked 24 of 25 top-level selectors, and the
    //     ONE it never saw was
    //     `section.form.stats:where(:not(.math)) .cell-masthead .masthead-lede` — one of
    //     the exact four rules measured leaking onto a math slide, and the visible half
    //     of that bug. It carries the guard today, so the gate was green while blind to
    //     it; anything written that way in future — the NATURAL shape now that
    //     everything is Form — would have escaped silently.
    //   · Splitting the selector list on a bare comma also fragments `:where(a, b)`,
    //     so five more selectors reached the filter cut in half and were dropped for
    //     starting with `[data-family=…` instead.
    //
    // Split on top-level commas only, and match the token anywhere in the compound.
    const splitTop = (sel) => {
      const out = []; let depth = 0; let cur = '';
      for (const ch of sel) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
      }
      out.push(cur);
      return out;
    };
    // A THIRD WAY THIS FILTER WAS BLIND, found by #2132 and the same class as the two above.
    // The chart family anchors its sheets on `:is(section.<name>, figure.chart-frame)` so one
    // rule serves the slide and the docs-site standalone figure — and there `section` is
    // preceded by `(`, which is neither the start of the string nor one of `\s > + ~`. So the
    // filter saw 7 of quadrant's 37 owning selectors and NONE of bullet's 11, which would have
    // certified either sheet as guarded while reading almost none of it. `(` and `,` join the
    // boundary set, and the compound body admits the `,` and whitespace an `:is()` list carries.
    const owns = new RegExp(`(^|[\\s>+~(,])section[\\w.:()\\[\\]="'^~$*|,\\s-]*?\\.${k.componentOwner}(?![\\w-])`);
    const selectors = code.split('}')
      .map((b) => (b.includes('{') ? b.slice(0, b.indexOf('{')) : ''))
      .flatMap(splitTop)
      .map((s) => s.trim())
      .filter((s) => owns.test(s));
    assert.ok(selectors.length > 0, `${k.guardedFile}: found no section selectors owning .${k.componentOwner} to check`);
    // The count is pinned so a future refactor that stops MATCHING is as loud as one
    // that stops guarding — the failure mode above was a filter quietly matching less.
    assert.ok(
      selectors.length >= k.selectorsChecked,
      `${k.guardedFile}: the guard check now sees only ${selectors.length} selectors, was ${k.selectorsChecked}. `
      + 'A filter that matches fewer rules reports a clean sheet by looking away.',
    );
    const unguarded = selectors.filter((s) => !s.includes(k.guard));
    assert.deepEqual(
      unguarded, [],
      `${k.guardedFile}: ${unguarded.length} selector(s) reach a \`${k.variantOwner} ${token}\` slide `
      + `because they lack \`${k.guard}\`:\n  ${unguarded.join('\n  ')}`,
    );
  }
});
