/**
 * TWO COMPONENTS CANNOT BOTH OWN A CLASS TOKEN.
 *
 * A component is selected by its id as a class (`_class: stats` → `section.stats`),
 * and a component VARIANT is a second bare token on the same attribute
 * (`_class: math stats` → `section.math.stats`). Nothing in the naming scheme keeps
 * those two namespaces apart, so a variant token can collide with a component id and
 * pull that component's whole stylesheet onto a slide it was never written for.
 *
 * FOUR SUCH COLLISIONS EXIST. This file is their ledger: one is guarded, three are
 * recorded as pre-existing (#2132), and a fifth fails the first test below.
 *
 * The guarded one is `stats`, claimed by both `evidence/stats` and the `math`
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
 * THE LEDGER. Four component-id / variant-token collisions exist in the tree, and the
 * split between them is the point of this file: one is GUARDED, three are RECORDED and
 * pre-existing. A FIFTH fails this test rather than shipping as a silent style leak —
 * which is what the `stats` one did for as long as it was structurally impossible to
 * observe.
 *
 * How much each actually leaks was MEASURED, not reasoned about: render the variant's
 * own committed sample, extract every selector naming the colliding component out of
 * the built bundle, and ask the browser which of them match an element on that slide.
 * The counts below are that measurement. (`status: 'latent'` means zero matched, so the
 * hazard is real and the damage today is none — exactly what `stats` looked like before
 * math took a `.cell-stage`.)
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
    status: 'latent',
    // Measured: 0 of 12 candidate selectors match a `list principles bullet` slide.
    issue: 2132,
  },
  decision: {
    variantOwner: 'compare-prose',
    componentOwner: 'decision',
    status: 'leaking',
    // Measured: 19 rules from the `decision` COMPONENT match a `compare-prose decision`
    // slide — the stage flex, the h2 size, the whole `> .cell-stage > ul` card strip
    // including its `--decision-accent` categorical cycle, and an `--elevation-berth`
    // padding. Whether any of that is wanted is not knowable from here; it is off the
    // path of the math migration either way (HARD RULE #18).
    issue: 2132,
  },
  quadrant: {
    variantOwner: 'radar',
    componentOwner: 'quadrant',
    status: 'leaking',
    // Measured: 3 rules match a `radar quadrant` slide — two token blocks defining the
    // `--quadrant-*` family, and `container-type: size` on `.chart-body`.
    issue: 2132,
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
    const owns = new RegExp(`(^|[\\s>+~])section[\\w.:()\\[\\]="'^~$*|-]*\\.${k.componentOwner}(?![\\w-])`);
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
