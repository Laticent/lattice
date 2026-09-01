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
    'logo-style: auto',
    'logo-style: brand',
    'logo-style: BRAND', // the producer lowercases the VALUE
    'logo-style: "brand"', // frontMatterScalar strips a wrapping quote pair
    'logo-on: all',
    'logo-on: title',
    'logo-x: 12',
    'logo-y: 88.5',
    'logo-x: -3',
    'logo-x: .5',
    'logo-x: 1.', // Number('1.') is 1, so the producer reads it
    'logo-scale: 1.5',
    "logo-scale: '2'",
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
    'logo-style: neon', // not in the register's two words
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

  test('logo-x / logo-y / logo-scale accept exactly what readDeckLogoFrontMatter accepts', () => {
    const { readDeckLogoFrontMatter } = require('../../../lib/integrations/markdown-it/plugins.js');
    // BOTH DIRECTIONS over one corpus. Looser than the producer suppresses a marker that
    // configured nothing; stricter leaks it into the notes channel. Neither is visible from
    // one direction alone, which is why this compares booleans rather than asserting a list.
    const VALUES = [
      '0', '1', '12', '1.5', '88.5', '-3', '-0.5', '.5', '-.5', '1.',
      '1.2.3', '.', '-', '..', 'abc', '1e3', '12px', '50%', '', ' ',
      '"1.5"', "'2'", 'we should move it left', 'TBD',
    ];
    for (const axis of ['logo-x', 'logo-y', 'logo-scale']) {
      const field = axis === 'logo-scale' ? 'scale' : axis.slice(-1);
      for (const v of VALUES) {
        const line = `${axis}: ${v}`;
        const cfg = readDeckLogoFrontMatter(`---\nlogo: ./m.svg\n${line}\n---\n\n# D\n`);
        const producerReads = cfg != null && cfg[field] != null;
        assert.equal(
          core.isLatticePragma(line), producerReads,
          producerReads
            ? `plugins.js reads "${line}" as ${cfg[field]}, but the pragma matcher does not — `
              + `so <!-- ${line} --> ships as a speaker note (#1350's shape)`
            : `plugins.js ignores "${line}", but the pragma matcher suppresses it — a marker `
              + 'that configured nothing disappears instead of staying visible as a note',
        );
      }
    }
  });

  test('logo-style / logo-on cover every value the producer acts on', () => {
    const { readDeckLogoFrontMatter } = require('../../../lib/integrations/markdown-it/plugins.js');
    const read = (line) => readDeckLogoFrontMatter(`---\nlogo: ./m.svg\n${line}\n---\n\n# D\n`);
    // These two COLLAPSE rather than validate — the producer asks one question of the
    // lowercased value and everything else means the default — so there is no register to
    // iterate. What IS checkable, and is the leak direction: every value the producer acts
    // on must be matched here.
    for (const v of ['brand', 'BRAND', 'Brand', '"brand"', "'brand'"]) {
      assert.equal(read(`logo-style: ${v}`).brand, true, `guard: the producer reads ${v} as brand`);
      assert.equal(core.isLatticePragma(`logo-style: ${v}`), true, `logo-style: ${v}`);
    }
    for (const v of ['title', 'TITLE', '"title"']) {
      assert.equal(read(`logo-on: ${v}`).on, 'title', `guard: the producer reads ${v} as title`);
      assert.equal(core.isLatticePragma(`logo-on: ${v}`), true, `logo-on: ${v}`);
    }
    // The default word is in the domain too — an author writing it out is configuring, not
    // narrating — and the producer's own docs name the two.
    assert.equal(core.isLatticePragma('logo-style: auto'), true);
    assert.equal(core.isLatticePragma('logo-on: all'), true);
    // KEY case: the producer does not read it, so neither does this.
    assert.equal(read('LOGO-STYLE: brand').brand, false, 'guard: the producer ignores an upper-case key');
    assert.equal(core.isLatticePragma('LOGO-STYLE: brand'), false);
  });

  test('finish-override mirrors the block key parseFinishOverride looks up', () => {
    // The producer is TypeScript in the docs site, so this is a SOURCE assertion rather than
    // a call — and it is the drift that actually happens: a rename of the front-matter key.
    // It reads the lookup itself, not a comment about it.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'docs', 'src', 'components', 'studio', 'front-matter.ts'),
      'utf8',
    );
    const m = src.match(/parseFinishOverride[\s\S]*?blocks\.find\(\(\[k\]\) => k === '([^']+)'\)/);
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
      core.notesFromHtml(sec('<!-- tier: short --><h1>A</h1><!-- Pause here. -->')),
      'Pause here.'
    );
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
      '<!-- logo-style: brand --><!-- logo-on: title --><!-- logo-x: 12 --><!-- logo-y: 88.5 -->'
      + '<!-- logo-scale: 1.5 --><!-- finish-override: --><h1>Q3</h1>'
    );
    assert.equal(core.notesFromHtml(html), null, 'a slide of nothing but logo/finish registers has no note');
    assert.deepEqual(
      core.noteBodiesFromHtml(sec('<!-- logo-x: 12 --><h1>Q3</h1><!-- Pause here. -->')),
      ['Pause here.'],
      'the author\'s own note still comes through'
    );
    // The over-strip direction, at the extraction level: a prose value is a NOTE, and eating
    // it would be silent — the author has no way to tell what removed it.
    assert.equal(
      core.notesFromHtml(sec('<h1>Q3</h1><!-- logo-on: the second half -->')),
      'logo-on: the second half'
    );
  });
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
    const out = core.stripNotesFromSource(source, new Set(['Remember to pause here.']));
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

  test('a fence-shaped line that is NOT a fence cannot hide a note from the scrub', () => {
    // The position model's one dangerous direction: a phantom code region hides a real note
    // and it ships in the shared file. Both vectors below leaked before the scan learned that
    // markdown-it does not read a fence line inside an HTML block or inside a comment.
    const set = new Set(['SECRET: do not say the layoffs number', 'Wrap up in two minutes.']);
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
    const out = core.stripNotesFromSource(htmlBlock, set);
    assert.doesNotMatch(out, /SECRET/, 'the note after a phantom fence is still scrubbed');
    assert.doesNotMatch(out, /Wrap up/, 'and so is every note after it');
    // A note that QUOTES an unclosed fence used to blank the rest of the document.
    const quoted = '<!--\nShow them this:\n```js\nchart(1)\n-->\n\n---\n\n<!-- SECRET: do not say the layoffs number -->\n';
    assert.doesNotMatch(
      core.stripNotesFromSource(quoted, new Set(['Show them this:\n```js\nchart(1)', 'SECRET: do not say the layoffs number'])),
      /SECRET/,
      'a fence inside a comment body opens nothing',
    );
  });

  test('a note-shaped comment inside a NESTED fence survives the scrub', () => {
    const source = '````markdown\n```js\n<!-- Board only -->\n```\n````\n\n<!-- Board only -->\n';
    const out = core.stripNotesFromSource(source, new Set(['Board only']));
    assert.equal((out.match(/Board only/g) || []).length, 1, 'the sample survives, the real note goes');
    assert.match(out, /```js\n<!-- Board only -->\n```/);
  });

  test('stripCaptionsFromSource is POSITION-aware for the same reason', () => {
    const source = '```markdown\n<!-- caption: Read this aloud. -->\n```\n\n<!-- caption: Read this aloud. -->\n';
    const out = core.stripCaptionsFromSource(source);
    assert.equal((out.match(/Read this aloud/g) || []).length, 1, 'the documented sample survives, the real caption goes');
    assert.match(out, /```markdown\n<!-- caption: Read this aloud\. -->\n```/);
  });
});

// ── Directive classification ────────────────────────────────────────────────
// `stripNotesFromSource` deletes any comment whose body was lifted as a note. Its
// directive safety used to rest on the ENGINE having consumed every directive before
// notes-core ever saw the HTML. That is the engine's property, not this module's, and it
// fails on a deck where a directive survives into the rendered section — the directive is
// lifted as a note and then deleted from the verbatim source the envelope carries, so the
// recipient re-imports a deck whose slide has silently lost its class.
describe('notes-core: stripNotesFromSource leaves no line where a note was (#1985)', () => {
  test('stripNotesFromSource takes the whole LINE, so no blank line marks where a note was (#1985)', () => {
    // The residue IS the disclosure. Replacing the `<!-- … -->` span alone leaves the line
    // behind as an empty one, and an empty line where a note used to sit names WHICH slides
    // carried a note — in the very source the player envelope ships for re-import. It also
    // reaches the rendered bytes, because the export re-renders this scrubbed source.
    // The author's OWN blank lines on either side survive — this takes the note's line, it
    // does not reflow the deck. What is left is a run of blank lines, which is whitespace an
    // author writes all the time; what is NOT left is a line that exists only because a note
    // was removed from it. See the docblock in notes-core for the residue this does not close.
    const source = '# Slide\n\n<!-- Pause here. -->\n\nBody.\n';
    assert.equal(
      core.stripNotesFromSource(source, new Set(['Pause here.'])),
      '# Slide\n\n\nBody.\n',
      'the note line is gone, terminator included — not blanked in place'
    );
    // Indented, as a nested-list author would write it.
    assert.equal(
      core.stripNotesFromSource('a\n  <!-- n -->\nb\n', new Set(['n'])),
      'a\nb\n',
      'the leading indent goes with the line'
    );
    // Last line, no trailing newline: there is no terminator to take, and the PRECEDING
    // one belongs to the line above and must survive.
    assert.equal(
      core.stripNotesFromSource('a\n<!-- n -->', new Set(['n'])),
      'a\n',
      'a note on the final line leaves the previous line intact'
    );
    // CRLF: the `\r` is part of this line's terminator and goes with it, rather than
    // being left dangling as a lone carriage return in a Windows-authored deck.
    assert.equal(
      core.stripNotesFromSource('a\r\n<!-- n -->\r\nb\r\n', new Set(['n'])),
      'a\r\nb\r\n',
      'a CRLF deck loses the whole line, carriage return included'
    );
    // TWO notes on ONE line. The second is only judged after the first has been cut, so
    // the line legitimately begins at the cursor and collapses — rather than the first
    // seeing a comment after it, declining, and leaving a blank line for both.
    assert.equal(
      core.stripNotesFromSource('a\n<!-- one --><!-- two -->\nb\n', new Set(['one', 'two'])),
      'a\nb\n',
      'two notes sharing a line take the line with them'
    );
  });

  test('stripNotesFromSource leaves an INLINE note\'s surrounding whitespace alone (#1985)', () => {
    // The opposite error, and the reason the line rule is conditional. A note written mid
    // sentence has an author-typed space on each side; deleting one would JOIN two words.
    // `a <!-- n --> b` scrubs to `a  b` — which is also exactly what the counterfactual
    // source (the author never typing the comment) contains, so the span-only cut is
    // already the right answer here.
    assert.equal(core.stripNotesFromSource('a <!-- n --> b', new Set(['n'])), 'a  b');
    assert.equal(core.stripNotesFromSource('a<!-- n -->b', new Set(['n'])), 'ab');
    // A comment that ENDS a line of prose is not a whole-line comment either: the prose
    // before it is not whitespace, so the line stays and only the span goes.
    assert.equal(core.stripNotesFromSource('a <!-- n -->\nb\n', new Set(['n'])), 'a \nb\n');
  });

});

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
    // The value-shape table keys on directive NAMES too, so a rename in the engine must not
    // leave a dead entry here — a dead entry silently stops reporting that directive.
    for (const name of Object.keys(core.DIRECTIVE_VALUE_SHAPES)) {
      assert.ok(engine.KNOWN_DIRECTIVES.has(name), `DIRECTIVE_VALUE_SHAPES key "${name}" is a real directive`);
    }
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
    // The scrub half of that contract, unchanged: reaching rendered HTML still makes it a note.
    assert.deepEqual(
      core.noteBodiesFromHtml('<section><!-- color: we should discuss the palette --></section>'),
      ['color: we should discuss the palette'],
    );
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
    const src = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n';
    const bodies = core.noteBodiesFromHtml('<section><!-- A real note. --></section>');
    assert.deepEqual(core.auditStrippedSource(core.stripNotesFromSource(src, new Set(bodies))), []);
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
    const html = '<section data-lattice-slide><!-- First note. --!><!-- Second note. --></section>';
    assert.deepEqual(core.noteBodiesFromHtml(html), ['First note.', 'Second note.']);
  });

  test('a `--!>`-terminated note still scrubs, and the directive beside it survives', () => {
    const source = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3\n\n<!-- Board only. --!>\n';
    const bodies = core.noteBodiesFromHtml('<section><!-- Board only. --!></section>');
    assert.deepEqual(bodies, ['Board only.'], 'the body is lifted despite the typo');
    const out = core.stripNotesFromSource(source, new Set(bodies));
    assert.doesNotMatch(out, /Board only/, 'the note is scrubbed');
    assert.match(out, /_class: title/, 'the directive is untouched');
  });
});
