/**
 * Unit: lib/authoring/notes-core.js — the pure presenter-notes extractor.
 *
 * notes-core is the SINGLE SOURCE for "a non-directive comment on a slide is
 * that slide's note" (LFM, Marp-faithful). The emulator extracts notes with it
 * from engine-rendered slide HTML. The block below pins notes-core's keep/drop
 * decision against hardcoded expected outputs for marp-core's documented
 * comment-collection behavior (no live marp-core comparison — marp-core isn't
 * a dependency), so the two render paths can never disagree on what counts as
 * a note.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/notes-core');
const { splitSections: splitSectionsCore } = require('../../../lib/core/split-sections.js');

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

describe('notes-core: notesFromHtml', () => {
  test('single note', () => {
    assert.equal(core.notesFromHtml(sec('<h1>A</h1><!-- speaker note -->')), 'speaker note');
  });
  test('multiple comments join with a blank line', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- first --><p>x</p><!-- second -->')),
      'first\n\nsecond'
    );
  });
  test('multi-line comment body is preserved', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- line one\n   line two -->')),
      'line one\n   line two'
    );
  });
  test('pragma-only slide → null', () => {
    assert.equal(core.notesFromHtml(sec('<!-- markdownlint-disable MD033 -->')), null);
  });
  test('note alongside a pragma → only the note', () => {
    assert.equal(
      core.notesFromHtml(sec('<!-- markdownlint-disable --><!-- the real note -->')),
      'the real note'
    );
  });
  test('no comments → null', () => {
    assert.equal(core.notesFromHtml(sec('<h1>A</h1>')), null);
  });
  test('empty comment → null', () => {
    assert.equal(core.notesFromHtml(sec('<!--  -->')), null);
  });
});

describe('notes-core: extractSlideNotes is index-aligned', () => {
  test('one entry per slide, null where empty', () => {
    const slides = [
      sec('<!-- note A -->'),
      sec('<h1>B</h1>'),
      sec('<!-- markdownlint-disable --><!-- note C -->'),
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
    // The old `<!--+\s*([\s\S]*?)\s*--+>` pattern was quadratic here (a 5k run
    // hung >30s). The linear pattern finishes in milliseconds. node:test has no
    // per-test timeout, so we assert wall-time directly — with a generous bound
    // that still separates linear (ms) from the quadratic blow-up (tens of
    // seconds) by orders of magnitude, but won't flake under concurrent CI/hook
    // CPU load the way a sub-second bound did.
    const html = `<section><!-- ${' '.repeat(200000)}no close`;
    const t = Date.now();
    const note = core.notesFromHtml(html);
    const elapsed = Date.now() - t;
    assert.equal(note, null, 'an unterminated comment is not a note');
    assert.ok(elapsed < 5000, `extraction took ${elapsed}ms — expected linear (the quadratic bug hung >30s)`);
  });
});

describe('notes-core: known comment-collection deltas vs marp-core', () => {
  // These are documented in spec/LFM-1.0.md §3.5 as explicitly NOT guaranteed
  // identical across parsers — they depend on comment *segmentation*, not the
  // note boundary. These tests lock notes-core's current behavior so a future
  // change to it is a conscious decision, not a silent drift.
  test('adjacent comments with no blank line are both collected', () => {
    // marp-core collects only the first here; the HTML scan sees both.
    assert.equal(core.notesFromHtml('<section><!-- a --><!-- b --></section>'), 'a\n\nb');
  });
  test('a comment inside a rendered block is still lifted', () => {
    // marp-core folds this into an HTML-block token and does not collect it.
    assert.equal(core.notesFromHtml('<section><div><!-- x --></div></section>'), 'x');
  });
});

describe('notes-core: accessible-description channel (describe:)', () => {
  test('isDescriptionComment recognizes the describe: prefix, not a note', () => {
    assert.equal(core.isDescriptionComment('describe: A bar chart rising left to right.'), true);
    assert.equal(core.isDescriptionComment('Describe:  case-insensitive'), true);
    assert.equal(core.isDescriptionComment('note: say this'), false);
    assert.equal(core.isDescriptionComment('describe the room'), false); // no colon → prose note
  });

  test('a describe: comment is NOT collected as a speaker note', () => {
    assert.equal(core.notesFromHtml(sec('<!-- describe: Revenue up 40% over three quarters. -->')), null);
  });

  test('descriptionFromHtml returns the description, prefix stripped', () => {
    assert.equal(
      core.descriptionFromHtml(sec('<!-- describe: Revenue up 40% over three quarters. -->')),
      'Revenue up 40% over three quarters.',
    );
    assert.equal(core.descriptionFromHtml(sec('<!-- a plain note -->')), null);
  });

  test('note and description coexist on one slide without cross-contamination', () => {
    const html = sec('<!-- Pause here. --><!-- describe: A pie chart, three equal slices. -->');
    assert.equal(core.notesFromHtml(html), 'Pause here.'); // note only
    assert.equal(core.descriptionFromHtml(html), 'A pie chart, three equal slices.'); // description only
  });

  test('extractSlideDescriptions is index-aligned; multiple describe join with a space', () => {
    const slides = [
      sec('<!-- describe: First. --><!-- describe: Second. -->'),
      sec('<!-- just a note -->'),
      sec('<!-- describe: Third. -->'),
    ];
    assert.deepEqual(core.extractSlideDescriptions(slides), ['First. Second.', null, 'Third.']);
  });
});

describe('notes-core: caption channel (caption:)', () => {
  test('isCaptionComment recognizes the caption: prefix, not a note', () => {
    assert.equal(core.isCaptionComment('caption: FY26 revenue grew forty percent.'), true);
    assert.equal(core.isCaptionComment('Caption:  case-insensitive'), true);
    assert.equal(core.isCaptionComment('note: say this'), false);
    assert.equal(core.isCaptionComment('describe: whats there'), false);
    assert.equal(core.isCaptionComment('caption the figure'), false); // no colon → prose note
  });

  test('a caption: comment is NOT collected as a speaker note (never embedded in the PDF)', () => {
    assert.equal(core.notesFromHtml(sec('<!-- caption: The exact words this slide reads. -->')), null);
  });

  test('captionFromHtml returns the caption, prefix stripped; last-wins on override', () => {
    assert.equal(
      core.captionFromHtml(sec('<!-- caption: Net dollar retention held at one twenty. -->')),
      'Net dollar retention held at one twenty.',
    );
    assert.equal(core.captionFromHtml(sec('<!-- a plain note -->')), null);
    // a caption REPLACES narration, so a second one supersedes (not concatenates)
    assert.equal(core.captionFromHtml(sec('<!-- caption: first -->\n<!-- caption: second -->')), 'second');
  });

  test('note, description, and caption coexist on one slide without cross-contamination', () => {
    const html = sec('<!-- Pause here. --><!-- describe: A pie chart. --><!-- caption: Three equal slices. -->');
    assert.equal(core.notesFromHtml(html), 'Pause here.'); // note only (caption + describe excluded)
    assert.equal(core.descriptionFromHtml(html), 'A pie chart.'); // description only
    assert.equal(core.captionFromHtml(html), 'Three equal slices.'); // caption only
  });

  test('extractSlideCaptions is index-aligned; null where a slide has no caption', () => {
    const slides = [
      sec('<!-- caption: Opener. -->'),
      sec('<!-- just a note -->'),
      sec('<!-- describe: a chart --><!-- caption: Closer. -->'),
    ];
    assert.deepEqual(core.extractSlideCaptions(slides), ['Opener.', null, 'Closer.']);
  });

  test('stripCommentNodes removes a caption comment from the rendered HTML (no double-render)', () => {
    const html = sec('<!-- caption: read this -->\n<p>Body</p>');
    const out = core.stripCommentNodes(html);
    assert.doesNotMatch(out, /caption:/);
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
    // The note-body SET always arrives LF-normalized, because it is derived from rendered slide
    // HTML where markdown-it already normalized newlines. The SOURCE being stripped may still be
    // CRLF. That mismatch is the leak, so the fixture reproduces it exactly: an LF set against a
    // genuinely CRLF source, both raw.
    const crlf = ['# S', '', '<!-- Pause here.', 'Then CRLFLEAK ask the room. -->', '', 'Body.'].join('\r\n');
    const bodiesFromRenderedHtml = new Set(['Pause here.\nThen CRLFLEAK ask the room.']);
    const out = core.stripNotesFromSource(crlf, bodiesFromRenderedHtml);
    assert.doesNotMatch(out, /CRLFLEAK/, 'a multi-line note must not survive in a CRLF source');
    assert.match(out, /# S/, 'body content untouched');
  });

  // The privacy strip for the self-contained player's envelope (design doc §Notes on export).
  test('stripNotesFromSource removes ONLY the known note comments — directives + tooling survive', () => {
    const source = [
      '# Slide one',
      '',
      '<!-- _class: title -->',
      '<!-- Remember to pause here. -->',
      '<!-- prettier-ignore -->',
      '',
      'Body.',
    ].join('\n');
    const out = core.stripNotesFromSource(source, new Set(['Remember to pause here.']));
    assert.doesNotMatch(out, /Remember to pause/, 'the note comment is gone');
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
    // count-parity check waves it through. `lib/core/split-sections.js` is depth-aware.
    const NESTED =
      '<section id="1" class="title"><h1>One</h1><section class="inner"><p>n</p></section><p>tail</p><!-- SECRETNEST --></section>' +
      '<section id="2" class="content"><h2>Two</h2><!-- NOTETWO --></section>';
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

    test('reads note, description and caption per slide', () => {
      const rec = core.slideNoteRecord([
        '<section><h1>A</h1><!-- A note. --><!-- describe: A chart. --><!-- caption: Read aloud. --></section>',
        '<section><h1>B</h1></section>',
      ]);
      assert.deepEqual(rec[0], { note: 'A note.', noteBodies: ['A note.'], description: 'A chart.', caption: 'Read aloud.' });
      assert.deepEqual(rec[1], { note: null, noteBodies: [], description: null, caption: null });
    });

    // The privacy contract behind `noteBodies`. `note` JOINS a slide's notes with a blank
    // line, so splitting it back on '\n\n' is not the inverse: a SINGLE note containing a
    // blank line shatters into fragments, and `stripNotesFromSource` matches a comment's
    // WHOLE trimmed body — so nothing matches and the note ships in a --strip-notes export.
    // That shipped in the Studio while the CLI, which passes the bodies, was correct.
    test('noteBodies survives a note that contains a blank line — the strip set the join cannot rebuild', () => {
      const body = 'Board only.\n\nDo not share.';
      const rec = core.slideNoteRecord([`<section><h1>Q3</h1><!--\n${body}\n--></section>`]);
      assert.deepEqual(rec[0].noteBodies, [body], 'the pre-join body is carried whole');

      const source = `---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!--\n${body}\n-->\n`;
      const stripped = core.stripNotesFromSource(source, new Set(rec.flatMap((r) => r.noteBodies)));
      assert.ok(!stripped.includes('Do not share'), 'the note is scrubbed from the envelope source');
      assert.ok(stripped.includes('_class: title'), 'and the directive beside it survives');

      const rebuilt = new Set(rec.flatMap((r) => (r.note ? r.note.split('\n\n') : [])));
      assert.ok(
        core.stripNotesFromSource(source, rebuilt).includes('Do not share'),
        'guard: rebuilding the set by splitting the joined note really does leak (this is the bug)',
      );
    });

    test('noteBodies still separates two notes authored on one slide', () => {
      const rec = core.slideNoteRecord(['<section><!-- First note. --><!-- Second note. --></section>']);
      assert.deepEqual(rec[0].noteBodies, ['First note.', 'Second note.'], 'each comment is its own body');
      assert.equal(rec[0].note, 'First note.\n\nSecond note.', 'and the display join is unchanged');
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

  // The SEPARATE privacy strip for the caption channel (`--strip-captions`), orthogonal
  // to the note strip: captions are structurally identified (the `caption:` prefix), so
  // no rendered-body set is needed.
  test('stripCaptionsFromSource removes caption COMMENTS + the front-matter captions: block — notes, describe, directives, other keys survive', () => {
    const source = [
      '---',
      'theme: indaco',
      'captions:',
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
      '<!-- describe: A pie chart with three equal slices. -->',
      '<!-- caption: Three equal slices, one third each. -->',
      '<!-- Caption: a SECOND caption, case-insensitive. -->',
      '',
      'Body.',
    ].join('\n');
    const out = core.stripCaptionsFromSource(source);
    // inline caption comments gone
    assert.doesNotMatch(out, /Three equal slices, one third/, 'the caption comment is gone');
    assert.doesNotMatch(out, /a SECOND caption/, 'a second, differently-cased caption is gone');
    // front-matter captions: block gone (the leak the checker caught)
    assert.doesNotMatch(out, /Front matter secret caption/, 'the front-matter caption text is gone');
    assert.doesNotMatch(out, /keyed by slide/, 'every front-matter caption line is gone');
    assert.doesNotMatch(out, /^captions:/m, 'the captions: key itself is gone');
    // everything else survives
    assert.match(out, /theme: indaco/, 'a sibling front-matter key before captions survives');
    assert.match(out, /acronyms:/, 'a sibling front-matter key after captions survives');
    assert.match(out, /ARR: annual recurring revenue/, "the acronyms block's body survives");
    assert.match(out, /Remember to pause/, 'the speaker note is preserved');
    assert.match(out, /describe: A pie chart/, 'the describe: a11y comment is preserved');
    assert.match(out, /_class: title/, 'a directive comment is preserved');
    assert.match(out, /# Slide one/, 'body content untouched');
  });

  test('stripCaptionsFrontMatter removes ONLY the captions: block; a captions word in the BODY is safe', () => {
    const src = '---\ntheme: indaco\ncaptions:\n  2: read this\n---\n\n# S\n\nThe captions: feature is great.\n';
    const out = core.stripCaptionsFrontMatter(src);
    assert.doesNotMatch(out, /2: read this/, 'the front-matter caption line is gone');
    assert.doesNotMatch(out, /^captions:/m, 'the captions: key is gone from front matter');
    assert.match(out, /The captions: feature is great\./, 'a captions: mention in the BODY is untouched');
    assert.match(out, /theme: indaco/, 'sibling keys survive');
  });

  test('stripCaptionsFrontMatter is TOP-LEVEL only — a NESTED key named captions is preserved', () => {
    // The trio caught this: `^(\s*)captions` matched any indent and deleted an unrelated
    // nested key. A `captions:` under another mapping is a different key, not the channel.
    const src = '---\nspeaker:\n  captions: a stage direction\n  name: Bob\ncaptions:\n  1: the real caption map\n---\n\n# S\n';
    const out = core.stripCaptionsFrontMatter(src);
    assert.match(out, /captions: a stage direction/, 'the NESTED captions key is preserved');
    assert.match(out, /name: Bob/, 'its sibling under speaker is preserved');
    assert.doesNotMatch(out, /the real caption map/, 'the TOP-LEVEL captions map is removed');
    assert.doesNotMatch(out, /^captions:/m, 'the top-level captions: key is gone');
  });

  test('stripCaptionsFrontMatter preserves CRLF line endings — byte-identical, and a no-op on a CRLF deck with no captions', () => {
    // The trio caught this: split(/\r?\n/)+join('\n') rewrote every CRLF body line to LF.
    const withCaps = '---\r\ntheme: indaco\r\ncaptions:\r\n  1: x\r\ntitle: y\r\n---\r\n\r\n# S\r\n';
    const out = core.stripCaptionsFrontMatter(withCaps);
    assert.doesNotMatch(out, /1: x/, 'the caption line is gone');
    assert.match(out, /theme: indaco\r\n/, 'a CRLF sibling BEFORE captions keeps its CRLF');
    assert.match(out, /title: y\r\n/, 'a CRLF sibling AFTER captions keeps its CRLF');
    assert.doesNotMatch(out, /theme: indaco\n(?!\r)/, 'no CRLF→LF rewrite (no mixed endings)');
    // and with NO captions key, a CRLF deck is returned byte-identical
    const noCaps = '---\r\ntheme: indaco\r\ntitle: y\r\n---\r\n\r\n# S\r\n';
    assert.equal(core.stripCaptionsFrontMatter(noCaps), noCaps, 'no-captions CRLF deck round-trips unchanged');
  });

  test('reverse orthogonality: stripNotesFromSource PRESERVES a caption comment', () => {
    // The note strip must never touch the caption channel (the trio flagged this direction
    // was unpinned). A caption body is never in the note-strip set (noteBodiesFromHtml excludes it).
    const src = '# S\n\n<!-- Pause here. -->\n<!-- caption: The exact read-as line. -->\n\nBody.';
    const out = core.stripNotesFromSource(src, new Set(['Pause here.']));
    assert.doesNotMatch(out, /Pause here/, 'the note is stripped');
    assert.match(out, /caption: The exact read-as line\./, 'the caption comment survives the NOTE strip');
  });

  test('stripCaptionsFromSource is a no-op on a deck with no captions; safe on null', () => {
    assert.equal(core.stripCaptionsFromSource('# S\n\n<!-- a note -->\n\nBody.'), '# S\n\n<!-- a note -->\n\nBody.');
    assert.equal(core.stripCaptionsFromSource(null), '');
    assert.equal(core.stripCaptionsFrontMatter(null), '');
    // a deck with no front matter at all is returned verbatim
    assert.equal(core.stripCaptionsFrontMatter('# No front matter\n\ncaptions: in prose\n'), '# No front matter\n\ncaptions: in prose\n');
  });

  test('noteBodiesFromHtml returns INDIVIDUAL bodies — a note with an internal blank line stays whole', () => {
    // The leak that was: joining then splitting on \n\n shattered a single blank-line
    // note. noteBodiesFromHtml keeps each comment's full body, so the strip set matches
    // the source comment and removes it.
    const html = sec('<!-- Line one.\n\nLine two. --><!-- A second note. -->');
    assert.deepEqual(core.noteBodiesFromHtml(html), ['Line one.\n\nLine two.', 'A second note.']);
    // and the strip set built from it removes the blank-line note from source
    const src = '# S\n\n<!-- Line one.\n\nLine two. -->\n\nBody.';
    const out = core.stripNotesFromSource(src, new Set(core.noteBodiesFromHtml(html)));
    assert.doesNotMatch(out, /Line one|Line two/, 'the blank-line note is fully stripped (no leak)');
  });

  test('stripNotesFromSource strips a MULTI-LINE note in a CRLF source (Windows-authored deck)', () => {
    // The leak the checker caught: the strip set is \n-normalized (from the render),
    // but a raw CRLF comment body never matched it → the note shipped. Normalize both.
    const set = new Set(['Pause here.\nThen ask the room.']); // \n form, as from the render
    const crlf = '# S\r\n\r\n<!-- Pause here.\r\nThen ask the room. -->\r\n\r\nBody.\r\n';
    const out = core.stripNotesFromSource(crlf, set);
    assert.doesNotMatch(out, /ask the room/, 'the CRLF multi-line note is stripped (no leak)');
    // lone-CR too
    const cr = '<!-- Pause here.\rThen ask the room. -->';
    assert.equal(core.stripNotesFromSource(cr, set), '', 'a lone-CR note also strips');
  });

  test('stripNotesFromSource never strips a directive that happens to read like prose', () => {
    // Safety: it matches EXACT note bodies, so a "Remember:" directive-shaped comment
    // that was NOT extracted as a note is never removed.
    const source = '<!-- Remember: this is a note --><!-- _footer: page -->';
    const out = core.stripNotesFromSource(source, new Set(['Remember: this is a note']));
    assert.doesNotMatch(out, /this is a note/);
    assert.match(out, /_footer: page/, 'the unrelated comment stays');
    // Empty set → identity (nothing to strip).
    assert.equal(core.stripNotesFromSource(source, new Set()), source);
  });
});

// ── Directive classification ────────────────────────────────────────────────
// `stripNotesFromSource` deletes any comment whose body was lifted as a note. Its
// directive safety used to rest on the ENGINE having consumed every directive before
// notes-core ever saw the HTML. That is the engine's property, not this module's, and it
// fails on a deck where a directive survives into the rendered section — the directive is
// lifted as a note and then deleted from the verbatim source the envelope carries, so the
// recipient re-imports a deck whose slide has silently lost its class.
describe('notes-core: a directive is never a note', () => {
  test('parity — the mirrored directive names match lib/engine/directives.js', () => {
    // Same discipline as the Marpit pragma mirror above: this module stays dependency-free,
    // and this test fails the moment the engine's registry gains or loses a name.
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
  });

  test('a directive surviving into rendered HTML is not lifted as a note, so the scrub cannot eat it', () => {
    const html = '<section data-lattice-slide><!-- _class: title --><h1>Q3</h1><!-- A real note. --></section>';
    assert.deepEqual(core.noteBodiesFromHtml(html), ['A real note.'], 'only the note is lifted');

    const source = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- A real note. -->\n';
    const out = core.stripNotesFromSource(source, new Set(core.noteBodiesFromHtml(html)));
    assert.match(out, /_class: title/, 'the directive survives --strip-notes');
    assert.doesNotMatch(out, /A real note\./, 'and the note is still scrubbed');
  });

  test('multi-line and bare-flag SPOT directive forms are recognized', () => {
    assert.ok(core.isDirectiveComment('_class: title'));
    assert.ok(core.isDirectiveComment('_class: title\n_paginate: true'), 'every line a directive');
    assert.ok(core.isDirectiveComment('_build'), 'a bare FLAG directive');
    assert.ok(core.isDirectiveComment('_backgroundColor: #fff'));
  });

  test('the DECK-SCOPE form is not treated as a directive — it is ambiguous with prose', () => {
    // The bare form is real directive syntax, but it is indistinguishable from a speaker
    // note that happens to open with the word: `<!-- color: we should discuss the palette -->`.
    // Classifying it as a directive holds it OUT of the scrub set, so --strip-notes never
    // removes it and it ships in the exported file. Leaking is the worse direction, so only
    // the unambiguous `_`-prefixed spot form gets the protection.
    assert.ok(!core.isDirectiveComment('color: we should discuss the palette'));
    assert.ok(!core.isDirectiveComment('class: title'));
    assert.ok(!core.isDirectiveComment('footer: ask about the discount'));

    const html = '<section data-lattice-slide><!-- color: SECRET discuss the palette --></section>';
    assert.deepEqual(core.noteBodiesFromHtml(html), ['color: SECRET discuss the palette'], 'it stays scrubbable');
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

    const html = '<section data-lattice-slide><!-- Note: mention the caveat --></section>';
    assert.deepEqual(core.noteBodiesFromHtml(html), ['Note: mention the caveat'], 'still scrubbable');
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

  test('the four consumed channels are not reported', () => {
    const src = [
      '<!-- _class: title -->',            // spot directive
      '<!-- markdownlint-disable MD033 -->', // tooling pragma
      '<!-- describe: A cover slide. -->',  // a11y description
      '<!-- caption: Read this aloud. -->', // read-as caption
      '<!--   -->',                          // empty
    ].join('\n');
    assert.deepEqual(core.auditStrippedSource(src), []);
  });

  test('an AMBIGUOUS deck-scope directive IS reported — the point is not to assume innocence', () => {
    // `color: …` is real directive syntax and also exactly how a note might open. The scrub
    // treats it as a note (so it gets removed); if one ever survives, the author hears about
    // it rather than discovering it in a file they already sent.
    assert.deepEqual(core.auditStrippedSource('<!-- color: we should discuss the palette -->'), [
      'color: we should discuss the palette',
    ]);
  });

  test('a fully scrubbed source audits clean — no false alarm on the happy path', () => {
    const src = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n';
    const bodies = core.noteBodiesFromHtml('<section><!-- A real note. --></section>');
    assert.deepEqual(core.auditStrippedSource(core.stripNotesFromSource(src, new Set(bodies))), []);
  });
});
