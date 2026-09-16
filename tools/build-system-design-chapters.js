#!/usr/bin/env node

/**
 * build-system-design-chapters.js — cut examples/system-design-foundations.md into
 * the thirteen standalone chapter decks under examples/system-design/.
 *
 * WHY THIS EXISTS. The tutorial is 233 slides in one file, and a reader who wants
 * the network kit should not have to carry the other 222. But a hand-split copy is
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
 * An anchor that no longer matches is an error, not a shifted cut.
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

const ROOT = path.join(__dirname, '..');
const OMNIBUS = path.join(ROOT, 'examples', 'system-design-foundations.md');
const OUT_DIR = path.join(ROOT, 'examples', 'system-design');
const FRONT_MATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/**
 * The cut. `anchor` is the eyebrow of the divider slide the chapter opens on; a
 * chapter runs to the slide before the next chapter's anchor. `part` is the
 * omnibus Part it came from — printed on the title slide because the slide bodies
 * still say "Part three" and a reader of one chapter needs that to resolve.
 *
 * `closing: null` means the chapter already ends on the omnibus's own closing
 * slide and must not get a second one.
 */
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
      'Thirteen chapters carry one method: watch a system, name its parts, cast a design, pick the rung, reach into six kits, then design two products end to end. This first chapter spends no systems-design vocabulary on purpose. You meet each idea the way Maya meets it, against a timestamp, and chapter two hands you the word for it afterwards. Nothing here needs a chapter before it.',
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
      'Chapter three casts every system as a protagonist who wants something and an antagonist standing in the way. Two sentences, ninety seconds, and four things you were guessing at settle.',
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
      'Something has to run the rebuild, and chapter six is that something: four compute shapes, four runtimes, and the four properties anything you run must satisfy before it meets real traffic.',
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
      'Chapter five introduced them as places data lives. This chapter uses them as things you do when load grows: add a copy of something you already had, or move the work — to later, or to somewhere else. It assumes the data kit’s copies and the network kit’s latency budget. The average request is a fiction, and your users live in the tail.',
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
    orientHeading: 'The scale kit asked for admission control. This chapter is where it lives.',
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
    orientHeading: 'Chapter nine asked whether the copies fail apart. Ask it about keys.',
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
    orientHeading: 'Chapter eleven designed at the top of the ladder. This one climbs it.',
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
    orientHeading: 'This chapter reads the two designs back against the ten before them.',
    orientBody:
      'It assumes chapter eleven’s feed design in detail and the six kits from chapters five to ten. Chapter four’s removal test runs on the finished design, six review questions run on the parking app from memory, and the deck closes on the two movements it did not teach — develop and deliver — which are the only real check on the two it did.',
    closing: null,
  },
]);

/**
 * Split a deck into its front-matter block and its slides.
 *
 * FENCE-AWARE, and that is not decoration. A bare `---` line inside a ``` or ~~~
 * block is code, not a slide break — markdown-it closes the fence before any
 * thematic break is considered, so the renderer keeps it. A naive line split
 * would cut a slide in half there, and the halves would be re-emitted with their
 * interior whitespace trimmed, silently corrupting a code slide. The omnibus has
 * no such line today; this keeps the day someone adds one from being a mystery.
 *
 * The split is asserted to round-trip: rejoining the slides must reproduce the
 * body byte for byte, or the cut is wrong in a way the chapters would inherit.
 */
function splitDeck(src) {
  const m = src.match(FRONT_MATTER);
  if (!m) throw new Error('omnibus has no front matter');
  const body = src.slice(m[0].length);
  const lines = body.split('\n');
  const slides = [];
  let current = [];
  let fence = null;
  for (const line of lines) {
    const open = line.match(/^\s*(```+|~~~+)/);
    if (fence === null && open) fence = open[1][0].repeat(3);
    else if (fence !== null && open && line.trim().startsWith(fence)) fence = null;
    else if (fence === null && /^---[ \t]*\r?$/.test(line)) {
      slides.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join('\n'));
  if (slides.join('\n---\n') !== body) {
    throw new Error('slide split does not round-trip the omnibus body — the cut cannot be trusted');
  }
  return { frontMatter: m[1], slides };
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

/** Resolve each chapter's slide range from its anchor eyebrow. Anchors must be
 *  present, unique, and in manifest order — anything else is an error, because a
 *  silently shifted cut lands in the middle of a chapter. */
function ranges(slides) {
  const starts = CHAPTERS.map((c) => {
    const hits = slides
      .map((s, i) => (eyebrowOf(s) === c.anchor ? i : -1))
      .filter((i) => i !== -1);
    if (hits.length !== 1) {
      throw new Error(
        `anchor \`${c.anchor}\` matches ${hits.length} slides in the omnibus (expected exactly 1) — ` +
          'the chapter cut cannot be resolved. Fix the anchor in tools/build-system-design-chapters.js.',
      );
    }
    return hits[0];
  });
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] <= starts[i - 1]) {
      throw new Error(
        `anchor \`${CHAPTERS[i].anchor}\` precedes \`${CHAPTERS[i - 1].anchor}\` in the omnibus — ` +
          'CHAPTERS is out of order against the deck.',
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

/** The omnibus `acronyms:` entries, as ordered [key, line] pairs. Line-based on
 *  purpose: each entry is one line in this registry and is copied through
 *  verbatim, so a `definition` containing a colon or a brace survives. */
function acronymLines(frontMatter) {
  const out = [];
  let inside = false;
  for (const line of frontMatter.split(/\r?\n/)) {
    if (/^acronyms:[ \t]*$/.test(line)) { inside = true; continue; }
    if (!inside) continue;
    const m = line.match(/^[ \t]+([A-Za-z][A-Za-z0-9]*):[ \t]/);
    if (m) { out.push([m[1], line]); continue; }
    if (line.trim()) break; // a non-indented key ends the block
  }
  return out;
}

/** Front matter for one chapter: the omnibus's scalars, a per-chapter `header:`,
 *  and only the acronyms this chapter says. */
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
  const used = acronymLines(frontMatter).filter(([key]) =>
    new RegExp(`(?<![A-Za-z0-9])${key}(?![A-Za-z0-9])`).test(bodyText),
  );
  const lines = [...scalars];
  if (used.length) {
    lines.push('acronyms:');
    for (const [, line] of used) lines.push(line);
  }
  return lines.join('\n');
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
  const bodyText = wrapped.join('\n\n');
  return `---\n${chapterFrontMatter(frontMatter, c, bodyText)}\n---\n\n${wrapped.join('\n\n---\n\n')}\n`;
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
  const [, fm] = out.split(/^---[ \t]*$/m);
  const defined = acronymLines(fm).some(([, line]) => /definition:/.test(line));
  return out.split(/\r?\n---[ \t]*\r?\n/).length - 1 + (defined ? 1 : 0);
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
  const { frontMatter, slides } = splitDeck(src);
  const chapters = ranges(slides);

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
module.exports = { CHAPTERS, splitDeck, eyebrowOf, ranges, acronymLines, agendaItems, chapterFrontMatter, composeChapter, composeReadme, pageCount, chapterPath };
