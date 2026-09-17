#!/usr/bin/env node

/**
 * build-system-design-chapters.js — cut examples/system-design-foundations.md into
 * the thirteen standalone chapter decks under examples/system-design/.
 *
 * WHY THIS EXISTS. The tutorial is 232 slides in one file (233 PDF pages, with its
 * generated glossary), and a reader who wants the network kit should not have to carry
 * the other 221. But a hand-split copy is
 * the same prose in two places, and nothing in the tree would notice when they
 * diverged — so the chapters are GENERATED and byte-checked like every other
 * artifact behind `build:check`. The omnibus stays the single source of truth for
 * every slide a reader sees; this file owns only the wrapper each chapter needs to
 * stand on its own.
 *
 * WHAT IT WRITES, per chapter:
 *   - front matter inherited from the omnibus, with `header:` renamed and the
 *     `acronyms:` registry TRIMMED to the terms that chapter actually uses. The
 *     trim is load-bearing, not cosmetic: `glossary: auto` renders every registry
 *     entry that carries a `definition` (lib/core/glossary-auto.mjs `glossaryEntries`),
 *     so an untrimmed copy would end all thirteen PDFs with the same appendix,
 *     defining terms that chapter never says.
 *   - a `title` slide, an orientation slide saying what the chapter assumes from
 *     the ones before it, then the omnibus's own slides VERBATIM, then a `closing`
 *     slide pointing at the next chapter.
 *   - examples/system-design/README.md, the index, with the slide counts computed
 *     rather than typed.
 *
 * WHY THE BODIES ARE VERBATIM. It is the property that makes generation worth the
 * tool: a chapter can never say something the omnibus does not. Cross-references
 * inside the slides ("Part three's removal test") therefore survive untouched,
 * which is why every chapter's title slide names the Part it came from.
 *
 * WHERE A CHAPTER STARTS. By the EYEBROW TEXT of the divider slide that opens it
 * (`Part zero`, `Data`, `Compute`, …), never a slide index — an index rots the
 * first time somebody inserts a slide, silently and in the middle of a chapter.
 * An anchor with no divider is an error, not a shifted cut. See `ranges` for why the
 * search is scoped to dividers and to what follows the previous chapter.
 *
 * WHAT THIS FILE DOES NOT DECIDE FOR ITSELF. Two questions the tree already answers
 * once are asked, not re-derived: where a deck's slides break (`splitSlideChunks`,
 * lib/core/slide-boundaries.mjs) and what its `acronyms:` registry holds
 * (`acronymEntries`, lib/core/resolve-captions.mjs). An earlier draft hand-rolled both
 * and was wrong about both — see the note beside the requires. HARD RULE #1.
 *
 * FILENAMES START WITH A LETTER (`ch01-…`, not `01-…`) ON PURPOSE. The pre-commit
 * PDF rebuild classifies a subdirectory deck with
 * `^(examples/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)\.md$` (tools/build-staged-pdfs.js
 * `classify`). A leading digit does not match, so a `01-…md` chapter would never
 * get its committed PDF rebuilt and would go stale the first time the omnibus
 * changed — a silently dead gate, the same shape as the bug that comment records.
 *
 * Usage:
 *   node tools/build-system-design-chapters.js          # (re)write the chapters
 *   node tools/build-system-design-chapters.js --check   # exit 1 if any is stale
 */

const fs = require('node:fs');
const path = require('node:path');

// HARD RULE #1: both of these questions are already answered ONCE in the tree, and
// this tool asks them rather than re-deriving them. `slide-boundaries.mjs` is "THE ONE
// derivation of a deck's slide boundaries", written because every caller-side splitter
// in the tree had derived that set independently and each one differently; an earlier
// draft of this file was splitter number four, and it disagreed with the engine on
// `***`, `___`, `----`, `- - -`, an indented `---`, a setext heading over `---`, and a
// four-backtick fence containing a three-backtick line. `resolve-captions.mjs` is the
// same for the `acronyms:` registry: it accepts digit-leading (`5G`) and punctuated
// (`I/O`) terms, block-scalar entries and comment lines inside the block, all of which
// the line parser this replaces got wrong — it stopped at the first line it could not
// read, so one `#` comment in the omnibus would have silently emptied every chapter's
// glossary. Both are ESM; the CJS emulator already `require()`s this pair's neighbor
// (`glossary-auto.mjs`), so the route is established.
const { frontMatterBlockOf, splitSlideChunks, normalizeSourceText } = require('../lib/core/slide-boundaries.mjs');
const { slideClassDirectives } = require('../lib/core/class-directive-scan.mjs');
const { acronymEntries } = require('../lib/core/resolve-captions.mjs');

const ROOT = path.join(__dirname, '..');
const OMNIBUS = path.join(ROOT, 'examples', 'system-design-foundations.md');
const OUT_DIR = path.join(ROOT, 'examples', 'system-design');
const FRONT_MATTER_INNER = /^---(?:\r\n|\r|\n)([\s\S]*?)(?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?$/;

/**
 * The cut. `anchor` is the eyebrow of the divider slide the chapter opens on; a
 * chapter runs to the slide before the next chapter's anchor. `part` is the
 * omnibus Part it came from — printed on the title slide because the slide bodies
 * still say "Part three" and a reader of one chapter needs that to resolve.
 *
 * `closing: null` means the chapter already ends on the omnibus's own closing
 * slide and must not get a second one.
 */
// ORIENTATION HEADINGS FIT ON ONE LINE — keep them at 63 characters or fewer.
// Measured on the rendered 4K PDFs, not guessed: 62 and 63 set on one line, while 68
// and 74 wrap and leave a one-word widow on line two ("keys." and "lives." alone). The
// overflow oracle cannot see this — the slide still fits its frame — so it is pinned in
// test/unit/tools/system-design-chapters.test.js instead.
const CHAPTERS = Object.freeze([
  {
    slug: 'a-tuesday',
    stop: 1,
    anchor: 'Part zero',
    part: 'Part zero',
    title: 'Before Anything, a Tuesday',
    standfirst:
      'One engineer, wake to sleep. Ten ideas run through her day, and not one of them gets a name until the next chapter.',
    orientHeading: 'Read this chapter without looking anything up.',
    orientBody:
      'Thirteen chapters carry one method: watch a system, name its parts, find who wants what and what blocks them, decide which kind of answer the job needs, pick your parts off six shelves, then design two products end to end. This first chapter spends no systems-design vocabulary on purpose. You meet each idea the way Maya meets it, against a timestamp, and chapter two hands you the word for it afterwards. Nothing here needs a chapter before it.',
    closingHeading:
      'Ten ideas ran through that day, unnamed.',
    closingBody:
      'Chapter two names them — system, purpose, boundary, environment, process, model, constraint, invariant, infrastructure, emergence — each against the moment in her day that taught it.',
  },
  {
    slug: 'the-words',
    stop: 2,
    anchor: 'Part one',
    part: 'Part one',
    title: 'The Words for It',
    standfirst:
      'Ten ideas ran through Maya’s Tuesday. This chapter gives each one its name, and names the moment that taught it.',
    orientHeading: 'Chapter one is the day this chapter names.',
    orientBody:
      'Every word here points back at a timestamp in Maya’s Tuesday. You can read it cold, because each word is defined where it lands, but the definitions bite harder once you have watched the day they came from. Five words say what a system is made of. Three more are things you make rather than things you find. The last two, infrastructure and emergence, are the ones you only notice when they move.',
    closingHeading:
      'You have the words. Now find the start.',
    closingBody:
      'Chapter three casts every system as a protagonist who wants something and an antagonist standing in the way. Two sentences take ninety seconds and settle four things you were guessing at.',
  },
  {
    slug: 'protagonist-and-antagonist',
    stop: 3,
    anchor: 'Part two',
    part: 'Part two',
    title: 'Protagonist and Antagonist',
    standfirst:
      'Name the person and the force in two sentences, and everything downstream has an answer.',
    orientHeading: 'Six words from chapter two arrive here undefined.',
    orientBody:
      'System, purpose, boundary, environment, constraint and invariant all appear in this chapter without being explained again; chapter two explains them against Maya’s Tuesday. What this chapter adds is the opening move. Who wants what, and what stands in the way, decides the shape of a design before a single box goes on a board — and the antagonist decides which kind of solution you are allowed to build at all.',
    closingHeading:
      'The antagonist picks the rung.',
    closingBody:
      'Chapter four prices it. “Design Instagram” is five different questions, and answering the wrong one costs a quarter — so the ladder comes next, with the test that says a design is finished.',
  },
  {
    slug: 'solution-types',
    stop: 4,
    anchor: 'Part three',
    part: 'Part three',
    title: 'Which Answer Is Wanted',
    standfirst:
      'Five rungs run from an MVP to a specialized system, and each one costs more and commits harder than the rung below it.',
    orientHeading: 'Chapter three named the force. This chapter prices the answer.',
    orientBody:
      'The antagonist you cast in chapter three picks the rung; the size of the company picks nothing. You climb one rung at a time and only on evidence. The chapter closes on the removal test — a design is finished when taking one more thing out would break it — and that test comes back in every chapter after this one, including the two that design a product from nothing.',
    closingHeading:
      'The rung is chosen. Now you need parts.',
    closingBody:
      'Chapters five to ten are the six kits: data, compute, network, scale, reliability, security. Sixteen entries, and the invariants behind all of them. Chapter five opens the shelf and starts with storage.',
  },
  {
    slug: 'the-data-kit',
    stop: 5,
    anchor: 'Part four',
    part: 'Part four',
    title: 'The Data Kit',
    standfirst:
      'Every storage choice is a bet about how you will read it later. Three passes pick the store, and the product name comes last.',
    orientHeading: 'This chapter opens the kit shelf, then works the first kit.',
    orientBody:
      'Its first three slides frame all six: every entry in every kit answers the same three questions, and every constraint in Maya’s Tuesday was somebody’s kit choice, made before she was hired. Then storage, which is where most designs are won or lost. Chapter four’s removal test runs here on the first diagram, and the five kit chapters after this one assume you have read those three questions.',
    closingHeading:
      'Every derived copy here rebuilds unattended.',
    closingBody:
      'Something has to run the rebuild, and chapter six is that something: four compute shapes, three runtimes, and the four properties anything you run must satisfy before it meets real traffic.',
  },
  {
    slug: 'the-compute-kit',
    stop: 5,
    anchor: 'Compute',
    part: 'Part four',
    title: 'The Compute Kit',
    standfirst:
      'Choosing compute is choosing how much of the machine you still own. Statelessness is what makes a machine replaceable.',
    orientHeading: 'The data kit left a promise for this chapter to keep.',
    orientBody:
      'Every derived copy in chapter five — the index, the cache, the replica, the search store — rebuilds unattended. This chapter is what runs the rebuild. It assumes the three questions each kit entry answers, set out at the start of chapter five: what it is, when to reach for it, what it costs. Two of the four shapes decide whether the caller waits; the other two start from something that happened.',
    closingHeading:
      'Your code runs somewhere now.',
    closingBody:
      'Chapter seven is the trip to it. Distance is the one cost you cannot optimize away, and most latency arguments end the moment somebody says the actual numbers.',
  },
  {
    slug: 'the-network-kit',
    stop: 5,
    anchor: 'Network',
    part: 'Part four',
    title: 'The Network Kit',
    standfirst:
      'Light in fiber covers about 200 kilometers per millisecond. That number decides more designs than any framework choice.',
    orientHeading: 'Chapter six put your code on a machine. This is the trip to it.',
    orientBody:
      'A tap crosses several hops before your code sees it, and each hop spends budget. This chapter assumes the runtimes from chapter six and the three questions from chapter five. It closes on what a call leaving your process owes you, starting with a timeout, because a request with no timeout is a resource leak waiting for a bad afternoon.',
    closingHeading:
      'Distance is priced.',
    closingBody:
      'Chapter eight is what happens when there is more of everything. The cache and the replica come back there — not as places data lives, but as moves you make when load grows.',
  },
  {
    slug: 'the-scale-kit',
    stop: 5,
    anchor: 'Scale',
    part: 'Part four',
    title: 'The Scale Kit',
    standfirst:
      'Every scaling change is one of four moves. Little’s law sizes the pool before anyone has to guess.',
    orientHeading: 'The cache and the replica return here as moves, not stores.',
    orientBody:
      'Chapter five introduced the cache and the replica as places data lives. Here they are things you do when load grows. Four moves cover every scaling change: reduce, duplicate, defer, spread. This chapter assumes the data kit’s copies and the network kit’s latency budget, and it ends on the arithmetic that sizes a pool.',
    closingHeading:
      'Scale asks what happens when there is more.',
    closingBody:
      'Chapter nine asks what happens when one part of it stops. That is the whole difference between the two kits, and it is why admission control shows up in both of them.',
  },
  {
    slug: 'the-reliability-kit',
    stop: 5,
    anchor: 'Reliability',
    part: 'Part four',
    title: 'The Reliability Kit',
    standfirst:
      'Failure is the environment, not the exception. Redundancy only helps when the copies can fail apart.',
    orientHeading: 'Scale asked for admission control. This is where it lives.',
    orientBody:
      'Chapter eight’s third invariant asked you to shed load before the system collapses — a reliability pattern doing scale’s work. The two kits differ in the question they ask: chapter eight asks what happens when there is more of everything, this one asks what happens when one part of it stops. It assumes the four scaling moves and the tail latency from chapter eight.',
    closingHeading:
      'Copies only help when they fail apart.',
    closingBody:
      'Chapter ten asks the same question about credentials, and it starts from a harder assumption than this one: the boundary is already crossed.',
  },
  {
    slug: 'the-security-kit',
    stop: 5,
    anchor: 'Security',
    part: 'Part four',
    title: 'The Security Kit',
    standfirst:
      'Assume the boundary is already crossed. Least privilege is measured by what one stolen credential can reach.',
    orientHeading: 'Chapter nine asked if copies fail apart. Now ask about keys.',
    orientBody:
      'Redundancy only helps when failures are independent, and the same question about credentials is this chapter: what one stolen key can reach. It assumes the boundary from chapter two and the dependency and quota practices from the kits before it. Six questions find the holes before somebody else does, and the chapter closes the shelf with a full discover-then-design pass on a registration spike.',
    closingHeading:
      'The shelf is full.',
    closingBody:
      'Sixteen entries and six sets of invariants. Chapters eleven and twelve spend them — the first designs a product at the top of the ladder, the second starts at the bottom and climbs.',
  },
  {
    slug: 'designing-instagram',
    stop: 6,
    anchor: 'Part five',
    part: 'Part five',
    title: 'Designing Instagram',
    standfirst:
      'The antagonist is not scale. It is the shape of the follow graph, and it forces the hybrid fan-out rather than it being a preference.',
    orientHeading: 'Everything from chapters one to ten gets spent here at once.',
    orientBody:
      'You fill in a nine-field worksheet before the first box goes on the board, and you discover only the eighth. Capacity is worked from a daily average up to a peak page-fetch rate, and the design’s own fixes are checked back against the promises that motivated them. Read chapters two to four for the vocabulary and the rung, and chapters five to ten for the parts this design reaches for.',
    closingHeading:
      'One design, at the top of the ladder.',
    closingBody:
      'Chapter twelve runs the same method from nothing, on a parking app you could ship this month, where the card fee turns out to be the bill and the servers never were.',
  },
  {
    slug: 'designing-a-parking-app',
    stop: 6,
    anchor: 'Part six',
    part: 'Part six',
    title: 'Designing a Parking App',
    standfirst:
      'A driver scans a sticker on the bay and pays. One table, three rungs, and the bill is not the one you expected.',
    orientHeading: 'Chapter eleven designed at the top. This one climbs the ladder.',
    orientBody:
      'Same method, smaller product, and nothing is skipped on the way up: a one-table MVP, then a scaled rung, then an optimized one. The payment path is worked to the point you could implement it — deduplicated taps, a unique index over the bay, a webhook that writes only while the row still waits, and a sweep that asks the provider rather than guessing what silence means.',
    closingHeading:
      'Two designs are done.',
    closingBody:
      'Chapter thirteen reads them back: it maps the feed design onto the kits, including the entry we refused, runs the removal test on it, and hands you the worksheet.',
  },
  {
    slug: 'the-map-back',
    stop: 6,
    anchor: 'Part seven',
    part: 'Part seven',
    title: 'The Map Back',
    standfirst:
      'Every entry landed somewhere specific in the feed design, and the most useful one is the entry we refused.',
    orientHeading: 'Both designs, read back against the ten chapters before them.',
    orientBody:
      'It assumes chapter eleven’s feed design in detail and the six kits from chapters five to ten. Chapter four’s removal test runs on the finished design, six review questions run on the parking app from memory, and the deck closes on the two movements it did not teach — develop and deliver — which are the only real check on the two it did.',
    closing: null,
  },
]);

/**
 * Split a deck into its front-matter block and its slides — by asking the engine's
 * own parser, never a regex over `---`.
 *
 * `splitSlideChunks` runs markdown-it's block parser and reads the top-level `hr`
 * tokens, which is the only way to get this right: `***`, `___`, `----`, `- - -` and
 * an indented `---` are all separators the engine honors, while `Interlude` over a
 * `---` is a setext HEADING and no boundary at all. A chapter cut on the wrong side of
 * any of those would ship a slide the omnibus does not have, which is exactly the claim
 * this tool exists to make impossible — and the round-trip assertion the hand-rolled
 * splitter carried caught NONE of them, because every one of those bodies rejoins with
 * `---` byte for byte while splitting differently.
 */
function splitDeck(src) {
  // NORMALIZE FIRST. `frontMatterBlockOf` accepts a lone `\r` as a terminator and the
  // acronym parser's `blockLines` splits on `/\r?\n/` only, so a CR-only source parsed
  // as 232 slides with a registry of ZERO — thirteen chapters shipping no glossary at
  // all, silently, with the re-emission guard comparing 0 against 0 and passing. The
  // engine's own normalizer folds `\r\n` and `\r` to `\n` and drops a BOM, which is the
  // line geometry every other reader here already assumes.
  const text = normalizeSourceText(String(src ?? ''));
  const block = frontMatterBlockOf(text);
  const inner = FRONT_MATTER_INNER.exec(block);
  if (!inner) throw new Error(`${path.relative(ROOT, OMNIBUS)} has no front matter to inherit`);

  // WHICH SLIDES ARE DIVIDERS, from the canonical scanner. A `/<!--\s*_class:…divider/`
  // regex — which is what this was — is the one `class-directive-scan.mjs` documents as
  // three defects: it cannot see Marp's running global `<!-- class: … -->` form, it
  // therefore picks up a directive merely QUOTED in prose, and `\bdivider\b` also
  // matches `divider-lead`. The two agree on today's omnibus; that is luck, not a
  // reason to keep a fourth reader of a question the tree answers once (HARD RULE #1).
  const slides = splitSlideChunks(text.slice(block.length)).chunks;
  const directives = slideClassDirectives(text);
  const offset = directives.length - slides.length;
  const dividers = new Set();
  for (let i = 0; i < slides.length; i++) {
    const payload = directives[i + offset]?.payload || '';
    if (payload.split(/\s+/).includes('divider')) dividers.add(i);
  }
  return { frontMatter: inner[1], slides, dividers };
}

/** A slide's eyebrow: the first paragraph that is nothing but one inline-code span. */
function eyebrowOf(slide) {
  for (const line of slide.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('<!--')) continue;
    const m = t.match(/^`([^`]+)`$/);
    return m ? m[1] : null;
  }
  return null;
}

/**
 * Resolve each chapter's slide range from the DIVIDER slide whose eyebrow is its anchor.
 *
 * An anchor must match EXACTLY ONE divider in the deck. Both halves of that are load-
 * bearing, and the second was briefly lost:
 *
 *   - Scoping to dividers is what lets a generic word like `Security` be an anchor at
 *     all. Repeated eyebrows are this deck's own idiom — 224 of its 232 slides carry one
 *     across 199 distinct strings, `Your turn` alone ×14 — so demanding global uniqueness
 *     over ALL slides would make writing `Security` on an ordinary content slide a hard
 *     failure of `npm run build` that only an edit to this file could clear.
 *   - Requiring uniqueness AMONG DIVIDERS is what keeps a duplicate loud. A "first
 *     divider at or after the previous chapter" rule looks equivalent and is not: adding
 *     one `Network` recap divider inside the compute kit silently moved five slides from
 *     chapter 6 to chapter 7, and every gate in the tree certified the result, because
 *     the README, the page counts and the PDFs all regenerate to agree with the wrong
 *     cut. Measured, on this deck: ch06 10 slides → 5, ch07 11 → 17, no error.
 *
 * So a missing anchor and a duplicated one both fail loudly, and neither is guessed at.
 */
function ranges({ slides, dividers }) {
  const starts = CHAPTERS.map((c, n) => {
    const hits = [];
    for (let i = 0; i < slides.length; i++) {
      if (dividers.has(i) && eyebrowOf(slides[i]) === c.anchor) hits.push(i);
    }
    if (hits.length !== 1) {
      throw new Error(
        `the eyebrow \`${c.anchor}\` marks ${hits.length} divider slides in ` +
          `${path.relative(ROOT, OMNIBUS)} (expected exactly 1), so chapter ${n + 1} ` +
          `(${c.slug}) cannot be cut${hits.length ? ` — slides ${hits.join(', ')}` : ''}. ` +
          'Give one of them a different eyebrow, or fix the anchor in ' +
          'tools/build-system-design-chapters.js.',
      );
    }
    return hits[0];
  });
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] <= starts[i - 1]) {
      throw new Error(
        `\`${CHAPTERS[i].anchor}\` (slide ${starts[i]}) precedes \`${CHAPTERS[i - 1].anchor}\` ` +
          `(slide ${starts[i - 1]}) — CHAPTERS is out of order against the deck.`,
      );
    }
  }
  return CHAPTERS.map((c, i) => ({
    ...c,
    n: i + 1,
    from: starts[i],
    to: i + 1 < starts.length ? starts[i + 1] : slides.length,
  }));
}

/** The acronym registry of a front-matter block, via the canonical parser — term →
 *  `{ expansion, definition? }`. Wrapped back into a document because that parser's
 *  entry point takes a deck source, and there must not be a second way to read this. */
function acronymRegistry(frontMatter) {
  return acronymEntries(`---\n${frontMatter}\n---\n`);
}

/**
 * The text of a chapter as a READER meets it, for deciding which acronyms it earns.
 *
 * Only ONE thing is removed: the non-label parts of a mermaid diagram. Inside a
 * ```mermaid fence the visible text is the LABELS — quoted strings and bracketed
 * contents. Everything else is syntax: node identifiers, direction keywords, arrows,
 * `subgraph`. A node identifier is not a hypothetical source of a phantom term — it is
 * where `CI` came from (`PUSH --> CI(["Build and test…"])`), which put
 * `CI: { expansion: continuous integration }` into chapter 2's registry even though
 * `pdftotext` finds no `CI` on any of that chapter's rendered pages. An earlier fix
 * stripped only `flowchart TB`-style direction keywords, so it caught `TB` and missed
 * `CI`; extracting labels catches the whole class, direction keywords included.
 *
 * NON-MERMAID FENCES STAY WHOLE, and that is measured, not assumed. Three DEFINED terms
 * in this deck are matched only inside a fence and all three are on the slide: `CDN` is
 * a mermaid node LABEL (`C3(["CDN verifies"])`), and `MVP` is printed on a `code`-class
 * worksheet slide in two chapters. Stripping fences wholesale — the obvious fix — would
 * have deleted three glossary entries a reader genuinely needs.
 *
 * The check on all of this is the RENDERED ARTIFACT, not this function: every term a
 * chapter keeps is asserted to appear in that chapter's committed PDF text.
 */
function readerText(body) {
  return body.replace(/^([ \t]*)```mermaid[^\n]*\n([\s\S]*?)^\1```/gm, (_all, _indent, inner) =>
    [...inner.matchAll(/"([^"]*)"|\[([^[\]"]*)\]|\(([^()"]*)\)|\{([^{}"]*)\}/g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4])
      .join(' '),
  );
}

/**
 * One `acronyms:` entry, re-emitted in the omnibus's own house style: a bare `expansion`
 * where that is unambiguous, and a `definition` ALWAYS quoted.
 *
 * The definition is quoted unconditionally rather than only when it has to be, because
 * the alternative is a chapter whose front matter is styled differently from the deck it
 * came from, one term at a time, by whether that sentence happens to contain a comma. A
 * definition is a sentence; sentences take quotes here. The caller parses the result back
 * and compares, so a shape this cannot carry fails loudly rather than shipping.
 */
function serializeAcronym(term, entry) {
  const bare = (v) => (/[,{}[\]:#"'\n]/.test(v) || v !== v.trim() ? JSON.stringify(v) : v);
  const parts = [`expansion: ${bare(entry.expansion)}`];
  if (entry.definition) parts.push(`definition: ${JSON.stringify(entry.definition)}`);
  return `  ${term}: { ${parts.join(', ')} }`;
}

/**
 * Front matter for one chapter: the omnibus's scalars, a per-chapter `header:`, and only
 * the acronyms this chapter earns.
 *
 * The trim is load-bearing rather than tidy. `glossary: auto` renders every registry
 * entry that carries a `definition` (`lib/core/glossary-auto.mjs` `glossaryEntries`) —
 * usage never enters into it — so an untrimmed copy would end all thirteen PDFs with the
 * same appendix, defining terms the chapter never says.
 *
 * Entries are RE-EMITTED from the parsed registry rather than spliced out of the source
 * as raw lines, and the result is parsed back and compared before it is returned. A
 * splice cannot represent a block-scalar entry and silently mangles one; this way a
 * shape this serializer cannot carry fails loudly, here, instead of shipping a chapter
 * whose glossary quietly lost a term.
 */
function chapterFrontMatter(frontMatter, chapter, bodyText) {
  const scalars = [];
  let inside = false;
  for (const line of frontMatter.split(/\r?\n/)) {
    if (/^acronyms:[ \t]*$/.test(line)) { inside = true; continue; }
    if (inside) {
      if (/^[ \t]+\S/.test(line) || !line.trim()) continue;
      inside = false;
    }
    if (/^header:/.test(line)) { scalars.push(`header: "System design · Chapter ${chapter.n}"`); continue; }
    if (line.trim()) scalars.push(line);
  }
  const reader = readerText(bodyText);
  const used = new Map();
  for (const [term, entry] of acronymRegistry(frontMatter)) {
    if (new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`).test(reader)) used.set(term, entry);
  }
  const lines = [...scalars];
  if (used.size) {
    lines.push('acronyms:');
    for (const [term, entry] of used) lines.push(serializeAcronym(term, entry));
  }
  const out = lines.join('\n');

  const back = acronymRegistry(out);
  if (back.size !== used.size) {
    throw new Error(`chapter ${chapter.n} (${chapter.slug}): re-emitted ${used.size} acronyms, parsed back ${back.size}`);
  }
  for (const [term, entry] of used) {
    const got = back.get(term);
    if (!got || got.expansion !== entry.expansion || (got.definition ?? '') !== (entry.definition ?? '')) {
      throw new Error(
        `chapter ${chapter.n} (${chapter.slug}): acronym \`${term}\` does not survive re-emission — ` +
          'serializeAcronym cannot carry this entry shape. Fix the serializer rather than the deck.',
      );
    }
  }
  return out;
}

/** A term goes into a RegExp, and the canonical registry admits `.`, `&`, `/` and `-`
 *  in a key (`resolve-captions.mjs`: `[A-Za-z0-9][\w.&/-]*`), so `I/O` unescaped would
 *  make `.` a wildcard. The narrower key class this replaces made that unreachable —
 *  which is why widening it and escaping had to land together. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The series roadmap, lifted off the omnibus's OWN agenda slide rather than retyped
 * here — six movements, in its words, so a chapter can never advertise a shape the
 * deck no longer has. Each chapter marks its stop with `progress-N`.
 *
 * Six is also the agenda component's ceiling ("~4 items, over 6 overflows",
 * lib/components/inventory/agenda/agenda.docs.md), which is why the roadmap is the
 * six movements and not the thirteen chapters — thirteen items would crowd the slide
 * off its own capacity budget. The count is asserted for that reason: if the omnibus
 * regroups into seven, this fails loudly instead of shipping an overflowing agenda.
 */
function agendaItems(slides) {
  const slide = slides.find((s) => /<!--\s*_class:[^>]*\bagenda\b/.test(s));
  if (!slide) throw new Error('the omnibus has no agenda slide to lift the roadmap from');
  const items = slide
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*\d+\.\s+(.*\S)\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
  if (items.length !== 6) {
    throw new Error(
      `the omnibus agenda lists ${items.length} items; the chapter roadmap is built for 6 ` +
        '(the agenda component overflows past six). Re-map `stop` in CHAPTERS and update this check.',
    );
  }
  return items;
}

/** The generated wrapper slides. Bodies stay verbatim; only these are authored here. */
function titleSlide(c) {
  return [
    '<!-- _class: title silent spectrum -->',
    '',
    `# ${c.title}`,
    '',
    `\`Chapter ${c.n} of ${CHAPTERS.length} · ${c.part}\``,
    '',
    c.standfirst,
  ].join('\n');
}

function agendaSlide(c, items) {
  return [
    `<!-- _class: agenda progress-${c.stop} -->`,
    '',
    '## Thirteen chapters, gathered into six movements.',
    '',
    ...items.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');
}

function orientSlide(c) {
  return [
    '<!-- _class: content -->',
    '',
    '`Where this sits`',
    '',
    `## ${c.orientHeading}`,
    '',
    c.orientBody,
  ].join('\n');
}

function closingSlide(c) {
  if (c.closing === null) return null;
  return [
    '<!-- _class: closing silent spectrum -->',
    '',
    `## ${c.closingHeading}`,
    '',
    `\`Chapter ${c.n} of ${CHAPTERS.length} · How to Think About Systems\``,
    '',
    c.closingBody,
  ].join('\n');
}

function composeChapter(frontMatter, slides, c, items) {
  const body = slides.slice(c.from, c.to).map((s) => s.replace(/^\r?\n+|\s+$/g, ''));
  const wrapped = [titleSlide(c), agendaSlide(c, items), orientSlide(c), ...body];
  const close = closingSlide(c);
  if (close) wrapped.push(close);
  assertNoRelativeAssets(`${frontMatter}\n${body.join('\n\n')}`, c);
  const bodyText = wrapped.join('\n\n');
  const out = `---\n${chapterFrontMatter(frontMatter, c, bodyText)}\n---\n\n${wrapped.join('\n\n---\n\n')}\n`;

  // RE-SPLIT WHAT WE JUST WROTE, with the same parser that cut it — cheap insurance, and
  // NOT the proof the commit that added it claimed. Its reach, honestly: the joiner
  // always writes a blank line before `---`, so the setext case originally cited here
  // cannot arise, and the chunks came out of `splitSlideChunks` so none carries a
  // top-level `hr`. It is also count-only, so a compensating pair (one boundary lost,
  // one gained) would pass. What it does catch is a wrapper slide that stops producing
  // tokens, a body substituted from somewhere other than the split, and any future
  // change to the joiner.
  const n = chapterSlideCount(out);
  if (n !== wrapped.length) {
    throw new Error(
      `chapter ${c.n} (${c.slug}): composed ${wrapped.length} slides but the parser reads ${n} ` +
        'in the output — re-emitting the omnibus chunks changed where the slides break.',
    );
  }
  return out;
}

/** The slide count of a COMPOSED chapter, read by the engine's parser rather than by
 *  counting `---` lines — a chapter body carries fenced code, and a naive count would
 *  both mis-report the index's `Pages` column and agree with itself when wrong. */
function chapterSlideCount(doc) {
  return splitDeck(doc).slides.length;
}

/** A chapter sits one directory deeper than the omnibus, so a relative asset path would
 *  resolve from `examples/system-design/` and quietly render nothing in all thirteen.
 *  The omnibus carries no images today; this refuses rather than rewrites, because
 *  rewriting would break the one property the chapters rest on — that every body is the
 *  omnibus's own bytes. */
function assertNoRelativeAssets(text, c) {
  // The FRONT MATTER is scanned too, not just the slides. A deck-level
  // `backgroundImage:` is copied verbatim into all thirteen chapters, which makes it the
  // highest-blast-radius relative path in the file, and it was the one thing this guard
  // never looked at.
  const img = text.match(/!\[[^\]]*\]\((?!https?:|data:|#|\/)([^)\s]+)/);
  const bg = text.match(/_?[bB]ackgroundImage:\s*(?:url\(\s*)?['"]?(?!https?:|data:|\/)([^)'"\s]+)/);
  const img2 = text.match(/<img\b[^>]*\ssrc=["'](?!https?:|data:|\/)([^"']+)/);
  const hit = img || bg || img2;
  if (hit) {
    throw new Error(
      `chapter ${c.n} (${c.slug}) carries the relative asset path \`${hit[1]}\`, which would ` +
        'resolve from examples/system-design/ and break. Make it repo-absolute in the omnibus, ' +
        'or teach this tool to rewrite it.',
    );
  }
}

function chapterPath(c) {
  return path.join(OUT_DIR, `ch${String(c.n).padStart(2, '0')}-${c.slug}.md`);
}

/** How many PDF pages a chapter renders to: its slides, the wrappers, and the
 *  auto-glossary appendix — which exists only when the trimmed registry still
 *  carries a term with a `definition` (lib/core/glossary-auto.mjs `appendAutoGlossary`
 *  is a no-op otherwise, so three chapters correctly render none). */
function pageCount(frontMatter, slides, c, items) {
  const out = composeChapter(frontMatter, slides, c, items);
  const defined = [...acronymRegistry(splitDeck(out).frontMatter).values()].some((e) => e.definition);
  return chapterSlideCount(out) + (defined ? 1 : 0);
}

/** The index. Prose, not a deck — the repo deck linter walks this folder. */
function composeReadme(frontMatter, slides, chapters, items) {
  const rows = chapters.map((c) => {
    const file = path.basename(chapterPath(c));
    return `| ${c.n} | [${c.title}](${file}) | ${c.part} | ${c.to - c.from} | ${pageCount(frontMatter, slides, c, items)} |`;
  });
  const body = chapters.reduce((n, c) => n + (c.to - c.from), 0);
  const pages = chapters.reduce((n, c) => n + pageCount(frontMatter, slides, c, items), 0);
  return `# examples/system-design/ — the tutorial, in chapters

\`examples/system-design-foundations.md\` is one deck: ${slides.length} slides, ${slides.length + 1}
PDF pages with its generated glossary. These are the same slides cut into
${chapters.length} chapter decks, each one readable on its own — its own title slide, an
agenda marking which of the deck's six movements it sits in, an orientation
slide saying what it assumes from the chapters before it, and a closing slide
pointing at the next one. Chapter ${chapters.length} ends on the deck's own closing slide
instead of a second one.

**Generated — do not hand-edit.** The omnibus is the single source of truth for
every slide body here; \`tools/build-system-design-chapters.js\` owns the wrapper
slides and the cut. Fix prose in the omnibus and run \`npm run chapters:system-design\`
(\`build:check\` fails on a stale, missing or orphaned chapter).

| # | Chapter | From | Slides | Pages |
|---|---|---|---|---|
${rows.join('\n')}

**Slides** counts what came from the omnibus — ${body} of its ${slides.length}, the two it
does not carry being the deck's own title and agenda, which each chapter
replaces with its own. **Pages** is what the chapter actually renders to: those
slides, plus the wrappers, plus a glossary appendix where the chapter's trimmed
acronym registry still defines something. ${pages} pages in all.

Render one by hand (set \`CHROME_PATH\` first; see \`engineering/development.md\`):

\`\`\`
node lattice-emulator.js examples/system-design/ch07-the-network-kit.md examples/system-design/ch07-the-network-kit.pdf
\`\`\`
`;
}

function main(argv) {
  const check = argv.includes('--check');
  const src = fs.readFileSync(OMNIBUS, 'utf8');
  const deck = splitDeck(src);
  const { frontMatter, slides } = deck;
  const chapters = ranges(deck);

  const wanted = new Map();
  const items = agendaItems(slides);
  for (const c of chapters) wanted.set(chapterPath(c), composeChapter(frontMatter, slides, c, items));
  wanted.set(path.join(OUT_DIR, 'README.md'), composeReadme(frontMatter, slides, chapters, items));

  if (check) {
    const problems = [];
    for (const [file, want] of wanted) {
      let have = null;
      try { have = fs.readFileSync(file, 'utf8'); } catch { /* missing */ }
      if (have === null) problems.push(`missing: ${path.relative(ROOT, file)}`);
      else if (have !== want) problems.push(`stale: ${path.relative(ROOT, file)}`);
    }
    let present = [];
    try { present = fs.readdirSync(OUT_DIR); } catch { /* not created yet */ }
    for (const name of present) {
      if (!name.endsWith('.md')) continue;
      if (!wanted.has(path.join(OUT_DIR, name))) {
        problems.push(`orphan: examples/system-design/${name} — no chapter claims it`);
      }
    }
    if (!problems.length) {
      process.stdout.write(`system-design-chapters OK — ${chapters.length} chapters current.\n`);
      return 0;
    }
    process.stderr.write(`system-design-chapters STALE — ${problems.length} problem(s):\n`);
    for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
    process.stderr.write('Run `npm run chapters:system-design` and commit.\n');
    return 1;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let wrote = 0;
  for (const [file, want] of wanted) {
    let have = null;
    try { have = fs.readFileSync(file, 'utf8'); } catch { /* missing */ }
    if (have !== want) { fs.writeFileSync(file, want); wrote++; }
  }
  process.stdout.write(
    wrote
      ? `[build-system-design-chapters] wrote ${wrote} file(s) in examples/system-design/ (${chapters.length} chapters)\n`
      : `[build-system-design-chapters] no changes (${chapters.length} chapters up to date).\n`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { CHAPTERS, splitDeck, eyebrowOf, ranges, acronymRegistry, readerText, serializeAcronym, agendaItems, chapterFrontMatter, composeChapter, chapterSlideCount, composeReadme, pageCount, chapterPath };
