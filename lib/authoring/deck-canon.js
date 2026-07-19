/**
 * DECK_CANON — the authoring guidance fed to the DECK generator (runArchitect /
 * chatComplete / requestSlideFix in docs/src/components/studio/architect.ts). It is
 * the deck-path sibling of lib/layout's COMPONENT_CANON: the deck path shipped with
 * only a ~350-char system prompt and NO authoring canon, so the generator had nothing
 * teaching it what a boardroom deck actually is. This grounds it.
 *
 * Sourcing = "prose + generated fact-bits" (Option 1,
 * engineering/decisions/2026-07-19-skills-fabricate-authoring-truth.md): the PROSE is
 * hand-written (the persuasive teaching voice), but the FALSIFIABLE bits — the review
 * rubric's traps (review-core.RUBRIC) and the word budgets (prose-budgets) — are pulled
 * from source so they can't drift from what the reviewer actually flags on the output.
 *
 * Pure, browser-safe, fs-free; bundled into authoring-core.generated.js for the browser
 * (tools/build-authoring-core.js), which architect.ts imports.
 */

const { RUBRIC } = require('./review-core.js');
const { UNIVERSAL_PROSE_BUDGETS, SLIDE_PROSE_BUDGET } = require('./prose-budgets.js');

const b = UNIVERSAL_PROSE_BUDGETS;

/** Assemble the canon string from the hand-written prose + the source-derived facts. */
function buildDeckCanon() {
  const traps = RUBRIC.map((r) => `  - ${r.trap} → ${r.fix}`).join('\n');
  return [
    'HOW A BOARDROOM DECK WORKS (so your edits read as an argument, not a file dump):',
    '• ONE idea per slide. Every "## " heading is a COMPLETE DECLARATIVE SENTENCE that IS the ' +
      'slide\'s claim — never a label ("Q2 Results"), never a question. The body then DELIVERS the ' +
      'claim (the mechanism, the number); it never just restates the heading.',
    '• NARRATIVE ARC: a title that states the stakes -> sections that build the argument -> a ' +
      'closing that names ONE ask. Read top to bottom, the headings alone should BE the argument.',
    '• RHYTHM: interleave a prose claim, an evidence beat (a number / chart), a human beat (a ' +
      'quote), a decision beat. Never run three prose slides in a row.',
    `• RESTRAINT: aim ~${SLIDE_PROSE_BUDGET.words} words of body and <= ${SLIDE_PROSE_BUDGET.bullets} bullets per slide. ` +
      `Chrome soft budgets: title <= ${b.title.soft} words, eyebrow <= ${b.eyebrow.soft}, subtitle <= ${b.subtitle.soft}, ` +
      `key-insight <= ${b.keyInsight.soft}. When content overflows, SPLIT the slide — never shrink the font.`,
    '• RIGHT COMPONENT per slide, chosen by INTENT then CAPACITY: match the intent to a component ' +
      'in the catalog, then COUNT the content against that component\'s capacity — if it exceeds the ' +
      'hard budget, use the escalateTo target or split across slides. Pick from the catalog, never memory.',
    '• CARD-style layouts nest "- Title" then a two-space-indented "  - body" — never an inline ' +
      '"- **Title.** body".',
    '• BOOKENDS are stereotyped: the title slide puts "# h1" FIRST, then a backtick `eyebrow`, then a ' +
      'one-sentence subtitle; both the title and the closing carry `silent`. The closing is ONE ' +
      'sentence plus a signature — never a bulleted "next steps" list.',
    'TRAPS TO AVOID (each is exactly what the deck reviewer flags — self-avoid them up front):',
    traps,
  ].join('\n');
}

/**
 * A SHORT canon for the on-device tier. A small local model (the prompt-api /
 * WebLLM / transformers backends) degrades under a ~900-token system prompt — it
 * loses the thread — so it gets the load-bearing rules only: the claim-heading
 * discipline, the arc, the sourced restraint budgets, component-by-capacity, card
 * nesting, and the bookend shape. The full trap enumeration and the rhythm detail
 * are dropped (a tiny model can't juggle them anyway). The falsifiable budgets are
 * still sourced from prose-budgets, so this stays true to the reviewer too.
 */
function buildDeckCanonShort() {
  return [
    'HOW A BOARDROOM DECK WORKS (keep edits an argument, not a file dump):',
    '• ONE idea per slide. Every "## " heading is a COMPLETE DECLARATIVE SENTENCE that IS the ' +
      'claim — never a label ("Q2 Results"), never a question. The body DELIVERS the claim; it ' +
      'never just restates the heading.',
    '• ARC: a title that states the stakes -> sections that build the argument -> a closing that ' +
      'names ONE ask. The headings alone should read as the argument.',
    `• RESTRAINT: aim ~${SLIDE_PROSE_BUDGET.words} words of body and <= ${SLIDE_PROSE_BUDGET.bullets} bullets per slide ` +
      `(title <= ${b.title.soft} words). When content overflows, SPLIT the slide — never shrink the font.`,
    '• RIGHT COMPONENT by INTENT then CAPACITY: match the intent to a catalog component, count the ' +
      'content against its capacity, and split or escalate if it exceeds the budget. Pick from the ' +
      'catalog, never memory.',
    '• CARD-style layouts nest "- Title" then a two-space-indented "  - body" — never an inline ' +
      '"- **Title.** body".',
    '• BOOKENDS: the title slide is "# h1" then a backtick `eyebrow` then a one-sentence subtitle; ' +
      'the closing is ONE sentence plus a signature (never a bulleted next-steps list); both carry `silent`.',
  ].join('\n');
}

const DECK_CANON = buildDeckCanon();
const DECK_CANON_SHORT = buildDeckCanonShort();

module.exports = { DECK_CANON, DECK_CANON_SHORT, buildDeckCanon, buildDeckCanonShort };
