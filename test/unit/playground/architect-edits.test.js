/**
 * Unit: the Converse editing engine (Slice B). The model proposes edits; this is
 * the pure core that parses the protocol, splices the deck surgically, and diffs
 * it for review. All of it MUST be correct regardless of the model — a bad splice
 * would corrupt the author's deck — so it's exhaustively covered here. The DOM
 * cards (Apply/Discard) are verified headless against these same functions.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/ai/architect-edits.js');
}

const DECK = ['# One', '', 'body one', '---', '## Two', '', 'body two', '---', '### Three'].join('\n');

describe('parseEdits', () => {
  test('extracts a four-backtick replace block and returns the prose without it', async () => {
    const { parseEdits } = await load();
    const reply = 'Tightened slide 2.\n\n````lattice-edit slide=2\n## Two (tighter)\n\nbody\n````\n\nDone.';
    const { text, edits } = parseEdits(reply);
    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0], { action: 'replace', slide: 2, body: '## Two (tighter)\n\nbody' });
    assert.match(text, /Tightened slide 2\./);
    assert.match(text, /Done\./);
    assert.doesNotMatch(text, /lattice-edit/);
  });

  test('a slide body may itself contain a triple-backtick chart fence', async () => {
    const { parseEdits } = await load();
    const reply = '````lattice-edit slide=1\n<!-- _class: big-number -->\n```chart\nbar\n10\n```\n````';
    const { edits } = parseEdits(reply);
    assert.equal(edits.length, 1);
    assert.match(edits[0].body, /```chart\nbar\n10\n```/); // the inner fence survives
  });

  test('parses insert (after=N, after=end) and delete', async () => {
    const { parseEdits } = await load();
    const ins = parseEdits('````lattice-edit after=2\n## New\n````').edits[0];
    assert.equal(ins.action, 'insert');
    assert.equal(ins.slide, 2);
    const end = parseEdits('````lattice-edit after=end\n## Last\n````').edits[0];
    assert.equal(end.slide, Number.MAX_SAFE_INTEGER);
    const del = parseEdits('````lattice-edit delete=3\n````').edits[0];
    assert.deepEqual(del, { action: 'delete', slide: 3, body: '' });
  });

  test('multiple blocks parse in order; an unrecognised block stays in the prose', async () => {
    const { parseEdits } = await load();
    const reply = '````lattice-edit slide=1\nA\n````\nmid\n````lattice-edit bogus=1\nkeep me\n````';
    const { text, edits } = parseEdits(reply);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].slide, 1);
    assert.match(text, /keep me/); // malformed block left intact, not swallowed
  });

  test('no blocks → all prose, no edits', async () => {
    const { parseEdits } = await load();
    const { text, edits } = parseEdits('Just advice, no edits here.');
    assert.equal(edits.length, 0);
    assert.equal(text, 'Just advice, no edits here.');
  });
});

// LINE ENDINGS AT THE MODEL BOUNDARY. A model reply is external input and models DO emit CRLF.
// `applyEdit` splices an edit body VERBATIM into deck source, so an unnormalized reply produced a
// MIXED-EOL deck that was then persisted to localStorage and shared out that way — against the
// house rule that every export is LF. `parseEdits` is the funnel every edit body crosses, so it
// normalizes there rather than per-edit inside `applyEdit`; these assert through the funnel, on
// raw CRLF input, so they fail if the normalization moves or is removed.
describe('parseEdits — line endings', () => {
  test('a CRLF edit block yields an LF body, so the splice cannot produce a mixed-EOL deck', async () => {
    const { parseEdits, applyEdit } = await load();
    const reply = 'Here you go.\r\n\r\n```lattice-edit slide=1\r\n# One\r\n\r\nnew body\r\n```\r\n';
    const { edits } = parseEdits(reply);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].body, '# One\n\nnew body');
    const out = applyEdit(DECK, edits[0]);
    assert.equal(/\r/.test(out), false, 'the spliced deck must carry no carriage return');
  });

  test('the PROSE half is normalized too — it is rendered as chat', async () => {
    const { parseEdits } = await load();
    // (the prose is trimmed by `parseEdits` — the assertion here is the absence of `\r`)
    const { text } = parseEdits('First line.\r\nSecond line.\r\n');
    assert.equal(text, 'First line.\nSecond line.');
  });

  test('lone CR is covered, which a reader-style `\\r?\\n` could not be', async () => {
    const { parseEdits } = await load();
    const { edits } = parseEdits('```lattice-edit slide=1\r# One\r\rbody\r```');
    assert.equal(edits.length, 1);
    assert.equal(edits[0].body, '# One\n\nbody');
  });
});

describe('applyEdit — replace', () => {
  test('replaces only the target slide, preserving the others byte-for-byte', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(DECK, { action: 'replace', slide: 2, body: '## Two!\n\nnew body' });
    assert.match(out, /## Two!/);
    assert.match(out, /new body/);
    assert.doesNotMatch(out, /body two/); // old content gone
    assert.match(out, /# One\n\nbody one/); // slide 1 untouched
    assert.match(out, /### Three/); // slide 3 untouched
    assert.equal(out.split(/^---$/m).length, 3); // still three slides
  });

  test('keeps the slide’s blank-line cushion around the separators', async () => {
    const { applyEdit } = await load();
    const deck = 'A\n\n---\n\nB\n\n---\n\nC';
    const out = applyEdit(deck, { action: 'replace', slide: 2, body: 'BB' });
    assert.equal(out, 'A\n\n---\n\nBB\n\n---\n\nC');
  });

  test('an out-of-range slide leaves the deck unchanged', async () => {
    const { applyEdit } = await load();
    assert.equal(applyEdit(DECK, { action: 'replace', slide: 9, body: 'x' }), DECK);
    assert.equal(applyEdit(DECK, { action: 'replace', slide: 0, body: 'x' }), DECK);
  });
});

describe('applyEdit — insert', () => {
  test('after=N drops a new slide in after slide N', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(DECK, { action: 'insert', slide: 1, body: '## Inserted' });
    const slides = out.split(/^---$/m).map((s) => s.trim());
    assert.equal(slides.length, 4);
    assert.equal(slides[1], '## Inserted');
    assert.match(slides[0], /# One/);
    assert.match(slides[2], /## Two/);
  });

  test('after=0 prepends, after=end (huge N) appends', async () => {
    const { applyEdit } = await load();
    const pre = applyEdit(DECK, { action: 'insert', slide: 0, body: 'TOP' }).split(/^---$/m).map((s) => s.trim());
    assert.equal(pre[0], 'TOP');
    const app = applyEdit(DECK, { action: 'insert', slide: Number.MAX_SAFE_INTEGER, body: 'END' }).split(/^---$/m).map((s) => s.trim());
    assert.equal(app[app.length - 1], 'END');
    assert.equal(app.length, 4);
  });
});

describe('applyEdit — delete', () => {
  test('removes a middle slide and one separator (no dangling ---)', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(DECK, { action: 'delete', slide: 2 });
    const slides = out.split(/^---$/m).map((s) => s.trim());
    assert.equal(slides.length, 2);
    assert.match(slides[0], /# One/);
    assert.match(slides[1], /### Three/);
    assert.doesNotMatch(out, /## Two/);
  });

  test('removes the last slide cleanly', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(DECK, { action: 'delete', slide: 3 });
    assert.equal(out.split(/^---$/m).length, 2);
    assert.doesNotMatch(out, /### Three/);
  });
});

describe('sliceSlide + slideCount', () => {
  test('reads a slide’s trimmed content; counts slides', async () => {
    const { sliceSlide, slideCount } = await load();
    assert.equal(slideCount(DECK), 3);
    assert.equal(sliceSlide(DECK, 1), '# One\n\nbody one');
    assert.equal(sliceSlide(DECK, 3), '### Three');
    assert.equal(sliceSlide(DECK, 9), ''); // out of range
  });
});

describe('numberSlides (prompt view)', () => {
  test('annotates each slide with a [slide N] marker', async () => {
    const { numberSlides } = await load();
    const out = numberSlides(DECK);
    assert.match(out, /\[slide 1\]\n# One/);
    assert.match(out, /\[slide 2\]\n## Two/);
    assert.match(out, /\[slide 3\]\n### Three/);
  });

  test('empty source → empty string', async () => {
    const { numberSlides } = await load();
    assert.equal(numberSlides(''), '');
    assert.equal(numberSlides('   '), '');
  });
});

describe('front matter is excluded from slide numbering (human 1-based)', () => {
  const FM_DECK = ['---', 'marp: true', '---', '', '<!-- _class: title -->', '# One', '---', '## Two', '', 'body two'].join('\n');

  test('numberSlides drops front matter and numbers real slides from 1', async () => {
    const { numberSlides } = await load();
    const out = numberSlides(FM_DECK);
    assert.match(out, /\[slide 1\]\n<!-- _class: title -->/);
    assert.match(out, /\[slide 2\]\n## Two/);
    assert.doesNotMatch(out, /marp: true/); // front matter isn't shown as a slide
  });

  test('slideCount + sliceSlide address real slides, not the YAML', async () => {
    const { slideCount, sliceSlide } = await load();
    assert.equal(slideCount(FM_DECK), 2);
    assert.match(sliceSlide(FM_DECK, 1), /# One/);
    assert.match(sliceSlide(FM_DECK, 2), /## Two/);
    assert.equal(sliceSlide(FM_DECK, 3), ''); // out of range
  });

  test('applyEdit replace targets the right real slide and keeps the front matter', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(FM_DECK, { action: 'replace', slide: 1, body: '<!-- _class: title -->\n# One!' });
    assert.match(out, /^---\nmarp: true\n---/); // front matter intact
    assert.match(out, /# One!/);
    assert.match(out, /## Two\n\nbody two/); // slide 2 untouched
  });

  test('applyEdit delete removes the addressed real slide, not the YAML', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(FM_DECK, { action: 'delete', slide: 1 });
    assert.match(out, /marp: true/); // front matter survives
    assert.doesNotMatch(out, /# One/); // real slide 1 gone
    assert.match(out, /## Two/);
  });

  test('applyEdit insert keeps the front-matter fence valid (no reformatting)', async () => {
    const { applyEdit } = await load();
    const pre = applyEdit(FM_DECK, { action: 'insert', slide: 0, body: '## NEW FIRST' });
    assert.match(pre, /^---\nmarp: true\n---\n\n/); // fence intact at the very top
    const slides = pre.replace(/^---\nmarp: true\n---\n\n/, '').split(/^---$/m).map((s) => s.trim());
    assert.equal(slides[0], '## NEW FIRST'); // new real slide 1
    assert.match(slides[1], /# One/);
  });
});

describe('diffLines', () => {
  test('marks added, removed, and unchanged lines', async () => {
    const { diffLines } = await load();
    const d = diffLines('a\nb\nc', 'a\nB\nc');
    assert.deepEqual(d.map((x) => x.type), ['same', 'del', 'add', 'same']);
    assert.equal(d.find((x) => x.type === 'add').text, 'B');
    assert.equal(d.find((x) => x.type === 'del').text, 'b');
  });

  test('pure additions / deletions', async () => {
    const { diffLines } = await load();
    assert.deepEqual(diffLines('', 'x').map((x) => x.type), ['del', 'add']); // '' splits to one empty line
    assert.ok(diffLines('a\nb', 'a').some((x) => x.type === 'del'));
  });
});

describe('parse → apply round trips (the whole protocol)', () => {
  test('a replace block from a reply applies to the right slide', async () => {
    const { parseEdits, applyEdit } = await load();
    const { edits } = parseEdits('Here:\n````lattice-edit slide=3\n### Three (edited)\n````');
    const out = applyEdit(DECK, edits[0]);
    assert.match(out, /### Three \(edited\)/);
    assert.match(out, /## Two\n\nbody two/); // neighbours intact
  });
});

// A slide that DEMONSTRATES markdown (a `---` inside a code fence) must not desync the
// slide numbering — the splice is fence-aware now, so the AI fix targets the right slide.
const FENCED = ['# Intro', '', '---', '', '<!-- _class: code -->', '```', 'a', '---', 'b', '```', '', '---', '', '# Outro'].join('\n');

describe('fence-aware slide boundaries', () => {
  test('slideCount ignores a --- inside a code fence', async () => {
    const { slideCount } = await load();
    assert.equal(slideCount(FENCED), 3); // Intro · code · Outro — NOT 4
  });
  test('numberSlides keeps the fenced --- inside its slide', async () => {
    const { numberSlides } = await load();
    const view = numberSlides(FENCED);
    assert.match(view, /\[slide 1\]/);
    assert.match(view, /\[slide 2\]/);
    assert.match(view, /\[slide 3\]/);
    assert.doesNotMatch(view, /\[slide 4\]/);
    assert.match(view, /a\n---\nb/); // the sample survives intact inside slide 2
  });
  test('sliceSlide reads the slide that owns the fenced ---', async () => {
    const { sliceSlide } = await load();
    assert.match(sliceSlide(FENCED, 2), /a\n---\nb/);
    assert.match(sliceSlide(FENCED, 3), /# Outro/);
  });
  test('applyEdit replace targets the correct slide past a fenced ---', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(FENCED, { action: 'replace', slide: 3, body: '# Outro (edited)' });
    assert.match(out, /# Outro \(edited\)/);
    assert.match(out, /a\n---\nb/); // the code sample is untouched
  });
  test('applyEdit refuses a replace body that smuggles a top-level --- (would inject a slide)', async () => {
    const { applyEdit } = await load();
    const out = applyEdit(DECK, { action: 'replace', slide: 2, body: '## Two\n\n---\n\n## Sneaky extra slide' });
    assert.equal(out, DECK); // rejected — the deck is unchanged, not corrupted
  });
  test('applyEdit ACCEPTS a replace body whose --- sits inside a CLOSED fence (fence-aware, not blunt)', async () => {
    const { applyEdit } = await load();
    const body = '<!-- _class: code -->\n\n```md\ntitle: X\n---\nbody\n```';
    const out = applyEdit(DECK, { action: 'replace', slide: 2, body });
    assert.notEqual(out, DECK); // admitted
    assert.match(out, /title: X\n---\nbody/); // the fenced sample landed intact
  });
  test('applyEdit refuses a replace body with an UNCLOSED fence (would swallow the next real ---)', async () => {
    const { applyEdit } = await load();
    // The unclosed ``` would eat the deck's next `---`, trapping slide 3 inside slide 2.
    const out = applyEdit(DECK, { action: 'replace', slide: 2, body: '## Two\n\n```\n---\nstill in fence' });
    assert.equal(out, DECK); // rejected — trio red-team finding
  });
  test('applyEdit insert ACCEPTS a multi-slide body, landing one slide per --- (the "add these slides" shape)', async () => {
    const { applyEdit, slideCount } = await load();
    const before = slideCount(DECK);
    const out = applyEdit(DECK, { action: 'insert', slide: 1, body: '## A\n\n---\n\n## B' });
    assert.equal(slideCount(out), before + 2); // two slides, not one blob and not a silent refusal
    assert.match(out, /## A/);
    assert.match(out, /## B/);
  });
  test('applyEdit insert still refuses an UNCLOSED fence (it would swallow the next real ---)', async () => {
    const { applyEdit } = await load();
    assert.equal(applyEdit(DECK, { action: 'insert', slide: 1, body: '## A\n\n```\nunclosed' }), DECK);
  });
  test('the lib splitter and the architect-edits copy agree (no drift between the two hand-maintained fence trackers)', async () => {
    const lib = require('../../../lib/authoring/slide-split.js');
    const ae = await load();
    const corpus = [
      '',
      '# one',
      '---\nmarp: true\n---\n\n# S1\n\n---\n\n# S2\n',
      FENCED,
      '# A\n\n---\n\n```\na\n---\nb\n```\n\n---\n\n# C',
      'a\r\n---\r\nb\r\n---\r\nc', // CRLF
      '~~~md\nfront\n---\nback\n~~~',
      '```\nunclosed\n---\nstill in',
      '--- \n', // trailing space (both preserve naive behavior: not a split)
    ];
    for (const src of corpus) {
      assert.deepEqual(ae.splitTopLevel(src), lib.splitTopLevel(src), `splitTopLevel drift on: ${JSON.stringify(src)}`);
      assert.equal(ae.fenceOpen(src), lib.fenceOpen(src), `fenceOpen drift on: ${JSON.stringify(src)}`);
      const lines = src.split('\n');
      assert.deepEqual([...ae.separatorLines(lines)], [...lib.separatorLines(lines)], `separatorLines drift on: ${JSON.stringify(src)}`);
    }
  });
});

// ── The chat-churn regressions (2026-08-04) ─────────────────────────────────
// Five failures that all presented the same way to the author: the Architect said it
// had done something, the app agreed, and the deck hadn't moved (or had moved WRONG).
// Each case below is a transcript reproduction, not a hypothetical.
// See engineering/decisions/2026-08-04-chat-edit-protocol.md.
describe('edit protocol — the failures that produced silent corruption', () => {
  const TICK = '`'.repeat(3);
  // A slide of the shape that broke everything: a diagram slide carrying its own fence.
  const DIAGRAM = `<!-- _class: diagram -->\n\n## Class diagram\n\n${TICK}mermaid\nclassDiagram\n  class Order { +id }\n${TICK}`;

  test('a TILDE wrapper carries a ```mermaid payload intact (the protocol we now publish)', async () => {
    const { parseEdits } = await load();
    const { edits, problems } = parseEdits(`Here.\n\n~~~lattice-edit slide=2\n${DIAGRAM}\n~~~\n`);
    assert.equal(problems.length, 0);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].body.trim(), DIAGRAM); // the whole slide, fence and all
  });

  test('a BACKTICK wrapper closed by its own payload is REPORTED, never half-applied', async () => {
    const { parseEdits } = await load();
    // The payload's bare ``` legally closes a same-marker wrapper (CommonMark), so the
    // body arrives amputated at the diagram. This used to be applied as a heading-only slide.
    const { edits, problems } = parseEdits(`Here.\n\n${TICK}lattice-edit slide=2\n${DIAGRAM}\n${TICK}\n`);
    assert.equal(edits.length, 0, 'nothing is applied on a guess');
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, 'fence-collision');
    assert.match(problems[0].message, /slide 2/);
  });

  test('a reply CUT OFF at max_tokens is reported as unterminated, not salvaged', async () => {
    const { parseEdits } = await load();
    // The old expression recovered by re-matching a SHORTER fence, cutting the body at the
    // payload's first ``` — so a truncated deck became a slide with its diagram amputated.
    const { edits, problems } = parseEdits(`Done — 13 slides added.\n\n${'`'.repeat(4)}lattice-edit after=end\n${DIAGRAM.slice(0, 70)}`);
    assert.equal(edits.length, 0);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, 'unterminated');
  });

  test('a four-backtick opener cannot degrade into a three-backtick match (line-anchored)', async () => {
    const { parseEdits } = await load();
    const four = '`'.repeat(4);
    const { edits, problems } = parseEdits(`x\n\n${four}lattice-edit slide=1\n${DIAGRAM}\n${four}\n`);
    assert.equal(problems.length, 0);
    assert.equal(edits.length, 1);
    assert.match(edits[0].body, /class Order/, 'the payload survived past its own fence');
  });

  test('applyEditChecked REPORTS a refusal instead of returning the source silently', async () => {
    const { applyEditChecked } = await load();
    const past = applyEditChecked(DECK, { action: 'replace', slide: 9, body: '## Nope' });
    assert.equal(past.ok, false);
    assert.equal(past.source, DECK);
    assert.match(past.reason, /Slide 9 doesn't exist/);
    assert.match(past.reason, /3 slides/); // says what the deck actually has

    const split = applyEditChecked(DECK, { action: 'replace', slide: 2, body: '## A\n\n---\n\n## B' });
    assert.equal(split.ok, false);
    assert.match(split.reason, /more than one slide/);

    const unclosed = applyEditChecked(DECK, { action: 'insert', slide: 1, body: `## A\n\n${TICK}\nunclosed` });
    assert.equal(unclosed.ok, false);
    assert.match(unclosed.reason, /never closes/);
  });

  test('a rewrite identical to the current slide is a refusal, not an "Applied"', async () => {
    const { applyEditChecked } = await load();
    const noop = applyEditChecked(DECK, { action: 'replace', slide: 1, body: '# One\n\nbody one' });
    assert.equal(noop.ok, false);
    assert.match(noop.reason, /identical/);
  });

  test('a multi-slide insert lands every slide and reports how many', async () => {
    const { applyEditChecked, slideCount } = await load();
    const r = applyEditChecked(DECK, { action: 'insert', slide: 3, body: '## A\n\n---\n\n## B\n\n---\n\n## C' });
    assert.equal(r.ok, true);
    assert.equal(r.inserted, 3);
    assert.equal(slideCount(r.source), slideCount(DECK) + 3);
  });

  test('EDIT_PROTOCOL tells the model to use tildes, and that it has no tools', async () => {
    const { EDIT_PROTOCOL } = await load();
    assert.match(EDIT_PROTOCOL, /~~~lattice-edit/, 'the EXAMPLE is what a model copies');
    assert.doesNotMatch(EDIT_PROTOCOL, /````lattice-edit/, 'no four-backtick example left to imitate');
    assert.match(EDIT_PROTOCOL, /NO tools/i);
    assert.match(EDIT_PROTOCOL, /Never say you tested/i);
  });
});
