/**
 * `build-system-design-chapters` — the cut of examples/system-design-foundations.md
 * into examples/system-design/.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The chapters are generated and byte-checked by
 * `build:check`, so "the committed files match the generator" is already gated and
 * these assertions would be vacuous if they only re-asserted that. What the gate
 * cannot tell you is whether the GENERATOR is right — a cut that drops four slides
 * or duplicates a kit produces thirteen perfectly fresh, perfectly wrong chapters
 * and passes every check in the tree. So the properties pinned below are the ones a
 * reader would notice and no other gate would:
 *
 *   1. the cut PARTITIONS the deck — every slide from the first anchor to the end
 *      lands in exactly one chapter, none twice, none lost;
 *   2. slide bodies are VERBATIM — a chapter can never say something the omnibus
 *      does not;
 *   3. the per-chapter acronym trim is sound in BOTH directions, because
 *      `glossary: auto` renders the registry, not the usage (lib/core/glossary-auto.mjs
 *      `glossaryEntries`) — a stale keep prints a definition the chapter never earns,
 *      and a wrong drop deletes one it needs;
 *   4. the split is FENCE-AWARE, so a `---` inside a code block is code;
 *   5. the filenames are ones the pre-commit PDF rebuild can actually classify —
 *      asserted against that tool's REAL `classify`, not a copy of its regex, since
 *      a copy is what would rot.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chapters = require('../../../tools/build-system-design-chapters');
const { classify } = require('../../../tools/build-staged-pdfs');

const ROOT = path.join(__dirname, '..', '..', '..');
const OMNIBUS = path.join(ROOT, 'examples', 'system-design-foundations.md');

const src = fs.readFileSync(OMNIBUS, 'utf8');
const { frontMatter, slides } = chapters.splitDeck(src);
const ranges = chapters.ranges(slides);
const items = chapters.agendaItems(slides);

test('system-design chapters — the cut', async (t) => {
  await t.test('covers the deck from the first anchor to the last slide, with no gaps', () => {
    assert.equal(ranges[0].from, 2, 'the first chapter starts at the `Part zero` divider');
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

  await t.test('drops only the deck\'s own title and agenda, nothing else', () => {
    // Those two are the only slides the cut is allowed to leave behind: each
    // chapter generates its own. Anything MORE falling outside the first anchor
    // means a chapter silently lost its opening.
    assert.equal(ranges[0].from, 2);
    assert.match(slides[0], /_class: title/);
    assert.match(slides[1], /_class: agenda/);
  });
});

test('system-design chapters — bodies are verbatim', async (t) => {
  await t.test('every omnibus slide appears in its chapter, unedited', () => {
    for (const c of ranges) {
      const out = chapters.composeChapter(frontMatter, slides, c, items);
      for (let i = c.from; i < c.to; i++) {
        const body = slides[i].replace(/^\r?\n+|\s+$/g, '');
        assert.ok(
          out.includes(body),
          `chapter ${c.n} (${c.slug}) does not carry omnibus slide ${i} verbatim`,
        );
      }
    }
  });

  await t.test('adds exactly the wrapper slides the manifest asks for', () => {
    for (const c of ranges) {
      const out = chapters.composeChapter(frontMatter, slides, c, items);
      // parts[0] is the front matter, parts[1..N] are the N slides.
      const count = out.split(/\r?\n---[ \t]*\r?\n/).length - 1;
      // title + agenda + orientation, and a closing unless the chapter inherits
      // the deck's own. This number was wrong in the first draft of this file, in
      // the same direction as the slide count above, and the two cancelled — which
      // is why the emulator's own "HTML: N slides" is quoted here as the check on
      // the check: chapter 1 is 9 omnibus slides and renders 13.
      const wrappers = c.closing === null ? 3 : 4;
      assert.equal(count, c.to - c.from + wrappers, `chapter ${c.n} slide count`);
    }
  });

  await t.test('chapter one renders the 13 slides the emulator reports for it', () => {
    // An absolute number, not a formula, so the two counts above cannot cancel
    // each other again: `node lattice-emulator.js examples/system-design/ch01-a-tuesday.md`
    // prints "HTML: 13 slides" — 9 from the omnibus plus the four wrappers.
    const one = ranges[0];
    const out = chapters.composeChapter(frontMatter, slides, one, items);
    assert.equal(out.split(/\r?\n---[ \t]*\r?\n/).length - 1, 13);
    assert.equal(one.to - one.from, 9);
  });

  await t.test('only the final chapter inherits the deck\'s own closing slide', () => {
    const closers = ranges.filter((c) => c.closing === null);
    assert.equal(closers.length, 1);
    assert.equal(closers[0], ranges.at(-1));
    assert.match(slides[slides.length - 1], /_class: closing/);
  });
});

test('system-design chapters — the acronym trim', async (t) => {
  const registry = chapters.acronymLines(frontMatter).map(([k]) => k);

  await t.test('the omnibus registry is non-trivial, or the trim proves nothing', () => {
    assert.ok(registry.length >= 20, `expected a real registry, got ${registry.length} terms`);
  });

  await t.test('keeps every term the chapter says, and no term it does not', () => {
    for (const c of ranges) {
      const out = chapters.composeChapter(frontMatter, slides, c, items);
      const [, fm, ...rest] = out.split(/^---[ \t]*$/m);
      const body = rest.join('---');
      const kept = new Set(chapters.acronymLines(fm).map(([k]) => k));
      for (const term of registry) {
        const used = new RegExp(`(?<![A-Za-z0-9])${term}(?![A-Za-z0-9])`).test(body);
        assert.equal(
          kept.has(term),
          used,
          `chapter ${c.n} (${c.slug}): ${term} is ${used ? 'used but dropped' : 'unused but kept'}`,
        );
      }
    }
  });

  await t.test('actually trims — no chapter carries the whole registry', () => {
    const widest = Math.max(
      ...ranges.map((c) => {
        const out = chapters.composeChapter(frontMatter, slides, c, items);
        const [, fm] = out.split(/^---[ \t]*$/m);
        return chapters.acronymLines(fm).length;
      }),
    );
    assert.ok(widest < registry.length, 'every chapter kept every term — the trim is a no-op');
  });
});

test('system-design chapters — the splitter', async (t) => {
  await t.test('a `---` inside a fence is code, not a slide break', () => {
    const deck = ['---', 'marp: true', '---', '', 'one', '', '---', '', '```', '---', '```', ''].join('\n');
    const { slides: out } = chapters.splitDeck(deck);
    assert.equal(out.length, 2);
    assert.match(out[1], /```\n---\n```/);
  });

  await t.test('refuses a deck whose split would not round-trip', () => {
    // A separator with trailing whitespace re-emits as a bare `---`, so the body
    // would not be reproduced — the generator must fail rather than quietly
    // normalize a deck it does not own.
    const deck = ['---', 'marp: true', '---', '', 'one', '--- ', 'two', ''].join('\n');
    assert.throws(() => chapters.splitDeck(deck), /round-trip/);
  });

  await t.test('a missing or duplicated anchor is an error, not a shifted cut', () => {
    assert.throws(() => chapters.ranges(['', '`Part zero`']), /matches 0 slides/);
  });
});

test('system-design chapters — the index does not lie about the PDFs', async (t) => {
  // The one assertion in this file that leaves the generator's own arithmetic and
  // asks the committed artifacts. The index's `Pages` column is computed from the
  // composed markdown plus a glossary-presence guess; a reader checks it against a
  // PDF. Counting `/Type /Page` objects in the committed file is that check, and it
  // is the arm that would catch a wrapper slide silently dropped at render, an
  // auto-split nobody noticed, or a glossary appearing where the trim said it would
  // not. It reads committed bytes — no Chromium, so it belongs in the unit tier.
  const pageObjects = (pdf) => {
    const bytes = fs.readFileSync(pdf);
    return (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  };

  await t.test('the omnibus is the 232 slides + 1 glossary page this cut assumes', () => {
    assert.equal(slides.length, 232);
    assert.equal(pageObjects(OMNIBUS.replace(/\.md$/, '.pdf')), 233);
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

  await t.test('the chapters add up to more pages than the omnibus, by the wrappers', () => {
    // 232 + 1 omnibus pages become 291: the deck's title and agenda are dropped
    // once and re-made thirteen times, each chapter gains an orientation slide,
    // twelve gain a closing, and ten of the thirteen earn their own glossary.
    const total = ranges.reduce((n, c) => n + chapters.pageCount(frontMatter, slides, c, items), 0);
    assert.equal(total, 291);
    const glossaries = ranges.filter((c) => {
      const out = chapters.composeChapter(frontMatter, slides, c, items);
      const [, fm] = out.split(/^---[ \t]*$/m);
      return chapters.acronymLines(fm).some(([, line]) => /definition:/.test(line));
    }).length;
    assert.equal(glossaries, 10, 'three chapters define no term and must render no glossary');
  });
});

test('system-design chapters — the wiring', async (t) => {
  await t.test('every filename is one the pre-commit PDF rebuild can classify', () => {
    for (const c of ranges) {
      const rel = path.relative(ROOT, chapters.chapterPath(c)).split(path.sep).join('/');
      const got = classify(rel);
      assert.deepEqual(
        got,
        { kind: 'deck', src: rel, out: rel.replace(/\.md$/, '.pdf') },
        `${rel} would never get its committed PDF rebuilt`,
      );
    }
  });

  await t.test('the roadmap fits the agenda component, and every stop is used', () => {
    assert.equal(items.length, 6, 'the agenda component overflows past six items');
    const stops = new Set(ranges.map((c) => c.stop));
    assert.deepEqual([...stops].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    for (const c of ranges) assert.ok(c.stop >= 1 && c.stop <= items.length);
  });

  await t.test('chapters run in the deck\'s own order, ascending', () => {
    assert.deepEqual(ranges.map((c) => c.n), ranges.map((_, i) => i + 1));
    for (let i = 1; i < ranges.length; i++) assert.ok(ranges[i].from > ranges[i - 1].from);
  });
});
