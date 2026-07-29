/**
 * SEMANTIC-STRUCTURE invariants — the landmark/element contract the semantic-HTML
 * ADR depends on (`engineering/decisions/2026-07-03-semantic-html-accessibility.md`
 * §8, gates #1 #3 #4 #5 #8).
 *
 * WHY THIS EXISTS — the ADR's whole design is "retag, don't wrap": promote a
 * structural `<div>` to the native element that carries its role, and leave the
 * presentational boxes alone. That design has two failure modes, and BOTH are
 * silent — nothing renders differently when either happens:
 *
 *   • UNDER-tagging rots forward: a new component ships div-soup and no gate
 *     notices, so the landmark skeleton decays one component at a time.
 *   • OVER-tagging is the subtler one: promote every box and a screen reader's
 *     landmark menu becomes forty meaningless entries — worse than none. The ADR
 *     calls restraint "part of the design, not a gap in it" (§3), so restraint
 *     needs a gate too, not just prose.
 *
 * The ADR states these as prose invariants; per HARD RULE #18 an invariant with no
 * gate is a future regression, so they land HERE, BEFORE the retag work — the
 * gates fail-safe the change that follows (§13 sequencing, step 1).
 *
 * SURFACE + LIMITS (HARD RULE #23 — say what this actually exercises). This asserts
 * the ENGINE's HTML contract: `lib/engine`'s `render()` output for the full
 * component gallery, read as a DOM. Element identity, nesting, and the
 * accessibility-tree shape are pure DOM facts, so jsdom is the right instrument and
 * no browser is needed. It does NOT verify the cascade (that is
 * `component-invariants`), the export shell, or the HTML player — those two shells
 * assemble their own chrome and are asserted where they are built. It is NOT a
 * substitute for a real screen-reader pass.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');

const GALLERY = path.join(__dirname, '..', 'baseline-decks', 'gallery.md');

/**
 * `<article>` means one thing: a self-contained composition you could lift out and
 * it would still make sense. The ADR finds that property true at exactly TWO
 * boundaries — the deck, and a genuinely liftable leaf card — and false everywhere
 * between (§4A). Anything else claiming `<article>` floods the AT rotor with
 * "article… article end" for boxes that are not independently meaningful.
 *
 * So the element is allowlisted, not free. A new `<article>` is a deliberate
 * decision recorded here with its justification — never a silent emission.
 */
const SANCTIONED_ARTICLE_CLASSES = [
  { cls: 'lattice', why: 'the DECK container (ADR §4A "article #1") — a deck is the textbook self-contained composition. The <main> landmark is the document shell\'s, not the deck\'s: <main> says WHERE the primary content is, <article> says WHAT it is. Emitted by lib/engine/slides.js in lockstep with css.js\'s article.lattice > section packing.' },
  { cls: 'ct-card', why: 'carousel card — a self-contained card that stands alone (ADR §4A "article #2"); predates the ADR and is its reference instance.' },
];

/**
 * An `aria-hidden` `<nav>` is a contradiction: it claims the `navigation` role, then
 * removes itself from the accessibility tree in the same breath. Both rails did this
 * — the section rail (`.tile-progress`) and the k-of-N split rail
 * (`.lat-split-rail`) — 84 of them in the gallery. Both are now `<div>`s: they are
 * decorative echoes of the pagination and carry no role at all, which is exactly
 * what a `<div>` means.
 *
 * The budget is 0 and stays 0. This is a real invariant now, not a ratchet — if a
 * node is worth a landmark it should be reachable, and if it is decoration it should
 * not claim one.
 */
const HIDDEN_NAV_BUDGET = 0;

/**
 * A landmark a screen reader can reach but cannot NAME is a menu entry reading
 * "navigation" with no idea which navigation. The ADR bars them (§8-#3). The deck
 * currently exposes zero, and the budget keeps the N+1th a conscious decision
 * rather than a drive-by — the same exceed-only ratchet shape the other
 * `check-ownership` budgets use.
 */
const NAMELESS_LANDMARK_BUDGET = 0;

/** Elements that are landmarks wherever they sit (a `<section>` only counts when named). */
const LANDMARK_TAGS = 'nav, aside, main, form';

let doc;
let slides;

before(() => {
  const { html } = engine.render(fs.readFileSync(GALLERY, 'utf8'));
  doc = new JSDOM(`<body>${html}</body>`).window.document;
  slides = [...doc.querySelectorAll('.lattice > *')];
  assert.ok(slides.length > 50, `gallery should render a large deck, got ${slides.length} slides`);
});

/** Every element inside `el` that is hidden from the accessibility tree. */
const hiddenSubtrees = (el) => [...el.querySelectorAll('[aria-hidden="true"]')];

/** An element's accessible name, as far as the DOM alone can determine it. */
const hasAccessibleName = (el) =>
  Boolean(el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.trim());

describe('semantic structure — the slide element (ADR §8-#1)', () => {
  test('every slide is a <section>, never an <article> or a <div>', () => {
    // Non-negotiable, and for two independent reasons: the overflow probe selects
    // `section[data-lattice-slide]`, and hundreds of component rules are rooted at
    // `section.<name>`. Retagging the slide silently kills overflow detection AND
    // unstyles every component — with nothing failing to compile.
    const wrong = slides.filter((s) => s.tagName !== 'SECTION');
    assert.deepEqual(
      wrong.map((s) => `${s.tagName}.${s.className}`),
      [],
      'a slide must stay <section> — it is a section OF the deck-article, not an article',
    );
  });

  test('no slide contains a nested <section>', () => {
    // A raw `<section class="x">` inside slide content starts matching the
    // `section.x` component rules meant for the SLIDE (ADR §8-#5). Promotions
    // inside a slide use a non-colliding class or a non-`section` element.
    const offenders = slides
      .flatMap((s) => [...s.querySelectorAll('section')])
      .map((s) => s.className || '(no class)');
    assert.deepEqual(offenders, [], 'nested <section> collides with section.<name> component rules');
  });
});

describe('semantic structure — one header, one footer (ADR §8-#8)', () => {
  // The Form default absorbs the running `header:`/`footer:` directive into the
  // masthead/footer Cell. Today the Cells are still `<div>`s, so each slide emits
  // at most one of each. The moment `.cell-masthead` → `<header>` lands, a naive
  // retag yields `<footer class="cell-footer"><footer>…</footer></footer>` — two
  // nested footers. THIS test is what fails when that happens.
  for (const tag of ['header', 'footer']) {
    test(`at most one <${tag}> per slide`, () => {
      const offenders = slides
        .map((s, i) => [i, s.querySelectorAll(tag).length])
        .filter(([, n]) => n > 1)
        .map(([i, n]) => `slide ${i + 1}: ${n} <${tag}>`);
      assert.deepEqual(
        offenders,
        [],
        `a slide has exactly one ${tag} region — fold the running directive in as a Tile, ` +
        'do not emit a competing second element',
      );
    });
  }
});

describe('semantic structure — <article> only where it is earned (ADR §4A)', () => {
  test('no slide is itself an <article>', () => {
    assert.equal(slides.filter((s) => s.tagName === 'ARTICLE').length, 0);
  });

  test('every <article> carries a sanctioned class', () => {
    const sanctioned = new Set(SANCTIONED_ARTICLE_CLASSES.map((s) => s.cls));
    const unsanctioned = [...doc.querySelectorAll('article')]
      .filter((a) => ![...a.classList].some((c) => sanctioned.has(c)))
      .map((a) => `<article class="${a.className}">`);
    assert.deepEqual(
      unsanctioned,
      [],
      'an <article> claims "liftable, self-contained". Add it to SANCTIONED_ARTICLE_CLASSES ' +
      'with a justification, or use a plain <div> — over-articling floods the AT rotor.',
    );
  });

  test('the sanction list has no stale entries', () => {
    // An allowlist that outlives what it allows stops describing reality and starts
    // laundering it. Same anti-rot shape as the check-ownership sanctions.
    //
    // The FIRST version of this check was vacuous, and worth recording as a lesson: it
    // built its "does this class render at all" set from `slides.querySelectorAll('*')`
    // — elements INSIDE a slide. The deck container is the slides' PARENT, so `lattice`
    // could never appear; `ct-card` never renders in the gallery at all. So the filter
    // was false for both entries and the check passed unconditionally. It protected
    // zero of two. Mutation-confirmed: demoting `article.lattice` to a `div` left all
    // ten assertions green.
    //
    // Now it searches the WHOLE document (container included) and reports its own
    // coverage, so a class the gallery cannot exercise is named rather than silently
    // counted as verified.
    const asArticle = new Set([...doc.querySelectorAll('article')].flatMap((a) => [...a.classList]));
    const anywhere = new Set([...doc.querySelectorAll('*')].flatMap((e) => [...e.classList]));
    const stale = SANCTIONED_ARTICLE_CLASSES
      .filter((s) => anywhere.has(s.cls) && !asArticle.has(s.cls))
      .map((s) => s.cls);
    assert.deepEqual(
      stale, [],
      'a sanctioned class still renders but is no longer an <article> — drop the entry or restore the element',
    );
    // Coverage is part of the result, not a footnote: an entry this deck never renders
    // is UNVERIFIED by this gate, and saying so keeps the pass honest.
    const uncovered = SANCTIONED_ARTICLE_CLASSES.filter((s) => !anywhere.has(s.cls)).map((s) => s.cls);
    assert.ok(
      asArticle.has('lattice'),
      'the deck container must render as <article class="lattice"> — the entry this gate can actually see',
    );
    if (uncovered.length) {
      // Not a failure: a legitimate entry (the carousel card) simply is not in this deck.
      process.stdout.write(`# note: sanctioned article classes not exercised by the gallery: ${uncovered.join(', ')}\n`);
    }
  });
});

describe('semantic structure — aria-hidden hides decoration only (ADR §8-#4)', () => {
  test('no aria-hidden subtree contains authored prose', () => {
    // This is the caught regression the ADR exists to prevent (§10-I1): an early
    // draft listed `.image-text` as an aria-hidden target, but that node holds the
    // author's <h2>/<p> on every image slide — hiding it blanks out image-slide
    // text for screen readers, invisibly, on every deck.
    //
    // The ADR specified this as a three-CLASS allowlist. That is not implementable
    // against the real codebase (aria-hidden is a deliberate, correct choice at 65
    // source sites — SVG grids, decorative spans, legend swatches), so the gate
    // keys on the actual failure mode instead: hidden decoration is fine, hidden
    // WORDS are not. It catches the defect regardless of which class carries it.
    const offenders = [];
    for (const hidden of hiddenSubtrees(doc.body)) {
      for (const el of hidden.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th')) {
        const text = el.textContent?.trim();
        if (text) offenders.push(`${hidden.tagName}.${hidden.className} hides <${el.tagName.toLowerCase()}> "${text.slice(0, 40)}"`);
      }
    }
    assert.deepEqual(
      offenders.slice(0, 10),
      [],
      'aria-hidden removes a node from the accessibility tree entirely — never put authored text behind it',
    );
  });
});

describe('semantic structure — no nameless landmarks (ADR §8-#3)', () => {
  test('every reachable landmark has an accessible name', () => {
    const nameless = [...doc.querySelectorAll(LANDMARK_TAGS)]
      .filter((el) => !el.closest('[aria-hidden="true"]'))
      .filter((el) => !hasAccessibleName(el))
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`);
    assert.ok(
      nameless.length <= NAMELESS_LANDMARK_BUDGET,
      `${nameless.length} nameless landmark(s) (budget ${NAMELESS_LANDMARK_BUDGET}): ${nameless.slice(0, 5).join(', ')}\n` +
      'A landmark a screen reader can reach but cannot name is worse than no landmark — ' +
      'ship the aria-label in the SAME edit that promotes the element.',
    );
  });

  test('no <nav> is aria-hidden', () => {
    // See HIDDEN_NAV_BUDGET: a landmark that hides itself is over-tagging, and both
    // rails that used to do this are now <div>s.
    const hiddenNavs = [...doc.querySelectorAll('nav')]
      .filter((n) => n.closest('[aria-hidden="true"]'))
      .map((n) => `<nav class="${n.className}">`);
    assert.ok(
      hiddenNavs.length <= HIDDEN_NAV_BUDGET,
      `${hiddenNavs.length} aria-hidden <nav> element(s): ${[...new Set(hiddenNavs)].slice(0, 3).join(', ')}\n` +
      'An element that claims the navigation role and then leaves the accessibility tree ' +
      'should be a <div> — decoration carries no role.',
    );
  });
});

/**
 * `<figure>`/`<figcaption>` — the caption/graphic ASSOCIATION (ADR §16, §18.3).
 *
 * The stage cell of a chart slide is retagged `div.cell-stage` → `figure.cell-stage`
 * when — and only when — it holds a `<figcaption class="chart-caption">`. Two things
 * can silently break, and neither shows up in a pixel diff:
 *
 *   · the two halves drift out of lockstep — a `<figcaption>` outside any `<figure>`
 *     carries no association at all, which is exactly the state the retag replaced;
 *   · the retag goes blanket — a `<figure>` around a caption-less graphic adds an
 *     announced boundary and no information, the over-tagging §4A warns about.
 *
 * Both are asserted here rather than described in the ADR, per HARD RULE #18.
 */
describe('semantic structure — figure/figcaption association (ADR §18.3)', () => {
  test('every <figcaption> is inside a <figure>', () => {
    const orphans = [...doc.querySelectorAll('figcaption')]
      .filter((f) => !f.closest('figure'))
      .map((f) => `<figcaption class="${f.className}"> in .${f.parentElement?.className || '?'}`);
    assert.deepEqual(
      orphans, [],
      'a <figcaption> outside a <figure> associates nothing — it is a styled <p> with a ' +
      'misleading tag. The stage retag (masthead.transform.js stageTag) and the caption ' +
      'emitter (chart-family.js liftChartCaption) must stay in lockstep.',
    );
  });

  test('a stage is a <figure> exactly when a caption sits first or last', () => {
    // Both directions, and the condition is the SPEC's: `<figure>` is *figcaption then
    // flow* or *flow then figcaption*, never figcaption in the middle. `state-chart`
    // ({chart-body, caption, state-legend}) therefore does NOT qualify — it shipped the
    // invalid ordering before this was pinned.
    const stages = [...doc.querySelectorAll('.cell-stage')];
    assert.ok(stages.length > 20, `expected many stage cells, got ${stages.length}`);
    const wrong = stages
      .map((s) => {
        const kids = [...s.children];
        const cap = kids.filter((k) => k.classList.contains('chart-caption'));
        const qualifies = cap.length === 1 && kids.length >= 2 &&
          (kids[0] === cap[0] || kids[kids.length - 1] === cap[0]);
        return {
          tag: s.tagName.toLowerCase(),
          qualifies,
          cls: s.closest('section')?.getAttribute('data-class') || '?',
          shape: kids.map((k) => k.tagName.toLowerCase()).join(','),
        };
      })
      .filter((s) => (s.tag === 'figure') !== s.qualifies)
      .map((s) => `<${s.tag} class="cell-stage"> on ${s.cls} — children [${s.shape}]`);
    assert.deepEqual(
      wrong, [],
      'The retag is conditional in both directions: a stage whose caption is first or ' +
      'last MUST be a <figure>, and any other stage must NOT be (a boundary with nothing ' +
      'to bind is landmark noise; a mid-figure caption is invalid HTML).',
    );
  });

  test('every <figure> stage is NAMED, and its caption is a <figcaption>', () => {
    // A nameless <figure> is worse than none in the artifact that ships: Chrome maps it
    // to a PDF `/Figure` whose `/Alt` comes from the accessible name, readers treat
    // `/Figure` as atomic, and an unnamed one wrapping the chart's own named figure can
    // swallow it. The first version of this retag added five such structs to a six-chart
    // deck. Pinning the name here keeps the PDF honest without opening a PDF.
    const bad = [...doc.querySelectorAll('figure.cell-stage')]
      .filter((f) => !f.getAttribute('aria-label')?.trim() || !f.querySelector(':scope > figcaption.chart-caption'))
      .map((f) => f.closest('section')?.getAttribute('data-class') || '?');
    assert.deepEqual(bad, [], 'a <figure> stage must carry an aria-label AND a <figcaption> child');
  });

  test('a caption outside a <figure> is still a <p>, never a stray <figcaption>', () => {
    // The pair is emitted by ONE function (masthead.transform.js buildStageCell), so it
    // cannot split. When the caption was emitted upstream in chart-family, every
    // `form: off` render shipped a <figcaption> with no <figure> anywhere.
    const strays = [...doc.querySelectorAll('.chart-caption')]
      .filter((c) => c.tagName === 'FIGCAPTION' && !c.closest('figure'))
      .map((c) => c.closest('section')?.getAttribute('data-class') || '?');
    assert.deepEqual(strays, [], 'a <figcaption> outside a <figure> associates nothing');
  });

  test('the gallery actually exercises both branches', () => {
    // A conditional retag that never fires — or always fires — would pass the two
    // assertions above vacuously. This pins that the deck contains both shapes, so
    // those tests are testing something.
    const stages = [...doc.querySelectorAll('.cell-stage')];
    const figures = stages.filter((s) => s.tagName === 'FIGURE');
    assert.ok(figures.length > 0, 'no stage was retagged — the caption branch never fired');
    assert.ok(figures.length < stages.length, 'every stage was retagged — the condition is not conditional');
  });
});
