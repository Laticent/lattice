const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { parseBullet } = require('../../../lib/components/chart/bullet/bullet.transform.js');
const { extractFirstList } = require('../../../lib/core/html-lists.js');
const bulletFacts = require('../../../lib/core/bullet-facts.js');
const { __parseBulletRowsForTest, narrateBullet, narrateWordCloud } = require('../../../lib/core/chart-narration.js');

// ─────────────────────────────────────────────────────────────────────────────
// THE TIGHTEST ORACLE AVAILABLE — narration's structural read of a bullet row
// against `parseBullet`'s, field by field, on the same slide.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Four consecutive review rounds each found that the previous round's fix had
// introduced new defects of the class it was closing. Every one of them was a
// disagreement about markdown-it's LIST NESTING — narration derives it from a line
// scanner because it runs on Markdown before any render, while `parseBullet` reads
// markdown-it's OUTPUT and simply knows.
//
// Every check in this area until now went through the SVG `<desc>`. That is a lossy
// projection: it collapses a row to one sentence, says nothing about which of
// measure/target/floor/bands moved, and drops a row whose lead was corrupted (the
// clause then contains a newline). Defects hid in every one of those gaps.
//
// This compares the four fields directly. If narration and the transform disagree
// about a row, this fails — whatever the `<desc>` happens to say about it.
//
// ── WHAT IT DOES NOT CLAIM ───────────────────────────────────────────────────
//
// It is still a CORPUS. The generator below is wide on the axes four rounds of
// checkers found — indentation, markers, tabs, continuations — and it is not a
// proof. What it does change is the ORACLE: previous fuzzes compared narration
// against my expectations, and this one compares it against the parser the picture
// is actually built from.
// ─────────────────────────────────────────────────────────────────────────────

// markdown-it AS THE TRANSFORM SEES IT. `transformSection` hands `parseBullet` the
// inner HTML of the slide's `<ul>` — the list as markdown-it built it, before the
// chart replaces it. Rendering the whole slide through the engine and looking for a
// `<ul>` finds nothing, because by then the SVG is there instead; that was a bug in
// this harness that made it report `null` for almost every deck.
const md = new MarkdownIt({ html: true });

/** The transform's own read of the row, from the list HTML it is actually given. */
function transformRows(source) {
  const body = source.replace(/^<!--[\s\S]*?-->\n*/, '').replace(/^##[^\n]*\n*/m, '');
  const html = md.render(body);
  // `extractFirstList`, WHICH IS WHAT THE TRANSFORM ACTUALLY CALLS — not a regex.
  //
  // This harness used to take a GREEDY match to the last `</ul>`, reasoning that a
  // lazy one would truncate an item carrying a nested list. True, and it also
  // swallowed every SIBLING list on the slide, so `parseBullet` was handed rows the
  // transform would never receive. That hid a whole defect class: narration reading
  // a second top-level list the chart does not draw. Measured on this generator's own
  // corpus, 33 of 500 decks were fed something the transform never sees, and swapping
  // this one call surfaced a divergence the committed run reported as 0.
  //
  // `extractFirstList` is depth-aware, so it handles the nested case the greedy match
  // was reaching for, and it is the same function `bullet.transform.js` uses. An
  // oracle that re-implements the thing it is checking proves only that the code
  // agrees with itself.
  const first = extractFirstList(html);
  if (!first) return null;
  let model;
  try { model = parseBullet(first.inner); } catch { return null; }
  if (!model) return null;
  return model.rows.map((r) => ({
    measure: r.measureRaw ?? null,
    target: r.targetRaw ?? null,
    floor: r.floorRaw ?? null,
    // PARSED on both sides. The transform keeps `bandRaw` as the author typed it
    // (`"80%"`) and narration keeps the parsed number (`80`), so comparing the raw
    // strings reported a divergence on a row the two agree about completely — a bug
    // in this harness, not a finding about the narrator.
    bands: (r.bands || []).join(','),
  }));
}

/** Narration's own read, through the same entry point `narrateBullet` uses. */
function narrationRows(source) {
  return __parseBulletRowsForTest(source).map((r) => ({
    measure: r.measureRaw ?? null,
    target: r.targetRaw ?? null,
    floor: r.floorRaw ?? null,
    bands: (r.bandRaw || r.bands || []).join(','),
  }));
}

/**
 * Wide on every axis a checker has found a defect on. The marker, the gap after it,
 * the child indent, tabs, continuations and ordered sublists are all varied
 * INDEPENDENTLY, because each round's corpus was narrow on exactly one of them and
 * reported zero divergences while the narrator was wrong.
 */
// WEIGHTED TOWARD WHAT AUTHORS WRITE. A single space after the marker and a
// two-space child are the overwhelming norm; the odd shapes are here because four
// review rounds found a defect on each, not because they are common. Left at equal
// odds they swallow the corpus — 75% of rows carried a wide gap, every one of them
// was refused, and only 6 of 500 decks reached the exact-match floor below. A
// corpus that is mostly malformed measures the generator, not the narrator.
const GAPS = ['  ', '   ', '     '];
// A SINGLE TAB IS NOT A TAB TEST, and it took a mutation to find that out. `'\t'`
// is one character, so the one-space-sibling rule (`indentNow < 2`) refuses it
// before the tab clause is ever consulted — delete the tab rule from the narrator
// and this corpus stayed green across all 10,384 unit tests. `'\t\t'` and `'  \t'`
// are the shapes that actually reach it, and they are here so the rule has a
// killer. Two more `'  '` entries hold the normal-authoring weight where it was.
const INDENTS = ['   ', '    ', '      ', ' ', '\t', '\t\t', '  \t'];
const KEYS = ['Target', 'Floor', 'Band', 'Actual', 'Plan', '`Target`', '`Floor`'];
const VALUES = ['1', '4', '5', '80%', '4.2M', '99.4%'];
// SAME WEIGHTING AS THE OTHER AXES, and for the third time the reason is the same:
// four of these five tails are shapes a checker found a defect on, not shapes an
// author writes. At equal odds they dominate, the refusal fires on nearly every
// deck, and the exact-match floor below stops measuring the narrator.
const TAILS = ['\n    - note', '\n  a continuation', '\n    1. ordered', '\n\n  after a blank'];
// WHAT ENDS THE LIST, which is a WHOLE-CHART axis and not a row one. The transform
// draws one list (`extractFirstList`); a block between two rows can close it and
// open a second, and the voice then tallies rows the picture never draws. Nine
// rounds of this work could not produce that deck: every axis above varies a row or
// a child, and none of them interrupts. The defect was found by hand and reproduced
// on the real `--captions` export. Weighted low for the same reason as every other
// odd axis — at equal odds the interruption lands on most decks and the corpus stops
// measuring the narrator.
const BREAKS = ['Measured at quarter end.', '\nMeasured at quarter end.\n', '\n  after a blank\n'];
// A BLANK FOLLOWED BY A NESTED BULLET — an ordinary LOOSE list, and the shape the
// blank-then-prose rule is narrowed on (`&& !isNestedBullet`). Without it in the
// corpus that narrowing had no killer: deleting it left every cell green and the
// survey byte-identical, because the generator never put a blank before a child.

/**
 * ONE PERTURBATION PER DECK, and this is the fourth attempt at the weighting problem
 * — the first structural one.
 *
 * Every earlier version drew each axis independently on every row and every child, so
 * the axes MULTIPLIED: each one added in good faith made the corpus more malformed
 * than the last, three separate rounds had to re-weight by hand, and the fourth time
 * only 7 of 500 decks still spoke a tally at all. A corpus that is mostly malformed
 * measures the generator.
 *
 * So a deck is CLEAN unless it is picked to carry exactly one oddity, in one place.
 * Every axis stays reachable and counted (the cell below fails if any goes to zero),
 * most decks stay well formed, and a divergence names its own cause — with one
 * variable per deck there is nothing to disentangle.
 */
const PERTURB = [
  null, null, null, null, null, null, null, null, null, null,
  'gap', 'indent', 'tail', 'break', 'loose', 'bare', 'marker',
];

/**
 * TWO CORPORA, BECAUSE THERE ARE TWO QUESTIONS, and answering both from one draw is
 * what three rounds of re-weighting were really failing at.
 *
 * `sparse` — one oddity per deck — answers **what does this cost an author**: most
 * decks are well formed, so the exact-match rate and the tally rate mean something.
 * `dense` — every axis drawn independently on every row and child — answers **can
 * the voice ever say something the picture contradicts**: it piles oddities up until
 * the rules collide, which is the only way a mutation dies.
 *
 * Measured, which is why both are here: on `sparse` alone every one of the twelve
 * production mutants SURVIVES — the shapes the rules fire on are too rare and too
 * isolated. On `dense` alone only 7 of 500 decks still speak a tally, so the cost
 * cells measure the generator. Neither corpus can do the other's job.
 */
function corpus(count, startSeed = 20260921, mode = 'sparse') {
  let seed = startSeed;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const decks = [];
  for (let d = 0; d < count; d++) {
    const lines = [];
    const rows = 2 + Math.floor(rnd() * 3);
    const dense = mode === 'dense';
    const axis = dense ? null : pick(PERTURB);
    // WHERE the one oddity lands. A break only ends a list BETWEEN rows, so it never
    // lands on the last one.
    const at = Math.floor(rnd() * rows);
    // ONE MARKER PER DECK. Mixing `-` and `+` in one list starts a SECOND list in
    // CommonMark, and the slide then has two `<ul>`s — a real behavior, but not one
    // an author writes, and comparing against only the first was a bug in this
    // harness rather than a finding about the narrator. The marker still varies
    // ACROSS decks, which is the axis that matters.
    // In `dense` every axis rolls on its own, per row and per child.
    const on = (name, i, k) => (dense ? rnd() < 0.3 : axis === name && i === at && (k === undefined || k === 0));
    const marker = (dense ? rnd() < 0.2 : axis === 'marker') ? pick(['*', '+']) : '-';
    for (let i = 0; i < rows; i++) {
      const pills = on('bare', i) ? '' : rnd() < 0.5 ? ` \`${pick(VALUES)}\`` : ` \`${pick(VALUES)}\` \`${pick(VALUES)}\``;
      lines.push(`${marker}${on('gap', i) ? pick(GAPS) : ' '}Row${i}${pills}`);
      const kids = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < kids; k++) {
        if (on('loose', i, k)) lines.push('');
        const indent = on('indent', i, k) ? pick(INDENTS) : '  ';
        const tail = on('tail', i, k) ? pick(TAILS) : '';
        lines.push(`${indent}${marker} ${pick(KEYS)} \`${pick(VALUES)}\`${tail}`);
      }
      if (on('break', i) && i < rows - 1) lines.push(pick(BREAKS));
    }
    decks.push(`<!-- _class: bullet -->\n\n## H.\n\n${lines.join('\n')}`);
  }
  return decks;
}

/**
 * THE CHART'S OWN TALLY — the transform's parse, put through the SHARED arithmetic.
 *
 * `bulletFacts.summarizeRows` is the one kernel both surfaces use (HARD RULE #1), so
 * feeding it `parseBullet`'s rows is not re-implementing the narrator: the thing
 * under test is the PARSE, and the arithmetic is common ground. Re-deriving "cleared"
 * here instead would be the oracle re-implementing its subject, which is the mistake
 * the ninth and tenth rounds each shipped one level apart.
 */
function transformTally(source) {
  const body = source.replace(/^<!--[\s\S]*?-->\n*/, '').replace(/^##[^\n]*\n*/m, '');
  const first = extractFirstList(md.render(body));
  if (!first) return null;
  let model;
  try { model = parseBullet(first.inner); } catch { return null; }
  return model ? bulletFacts.summarizeRows(model.rows) : null;
}

/** The two numbers the voice actually said, or null if it spoke no tally. */
function spokenTally(text) {
  const say = String(text || '');
  const m = say.match(/\b([a-z-]+) of ([a-z-]+) cleared the plan line/i);
  if (m) return { kind: 'some', cleared: m[1].toLowerCase(), scored: m[2].toLowerCase() };
  const all = say.match(/\ball ([a-z-]+) cleared their target/i);
  if (all) return { kind: 'all', scored: all[1].toLowerCase() };
  if (/\bnone cleared its target/i.test(say)) return { kind: 'none' };
  return null;
}

function survey(decks) {
  const out = { checked: 0, diverged: [], silent: 0, quieter: 0, exact: 0, tallyWhileCountsDiffer: 0 };
  for (const src of decks) {
    const t = transformRows(src);
    if (!t) continue;
    const n = narrationRows(src);
    // Narration reading a different number of rows than the chart draws is a known,
    // deliberate outcome — it refuses what it cannot resolve. What must never happen
    // then is a TALLY, which is a claim about exactly that count.
    if (n.length !== t.length) {
      out.silent++;
      if (/cleared the plan line|none cleared its target|cleared their target/i.test(narrateBullet(src) || '')) {
        out.tallyWhileCountsDiffer++;
      }
      continue;
    }
    out.checked++;
    let deckDiverged = false;
    let deckQuieter = false;
    for (let i = 0; i < t.length; i++) {
      // THE CONTRACT IS NOT EQUALITY, IT IS "NEVER SOMETHING DIFFERENT".
      //
      // Narration may read LESS than the transform — that is the whole refusal
      // design, and a field it declined to resolve comes back null. What it must
      // never do is come back with a value the transform does not have, or a
      // different one: that is the voice describing a picture nobody drew, which is
      // the defect class every round of this work has been about.
      const worse = ['measure', 'target', 'floor', 'bands'].filter((k) => {
        const tv = t[i][k];
        const nv = n[i][k];
        if (nv === tv) return false;               // agreed
        if (nv === null || nv === '') return false; // narration said less — allowed
        return true;                                // narration said something else
      });
      if (worse.length) {
        out.diverged.push({ src, row: i, fields: worse, transform: t[i], narration: n[i] });
        deckDiverged = true;
        break;
      }
      if (JSON.stringify(t[i]) !== JSON.stringify(n[i])) deckQuieter = true;
    }
    if (!deckDiverged && deckQuieter) out.quieter++;
    if (!deckDiverged && !deckQuieter) out.exact++;
  }
  return out;
}

test('narration reads a row exactly as the transform does, or does not read it at all', () => {
  // BOTH CORPORA. `dense` is where a mutation dies — it piles the odd shapes up until
  // the rules collide. `sparse` is where the COST below means something.
  const d = survey(corpus(500, 20260921, 'dense'));
  assert.deepEqual(
    d.diverged.slice(0, 2).map((x) => ({ row: x.row, transform: x.transform, narration: x.narration, src: x.src })),
    [],
    `${d.diverged.length} of ${d.checked} adversarial decks read a row differently from the transform`,
  );
  const r = survey(corpus(500));
  assert.ok(r.checked > 100, `only ${r.checked} decks were compared row-for-row`);
  // THE TALLY IS CHECKED DIRECTLY NOW, in its own cell above, and this proxy is
  // REPORTED rather than asserted.
  //
  // "Counts differ, so the tally must be wrong" was always a stand-in for the
  // question that matters, and once the corpus grew a PROSE ROW it started crying
  // wolf: `- Methodology` between two scored rows is drawn by the chart, scores
  // nothing, and is not in narration's row list — so the counts differ 3 to 2 while
  // "one of two cleared the plan line" is exactly what the picture shows. Verified
  // against `parseBullet` + `summarizeRows` on that deck.
  //
  // Asserting the proxy would have forced a refusal on ordinary authoring to keep a
  // cell green. The direct arm subsumes it: it compares the two numbers the voice
  // SAID against the two the chart's own parse gives, whatever the row counts do.
  assert.ok(r.tallyWhileCountsDiffer <= r.silent, 'sanity: the proxy cannot exceed its own population');
  assert.deepEqual(
    r.diverged.slice(0, 2).map((d) => ({ row: d.row, transform: d.transform, narration: d.narration, src: d.src })),
    [],
    `${r.diverged.length} of ${r.checked} decks read a row differently from the transform`,
  );
  // AND THE REFUSAL IS NOT SILENTLY TOTAL. If narration declined every field on
  // every deck this cell would pass while saying nothing, which is the failure mode
  // the tally floor exists for one level up.
  // WHAT IT COSTS, on each corpus, at the seed committed here:
  //
  //   sparse   checked 434 | exact 362 | quieter  72 | silent  66 | diverged 0
  //   dense    checked 144 | exact  36 | quieter 108 | silent 319 | diverged 0
  //
  // Read them together. On decks with at most one oddity the narrator reads all four
  // fields exactly on 362 of 434 — the refusal is narrow where authoring is normal.
  // Pile the oddities up and it gives ground fast, which is the design: it fails
  // toward silence. Neither number is a frequency estimate for real decks.
  //
  // THESE ARE RE-DERIVED, NOT REMEMBERED. The previous version of this comment quoted
  // "37 of 165" and was already wrong when it was written, then survived a corpus
  // change in the same commit that deleted another number for not re-deriving. Run
  // the cell and read the counters; do not copy them forward.
  //
  // ON THE DECKS THIS REPO SHIPS IT COSTS NOTHING — 3,725 slides carry a `_class:`,
  // 501 narrate, and not one reads differently than it did before any of this. This
  // floor is what stops the refusal quietly swallowing the corpus anyway.
  assert.ok(r.exact > 300,
    `only ${r.exact} decks read every row EXACTLY as the transform does — the refusal has swallowed the corpus`);
});

test('a spoken tally matches the chart\'s own scored and cleared counts', () => {
  // THE GUARD THAT ROW-FOR-ROW COMPARISON CANNOT BE. The survey above only questions
  // a tally when the two parses disagree about how MANY rows there are; a tally can
  // also be wrong while the counts happen to agree, and the tenth round shipped
  // exactly that — a scan that stopped early returned a clean-looking PREFIX and the
  // voice said "all two cleared their target" over a chart scoring four rows, two of
  // them cleared. Proved on the real --captions export, invisible to every cell here.
  //
  // So this asks the only question that matters about a whole-chart claim: are the
  // numbers the ones the picture would give? The voice may say NOTHING — that is the
  // refusal working. It may not say something else.
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const wrong = [];
  let spoke = 0;
  for (const src of [...corpus(500), ...corpus(500, 20260921, 'dense')]) {
    const said = spokenTally(narrateBullet(src));
    if (!said) continue;
    const t = transformTally(src);
    if (!t) { wrong.push({ src, said, transform: null }); continue; }
    spoke++;
    const ok = said.kind === 'none' ? t.cleared === 0 && t.scored > 0
      : said.kind === 'all' ? t.cleared === t.scored && NUM[t.scored] === said.scored
      : NUM[t.cleared] === said.cleared && NUM[t.scored] === said.scored;
    if (!ok) wrong.push({ src, said, transform: { scored: t.scored, cleared: t.cleared } });
  }
  assert.deepEqual(wrong.slice(0, 2), [], `${wrong.length} decks speak a tally the chart contradicts`);
  // AND THE ARM IS NOT VACUOUS — a corpus where nothing speaks a tally proves nothing.
  assert.ok(spoke > 20, `only ${spoke} decks spoke a tally at all`);
});

/**
 * THE DECKS BEHIND EACH RULE, kept as fixtures rather than left to the generator.
 *
 * A corpus finds shapes nobody thought of; it is a poor way to PIN a rule, because
 * the shape a rule turns on can drift out of the draw and take the rule's only killer
 * with it. Both have happened here — the tab rule shipped for two rounds with no
 * killer, and the enclosure-stack rule lost its own when the generator was rebalanced.
 *
 * Every entry is a deck a checker or a real export produced, with the reading the
 * transform gives. `tally: null` means the voice must speak no whole-chart claim at
 * all; a string means it must say exactly that.
 */
const REGRESSION_DECKS = [
  {
    name: 'a paragraph between rows ends the list the chart draws',
    // Real --captions export: the chart scored two rows and the voice said
    // "one of three cleared the plan line", with a plan line for a row drawn as
    // an ordinary bullet.
    //
    // NO TALLY, EVEN THOUGH ONE OVER THE FIRST TWO ROWS WOULD BE RIGHT HERE. The
    // stop cannot tell a TRUE list end from a false one — a lazy continuation looks
    // identical and keeps one list — so a whole-chart claim after any truncation is
    // a guess. The rows it did read are still read, and the rest is read verbatim.
    src: '<!-- _class: bullet -->\n\n## H.\n\n- Uptime `99.9%` `99.5%`\n- Latency `180ms` `200ms`\n\nMeasured at quarter end.\n\n- Churn `2%` `3%`',
    tally: null,
    // THE NUMBERS SURVIVE THE LOST SENTENCE — the contract the whole refusal rests on.
    speaks: [/Uptime, ninety-nine point nine percent against a ninety-nine point five percent target/i, /Churn 2% 3%/],
  },
  {
    name: 'a lazy line between rows truncates the scan, so no tally',
    src: '<!-- _class: bullet -->\n\n## H.\n\n- Alpha `5` `4`\n- Beta `9` `4`\n- Methodology\nmeasured at quarter end.\n- Gamma `2` `4`',
    tally: null,
  },
  {
    name: 'a prose row with a paragraph INSIDE its item keeps the whole list',
    // The narrowing that pays for the rule above: a two-space paragraph under an
    // ordinary `- ` row is inside the item, the list continues, and stopping there
    // silenced four correct readings and made the tally speak over a prefix.
    src: '<!-- _class: bullet -->\n\n## H.\n\n- Alpha `5` `4`\n- Beta `9` `4`\n- Methodology\n\n  Measured at quarter end.\n\n- Gamma `2` `4`\n- Delta `1` `4`',
    tally: 'two of four cleared the plan line',
  },
  {
    name: 'a fenced block between rows ends the list',
    src: '<!-- _class: bullet -->\n\n## H.\n\n- Uptime `5` `4`\n\n```\nformat: measure target\n```\n\n- Latency `2` `4`\n- Churn `9` `4`',
    tally: null,
  },
  {
    name: 'an ordered list ABOVE the rows is the list the chart draws',
    src: '<!-- _class: bullet -->\n\n## H.\n\n1. Alpha `5` `4`\n2. Beta `2` `4`\n\n- Churn `2` `3`\n- Renewal `4` `5`',
    tally: null,
  },
  {
    name: 'an ordinary loose list still reads — the refusal is not total',
    src: '<!-- _class: bullet -->\n\n## H.\n\n- Uptime `99.9%` `99.5%`\n\n  - Target `99.5%`\n\n- Latency `180ms` `200ms`',
    tally: 'one of two cleared the plan line',
  },
  {
    name: 'a grandchild is not the row\'s own target',
    // Single-slot enclosure read `4.2M` off a child of `Floor`; the transform reads
    // the row's own `1`.
    src: '<!-- _class: bullet -->\n\n## H.\n\n- Row0 `1` `4.2M`\n- Row1 `4.2M`\n- Row2 `80%` `1`\n  - `Floor` `5`\n    - note\n    - `Target` `4.2M`',
    tally: null,
  },
];

test('every refusal has a deck behind it, and the deck still says what the chart says', () => {
  for (const d of REGRESSION_DECKS) {
    const said = narrateBullet(d.src);
    const spoken = spokenTally(said);
    for (const re of d.speaks || []) assert.match(said || '', re, `${d.name}: lost a reading it should keep`);
    if (d.tally === null) {
      assert.equal(spoken, null, `${d.name}: expected no tally, got "${said}"`);
      continue;
    }
    assert.ok(said, `${d.name}: narrated nothing`);
    assert.ok(new RegExp(d.tally, 'i').test(said), `${d.name}: expected "${d.tally}", got "${said}"`);
    // AND THE NUMBERS ARE THE CHART'S OWN, not just the ones written here.
    const t = transformTally(d.src);
    const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
    if (spoken?.kind === 'some') {
      assert.equal(spoken.cleared, NUM[t.cleared], `${d.name}: cleared`);
      assert.equal(spoken.scored, NUM[t.scored], `${d.name}: scored`);
    } else if (spoken?.kind === 'all') {
      assert.equal(spoken.scored, NUM[t.scored], `${d.name}: scored`);
      assert.equal(t.cleared, t.scored, `${d.name}: all-clear`);
    }
  }
});

test('a word cloud whose list is cut short names no leader', () => {
  // Every sentence this narrator speaks is a whole-set claim, so a prefix is not
  // quieter, it is wrong. Real render: the canvas drew `delta` at twenty in the
  // accent color while the voice announced `alpha` at nine as the biggest.
  const src = '<!-- _class: word-cloud -->\n\n## Themes.\n\n- alpha `9`\n- beta `7`\n- gamma\nmeasured at quarter end\n- delta `20`\n- epsilon `1`';
  assert.equal(narrateWordCloud(src), null, 'a truncated cloud must not name a biggest term');
  // …and an uninterrupted one still does.
  const whole = '<!-- _class: word-cloud -->\n\n## Themes.\n\n- alpha `9`\n- beta `7`\n- delta `20`\n- epsilon `1`';
  assert.match(narrateWordCloud(whole) || '', /delta is the biggest at twenty/i);
});

test('a row marker this parser does not read makes the narrator bail, not guess', () => {
  // `*` and `+` are legal CommonMark and `isTopLevelBullet` matches neither. The
  // safe outcome is `null` — `slideToSpeech` then reads the slide as it always has.
  // The unsafe one would be reading SOME rows and tallying over them.
  for (const marker of ['*', '+']) {
    const src = `<!-- _class: bullet -->\n\n## H.\n\n${marker} A \`5\` \`4\`\n${marker} B \`2\` \`4\``;
    assert.equal(narrateBullet(src), null, `${marker} should bail`);
  }
  // …and `-` still narrates.
  assert.ok(narrateBullet('<!-- _class: bullet -->\n\n## H.\n\n- A `5` `4`\n- B `2` `4`').includes('cleared the plan line'));
});

test('the corpus reaches every axis a checker has found a defect on', () => {
  // Each of these was, in some round, the axis the corpus was narrow on while the
  // fuzz reported zero. Counted so that can never be true silently again.
  // A BIGGER DRAW FOR THIS CELL ONLY. One perturbation per deck means each axis gets
  // roughly `count / axes / shapes-in-that-pool` decks, so 500 leaves the narrower
  // pools with single digits and a floor that fails on noise. Generating strings is
  // cheap; comparing parses is not, so the surveys above stay at 500.
  const decks = corpus(4000);
  const axes = {
    'tab-only child': /\n\t[-*+] /,
    'multi-tab child': /\n\t\t[-*+] /,
    'mixed space-tab child': /\n {2}\t[-*+] /,
    'one-space child': /\n [-*+] /,
    'three-space child': /\n {3}[-*+] /,
    'four-column child': /\n {6}[-*+] /,
    'wide row gap': /\n[-*+] {3,}Row/,
    '`*` marker': /^\* /m,
    '`+` marker': /^\+ /m,
    'lazy continuation': /\n {2}a continuation/,
    'ordered sublist': /\n {4}1\. ordered/,
    'blank then content': /\n\n {2}after a blank/,
    'code-spanned key': /`(?:Target|Floor)` `/,
    'lazy break between rows': /\nMeasured at quarter end\.\n[-*+]/,
    'blank + column-0 break': /\n\nMeasured at quarter end\.\n\n/,
    'blank + indented break': /\n\n {2}after a blank\n\n/,
  };
  for (const [name, re] of Object.entries(axes)) {
    const n = decks.filter((d) => re.test(d)).length;
    assert.ok(n > 5, `only ${n} decks carry a ${name}`);
  }
});
