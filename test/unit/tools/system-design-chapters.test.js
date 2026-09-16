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
const { acronymEntries } = require('../../../lib/core/resolve-captions.mjs');

const ROOT = path.join(__dirname, '..', '..', '..');
const OMNIBUS = path.join(ROOT, 'examples', 'system-design-foundations.md');

const src = fs.readFileSync(OMNIBUS, 'utf8');
const deck = chapters.splitDeck(src);
const { frontMatter, slides } = deck;
const ranges = chapters.ranges(deck);
const items = chapters.agendaItems(slides);
const composed = new Map(ranges.map((c) => [c.slug, chapters.composeChapter(frontMatter, slides, c, items)]));

test('system-design chapters — the cut', async (t) => {
  await t.test('marks exactly the deck\'s 14 divider slides, and nothing else', () => {
    // Pinned because "every slide is a divider" is a NO-OP on this omnibus — no content
    // slide happens to carry an anchor eyebrow — so it survived every other assertion.
    // 14 = the eight `Part` dividers plus the six kit dividers; thirteen are anchors.
    assert.equal(deck.dividers.size, 14);
    assert.equal(deck.dividers.has(0), false, 'the title slide is not a divider');
    assert.equal(deck.dividers.has(1), false, 'nor the agenda');
    for (const c of ranges) assert.equal(deck.dividers.has(c.from), true);
  });

  await t.test('starts each chapter on the divider its anchor names', () => {
    // Derived INDEPENDENTLY of ranges(). The arm this replaces asserted
    // `ranges[i].from === ranges[i-1].to`, which is the same ternary compared to
    // itself and true for any `starts`, including a wrong one.
    for (const c of ranges) {
      assert.ok(deck.dividers.has(c.from), `chapter ${c.n} does not start on a divider`);
      assert.equal(chapters.eyebrowOf(slides[c.from]), c.anchor, `chapter ${c.n} anchor`);
    }
    assert.equal(ranges.at(-1).to, slides.length, 'the last chapter runs to the end of the deck');
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

  await t.test('ignores a repeated eyebrow on a NON-divider slide', () => {
    // Scoping to dividers is what lets a generic word like `Security` be an anchor.
    // The arm this replaces built a decoy deck and then never called `ranges` on it,
    // so `isDivider = () => true` passed all 38 assertions.
    const decoy = slides.slice();
    decoy.splice(ranges[6].from, 0, '<!-- _class: content -->\n\n`Network`\n\nprose that merely quotes the eyebrow');
    const shifted = new Set([...deck.dividers].map((i) => (i >= ranges[6].from ? i + 1 : i)));
    const after = chapters.ranges({ slides: decoy, dividers: shifted });
    assert.equal(after[6].from, ranges[6].from + 1, 'the real divider shifted by one, and the cut follows IT');
    assert.equal(after[6].to - after[6].from, ranges[6].to - ranges[6].from, 'chapter 7 is unchanged');
    assert.equal(after[5].to - after[5].from, ranges[5].to - ranges[5].from + 1, 'the decoy lands in chapter 6, where it sits');
  });

  await t.test('a DUPLICATED divider anchor is a loud error, not a silent mis-cut', () => {
    // The regression this pins: a "first divider at or after the previous chapter" rule
    // looks equivalent to uniqueness and is not. Adding one `Network` recap divider
    // inside the compute kit silently moved five slides from chapter 6 to chapter 7 —
    // ch06 10 slides -> 5, ch07 11 -> 17 — and every gate regenerated to agree with it.
    const hacked = slides.slice();
    const at = ranges[5].from + 5;
    hacked.splice(at, 0, '<!-- _class: divider -->\n\n`Network`\n\n## A look ahead at the next kit.');
    const dividers = new Set([...deck.dividers].map((i) => (i >= at ? i + 1 : i)));
    dividers.add(at);
    assert.throws(
      () => chapters.ranges({ slides: hacked, dividers }),
      /marks 2 divider slides/,
    );
  });

  await t.test('a missing anchor is a loud error naming the chapter, not a shifted cut', () => {
    assert.throws(
      () => chapters.ranges({ slides: ['', '<!-- _class: divider -->\n\n`Nowhere`'], dividers: new Set([1]) }),
      /marks 0 divider slides .*cannot be cut/s,
    );
  });

  await t.test('anchors that appear out of order against the deck are an error', () => {
    // Exercised on a synthetic deck of nothing but the thirteen anchor dividers, with
    // two swapped — the ordering branch is otherwise unreachable from a real omnibus.
    const fake = chapters.CHAPTERS.map((c) => `<!-- _class: divider -->\n\n\`${c.anchor}\``);
    [fake[3], fake[4]] = [fake[4], fake[3]];
    assert.throws(
      () => chapters.ranges({ slides: fake, dividers: new Set(fake.map((_, i) => i)) }),
      /out of order against the deck/,
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

  await t.test('keeps exactly these terms, per chapter', () => {
    // PINNED LITERALS, not a re-derivation. The arm this replaces called the tool's own
    // `readerText` and rebuilt its escape regex on the same input, so it was blind to a
    // wrong notion of "used" — with `readerText` stubbed to the identity it still passed
    // while seven chapters regained `TB`. Every set below was checked against that
    // chapter's COMMITTED PDF text: each term appears on a rendered page, and no omnibus
    // term absent from this list appears on one.
    const want = {
      ch01: ['VPN'], ch02: ['VPN'], ch03: ['MVP'], ch04: ['MVP'],
      ch05: ['ACID', 'API', 'CAP', 'CDN', 'BASE', 'CPU'],
      ch06: ['API'], ch07: ['API', 'CDN', 'DNS', 'L7'], ch08: [],
      ch09: ['SLA', 'SLI', 'SLO'], ch10: ['API', 'CDN', 'HSM', 'TLS'],
      ch11: ['API', 'CDN', 'MVP', 'GB', 'POST', 'PUT', 'TB', 'TTL'],
      ch12: ['MVP'], ch13: ['CDN', 'MVP'],
    };
    for (const c of ranges) {
      const key = `ch${String(c.n).padStart(2, '0')}`;
      assert.deepEqual([...acronymEntries(composed.get(c.slug)).keys()], want[key], key);
    }
  });

  await t.test('mermaid SYNTAX earns nothing — neither a direction nor a node id', () => {
    // Two separate sources of phantom terms, found one commit apart. `flowchart TB` kept
    // `TB` in seven chapters; the node identifier in `PUSH --> CI([...])` kept `CI` in
    // chapter 2, where `pdftotext` finds no `CI` on any rendered page.
    const scale = composed.get('the-scale-kit');
    assert.match(scale, /flowchart TB/, 'the scale kit really does contain the keyword');
    assert.equal(acronymEntries(scale).has('TB'), false, 'TB is a direction keyword here');

    const words = composed.get('the-words');
    assert.match(words, /CI\(\["Build and test/, 'chapter 2 really does contain the node id');
    assert.equal(acronymEntries(words).has('CI'), false, 'CI is a node identifier, not a label');
  });

  await t.test('readerText keeps mermaid LABELS and drops the syntax around them', () => {
    // Asserted on a literal, independently of any chapter, so a stub cannot pass it.
    const fence = ['```mermaid', 'flowchart TB', '  PUSH --> CI(["Build and test"])', '  CI --> REV{"Review"}', '```'].join('\n');
    const seen = chapters.readerText(fence);
    assert.match(seen, /Build and test/, 'a quoted label is visible');
    assert.match(seen, /Review/, 'a braced label is visible');
    assert.doesNotMatch(seen, /(?<![A-Za-z0-9])CI(?![A-Za-z0-9])/, 'a node id is not');
    assert.doesNotMatch(seen, /flowchart|PUSH|REV/, 'nor a keyword, nor the other ids');
    assert.equal(chapters.readerText('```js\nconst CI = 1;\n```'), '```js\nconst CI = 1;\n```', 'a non-mermaid fence is untouched');
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

test('system-design chapters — the guards actually guard', async (t) => {
  const fm = 'marp: true\nheader: "System design"\nacronyms:\n';

  await t.test('a regex metacharacter in a term is escaped, not interpreted', () => {
    // The canonical key class admits `.` (resolve-captions.mjs: [A-Za-z0-9][\w.&/-]*),
    // so an unescaped `v1.2` would match `v1X2` and keep a term the chapter never says.
    const withDot = `${fm}  v1.2: { expansion: version one point two }`;
    const kept = (body) => chapters.chapterFrontMatter(withDot, { n: 1, slug: 't' }, body);
    assert.match(kept('we shipped v1.2 last week'), /v1\.2:/, 'the real term is kept');
    assert.doesNotMatch(kept('we shipped v1X2 last week'), /v1\.2:/, 'a wildcard match must not keep it');
  });

  await t.test('an expansion needing quotes gets them, and survives the round trip', () => {
    const tricky = `${fm}  X: { expansion: "a, b: c" }`;
    const out = chapters.chapterFrontMatter(tricky, { n: 1, slug: 't' }, 'X is said here');
    assert.equal(acronymEntries(`---\n${out}\n---\n`).get('X').expansion, 'a, b: c');
  });

  await t.test('a relative background image in the FRONT MATTER is refused', () => {
    // Copied verbatim into all thirteen chapters, so it is the highest-blast-radius
    // relative path in the file — and the branch the guard never looked at.
    assert.throws(
      () => chapters.composeChapter(`${frontMatter}\nbackgroundImage: url('assets/x.png')`, slides, ranges[0], items),
      /relative asset path/,
    );
  });

  await t.test('a relative <img src> in a body slide is refused', () => {
    const hacked = slides.slice();
    hacked[ranges[0].from] = `${hacked[ranges[0].from]}\n\n<img src="assets/x.png">`;
    assert.throws(() => chapters.composeChapter(frontMatter, hacked, ranges[0], items), /relative asset path/);
  });

  await t.test('the re-split assertion fires when a body would change the boundaries', () => {
    const hacked = slides.slice();
    hacked[ranges[0].from] = 'one\n\n***\n\ntwo';
    assert.throws(
      () => chapters.composeChapter(frontMatter, hacked, ranges[0], items),
      /the parser reads \d+ in the output/,
    );
  });

  await t.test('a CR-only source still finds its acronyms', () => {
    // frontMatterBlockOf accepts a lone \r; the acronym parser's blockLines does not.
    // Unnormalized, a CR-only omnibus parsed as 232 slides with a registry of ZERO —
    // thirteen chapters with no glossary, and the re-emission guard comparing 0 to 0.
    const cr = src.replace(/\n/g, '\r');
    const crDeck = chapters.splitDeck(cr);
    assert.equal(crDeck.slides.length, slides.length);
    assert.equal(chapters.acronymRegistry(crDeck.frontMatter).size, 21);
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
