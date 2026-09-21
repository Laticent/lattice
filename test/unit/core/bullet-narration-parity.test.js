const test = require('node:test');
const assert = require('node:assert/strict');
const { render } = require('../../../lib/engine/index.js');
const { narrateBullet } = require('../../../lib/core/chart-narration.js');

// ─────────────────────────────────────────────────────────────────────────────
// ARTIFACT-LEVEL DIFFERENTIAL — the tally the VOICE speaks against the tally the
// RENDERED chart's own `<desc>` states.
//
// WHY THIS EXISTS. `narrateBullet` USED to guard its tally with
// `tally.total === drawnRowCount(md)` — "say nothing unless every drawn row was
// scored". A checker pointed out that both sides of that comparison come from the
// SAME line scanner, so it can see a row the narrator failed to PARSE and is blind
// to one the narrator parsed DIFFERENTLY from the transform. It then fuzzed the
// difference and found a third of decks carrying a tally stating one the chart
// contradicts. `drawnRowCount` is gone with that guard — the test named above is
// history, not the code — and the guard is now `!dropped.some(r => r.pills.some(isValuePill))`.
//
// So nothing internal is compared here. One side is the caption track a listener
// hears; the other is the `<desc>` in the real render, which is what a screen
// reader is told and what the picture is drawn from. If those two disagree, the
// slide says two different things about itself.
//
// MEASURED ACROSS THIS FIX: 91 of 356 decks diverged before it and 0 of 351 after
// (seed 20260921, 400 generated decks). Re-derive with
//   node --test test/unit/core/bullet-narration-parity.test.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A deterministic generator over every CHILD shape the component admits. The two
 * that mattered are the last three entries: a key written as a code span, which
 * `plainText` resolves for the transform, and a structural line with something
 * nested under it, which markdown-it puts INSIDE the same `<li>` so the code span
 * stops being last and the transform files the item as detail.
 */
const CHILD = [
  (n) => `  - Target \`${n()}\``,
  (n) => `  - \`Target\` \`${n()}\``,
  (n) => `  - Plan \`${n()}\``,
  (n) => `  - Band \`${n()}\` \`${n()}\``,
  (n) => `  - Floor \`${n()}\``,
  (n) => `  - \`Floor\` \`${n()}\``,
  (n) => `  - Actual \`${n()}\``,
  (n) => `  - Organic \`${n()}\``,
  () => '  - a plain note',
  (n) => `  - Target \`${n()}\`\n    - note`,
  (n) => `  - \`Target\` \`${n()}\`\n    - note`,
  // ── THE INDENTATION AXIS, AND IT IS HERE BECAUSE ITS ABSENCE HID THREE DEFECTS ──
  //
  // Every entry above indents its children by exactly two spaces, and the only
  // four-space line is glued to its own `Target`. So the generator could not
  // produce a prose child followed by a deeper line, and never produced a
  // three-space child at all — which is this repo's own house style in places.
  // The first cut of the `hasDeeper` rule compared a bare `>` against the previous
  // KEPT child's marker indent, and all three shapes below narrated a tally the
  // rendered chart contradicts while the fuzz reported 0 of 351. A checker found
  // them by hand.
  //
  // markdown-it closes an item when a line drops below its CONTENT column — marker
  // indent plus marker width — so 1, 2 and 3 are each outside the `Target` above
  // them and 4 and 5 are inside it.
  (n) => `  - Target \`${n()}\`\n  - a plain note\n    - deeper note`,   // 1
  (n) => `  - Target \`${n()}\`\n   - Floor \`${n()}\``,                 // 2
  (n) => `   - Target \`${n()}\`\n    - Band \`${n()}\``,                // 3
  (n) => `  - Target \`${n()}\`\n    continuation`,                     // 4 (lazy)
  (n) => `  - Target \`${n()}\`\n    1. note`,                           // 5 (ordered)
  (n) => `   - Target \`${n()}\``,
  (n) => `   - \`Target\` \`${n()}\``,
];

function corpus(count, startSeed = 20260921) {
  let seed = startSeed;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const num = () => pick(['1', '2', '4', '5', '80%', '99.4%', '99.9%', '4.2M', '0']);
  const decks = [];
  for (let d = 0; d < count; d++) {
    const lines = [];
    const rows = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < rows; i++) {
      lines.push(`- Row${i}` + (rnd() < 0.5 ? ` \`${num()}\`` : ` \`${num()}\` \`${num()}\``));
      const kids = Math.floor(rnd() * 3);
      for (let k = 0; k < kids; k++) lines.push(pick(CHILD)(num));
    }
    decks.push(`<!-- _class: bullet -->\n\n## H.\n\n${lines.join('\n')}`);
  }
  return decks;
}

const WORD = { none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** The tally the VOICE states, as `{ cleared, scored }` — null when it states none. */
function spokenTally(text) {
  let m = text.match(/\b(\w+) of (\w+) cleared the plan line/i);
  if (m) return { cleared: WORD[m[1].toLowerCase()], scored: WORD[m[2].toLowerCase()] };
  m = text.match(/\ball (\w+) cleared their target/i);
  if (m) return { cleared: WORD[m[1].toLowerCase()], scored: WORD[m[1].toLowerCase()] };
  // "none cleared its target" names no denominator, so only the numerator is checked.
  if (/\bnone cleared its target/i.test(text)) return { cleared: 0, scored: null };
  return null;
}

/** The tally the PICTURE states, read off the `<desc>` in the real render. */
function drawnTally(source) {
  const out = render(source, {});
  const html = typeof out === 'string' ? out : out.html;
  const m = html.match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
  if (!m) return null;
  const clauses = m[1].split(';');
  const scored = clauses.filter((c) => /% of the .* target/.test(c));
  return { cleared: scored.filter((c) => /at or above plan/.test(c)).length, scored: scored.length };
}

function survey(decks) {
  const out = { spoke: 0, silent: 0, diverged: [] };
  for (const src of decks) {
    const drawn = drawnTally(src);
    if (!drawn) continue;
    const spoken = spokenTally(narrateBullet(src) || '');
    if (!spoken) { out.silent++; continue; }
    out.spoke++;
    const scoredOk = spoken.scored == null ? drawn.cleared === 0 : spoken.scored === drawn.scored;
    if (!scoredOk || spoken.cleared !== drawn.cleared) out.diverged.push({ src, drawn, spoken });
  }
  return out;
}

test('a spoken bullet tally never contradicts the tally the rendered chart states', () => {
  const r = survey(corpus(400));
  // The floor is here so the cell cannot pass by speaking no tally at all — the
  // whole failure mode this replaces was a tally that should not have been spoken.
  assert.ok(r.spoke > 250, `only ${r.spoke} decks spoke a tally — the corpus stopped exercising it`);
  assert.deepEqual(
    r.diverged.slice(0, 2),
    [],
    `${r.diverged.length} of ${r.spoke} decks speak a tally the chart contradicts`,
  );
});

test('the CORPUS reaches both shapes that used to diverge', () => {
  // A zero-divergence result means nothing if the generator stopped emitting the
  // two shapes. Counted rather than assumed.
  const decks = corpus(400);
  const codeKey = decks.filter((d) => /^ {2,3}- `(?:Target|Floor)` `/m.test(d)).length;
  const nestedUnder = decks.filter((d) => /`\n {4}- note/.test(d)).length;
  assert.ok(codeKey > 60, `only ${codeKey} decks carry a code-spanned key`);
  assert.ok(nestedUnder > 20, `only ${nestedUnder} decks carry a structural line with a child`);

  // THE INDENTATION AXIS, counted separately, because its absence is what let three
  // `hasDeeper` defects through a fuzz reporting zero divergence.
  const proseBetween = decks.filter((d) => /- a plain note\n {4}- deeper note/.test(d)).length;
  const overIndentedSibling = decks.filter((d) => /`\n {3}- Floor `/.test(d)).length;
  const threeSpace = decks.filter((d) => /^ {3}- /m.test(d)).length;
  const lazy = decks.filter((d) => /`\n {4}continuation/.test(d)).length;
  const ordered = decks.filter((d) => /`\n {4}1\. note/.test(d)).length;
  for (const [name, n] of [['prose child then deeper', proseBetween], ['over-indented sibling', overIndentedSibling],
    ['three-space child', threeSpace], ['lazy continuation', lazy], ['ordered sublist', ordered]]) {
    assert.ok(n > 10, `only ${n} decks carry a ${name}`);
  }
});

test('the three named shapes, each against its own rendered <desc>', () => {
  // The fuzz says the population agrees; these say WHICH rule each shape follows,
  // so a future edit that trades one divergence for another cannot pass by luck.
  const cases = [
    // A code-spanned key IS structural — `plainText` resolves it for the transform.
    ['- Uptime `99.9%`\n  - `Target` `99.4%`\n- Latency `2` `4`', { cleared: 1, scored: 2 }],
    // A structural line with a child is NOT — markdown-it nests the child inside the
    // same `<li>`, so the code span is no longer last and the item becomes detail.
    ['- Uptime `5`\n  - Target `4`\n    - note\n- Latency `2` `4`', { cleared: 0, scored: 1 }],
    // The value is the LAST pill and the key swallows the rest, so `Band 99.5%`
    // matches no keyword and the line stays detail.
    ['- Uptime `99.4%`\n  - Band `99.5%` `99.7%`\n  - Target `99.9%`\n- Latency `2` `4`', { cleared: 0, scored: 2 }],
  ];
  for (const [body, expected] of cases) {
    const src = `<!-- _class: bullet -->\n\n## H.\n\n${body}`;
    assert.deepEqual(drawnTally(src), expected, `the RENDER moved for: ${body}`);
    const spoken = spokenTally(narrateBullet(src) || '');
    if (expected.cleared === 0) assert.equal(spoken.cleared, 0, `${body} -> ${JSON.stringify(spoken)}`);
    else assert.deepEqual(spoken, expected, `${body} -> ${JSON.stringify(spoken)}`);
  }
});
