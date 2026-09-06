/**
 * "ZERO COLLISIONS IN THE DECK CORPUS" WAS A ONE-TIME MEASUREMENT. THIS MAKES IT A GATE.
 *
 * The `{LABEL}` pill and `[x]` mark grammar reads EVERY single-backtick span in every
 * deck (`lib/core/inline-code-directives.js`). That is the whole risk the grammar carries:
 * an author writes `` `{ ok, scene }` `` meaning object-literal prose and gets a pill.
 * `lib/core/inline-pills.js` justifies the brace choice by measuring the alternative —
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
 * the one deck the register switches off and proves it is full of spans that would have
 * dispatched — otherwise the first arm's skip could be covering an empty set and reporting
 * that the register works while never exercising it.
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
  const stray = hits.filter((s) => !DEMONSTRATES_THE_GRAMMAR.has(s.file));
  assert.deepEqual(
    stray,
    [],
    'these spans dispatch as a pill or a mark, so they render as chrome and NOT as the ' +
      'literal text the author typed:\n' +
      stray.map((s) => `  ${s.file}:${s.line}  \`${s.text}\``).join('\n') +
      '\nEscape it (`\\{LABEL}`, `\\[x]`) to keep the literal, set `inline-code: literal` ' +
      'in the deck front matter to turn the grammar off for the whole deck, or — if the ' +
      'deck is teaching the grammar — add it to DEMONSTRATES_THE_GRAMMAR with its reason.',
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
