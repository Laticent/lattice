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
    // The gallery is the coverage surface, so only classes it exercises are checked.
    const present = new Set([...doc.querySelectorAll('article')].flatMap((a) => [...a.classList]));
    const rendered = new Set(slides.flatMap((s) => [...s.querySelectorAll('*')].flatMap((e) => [...e.classList])));
    const stale = SANCTIONED_ARTICLE_CLASSES
      .filter((s) => rendered.has(s.cls) && !present.has(s.cls))
      .map((s) => s.cls);
    assert.deepEqual(stale, [], 'a sanctioned article class still renders but is no longer an <article> — drop the entry');
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
