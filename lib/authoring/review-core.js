/**
 * Presentation review heuristics — pure, browser-safe, fs-free (sibling to
 * lint-core). lint-core catches authoring *footguns* (things that render wrong);
 * this catches presentation *traps* (things that render fine but communicate
 * poorly), seeded from the canon — Minto, Knaflic, Duarte, Presentation Pitfalls,
 * Presentation Zen — AND the project's own `design/editorial.md` (cadence
 * variation, speak-first / possessive stacking). Output is advisory
 * **suggestions** (severity 'suggestion'), never errors; the Architect surfaces
 * them and the scorecard aggregates them.
 *
 * Deliberately CONSERVATIVE — a false "your title is weak" is worse than a miss,
 * so heuristics only fire on clear cases. `bucketOf(componentName)` classifies a
 * slide's component (chart/evidence/…); injected so this stays catalog-free.
 */

const {
  UNIVERSAL_PROSE_BUDGETS,
  SLIDE_PROSE_BUDGET,
  elementWordCounts,
  universalProseOverages,
} = require('./prose-budgets');
const { splitTopLevel } = require('./slide-split');

const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;

// Bare label words/phrases that are a category, not a takeaway. Conservative.
const LABEL_WORDS = new Set([
  'overview', 'results', 'agenda', 'summary', 'background', 'introduction', 'intro',
  'conclusion', 'metrics', 'numbers', 'status', 'update', 'timeline', 'roadmap',
  'context', 'findings', 'data', 'analysis', 'recap', 'recommendations', 'next steps',
  'objectives', 'goals', 'the problem', 'the solution', 'approach', 'methodology',
  'methods', 'outcomes', 'impact', 'financials', 'discussion', 'our team', 'the ask',
]);
const ASK_RE = /\b(we\s+recommend|we\s+propose|we\s+ask|requesting|the\s+ask|approval|approve|sign[-\s]?off|green[-\s]?light)\b/i;

const ANCHORS_NO_TITLE_CHECK = new Set(['title', 'closing', 'divider', 'agenda', 'quote']);
// Layouts where a heading with no body is legitimate (anchors / section breaks),
// so the stub-slide check doesn't fire on them.
const HEADING_ONLY_OK = new Set(['title', 'closing', 'divider', 'agenda', 'quote', 'section']);
// Words/marks that give a hero number a referent — a baseline, a direction, a
// comparison. A number without one of these is a boast, not a claim (Duarte).
const REFERENT_RE = /\b(vs\.?|versus|from|up|down|grew|fell|rose|dropped|increased?|decreased?|than|prior|baseline|target|yoy|qoq|mom|compared|over|under|above|below|year[-\s]?over[-\s]?year)\b|[%×]|\bpp\b|\b\d+x\b/i;
// Placeholder/scaffold title text that means the author never named the deck.
const PLACEHOLDER_RE = /^(title|untitled|deck title|presentation title|your title(\s+here)?|subtitle|your subtitle(\s+here)?|tagline|lorem ipsum|tbd|todo)$/i;

function splitSlides(source) {
  return splitTopLevel(source);
}
// Chunk index of the first real slide. `split(/^---$/m)` on a deck that opens
// with a complete `---…---` front-matter block yields ["" , <yaml>, slide1, …],
// so the first two chunks are front matter; without one the first chunk IS slide
// one. A finding's `slide` is then `idx - firstSlideIndex + 1` — the HUMAN
// 1-based number matching the preview, the [slide N] markers, and the Reveal jump.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
function firstSlideIndex(source) {
  return FRONT_MATTER.test(String(source || '')) ? 2 : 0;
}
function classTokens(slide) {
  const m = slide.match(CLASS_DIRECTIVE);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}
function headingOf(slide) {
  const m = slide.match(/^##\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Conservative: a heading is a "label" (not a takeaway) only on clear cases. */
function isLabelHeading(h) {
  if (!h) return false;
  const text = h.replace(/[*`_.:]/g, '').trim().toLowerCase();
  if (!text) return false;
  if (/\d/.test(text)) return false; // a number/% reads as a takeaway/metric
  if (LABEL_WORDS.has(text)) return true; // a known label word/phrase
  return text.split(/\s+/).length === 1; // a single bare word
}

function proseWordCount(slide) {
  return slide
    .replace(CLASS_DIRECTIVE, '')
    .replace(/^##?\s.*$/gm, '') // drop headings
    .replace(/[#>*`_[\]()|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}
function topBulletCount(slide) {
  return slide.split('\n').filter((l) => /^([-*]|\d+\.)\s+\S/.test(l)).length;
}
function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}
// Does the slide carry any renderable body beyond the heading + class directive?
function hasBody(slide) {
  if (proseWordCount(slide) > 0) return true;
  if (topBulletCount(slide) > 0) return true;
  return /(^|\n)\s*(>|```|~~~|\$\$|!\[)/.test(slide); // quote / fence / math / image
}
// First two words of a heading, normalized — the cadence signature.
function headingOpening(h) {
  return String(h || '').replace(/[*`_]/g, '').trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
}
// A title slide's h1 + whether it carries a subtitle line (any non-heading,
// non-class, non-eyebrow, non-image, non-rule text). Drives `title-incomplete`.
function titleParts(slide) {
  const h1m = slide.match(/^#\s+(.+)$/m);
  const h1 = h1m ? h1m[1].trim() : null;
  const hasSubtitle = slide
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l && !/^#/.test(l) && !/^<!--/.test(l) && !/^`[^`]*`$/.test(l) && !/^!\[/.test(l) && !/^-{3,}$/.test(l));
  return { h1, hasSubtitle };
}
// One pacing definition, shared by review-core's length check and the Coach's
// Pacing chip (imported there) so the two can't drift. Pure.
function pacingVerdict(slides, minutes) {
  const perSlide = Math.round((minutes * 60) / Math.max(1, slides));
  if (perSlide < 60) return { perSlide, level: 'fast', text: `~${perSlide}s per slide — fast; cut slides or ask for more time.` };
  if (perSlide > 120) return { perSlide, level: 'leisurely', text: `~${perSlide}s per slide — leisurely. You have room, or trim filler.` };
  return { perSlide, level: 'comfortable', text: `~${perSlide}s per slide — a comfortable boardroom pace.` };
}

/**
 * Review deck source. `opts.bucketOf(name)` → bucket string|null; `opts.talkMinutes`
 * (optional). Returns findings: { slide, rule, severity:'suggestion', message, fix }.
 */
function reviewText(source, opts = {}) {
  const bucketOf = opts.bucketOf || (() => null);
  // name → density block { axis, soft, hard, note } for the layouts that declare
  // one (injected from the catalog, same shape as bucketOf). Absent = no
  // per-element word budget for that component.
  const densityOf = opts.densityOf || (() => null);
  const findings = [];
  const slides = splitSlides(source);
  const start = firstSlideIndex(source);
  let contentSlides = 0;
  let hasAsk = false;
  let hasAgenda = false;
  const headings = []; // { idx, norm, text }
  const openings = []; // { idx, open }

  slides.forEach((slide, idx) => {
    if (idx < start) return; // front matter (or the pre-fence empty chunk)
    if (!slide.trim()) return;
    const human = idx - start + 1; // human 1-based slide number (front matter excluded)
    contentSlides++;
    const tokens = classTokens(slide);
    const comp = tokens[0];
    const bucket = comp ? bucketOf(comp) : null;
    const h = headingOf(slide);
    if (ASK_RE.test(slide) || tokens.includes('decision')) hasAsk = true;
    if (comp === 'agenda' || (h && /^(agenda|contents|table of contents)$/i.test(h.trim()))) hasAgenda = true;

    // Label title (not a takeaway) — skip anchors/agenda/quote where it's fine.
    if (h && isLabelHeading(h) && !ANCHORS_NO_TITLE_CHECK.has(comp)) {
      findings.push({
        slide: human, rule: 'label-title', severity: 'suggestion', classToken: comp, line: h,
        message: `"${h}" is a label, not a takeaway — say what the slide proves`,
        fix: 'Rewrite the heading as the message itself, e.g. "Revenue grew 18%, led by APAC".',
      });
    }

    // Data slide with no "so what" headline.
    if (bucket === 'chart' || bucket === 'evidence') {
      if (!h || isLabelHeading(h)) {
        findings.push({
          slide: human, rule: 'chart-no-takeaway', severity: 'suggestion', classToken: comp,
          message: 'a data slide with no takeaway headline — state the "so what"',
          fix: 'Add an h2 that states the conclusion the data supports, not just its topic.',
        });
      }
    }

    // Wall of text / more than one idea per slide. Thresholds come from the
    // shared prose-budget table (SLIDE_PROSE_BUDGET) so every brevity number
    // lives in one place — see lib/authoring/prose-budgets.js.
    if (proseWordCount(slide) > SLIDE_PROSE_BUDGET.words || topBulletCount(slide) > SLIDE_PROSE_BUDGET.bullets) {
      findings.push({
        slide: human, rule: 'wall-of-text', severity: 'suggestion', classToken: comp,
        message: 'a dense slide — one idea per slide reads better',
        fix: 'Split it or cut to the essential point; push the detail to speaker notes.',
      });
    }

    // Over-long heading — a takeaway should land in one tight line. The 14-word
    // ceiling is the shared title budget (UNIVERSAL_PROSE_BUDGETS.title.hard),
    // so the slide-title brevity number has one home.
    if (h && !ANCHORS_NO_TITLE_CHECK.has(comp) && wordCount(h) > UNIVERSAL_PROSE_BUDGETS.title.hard) {
      findings.push({
        slide: human, rule: 'long-heading', severity: 'suggestion', classToken: comp, line: h,
        message: `a ${wordCount(h)}-word heading — a takeaway should fit one tight line`,
        fix: 'Trim to a single assertion; push qualifiers and caveats to the body.',
      });
    }

    // Per-element prose density — each card/row gets a WORD budget (manifest
    // `density`, injected via opts.densityOf), past which the element crowds or
    // overflows. The companion to the capacity COUNT rule: capacity bounds how
    // MANY elements, density bounds the WORDS inside each. Advisory suggestion.
    // See engineering/decisions/2026-06-30-prose-density-budget.md.
    const dens = comp ? densityOf(comp) : null;
    if (dens && Number.isInteger(dens.soft) && Number.isInteger(dens.hard)) {
      const counts = elementWordCounts(slide, dens.axis || 'item');
      const worst = counts.length ? Math.max(...counts) : 0;
      const tighten = dens.note ? `Tighten to ${dens.note}.` : `Trim to ~${dens.soft} words per element; push detail to speaker notes.`;
      if (worst > dens.hard) {
        findings.push({
          slide: human, rule: 'density-overflow', severity: 'suggestion', classToken: comp,
          message: `a ${comp} element runs to ${worst} words — well past the ~${dens.soft}-word target; it reads as a wall of text`,
          fix: tighten,
        });
      } else if (worst > dens.soft) {
        findings.push({
          slide: human, rule: 'density-crowd', severity: 'suggestion', classToken: comp,
          message: `a ${comp} element runs to ${worst} words — reads best at ~${dens.soft} (past that it gets heavy)`,
          fix: tighten,
        });
      }
    }

    // Universal chrome brevity — eyebrow / subtitle / key-insight past their word
    // budget (the shared prose-budget table; the slide TITLE is owned by the
    // long-heading rule above, so it's skipped here to avoid a double-fire).
    // These structures auto-detect on any slide, so they're budgeted globally.
    for (const ov of universalProseOverages(slide)) {
      if (ov.kind === 'title') continue;
      const rule = ov.kind === 'keyInsight' ? 'verbose-key-insight' : `verbose-${ov.kind}`;
      const article = /^[aeiou]/i.test(ov.budget.label) ? 'an' : 'a';
      findings.push({
        slide: human, rule, severity: 'suggestion', classToken: comp, line: ov.line,
        message: `${article} ${ov.budget.label} of ${ov.words} words — ${ov.budget.note}`,
        fix: `Tighten the ${ov.budget.label} to ~${ov.budget.soft} words.`,
      });
    }

    // Stub slide — a heading with no body on a layout that needs content.
    if (h && comp && !HEADING_ONLY_OK.has(comp) && !hasBody(slide)) {
      findings.push({
        slide: human, rule: 'stub-slide', severity: 'suggestion', classToken: comp,
        message: 'a heading with no body — the slide is a stub',
        fix: 'Add the supporting content, or use a divider/section break if a bare heading is the intent.',
      });
    }

    // Hero number with no referent — a number needs a comparison to mean anything.
    if (comp === 'big-number' && !REFERENT_RE.test(slide)) {
      findings.push({
        slide: human, rule: 'metric-no-referent', severity: 'suggestion', classToken: comp,
        message: 'a hero number with no referent — a number alone is a boast, not a claim',
        fix: 'Add the baseline, direction, or target (e.g. "up from 61%", "vs the 3-week goal").',
      });
    }

    // Image with empty alt text — invisible to screen readers and search.
    if (/!\[\s*\]\(/.test(slide)) {
      findings.push({
        slide: human, rule: 'image-no-alt', severity: 'suggestion', classToken: comp,
        message: 'an image with no alt text — invisible to screen readers',
        fix: 'Describe the image in the brackets: `![what it shows](path)`.',
      });
    }

    // Possessive stacking (editorial.md speak-first) — unreadable aloud.
    const possLine = slide.split('\n').find(
      (l) => !/^\s*(##?\s|<!--)/.test(l) && /\b\w+['’]s\s+\w+['’]s\b/.test(l),
    );
    if (possLine) {
      findings.push({
        slide: human, rule: 'possessive-stacking', severity: 'suggestion', classToken: comp, line: possLine.trim(),
        message: 'stacked possessives ("the system’s policy’s …") — it stumbles read aloud',
        fix: 'One possessive at a time; restructure (e.g. "the system enforces policy through …").',
      });
    }

    // Title slide left as placeholder text, or missing its subtitle.
    if (comp === 'title') {
      const { h1, hasSubtitle } = titleParts(slide);
      if (h1 && PLACEHOLDER_RE.test(h1.replace(/[*`_]/g, '').trim())) {
        findings.push({
          slide: human, rule: 'title-incomplete', severity: 'suggestion', classToken: comp, line: h1,
          message: `the title is still placeholder text ("${h1}") — name the deck`,
          fix: 'Replace it with the deck’s real title — what this presentation is about.',
        });
      } else if (h1 && !hasSubtitle) {
        findings.push({
          slide: human, rule: 'title-incomplete', severity: 'suggestion', classToken: comp,
          message: 'the title slide has no subtitle — one line of framing orients the room',
          fix: 'Add a plain subtitle paragraph under the h1 (and a backtick `eyebrow` above it).',
        });
      }
    }

    if (h) {
      headings.push({ slide: human, norm: h.replace(/[*`_]/g, '').trim().toLowerCase(), text: h });
      openings.push({ slide: human, open: headingOpening(h) });
    }
  });

  // Duplicate headings across slides — usually a stray paste or a split to merge.
  const seenHeading = new Map();
  for (const e of headings) {
    if (!e.norm) continue;
    if (seenHeading.has(e.norm)) {
      findings.push({
        slide: e.slide, rule: 'duplicate-heading', severity: 'suggestion', line: e.text,
        message: `"${e.text}" repeats an earlier slide's heading`,
        fix: 'Give each slide a distinct takeaway, or merge the duplicate slides.',
      });
    } else {
      seenHeading.set(e.norm, e.slide);
    }
  }

  // Monotone cadence (editorial.md) — many headings opening the same way drone.
  const byOpen = new Map();
  for (const e of openings) {
    if (!e.open) continue;
    if (!byOpen.has(e.open)) byOpen.set(e.open, []);
    byOpen.get(e.open).push(e.slide);
  }
  for (const [open, idxs] of byOpen) {
    if (idxs.length >= 3) {
      findings.push({
        slide: idxs[0], rule: 'monotone-openings', severity: 'suggestion',
        message: `${idxs.length} headings open "${open}…" — vary the cadence`,
        fix: 'Vary the opening and verb across slides; identical H2 openings read as a drone.',
      });
    }
  }

  // No clear ask (non-trivial decks only).
  if (contentSlides >= 4 && !hasAsk) {
    findings.push({
      slide: 0, rule: 'no-ask', severity: 'suggestion',
      message: 'no clear ask or recommendation — what should the audience do?',
      fix: 'Add a `decision` slide or a plain "we recommend…" line near the close.',
    });
  }

  // No agenda on a long deck — the audience loses the thread.
  if (contentSlides >= 10 && !hasAgenda) {
    findings.push({
      slide: 0, rule: 'agenda-missing', severity: 'suggestion',
      message: `${contentSlides} slides with no agenda — a long deck needs a roadmap`,
      fix: 'Add an `agenda` slide near the top so the audience can track where they are.',
    });
  }

  // Length vs. time (only when a talk length is known).
  if (opts.talkMinutes && contentSlides > opts.talkMinutes) {
    findings.push({
      slide: 0, rule: 'length-vs-time', severity: 'suggestion',
      message: `${contentSlides} slides for ~${opts.talkMinutes} min — under a minute each; consider cutting`,
      fix: 'Aim for ~1–2 minutes per slide (Kawasaki 10/20/30).',
    });
  }

  return findings;
}

// ── The rubric as DATA ───────────────────────────────────────────────────────
// reviewText emits instance-specific `message`/`fix` at runtime; RUBRIC is the
// GENERIC teaching form of each trap — one line an author (or the deck generator's
// DECK_CANON) can learn from. Single-sourced here so the surfaces that TEACH the
// rules (deck-canon.js fed to Fabricate, design/skills/speaker-notes.md §4) never
// drift from the surface that CHECKS them. A test (review-core.test.js) asserts every
// literal `rule:` id reviewText can emit has an entry here (the `verbose-*` budget
// family is one collective entry, since those ids are generated per chrome slot).
const RUBRIC = Object.freeze([
  { id: 'label-title', trap: 'a heading that is a category label, not the takeaway', fix: 'make the heading the message itself — "Revenue grew 18%, led by APAC"' },
  { id: 'title-incomplete', trap: 'a title slide with placeholder text, or no subtitle to orient the room', fix: 'name the deck, and add one plain line of framing under the h1' },
  { id: 'chart-no-takeaway', trap: 'a data slide whose heading names the topic, not the "so what"', fix: 'put the conclusion the data supports in the h2, not just its subject' },
  { id: 'metric-no-referent', trap: 'a hero number with nothing to compare it to', fix: 'add a baseline, direction, or target — a bare number is a boast, not a claim' },
  { id: 'wall-of-text', trap: 'a slide dense enough that it holds more than one idea', fix: 'split it, or cut to the essential point and push detail to speaker notes' },
  { id: 'density-overflow', trap: 'an element run well past its word budget', fix: 'tighten hard to the essential point' },
  { id: 'density-crowd', trap: 'an element crowding its word budget', fix: 'trim toward the soft target so it reads light' },
  { id: 'long-heading', trap: 'a heading too long to land on one tight line', fix: 'trim to a single assertion; qualifiers and caveats go in the body' },
  { id: 'possessive-stacking', trap: 'stacked possessives ("the system’s policy’s…") that stumble read aloud', fix: 'one possessive at a time; restructure the phrase to speak cleanly' },
  { id: 'monotone-openings', trap: 'three or more headings opening the same way', fix: 'vary the opening and verb — identical openings read as a drone' },
  { id: 'duplicate-heading', trap: 'two slides making the same claim', fix: 'give each a distinct takeaway, or merge the duplicate slides' },
  { id: 'stub-slide', trap: 'a heading with no body — a placeholder shipped as content', fix: 'fill it with the supporting content, or make it a deliberate divider' },
  { id: 'image-no-alt', trap: 'an image that carries meaning but has no alt text', fix: 'describe what it shows in the brackets so screen readers reach it' },
  { id: 'no-ask', trap: 'a deck that never states what it wants from the room', fix: 'add a decision slide or a plain "we recommend…" line near the close' },
  { id: 'agenda-missing', trap: 'a long deck with no roadmap the audience can track', fix: 'add an agenda slide near the top' },
  { id: 'length-vs-time', trap: 'more slides than the talk time supports', fix: 'aim for ~1–2 minutes per slide; cut the rest' },
  { id: 'verbose-*', trap: 'a chrome slot (eyebrow, subtitle, key-insight) over its word budget', fix: 'tighten the slot toward its soft budget — chrome frames the slide, it doesn’t carry it' },
]);

module.exports = { reviewText, isLabelHeading, ASK_RE, pacingVerdict, RUBRIC };
