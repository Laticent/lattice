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
 * `mirrored`. The list can only shrink, and it is currently EMPTY: all ten
 * rows are probed. That is the difference between this and the assertion it
 * replaces, which certified all ten rows and verified none.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const { LEDGER } = require(path.join(ROOT, 'lib/core/marp-fidelity.js'));
const latticeEngine = require(path.join(ROOT, 'lib/engine'));

// The BUNDLE, not `lib/runtime/index.js`. A preview loads the bundle, and the
// bundle is what the ledger's promise is about; the source is one build step
// away from it. `dist/` is generated (`.gitignore`), built by `npm run build`
// and by `prepare` on install — the same undeclared prerequisite three
// `test/integration/parity/**` specs and `test/unit/parsing/source-parse.test.js`
// already rely on.
//
// KNOW WHAT THAT COSTS LOCALLY. Reading the bundle means this test measures
// whatever was last BUILT, not what is in `lib/runtime/**` right now, and
// nothing at either hook rebuilds it: `build:check` is
// `tools/build.js --check --exclude-uncommitted`, and the runtime bundle is
// marked `uncommitted: true` (tools/build.js:87), so it is skipped by
// construction. Measured: with the #1858 bug reintroduced in the source and a
// stale-but-fixed bundle on disk, this file passes 16/16. CI closes it — the
// `unit` job runs `npm run build` before `npm test` — so a regression cannot
// MERGE, but `npm test` on its own is not proof after a runtime edit. Run
// `npm run build` (or at least `node tools/build-runtime.js`) first.
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');

/**
 * The runtime's input: the same slide body as plain markdown-it output, wrapped in
 * the section marp-core would put it in.
 *
 * DERIVED, NOT HAND-WRITTEN, and that is the point. An earlier cut of this file
 * hand-authored each `markup` string "as marp-core emits it" — a claim nothing in
 * this repo can check, since marp-core is not a dependency here. Two things went
 * wrong with that immediately: a glossary probe was authored with flat `<li>`s when
 * the layout needs nested ones, and the deep-nesting probe compared an engine tree
 * carrying markdown-it's inter-element newlines against a hand-written one with
 * none — a whitespace artifact reported as a fidelity failure.
 *
 * marp-core is built on markdown-it, so its list, table and inline output for this
 * content is markdown-it's. Deriving both sides from ONE body means a probe cannot
 * be made to pass by writing its input more conveniently than reality.
 */
const md = new MarkdownIt();
const marpShaped = (cls, body) => `<section class="${cls}">${md.render(body)}</section>`;

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
async function renderRuntime(markup, frontMatter) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${markup}</body></html>`, {
    url: 'https://example.test/deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  // The runtime derives the sibling `.md` from the document URL and fetches it for
  // the deck-level registers. Stubbing is not optional — an unstubbed fetch makes
  // the result depend on the network. A probe whose claim IS a deck-level register
  // supplies that front matter here; everything else refuses, so a transform that
  // quietly started depending on one would fail rather than reach out.
  dom.window.fetch = frontMatter
    ? () => Promise.resolve({ ok: true, text: () => Promise.resolve(frontMatter) })
    : () => Promise.reject(new Error('no network in this test'));
  const el = dom.window.document.createElement('script');
  el.textContent = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 300));
  return dom.window.document;
}

const cls = (el) => el.className.split(/\s+/).filter(Boolean).sort().join(' ');

/**
 * A wrapped mark, PLUS the text of the element that hosts it.
 *
 * The host text is not decoration — without it the probe cannot see the harm
 * #1858 actually caused. A transform that builds the right badge and APPENDS it
 * instead of replacing the item's contents leaves `[ ] Criterion A` sitting on
 * the slide beside a correct-looking badge; reading only `.badge` returns an
 * identical array either way, and the comparison passes while a reader is
 * looking at raw markdown. Measured: `li.replaceChildren(…)` mutated to
 * `li.append(…)` is invisible to the badge alone and caught by the host.
 */
const marked = (sel) => (doc) =>
  [...doc.querySelectorAll(sel)].map((m) => {
    const host = m.closest('li,td') || m.parentElement;
    // Whitespace RUNS collapse to one space. The engine's HTML carries markdown-it's
    // newlines between an item's own content and a nested list; the same tree built
    // in jsdom does not. That is serialization, not fidelity — one of the four
    // documented divergences — and it is the only thing that separated an otherwise
    // identical five-badge comparison. Collapsing runs does NOT weaken the guard the
    // host text exists for: the append-mutant it catches differs by having whole
    // extra WORDS (`[ ] Criterion ACriterion A`), not by spacing, and it is still
    // caught with this normalization in place.
    const text = (n) => (n ? n.textContent : '').replace(/\s+/g, ' ').trim();
    return `${cls(m)}|${m.textContent.trim()}|host:${text(host)}`;
  });

/** The component tokens on a section — the answer a component-resolution row claims. */
const COMPONENT_NAMES = new Set(require(path.join(ROOT, 'lib/core/resolve-component')).COMPONENT_NAMES);

/**
 * One entry per `mirrored` ledger row that can be compared today.
 * `deck` is authored markdown; `markup` is the same content as marp-core emits
 * it, BEFORE any lattice transform; `probe` projects the claimed output out of
 * a rendered document; `min` is the anti-vacuity floor.
 */
const PROBES = {
  verdictGridBadges: {
    min: 4,
    section: 'verdict-grid',
    // The last nested item of each card carries a marker and NO prose line follows
    // it. That is #1858's exact shape: legal markdown the card convention does not
    // cover, where `slice(0, -1)` silently ate the final badge.
    body: [
      '## Grid', '',
      '- **Option one.**', '  - [ ] Criterion A', '  - [-] Criterion B',
      '- **Option two.**', '  - [x] Criterion A', '  - [/] Criterion B',
    ].join('\n'),
    probe: marked('.badge'),
  },

  // A SECOND probe for the same row, on the shapes the first cannot reach. The first
  // uses one bullet list at depth 2 — the shape every committed deck uses, and
  // therefore the shape a divergence can hide behind forever. All three of these read
  // raw `[x]` to a reader through the runtime while the engine badged them, and none
  // of it was #1858's slice: the engine's rule is list-kind-agnostic and
  // depth-unbounded (`bullet_list_open` OR `ordered_list_open`, `listDepth >= 2`)
  // where the runtime read `ul` only, one level down, through `textContent`.
  'verdictGridBadges@shapes': {
    row: 'verdictGridBadges',
    min: 5,
    section: 'verdict-grid',
    body: [
      '## Grid', '',
      '1. **Numbered card.**',        // ordered OUTER list
      '   - [x] Bullet criterion',
      '- **Bullet card.**',
      '  1. [-] Numbered criterion',  // ordered INNER list
      '- **Deep card.**',
      '  - [x] Criterion with children',
      '    - [-] Sub criterion',      // THIRD nesting level
      '    - [/] Second sub',
    ].join('\n'),
    probe: marked('.badge'),
  },

  obligationMatrixBadges: {
    min: 4,
    section: 'obligation-matrix',
    body: [
      '## Duties', '',
      '| Duty | Us | Them |', '|---|---|---|',
      '| Notify | [x] | [ ] |', '| Audit | [-] | [/] |',
    ].join('\n'),
    probe: marked('td .state'),
  },

  checklistItemStates: {
    min: 4,
    section: 'checklist',
    body: [
      '## Ship list', '',
      '- [x] Contracts signed', '- [ ] Data migrated',
      '- [-] Runbook drafted', '- [/] Legal sign-off',
    ].join('\n'),
    // The marker becomes CLASSES ON THE <li> here rather than a wrapper span, so the
    // probe reads the class list and the stripped text together — a transform that
    // set the right classes but forgot to strip the marker passes a class-only probe.
    probe: (doc) =>
      [...doc.querySelectorAll('li.state')].map((li) => `${cls(li)}|${li.textContent.trim()}`),
  },

  listTabularMarks: {
    min: 5,
    section: 'list-tabular',
    body: [
      '## Ledger', '',
      '1. Contracts', '   - Signed by both parties.', '   - [x] `stable`',
      '2. Migration', '   - Data moved.', '   - [ ] `draft`',
      '3. Runbook', '   - Half written.', '   - [-] `beta`',
      '4. Sign-off', '   - Dropped.', '   - [/] `parked`',
      '5. Notes', '   - No marker on this one.', '   - `internal`',
    ].join('\n'),
    // Three things have to agree, so the probe reads all three: the <li> is tagged
    // `marks`, the disc span carries the right state classes (or is absent, for the
    // pills-only row), and the typed marker is STRIPPED from the text. A transform
    // that tagged the row but left `[x]` on the slide passes a class-only probe —
    // and a typed marker on a rendered surface is the whole reason this exists
    // (HARD RULE #29).
    probe: (doc) =>
      [...doc.querySelectorAll('li.marks')].map((li) => {
        const disc = li.querySelector(':scope > .state');
        return `${disc ? cls(disc) : '-'}|${li.textContent.trim()}`;
      }),
  },

  matrixGridCells: {
    min: 6,
    section: 'matrix-grid',
    // The positional grammar this layout defines is `[x]` / `[-]` / `[ ]`
    // (matrix-grid.docs.md) — one `[x]` per row, a filled cell's trailing text is its
    // label. `[/]` is NOT part of it; a first draft used it, the engine emitted
    // nothing for those cells, and the anti-vacuity floor is what said so rather than
    // a green comparison of two short lists.
    body: [
      '## Levels', '',
      '| Level | Self | Team | Org |', '|---|---|---|---|',
      '| Advanced | [ ] | [-] | [x] Lead |',
      '| Beginner | [x] Junior | [-] | [ ] |',
    ].join('\n'),
    probe: marked('.cell'),
  },

  slotLabelLift: {
    min: 3,
    section: 'premise',
    body: [
      '## Where we stand', '',
      '- Market. Buyers consolidated onto two vendors.',
      '- Product. Our retention leads the category.',
      '- Risk. One contract carries a third of revenue.',
    ].join('\n'),
    // Same host-text reasoning as `marked`: a lift that creates the <strong> but
    // leaves the original `Market.` text beside it is invisible to the label alone.
    probe: (doc) =>
      [...doc.querySelectorAll('li > strong')].map(
        (el) => `${el.textContent.trim()}|host:${el.parentElement.textContent.trim()}`,
      ),
  },

  glossaryListToTable: {
    min: 4,
    section: 'glossary',
    // NESTED bullets — outer li is the term, inner li its one-line definition
    // (glossary.docs.md, and HARD RULE #5). A flat `- ARR. Annual recurring revenue.`
    // is not a glossary entry: the engine leaves the row unsplit, and a first draft
    // compared two identical un-split lists and would have passed while proving
    // nothing about the transform.
    body: [
      '## Terms', '',
      '- ARR', '  - Annual recurring revenue.',
      '- CAC', '  - Cost to acquire a customer.',
      '- NRR', '  - Net revenue retention.',
    ].join('\n'),
    probe: (doc) =>
      [...doc.querySelectorAll('tr')].map((r) =>
        [...r.children].map((c) => c.textContent.trim()).join('|'),
      ),
  },

  glossaryRange: {
    min: 1,
    section: 'glossary',
    // The pill is DERIVED from the first and last term, not authored, so this is a
    // real test of the derivation. Terms go in alphabetical order because the
    // transform reads position, not sort order (glossary.docs.md).
    body: [
      '## Bands', '',
      '- Anchor', '  - A slide that orients the audience.',
      '- Cadence', '  - How much new information per slide.',
      '- Zone', '  - The region a deck is scoped to.',
    ].join('\n'),
    probe: (doc) => [...doc.querySelectorAll('.range-pill')].map((p) => p.textContent.trim()),
  },

  deckClassPropagate: {
    min: 1,
    section: 'content',
    // A DECK-LEVEL register: `class:` in front matter lands on every section. The
    // runtime does not read it from the markup — it fetches the sibling `.md` — so
    // this probe supplies that fetch, which is the plumbing that made the row look
    // un-probeable. It is the only reason it sat in AWAITING_PROBE.
    body: '## Title\n\nBody.',
    deck: ['---', 'theme: indaco', 'class: dark', '---', '', '<!-- _class: content -->', '', '## Title', '', 'Body.'].join('\n'),
    frontMatter: ['---', 'theme: indaco', 'class: dark', '---', '', '## Title', '', 'Body.', ''].join('\n'),
    // SORTED, and that is load-bearing. Measured, the engine emits `content dark
    // form` and the runtime `content form dark` — the same set applied in a different
    // order. Order is not what `mirrored` promises here; membership is.
    probe: (doc) => [...doc.querySelectorAll('section')].map((sec) => cls(sec)),
  },

  defaultComponent: {
    min: 1,
    section: '',
    // A slide naming no component at all. The default is resolved from the deck's
    // front matter, so this needs the same fetch as the row above.
    body: '## Title\n\nBody.',
    deck: ['---', 'theme: indaco', '---', '', '## Title', '', 'Body.'].join('\n'),
    frontMatter: ['---', 'theme: indaco', '---', '', '## Title', '', 'Body.', ''].join('\n'),
    probe: (doc) =>
      [...doc.querySelectorAll('section')].map((sec) =>
        [...sec.classList].filter((c) => COMPONENT_NAMES.has(c)).sort().join(' '),
      ),
  },

  'imagery prose → the .image-text panel': {
    min: 1,
    section: 'image',
    // A `topic` row rather than a `plugin` row. It was listed as needing a real
    // background image and the layout measurement after it — it does not:
    // `wrapImageTextToDom` is pure DOM, folding the slide's prose into a panel and
    // leaving an image-only slide alone. jsdom is enough.
    body: '![bg](./photo.jpg)\n\n## The site today\n\nTwo thirds of the floor is unused after the move.',
    // The runtime's input carries no `![bg]`: on the engine side that image is lifted
    // out of the prose flow before this transform sees it, and marp-core's own
    // advanced-background machinery takes it on the export side. What the row claims
    // is which PROSE nodes get folded, so the probe compares that structure.
    markup: '<section class="image"><h2>The site today</h2>' +
      '<p>Two thirds of the floor is unused after the move.</p></section>',
    probe: (doc) =>
      [...doc.querySelectorAll('.image-text')].map((p) =>
        [...p.children].map((c) => `${c.tagName}:${c.textContent.trim()}`).join('|'),
      ),
  },
};

/**
 * `mirrored` rows with no comparison yet, and why. FAILS ON A STALE ENTRY, so
 * the list can only shrink: an entry here that has gained a probe, or that no
 * longer reads `mirrored`, is an error.
 */
const AWAITING_PROBE = {
  // EMPTY, and the mechanism stays. All ten `mirrored` rows now render through both
  // paths and compare. The three that were listed here were listed because a first
  // pass believed them un-probeable, and all three reasons were wrong: the two
  // deck-level registers just needed the front-matter fetch the harness now
  // supplies, and the imagery row needed no image and no measurement at all —
  // `wrapImageTextToDom` is pure DOM. Keeping an empty list is the point: a new
  // `mirrored` row with no probe must either get one or land here with a reason,
  // and a reason in a diff is a thing a reviewer can disagree with.
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
      const probed = PROBES[k] || Object.values(PROBES).some((p) => p.row === k);
      assert.ok(
        probed || AWAITING_PROBE[k],
        `${k} claims to be mirrored with no probe and no declared reason — a claim nothing checks`,
      );
    }
  });

  await t.test('the awaiting-probe list is not stale', () => {
    for (const k of Object.keys(AWAITING_PROBE)) {
      const row = mirrored.find((e) => key(e) === k);
      assert.ok(row, `${k} is listed as awaiting a probe but no longer claims to be mirrored — drop it`);
      assert.ok(
        !PROBES[k] && !Object.values(PROBES).some((p) => p.row === k),
        `${k} now has a probe — remove it from AWAITING_PROBE`,
      );
    }
  });

  await t.test('every probe names a real mirrored row', () => {
    for (const k of Object.keys(PROBES)) {
      // A probe may carry a `row` when several probes cover one ledger row from
      // different angles — one shape per probe reads better than one probe with a
      // deck that tries to be every shape at once.
      const row = PROBES[k].row || k;
      assert.ok(
        mirrored.some((e) => key(e) === row),
        `there is a probe for ${row}, which is not a mirrored ledger row`,
      );
    }
  });

  for (const [k, spec] of Object.entries(PROBES)) {
    await t.test(`${k} — the engine and the runtime bundle render the same thing`, async () => {
      // ONE body, two renderings. `deck` and `markup` are derived unless a probe
      // overrides them — `deck` when the claim needs front matter, `markup` when the
      // runtime legitimately receives something different from what the author wrote.
      const deck = spec.deck || `<!-- _class: ${spec.section} -->\n\n${spec.body}`;
      const markup = spec.markup || marpShaped(spec.section, spec.body);
      const engineOut = spec.probe(renderEngine(deck));
      assert.ok(
        engineOut.length >= spec.min,
        `the engine produced ${engineOut.length} of the thing ${k} claims (floor ${spec.min}) — ` +
          'the deck or the probe selector is wrong, and without this the comparison below would ' +
          'be two empty arrays passing forever',
      );
      const runtimeOut = spec.probe(await renderRuntime(markup, spec.frontMatter));
      assert.deepEqual(
        runtimeOut,
        engineOut,
        `${k} is claimed as mirrored, but the runtime bundle renders something else. ` +
          'A reader of the VS Code Marp preview does not see what a reader of the engine render sees.',
      );
    });
  }
});
