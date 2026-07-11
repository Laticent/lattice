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
