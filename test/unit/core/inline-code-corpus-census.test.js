/**
 * "ZERO COLLISIONS IN THE DECK CORPUS" WAS A ONE-TIME MEASUREMENT. THIS MAKES IT A GATE.
 *
 * The `{LABEL}` pill and `[x]` mark grammar reads EVERY single-backtick span in every
 * deck (`lib/core/inline-code-directives.js`). That is the whole risk the grammar carries:
 * an author writes `` `{ ok, scene }` `` meaning object-literal prose and gets a pill.
 * `lib/plugins/pills/pills.inline.js` justifies the brace choice by measuring the alternative —
 * the ADR's bracket geometry would have swallowed 147 spans an author meant literally,
 * braces swallow none — and that measurement is the load-bearing evidence for the
 * grammar's spelling.
 *
 * IT WAS ALSO A NUMBER IN A COMMENT, taken once, on a tree that has since grown. Nothing
 * re-derived it, so it could only rot; a review round found it restated in five places
 * with two different corpus definitions and no way to reproduce either. A comment cannot
 * fail. This can.
 *
 * WHAT IT PINS. Of the inline-code spans in the decks we ship, the ones that dispatch are
 * exactly the ones in the two decks that exist to demonstrate the grammar — one showing it
 * on, one showing the register turning it off. Anywhere else, a dispatching span is an
 * author who meant literal text and will not find out until they look at the slide.
 *
 * TWO ARMS, because the register splits the corpus. The first walks every deck the grammar
 * RUNS in and allows dispatching spans only in `examples/inline-pills.md`; the second takes
 * the deck the register switches off and proves it is full of spans that would have
 * dispatched — otherwise the first arm's skip could be covering an empty set and reporting
 * that the register works while never exercising it.
 *
 * NO DECK COUNT IS WRITTEN DOWN HERE. Two were, and both were stale within days of being
 * typed — overtaken by routine rebases that added decks, in a test whose entire subject is
 * a number nobody re-derived. `shippedDecks()` is the number; it is recomputed every run.
 *
 * IT ASKS THE KERNEL, NOT A COPY OF THE GRAMMAR — `dispatches()` is the same predicate
 * both render paths call (HARD RULE #1), so widening or narrowing the grammar moves this
 * census with it rather than leaving it certifying the old shape.
 *
 * SCOPE, and it is narrower than "every markdown file", deliberately. A `*.docs.md` is
 * prose ABOUT a component and is never projected; `engineering/` is a written record.
 * A `{LABEL}` in either renders nowhere, so counting them would inflate the corpus with
 * spans that cannot collide with anything. `test/helpers/decks.js` owns that definition.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, shippedDecks, inlineSpans } = require('../../helpers/decks.js');
const { dispatches } = require(path.join(ROOT, 'lib/core/inline-code-directives.js'));
const { isLiteralFromSource } = require(path.join(ROOT, 'lib/core/resolve-inline-code.js'));

/**
 * Decks allowed to contain dispatching spans, each with the reason. A deck earns a line
 * here by being ABOUT the grammar; every other deck is an author writing prose.
 */
const DEMONSTRATES_THE_GRAMMAR = new Map([
  ['examples/inline-pills.md', 'the demo deck for the pill and mark grammar (HARD RULE #9)'],
  ['examples/inline-sparks.md', 'the demo deck for the `~{…}` spark grammar (HARD RULE #9)'],
  ['examples/segno-phase-2.md', 'the demo deck for Segno phase 2: every record spelling on its slide (HARD RULE #9). Its flowchart `{diamond, c2}` is counted here but renders as a style, not a pill — the census reads spans without their slide, and the flowchart owns its rows (lib/core/resolve-inline-code.js)'],
  ['examples/avatars.md', 'the demo deck for the avatars plugin: `!{…}` inline and as a team-profile portrait (HARD RULE #9)'],
  ['examples/avatars-dress.md', 'the demo deck for avatar earrings, head coverings and clothing: `!{…}` with the v2 traits (HARD RULE #9)'],
  ['examples/inline-icons.md', 'the demo deck for the icons plugin: `^{…}` and the pill\'s `icon=` (HARD RULE #9)'],
  ['examples/hub-spoke-icons.md', 'the demo deck for icons on hub-spoke (HARD RULE #9). Its `{icon=…}` records are counted here but render as disc icons, not pills — the census reads spans without their slide, and hub-spoke owns the rows it reads (lib/core/resolve-inline-code.js `ownedRowDepth`); the table slide escapes its examples'],
  ['examples/chart-icons.md', 'the demo deck for icons in flowchart and state-chart nodes (HARD RULE #9). Its `{icon=browser}`-style spans are counted here but render as node styles, not pills — the census reads spans without their slide, and both charts own their rows (lib/core/resolve-inline-code.js); the table slide escapes its examples'],
  ['examples/chart-european-numbers.md', 'the demo deck for chart values and row descriptions (HARD RULE #9): its last slide shows a `>` description carrying a pill and a spark, the rich card the hover reveals'],
  ['examples/checkbox-semantics.md', 'the demo deck showing an inline `[ ]` mark draws the same ring as a pricing row or a state-cells cell (HARD RULE #9)'],
]);

/**
 * Decks that use a COMPONENT's pill — a title-row status, a metric, a tier — written in the pills
 * plugin's own notation (`` `{status}` ``) because that component draws its pills with the plugin
 * and nothing else (engineering/decisions/2026-10-17-pills-plugin.md §4.3). The span dispatches
 * on purpose: it is the author asking for the pill. A deck earns a line by carrying one.
 */
const USES_A_COMPONENT_PILL = new Map([
  ['lib/components/inventory/cards-stack/cards-stack.gallery.md', 'cards-stack: a `{status}` pill on each card title'],
  ['examples/matrix-grid-rendering-jank.md', 'a cards-stack slide whose title row carries a `{fixed}` pill'],
  ['examples/prose-density.md', 'cards-grid: the word and line budgets, each a pill on its card title'],
  ['lib/components/inventory/logo-wall/logo-wall.gallery.md', 'logo-wall: a `{tier}` pill under each mark'],
  ['lib/components/inventory/inventory.gallery.md', 'the inventory family gallery: its logo-wall slides carry a `{tier}` pill under each mark'],
  ['examples/logo-wall.md', 'logo-wall: a `{tier}` pill under each mark'],
  ['examples/logo-wall-equal-weight.md', 'logo-wall: a `{tier}` pill under each mark'],
  ['examples/sample-images.md', 'a logo-wall slide: a `{tier}` pill under each mark'],
  ['lib/components/legal/policy-recommendation/policy-recommendation.gallery.md', 'policy-recommendation: a `{source}` citation chip ends each evidence line'],
  ['examples/policy-recommendation.md', 'policy-recommendation: a `{source}` citation chip ends each evidence line'],
  ['lib/components/inventory/list-tabular/list-tabular.gallery.md', 'list-tabular register: a `{tag}` pill ends each row'],
  ['examples/autosplit-coverage.md', 'a list-tabular register slide: a `{tag}` pill ends each row'],
  ['examples/list-tabular-responsive.md', 'a list-tabular register slide: a `{tag}` pill ends each row'],
  ['examples/sketch-ledger.md', 'a list-tabular register slide: a `{tag}` pill ends each row'],
  ['lib/components/legal/regulatory-update/regulatory-update.gallery.md', 'regulatory-update: an `{Effective Feb 2026}` pill closes each row'],
  ['lib/components/legal/legal.gallery.md', 'the legal family gallery: its regulatory-update slides close each row with a `{date}` pill'],
  ['examples/adaptive-sweep.md', 'a regulatory-update slide: a `{date}` pill closes each row'],
  ['examples/cover-paginate.md', 'a regulatory-update slide: a `{date}` pill closes each row'],
  ['examples/reflow-legal.md', 'a regulatory-update slide: a `{date}` pill closes each row'],
  ['examples/universal-pill.md', 'a regulatory-update slide: a `{date}` pill closes each row'],
  ['lib/components/legal/statute-stack/statute-stack.gallery.md', 'statute-stack: a `{citation}` and a `{status}` pill on each jurisdiction card'],
  ['examples/cards-register-catalog.md', 'a statute-stack slide: a `{citation}` and a `{status}` pill on each jurisdiction card'],
  ['examples/typography-categories.md', 'a statute-stack slide: a `{citation}` and a `{status}` pill on each jurisdiction card'],
  ['lib/components/chart/roadmap/roadmap.gallery.md', 'roadmap: a `{Q2 2026}` pill on each phase header'],
  ['lib/components/chart/chart.gallery.md', 'the chart family gallery: its roadmap slide carries a `{date}` pill on each phase header'],
  ['examples/chart-family-coverage.md', 'a roadmap slide: a `{date}` pill on each phase header'],
  ['examples/data-viz-gallery.md', 'a roadmap slide: a `{date}` pill on each phase header'],
  ['examples/read-article-chart-paints.md', 'a roadmap slide: a `{date}` pill on each phase header'],
  ['examples/venue-marker-boxes.md', 'a roadmap slide: a `{date}` pill on each phase header'],
  ['lib/components/inventory/actors/actors.gallery.md', 'actors: a `{name}` pill ends each responsibility row'],
  ['examples/gallery-jargon.md', 'an actors slide: a `{name}` pill ends each responsibility row'],
  ['examples/portrait-prose-deboost.md', 'an actors slide: a `{name}` pill ends each responsibility row'],
  ['examples/sketch.md', 'an actors slide: a `{name}` pill ends each responsibility row'],
  ['test/integration/baseline-decks/gallery.md', 'the baseline gallery: cards-grid titles with a `{version}` pill, logo-wall marks with a `{tier}` pill'],
]);

/** The decks the `inline-code: literal` register turns the grammar off for. */
function isLiteral(file) {
  return isLiteralFromSource(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

test('the only shipped deck whose inline code dispatches is the one demonstrating it', () => {
  const decks = shippedDecks().filter((f) => !isLiteral(f));
  const spans = decks.flatMap(inlineSpans);

  // ANTI-VACUITY. "Zero collisions" is trivially true of an empty list, so a walker
  // broken by a markdown change would certify nothing and pass forever. The floor sits
  // far below the measured corpus — it pins that the walk still WORKS, not a corpus size
  // that moves whenever a deck is added.
  assert.ok(
    spans.length >= 2000,
    `found only ${spans.length} inline-code spans across ${decks.length} decks — ` +
      'the walker is probably broken, not the decks emptied',
  );

  const hits = spans.filter((s) => dispatches(s.text));
  const stray = hits.filter((s) => !DEMONSTRATES_THE_GRAMMAR.has(s.file) && !USES_A_COMPONENT_PILL.has(s.file));
  assert.deepEqual(
    stray,
    [],
    'these spans dispatch as a pill or a mark, so they render as chrome and NOT as the ' +
      'literal text the author typed (the line is the enclosing BLOCK\'s first line, so a ' +
      'span in a wrapped paragraph or a nested list may sit a line or two below it):\n' +
      stray.map((s) => `  ${s.file}:${s.line}  \`${s.text}\``).join('\n') +
      '\nEscape it (`\\{LABEL}`, `\\[x]`) to keep the literal, set `inline-code: literal` ' +
      'in the deck front matter to turn the grammar off for the whole deck, or — if the ' +
      'deck is teaching the grammar — add it to DEMONSTRATES_THE_GRAMMAR with its reason, or to USES_A_COMPONENT_PILL if the pill is the point of a component.',
  );

  // A STALE ALLOWLIST is the failure mode this kind of list always reaches: the deck is
  // renamed or its pills are removed, the entry stays, and the next deck to take that
  // path is admitted without anyone deciding to.
  for (const [file, why] of DEMONSTRATES_THE_GRAMMAR) {
    assert.ok(
      hits.some((s) => s.file === file),
      `${file} is allowlisted (${why}) but no longer contains a dispatching span — ` +
        'remove the entry',
    );
  }
});

test('the literal register is what removes the demo deck from the census, not an absence of material', () => {
  // The arm above SKIPS `inline-code: literal` decks. If that skip were covering an empty
  // set, the census would be reporting the register works while never exercising it.
  // `examples/inline-code-literal.md` is full of spans that would dispatch — that is its
  // subject — and the register is the only reason they render as text.
  const file = 'examples/inline-code-literal.md';
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.equal(isLiteralFromSource(src), true, `precondition: ${file} sets inline-code: literal`);

  const would = inlineSpans(file).filter((s) => dispatches(s.text));
  assert.ok(
    would.length >= 5,
    `${file} carries only ${would.length} spans that would dispatch — it is supposed to ` +
      'demonstrate the register, so the skip above is no longer proving anything',
  );
});
