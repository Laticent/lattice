/**
 * Unit: lib/authoring/notes-core.js — the pure presenter-notes extractor and the privacy scrubs.
 *
 * notes-core reads a slide's four notes (`<!-- @note{…} -->`, `@say`, `@alt`, `@handout`) from engine-rendered slide
 * HTML and classifies every SOURCE comment for the `--strip-notes` / `--strip-say` scrubs. A plain comment is not a
 * note and reaches no channel (engineering/decisions/2026-11-20-four-notes.md); the grammar is
 * lib/core/note-grammar.mjs.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/notes-core');
const { charReads } = require('../../helpers/work-count');
const { assertLinearRegexes, normalKey } = require('../../helpers/regex-trace');

// Work, not milliseconds (HARD RULE #32). A malformed-input guard here makes two checks: every regex the call runs is
// linear (tools/regex-census.json, or a reason below for one built at run time or taken from markdown-it), and the
// call touches each character a bounded number of times (charCodeAt, copies and string searches, counted). Each bound
// sits about twice above today's count, and the quadratic shapes these guards were written for read thousands per
// character at these sizes.
const LINEAR_ALLOW = {
  [normalKey('\\r\\n?|\\n', 'g')]: "markdown-it's line-ending normalizer: a fixed one- or two-character match at each position",
  [normalKey('^<(script|pre|style|textarea)(?=(\\s|>|$))', 'i')]: "markdown-it's HTML block start: anchored, a fixed word and a one-character look-ahead",
  [normalKey('-->', '')]: "markdown-it's HTML block end: a literal",
  [normalKey('^<\\/?(?:' + core.HTML_BLOCK_NAMES + ')(?=\\s|\\/?>|$)', 'i')]: 'anchored at the line start: one of a fixed list of names and a one-character look-ahead',
};
// notes-core builds its own tag pattern per call, around a nonce it picks (`zq<n>lcn`): a literal, digits and a letter.
const allowFor = (keys) => {
  const allow = { ...LINEAR_ALLOW };
  for (const k of keys) if (/^\/<!--zq\d+lcn\(\\d\+\)e\/g$/.test(k)) allow[k] = 'a literal nonce, a run of digits and a letter: linear';
  return allow;
};
function linearWork(fn, length, perChar, what) {
  const { traceRegexes } = require('../../helpers/regex-trace');
  const { keys } = traceRegexes(fn);
  const { result, reads, scanned } = charReads(() => assertLinearRegexes(fn, { allow: allowFor(keys) }).result);
  const per = (reads + scanned) / length;
  assert.ok(per <= perChar, `${what}: ${per.toFixed(1)} reads per character, over ${perChar}`);
  return result;
}
const { splitSections: splitSectionsCore } = require('@laticent/markup');

const sec = (inner) => `<section data-lattice-slide="1">${inner}</section>`;

describe('notes-core: isToolingComment', () => {
  for (const pragma of [
    'prettier-ignore',
    'prettier-ignore-start',
    'prettier-ignore-end',
    'markdownlint-disable',
    'markdownlint-disable MD033',
    'markdownlint-disable-next-line MD026',
    'markdownlint-enable',
    'markdownlint-capture',
    'markdownlint-restore',
    'lint disable',
    'lint enable no-undefined-references',
    'lint ignore',
  ]) {
    test(`pragma excluded: "${pragma}"`, () => {
      assert.equal(core.isToolingComment(pragma), true);
    });
  }

  for (const note of [
    'Pause here. Ask the room.',
    'TODO: revisit this slide before the board',
    'Reminder: keep it to ninety seconds',
    'markdownlint is great', // prose that merely mentions a tool — not a pragma
    'lint the deck later', // "lint " but not "lint disable/enable/ignore"
  ]) {
    test(`note kept: "${note}"`, () => {
      assert.equal(core.isToolingComment(note), false);
    });
  }
});

describe('notes-core: isLatticePragma', () => {
  // The markers this repo writes into its own decks. Each one shipped as reader-visible
  // text in every export's presenter-notes field before #1350.
  for (const pragma of [
    'tier: short',
    'tier: standard',
    'tier: full',
    'TIER: Short', // the matcher is case-insensitive, as the tier-filter's own regex is
    'galleryAuthored: curated Mermaid tour; build-bucket-galleries.js will not overwrite it',
    'color-mode: dark',
    'color-mode: light',
    'color-mode: system',
    'color-mode: inherited',
    'color-mode: print',
    // #1986 — the five deck-logo registers and the finish override. Hyphenated like
    // `color-mode:`, so the engine cannot read the comment form either, and they shipped as
    // reader-visible "notes" on slides whose author wrote none.
    'logo-finish: auto',
    'logo-finish: brand',
    'logo-finish: BRAND', // the producer lowercases the VALUE
    'logo-finish: "brand"', // frontMatterScalar strips a wrapping quote pair
    'logo-finish: bottom-center accent-ink', // one word per axis, on one line
    'logo-finish: lg title # cover only',
    'finish-override:', // a BLOCK key: the header carries no value
  ]) {
    test(`pragma excluded: "${pragma}"`, () => {
      assert.equal(core.isLatticePragma(pragma), true);
    });
  }

  // The other direction, and the one that matters more: over-stripping eats an author's
  // note silently. Every entry here shares a KEY with a pragma above and must stay a note
  // purely on its value, which is what the value constraints buy.
  for (const note of [
    'tier: we should discuss the pricing tier before the board',
    'tier: enterprise',
    'color-mode: we should discuss the palette with design first',
    'Reminder: keep it to ninety seconds',
    'TODO: revisit this slide before the board',
    'tiers are the thing to explain here',
    // A single-token value that is NOT in the register's domain. An early draft matched
    // `color-mode:\s*[a-z-]+` and swallowed this — and because a pragma also leaves the
    // --strip-notes scrub set, the note then SHIPPED in the envelope source with the audit
    // reporting nothing. Both failure directions from one loose character class.
    'color-mode: TBD',
    'color-mode: unclear',
    'color-mode: ask-design',
    // `tier-filter.js` tolerates no space before the colon, so this does NOT filter the deck.
    // A marker the producer misses must stay VISIBLE as a note, not be silently suppressed.
    'tier : full',
    // #1986, the over-strip direction. Every line here shares a KEY with a matcher above and
    // must stay a note purely on its value or its key CASE.
    'logo-finish: neon', // not in the register's two words
    'logo-on: the second half',
    'logo-on: slides 3 and 7',
    'logo-x: we should move it left',
    'logo-x: 1.2.3', // matches [\d.]+ but Number() gives NaN, so the producer ignores it
    'logo-x: 1e3', // ditto — exponent notation is outside the producer's character class
    'logo-scale: bigger',
    'finish-override: ask design first', // the block key takes no value
    // The KEY is case-sensitive in the producer (`frontMatterValue` builds its regex without
    // `i`), so an upper-case marker configures NOTHING. Suppressing it would hide the
    // producer's own miss — the failure the module docblock names in the other direction.
    'LOGO-STYLE: brand',
    'Logo-On: title',
    'LOGO-X: 12',
  ]) {
    test(`note kept: "${note}"`, () => {
      assert.equal(core.isLatticePragma(note), false);
    });
  }

  // `$` is end-of-INPUT without the `m` flag, so an unanchored key matcher swallows a whole
  // multi-line body. Both of these carry a real note after the marker.
  test('a pragma matcher does not swallow prose on a later line', () => {
    assert.equal(core.isLatticePragma('galleryAuthored: yes\n\nRemember the Q3 numbers.'), false);
    assert.equal(core.isLatticePragma('tier: full\n\nRemember the caveat about Q3.'), false);
  });

  // The three matchers mirror producers that live elsewhere. Pin the value domains to those
  // producers so the two cannot drift apart silently.
  test('the tier names mirror lib/exemplars/tier-filter.js', () => {
    const { TIERS } = require('../../../lib/exemplars/tier-filter.js');
    for (const t of TIERS) assert.equal(core.isLatticePragma(`tier: ${t}`), true, `tier: ${t}`);
  });
  test('the color-mode values mirror the producer REGISTER, not its prose', () => {
    // Reads COLOR_MODE_REGISTER itself. An earlier version grepped the module's doc COMMENT
    // for each name it already knew, which could not detect drift in the direction that
    // matters: adding a fifth value to the producer left this green while the new marker
    // leaked into the notes channel as a "note". Iterating the register fails on that.
    const { COLOR_MODE_REGISTER } = require('../../../lib/core/resolve-color-mode.js');
    const names = Object.keys(COLOR_MODE_REGISTER);
    assert.ok(names.length > 0, 'the producer register is empty — has it moved?');
    for (const v of names) {
      assert.equal(
        core.isLatticePragma(`color-mode: ${v}`), true,
        `resolve-color-mode.js accepts "${v}" but the pragma matcher does not, so `
        + `<!-- color-mode: ${v} --> ships as a speaker note (#1350)`
      );
    }
  });

  // ── #1986 parity: the six hyphenated keys, against their real producers ───────────────
  //
  // These call the PRODUCER rather than reading its doc comment, for the reason the
  // color-mode test above gives: a test that greps a comment for names it already knows
  // cannot see drift in the direction that matters.

  test('the retired logo keys are no longer pragmas — they stay visible as notes', () => {
    for (const line of ['logo-on: title', 'logo-x: 12', 'logo-y: 88.5', 'logo-scale: 1.5']) {
      assert.equal(core.isLatticePragma(line), false, `${line}: nothing reads it, so it must not be hidden`);
    }
  });

  test('logo-finish words are pinned to the register, and the matcher takes a whole line of them', () => {
    const { LOGO_FINISH_REGISTER } = require('../../../lib/core/resolve-logo-finish.js');
    assert.deepEqual([...core.LOGO_FINISH_WORDS].sort(), [...LOGO_FINISH_REGISTER.NAMES].sort(), 'the matcher\'s word list drifted from the register');
    for (const v of ['brand', 'BRAND', '"brand"', "'brand'", 'auto', 'bottom-center accent-ink lg', 'title, bottom-left', 'top-right # corner']) {
      assert.equal(core.isLatticePragma(`logo-finish: ${v}`), true, `logo-finish: ${v}`);
    }
    // KEY case: the producer does not read it, so neither does this.
    assert.equal(core.isLatticePragma('LOGO-STYLE: brand'), false);
  });

  test('finish-override mirrors the block key parseFinishOverride looks up', () => {
    // The producer is TypeScript in the docs site, so this is a SOURCE assertion rather than
    // a call — and it is the drift that actually happens: a rename of the front-matter key.
    // It reads the lookup itself, not a comment about it.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'docs', 'src', 'lib', 'front-matter.ts'),
      'utf8',
    );
    const m = src.match(/parseFinishOverride[\s\S]*?blocks\.(?:find|filter)\(\(\[k\]\) => k === '([^']+)'\)/); // `filter(…).pop()` since #3050 D1 (the last block wins)
    assert.ok(m, 'parseFinishOverride no longer looks a block key up this way — re-derive the matcher');
    assert.equal(
      core.isLatticePragma(`${m[1]}:`), true,
      `front-matter.ts reads the block key "${m[1]}", but <!-- ${m[1]}: --> still ships as a speaker note`,
    );
  });

  // The two sets are deliberately separate, for PROVENANCE — one records what an upstream
  // project excluded, the other what this repo emits. Not because a gate enforces it: there
  // is no Marpit parity test and there cannot be one (the dependency is gone), so a Lattice
  // entry added to the wrong set would pass everything. This asserts the separation directly.
  test('Lattice pragmas are NOT in the Marpit-mirrored tooling set', () => {
    for (const pragma of ['tier: short', 'galleryAuthored: x', 'color-mode: dark']) {
      assert.equal(core.isToolingComment(pragma), false);
    }
  });

  test('a pragma is not lifted as a note, and a real note beside it survives', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- tier: short --><h1>A</h1><!-- @note{Pause here.} -->')),
      'Pause here.'
    );
    assert.equal(core.isPrivateComment(' tier: short '), false, 'and the scrub keeps it in the source');
  });

  test('a slide carrying only pragmas has no note at all', () => {
    assert.equal(core.notesFromHtml(sec('<!-- tier: full --><!-- color-mode: dark --><h1>A</h1>')), null);
  });

  // Classification is not the same question as EXTRACTION, and #1350 was visible only in the
  // second: the six matchers could all be right while nothing consulted them on the path that
  // builds the notes field. Measured end to end on this deck exported to .pptx — slides
  // carrying only these six get `ppt/notesSlides/*.xml` with no text, and before the matchers
  // existed all six shipped as the slide's note.
  test('#1986: the six hyphenated registers are not LIFTED as notes, and a real note beside them is', () => {
    const html = sec(
      '<!-- logo-finish: brand --><!-- logo-finish: bottom-center lg -->'
      + '<!-- finish-override: --><h1>Q3</h1>'
    );
    assert.equal(core.notesFromHtml(html), null, 'a slide of nothing but logo/finish registers has no note');
    assert.equal(
      core.notesFromHtml(sec('<!-- logo-finish: sm --><h1>Q3</h1><!-- @note{Pause here.} -->')),
      'Pause here.',
      'the author\'s own note still comes through'
    );
    // The over-strip direction: a register comment is kept by `--strip-notes`, but a prose value is not a register,
    // so it is the author's plain comment and the scrub takes it. It is never a speaker note (four notes N3).
    assert.equal(core.isPrivateComment(' logo-finish: sm '), false);
    assert.equal(core.isPrivateComment(' logo-finish: the second half '), true);
    assert.equal(core.notesFromHtml(sec('<h1>Q3</h1><!-- logo-finish: the second half -->')), null);
  });
});

describe('notes-core: notesFromHtml', () => {
  test('single note', () => {
    assert.equal(core.notesFromHtml(sec('<h1>A</h1><!-- @note{speaker note} -->')), 'speaker note');
  });
  test('a plain comment is not a note (four notes N3)', () => {
    assert.equal(core.notesFromHtml(sec('<h1>A</h1><!-- speaker note -->')), null);
    for (const old of ['note: say this', 'say: old', 'describe: old', 'reader: old', 'Note{x}']) {
      assert.equal(core.notesFromHtml(sec(`<!-- ${old} -->`)), null, old);
    }
  });
  test('several notes join in source order with a blank line', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- @note{first} --><p>x</p><!-- @note{second} -->')),
      'first\n\nsecond'
    );
  });
  test('a multi-line body is dedented, its paragraphs kept', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- @note{\n   line one\n   line two\n\n   para two\n} -->')),
      'line one\nline two\n\npara two'
    );
  });
  test('pragma-only slide → null', () => {
    assert.equal(core.notesFromHtml(sec('<!-- markdownlint-disable MD033 -->')), null);
  });
  test('note alongside a pragma → only the note', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- markdownlint-disable --><!-- @note{the real note} -->')),
      'the real note'
    );
  });
  test('no comments → null', () => {
    assert.equal(core.notesFromHtml(sec('<h1>A</h1>')), null);
  });
  test('empty comment, and an empty note → null', () => {
    assert.equal(core.notesFromHtml(sec('<!--  -->')), null);
    assert.equal(core.notesFromHtml(sec('<!-- @note{  } -->')), null);
  });
  test('a near miss is not a note: wrong case, an unknown name, unbalanced braces, trailing text', () => {
    for (const body of ['@Note{x}', '@speaker{x}', '@note{x', '@note{x} and more', '@note x']) {
      assert.equal(core.notesFromHtml(sec(`<!-- ${body} -->`)), null, body);
      assert.equal(core.noteOf(body), null, body);
      assert.equal(core.isPrivateComment(body), true, `${body}: not a note, so the author's own, and scrubbed`);
    }
  });
  test('the comment escape is undone where a person reads the note', () => {
    assert.equal(core.notesFromHtml(sec('<!-- @note{a --\\> b --!\\> c \\{d\\}} -->')), 'a --> b --!> c {d}');
  });
});

describe('notes-core: extractSlideNotes is index-aligned', () => {
  test('one entry per slide, null where empty', () => {
    const slides = [
      sec('<!-- @note{note A} -->'),
      sec('<h1>B</h1><!-- a plain comment -->'),
      sec('<!-- markdownlint-disable --><!-- @note{note C} -->'),
    ];
    assert.deepEqual(core.extractSlideNotes(slides), ['note A', null, 'note C']);
  });
});

describe('notes-core: stripCommentNodes', () => {
  test('removes comment nodes, leaves real markup', () => {
    assert.equal(
      core.stripCommentNodes('<h1>A</h1><!-- a note --><p>body</p>'),
      '<h1>A</h1><p>body</p>'
    );
  });
});

describe('notes-core: malformed input is linear (no ReDoS)', () => {
  test('an unterminated <!-- with a long run resolves quickly to null', () => {
    // The old `<!--+\s*([\s\S]*?)\s*--+>` pattern was quadratic here (a 5k run hung >30s), and its successor
    // COMMENT_SOURCE is still polynomial to recheck; the comments are read by CommentScan now.
    const html = `<section><!-- ${' '.repeat(200000)}no close`;
    const note = linearWork(() => core.notesFromHtml(html), html.length, 8, 'an unterminated comment');
    assert.equal(note, null, 'an unterminated comment is not a note');
  });

  test('a front matter ending in a long CRLF run strips its captions block quickly', () => {
    // The shape CodeQL actually named, and the worse of the two the replaced regex had: the
    // alternation `(?:\r\n|\r|\n)` inside an outer `*` is AMBIGUOUS — `\r\n` matches either as
    // one branch or as `\r` then `\n` on the next iteration — so a failing tail forces a 2^n
    // search. Measured on the replaced form: 20 pairs 100ms, 22 pairs 400ms, 24 pairs 1.6s, i.e.
    // 2x per added pair, which is 48 characters for a second and a half. The first cut of this
    // arm tested a long run of SPACES instead, which is only the polynomial half and would have
    // passed at these sizes on the exponential bug.
    const src = `---\ntheme: x\nsay:\n  1: a\n${'\r\n'.repeat(100000)}---\n\n# S\n`;
    const out = linearWork(() => core.stripSayFromSource(src), src.length, 24, 'a CRLF run');
    assert.doesNotMatch(out, /1: a/, 'the caption still goes');
  });

  test('a front matter ending in a long whitespace run strips its captions block quickly', () => {
    // The second one in this file, same class, found by CodeQL on the PR that introduced it
    // (#2003). The natural way to drop the residue a removed `captions:` block leaves is one
    // regex over the rejoined body — `/(?:[ \t]*(?:\r\n|\r|\n))*$/` — and that is a nested
    // quantifier anchored at `$`. On front matter whose last line is a long run of spaces with
    // no newline, the engine retries every split of the run at every start position: measured
    // 10k spaces 163ms, 20k 627ms, 40k 2.5s, 80k 10s — 4x for every 2x, a render-DoS on a
    // malformed deck. `stripSayFrontMatter` trims the line ARRAY instead, which is linear.
    // Same generous bound and the same reason as the arm above.
    const src = `---\ntheme: x\nsay:\n  1: a\n${' '.repeat(200000)}\n---\n\n# S\n`;
    const out = linearWork(() => core.stripSayFromSource(src), src.length, 24, 'a whitespace run');
    assert.doesNotMatch(out, /1: a/, 'the caption still goes');
  });
});

describe('notes-core: known comment-collection deltas vs marp-core', () => {
  // These are documented in spec/LFM-1.0.md §3.5 as explicitly NOT guaranteed
  // identical across parsers — they depend on comment *segmentation*, not the
  // note boundary. These tests lock notes-core's current behavior so a future
  // change to it is a conscious decision, not a silent drift.
  test('adjacent comments with no blank line are both collected', () => {
    // marp-core collects only the first here; the HTML scan sees both.
    assert.equal(core.notesFromHtml('<section><!-- @note{a} --><!-- @note{b} --></section>'), 'a\n\nb');
  });
  test('a comment inside a rendered block is still lifted', () => {
    // marp-core folds this into an HTML-block token and does not collect it.
    assert.equal(core.notesFromHtml('<section><div><!-- @note{x} --></div></section>'), 'x');
  });
});

describe('notes-core: the alt-text channel (@alt)', () => {
  test('noteOf names the note; the retired describe: key is a plain comment', () => {
    assert.deepEqual(core.noteOf(' @alt{A bar chart rising left to right.} '), { name: 'alt', text: 'A bar chart rising left to right.' });
    assert.equal(core.noteOf('describe: A bar chart rising left to right.'), null);
    assert.equal(core.isPublicNote(' @alt{A chart.} '), true, 'alt text ships with every export');
    assert.equal(core.isPrivateComment(' @alt{A chart.} '), false);
  });

  test('an @alt is NOT collected as a speaker note', () => {
    assert.equal(core.notesFromHtml(sec('<!-- @alt{Revenue up 40% over three quarters.} -->')), null);
  });

  test('descriptionFromHtml returns the alt text', () => {
    assert.equal(
      core.descriptionFromHtml(sec('<!-- @alt{Revenue up 40% over three quarters.} -->')),
      'Revenue up 40% over three quarters.',
    );
    assert.equal(core.descriptionFromHtml(sec('<!-- a plain comment -->')), null);
    assert.equal(core.descriptionFromHtml(sec('<!-- describe: the retired key -->')), null);
  });

  test('note and alt text coexist on one slide without cross-contamination', () => {
    const html = sec('<!-- @note{Pause here.} --><!-- @alt{A pie chart, three equal slices.} -->');
    assert.equal(core.notesFromHtml(html), 'Pause here.'); // note only
    assert.equal(core.descriptionFromHtml(html), 'A pie chart, three equal slices.'); // alt only
  });

  test('extractSlideDescriptions is index-aligned; several @alt join with a space', () => {
    const slides = [
      sec('<!-- @alt{First.} --><!-- @alt{Second.} -->'),
      sec('<!-- @note{just a note} -->'),
      sec('<!-- @alt{Third.} -->'),
    ];
    assert.deepEqual(core.extractSlideDescriptions(slides), ['First. Second.', null, 'Third.']);
  });
});

describe('notes-core: the handout channel (@handout)', () => {
  test('handoutFromHtml reads @handout, joined as paragraphs; never the speaker note', () => {
    const html = sec('<!-- @note{Pause.} --><!-- @handout{For the reader.} --><p>x</p><!-- @handout{Second para.} -->');
    assert.equal(core.handoutFromHtml(html), 'For the reader.\n\nSecond para.');
    assert.equal(core.notesFromHtml(html), 'Pause.');
    assert.equal(core.handoutFromHtml(sec('<!-- reader: the retired key -->')), null);
    assert.deepEqual(core.extractSlideHandouts([html, sec('<h1>x</h1>')]), ['For the reader.\n\nSecond para.', null]);
  });

  test('withHandoutNotes labels the handout after the speaker note, index-aligned', () => {
    assert.deepEqual(core.withHandoutNotes(['N.', null, null, 'Only.'], ['H.', 'Alone.', null]), ['N.\n\nHandout: H.', 'Handout: Alone.', null, 'Only.']);
  });
});

describe('notes-core: the say channel (@say)', () => {
  test('noteOf reads @say lowercase only; the retired say: and caption: keys are plain comments', () => {
    assert.deepEqual(core.noteOf('@say{FY26 revenue grew forty percent.}'), { name: 'say', text: 'FY26 revenue grew forty percent.' });
    // LOWERCASE ONLY: the channel is public. A capitalized one is no note at all, so it is the author's plain comment
    // (scrubbed by --strip-notes), and lint-core's `note-malformed` names it.
    for (const body of ['@Say{thank the ops team}', '@SAY{thank the ops team}', 'say: FY26 revenue', 'caption: the old key', 'Say: thank the ops team']) {
      assert.equal(core.noteOf(body), null, body);
      assert.equal(core.isPrivateComment(body), true, body);
    }
  });

  test('an @say is NOT collected as a speaker note (never embedded in the PDF)', () => {
    assert.equal(core.notesFromHtml(sec('<!-- @say{The exact words this slide reads.} -->')), null);
  });

  test('sayLineFromHtml returns the say line; several join on one line in source order', () => {
    assert.equal(
      core.sayLineFromHtml(sec('<!-- @say{Net dollar retention held at one twenty.} -->')),
      'Net dollar retention held at one twenty.',
    );
    assert.equal(core.sayLineFromHtml(sec('<!-- a plain comment -->')), null);
    assert.equal(core.sayLineFromHtml(sec('<!-- @say{first} -->\n<!-- @say{second} -->')), 'first second');
  });

  test('note, alt text and say line coexist on one slide without cross-contamination', () => {
    const html = sec('<!-- @note{Pause here.} --><!-- @alt{A pie chart.} --><!-- @say{Three equal slices.} --><!-- @handout{Read on.} -->');
    assert.equal(core.notesFromHtml(html), 'Pause here.');
    assert.equal(core.descriptionFromHtml(html), 'A pie chart.');
    assert.equal(core.sayLineFromHtml(html), 'Three equal slices.');
    assert.equal(core.handoutFromHtml(html), 'Read on.');
  });

  test('extractSlideSayLines is index-aligned; null where a slide has no say line', () => {
    const slides = [
      sec('<!-- @say{Opener.} -->'),
      sec('<!-- @note{just a note} -->'),
      sec('<!-- @alt{a chart} --><!-- @say{Closer.} -->'),
    ];
    assert.deepEqual(core.extractSlideSayLines(slides), ['Opener.', null, 'Closer.']);
  });

  test('stripCommentNodes removes a caption comment from the rendered HTML (no double-render)', () => {
    const html = sec('<!-- @say{read this} -->\n<p>Body</p>');
    const out = core.stripCommentNodes(html);
    assert.doesNotMatch(out, /@say|read this/);
    assert.match(out, /<p>Body<\/p>/);
  });

  // A CRLF SOURCE MUST STILL STRIP, AND THIS IS THE ONLY PLACE THAT CAN PROVE IT.
  // The integration test that used to guard this (`test/integration/export/html-player.test.js`,
  // "--strip-notes scrubs a MULTI-LINE note in a CRLF (Windows) deck") wrote a real CRLF file and
  // ran the CLI. Once the CLI began normalizing at its file read, that test stopped discriminating
  // — it still passes, but the CRLF never reaches the kernel, so it can no longer catch a
  // regression in the kernel's own `\r` handling. It is kept there as an end-to-end check of the
  // boundary, and the discriminating assertion moved HERE, where the raw CRLF actually arrives.
  //
  // This is not hypothetical residue: `share-export.ts:298` calls this same kernel on Studio
  // `source`, which `saveSource` keeps byte-faithful — so a deck persisted before the boundaries
  // landed still hands this function CRLF today. It is a PRIVACY strip (speaker notes leaking
  // into a shared HTML), so a silent failure here is the expensive kind.
  test('stripNotesFromSource strips a MULTI-LINE note from a raw CRLF source (no newline-mismatch leak)', () => {
    // Until 2026-11-20 the strip matched LF-normalized bodies lifted from the render against the CRLF source, and that
    // mismatch was the leak. The strip classifies the source comment now; a named note and a plain comment, each
    // spanning a CRLF line break, must both still come off.
    const crlf = ['# S', '', '<!-- @note{Pause here.', 'Then CRLFLEAK ask the room.} -->', '<!-- Mine.', 'CRLFPLAIN -->', '', 'Body.'].join('\r\n');
    const out = core.stripNotesFromSource(crlf);
    assert.doesNotMatch(out, /CRLFPLAIN/, 'a multi-line plain comment must not survive in a CRLF source');
    assert.doesNotMatch(out, /CRLFLEAK/, 'a multi-line note must not survive in a CRLF source');
    assert.match(out, /# S/, 'body content untouched');
  });

  // The privacy strip for the self-contained player's envelope (design doc §Notes on export).
  test('stripNotesFromSource removes ONLY the private comments — directives, tooling and public notes survive', () => {
    const source = [
      '# Slide one',
      '',
      '<!-- _class: title -->',
      '<!-- @note{Remember to pause here.} -->',
      '<!-- my own reminder -->',
      '<!-- prettier-ignore -->',
      '<!-- @say{Read aloud.} -->',
      '<!-- @alt{A chart.} -->',
      '<!-- @handout{For later.} -->',
      '',
      'Body.',
    ].join('\n');
    const out = core.stripNotesFromSource(source);
    assert.doesNotMatch(out, /Remember to pause/, 'the note comment is gone');
    assert.doesNotMatch(out, /my own reminder/, 'a plain comment is the author\'s, and gone');
    for (const kept of ['@say{Read aloud.}', '@alt{A chart.}', '@handout{For later.}']) assert.ok(out.includes(kept), `${kept} ships`);
    assert.match(out, /_class: title/, 'a directive comment is preserved');
    assert.match(out, /prettier-ignore/, 'a tooling pragma is preserved');
    assert.match(out, /# Slide one/, 'body content untouched');
  });

  // The whole comment channel, extracted ONCE from already-split sections — the shape
  // that removes the DOM round trip from the problem instead of repairing it afterwards.
  describe('slideNoteRecord — extract the channel once, from a depth-aware split', () => {
    // The deck shape that defeats the docs site's flat splitter: a slide containing a
    // hand-authored <section>. The flat scan ends slide 1 at the NESTED close tag, so the
    // note after it is lost — while the slide COUNT still matches, which is exactly why a
    // count-parity check waves it through. `docs/src/lib/markup/sections.ts` is depth-aware.
    const NESTED =
      '<section id="1" class="title"><h1>One</h1><section class="inner"><p>n</p></section><p>tail</p><!-- @note{SECRETNEST} --></section>' +
      '<section id="2" class="content"><h2>Two</h2><!-- @note{NOTETWO} --></section>';
    const flatSplit = (h) => {
      const out = [];
      const open = /<section\b[^>]*>/gi;
      let m;
      while ((m = open.exec(h))) {
        const c = h.indexOf('</section>', m.index);
        if (c === -1) break;
        out.push(h.slice(m.index, c + 10));
        open.lastIndex = c + 10;
      }
      return out;
    };

    test('reads note, alt text, say line and handout per slide', () => {
      const rec = core.slideNoteRecord([
        '<section><h1>A</h1><!-- @note{A note.} --><!-- @alt{A chart.} --><!-- @say{Read aloud.} --><!-- @handout{For you.} --><!-- plain --></section>',
        '<section><h1>B</h1></section>',
      ]);
      assert.deepEqual(rec[0], { note: 'A note.', description: 'A chart.', say: 'Read aloud.', handout: 'For you.' });
      assert.deepEqual(rec[1], { note: null, description: null, say: null, handout: null });
    });

    // The privacy contract the record used to carry as `noteBodies`: a note that contains a blank line. The strip
    // classifies the source comment now, so nothing is matched back and nothing can shatter.
    test('a note that contains a blank line reads whole, and the strip takes it whole', () => {
      const body = 'Board only.\n\nDo not share.';
      const rec = core.slideNoteRecord([`<section><h1>Q3</h1><!-- @note{\n${body}\n} --></section>`]);
      assert.equal(rec[0].note, body, 'the note is read whole');

      const source = `---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- @note{\n${body}\n} -->\n`;
      const stripped = core.stripNotesFromSource(source);
      assert.ok(!stripped.includes('Do not share'), 'the note is scrubbed from the envelope source');
      assert.ok(stripped.includes('_class: title'), 'and the directive beside it survives');
    });

    test('two notes authored on one slide join as paragraphs', () => {
      const rec = core.slideNoteRecord(['<section><!-- @note{First note.} --><!-- @note{Second note.} --></section>']);
      assert.equal(rec[0].note, 'First note.\n\nSecond note.');
    });

    test('a depth-aware split keeps the note a flat split loses — with the COUNT identical', () => {
      const flat = flatSplit(NESTED);
      const deep = splitSectionsCore(NESTED).filter((p) => p.type === 'section').map((p) => `${p.openTag}${p.inner}</section>`);
      assert.equal(flat.length, deep.length, 'both splitters agree on the slide COUNT — which is why a parity check cannot catch this');
      assert.equal(core.slideNoteRecord(flat)[0].note, null, 'guard: the flat split really does lose it (this is the bug)');
      assert.equal(core.slideNoteRecord(deep)[0].note, 'SECRETNEST', 'the depth-aware split keeps it');
      assert.equal(core.slideNoteRecord(deep)[1].note, 'NOTETWO', 'and does not disturb an ordinary slide');
    });

    test('tolerates a non-array', () => {
      assert.deepEqual(core.slideNoteRecord(undefined), []);
    });
  });

  // The SEPARATE privacy strip for the caption channel (`--strip-say`), orthogonal
  // to the note strip: captions are structurally identified (the `caption:` prefix), so
  // no rendered-body set is needed.
  test('stripSayFromSource removes say lines + a retired front-matter say: block — notes, alt text, directives, other keys survive', () => {
    const source = [
      '---',
      'theme: indaco',
      'say:',
      '  1: Front matter secret caption one.',
      '  3: Another front-matter caption, keyed by slide.',
      'acronyms:',
      '  ARR: annual recurring revenue',
      '---',
      '',
      '# Slide one',
      '',
      '<!-- _class: title -->',
      '<!-- Remember to pause here. -->',
      '<!-- @alt{A pie chart with three equal slices.} -->',
      '<!-- @say{Three equal slices, one third each.} -->',
      '<!-- say:a SECOND say line, the retired key with no space after the colon. -->',
      '',
      'Body.',
    ].join('\n');
    const out = core.stripSayFromSource(source);
    // inline caption comments gone
    assert.doesNotMatch(out, /Three equal slices, one third/, 'the caption comment is gone');
    assert.doesNotMatch(out, /a SECOND caption/, 'a second say line, spaced differently, is gone');
    // front-matter captions: block gone (the leak the checker caught)
    assert.doesNotMatch(out, /Front matter secret caption/, 'the front-matter caption text is gone');
    assert.doesNotMatch(out, /keyed by slide/, 'every front-matter caption line is gone');
    assert.doesNotMatch(out, /^say:/m, 'the captions: key itself is gone');
    // everything else survives
    assert.match(out, /theme: indaco/, 'a sibling front-matter key before captions survives');
    assert.match(out, /acronyms:/, 'a sibling front-matter key after captions survives');
    assert.match(out, /ARR: annual recurring revenue/, "the acronyms block's body survives");
    assert.match(out, /Remember to pause/, 'the private comment is left to --strip-notes');
    assert.match(out, /@alt\{A pie chart/, 'the alt text is preserved');
    assert.match(out, /_class: title/, 'a directive comment is preserved');
    assert.match(out, /# Slide one/, 'body content untouched');
  });

  // The RETIRED keys are scrubbed too. `--strip-captions` removed them, and an author who moves a
  // script to `--strip-say` must not start shipping an old deck's public lines in the envelope
  // source. A checker measured exactly that leak (a stale `captions:` map in the player envelope
  // and the embedded PDF source) before this was added.
  test('stripSayFromSource ALSO scrubs the retired say:/caption: comments and say:/captions: maps', () => {
    // Each retired form is a plain comment or an unread front-matter key since 2026-11-20 (four notes N6), and
    // `--strip-notes` takes the comments; `--strip-say` takes them too, so a script that runs only `--strip-say` on an
    // unmigrated deck does not ship its old public lines. A capitalized one goes as well: scrubbing more is the safe side.
    const src = [
      '---', 'theme: indaco', 'captions:', '  1: OLD MAP LINE', 'say:', '  2: SAY MAP LINE', '---', '',
      '# S', '', '<!-- caption: OLD INLINE LINE -->', '<!-- Caption: OLD CAPITALIZED LINE -->',
      '<!-- say: OLD SAY LINE -->', '<!-- Say: OLD CAPITALIZED SAY -->', '<!-- @say{NEW SAY LINE} -->', '<!-- @note{a private note} -->', '', 'Body.',
    ].join('\n');
    const out = core.stripSayFromSource(src);
    for (const gone of ['OLD MAP LINE', 'SAY MAP LINE', 'OLD INLINE LINE', 'OLD CAPITALIZED LINE', 'OLD SAY LINE', 'OLD CAPITALIZED SAY', 'NEW SAY LINE']) {
      assert.doesNotMatch(out, new RegExp(gone), `${gone} is scrubbed`);
    }
    assert.match(out, /@note\{a private note\}/, 'the speaker note is left to --strip-notes');
    assert.match(out, /theme: indaco/);
  });

  test('stripSayFrontMatter removes ONLY the captions: block; a captions word in the BODY is safe', () => {
    const src = '---\ntheme: indaco\nsay:\n  2: read this\n---\n\n# S\n\nThen say: the feature is great.\n';
    const out = core.stripSayFrontMatter(src);
    assert.doesNotMatch(out, /2: read this/, 'the front-matter caption line is gone');
    assert.doesNotMatch(out, /^say:/m, 'the captions: key is gone from front matter');
    assert.match(out, /Then say: the feature is great\./, 'a captions: mention in the BODY is untouched');
    assert.match(out, /theme: indaco/, 'sibling keys survive');
  });

  test('stripSayFrontMatter is TOP-LEVEL only — a NESTED key named captions is preserved', () => {
    // The trio caught this: `^(\s*)captions` matched any indent and deleted an unrelated
    // nested key. A `captions:` under another mapping is a different key, not the channel.
    const src = '---\nspeaker:\n  say: a stage direction\n  name: Bob\nsay:\n  1: the real caption map\n---\n\n# S\n';
    const out = core.stripSayFrontMatter(src);
    assert.match(out, /say: a stage direction/, 'the NESTED captions key is preserved');
    assert.match(out, /name: Bob/, 'its sibling under speaker is preserved');
    assert.doesNotMatch(out, /the real caption map/, 'the TOP-LEVEL captions map is removed');
    assert.doesNotMatch(out, /^say:/m, 'the top-level captions: key is gone');
  });

  test('stripSayFrontMatter preserves CRLF line endings — byte-identical, and a no-op on a CRLF deck with no captions', () => {
    // The trio caught this: split(/\r?\n/)+join('\n') rewrote every CRLF body line to LF.
    const withCaps = '---\r\ntheme: indaco\r\nsay:\r\n  1: x\r\ntitle: y\r\n---\r\n\r\n# S\r\n';
    const out = core.stripSayFrontMatter(withCaps);
    assert.doesNotMatch(out, /1: x/, 'the caption line is gone');
    assert.match(out, /theme: indaco\r\n/, 'a CRLF sibling BEFORE captions keeps its CRLF');
    assert.match(out, /title: y\r\n/, 'a CRLF sibling AFTER captions keeps its CRLF');
    assert.doesNotMatch(out, /theme: indaco\n(?!\r)/, 'no CRLF→LF rewrite (no mixed endings)');
    // and with NO captions key, a CRLF deck is returned byte-identical
    const noCaps = '---\r\ntheme: indaco\r\ntitle: y\r\n---\r\n\r\n# S\r\n';
    assert.equal(core.stripSayFrontMatter(noCaps), noCaps, 'no-captions CRLF deck round-trips unchanged');
  });

  test('stripSayFrontMatter leaves no blank line where the block was (#2003)', () => {
    // Same disclosure class as the comment cut, one line up: a blank line in front matter says
    // a key was removed there. It has two shapes and both come out of how FRONT_MATTER_BLOCK
    // splits the fence — the close fence carries the LAST body line's terminator.
    assert.equal(
      core.stripSayFrontMatter('---\ntheme: indaco\nsay:\n  3: x\n---\n\n# S\n'),
      '---\ntheme: indaco\n---\n\n# S\n',
      'captions: as the LAST key leaves no blank line before the close fence'
    );
    assert.equal(
      core.stripSayFrontMatter('---\r\ntheme: indaco\r\nsay:\r\n  1: x\r\n---\r\n\r\n# S\r\n'),
      '---\r\ntheme: indaco\r\n---\r\n\r\n# S\r\n',
      'and on a CRLF deck, still byte-exact'
    );
    // captions: as the ONLY key empties the fence. An empty fence cannot be emitted: measured,
    // `parseFrontMatter` does NOT read `---\n---\n` as front matter, so the deck would gain a
    // thematic break where its front matter used to be. A front matter with no keys is a deck
    // with no front matter, so the whole block goes.
    const { parseFrontMatter } = require('../../../lib/engine/directives.js');
    assert.deepEqual(
      parseFrontMatter('---\n---\n\n# S\n').directives, {},
      'guard: an empty fence is not front matter to the engine'
    );
    const only = '---\nsay:\n  3: x\n---\n\n# S\n';
    assert.equal(core.stripSayFrontMatter(only), '\n# S\n');
    assert.equal(
      core.stripSayFrontMatter(only), parseFrontMatter(only).body,
      'what is left is exactly the body the engine read before the strip — no gained break'
    );
    // A blank line the author put ABOVE the block is their separator FROM it, so it goes too
    // when the block ran to the fence. Leaving it was the asymmetry that let a blank line sit
    // against the close fence and name where the map had been (the blanks BELOW were already
    // eaten). A sibling key after the block is the other case: nothing there says a key was
    // removed, so the author's formatting survives.
    assert.equal(
      core.stripSayFrontMatter('---\ntitle: X\n\nsay:\n  1: a\n---\n\n# S\n'),
      '---\ntitle: X\n---\n\n# S\n',
      'a blank line above the block goes with it'
    );
    assert.equal(
      core.stripSayFrontMatter('---\ntitle: X\n\nsay:\n  1: a\nkey2: y\n---\n\n# S\n'),
      '---\ntitle: X\n\nkey2: y\n---\n\n# S\n',
      'with a sibling key after the block, the author blank between two survivors stays'
    );
  });

  test('a deck with NO captions key is byte-identical, whatever shape its front matter is', () => {
    // The regression an independent checker caught, and it was silent: the first cut of the
    // no-blank-line fix normalized the rebuilt body's tail UNCONDITIONALLY, on the belief that
    // `body` can never end with a terminator. It can — the close group is a single `\r?\n---`,
    // so an author's BLANK LINE before the fence leaves its newline inside `body`. A deck with
    // no `captions:` key then came back a byte shorter, and an EMPTY front matter lost its
    // whole fence. Neither changes the render, so the export's fidelity guard could not see it,
    // and the envelope's "verbatim source for lossless re-import" quietly was not.
    for (const src of [
      '---\ntheme: indaco\npaginate: true\n\n---\n\n# Slide one\n',       // blank line before the fence
      '---\n\n---\n\nIntro paragraph.\n\n---\n\n# Slide two\n',            // empty front matter
      '---\ntheme: indaco\n---\n\n# S\n',                                  // ordinary
      '---\r\ntheme: indaco\r\n\r\n---\r\n\r\n# S\r\n',                    // CRLF, blank before the fence
      '---\nspeaker:\n  say: a stage direction\n---\n\n# S\n',        // only a NESTED captions key
    ]) {
      assert.equal(core.stripSayFrontMatter(src), src, `no captions key — verbatim: ${JSON.stringify(src)}`);
      assert.equal(core.stripSayFromSource(src), src, `and through the full strip: ${JSON.stringify(src)}`);
    }
    // The measured case: a deck this repo ships, which has no captions and a blank line before
    // its closing fence. It went one byte shorter through the first cut of the fix.
    const fs = require('node:fs');
    const path = require('node:path');
    const shipped = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'themes', 'palette-audit.md'), 'utf8');
    assert.equal(core.stripSayFromSource(shipped), shipped, 'themes/palette-audit.md round-trips unchanged');
  });

  test('reverse orthogonality: stripNotesFromSource PRESERVES the say line', () => {
    // The note strip must never touch the say channel (the trio flagged this direction was unpinned).
    const src = '# S\n\n<!-- @note{Pause here.} -->\n<!-- @say{The exact read-as line.} -->\n\nBody.';
    const out = core.stripNotesFromSource(src);
    assert.doesNotMatch(out, /Pause here/, 'the note is stripped');
    assert.match(out, /@say\{The exact read-as line\.\}/, 'the say line survives the NOTE strip');
  });

  test('stripSayFromSource is a no-op on a deck with no captions; safe on null', () => {
    assert.equal(core.stripSayFromSource('# S\n\n<!-- a note -->\n\nBody.'), '# S\n\n<!-- a note -->\n\nBody.');
    assert.equal(core.stripSayFromSource(null), '');
    assert.equal(core.stripSayFrontMatter(null), '');
    // a deck with no front matter at all is returned verbatim
    assert.equal(core.stripSayFrontMatter('# No front matter\n\nsay: in prose\n'), '# No front matter\n\nsay: in prose\n');
  });

  test('a note with an internal blank line is read whole and stripped whole', () => {
    // The leak that was: joining then splitting on \n\n shattered a single blank-line note, so the strip set built
    // from the render matched nothing. The strip reads the source comment itself now.
    const html = sec('<!-- @note{Line one.\n\nLine two.} --><!-- @note{A second note.} -->');
    assert.equal(core.notesFromHtml(html), 'Line one.\n\nLine two.\n\nA second note.');
    const src = '# S\n\n<!-- @note{Line one.\n\nLine two.} -->\n\nBody.';
    const out = core.stripNotesFromSource(src);
    assert.doesNotMatch(out, /Line one|Line two/, 'the blank-line note is fully stripped (no leak)');
  });

  test('stripNotesFromSource strips a MULTI-LINE note in a CRLF source (Windows-authored deck)', () => {
    // The leak the checker caught when the strip matched render-normalized bodies: a raw CRLF comment body never
    // matched, so the note shipped. The source is classified where it stands now.
    const crlf = '# S\r\n\r\n<!-- @note{Pause here.\r\nThen ask the room.} -->\r\n\r\nBody.\r\n';
    const out = core.stripNotesFromSource(crlf);
    assert.doesNotMatch(out, /ask the room/, 'the CRLF multi-line note is stripped (no leak)');
    // lone-CR too
    const cr = '<!-- Pause here.\rThen ask the room. -->';
    assert.equal(core.stripNotesFromSource(cr), '', 'a lone-CR note also strips');
  });

  test('stripNotesFromSource never strips a directive, even beside prose shaped like one', () => {
    // A "Remember:" comment reads like `key: value` but names no directive, so it is the author's plain comment and
    // goes; the `_footer:` directive beside it stays, or the recipient's slide loses its footer.
    const source = '<!-- Remember: this is a note --><!-- _footer: page -->';
    const out = core.stripNotesFromSource(source);
    assert.doesNotMatch(out, /this is a note/);
    assert.equal(out, '<!-- _footer: page -->', 'the directive stays, byte for byte');
    // A source with nothing private is returned as given.
    assert.equal(core.stripNotesFromSource(out), out);
  });

  test('stripNotesFromSource is POSITION-aware — a note body inside a code sample survives (#1636)', () => {
    // A deck that DOCUMENTS the note syntax shows the comment inside a fence, where it is
    // visible slide content. Matching whole-body set membership with no notion of where a
    // comment sits deleted that sample from the source the recipient re-imports, while the
    // slide they can see still showed it. Source destruction, not a leak: the audience is
    // already reading it off the slide, so a comment in a code region cannot be the secret
    // this strip exists to protect.
    const source = [
      '# How to author a note',
      '',
      '```markdown',
      '<!-- Remember to pause here. -->',
      '```',
      '',
      'Inline too: `<!-- Remember to pause here. -->`',
      '',
      '---',
      '',
      '# The real slide',
      '',
      '<!-- Remember to pause here. -->',
      '',
    ].join('\n');
    const out = core.stripNotesFromSource(source);
    assert.equal((out.match(/Remember to pause here/g) || []).length, 2, 'the fenced and inline samples both survive');
    assert.match(out, /```markdown\n<!-- Remember to pause here\. -->\n```/, 'the fenced sample is byte-intact');
    assert.doesNotMatch(out.split('# The real slide')[1], /Remember to pause here/, 'the real note is still scrubbed');
  });

  test('maskCodeRegions reads fences the way CommonMark does', () => {
    const mask = core.maskCodeRegions;
    const keepsOffsets = (s) => assert.equal(mask(s).length, s.length, 'offsets must not move — callers index the ORIGINAL string against this');
    // A ````-fence that DEMONSTRATES ``` fences is ONE region. Pairing the nearest two
    // markers reads the middle as live prose, and the scrub would then delete a comment out
    // of a code sample (or the audit report one as a leak).
    const nested = '````markdown\n```js\n<!-- Board only -->\n```\n````\n';
    keepsOffsets(nested);
    assert.equal(mask(nested).trim(), '', 'the whole nested block is code');
    // `~~~`, and up to three spaces of indentation.
    assert.equal(mask('~~~\n<!-- x -->\n~~~\n').trim(), '');
    assert.equal(mask('   ```\n   <!-- x -->\n   ```\n').trim(), '');
    // An info string may not repeat the marker, so ```` ```js ```` opens and a bare fence closes.
    const closed = '```js\ncode\n```\n\n<!-- A real note. -->\n';
    assert.match(mask(closed), /<!-- A real note\. -->/, 'prose AFTER a closed fence stays visible');
    // An UNCLOSED fence runs to the end of the document — markdown-it renders everything
    // after it as code, so nothing in there is a note.
    assert.equal(mask('```\n<!-- x -->\n\nmore\n').trim(), '');
    // An inline span cannot cross a line, so a stray backtick cannot swallow a later note.
    assert.match(mask('a ` stray tick\n\n<!-- A real note. -->\n'), /<!-- A real note\. -->/);
  });

  // #2012 — three shapes got code past the mask, and `--strip-notes` deleted a note-shaped
  // string out of the SAMPLE. Asserted on the scrubbed SOURCE, which is what ships in the player
  // envelope and the `--embed-source` attachment; the render already had a guard (#2006).
  describe('#2012: code after raw HTML, and indented code, keeps its note-shaped text', () => {
    const NOTE = 'SECRETNOTE r';
    const sample = 'let a = "<!-- SECRETNOTE r -->";';
    const scrub = (src) => core.stripNotesFromSource(src);
    const realNoteGone = (out) => assert.equal(out.split(`<!-- ${NOTE} -->`).length - 1, 1, 'only the sample copy survives');

    test('a fence directly under a one-line note (HTML block type 2 ends on its own line)', () => {
      const out = scrub(['<!-- SECRETNOTE r -->', '```js', sample, '```', ''].join('\n'));
      assert.match(out, /```js\nlet a = "<!-- SECRETNOTE r -->";\n```/);
      realNoteGone(out);
    });

    test('a fence directly under a <span> line (a paragraph, which a fence interrupts)', () => {
      const out = scrub(['<!-- SECRETNOTE r -->', '', '<span>x</span>', '```js', sample, '```', ''].join('\n'));
      assert.match(out, /<span>x<\/span>\n```js\nlet a = "<!-- SECRETNOTE r -->";\n```/);
      realNoteGone(out);
    });

    test('a 4-space indented code block', () => {
      const out = scrub(['<!-- SECRETNOTE r -->', '', 'Sample:', '', '    <!-- SECRETNOTE r -->', '', 'end', ''].join('\n'));
      assert.match(out, /\n {4}<!-- SECRETNOTE r -->\n/);
      realNoteGone(out);
    });

    test('a tab indented code block', () => {
      const out = scrub(['<!-- SECRETNOTE r -->', '', '\t<!-- SECRETNOTE r -->', ''].join('\n'));
      assert.match(out, /^\t<!-- SECRETNOTE r -->\n/m);
      realNoteGone(out);
    });

    // The leak direction: an indented line markdown-it reads as a NOTE must still be scrubbed.
    test('an indented line that is NOT code is still scrubbed: lazy continuation, list item', () => {
      const lazy = scrub(['Intro line', '    <!-- SECRETNOTE r -->', ''].join('\n'));
      assert.doesNotMatch(lazy, /SECRETNOTE/, 'a paragraph continuation is not code');
      const listed = scrub(['- item', '', '    <!-- SECRETNOTE r -->', ''].join('\n'));
      assert.doesNotMatch(listed, /SECRETNOTE/, 'indented content of a list item is not code');
    });

    test('a block HTML tag line still holds a fence-shaped line until the blank line (type 6/7)', () => {
      for (const open of ['<div>', '<img src="a.png">', '</details>']) {
        const out = scrub([open, '```', '<!-- SECRETNOTE r -->', '```', ''].join('\n'));
        assert.doesNotMatch(out, /SECRETNOTE/, `${open}: the fence line is inside the HTML block, so the comment is a note`);
      }
    });

    // Found by the differential run against markdown-it over the repo's 3,943 markdown files: the
    // old scan paired every `<!--` with the next `-->` over raw text, so a `<!--` shown in INLINE
    // code spanned to a later comment and hid the real fence between them.
    test('a <!-- in inline code does not hide the next fence', () => {
      const src = ['Write `<!-- {` to open one.', '', '```', '<!-- SECRETNOTE r -->', '```', '', 'Prose after.', '', '```', 'second', '```', ''].join('\n');
      const masked = core.maskCodeRegions(src);
      assert.match(masked, /\nProse after\.\n/, 'prose between the two fences is not masked');
      assert.doesNotMatch(masked, /SECRETNOTE/, 'the first fence is masked');
    });

    // The adversarial trio on the first cut found shapes where the mask hid a comment markdown-it
    // renders as a REAL note, so `--strip-notes` shipped it and the audit stayed silent. Each was
    // stripped correctly before #2012; each must stay stripped.
    test('the trio\'s leak shapes: every real note is still removed', () => {
      const cases = [
        '===\n    <!-- S -->\n', // `===` with no paragraph above is text, so the next line continues it
        'Intro\n\n===\n    <!-- S -->\n',
        'para\n \n    <!-- S -->\n', // an NBSP line is not blank to markdown-it
        '<div>\n \n    <!-- S -->\n',
        '>\n<a href="x">\n```\n<!-- S -->\n\n<!-- S -->\n', // empty `>`: the lone tag opens a block
        '-\n<a href="x">\n```\n<!-- S -->\n',
        '[a]: /u\n<span>\n```\n<!-- S -->\n',
        '> # h\n<span>\n```\n<!-- S -->\n',
        '<span >\n```\n<!-- S -->\n```\n', // markdown-it's tag whitespace is `\s`
        '<a　b>\n```\n<!-- S -->\n',
        '<div>\n`<!-- S -->`\n', // backticks inside an HTML block are markup, not a code span
        'a \\`<!-- S -->` b\n', // an escaped backtick opens no span
        '``<!-- S -->`\n', // mismatched runs are not a span
        '>\n--\n\t<!-- S -->\n', // `--` under no paragraph is text, not a setext underline
        // The checker on the second cut: a lazy line after a container is not surely a paragraph,
        // and indented code needs a blank line before it.
        '> a\nb\n===\n    <!-- S -->\n',
        '[r]: x\n    a\n===\n    <!-- S -->\n',
        '[r]: x\n    a\n<x-y>\n```\n<!-- S -->\n',
        '| a |\n|---|\n    b\n<x-y>\n```\n<!-- S -->\n',
      ];
      for (const src of cases) assert.doesNotMatch(core.stripNotesFromSource(src), /S -->/, JSON.stringify(src));
    });

    // The invariant, measured against markdown-it itself: over generated documents built from the
    // line shapes above, no comment markdown-it renders as a live note is masked. 0 of 200,000 when
    // written (the scan this replaced: about 7,600 per 100,000).
    test('no comment markdown-it renders as a note is masked, over generated documents', () => {
      const md = new (require('markdown-it'))({ html: true });
      const FR = ['', ' ', ' ', 'text', '===', '---', '--', '-', '>', '> # h', '[a]: /u', 'a | b', '--|--', '# H', '<span>', '<span>x</span>', '<a href="x">', '<a b>', '<div>', '</div>', '```', '```js', '~~~', '    <!-- C -->', '\t<!-- C -->', '<!-- C -->', 'x <!-- C --> y', '- item', '1. item', '  - nested', '<!--', '-->', '<script>', '</script>', '`<!-- C -->`', '<br/>'];
      let seed = 5;
      const rnd = (k) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k;
      for (let n = 0; n < 3000; n++) {
        let id = 0;
        const lines = [];
        for (let i = 2 + rnd(7); i > 0; i--) lines.push(FR[rnd(FR.length)].replace(/C/g, () => `Q${id++}Z`));
        const src = `${lines.join('\n')}\n`;
        const out = md.render(src);
        const masked = core.maskCodeRegions(src);
        for (let j = 0; j < id; j++) {
          const at = out.indexOf(`Q${j}Z`);
          if (at < 0) continue;
          const before = out.slice(0, at);
          const live = before.lastIndexOf('<!--') > before.lastIndexOf('-->');
          assert.ok(!(live && !masked.includes(`Q${j}Z`)), `a live note was masked in ${JSON.stringify(src)}`);
        }
      }
    });

    // #2012: the line scanner has no container stack, so a fence in a list item, a code span across a
    // line break and an HTML block nested in a container each hid a comment markdown-it renders as a
    // live note. `maskCodeRegions` now asks the engine's parser and gives those comments back.
    test('container shapes: a live note inside a list, a quote or a broken span is never hidden', () => {
      const cases = [
        '- a\n  ```\n<!-- S -->\n', // markdown-it closes the fence when the item ends
        '`\nb` <!-- S --> `\n', // a code span cannot cross a blank-line-free break here
        '> <span>\n> `a <!-- S --> a`\n',
        '- <div>\n  `a <!-- S --> a`\n',
      ];
      for (const src of cases) {
        assert.match(core.maskCodeRegions(src), /S/, JSON.stringify(src));
        assert.doesNotMatch(core.stripNotesFromSource(src), /S/, JSON.stringify(src));
        assert.deepEqual(core.auditStrippedSource(core.stripNotesFromSource(src)), [], JSON.stringify(src));
      }
    });

    // The same differential, widened to containers: every line may carry a quote, list or indent
    // prefix, and the atoms include broken code spans. 20,000 documents here; the same generator over
    // 100,000 (seed 7) hid 1,278 live notes before the parser check and 0 after.
    // The checker's repros: an earlier `<!--` shown in code with no `-->` of its own starts a match that
    // runs to the live note's `-->`, so the live opener was never tagged, restored or scrubbed.
    test('an unclosed <!-- in code does not hide or swallow a live note after it', () => {
      const cases = [
        'Write `<!--` to open a note.\n\n- a\n  ```\n<!-- S -->\n',
        'Use `<!--` to open a note.\n\n`\nb` <!-- S --> `\n',
        'Write `<!--` to open.\n\n> <span>\n> `a <!-- S --> a`\n',
        '```md\n<!-- start a note\n```\n\n- a\n  ```\n<!-- S -->\n',
        'Para `<!--` and <!-- S --> end\n',
        '---\ntitle: <!-- x\n---\n- a\n  ```\n<!-- S -->\n',
        '---\ntitle: a\n---<div>\n---\n```\n<!-- S -->\n```\n',
      ];
      for (const src of cases) {
        const out = core.stripNotesFromSource(src);
        assert.doesNotMatch(out, /\bS\b/, JSON.stringify(src));
      }
    });

    test('runs of unclosed openers and long look-alike tags stay fast', () => {
      const openers = `x ${'<!-- '.repeat(30_000)}`;
      linearWork(() => core.stripNotesFromSource(openers), openers.length, 150, 'a run of unclosed openers');
      const lookalike = `zq0lcn${'x'.repeat(100_000)}\n\n<!-- a -->\n`;
      linearWork(() => core.maskCodeRegions(lookalike), lookalike.length, 64, 'a look-alike tag');
    });

    test('no live note is masked, over generated documents with containers', () => {
      const md = new (require('markdown-it'))({ html: true });
      const FR = ['', ' ', 'text', '===', '---', '>', '# H', '[a]: /u', 'a | b', '--|--', '<span>', '<span>x</span>', '<a href="x">', '<div>', '</div>', '```', '```js', '~~~', '    <!-- C -->', '<!-- C -->', 'x <!-- C --> y', '<!--', '-->', '<script>', '`<!-- C -->`', '`', 'b` <!-- C --> `', '`a <!-- C --> a`', 'a`', '<!-- C --> `', '`x <!-- C -->', '<!-- C --> x`', '- a', '1. a'];
      const PRE = ['', '', '', '> ', '- ', '  ', '1. ', '> - ', '- > ', '    ', '>> ', '- - '];
      let seed = 7;
      const rnd = (k) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k;
      let live = 0;
      for (let n = 0; n < 20_000; n++) {
        let id = 0;
        const lines = [];
        for (let i = 2 + rnd(6); i > 0; i--) lines.push(PRE[rnd(PRE.length)] + FR[rnd(FR.length)].replace(/C/g, () => `Q${id++}Z`));
        const src = `${lines.join('\n')}\n`;
        const out = md.render(src);
        const masked = core.maskCodeRegions(src);
        for (let j = 0; j < id; j++) {
          const at = out.indexOf(`Q${j}Z`);
          if (at < 0) continue;
          const before = out.slice(0, at);
          if (!(before.lastIndexOf('<!--') > Math.max(before.lastIndexOf('-->'), before.lastIndexOf('--!>')))) continue;
          live++;
          assert.ok(masked.includes(`Q${j}Z`), `a live note was masked in ${JSON.stringify(src)}`);
        }
      }
      assert.ok(live > 5_000, `the generator produced ${live} live notes`);
    });

    test('the HTML block names match markdown-it\'s own list', async () => {
      const { default: names } = await import('markdown-it/lib/common/html_blocks.mjs');
      assert.deepEqual(core.HTML_BLOCK_NAMES.split('|'), names);
    });

    // HTML block types 1–5 end on a line markdown-it tests with its own regex. notes-core writes two of
    // those tests without a regex (CodeQL's js/bad-tag-filter, #1958 §5 and §7). Each opener is followed
    // by a probe line, then a fence holding a comment. markdown-it decides whether the probe closed the
    // block (the fence is code) or not (the comment is raw HTML, a note); the mask must decide the same.
    // Ending a block too EARLY is the leak direction, which the `liveCommentOpeners` backstop also
    // catches; ending it too LATE leaves the fence unmasked, so `--strip-notes` deletes a comment out of
    // a code sample. Dropping the case fold or one closer turns this red.
    // A `<!X` declaration (type 4) opens on ANY ASCII letter in markdown-it 14 (`<![A-Za-z]`). The probe
    // test above cannot see the case: its comment line holds a `>`, which ends a type-4 block either way.
    // Here the fence comes before any `>`, so markdown-it reads the fence lines as raw HTML while a mask
    // that only knew `<![A-Z]` would open a fence on a lowercase declaration and hide what is inside.
    test('a lowercase <!x declaration opens an HTML block, as markdown-it reads it', async () => {
      const { default: MarkdownIt } = await import('markdown-it');
      const md = new MarkdownIt({ html: true });
      for (const open of ['<!a', '<!doctype html', '<!DOCTYPE html', '<!x y']) {
        const src = `${open}\n\`\`\`\nSECRETCODE --\n\`\`\`\n> \n`;
        const inFence = md.parse(src, {}).some((t) => t.type === 'fence' && t.content.includes('SECRETCODE'));
        const masked = !core.maskCodeRegions(src).includes('SECRETCODE');
        assert.equal(masked, inFence, `${JSON.stringify(open)}: markdown-it ${inFence ? 'fences' : 'keeps as raw HTML'} the line`);
      }
    });

    test('the HTML block end tests agree with markdown-it, opener by probe', async () => {
      const { default: MarkdownIt } = await import('markdown-it');
      const md = new MarkdownIt({ html: true });
      const openers = ['<script>', '<SCRIPT type="x">', '<pre', '<style>', '<textarea>', '<!-- open', '<?php', '<!DOCTYPE x', '<!doctype x', '<!a', '<![CDATA[ x'];
      const probes = [
        'plain', '</script>', '</SCRIPT>', '</ScRiPt>', '</script >', '</script\t>', '</scrİpt>', '</scrıpt>', 'a</pre>b', '</PRE>',
        '</style>', '</STYLE >', '</textarea>', '</TextArea>', '</scriptx>', '<\\/script>', '-->', '--!>', '- ->', 'x -->',
        '?>', '? >', '>', 'no close', ']]>', '] ]>', '</', '<</style>>',
      ];
      let fenced = 0;
      for (const open of openers) {
        for (const probe of probes) {
          const src = `${open}\n${probe}\n\`\`\`\n<!-- SECRETNOTE -->\n\`\`\`\n`;
          const inFence = md.parse(src, {}).some((t) => t.type === 'fence' && t.content.includes('SECRETNOTE'));
          if (inFence) fenced++;
          const masked = !core.maskCodeRegions(src).includes('SECRETNOTE');
          assert.equal(masked, inFence, `${JSON.stringify(open)} then ${JSON.stringify(probe)}: markdown-it ${inFence ? 'fences' : 'keeps'} the comment`);
        }
      }
      // Both outcomes occur, so the probes exercise the end tests rather than one branch of them.
      assert.ok(fenced > 20 && fenced < openers.length * probes.length - 20, `fenced ${fenced}`);
    });

    // The lone-tag reader (HTML block type 7) is a hand-written linear version of markdown-it's
    // `HTML_OPEN_CLOSE_TAG_RE + \\s*$`. Disagreeing where markdown-it sees a tag is the LEAK
    // direction (a fence the scan opens inside what markdown-it reads as HTML), so it is checked
    // against the real regex on generated near-tags: 300,000 cases, 0 divergences when written.
    test('the lone-tag reader agrees with markdown-it on generated near-tags', async () => {
      const { HTML_OPEN_CLOSE_TAG_RE } = await import('markdown-it/lib/common/html_re.mjs');
      const T7 = new RegExp(`${HTML_OPEN_CLOSE_TAG_RE.source}\\s*$`);
      const BLOCK = new Set(core.HTML_BLOCK_NAMES.split('|'));
      let seed = 11;
      const rnd = (k) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k;
      const pick = (a) => a[rnd(a.length)];
      const WS = ['', ' ', '  ', '\t', ' \t'];
      const names = ['span', 'a', 'x-y', 'my-el2', 'img', 'Custom', '1bad', '-x', 'b'];
      const attrs = ['href', 'data-x', ':a', '_b', 'a.b', 'x:y', '1z', '-q', 'cl@ss'];
      const vals = ['v', '"q v"', "'s v'", '"un', "'un", 'a=b', 'a`b', 'a<b', '', '""', "''", 'x/y'];
      let tags = 0;
      for (let k = 0; k < 20_000; k++) {
        let s = `<${pick(names)}`;
        if (rnd(5) === 0) s = `</${pick(names)}${pick(WS)}>`;
        else {
          for (let i = rnd(4); i > 0; i--) s += pick([' ', '  ', '\t', '']) + pick(attrs) + (rnd(2) ? `${pick(WS)}=${pick(WS)}${pick(vals)}` : '');
          s += pick(WS) + pick(['>', '/>', ' />', '', '>>', '>x']) + pick(['', ' ', '\t ']);
        }
        if (rnd(6) === 0) {
          const i = rnd(s.length);
          s = s.slice(0, i) + pick(['"', "'", '<', '>', ' ', '=', '`']) + s.slice(i + 1);
        }
        const name = (/^<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(s) || [])[1]?.toLowerCase();
        const type6 = !!name && BLOCK.has(name) && /^<\/?[A-Za-z0-9]+(?=\s|\/?>|$)/.test(s);
        if (T7.test(s)) tags++;
        // A block holds the fence on the next line, so its body stays visible in the mask.
        const held = /XXXX/.test(core.maskCodeRegions(`${s}\n\`\`\`\nXXXX\n\`\`\`\n`));
        assert.equal(held, T7.test(s) || type6, JSON.stringify(s));
      }
      assert.ok(tags > 5_000, `the generator produced ${tags} real tags`);
    });

    test('a long line of attribute-ish text is read in linear time', () => {
      const line = `<a${' b'.repeat(100_000)}${' '.repeat(100_000)}\n\n`;
      linearWork(() => core.maskCodeRegions(line), line.length, 64, 'a long attribute-ish line');
    });
  });

  test('a fence-shaped line that is NOT a fence cannot hide a note from the scrub', () => {
    // The position model's one dangerous direction: a phantom code region hides a real note
    // and it ships in the shared file. Both vectors below leaked before the scan learned that
    // markdown-it does not read a fence line inside an HTML block or inside a comment.
    const htmlBlock = [
      '# Quarterly review',
      '',
      '<details>',
      '<summary>Detail</summary>',
      '```', // inside the HTML block — not a fence
      '',
      '<!-- SECRET: do not say the layoffs number -->',
      '',
      '```js',
      'const revenue = 42;',
      '```',
      '',
      '<!-- Wrap up in two minutes. -->',
      '',
    ].join('\n');
    const out = core.stripNotesFromSource(htmlBlock);
    assert.doesNotMatch(out, /SECRET/, 'the note after a phantom fence is still scrubbed');
    assert.doesNotMatch(out, /Wrap up/, 'and so is every note after it');
    // A note that QUOTES an unclosed fence used to blank the rest of the document.
    const quoted = '<!--\nShow them this:\n```js\nchart(1)\n-->\n\n---\n\n<!-- SECRET: do not say the layoffs number -->\n';
    assert.doesNotMatch(
      core.stripNotesFromSource(quoted),
      /SECRET/,
      'a fence inside a comment body opens nothing',
    );
  });

  test('a note-shaped comment inside a NESTED fence survives the scrub', () => {
    const source = '````markdown\n```js\n<!-- Board only -->\n```\n````\n\n<!-- Board only -->\n';
    const out = core.stripNotesFromSource(source);
    assert.equal((out.match(/Board only/g) || []).length, 1, 'the sample survives, the real note goes');
    assert.match(out, /```js\n<!-- Board only -->\n```/);
  });

  test('stripSayFromSource is POSITION-aware for the same reason', () => {
    const source = '```markdown\n<!-- @say{Read this aloud.} -->\n```\n\n<!-- @say{Read this aloud.} -->\n';
    const out = core.stripSayFromSource(source);
    assert.equal((out.match(/Read this aloud/g) || []).length, 1, 'the documented sample survives, the real caption goes');
    assert.match(out, /```markdown\n<!-- @say\{Read this aloud\.\} -->\n```/);
  });

  // ── The caption channel takes the note channel's cut (#2003) ──────────────────────────────
  // Every claim below is the caption twin of one already pinned for `stripNotesFromSource`.
  // They are asserted separately rather than by reading the shared helper, because what #2003
  // was: the two strips agreeing on the IDEA of a cut while one of them took the span only.
  test('stripSayFromSource leaves no line where a caption was (#2003)', () => {
    // The residue IS the disclosure, exactly as it was for notes: an empty line where a caption
    // comment sat names WHICH slides carried one, in the source the envelope ships AND — since
    // the export re-renders that source — in the rendered bytes.
    assert.equal(
      core.stripSayFromSource('# Slide\n\n<!-- @say{Read this aloud.} -->\n\nBody.\n'),
      '# Slide\n\nBody.\n',
      'the caption line and one of its blank neighbors go; one blank line remains'
    );
    // No `\n\n\n` run left behind — the cheaper tell, readable with `grep -c` and no re-render.
    assert.doesNotMatch(
      core.stripSayFromSource('a\n\n<!-- @say{x} -->\n\nb\n\n<!-- @say{y} -->\n\nc\n'),
      /\n\n\n/,
      'two captions between blank lines leave no blank-line run'
    );
    assert.equal(
      core.stripSayFromSource('a\n  <!-- @say{x} -->\nb\n'),
      'a\n\nb\n',
      'the leading indent goes with the line, and the block boundary it was providing stays'
    );
    // CRLF: the `\r` travels with its line rather than being left dangling.
    assert.equal(
      core.stripSayFromSource('a\r\n\r\n<!-- @say{x} -->\r\n\r\nb\r\n'),
      'a\r\n\r\nb\r\n',
      'a CRLF deck keeps CRLF throughout'
    );
    // An INLINE caption keeps its author-typed spaces — deleting one would join two words.
    assert.equal(core.stripSayFromSource('a <!-- @say{x} --> b'), 'a  b');
  });

  test('stripSayFromSource keeps the BLOCK BOUNDARY a caption comment was providing (#2003)', () => {
    // A caption comment is an HTML block just as a note comment is, so removing it outright
    // re-cuts the deck the same way: `Some text\n---` is a setext H2, not a slide break.
    assert.equal(
      core.stripSayFromSource('Some text\n<!-- @say{Read this.} -->\n---\n'),
      'Some text\n\n---\n',
      'the `---` stays a thematic break rather than becoming a setext underline'
    );
    assert.equal(
      core.stripSayFromSource('First paragraph.\n<!-- @say{Read this.} -->\nSecond paragraph.\n'),
      'First paragraph.\n\nSecond paragraph.\n',
      'two paragraphs stay two paragraphs'
    );
    // Both cuts offered, for the same reason the note strip offers them: inside a list item an
    // empty line turns a tight list loose, so the caller measures which reproduces the deck.
    const list = '- one\n  <!-- @say{x} -->\n- two\n';
    assert.equal(core.stripSayFromSource(list, { boundary: 'drop' }), '- one\n- two\n');
    assert.equal(core.stripSayFromSource(list, { boundary: 'preserve' }), '- one\n\n- two\n');
    // `preserve` is the default, so a caller that does not opt in gets the conservative cut.
    const setext = 'Some text\n<!-- @say{x} -->\n---\n';
    assert.equal(core.stripSayFromSource(setext), core.stripSayFromSource(setext, { boundary: 'preserve' }));
    assert.equal(core.stripSayFromSource(setext, { boundary: 'drop' }), 'Some text\n---\n');
  });

  test('the two channels come off in ONE pass, because chaining them does not commute (#2003)', () => {
    // What the CLI runs under `--strip-notes --strip-say`. The obvious composition —
    // scrub notes, then scrub captions — was what shipped first, on the claim that the two are
    // "order-independent, the classes are disjoint". Disjoint BODIES is true and is not the
    // whole interaction: once both cuts became line-aware they meet through BLANK-LINE
    // ACCOUNTING. The first scrub takes a line and may leave an empty one in its place, so the
    // second reads neighbors the author never wrote.
    // The divergence needs the pair at the END of the input, where "end of file counts as blank
    // on the right" meets a blank the first scrub just emitted on the left. Mid-deck the two
    // orders agree, which is why a plausible-looking fixture does not measure this.
    //
    // THIS GUARD IS A SEARCH, NOT A LITERAL, and the reason is that the literal it used to be
    // stopped measuring — THREE TIMES, all inside one change. It was
    // `'## Third slide\n\nClosing.\n<!-- say: c -->\n<!-- n -->\n'`; closing the
    // end-of-input residual (#2039) made the two orders agree on it, exactly as the comment here
    // predicted it would. Its replacement went quiet when the rule was widened to cover a blank
    // line AFTER the comment, and the replacement for THAT went quiet when the whole trailing
    // run started coming off. Each time the literal still passed as an assertion while measuring
    // nothing. Divergence is still real and has simply moved off the end of the file — so the
    // corpus does the finding, and the literal below exists only to be readable.
    // `' '` — a WHITESPACE-ONLY line — is load-bearing in this alphabet. The surviving
    // divergence is now mid-deck rather than at the end, and it is the two orders disagreeing
    // about whether the author's whitespace-only line survives between the comments.
    const LINES = ['Text.', '', '<!-- n -->', '<!-- @say{c} -->', ' '];
    const divergent = [];
    // Depth 5: the shape is `text / note / caption / whitespace-line / text`, which four lines
    // cannot express. Measured at ~160ms for the whole sweep, so the depth is affordable.
    const walk = (acc, depth) => {
      if (depth === 0) {
        for (const trail of ['', '\n']) {
          const s = acc.join('\n') + trail;
          const notesFirst = core.stripSayFromSource(core.stripNotesFromSource(s));
          const sayFirst = core.stripNotesFromSource(core.stripSayFromSource(s));
          if (notesFirst !== sayFirst) divergent.push(s);
        }
        return;
      }
      for (const l of LINES) walk([...acc, l], depth - 1);
    };
    for (let d = 1; d <= 5; d++) walk([], d);
    assert.ok(
      divergent.length > 0,
      'guard: chaining the two scrubs is order-dependent, which is WHY the export runs one pass. '
      + 'If this search finds nothing, either the cut changed or this corpus stopped reaching the '
      + 'shape — do not delete the test, widen it and re-measure.'
    );
    // The shape the search finds today, pinned so a reader can see what it is without running it.
    const src = 'Text.\n<!-- n -->\n<!-- @say{c} -->\n \nText.';
    assert.ok(divergent.includes(src), 'the recorded divergent shape is still in the corpus');
    assert.notEqual(
      core.stripSayFromSource(core.stripNotesFromSource(src)),
      core.stripNotesFromSource(core.stripSayFromSource(src))
    );
    // ONE PASS judges every comment against the SOURCE's own neighbors, so there is no order.
    const onePass = core.stripChannelsFromSource(src, { notes: true, say: true });
    assert.equal(onePass, core.stripChannelsFromSource(src, { say: true, notes: true }));
    // Both channels gone, and the same answer whichever way the chained version would have gone.
    assert.doesNotMatch(onePass, /<!--/, 'no comment survives the combined scrub');

    // The ordinary shape, where the two agree: the composed result is the deck as if neither
    // comment had been typed.
    const plain = '# Slide\n\n<!-- @say{Read this aloud.} -->\n\nBody.\n\n<!-- @note{Pause here.} -->\n\nMore.\n';
    assert.equal(
      core.stripChannelsFromSource(plain, { notes: true, say: true }),
      '# Slide\n\nBody.\n\nMore.\n'
    );
  });

  test('a comment at END of input takes the blank line ABOVE it, under BOTH cuts (#2039)', () => {
    // This was the KNOWN RESIDUAL, recorded as "the tie-break's to fix" and pinned as wrong.
    // It was neither. End-of-file counts as blank on the right, but it is the file ENDING, not
    // a line that can be taken — so `prevBlank && nextBlank`'s "one of the two blanks goes"
    // consumed nothing, and the blank ABOVE a trailing comment survived. The cut now takes that
    // one instead: there is no block below for it to be separating.
    //
    // WHY THE TIE-BREAK COULD NEVER HAVE CLOSED IT. The record said `drop` reproduced the
    // counterfactual and `preserve` did not, which reads as a `preserve`/`drop` question. That
    // held only for the two-adjacent-comment shape, where the first comment's emitted blank is
    // what the second one misreads. Take ONE comment with a blank line already above it and
    // both cuts left the blank — `'A\n\n<!-- n -->\n'` came out `'A\n\n'` either way. No choice
    // of tie-break reaches that, because the boundary argument is not consulted on this branch.
    const opts = { notes: true, say: true };
    for (const boundary of core.SCRUB_BOUNDARIES) {
      assert.equal(
        core.stripChannelsFromSource('## Third slide\n\nClosing.\n<!-- @say{c} -->\n<!-- @note{n} -->\n', { ...opts, boundary }),
        '## Third slide\n\nClosing.\n',
        `two comments at end of input reproduce the counterfactual under \`${boundary}\``
      );
      // The single-comment shape, which the tie-break reading did not cover at all.
      assert.equal(
        core.stripNotesFromSource('A\n\n<!-- n -->\n', { boundary }),
        'A\n',
        `one comment with a blank above it, at end of input, under \`${boundary}\``
      );
      // END OF INPUT IS NOT "THE COMMENT'S NEWLINE IS THE LAST BYTE", and the first cut of this
      // fix got that wrong. A file ending with a BLANK LINE after the comment still has a
      // newline to find, so the "blank below goes too" branch fired, took the blank below and
      // left the one above — the same one-byte residue, one keystroke from the shape that was
      // fixed. `examples/kaizen-craftsmanship.md` is that shape and is shipped. Every
      // end-of-input variant now lands on `A\n`, whichever side the author's blank was on.
      for (const tail of ['\n', '\n\n', '\n \n', '\n\n\n', '']) {
        assert.equal(
          core.stripNotesFromSource(`A\n\n<!-- n -->${tail}`, { boundary }),
          'A\n',
          `blank above, ${JSON.stringify(tail)} after, under \`${boundary}\``
        );
      }
      // Text above rather than a blank, same tails — no blank line is invented at the end.
      for (const tail of ['\n', '\n\n', '']) {
        assert.equal(core.stripNotesFromSource(`A\n<!-- n -->${tail}`, { boundary }), 'A\n');
      }
      // A RUN of blank lines on either side goes too, and this is the rule the first two cuts of
      // the fix got wrong in opposite directions: one took a single blank and left `A\n\n`, the
      // next took every blank BELOW but only one above, so the branch was asymmetric and the
      // comment describing it was false. At end of input the whole trailing run goes, from
      // whichever side — there is no block below for any of it to be separating.
      assert.equal(core.stripNotesFromSource('A\n\n\n<!-- n -->\n', { boundary }), 'A\n');
      assert.equal(core.stripNotesFromSource('A\n\n\n\n<!-- n -->\n', { boundary }), 'A\n');
      assert.equal(core.stripNotesFromSource('A\n<!-- n -->\n\n\n', { boundary }), 'A\n');
      assert.equal(core.stripNotesFromSource('A\r\n\r\n\r\n<!-- n -->\r\n', { boundary }), 'A\r\n');
      // Trailing spaces on the last CONTENT line are the author's and stay — the trim takes
      // blank LINES, not whitespace.
      assert.equal(core.stripNotesFromSource('A  \n\n<!-- n -->\n', { boundary }), 'A  \n');
      // `[ \t\r\n]`, NOT `\s`: a non-breaking space is a paragraph to markdown, not a blank line.
      // With `\s` the deck below lost a whole `<p>`, and a fuzz oracle written with `\s` could
      // not see it — the bug and the check shared a character class.
      assert.equal(
        core.stripNotesFromSource('A\n\n<!-- n -->\n \n', { boundary }),
        'A\n\n \n',
        'a non-breaking-space line is content, so this is not end of input at all'
      );
      // A CRLF deck takes its own terminator with it rather than leaving a lone carriage return.
      assert.equal(core.stripNotesFromSource('A\r\n\r\n<!-- n -->\r\n', { boundary }), 'A\r\n');
      // Start-of-file is the same branch with nothing emitted yet — there is no blank to take,
      // and trimming an empty output must not throw or invent one.
      assert.equal(core.stripNotesFromSource('<!-- n -->\n', { boundary }), '');
      // NOT at end of input: the blank BELOW still goes, exactly as before. This is the half of
      // the branch that was always right, and the fix must not move it.
      assert.equal(
        core.stripNotesFromSource('# S\n\n<!-- n -->\n\nBody.\n', { boundary }),
        '# S\n\nBody.\n'
      );
    }
  });

  test('a scrubbed source equals the repo\'s own hand-written note-free twin, byte for byte (#2039)', () => {
    // The measurement that found it. `strip-notes-deck-no-notes.md` is committed precisely as
    // "the fixture as a person would have written it with nothing to say", so it IS the
    // counterfactual — and the scrub missed it by one byte, the trailing blank line, under both
    // cuts. The integration guard could not see this: it compares RENDERED sections, and the
    // residue renders identically. The bytes are the artifact, so the bytes are the assertion.
    const fs = require('node:fs');
    const path = require('node:path');
    const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', rel), 'utf8');
    const noted = read('strip-notes-deck.md');
    assert.ok((noted.match(/<!-- @note\{/g) || []).length >= 3, 'guard: the fixture still carries the notes this measures');
    for (const boundary of core.SCRUB_BOUNDARIES) {
      assert.equal(
        core.stripNotesFromSource(noted, { boundary }),
        read('strip-notes-deck-no-notes.md'),
        `the stripped source is byte-identical to the note-free twin under \`${boundary}\``
      );
      // THE CAPTION CHANNEL GETS THE SAME ASSERTION, and not for symmetry: the two channels share
      // one cut, so a regression of exactly this class would land in both. It held before this
      // test existed — but unguarded, which is how the note channel came to ship the residue for
      // two releases with the caption channel's own byte arm sitting one file away.
      assert.equal(
        core.stripSayFromSource(read('strip-say-deck.md'), { boundary }),
        read('strip-say-deck-no-say.md'),
        `the stripped source is byte-identical to the caption-free twin under \`${boundary}\``
      );
    }
  });

  test('stripChannelsFromSource throws on the pre-rename `captions` option instead of returning the say text', () => {
    // A privacy call that ignored the old key would ship the say lines unstripped (fail open).
    const src = '---\nsay:\n  1: secret fm\n---\n\n# A\n\n<!-- say: secret inline -->\n<!-- @say{secret named} -->\n';
    assert.throws(() => core.stripChannelsFromSource(src, { captions: true }), /renamed to `say`/);
    assert.doesNotMatch(core.stripChannelsFromSource(src, { say: true }), /secret/);
  });

  test('stripChannelsFromSource throws on the removed `noteBodies` option instead of returning the notes', () => {
    // `noteBodies` was the note set lifted from the render until 2026-11-20. An ignored key would return the notes
    // UNSTRIPPED from a privacy call, so it throws, present but empty or undefined alike.
    const src = '# A\n\n<!-- @note{secret} -->\n';
    for (const noteBodies of [new Set(['secret']), [], undefined]) {
      assert.throws(() => core.stripChannelsFromSource(src, { noteBodies }), /`noteBodies` was replaced by `notes: true`/);
    }
    assert.doesNotMatch(core.stripChannelsFromSource(src, { notes: true }), /secret/);
  });

  test('stripChannelsFromSource is a no-op when neither channel is asked for', () => {
    const src = '# S\n\n<!-- @note{a note} -->\n\n<!-- a plain comment -->\n\n<!-- @say{x} -->\n';
    assert.equal(core.stripChannelsFromSource(src, {}), src, 'no flags — verbatim');
    assert.equal(core.stripChannelsFromSource(src, { notes: false, say: false }), src, 'both flags off — verbatim');
    assert.equal(core.stripChannelsFromSource(null, { say: true }), '');
    // Each channel alone matches its own single-channel entry point, so the flags stay orthogonal.
    assert.equal(
      core.stripChannelsFromSource(src, { notes: true }),
      core.stripNotesFromSource(src)
    );
    assert.equal(core.stripChannelsFromSource(src, { say: true }), core.stripSayFromSource(src));
  });
});

// ── Directive classification ────────────────────────────────────────────────
// `stripNotesFromSource` deletes any comment whose body was lifted as a note. Its
// directive safety used to rest on the ENGINE having consumed every directive before
// notes-core ever saw the HTML. That is the engine's property, not this module's, and it
// fails on a deck where a directive survives into the rendered section — the directive is
// lifted as a note and then deleted from the verbatim source the envelope carries, so the
// recipient re-imports a deck whose slide has silently lost its class.
// ── Which cut fits the document that SHIPS ──────────────────────────────────
// `measureScrubBoundary` is the decision `--embed-source` needs and pass 2 cannot make for it:
// the PDF attaches the deck as the author wrote it, pass 2 renders the pre-processed one, and a
// boundary measured on the second is a claim about the wrong file.
//
// THESE ASSERT THE DECISION, NOT A MARKDOWN MODEL. `scrub` and `render` are injected, so each
// case states outright which source renders to what and the assertion is purely about which
// branch fires and which answer comes back. That is the whole reason the function was extracted:
// while it lived inline in `lattice.js`, step 3 was reachable only through a deck
// fixture whose two documents happen to want the SAME cut, so backing the entire guard out left
// every test green.
//
// SAY THAT PRECISELY, because an earlier version of this comment did not. The step-3 ANSWER was
// asserted even then — `strip-notes-no-fingerprint.test.js` pins the attachment's tight list, and
// a wrong boundary fails it. What no test could see was the guard's PRESENCE. Overstating it as
// "the answer was never asserted" is exactly the kind of claim nobody re-derives that this whole
// branch exists to stop shipping.
describe('notes-core: measureScrubBoundary picks the cut for the attached document (#2040)', () => {
  // A render is a lookup: `SOURCE → sections`. Anything unlisted renders to a distinct nonsense
  // shape, so a wrong branch shows up as a mismatch rather than an accidental pass.
  const renderer = (table, log) => (src) => {
    if (log) log.push(src);
    return table[src] || [`<section>unlisted:${src}</section>`];
  };
  // A scrub is a lookup too, keyed by source AND boundary, recording what it was asked to cut.
  const scrubber = (table, log) => (src, boundary) => {
    if (log) log.push({ src, boundary });
    return Object.hasOwn(table, `${src}|${boundary}`) ? table[`${src}|${boundary}`] : src;
  };
  // `inherited: 'drop'` is LOAD-BEARING, and the first cut of these tests got it wrong. It was
  // `'preserve'` — which is also `SCRUB_BOUNDARIES[0]`, so "returns the INHERITED boundary" and
  // "returns the FIRST candidate" produced the same string and three of the four branches could
  // not tell them apart. Swapping the fail-closed branch's `inherited` for `boundaries[0]` left
  // the whole suite green. Only step 1's test escaped, because it overrides this on purpose.
  // Any value here that is not the head of `SCRUB_BOUNDARIES` restores the discrimination.
  const base = { attached: 'ATTACHED', rendered: 'RENDERED', inherited: 'drop' };
  assert.notEqual(base.inherited, core.SCRUB_BOUNDARIES[0], 'guard: see the comment above — this must not be the first candidate');

  test('step 1 — the same document: inherit the answer AND its confidence', () => {
    const renders = [];
    for (const inheritedMeasured of [true, false]) {
      const got = core.measureScrubBoundary({
        ...base, attached: 'SAME', rendered: 'SAME', inherited: 'drop', inheritedMeasured,
        scrub: () => assert.fail('step 1 must not scrub'), render: renderer({}, renders),
      });
      assert.deepEqual(got, { boundary: 'drop', measured: inheritedMeasured, step: 'inherited' });
    }
    // A fidelity fallback leaves `scrubBoundary` at its initial value, which is not a measurement.
    // Inheriting the boundary while silently upgrading its confidence is how `--embed-source`
    // came to warn about a block-boundary comment on a deck that had no comments at all.
    assert.deepEqual(renders, [], 'step 1 renders nothing');
  });

  test('step 2 — every cut agrees, so no choice can change what ships and none is rendered', () => {
    const renders = [];
    const got = core.measureScrubBoundary({
      ...base,
      // Both cuts of ATTACHED come out the same, so the boundary is irrelevant HERE whatever the
      // other document decided.
      scrub: scrubber({ 'ATTACHED|preserve': 'CUT', 'ATTACHED|drop': 'CUT' }),
      render: renderer({}, renders),
      inheritedMeasured: false,
    });
    assert.deepEqual(got, { boundary: 'drop', measured: true, step: 'cuts-agree' });
    assert.equal(got.measured, true, 'measured is TRUE on its own terms even when the inherited answer was not');
    assert.deepEqual(renders, [], 'step 2 renders nothing — it is two string scrubs');
  });

  test('step 3 — renders the ATTACHED document and keeps the cut that reproduces it', () => {
    // THE ASSERTION THE OLD SHAPE COULD NOT MAKE. Two cuts that differ, and only one reproduces
    // the deck: the answer is now checked, not merely reached.
    const fits = ['<section>A</section>', '<section>B</section>'];
    const scrub = scrubber({ 'ATTACHED|preserve': 'LOOSE', 'ATTACHED|drop': 'TIGHT' });
    // `drop` wins: a note indented in a list item, where an empty line turns a tight list loose.
    assert.deepEqual(
      core.measureScrubBoundary({
        ...base, scrub,
        render: renderer({ ATTACHED: fits, TIGHT: fits, LOOSE: ['<section>A</section>', '<section>B<p></p></section>'] }),
      }),
      { boundary: 'drop', measured: true, step: 'measured' }
    );
    // `preserve` wins: a note above a `---`, where taking the line makes the rule a setext
    // underline and the deck GAINS a slide. Same neighbors, opposite right answer.
    assert.deepEqual(
      core.measureScrubBoundary({
        ...base, scrub,
        render: renderer({ ATTACHED: fits, LOOSE: fits, TIGHT: ['<section>AB</section>'] }),
      }),
      { boundary: 'preserve', measured: true, step: 'measured' }
    );
  });

  test('step 3 cuts the ATTACHED document, never the one the inherited answer came from', () => {
    // The defect in one assertion. Scrubbing `rendered` here would find two agreeing cuts and
    // return `cuts-agree`; scrubbing `attached` finds two that differ and measures them.
    const asked = [];
    const got = core.measureScrubBoundary({
      ...base,
      scrub: scrubber({
        'ATTACHED|preserve': 'X', 'ATTACHED|drop': 'Y',
        'RENDERED|preserve': 'SAME', 'RENDERED|drop': 'SAME',
      }, asked),
      render: renderer({ ATTACHED: ['<section>k</section>'], Y: ['<section>k</section>'] }),
    });
    assert.deepEqual(got, { boundary: 'drop', measured: true, step: 'measured' });
    assert.deepEqual([...new Set(asked.map((a) => a.src))], ['ATTACHED'], 'only the attached document is cut');
  });

  test('fail-closed — no cut reproduces the deck: keep the inherited boundary, say it is unmeasured', () => {
    const got = core.measureScrubBoundary({
      ...base,
      scrub: scrubber({ 'ATTACHED|preserve': 'P', 'ATTACHED|drop': 'D' }),
      render: renderer({ ATTACHED: ['<section>original</section>'] }),
    });
    // The caller still scrubs — the note text must go from every copy — and `measured: false` is
    // what turns the author's warning on.
    assert.deepEqual(got, { boundary: 'drop', measured: false, step: 'unmeasured' });
  });

  test('a render that throws costs the MEASUREMENT, not the artifact', () => {
    // The caller is an export step whose own `catch` drops the attachment and blames the PDF
    // library. This must not propagate.
    const seen = [];
    const got = core.measureScrubBoundary({
      ...base,
      scrub: scrubber({ 'ATTACHED|preserve': 'P', 'ATTACHED|drop': 'D' }),
      render: () => { throw new Error('engine exploded'); },
      onRenderError: (e) => seen.push(e.message),
    });
    assert.deepEqual(got, { boundary: 'drop', measured: false, step: 'unmeasured' });
    assert.deepEqual(seen, ['engine exploded'], 'the caller is told, once');
    // And it is optional: without a handler the throw is still swallowed rather than escaping.
    assert.equal(
      core.measureScrubBoundary({
        ...base, scrub: scrubber({ 'ATTACHED|preserve': 'P', 'ATTACHED|drop': 'D' }),
        render: () => { throw new Error('boom'); },
      }).step,
      'unmeasured'
    );
  });

  test('the two defaults fail CLOSED — an omitted confidence, and an empty candidate list', () => {
    // `inheritedMeasured` exists to distinguish a measured boundary from the initial value a
    // fidelity fallback leaves behind. Defaulting it to `true` answered that question in the one
    // direction it was invented to prevent, and nothing pinned the default either way.
    assert.deepEqual(
      core.measureScrubBoundary({ ...base, attached: 'SAME', rendered: 'SAME', scrub: () => '', render: () => [] }),
      { boundary: 'drop', measured: false, step: 'inherited' },
      'an omitted confidence is not a measurement'
    );
    // `[].every()` is vacuously true, so an empty candidate list used to report `cuts-agree` —
    // a measurement off zero candidates, handing back `cuts[0]`, which is `undefined`.
    const got = core.measureScrubBoundary({
      ...base, boundaries: [], scrub: () => assert.fail('nothing to scrub'), render: () => assert.fail('nothing to render'),
    });
    assert.deepEqual(got, { boundary: 'drop', measured: false, step: 'unmeasured' });
    assert.notEqual(got.boundary, undefined, 'and the boundary it hands back is a real one');
  });

  test('candidates are tried in the order given, and default to the shared list', () => {
    const fits = ['<section>same</section>'];
    // Both cuts reproduce the deck, so ORDER decides — the same property `SCRUB_BOUNDARIES`
    // exists to keep identical across the CLI and the Studio.
    const opts = {
      ...base,
      scrub: scrubber({ 'ATTACHED|preserve': 'P', 'ATTACHED|drop': 'D' }),
      render: renderer({ ATTACHED: fits, P: fits, D: fits }),
    };
    assert.equal(core.measureScrubBoundary(opts).boundary, 'preserve', 'the shared list is conservative-first');
    assert.equal(core.measureScrubBoundary({ ...opts, boundaries: ['drop', 'preserve'] }).boundary, 'drop');
  });

  test('sameSlideShape is whitespace-blind but not markup-blind, and slide COUNT is part of it', () => {
    // The comparison all three cut measurements now share. It has to ignore exactly the residue
    // the cut exists to drop, and nothing else.
    assert.ok(core.sameSlideShape(['<section> <p>a</p>\n</section>'], ['<section><p>a</p></section>']));
    assert.ok(core.sameSlideShape(['<section><!-- n --><p>a</p></section>'], ['<section><p>a</p></section>']),
      'a comment node is not a difference — the scrubbed render has none and the authored one does');
    assert.ok(!core.sameSlideShape(['<section><li>a</li></section>'], ['<section><li><p>a</p></li></section>']),
      'tight vs loose IS a difference — it is the whole reason two cuts are offered');
    assert.ok(!core.sameSlideShape(['<section>a</section>'], ['<section>a</section>', '<section>b</section>']),
      'a gained slide is a difference');
    assert.ok(!core.sameSlideShape(null, []), 'a non-array is never a match');
  });
});

describe('notes-core: stripNotesFromSource leaves no line where a note was (#1985)', () => {
  test('stripNotesFromSource takes the whole LINE, so no blank line marks where a note was (#1985)', () => {
    // The residue IS the disclosure. Replacing the `<!-- … -->` span alone leaves the line
    // behind as an empty one, and an empty line where a note used to sit names WHICH slides
    // carried a note — in the very source the player envelope ships for re-import. It also
    // reaches the rendered bytes, because the export re-renders this scrubbed source.
    //
    // A blank line on EACH side means one of them goes too, so no run is left where the note
    // was. Measured on the 23 decks this repo ships with notes: taking the line alone added a
    // `\n\n\n` run to 16 of them, which is a cheaper tell than the one #1985 closed —
    // `grep -c` on the shipped file, no re-render needed. This rule adds one to none.
    assert.equal(
      core.stripNotesFromSource('# Slide\n\n<!-- Pause here. -->\n\nBody.\n'),
      '# Slide\n\nBody.\n',
      'the note line and one of its blank neighbors go; one blank line remains'
    );
    // Indented, as a nested-list author would write it.
    assert.equal(
      core.stripNotesFromSource('a\n  <!-- n -->\nb\n'),
      'a\n\nb\n',
      'the leading indent goes with the line, and the block boundary it was providing stays'
    );
    // Last line, no trailing newline: there is no terminator to take, and the PRECEDING
    // one belongs to the line above and must survive.
    assert.equal(
      core.stripNotesFromSource('a\n<!-- n -->'),
      'a\n',
      'a note on the final line leaves the previous line intact'
    );
    // CRLF: the `\r` is part of this line's terminator and travels with it, rather than
    // being left dangling as a lone carriage return in a Windows-authored deck.
    assert.equal(
      core.stripNotesFromSource('a\r\n\r\n<!-- n -->\r\n\r\nb\r\n'),
      'a\r\n\r\nb\r\n',
      'a CRLF deck keeps CRLF throughout'
    );
    // TWO notes on ONE line, with nothing else on it: the line goes.
    assert.equal(
      core.stripNotesFromSource('a\n\n<!-- one --><!-- two -->\n\nb\n'),
      'a\n\nb\n',
      'two notes sharing a line take the line with them'
    );
    // The whole file.
    assert.equal(core.stripNotesFromSource('<!-- n -->'), '');
  });

  test('stripNotesFromSource offers BOTH cuts, because the right one is deck-dependent (#1985 checker)', () => {
    // The `text / text` case has two right answers and no local test can pick between them.
    // Above a `---` the comment IS the block boundary, so an empty line must take its place —
    // delete the line and `Some text\n---` becomes a setext H2. Inside a LIST item the opposite
    // holds: an empty line turns a tight list loose, and simply taking the line reproduces the
    // author's own tight list. Same neighbors, opposite answers, so the caller measures.
    const setext = 'Some text\n<!-- n -->\n---\n';
    assert.equal(core.stripNotesFromSource(setext, { boundary: 'preserve' }), 'Some text\n\n---\n');
    assert.equal(core.stripNotesFromSource(setext, { boundary: 'drop' }), 'Some text\n---\n');
    const list = '- one\n  <!-- n -->\n- two\n';
    assert.equal(core.stripNotesFromSource(list, { boundary: 'drop' }), '- one\n- two\n');
    // `preserve` is the default, so a caller that does not opt in gets the pre-existing shape.
    assert.equal(
      core.stripNotesFromSource(setext),
      core.stripNotesFromSource(setext, { boundary: 'preserve' })
    );
    // Neither mode touches the other branches: a blank on both sides still takes one blank with
    // the line, and an inline note still loses only its span.
    for (const boundary of ['preserve', 'drop']) {
      assert.equal(core.stripNotesFromSource('a\n\n<!-- n -->\n\nb\n', { boundary }), 'a\n\nb\n');
      assert.equal(core.stripNotesFromSource('a <!-- n --> b', { boundary }), 'a  b');
    }
  });

  test('the word registers mirror frontMatterScalar, comment and quoted-span included (#1986 checker)', () => {
    // `frontMatterScalar` strips a WHITESPACE-preceded `#` comment, and for a quoted value
    // returns the quoted span and discards what trails it. An anchored `["']?word["']?$` matched
    // neither, so both of these were read by the producer AND shipped as the slide's speaker
    // note — the #1350 shape in a form an author plausibly writes.
    for (const v of ['brand # our brand mark', 'BRAND # x', "'brand'", 'bottom-center accent # corner']) {
      assert.equal(core.isLatticePragma(`logo-finish: ${v}`), true, `logo-finish: ${v}`);
    }
    // And what the producer does NOT read stays a note. `#` needs whitespace before it to open
    // a comment, so `brand#nospace` is the whole value; unquoted trailing words likewise.
    for (const v of ['brand extra words', 'brand#nospace', 'neon']) {
      assert.equal(core.isLatticePragma(`logo-finish: ${v}`), false, `logo-finish: ${v} must stay a note`);
    }
  });

  test('anyCase refuses a word whose uppercase is not one-to-one (#1986 checker)', () => {
    // `'ß'.toUpperCase()` is `'SS'`, which would emit the class `[ßSS]` — ß or S, not the pair
    // intended. Unreachable with today's four words; this is here so the next one is not silent.
    assert.throws(() => core.anyCase('straße'), RangeError);
    assert.equal(core.anyCase('ab'), '[aA][bB]');
  });

  test('stripNotesFromSource keeps the BLOCK BOUNDARY a note comment was providing (#1985 checker)', () => {
    // A comment line is an HTML block, so it separates what is above it from what is below.
    // Deleting it outright moves the deck, and both of these were measured on the real CLI:
    // the first exported 3 slides where the author wrote 2 (`Some text\n---` is a setext H2,
    // not a slide break) and mis-bound the author's front-matter caption for slide 2 onto the
    // phantom; the second collapsed two paragraphs into one with a `<br>`. A privacy flag
    // must not restructure a deck.
    assert.equal(
      core.stripNotesFromSource('Some text\n<!-- Remember the numbers. -->\n---\n'),
      'Some text\n\n---\n',
      'the `---` stays a thematic break rather than becoming a setext underline'
    );
    assert.equal(
      core.stripNotesFromSource('First paragraph.\n<!-- Pause. -->\nSecond paragraph.\n'),
      'First paragraph.\n\nSecond paragraph.\n',
      'two paragraphs stay two paragraphs'
    );
    // Only where it is load-bearing. With a blank line already on one side there is nothing
    // to preserve, so the line simply goes and no run is left.
    assert.equal(core.stripNotesFromSource('a\n<!-- n -->\n\nb\n'), 'a\n\nb\n');
    assert.equal(core.stripNotesFromSource('a\n\n<!-- n -->\nb\n'), 'a\n\nb\n');
  });

  test('stripNotesFromSource leaves an INLINE note\'s surrounding whitespace alone (#1985)', () => {
    // The opposite error, and the reason the line rule is conditional. A note written mid
    // sentence has an author-typed space on each side; deleting one would JOIN two words.
    // `a <!-- n --> b` scrubs to `a  b` — which is also exactly what the counterfactual
    // source (the author never typing the comment) contains, so the span-only cut is
    // already the right answer here.
    assert.equal(core.stripNotesFromSource('a <!-- n --> b'), 'a  b');
    assert.equal(core.stripNotesFromSource('a<!-- n -->b'), 'ab');
    // A comment that ENDS a line of prose is not a whole-line comment either: the prose
    // before it is not whitespace, so the line stays and only the span goes.
    assert.equal(core.stripNotesFromSource('a <!-- n -->\nb\n'), 'a \nb\n');
    // TWO inline notes after real text. "Own line" is judged against what has been EMITTED,
    // not against source offsets — otherwise the second note sees nothing since the cursor,
    // concludes whole-line, and eats the terminator, joining `hello` to the line below. With
    // `---` on that next line it destroyed a slide on the real CLI (#1985 checker).
    assert.equal(
      core.stripNotesFromSource('hello <!-- a --> <!-- b -->\nworld\n'),
      'hello  \nworld\n',
      'the line terminator survives two inline notes'
    );
  });

});

describe('notes-core: a directive is never a note', () => {
  test('parity — the mirrored directive names match lib/engine/directives.js', () => {
    // This module stays dependency-free, and this test fails the moment the engine's registry
    // gains or loses a name. Deliberately NOT described as "the same discipline as the Marpit
    // pragma mirror": that set has no test and cannot have one (the dependency is gone), so the
    // comparison advertised this test's guarantee for a set that has none (#1987).
    const engine = require('../../../lib/engine/directives.js');
    assert.deepEqual(
      [...core.KNOWN_DIRECTIVE_NAMES].sort(),
      [...engine.KNOWN_DIRECTIVES].sort(),
      'KNOWN_DIRECTIVE_NAMES mirrors the engine KNOWN_DIRECTIVES',
    );
    assert.deepEqual(
      [...core.FLAG_DIRECTIVE_NAMES].sort(),
      [...engine.FLAG_DIRECTIVES].sort(),
      'FLAG_DIRECTIVE_NAMES mirrors the engine FLAG_DIRECTIVES',
    );
    // The value-shape table keys on directive NAMES too, so a rename in the engine must not
    // leave a dead entry here — a dead entry silently stops reporting that directive.
    for (const name of Object.keys(core.DIRECTIVE_VALUE_SHAPES)) {
      assert.ok(engine.KNOWN_DIRECTIVES.has(name), `DIRECTIVE_VALUE_SHAPES key "${name}" is a real directive`);
    }
  });

  test('a directive surviving into rendered HTML is not lifted as a note, and the scrub cannot eat it', () => {
    const html = '<section data-lattice-slide><!-- _class: title --><h1>Q3</h1><!-- @note{A real note.} --></section>';
    assert.equal(core.notesFromHtml(html), 'A real note.', 'only the note is lifted');
    assert.equal(core.isPrivateComment(' _class: title '), false, 'and the scrub classifies the directive out itself');

    const source = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- @note{A real note.} -->\n';
    const out = core.stripNotesFromSource(source);
    assert.match(out, /_class: title/, 'the directive survives --strip-notes');
    assert.doesNotMatch(out, /A real note\./, 'and the note is still scrubbed');
  });

  test('multi-line and bare-flag SPOT directive forms are recognized', () => {
    assert.ok(core.isDirectiveComment('_class: title'));
    assert.ok(core.isDirectiveComment('_class: title\n_paginate: true'), 'every line a directive');
    assert.ok(core.isDirectiveComment('_build'), 'a bare FLAG directive');
    assert.ok(core.isDirectiveComment('_backgroundColor: #fff'));
  });

  test('the DECK-SCOPE form is not a spot directive; the scrub keeps it, and the audit reports a prose value', () => {
    // The bare form is real directive syntax, but it is indistinguishable from prose that happens to open with the
    // word: `<!-- color: we should discuss the palette -->`. `isDirectiveComment` takes only the unambiguous `_`-prefixed
    // spot form. The scrub keeps the deck-scope form all the same, because the engine consumes it as a directive and
    // deleting `<!-- paginate: true -->` would change the recipient's deck; a value that reads as prose is the audit's
    // to report (`directiveShapedProse`), and lint's.
    assert.ok(!core.isDirectiveComment('color: we should discuss the palette'));
    assert.ok(!core.isDirectiveComment('class: title'));
    assert.ok(!core.isDirectiveComment('footer: ask about the discount'));
    assert.equal(core.isPrivateComment('paginate: true'), false);
    assert.equal(core.isPrivateComment('color: SECRET discuss the palette'), false);
    assert.equal(core.auditStrippedSource('<!-- color: SECRET discuss the palette -->').length, 1);
  });

  test('prose is still a note — the classifier does not open a leak', () => {
    // The dangerous direction: over-classifying would keep a real note OUT of the scrub
    // set, and it would ship in a --strip-notes export. A note is not a directive merely
    // for containing a colon, or for naming a directive word without one.
    assert.ok(!core.isDirectiveComment('Note: mention the caveat'), 'word+colon prose');
    assert.ok(!core.isDirectiveComment('color'), 'a bare NON-flag directive word is prose');
    assert.ok(!core.isDirectiveComment('Remember: the class is important'));
    assert.ok(!core.isDirectiveComment('_class: title\nAnd then say this.'), 'mixed → treated as a note');
    assert.ok(!core.isDirectiveComment(''), 'empty is not a directive');

    assert.equal(core.isPrivateComment('Note: mention the caveat'), true, 'still scrubbable');
    assert.equal(core.isPrivateComment('_class: title\nAnd then say this.'), true, 'mixed is scrubbable too');
  });
});

// The FAIL-CLOSED backstop. Every --strip-notes leak this codebase has had was a new way for
// the two sides of the scrub to disagree — bodies lifted from RENDERED html vs. comments
// present in SOURCE. Matching is open-ended, so this checks the OUTPUT instead: it is
// independent of the matcher and therefore catches a failure OF the matcher.
describe('notes-core: auditStrippedSource', () => {
  test('a surviving speaker comment is reported', () => {
    const src = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- The CFO thinks the deal is dead -->\n';
    assert.deepEqual(core.auditStrippedSource(src), ['The CFO thinks the deal is dead']);
  });

  test('what ships by design is not reported: directives, pragmas, records and the three public notes', () => {
    const src = [
      '<!-- _class: title -->',            // spot directive
      '<!-- markdownlint-disable MD033 -->', // tooling pragma
      '<!-- {layout=cards, footer=Q3} -->',  // record
      '<!-- @alt{A cover slide.} -->',      // alt text
      '<!-- @say{Read this aloud.} -->',     // the voice
      '<!-- @handout{For later.} -->',       // the handout
      '<!--   -->',                          // empty
    ].join('\n');
    assert.deepEqual(core.auditStrippedSource(src), []);
    // A retired key is a plain comment now, so one that survived the scrub IS a leak.
    assert.deepEqual(core.auditStrippedSource('<!-- describe: A cover slide. -->\n<!-- @note{Pause.} -->'), ['describe: A cover slide.', '@note{Pause.}']);
  });

  // The pragma exclusion has TWO call sites and this is the second one. Excluding a pragma
  // from the note set also takes it OUT of the --strip-notes scrub set, so it legitimately
  // survives into the stripped source — and without the matching exclusion here, the audit
  // would report every one of them as a note that leaked. That is a false privacy alarm,
  // which this function's own contract calls the worst kind. Pinned because removing the
  // call at that site left the whole suite green.
  test('a Lattice pragma that survives the scrub is not reported as a leak', () => {
    const src = [
      '<!-- tier: short -->',
      '<!-- galleryAuthored: curated tour; the build reads this verbatim -->',
      '<!-- color-mode: dark -->',
    ].join('\n');
    assert.deepEqual(core.auditStrippedSource(src), []);
  });

  test('a note that merely LOOKS like a pragma is still reported', () => {
    // The other direction: the value is outside the register's domain, so this is prose the
    // author wrote and the strip failed to remove. It must not hide behind the exclusion.
    assert.deepEqual(core.auditStrippedSource('<!-- color-mode: TBD -->'), ['color-mode: TBD']);
    assert.deepEqual(
      core.auditStrippedSource('<!-- tier: we should discuss the pricing tier -->'),
      ['tier: we should discuss the pricing tier']
    );
  });

  test('a deck-scope directive with a REAL value is not reported — the engine owns it', () => {
    // A comment in directive syntax that survived the scrub is normally one the engine
    // consumed as a directive, and flagging those wholesale fired on two decks this repo
    // ships — a false privacy alarm, which is the worst kind, because the rational response
    // is to stop trusting the strip. Anything whose value fits the directive stays silent.
    assert.deepEqual(core.auditStrippedSource('<!-- color: crimson -->'), []);
    assert.deepEqual(core.auditStrippedSource('<!-- color: color-mix(in srgb, red 40%, blue) -->'), []);
    assert.deepEqual(core.auditStrippedSource('<!-- paginate: true -->\n<!-- theme: cuoio -->'), []);
    // Free-text directives can never be told from prose, so they are never reported.
    assert.deepEqual(core.auditStrippedSource('<!-- header: the quarter everyone is waiting for -->'), []);
  });

  test('a directive whose VALUE reads as prose IS reported — the engine consumed a note (#1636)', () => {
    // `color: …` is real directive syntax and also exactly how a note might open. The engine's
    // directive test accepts ANY value, so this is consumed as a directive: it never reaches
    // rendered HTML, never enters the note set, and the scrub has nothing to match — the text
    // ships. Reporting is the whole fix available here: removing it from the source would
    // corrupt every deck using the ordinary `<!-- paginate: true -->` idiom, and would not
    // close the leak anyway, since the engine also bakes the value onto the section as
    // `data-color` / `--color`. Only the author can fix it, by rewriting the note.
    const found = core.auditStrippedSource('<!-- color: we should discuss the palette -->');
    assert.equal(found.length, 1);
    assert.match(found[0], /we should discuss the palette/);
    assert.match(found[0], /"color" directive/, 'and it names what the engine did with it');
    // The scrub half of that contract: it is directive syntax, so the scrub keeps it, and this report is the backstop.
    assert.equal(core.isPrivateComment(' color: we should discuss the palette '), false);
  });

  test('directiveShapedProse fires only on a TIGHT value domain that the value misses', () => {
    assert.equal(core.directiveShapedProse('color: we should discuss the palette'), 'color');
    assert.equal(core.directiveShapedProse('paginate: only after the break'), 'paginate');
    assert.equal(core.directiveShapedProse('color: crimson'), null);
    assert.equal(core.directiveShapedProse('color: #FF0044'), null);
    assert.equal(core.directiveShapedProse('paginate: skip'), null);
    assert.equal(core.directiveShapedProse('size: 4K'), null);
    assert.equal(core.directiveShapedProse('_color: we should discuss the palette'), 'color', 'spot form too');
    assert.equal(core.directiveShapedProse('color: "a quoted literal"'), null, 'a quoted value is an author, not prose');
    // The engine cuts an unquoted value at the first whitespace-preceded `#`, so these are
    // values it applies perfectly — reporting them would be the false alarm to end all.
    assert.equal(core.directiveShapedProse('theme: cuoio  # brand'), null);
    assert.equal(core.directiveShapedProse('paginate: true # only after the break'), null);
    assert.equal(core.directiveShapedProse('color: #A1B2C3 # brand blue'), null);
    assert.equal(core.directiveShapedProse('footer: three whole words'), null, 'free-text directive');
    assert.equal(core.directiveShapedProse('Remember: mention the pricing caveat'), null, 'not a directive at all');
  });

  test('code regions are masked — a documented `<!-- class: … -->` is not a survivor', () => {
    // A false PRIVACY alarm is the worst kind: the rational response is to stop trusting the
    // strip. Two decks this repo ships (`deck-class-register`, `slide-class-forms`) document
    // directive syntax in fences and inline spans and raised 4 and 2 alarms every export.
    assert.deepEqual(core.auditStrippedSource('text\n\n```\n<!-- class: kpi -->\n```\n'), []);
    assert.deepEqual(core.auditStrippedSource('run it with `<!-- class: kpi -->` on the slide'), []);
    // …but the same body OUTSIDE a code region, as real prose, is still reported.
    assert.deepEqual(core.auditStrippedSource('<!-- Board only, do not share -->'), ['Board only, do not share']);
  });

  test('directive syntax in EITHER form is not suspicious residue', () => {
    // Wider than the scrub's own test, deliberately: the scrub asks "is this scrubbable?" and
    // must say yes to the bare form so a note shaped like a directive is removed; the audit
    // asks "is this unexpected?", and a comment in directive syntax that survived is one the
    // engine consumed as a directive.
    assert.deepEqual(core.auditStrippedSource('<!-- _class: title -->\n<!-- class: diagram -->'), []);
  });

  test('an UNTERMINATED comment is reported, not silently shipped', () => {
    // It never matches the comment pattern, so neither the scrub nor the survivor loop can
    // see it — and its text ships verbatim in the envelope. "Reported, never silent" has to
    // cover the shape most likely to be an accident.
    const found = core.auditStrippedSource('# Q3\n\n<!-- Speaker note GOLF: never closed\n');
    assert.equal(found.length, 1);
    assert.match(found[0], /never closed/);
    assert.match(found[0], /GOLF/, 'and it quotes enough for the author to find it');
  });

  test('a fully scrubbed source audits clean — no false alarm on the happy path', () => {
    const src = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- @note{A real note.} -->\n<!-- a plain one -->\n<!-- @say{Spoken.} -->\n';
    assert.equal(core.auditStrippedSource(src).length, 2, 'guard: the unscrubbed source does report its two private comments');
    assert.deepEqual(core.auditStrippedSource(core.stripNotesFromSource(src)), []);
  });
});

// COMMENT_SOURCE terminates on `--!>` as well as `-->`, because the HTML parser does: `--!>`
// closes a comment (as a parse error, but it closes). Reverting the pattern to `--+>` left
// the whole unit suite green, so this pins it directly.
describe('notes-core: the comment matcher reads `--!>` as a terminator', () => {
  test('a `--!>` typo does not merge two comments into one body', () => {
    // With `-->`-only, the lazy match ran from the first `<!--` past the typo to the NEXT
    // `-->`, swallowing the following comment — and that merged body then entered the
    // --strip-notes scrub set, so the whole span was deleted from the envelope source,
    // taking the directive with it.
    const html = '<section data-lattice-slide><!-- @note{First note.} --!><!-- @note{Second note.} --></section>';
    assert.equal(core.notesFromHtml(html), 'First note.\n\nSecond note.');
  });

  test('a `--!>`-terminated note still scrubs, and the directive beside it survives', () => {
    const source = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- @note{Board only.} --!>\n';
    assert.equal(core.notesFromHtml('<section><!-- @note{Board only.} --!></section>'), 'Board only.', 'the note is read despite the typo');
    const out = core.stripNotesFromSource(source);
    assert.doesNotMatch(out, /Board only/, 'the note is scrubbed');
    assert.match(out, /_class: title/, 'the directive is untouched');
  });
});

// ── The candidate cut order is ONE list, and both export paths read it ────────
//
// The checker's finding on the Studio port: `stripNotesCut` was a hand-written copy of
// `strippedSlidesOrAuthored`, with no shared code and nothing pinning them together — the exact
// mechanism that produced the divergence the port was fixing. `SCRUB_BOUNDARIES` makes the
// one piece they must agree on shared, and this pins that neither of them quietly writes its own
// again. It is a SOURCE assertion because the two callers live in different runtimes (a CJS CLI
// and a browser TS module) and cannot be imported into one process to be compared behaviorally.
describe('notes-core: SCRUB_BOUNDARIES', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.join(__dirname, '..', '..', '..');
  const CALLERS = [
    'lattice.js',
    'docs/src/components/studio/strip-notes-guard.ts',
  ];

  test('is the two cuts, conservative one first', () => {
    assert.deepEqual([...core.SCRUB_BOUNDARIES], ['preserve', 'drop']);
    assert.ok(Object.isFrozen(core.SCRUB_BOUNDARIES));
  });

  test('every value it carries is one BOTH strips actually implement', () => {
    // A cut nobody implements would silently render the same document twice: `boundary` falls
    // through to the default, both passes agree, and the second is pure cost. Asked of the
    // CAPTION strip too, because the CLI now measures one cut for the combined source — a
    // caption strip that ignored `boundary` would make half of that measurement a no-op.
    const noteSrc = 'Some text\n<!-- a note -->\n---\n\nMore text\n';
    const saySrc = 'Some text\n<!-- say: read this -->\n---\n\nMore text\n';
    const noteCuts = new Set(
      core.SCRUB_BOUNDARIES.map((boundary) => core.stripNotesFromSource(noteSrc, { boundary })),
    );
    const sayCuts = new Set(
      core.SCRUB_BOUNDARIES.map((boundary) => core.stripSayFromSource(saySrc, { boundary })),
    );
    assert.equal(noteCuts.size, core.SCRUB_BOUNDARIES.length, 'two cuts produced the same source (notes)');
    assert.equal(sayCuts.size, core.SCRUB_BOUNDARIES.length, 'two cuts produced the same source (say)');
  });

  for (const rel of CALLERS) {
    test(`${rel} reads the shared list rather than writing its own`, () => {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.match(text, /SCRUB_BOUNDARIES/, `${rel} no longer reads the shared cut order`);
      // The literal the constant replaced, in either quote style, in any order. A caller that
      // writes it out again is a caller that can be reordered on its own.
      const literal = /\[\s*(['"])(?:preserve|drop)\1\s*,\s*(['"])(?:preserve|drop)\2\s*\]/;
      assert.doesNotMatch(text, literal, `${rel} writes its own boundary list — use the kernel's`);
    });

    // THE SAME PIN, FOR THE SAME REASON, ON THE OTHER SHARED PIECE. The whitespace-blind slide
    // comparison had been hand-written in all three cut measurements — both CLI ones and the
    // Studio's — and `sameSlideShape` collapsed them onto one kernel function. Without this arm
    // the claim "so they cannot drift" had nothing behind it: the hand-written form is
    // behaviorally identical today, so no behavioral test can tell it from the shared one, and
    // `stripCommentNodes` is still exported for its other callers. Re-inlining it would be
    // silent — which is precisely the mechanism #2003 recorded.
    test(`${rel} reads the shared slide-shape comparison rather than writing its own`, () => {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.match(text, /sameSlideShape/, `${rel} no longer reads the shared shape comparison`);
      assert.doesNotMatch(
        text, /stripCommentNodes\s*\([^)]*\)\s*\.replace\s*\(\s*\/\\s\+\/g/,
        `${rel} writes its own whitespace-blind shape — use the kernel's \`sameSlideShape\``
      );
    });
  }
});

test('isLatticePragma: lat-meta comments are tooling, a hyphenated word that begins with them is a note', () => {
  assert.equal(core.isLatticePragma('lat-meta: {"class":"x"}'), true);
  assert.equal(core.isLatticePragma('lat-pane: {}'), true);
  assert.equal(core.isLatticePragma('lat-meta-analysis says churn is up'), false);
  assert.equal(core.isLatticePragma('stress-slide'), true);
  assert.equal(core.isLatticePragma('stress-slide is the next topic'), false);
});

// ── What `--strip-notes` takes: the private comments (engineering/decisions/2026-11-20-four-notes.md N5) ─────────
describe('notes-core: isPrivateComment', () => {
  test('a speaker note and a plain comment are private; so is a near miss, which is no note at all', () => {
    for (const body of [' @note{Pause.} ', ' my own todo ', '\nmulti-line\nplain\n', ' @Say{x} ', ' @note{unclosed ', ' say: a retired key ', '']) {
      assert.equal(core.isPrivateComment(body), true, JSON.stringify(body));
    }
  });

  test('what the engine reads or what is meant to ship is never private', () => {
    const kept = {
      'a spot directive': ' _class: lead ',
      'a deck-scope directive': ' paginate: true ',
      'a pane marker': ' _pane: bar ',
      'a pane layout marker': ' panes: 60/40 ',
      'a record': ' {layout=cards} ',
      'a long-form record': ' @meta{layout=cards} ',
      'an internal record': ' lat-meta: {} ',
      'a tooling pragma': ' markdownlint-disable ',
      'a Lattice pragma': ' tier: short ',
      'a marker': ' stress-slide ',
      'the voice': ' @say{Spoken.} ',
      'alt text': ' @alt{A chart.} ',
      'the handout': ' @handout{Later.} ',
    };
    for (const [what, body] of Object.entries(kept)) assert.equal(core.isPrivateComment(body), false, what);
  });
});

// ── Export to Marp: the four notes as Marp reads them ──────────────────────────────────────────────────────────
describe('notes-core: notesToMarp', () => {
  test('@note is a plain Marp note, @handout a labeled one; @say, @alt and plain comments are dropped', () => {
    const src = [
      '# A', '', '<!-- _class: lead -->', '<!-- {layout=cards} -->', '<!-- @note{Pause here.} -->', '<!-- @say{Spoken.} -->',
      '<!-- @alt{Alt.} -->', '<!-- @handout{For later.} -->', '<!-- my own todo -->', '<!-- markdownlint-disable -->', '', 'Body.', '',
    ].join('\n');
    assert.equal(
      core.notesToMarp(src),
      ['# A', '', '<!-- _class: lead -->', '<!-- {layout=cards} -->', '<!-- Pause here. -->', '', '<!-- Handout: For later. -->', '', '<!-- markdownlint-disable -->', '', 'Body.', ''].join('\n'),
    );
  });

  test('a note whose words Marp would read as a directive or a record says `Note:`', () => {
    assert.equal(core.notesToMarp('<!-- @note{_class: not a directive} -->\n'), '<!-- Note: _class: not a directive -->\n');
    assert.equal(core.notesToMarp('<!-- @note{footer: ask about it} -->\n'), '<!-- Note: footer: ask about it -->\n');
    assert.equal(core.notesToMarp('<!-- @note{{layout=x} is the record} -->\n'), '<!-- Note: {layout=x} is the record -->\n');
    assert.equal(core.notesToMarp('<!-- @note{Remember the chart} -->\n'), '<!-- Remember the chart -->\n');
  });

  test('a note’s escaped arrow becomes Marp’s `-- >`, which ends nothing; an escaped brace is a brace', () => {
    const out = core.notesToMarp('<!-- @note{a --\\> b \\{c\\}} -->\n');
    assert.equal(out, '<!-- a -- > b {c} -->\n');
    assert.equal(/--!?>/.test(out.slice(4, -4)), false);
  });

  test('code is left as written, and a deck with no comments is the same string', () => {
    const src = '# A\n\n```md\n<!-- @say{sample} -->\n<!-- plain sample -->\n```\n';
    assert.equal(core.notesToMarp(src), src);
    assert.equal(core.notesToMarp(null), '');
  });
});

// The red team on PR 3351 (head 0493189): each shape below was a speaker note before the four notes, or was rewritten
// by a scrub that must not touch it.
describe('notes-core: the red team on the four notes', () => {
  test('prose shaped like a pane marker is private; a real pane marker is structure', () => {
    for (const b of [' pane: Pane two needs a better chart ', ' panes: remember the numbers ']) assert.equal(core.isPrivateComment(b), true, b);
    for (const b of [' _pane: bar ', ' pane: list ', ' pane: list no-title ', ' panes: 60/40 stack ', ' _pane: anything at all ']) assert.equal(core.isPrivateComment(b), false, b);
    const out = core.stripNotesFromSource('# A\n\n<!-- pane: Pane two SECRETV -->\n\nText\n');
    assert.doesNotMatch(out, /SECRETV/);
    assert.deepEqual(core.auditStrippedSource('<!-- panes: 50/50 -->\n\n<!-- _pane: right -->\n'), [], 'a real pane marker is not a suspected leak');
  });
  test('a comment that opens in the front matter is part of a YAML value: never scrubbed, never reported', () => {
    const src = '---\ntitle: "Q3 <!-- draft --> review"\n---\n\n# A\n\n<!-- mine -->\n';
    assert.equal(core.stripNotesFromSource(src), '---\ntitle: "Q3 <!-- draft --> review"\n---\n\n# A\n');
    assert.deepEqual(core.auditStrippedSource('---\ntitle: "Q3 <!-- draft --> review"\n---\n\n# A\n'), []);
  });
  test('the Marp bridge labels a note that opens with a quoted key, which Marp would read as a directive', () => {
    assert.match(core.notesToMarp('# A\n\n<!-- @note{"_class": evil} -->\n'), /<!-- Note: "_class": evil -->/);
  });
});
