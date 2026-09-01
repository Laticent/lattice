/**
 * THE `mirrored` LEDGER CLAIM, ATTESTED BY RENDERED OUTPUT.
 *
 * `lib/core/marp-fidelity.js` records, per markdown-it plugin, whether the
 * runtime reproduces it for the VS Code Marp preview. A `mirrored` row is a
 * promise that a reader of the preview sees what a reader of the engine's
 * render sees. Until this file, that promise was checked like this:
 *
 *     assert.ok(RUNTIME_SRC.includes(`${e.via}(`))
 *
 * — a claim that a function OF THAT NAME is called somewhere in the runtime
 * source. It renders nothing and compares nothing, so it CANNOT FAIL FOR THE
 * RIGHT REASON. It also read `lib/runtime/index.js`, the source, rather than
 * `dist/lattice-runtime.js`, the bundle a preview actually loads.
 *
 * WHAT IT LET THROUGH (#1858). `transformVerdictGridBadges` dropped the last
 * nested item of every card — `innerItems.slice(0, -1)` — on the assumption
 * that it is body prose. That is the card CONVENTION, not the card GRAMMAR,
 * and the engine never shared it: `verdictGridBadges` tests each item against
 * the marker regex. Every committed deck follows the convention, so the two
 * agreed everywhere anyone looked. Where an author ends a card on a marker
 * row, they did not: measured 4 badges from the engine against 2 from the
 * runtime, with `[-] Criterion B` left on the reader's slide as literal
 * markdown. The name-match was green throughout, and was always going to be:
 * the function existed and was called. It was just wrong.
 *
 * SO A CLAIM IS NOW A COMPARISON. Each `mirrored` row registers a PROBE: a
 * deck, the marp-core-shaped markup the same content arrives as before any
 * lattice transform has run, and a function pulling out the thing that row is
 * responsible for. The deck goes through `lib/engine`; the markup is booted
 * through the real `dist/lattice-runtime.js` in jsdom; the two projections
 * must be equal.
 *
 * WHY A PROJECTION AND NOT THE WHOLE DOCUMENT. The two trees differ in four
 * ways that are not fidelity defects — the runtime adds its own bookkeeping
 * attributes (`data-lattice-slide`, `data-lattice-overflow-marker`), jsdom
 * serializes a boolean attribute as `attr=""` where the engine emits `attr`,
 * the input's own whitespace survives into the runtime tree, and there is a
 * leading newline. Whole-document equality would have to normalize all four,
 * and each normalization is a place to accidentally erase a real difference.
 * A probe scoped to what the row CLAIMS is narrower and says what it checked.
 *
 * EVERY PROBE CARRIES AN ANTI-VACUITY FLOOR. Two empty arrays are equal. A
 * probe whose markup is subtly wrong, or whose selector stops matching,
 * degrades to comparing nothing against nothing and passes forever — the
 * exact failure this file exists to end. So each probe asserts the ENGINE
 * produced at least `min` of the thing before the two are compared.
 *
 * A ROW WITH NO PROBE IS A GAP, NOT A PASS. `AWAITING_PROBE` lists the rows
 * that have no comparison yet, each with the reason, and the test fails on a
 * stale entry — a row that has since gained a probe, or that no longer claims
 * `mirrored`. The list can only shrink. That is the difference between this
 * and the assertion it replaces: the old one certified all ten rows and
 * verified none, while this one verifies seven and says out loud that three
 * are unverified.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const { LEDGER } = require(path.join(ROOT, 'lib/core/marp-fidelity.js'));
const latticeEngine = require(path.join(ROOT, 'lib/engine'));

// The BUNDLE, not `lib/runtime/index.js`. A preview loads the bundle, and the
// bundle is what the ledger's promise is about; the source is one build step
// away from it. `dist/` is generated (`.gitignore`), built by `npm run build`
// and by `prepare` on install — the same undeclared prerequisite three
// `test/integration/parity/**` specs and `test/unit/parsing/source-parse.test.js`
// already rely on.
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');

/** Render markdown through the owned engine and hand back a queryable document. */
function renderEngine(deck) {
  return new JSDOM(latticeEngine.createEngine().render(deck).html).window.document;
}

/**
 * Boot the real runtime bundle over marp-core-shaped markup and hand back the
 * document it transformed. The harness is the one three parity specs already
 * use (`test/integration/parity/runtime-overflow-marker.test.js`), for the
 * reason its docblock gives: the bootstrap is an esbuild IIFE with no exports
 * and no global, so nothing can `require` it — it has to be run.
 */
async function renderRuntime(markup) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${markup}</body></html>`, {
    url: 'https://example.test/deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  // Not optional: the runtime fetches the sibling `.md` for front matter, and an
  // unstubbed fetch makes the result depend on the network.
  dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
  const el = dom.window.document.createElement('script');
  el.textContent = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 300));
  return dom.window.document;
}

const cls = (el) => el.className.split(/\s+/).filter(Boolean).sort().join(' ');

/**
 * One entry per `mirrored` ledger row that can be compared today.
 * `deck` is authored markdown; `markup` is the same content as marp-core emits
 * it, BEFORE any lattice transform; `probe` projects the claimed output out of
 * a rendered document; `min` is the anti-vacuity floor.
 */
const PROBES = {
  verdictGridBadges: {
    min: 4,
    deck: [
      '<!-- _class: verdict-grid -->', '', '## Grid', '',
      '- **Option one.**', '  - [ ] Criterion A', '  - [-] Criterion B',
      '- **Option two.**', '  - [x] Criterion A', '  - [/] Criterion B',
    ].join('\n'),
    // The last nested item of each card carries a marker and NO prose line
    // follows it. That is #1858's exact shape: legal markdown the convention
    // does not cover, where `slice(0, -1)` silently ate the final badge.
    markup: `<section class="verdict-grid"><h2>Grid</h2><ul>
<li><strong>Option one.</strong><ul>
<li>[ ] Criterion A</li><li>[-] Criterion B</li></ul></li>
<li><strong>Option two.</strong><ul>
<li>[x] Criterion A</li><li>[/] Criterion B</li></ul></li></ul></section>`,
    probe: (doc) => [...doc.querySelectorAll('.badge')].map((b) => `${cls(b)}|${b.textContent.trim()}`),
  },

  obligationMatrixBadges: {
    min: 4,
    deck: [
      '<!-- _class: obligation-matrix -->', '', '## Duties', '',
      '| Duty | Us | Them |', '|---|---|---|',
      '| Notify | [x] | [ ] |', '| Audit | [-] | [/] |',
    ].join('\n'),
    markup: `<section class="obligation-matrix"><h2>Duties</h2><table>
<thead><tr><th>Duty</th><th>Us</th><th>Them</th></tr></thead>
<tbody><tr><td>Notify</td><td>[x]</td><td>[ ]</td></tr>
<tr><td>Audit</td><td>[-]</td><td>[/]</td></tr></tbody></table></section>`,
    probe: (doc) => [...doc.querySelectorAll('td .state')].map((s) => `${cls(s)}|${s.textContent.trim()}`),
  },

  checklistItemStates: {
    min: 4,
    deck: [
      '<!-- _class: checklist -->', '', '## Ship list', '',
      '- [x] Contracts signed', '- [ ] Data migrated', '- [-] Runbook drafted', '- [/] Legal sign-off',
    ].join('\n'),
    markup: `<section class="checklist"><h2>Ship list</h2><ul>
<li>[x] Contracts signed</li><li>[ ] Data migrated</li>
<li>[-] Runbook drafted</li><li>[/] Legal sign-off</li></ul></section>`,
    // The marker becomes CLASSES ON THE <li> here, not a wrapper span, so the
    // probe reads the class list and the stripped text together — a transform
    // that set the right classes but forgot to strip the marker would pass a
    // class-only probe.
    probe: (doc) => [...doc.querySelectorAll('li.state')].map((li) => `${cls(li)}|${li.textContent.trim()}`),
  },

  matrixGridCells: {
    min: 6,
    // The positional grammar this layout actually defines is `[x]` / `[-]` / `[ ]`
    // (matrix-grid.docs.md) — one `[x]` per row, and a filled cell's trailing text
    // is its label. `[/]` is NOT part of it; a first draft of this probe used it,
    // the engine emitted nothing for those cells, and the anti-vacuity floor is
    // what said so rather than a green comparison of two short lists.
    deck: [
      '<!-- _class: matrix-grid -->', '', '## Levels', '',
      '| Level | Self | Team | Org |', '|---|---|---|---|',
      '| Advanced | [ ] | [-] | [x] Lead |',
      '| Beginner | [x] Junior | [-] | [ ] |',
    ].join('\n'),
    markup: `<section class="matrix-grid"><h2>Levels</h2><table>
<thead><tr><th>Level</th><th>Self</th><th>Team</th><th>Org</th></tr></thead>
<tbody><tr><td>Advanced</td><td>[ ]</td><td>[-]</td><td>[x] Lead</td></tr>
<tr><td>Beginner</td><td>[x] Junior</td><td>[-]</td><td>[ ]</td></tr></tbody></table></section>`,
    probe: (doc) => [...doc.querySelectorAll('.cell')].map((c) => `${cls(c)}|${c.textContent.trim()}`),
  },

  slotLabelLift: {
    min: 3,
    deck: [
      '<!-- _class: premise -->', '', '## Where we stand', '',
      '- Market. Buyers consolidated onto two vendors.',
      '- Product. Our retention leads the category.',
      '- Risk. One contract carries a third of revenue.',
    ].join('\n'),
    markup: `<section class="premise"><h2>Where we stand</h2><ul>
<li>Market. Buyers consolidated onto two vendors.</li>
<li>Product. Our retention leads the category.</li>
<li>Risk. One contract carries a third of revenue.</li></ul></section>`,
    probe: (doc) => [...doc.querySelectorAll('li > strong')].map((s) => s.textContent.trim()),
  },

  glossaryListToTable: {
    min: 4,
    // NESTED bullets — outer li is the term, inner li its one-line definition
    // (glossary.docs.md, and HARD RULE #5). A flat `- ARR. Annual recurring
    // revenue.` is not a glossary entry: the engine leaves the row unsplit, and
    // the first draft of this probe compared two identical un-split lists and
    // would have passed while proving nothing about the transform.
    deck: [
      '<!-- _class: glossary -->', '', '## Terms', '',
      '- ARR', '  - Annual recurring revenue.',
      '- CAC', '  - Cost to acquire a customer.',
      '- NRR', '  - Net revenue retention.',
    ].join('\n'),
    markup: `<section class="glossary"><h2>Terms</h2><ul>
<li>ARR<ul><li>Annual recurring revenue.</li></ul></li>
<li>CAC<ul><li>Cost to acquire a customer.</li></ul></li>
<li>NRR<ul><li>Net revenue retention.</li></ul></li></ul></section>`,
    probe: (doc) =>
      [...doc.querySelectorAll('tr')].map((r) =>
        [...r.children].map((c) => c.textContent.trim()).join('|'),
      ),
  },

  glossaryRange: {
    min: 1,
    // The pill is DERIVED from the first and last term, not authored — so the
    // probe is a real test of the derivation, and terms go in alphabetical order
    // because the transform reads position, not sort order (glossary.docs.md).
    deck: [
      '<!-- _class: glossary -->', '', '## Bands', '',
      '- Anchor', '  - A slide that orients the audience.',
      '- Cadence', '  - How much new information per slide.',
      '- Zone', '  - The region a deck is scoped to.',
    ].join('\n'),
    markup: `<section class="glossary"><h2>Bands</h2><ul>
<li>Anchor<ul><li>A slide that orients the audience.</li></ul></li>
<li>Cadence<ul><li>How much new information per slide.</li></ul></li>
<li>Zone<ul><li>The region a deck is scoped to.</li></ul></li></ul></section>`,
    probe: (doc) => [...doc.querySelectorAll('.range-pill')].map((p) => p.textContent.trim()),
  },
};

/**
 * `mirrored` rows with no comparison yet, and why. FAILS ON A STALE ENTRY, so
 * the list can only shrink: an entry here that has gained a probe, or that no
 * longer reads `mirrored`, is an error.
 */
const AWAITING_PROBE = {
  deckClassPropagate:
    'the runtime reads the deck class from front matter it fetches from the sibling .md, so the ' +
    'probe needs the fetch plumbing test/integration/parity/runtime-frontmatter-refire.test.js ' +
    'was written for, not a static markup string',
  defaultComponent:
    'same front-matter supply path as deckClassPropagate — the default component is a deck-level ' +
    'declaration, not something a single section carries',
  'imagery prose → the .image-text panel':
    'a topic row rather than a plugin row; the runtime side needs a real background image and the ' +
    'layout measurement that follows it, which jsdom does not do',
};

test('marp fidelity — a `mirrored` claim is attested by rendered output', async (t) => {
  const mirrored = LEDGER.filter((e) => e.coverage === 'mirrored');
  const key = (e) => e.plugin || e.topic;

  await t.test('the bundle under test exists', () => {
    assert.ok(
      fs.existsSync(RUNTIME_BUNDLE),
      `${RUNTIME_BUNDLE} is missing — run \`npm run build\` (it is generated, not committed)`,
    );
  });

  await t.test('every mirrored row either has a probe or is a declared gap', () => {
    // Anti-vacuity for the file as a whole: if the ledger were empty or the
    // coverage string were renamed, every per-probe test below would silently
    // stop running.
    assert.ok(mirrored.length >= 10, `expected >=10 mirrored rows, found ${mirrored.length}`);
    for (const e of mirrored) {
      const k = key(e);
      assert.ok(
        PROBES[k] || AWAITING_PROBE[k],
        `${k} claims to be mirrored with no probe and no declared reason — a claim nothing checks`,
      );
    }
  });

  await t.test('the awaiting-probe list is not stale', () => {
    for (const k of Object.keys(AWAITING_PROBE)) {
      const row = mirrored.find((e) => key(e) === k);
      assert.ok(row, `${k} is listed as awaiting a probe but no longer claims to be mirrored — drop it`);
      assert.ok(!PROBES[k], `${k} now has a probe — remove it from AWAITING_PROBE`);
    }
  });

  await t.test('every probe names a real mirrored row', () => {
    for (const k of Object.keys(PROBES)) {
      assert.ok(
        mirrored.some((e) => key(e) === k),
        `there is a probe for ${k}, which is not a mirrored ledger row`,
      );
    }
  });

  for (const [k, spec] of Object.entries(PROBES)) {
    await t.test(`${k} — the engine and the runtime bundle render the same thing`, async () => {
      const engineOut = spec.probe(renderEngine(spec.deck));
      assert.ok(
        engineOut.length >= spec.min,
        `the engine produced ${engineOut.length} of the thing ${k} claims (floor ${spec.min}) — ` +
          'the deck or the probe selector is wrong, and without this the comparison below would ' +
          'be two empty arrays passing forever',
      );
      const runtimeOut = spec.probe(await renderRuntime(spec.markup));
      assert.deepEqual(
        runtimeOut,
        engineOut,
        `${k} is claimed as mirrored, but the runtime bundle renders something else. ` +
          'A reader of the VS Code Marp preview does not see what a reader of the engine render sees.',
      );
    });
  }
});
