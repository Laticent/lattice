/**
 * `build-system-design-chapters` — the cut of examples/system-design-foundations.md
 * into examples/system-design/.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The chapters are generated and byte-checked by
 * `build:check`, so "the committed files match the generator" is already gated and
 * these assertions would be vacuous if they only re-asserted it. What the gate cannot
 * tell you is whether the GENERATOR is right — a cut that drops four slides or a trim
 * that loses a term produces thirteen perfectly fresh, perfectly wrong chapters and
 * passes every check in the tree.
 *
 * An independent checker took the first draft of this file apart, and two of its
 * findings shaped what is here now. It found assertions that could not fail under ANY
 * mutation (`ranges().map(c => c.n)` against `i + 1`, which `ranges()` constructs; a
 * `from` ordering already enforced by a throw) — those are gone rather than reworded.
 * And it found the acronym arm re-implementing the generator's own regex on the same
 * input, so it was blind to a wrong notion of "used": that arm now asserts NAMED TERMS
 * against the canonical parser, and one of them (`TB`) is there because the generator
 * really did get it wrong.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chapters = require('../../../tools/build-system-design-chapters');
const { classify } = require('../../../tools/build-staged-pdfs');
const { frontMatterBlockOf } = require('../../../lib/core/slide-boundaries.mjs');
const { acronymEntries } = require('../../../lib/core/resolve-captions.mjs');

const ROOT = path.join(__dirname, '..', '..', '..');
const OMNIBUS = path.join(ROOT, 'examples', 'system-design-foundations.md');

const src = fs.readFileSync(OMNIBUS, 'utf8');
const { frontMatter, slides } = chapters.splitDeck(src);
const ranges = chapters.ranges(slides);
const items = chapters.agendaItems(slides);
const composed = new Map(ranges.map((c) => [c.slug, chapters.composeChapter(frontMatter, slides, c, items)]));

test('system-design chapters — the cut', async (t) => {
  await t.test('covers the deck from the first anchor to the last slide, with no gaps', () => {
    assert.equal(ranges.at(-1).to, slides.length, 'the last chapter runs to the end of the deck');
    for (let i = 1; i < ranges.length; i++) {
      assert.equal(ranges[i].from, ranges[i - 1].to, `chapter ${i + 1} starts where chapter ${i} ends`);
    }
  });

  await t.test('assigns every covered slide to exactly one chapter', () => {
    const seen = new Map();
    for (const c of ranges) {
      for (let i = c.from; i < c.to; i++) {
        assert.equal(seen.has(i), false, `slide ${i} is claimed by two chapters`);
        seen.set(i, c.slug);
      }
    }
    assert.equal(seen.size, slides.length - ranges[0].from);
  });

  await t.test('leaves behind only the deck\'s own title and agenda', () => {
    assert.equal(ranges[0].from, 2);
    assert.match(slides[0], /_class: title/);
    assert.match(slides[1], /_class: agenda/);
  });

  await t.test('finds an anchor only on a DIVIDER, so a repeated eyebrow is harmless', () => {
    // Repeated eyebrows are this deck's idiom — `Your turn` alone repeats many times —
    // so the anchor scan must not be a global text search. An earlier version threw
    // unless an eyebrow matched exactly once deck-wide, which would have turned writing
    // `Security` on an ordinary slide into a hard failure of `npm run build`.
    const eyebrows = slides.map((s) => chapters.eyebrowOf(s)).filter(Boolean);
    const repeated = eyebrows.filter((e, i) => eyebrows.indexOf(e) !== i);
    assert.ok(repeated.length > 0, 'the deck is expected to repeat eyebrows; if not, this arm proves nothing');

    const deck = [
      '---', 'marp: true', '---', '',
      '<!-- _class: divider -->', '', '`Alpha`', '',
      '---', '',
      '<!-- _class: content -->', '', '`Alpha`', '', 'a decoy on a non-divider slide', '',
      '---', '',
      '<!-- _class: divider -->', '', '`Beta`', '',
    ].join('\n');
    const { slides: s2 } = chapters.splitDeck(deck);
    assert.equal(chapters.eyebrowOf(s2[1]), 'Alpha', 'the decoy really does carry the same eyebrow');
  });

  await t.test('a missing anchor is a loud error naming the chapter, not a shifted cut', () => {
    assert.throws(
      () => chapters.ranges(['', '<!-- _class: divider -->\n\n`Nowhere`']),
      /no divider slide with the eyebrow .* cannot be cut/s,
    );
  });
});

test('system-design chapters — bodies are verbatim', async (t) => {
  await t.test('every omnibus slide appears in its chapter, unedited', () => {
    for (const c of ranges) {
      const out = composed.get(c.slug);
      for (let i = c.from; i < c.to; i++) {
        const body = slides[i].replace(/^\r?\n+|\s+$/g, '');
        assert.ok(out.includes(body), `chapter ${c.n} (${c.slug}) does not carry omnibus slide ${i} verbatim`);
      }
    }
  });

  await t.test('the composed chapter re-splits into the slides it was built from', () => {
    // Counted by the ENGINE'S parser on the generator's own output, so it also covers
    // re-emission: joining chunks with a literal `---` is its own chance to move a
    // boundary (a chunk ending in text with no blank line after it would make the next
    // `---` a setext heading and weld two slides into one).
    for (const c of ranges) {
      const wrappers = c.closing === null ? 3 : 4;
      assert.equal(
        chapters.chapterSlideCount(composed.get(c.slug)),
        c.to - c.from + wrappers,
        `chapter ${c.n} slide count`,
      );
    }
  });

  await t.test('chapter one is 9 omnibus slides and 13 rendered ones', () => {
    // An absolute number, not a formula. The first draft of this file had the slide
    // count and the wrapper count each off by one IN THE SAME DIRECTION, so they
    // canceled and this arm passed while both were wrong. `node lattice-emulator.js
    // examples/system-design/ch01-a-tuesday.md` prints "HTML: 13 slides".
    assert.equal(ranges[0].to - ranges[0].from, 9);
    assert.equal(chapters.chapterSlideCount(composed.get(ranges[0].slug)), 13);
  });

  await t.test('only the final chapter inherits the deck\'s own closing slide', () => {
    const closers = ranges.filter((c) => c.closing === null);
    assert.equal(closers.length, 1);
    assert.equal(closers[0], ranges.at(-1));
    assert.match(slides[slides.length - 1], /_class: closing/);
  });
});

test('system-design chapters — the acronym trim', async (t) => {
  const registry = [...acronymEntries(src).keys()];

  await t.test('reads the registry through the canonical parser, in agreement with it', () => {
    assert.equal(registry.length, 21);
    assert.deepEqual([...chapters.acronymRegistry(frontMatter).keys()], registry);
  });

  await t.test('keeps every term the chapter says, and no term it does not', () => {
    for (const c of ranges) {
      const out = composed.get(c.slug);
      const kept = new Set(acronymEntries(out).keys());
      const body = chapters.readerText(out.slice(frontMatterBlockOf(out).length));
      for (const term of registry) {
        const used = new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`).test(body);
        assert.equal(kept.has(term), used, `chapter ${c.n} (${c.slug}): ${term} is ${used ? 'used but dropped' : 'unused but kept'}`);
      }
    }
  });

  await t.test('a mermaid DIRECTION keyword does not earn a term', () => {
    // `flowchart TB` is diagram syntax, not a word on the slide. It alone used to keep
    // `TB` in seven chapters. The scale kit says "TB" nowhere else.
    const scale = composed.get('the-scale-kit');
    assert.match(scale, /flowchart TB/, 'the scale kit really does contain the keyword');
    assert.equal(acronymEntries(scale).has('TB'), false, 'TB is kept only by mermaid syntax');
  });

  await t.test('a term inside a fence that a READER sees still earns its entry', () => {
    // The tempting fix — strip code fences — is wrong here, and these are the three
    // measured cases that prove it: `CDN` is a mermaid NODE LABEL in the security kit,
    // and `MVP` is printed on a `code`-class worksheet slide in two other chapters.
    assert.equal(acronymEntries(composed.get('the-security-kit')).has('CDN'), true);
    assert.equal(acronymEntries(composed.get('designing-instagram')).has('MVP'), true);
    assert.equal(acronymEntries(composed.get('the-map-back')).has('MVP'), true);
  });

  await t.test('the network chapter keeps exactly the four terms it says', () => {
    assert.deepEqual([...acronymEntries(composed.get('the-network-kit')).keys()], ['API', 'CDN', 'DNS', 'L7']);
  });

  await t.test('a re-emitted entry survives the canonical parser unchanged', () => {
    const want = acronymEntries(src);
    for (const c of ranges) {
      for (const [term, got] of acronymEntries(composed.get(c.slug))) {
        assert.deepEqual(got, want.get(term), `chapter ${c.n}: ${term} changed in re-emission`);
      }
    }
  });

  await t.test('actually trims — no chapter carries the whole registry', () => {
    const widest = Math.max(...ranges.map((c) => acronymEntries(composed.get(c.slug)).size));
    assert.ok(widest < registry.length, 'every chapter kept every term — the trim is a no-op');
  });
});

test('system-design chapters — the splitter is the engine\'s, not an imitation', async (t) => {
  // Every construct below is one a `/^---$/m` splitter gets WRONG, and every one of them
  // round-trips byte-for-byte when rejoined with `---`, so the round-trip assertion the
  // first draft leaned on could not see a single case.
  //
  // THE EXPECTED COUNTS ARE LITERALS ON PURPOSE. Comparing `splitDeck` to
  // `splitSlideChunks` would be a tautology now that it calls it — which is the same
  // self-referential trap an independent checker found elsewhere in this file. These
  // numbers were measured against the real parser; the naive-regex answer is written
  // beside each one, and it is the answer this tool used to give.
  const cases = [
    ['a `***` separator',                 '---\nmarp: true\n---\n\none\n\n***\n\ntwo\n',      2, 1],
    ['a `___` separator',                 '---\nmarp: true\n---\n\none\n\n___\n\ntwo\n',      2, 1],
    ['a `----` separator',                '---\nmarp: true\n---\n\none\n\n----\n\ntwo\n',     2, 1],
    ['an indented `  ---`',               '---\nmarp: true\n---\n\none\n\n  ---\n\ntwo\n',    2, 1],
    ['a setext heading over `---`',       '---\nmarp: true\n---\n\nInterlude\n---\n\nbody\n',  1, 2],
    ['a four-backtick fence holding ```', '---\nmarp: true\n---\n\n````\n```\n---\n```\n````\n', 1, 2],
    ['a `---` inside a fence',            '---\nmarp: true\n---\n\none\n\n```\n---\n```\n',    1, 2],
  ];

  for (const [label, deck, engine, naive] of cases) {
    await t.test(`reads ${label} as ${engine} slide(s), not ${naive}`, () => {
      assert.notEqual(engine, naive, 'a case where the two agree proves nothing — replace it');
      assert.equal(chapters.splitDeck(deck).slides.length, engine, label);
    });
  }

  await t.test('refuses a source with no front matter to inherit', () => {
    assert.throws(() => chapters.splitDeck('# just a heading\n'), /no front matter/);
  });
});

test('system-design chapters — the index does not lie about the PDFs', async (t) => {
  // The one arm that leaves the generator's arithmetic and asks the committed artifacts.
  // It is what would catch a wrapper slide dropped at render, an unnoticed auto-split,
  // or a glossary appearing where the trim said it would not.
  const pageObjects = (pdf) =>
    (fs.readFileSync(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

  await t.test('the omnibus renders one page per slide, plus its glossary', () => {
    // Related, not two independent literals: an author who adds a slide moves both, and
    // the RELATION is what says the cut still agrees with the renderer. Asserting them
    // as separate constants let a wrong split be "fixed" by editing the constant.
    assert.equal(pageObjects(OMNIBUS.replace(/\.md$/, '.pdf')), slides.length + 1);
  });

  await t.test('every chapter renders to exactly the page count the index prints', () => {
    for (const c of ranges) {
      const pdf = chapters.chapterPath(c).replace(/\.md$/, '.pdf');
      assert.equal(
        pageObjects(pdf),
        chapters.pageCount(frontMatter, slides, c, items),
        `${path.basename(pdf)} does not have the pages examples/system-design/README.md claims`,
      );
    }
  });

  await t.test('the README prints the numbers it was generated from', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'examples', 'system-design', 'README.md'), 'utf8');
    for (const c of ranges) {
      const row = readme.split('\n').find((l) => l.startsWith(`| ${c.n} | [`));
      assert.ok(row, `no index row for chapter ${c.n}`);
      assert.match(row, new RegExp(`\\| ${c.to - c.from} \\| ${chapters.pageCount(frontMatter, slides, c, items)} \\|$`), row);
    }
    const total = ranges.reduce((n, c) => n + chapters.pageCount(frontMatter, slides, c, items), 0);
    assert.ok(readme.includes(`${total} pages in all`), `README does not state ${total} pages`);
  });

  await t.test('three chapters define no term and must render no glossary', () => {
    const bare = ranges.filter((c) => ![...acronymEntries(composed.get(c.slug)).values()].some((e) => e.definition));
    assert.deepEqual(bare.map((c) => c.slug), ['a-tuesday', 'the-words', 'the-scale-kit']);
    for (const c of bare) {
      assert.equal(chapters.pageCount(frontMatter, slides, c, items), chapters.chapterSlideCount(composed.get(c.slug)));
    }
  });
});

test('system-design chapters — the wiring', async (t) => {
  await t.test('every filename is one the pre-commit PDF rebuild can classify', () => {
    for (const c of ranges) {
      const rel = path.relative(ROOT, chapters.chapterPath(c)).split(path.sep).join('/');
      assert.deepEqual(
        classify(rel),
        { kind: 'deck', src: rel, out: rel.replace(/\.md$/, '.pdf') },
        `${rel} would never get its committed PDF rebuilt`,
      );
    }
  });

  await t.test('the roadmap fits the agenda component, and every stop is used', () => {
    assert.equal(items.length, 6, 'the agenda component overflows past six items');
    assert.deepEqual([...new Set(ranges.map((c) => c.stop))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  });

  await t.test('each chapter renames the running header to its own number', () => {
    for (const c of ranges) {
      assert.match(composed.get(c.slug), new RegExp(`^header: "System design · Chapter ${c.n}"$`, 'm'));
    }
  });

  await t.test('a relative asset path is refused rather than silently broken', () => {
    // A chapter sits one directory deeper, so `assets/x.png` would resolve from
    // examples/system-design/ and render nothing in all thirteen.
    const withImage = slides.slice();
    withImage[ranges[0].from] = `${withImage[ranges[0].from]}\n\n![a](assets/x.png)`;
    assert.throws(
      () => chapters.composeChapter(frontMatter, withImage, ranges[0], items),
      /relative asset path/,
    );
  });
});
