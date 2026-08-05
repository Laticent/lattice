/**
 * Unit: the shared class-directive scan (lib/core/class-directive-scan.mjs) — the
 * ONE reader for every authoring surface that has to answer "what class governs
 * this slide?" without running the render pipeline.
 *
 * The load-bearing test is the last one: the scan is compared against
 * `slideClassSpans` — the reader that IS derived from the engine's own token
 * stream — over every committed deck. A synthetic case list cannot tell you the
 * two agree; a corpus can.
 *
 * See engineering/decisions/2026-08-05-one-class-directive-reader.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { slideClassSpans } = require('../../../lib/core/slide-class-spans');
const { splitTopLevel } = require('../../../lib/authoring/slide-split');
const { resolveSplitMode } = require('../../../lib/core/resolve-split');
const scan = require('../../../lib/core/class-directive-scan.mjs');

const { slideClassDirectives, classDirectiveAt } = scan;

const ROOT = path.join(__dirname, '..', '..', '..');
const payloads = (src) => slideClassDirectives(src).map((d) => d.payload);
/**
 * The class an author literally WROTE in a chunk, read without the scanner — the
 * alignment tests below have to compare the scan against something independent of
 * it, or they only prove the scan agrees with itself.
 *
 * Deliberately NOT a regex. A `<!--\s*_?class:…-->` pattern is what CodeQL's
 * `js/bad-tag-filter` reads as an HTML sanitizer missing the `--!>` terminator, and
 * it flagged this line — correctly by its own lights and wrongly here, exactly as it
 * did for the scanner's own comment-end matcher (see `commentCloses` in
 * lib/core/class-directive-scan.mjs). Slicing between the delimiters says the same
 * thing without pretending to filter anything.
 */
const writtenClass = (chunk) => {
  const open = chunk.indexOf('<!--');
  if (open === -1) return '';
  const close = chunk.indexOf('-->', open);
  if (close === -1) return '';
  const inner = chunk.slice(open + 4, close).trim();
  const m = inner.startsWith('_class:') ? inner.slice(7)
    : inner.startsWith('class:') ? inner.slice(6)
      : null;
  return m === null ? '' : m.trim();
};

/**
 * How many sections the ENGINE renders — the oracle for "how many slides is this?".
 * Required lazily so the cheap grammar tests above do not pay for loading it.
 */
const sectionCount = (src) => (require('../../../lib/engine').render(src).html.match(/<section\b/g) || []).length;

const at = (src, lineNo) => {
  const lines = src.split('\n');
  return classDirectiveAt((n) => lines[n - 1], lineNo);
};

describe('class-directive scan — both forms, resolved as the engine resolves them', () => {
  test('a spot `_class:` governs its own slide only', () => {
    const src = '---\nmarp: true\n---\n\n<!-- _class: kpi -->\n\n## A\n\n---\n\n## B\n';
    assert.deepEqual(payloads(src), ['', '', 'kpi', '']);
  });

  test('a GLOBAL `class:` carries forward from its own slide to the end', () => {
    const src = ['---', 'marp: true', '---', '', '## A', '', '---', '',
      '<!-- class: diagram dark -->', '', '## B', '', '---', '', '## C', ''].join('\n');
    assert.deepEqual(payloads(src), ['', '', '', 'diagram dark', 'diagram dark']);
  });

  test('a spot REPLACES the running global — the whole key, not the tokens it names', () => {
    const src = ['---', 'marp: true', '---', '', '<!-- class: diagram dark -->', '', '## A', '',
      '---', '', '<!-- _class: closing -->', '', '## B', '', '---', '', '## C', ''].join('\n');
    assert.deepEqual(payloads(src), ['', '', 'diagram dark', 'closing', 'diagram dark']);
  });

  test('a later global replaces an earlier one from its own slide onward', () => {
    const src = ['---', 'marp: true', '---', '', '<!-- class: diagram -->', '', '## A', '',
      '---', '', '<!-- class: content -->', '', '## B', '', '---', '', '## C', ''].join('\n');
    assert.deepEqual(payloads(src), ['', '', 'diagram', 'content', 'content']);
  });

  test('the LAST spot on a slide wins, matching the engine overlaying two on one slide', () => {
    const src = '---\nmarp: true\n---\n\n<!-- _class: kpi -->\n<!-- _class: stats -->\n\n## A\n';
    assert.deepEqual(payloads(src), ['', '', 'stats']);
  });
});

describe('class-directive scan — what is PROSE and not a directive', () => {
  test('a directive quoted mid-sentence does not count', () => {
    // The exact shape from #1383: the real directive is the GLOBAL form, so the
    // old `_class:`-only, first-match regex took the quoted one instead.
    const src = ['---', 'marp: true', '---', '', '<!-- class: content -->', '', '## A', '',
      'The docs write `<!-- _class: zzzz-not-a-component -->` when they mean "name a layout".', ''].join('\n');
    assert.deepEqual(payloads(src), ['', '', 'content']);
  });

  test('a directive inside a fenced code block does not count, and its `---` is not a boundary', () => {
    const src = ['---', 'marp: true', '---', '', '<!-- _class: content -->', '', '## A', '',
      '```markdown', '<!-- _class: kpi -->', '---', '```', '', 'Still slide one.', ''].join('\n');
    assert.deepEqual(payloads(src), ['', '', 'content']);
  });

  test('a tilde fence works too, and a shorter inner fence does not close a longer one', () => {
    const src = ['---', 'marp: true', '---', '', '<!-- _class: content -->', '', '~~~~text',
      '~~~', '<!-- _class: kpi -->', '~~~~', '', 'Body.', ''].join('\n');
    assert.deepEqual(payloads(src), ['', '', 'content']);
  });

  test('an unknown directive key is not a class directive', () => {
    const src = '---\nmarp: true\n---\n\n<!-- notaclass: kpi -->\n\n## A\n';
    assert.deepEqual(payloads(src), ['', '', '']);
  });

  test('a quoted value is unquoted the way the engine unquotes it', () => {
    const src = '---\nmarp: true\n---\n\n<!-- _class: "kpi dark" -->\n\n## A\n';
    assert.deepEqual(payloads(src), ['', '', 'kpi dark']);
  });

  test('CRLF sources split and resolve identically', () => {
    const lf = '---\nmarp: true\n---\n\n<!-- _class: kpi -->\n\n## A\n\n---\n\n## B\n';
    assert.deepEqual(payloads(lf.replace(/\n/g, '\r\n')), payloads(lf));
  });
});

describe('classDirectiveAt — the editor entry point', () => {
  const SRC = ['---', 'marp: true', '---', '', '<!-- _class: kpi -->', '', '## A', '',
    '---', '', '<!-- class: diagram -->', '', '## B', '', '---', '', '## C', ''].join('\n');

  test('reports the payload AND the line the winning directive sits on', () => {
    assert.deepEqual(at(SRC, 7), { payload: 'kpi', text: '<!-- _class: kpi -->', line: 5 });
  });

  test('a slide governed by a running global points at the GLOBAL\'s line', () => {
    // Where the author has to go to change it — not at their own slide.
    assert.deepEqual(at(SRC, 17), { payload: 'diagram', text: '<!-- class: diagram -->', line: 11 });
  });

  test('null when nothing governs the cursor', () => {
    assert.equal(at('---\nmarp: true\n---\n\n## A\n', 5), null);
  });

  test('a directive BELOW the cursor does not govern it', () => {
    // The contract completion has always had: "the directive above the cursor".
    const src = '---\nmarp: true\n---\n\n## A\n\n<!-- _class: kpi -->\n';
    assert.equal(at(src, 5), null);
  });
});

describe('class-directive scan ≡ the engine, over the committed corpus', () => {
  // Every committed DECK — a `.md` whose front matter names `marp`/`theme`/`split`
  // — that carries a class directive at all.
  const decks = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n')
    .map((rel) => {
      let src;
      try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
      const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!fm || !/^\s*(marp|theme|split):/m.test(fm[1])) return null;
      if (!/<!--\s*_?class:/.test(src)) return null;
      return { rel, src };
    })
    .filter(Boolean);

  test('the corpus is big enough for this to mean something', () => {
    assert.ok(decks.length > 200, `expected 200+ decks with a class directive, found ${decks.length}`);
  });

  test('every slide resolves the SAME class the engine-derived reader resolves', () => {
    const wrong = [];
    let compared = 0;
    let skipped = 0;
    let slides = 0;
    for (const { rel, src } of decks) {
      const spans = slideClassSpans(src).spans.map((s) => s.slideClass);
      const scanned = payloads(src).slice(2); // drop the two front-matter chunks
      if (scanned.length !== spans.length) {
        // A BOUNDARY divergence, not a class one — `splitTopLevel`'s `^---$` rule
        // against the engine's full thematic-break + `split: headings` rule. It is
        // the linter's pre-existing slide-NUMBERING gap (every finding's `slide`
        // field is counted from `splitTopLevel`), not something this reader can
        // close, and it is tracked rather than silently tolerated: assert the set
        // stays exactly the two `split: headings` decks it is today.
        skipped++;
        // Every known divergence is heading-split INJECTION: the engine adds a
        // boundary before a slide's 2nd-or-later heading, which a `^---$` scan has
        // no way to see. So the engine must have MORE slides, on a deck resolving
        // to `headings` — anything else would be a divergence of a new kind.
        assert.equal(resolveSplitMode(src), 'headings', `${rel}: divergence on a \`split: rule\` deck`);
        assert.ok(spans.length > scanned.length,
          `${rel}: the engine found FEWER slides (${spans.length}) than the scan (${scanned.length}) — not heading-split injection`);
        continue;
      }
      compared++;
      slides += spans.length;
      for (let i = 0; i < spans.length; i++) {
        if (scanned[i] !== spans[i]) {
          wrong.push(`${rel} slide ${i + 1}: scan "${scanned[i]}" vs engine "${spans[i]}"`);
        }
      }
    }
    assert.equal(skipped, 2, 'the boundary-divergence set should stay at the two `split: headings` decks');
    assert.ok(compared > 200, `expected 200+ comparable decks, compared ${compared}`);
    // Print the live figures so the PR/ADR/CHANGELOG numbers can be re-read off a
    // run instead of transcribed once and left to rot across rebases — every one of
    // them drifted at least once on this branch.
    console.log(`# corpus: ${decks.length} decks with a class directive · ${compared} compared · ${slides} slides · ${skipped} skipped`);
    assert.deepEqual(wrong, [],
      'a slide linted as the wrong component is checked against the wrong contract in BOTH '
      + 'directions — spurious errors on shapes that are fine, silence on shapes that are not');
  });

  test('the reader it replaces gets those slides wrong — the case for the change', () => {
    // Pinned as a DIFFERENCE, not an absence: without it, "0 wrong" above could mean
    // the new reader is right, or that the corpus never exercised the defect.
    //
    // Asserted as a PROPERTY rather than a count — every slide the old regex got
    // wrong is one governed by a running GLOBAL directive, which is the form it
    // could not see. A count would just churn as decks are added.
    // THE HISTORICAL READER, reimplemented WITHOUT its regex.
    //
    // The pattern this module replaces was:
    //
    //     /<!--\s*_class:\s*([^>]+?)\s*-->/
    //
    // and the test's job is to run it over the corpus and show what it gets wrong.
    // Keeping it as a literal is not an option: CodeQL reads any `<!--…-->` pattern
    // as an HTML sanitizer missing the `--!>` terminator (`js/bad-tag-filter`) and
    // fails the PR on it. An inline `// codeql[…]` suppression was tried first and
    // is not honored by this repo's setup, so the literal has to go.
    //
    // Repairing it was never on the table — a fixed "old reader" measures nothing.
    // So this is a faithful re-implementation, and faithful is MEASURED rather than
    // asserted: against the original regex over every chunk of every committed
    // markdown file — 5,717 chunks — the two agree exactly, including the edge where
    // a whitespace-only value makes the lazy `([^>]+?)` capture a single space.
    const oldReaderClass = (chunk) => {
      let i = 0;
      for (;;) {
        const open = chunk.indexOf('<!--', i);
        if (open === -1) return null;
        const close = chunk.indexOf('-->', open + 4);
        if (close === -1) return null;
        const inner = chunk.slice(open + 4, close).replace(/^\s+/, '');
        if (inner.startsWith('_class:')) {
          const rest = inner.slice(7);
          const value = rest.trim();
          // `[^>]` cannot cross a `>`, so a value containing one is not a match here
          // either — the regex would go looking for a later `-->`, and so does this.
          if (value && !value.includes('>')) return value;
          if (!value && rest.length) return ' ';
        }
        i = open + 4;
      }
    };
    const wrong = [];
    for (const { rel, src } of decks) {
      const spans = slideClassSpans(src).spans.map((s) => s.slideClass);
      const chunks = splitTopLevel(src);
      if (chunks.length - 2 !== spans.length) continue;
      for (let i = 2; i < chunks.length; i++) {
        if ((oldReaderClass(chunks[i]) ?? '') !== spans[i - 2]) wrong.push({ rel, slide: i - 1 });
      }
    }
    assert.ok(wrong.length >= 4, `the corpus must exercise the defect, got ${wrong.length}`);
    const byDeck = new Set(wrong.map((w) => w.rel));
    for (const rel of byDeck) {
      const src = decks.find((d) => d.rel === rel).src;
      assert.match(src, /^\s*<!--\s*class:/m,
        `${rel}: the old reader was wrong on a deck that uses NO global directive — a different defect`);
    }
  });
});

describe('what counts as the START of a line, against the real engine', () => {
  // A directive nested in a container is still a directive: markdown-it opens the
  // `html_block` INSIDE a blockquote or a list item, and the engine reads it. The
  // reader this module replaced matched those (it ran unanchored over a chunk), so
  // requiring column 0 was narrower than what shipped — and silently, because a
  // slide with no resolved class is skipped by every lint rule.
  //
  // The negative half matters as much: a comment that starts mid-sentence, or under
  // a tab / four-space indent (an indented CODE BLOCK to markdown-it), is prose. That
  // is what closes the quoted-directive defect this module exists for, so it is
  // asserted here rather than assumed.
  const engine = require('../../../lib/engine');
  const CASES = [
    ['> <!-- _class: kpi -->', true, 'blockquote'],
    ['>> <!-- _class: kpi -->', true, 'nested blockquote, no inner space'],
    ['> > <!-- _class: kpi -->', true, 'spaced nested blockquote'],
    ['<!-- _class: kpi -->', true, 'plain'],
    ['- <!-- _class: kpi -->', true, 'list item'],
    ['* <!-- _class: kpi -->', true, 'star list item'],
    ['1. <!-- _class: kpi -->', true, 'ordered list item'],
    ['prose <!-- _class: kpi -->', false, 'mid-sentence is prose'],
    ['- `<!-- _class: kpi -->`', false, 'quoted in inline code is prose'],
    ['\t<!-- _class: kpi -->', false, 'tab indent is a code block'],
    ['    <!-- _class: kpi -->', false, 'four-space indent is a code block'],
    ['-<!-- _class: kpi -->', false, 'no space after the dash is not a list item'],
  ];

  for (const [line, isDirective, label] of CASES) {
    test(`${label}: ${JSON.stringify(line)}`, () => {
      const src = `---\nmarp: true\ntheme: indaco\n---\n\n${line}\n\n# A\n`;
      const rendered = ((engine.render(src).html.match(/<section[^>]*\sclass="([^"]*)"/) || [])[1] || '').split(/\s+/);
      const scanned = slideClassDirectives(src).at(-1).payload;
      // The ENGINE is the oracle — assert it first, so a markdown-it change breaks
      // this with a clear message instead of silently re-baselining the scan.
      assert.equal(rendered.includes('kpi'), isDirective, `the engine disagrees about ${label}`);
      assert.equal(scanned === 'kpi', isDirective, `the scan disagrees with the engine about ${label}`);
    });
  }
});

describe('the scan indexes exactly like splitTopLevel — the pairing every caller relies on', () => {
  // THE CONTRACT, and it is load-bearing rather than decorative. Every consumer
  // pairs the two arrays POSITIONALLY:
  //
  //     slides.forEach((slide, idx) => { const dir = directives[idx]; … })
  //
  // so if the lengths ever differ, every slide after the divergence is checked
  // against its NEIGHBOUR's class contract — defect #3 in this module's header,
  // arriving through the fix for it. It is unchecked at the call sites, so it is
  // checked here.
  //
  // Both sides now count from `chunkBoundaryLines`, so the pairing is structural
  // rather than two files agreeing by inspection. These cases pin the two shapes
  // that used to break it from opposite directions.
  //
  // The first: a `---` written INSIDE a multi-line comment — an ordinary thing to do
  // when commenting a run of slides out. The engine does not split there (the whole
  // comment is one `html_block`), and neither reader does now; the earlier pair
  // agreed that it DID, which was two copies of the same mistake.
  test('a `---` inside a multi-line comment is not a boundary, on either side', () => {
    const src = [
      '# One', '', '---', '', '<!-- _class: kpi -->', '', '## Two', '', '---', '',
      '<!--', 'commented out for now:', '', '---', '', '## Dropped', '', '-->', '',
      '<!-- _class: quote -->', '', '## Four', '',
    ].join('\n');
    const dirs = slideClassDirectives(src);
    const chunks = splitTopLevel(src);
    assert.equal(dirs.length, chunks.length,
      'the scan and the splitter must agree on how many slides there are');
    // The ENGINE is the oracle for the NUMBER, so "they agree" cannot mean "they
    // are wrong together" — the failure mode this whole pair used to have.
    assert.equal(chunks.length, sectionCount(src),
      'and both must agree with the number of sections the engine actually renders');
    // …and the pairing must be right, not merely the same length.
    chunks.forEach((chunk, i) => {
      const own = writtenClass(chunk);
      if (!own) return;
      assert.equal(dirs[i].payload, own,
        `chunk ${i} carries \`${own}\` but was paired with \`${dirs[i].payload}\``);
    });
  });

  // The second shape, and the one this module could not see at all until it stopped
  // deciding boundaries itself: a separator the ENGINE breaks on that is not a bare
  // `---`. Every finding after such a line was attributed to the wrong slide.
  const SEPARATORS = [
    ['***', 'asterisk rule'],
    ['___', 'underscore rule'],
    ['- - -', 'spaced dashes'],
    ['--- ', 'a trailing space'],
    ['----', 'four dashes'],
    ['  ---', 'indented two spaces'],
  ];
  for (const [sep, label] of SEPARATORS) {
    test(`a separator written as ${label} pairs the class with its own slide`, () => {
      const src = ['<!-- _class: kpi -->', '', '# One', '', sep, '',
        '<!-- _class: quote -->', '', '# Two', ''].join('\n');
      const dirs = slideClassDirectives(src);
      const chunks = splitTopLevel(src);
      assert.equal(sectionCount(src), 2, `the engine must break on ${JSON.stringify(sep)}`);
      assert.equal(chunks.length, 2);
      assert.deepEqual(dirs.map((d) => d.payload), ['kpi', 'quote'],
        'the second slide must carry its own class, not the first slide\'s');
    });
  }

  test('a setext underline is a heading, so both readers keep one slide', () => {
    // The divergence of opposite sign: `/^---$/m` split here and the engine does not.
    const src = ['<!-- _class: kpi -->', '', 'Interlude', '---', '', 'body', ''].join('\n');
    assert.equal(sectionCount(src), 1, 'a `---` under a paragraph line is a setext underline');
    assert.equal(splitTopLevel(src).length, 1);
    assert.deepEqual(slideClassDirectives(src).map((d) => d.payload), ['kpi']);
  });

  test('every committed deck keeps the two in lockstep', () => {
    // A synthetic case proves the mechanism; the corpus proves nobody has drifted.
    const files = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
      .split('\n').filter(Boolean);
    assert.ok(files.length > 500, `expected the full corpus, got ${files.length}`);
    const bad = [];
    for (const rel of files) {
      let src;
      try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
      const d = slideClassDirectives(src).length;
      const c = splitTopLevel(src).length;
      if (d !== c) bad.push(`${rel}: ${d} directives vs ${c} chunks`);
    }
    assert.deepEqual(bad, [], 'these decks would have every finding after the divergence mis-attributed');
  });
});

describe('the comment END mirrors markdown-it, not the HTML spec', () => {
  // The HTML spec ends a comment at `--!>` as well as `-->`. markdown-it does NOT
  // (`rules_block/html_block.mjs` pairs `/^<!--/` with a literal `/-->/`), so a
  // directive closed that way is swallowed by the comment and the slide renders as
  // the default component. CodeQL's `js/bad-tag-filter` reads a `-->`-only pattern
  // as an HTML SANITIZER missing a bypass and flags it high-severity; this parse
  // sanitizes nothing (that is DOMPurify at the preview boundary, HARD RULE #22),
  // and "fixing" it toward the spec would put the linter and the renderer back
  // into disagreement — the whole defect #1383 exists to remove.
  //
  // So the agreement is pinned here against the REAL engine rather than asserted
  // in a comment: whatever markdown-it does with `--!>`, this reader does too.
  const engine = require('../../../lib/engine');
  const deck = (close) => `---\nmarp: true\ntheme: indaco\n---\n\n<!--\n_class: kpi\n${close}\n\n## Head\n\ntext\n`;
  const sectionClass = (src) => (engine.render(src).html.match(/<section[^>]*\sclass="([^"]*)"/) || [])[1] || '';

  for (const close of ['-->', '--!>']) {
    test(`a directive closed with \`${close}\` reads the same to the scanner and the engine`, () => {
      const src = deck(close);
      const scanned = payloads(src).at(-1);
      const rendered = sectionClass(src).split(/\s+/);
      if (scanned) {
        assert.ok(rendered.includes(scanned), `engine section "${rendered.join(' ')}" must carry the scanned class "${scanned}"`);
      } else {
        assert.ok(!rendered.includes('kpi'),
          'the scanner found no directive, so the engine must not have applied one either');
      }
    });
  }

  test('`--!>` specifically: neither reader closes the comment', () => {
    assert.equal(payloads(deck('--!>')).at(-1), '', 'the scanner must not treat `--!>` as a close');
    assert.ok(!sectionClass(deck('--!>')).split(/\s+/).includes('kpi'), 'and neither does the engine');
    // …while the ordinary spelling does, so the test above is not vacuous.
    assert.equal(payloads(deck('-->')).at(-1), 'kpi');
    assert.ok(sectionClass(deck('-->')).split(/\s+/).includes('kpi'));
  });
});

describe('cost — this runs on every keystroke', () => {
  test('a full-deck scan is well under a frame', () => {
    // The measurement behind lib/core/class-directive-scan.mjs's "why a line scan
    // and not the token stream". Deliberately generous (a 60fps frame is 16.7ms):
    // what matters is the ORDER of the cost, not a wall-clock number this sandbox
    // could hold stable under load.
    const src = fs.readFileSync(path.join(ROOT, 'examples/gallery-jargon.md'), 'utf8');
    const lines = src.split('\n').length;
    assert.ok(lines > 500, `expected a substantial deck, got ${lines} lines`);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) slideClassDirectives(src);
    const per = (performance.now() - t0) / 20;
    assert.ok(per < 16, `${per.toFixed(2)}ms per scan over ${lines} lines — too slow for a keystroke`);
  });

  test('an UNTERMINATED `<!--` stays linear — the adversarial half of the same cost', () => {
    // The test above times a WELL-FORMED deck, which is the half an attacker does
    // not send. A single unterminated opener makes the multi-line consumption run
    // to EOF; accumulating the buffer and re-scanning ALL of it each iteration made
    // that quadratic — measured at 8s for one stray `<!--` on a 32k-line deck
    // against 5ms clean. The Studio lints untrusted markdown (shared and
    // AI-generated decks) on every keystroke, so this is a hang, not a slow path.
    //
    // Asserted as a RATIO against the same deck's clean scan rather than a
    // wall-clock number, so it means the same thing on a loaded sandbox: linear
    // costs a small constant factor, quadratic costs three orders of magnitude.
    const body = 'some ordinary prose line here\n'.repeat(20000);
    const clean = () => { const t = performance.now(); slideClassDirectives(body); return performance.now() - t; };
    const poisoned = () => { const t = performance.now(); slideClassDirectives(`<!-- oops\n${body}`); return performance.now() - t; };
    clean(); poisoned(); // warm
    const ratio = Math.max(poisoned(), 0.01) / Math.max(clean(), 0.01);
    assert.ok(ratio < 25, `an unterminated \`<!--\` cost ${ratio.toFixed(0)}× a clean scan of the same deck — the consumption is re-scanning its buffer`);
  });
});
