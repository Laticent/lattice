const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { parseBullet } = require('../../../lib/components/chart/bullet/bullet.transform.js');
const { extractFirstList } = require('../../../lib/core/html-lists.js');
const { __parseBulletRowsForTest, narrateBullet } = require('../../../lib/core/chart-narration.js');

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
// `-` DOMINATES, because `isTopLevelBullet` matches only `-` and every deck in this
// repo uses it. `*` and `+` rows make `narrateBullet` return null and the base
// flattener reads the slide — a coverage gap, not a wrong reading, and pinned as
// such in its own cell below. Left at equal odds they drowned the corpus: 494 of 500
// decks never reached the row-for-row comparison at all.
const MARKERS = ['-', '-', '-', '-', '*', '+'];
// WEIGHTED TOWARD WHAT AUTHORS WRITE. A single space after the marker and a
// two-space child are the overwhelming norm; the odd shapes are here because four
// review rounds found a defect on each, not because they are common. Left at equal
// odds they swallow the corpus — 75% of rows carried a wide gap, every one of them
// was refused, and only 6 of 500 decks reached the exact-match floor below. A
// corpus that is mostly malformed measures the generator, not the narrator.
const GAPS = [' ', ' ', ' ', ' ', ' ', ' ', '  ', '   ', '     '];
// A SINGLE TAB IS NOT A TAB TEST, and it took a mutation to find that out. `'\t'`
// is one character, so the one-space-sibling rule (`indentNow < 2`) refuses it
// before the tab clause is ever consulted — delete the tab rule from the narrator
// and this corpus stayed green across all 10,384 unit tests. `'\t\t'` and `'  \t'`
// are the shapes that actually reach it, and they are here so the rule has a
// killer. Two more `'  '` entries hold the normal-authoring weight where it was.
const INDENTS = ['  ', '  ', '  ', '  ', '  ', '  ', '   ', '    ', '      ', ' ', '\t', '\t\t', '  \t'];
const KEYS = ['Target', 'Floor', 'Band', 'Actual', 'Plan', '`Target`', '`Floor`'];
const VALUES = ['1', '4', '5', '80%', '4.2M', '99.4%'];
// SAME WEIGHTING AS THE OTHER AXES, and for the third time the reason is the same:
// four of these five tails are shapes a checker found a defect on, not shapes an
// author writes. At equal odds they dominate, the refusal fires on nearly every
// deck, and the exact-match floor below stops measuring the narrator.
const TAILS = ['', '', '', '', '', '\n    - note', '\n  a continuation', '\n    1. ordered', '\n\n  after a blank'];
// WHAT ENDS THE LIST, which is a WHOLE-CHART axis and not a row one. The transform
// draws one list (`extractFirstList`); a block between two rows can close it and
// open a second, and the voice then tallies rows the picture never draws. Nine
// rounds of this work could not produce that deck: every axis above varies a row or
// a child, and none of them interrupts. The defect was found by hand and reproduced
// on the real `--captions` export. Weighted low for the same reason as every other
// odd axis — at equal odds the interruption lands on most decks and the corpus stops
// measuring the narrator.
const BREAKS = ['', '', '', '', '', '', '', '', 'Measured at quarter end.', '\nMeasured at quarter end.\n', '\n  after a blank\n'];

function corpus(count, startSeed = 20260921) {
  let seed = startSeed;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const decks = [];
  for (let d = 0; d < count; d++) {
    const lines = [];
    const rows = 2 + Math.floor(rnd() * 3);
    // ONE MARKER PER DECK. Mixing `-` and `+` in one list starts a SECOND list in
    // CommonMark, and the slide then has two `<ul>`s — a real behavior, but not one
    // an author writes, and comparing against only the first was a bug in this
    // harness rather than a finding about the narrator. The marker still varies
    // ACROSS decks, which is the axis that matters.
    const marker = pick(MARKERS);
    for (let i = 0; i < rows; i++) {
      const pills = rnd() < 0.5 ? ` \`${pick(VALUES)}\`` : ` \`${pick(VALUES)}\` \`${pick(VALUES)}\``;
      lines.push(`${marker}${pick(GAPS)}Row${i}${pills}`);
      const kids = Math.floor(rnd() * 3);
      for (let k = 0; k < kids; k++) {
        lines.push(`${pick(INDENTS)}${marker} ${pick(KEYS)} \`${pick(VALUES)}\`${pick(TAILS)}`);
      }
      // Between rows only — a break after the last row ends nothing.
      if (i < rows - 1) {
        const br = pick(BREAKS);
        if (br) lines.push(br);
      }
    }
    decks.push(`<!-- _class: bullet -->\n\n## H.\n\n${lines.join('\n')}`);
  }
  return decks;
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
  const r = survey(corpus(500));
  assert.ok(r.checked > 100, `only ${r.checked} decks were compared row-for-row`);
  // AND THE REFUSAL HOLDS WHERE THE COUNTS DISAGREE. A deck narration reads with a
  // different number of rows than the chart draws must never speak a tally — that
  // is the whole-chart claim, and the row count is exactly what it depends on.
  assert.equal(r.tallyWhileCountsDiffer, 0,
    `${r.tallyWhileCountsDiffer} decks speak a tally while reading a different number of rows than the chart draws`);
  assert.deepEqual(
    r.diverged.slice(0, 2).map((d) => ({ row: d.row, transform: d.transform, narration: d.narration, src: d.src })),
    [],
    `${r.diverged.length} of ${r.checked} decks read a row differently from the transform`,
  );
  // AND THE REFUSAL IS NOT SILENTLY TOTAL. If narration declined every field on
  // every deck this cell would pass while saying nothing, which is the failure mode
  // the tally floor exists for one level up.
  // AND THE REFUSAL IS BROAD, WHICH IS THE COST. On this corpus 37 of 165 comparable
  // decks read every row exactly as the transform does and 128 read at least one row
  // more quietly. That is the price of "never something different": on unusual
  // markdown narration says less than it safely could.
  //
  // ON THE DECKS THIS REPO SHIPS IT COSTS NOTHING — 16 bullet slides, 14 narrate, and
  // not one reads differently than it did before any of this. The corpus is weighted
  // toward real authoring for exactly that reason, and this floor is what stops the
  // refusal quietly swallowing it anyway.
  assert.ok(r.exact > 30,
    `only ${r.exact} decks read every row EXACTLY as the transform does — the refusal has swallowed the corpus`);
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
  const decks = corpus(500);
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
    'lazy break between rows': /\n[-*+][^\n]*\nMeasured at quarter end\.\n[-*+]/,
    'blank + column-0 break': /\n\nMeasured at quarter end\.\n\n/,
    'blank + indented break': /\n\n {2}after a blank\n\n/,
  };
  for (const [name, re] of Object.entries(axes)) {
    const n = decks.filter((d) => re.test(d)).length;
    assert.ok(n > 5, `only ${n} decks carry a ${name}`);
  }
});
