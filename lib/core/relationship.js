/**
 * relationship.js — the cross-slide RELATIONSHIP SIGNAL
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §0b and §8 rule 12a).
 *
 * §0b's granularity ruling atomizes a CONNECTED member — a step, a cycle stage, an authority
 * tier, a priced or scored option — to one per slide, because packing them produced the
 * "jarring uneven slides" the owner rejected. But atomizing a sequence is exactly what
 * destroys it: four steps on four slides read as four unrelated slides. So each page of the
 * run carries a small wayfinding adornment naming WHAT THE RELATIONSHIP IS (the progress rail
 * already says *where* you are, k of N):
 *
 *   · sequence    → "→ next: {next step}"
 *   · cycle       → "→ next: …" through the run, then "↻ back to {stage 1}" on the LAST page
 *   · hierarchy   → "governs ↓ {next tier}", and "under ↑ {previous tier}" on the last
 *   · comparison  → "Option N of M · comparing {shared criteria}"
 *
 * The adornment is DERIVED FROM THE NEIGHBOR MEMBER at build time and never authored (rule
 * 12a) — that is the whole point, and the reason the rule demands a test proving that editing
 * member N+1 changes member N's emitted signal. An authored "next: …" line is a second copy
 * of the next step's title, and the second copy is the one that goes stale.
 *
 * A component opts in by declaring `capacity.relationship` in its manifest; the kernel refuses
 * an unknown kind rather than guessing one from the component name (§8 rule 5 — the derived
 * fact is recorded in the standing oracle, so a drift fails CI).
 *
 * Pure & fs-free. Operates on the RENDERED member HTML the split already cut, so it cannot
 * disagree with what the pages actually hold.
 */

const { directChildren } = require('./collections');

/** The four relationship kinds §0b enumerates. A manifest declaring anything else is a defect. */
const RELATIONSHIPS = Object.freeze(['sequence', 'cycle', 'hierarchy', 'comparison']);

const textOf = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// The signal is one line of --fs-meta chrome, so a member title has a length budget. Trailing
// sentence punctuation goes: card titles are authored as "Draft the policy." and the signal reads
// "→ next: Draft the policy", not "…policy.".
//
// IT NO LONGER TRUNCATES, because nothing reaches it that could be truncated. This used to end
// `t.length > LABEL_MAX ? clip to LABEL_MAX-1 + '…' : t`, and that branch was UNREACHABLE: both
// call sites bound the length THEMSELVES and DECLINE rather than clip, because a truncated
// fragment ("→ next: A page carries one structural elem…") reads as a rendering bug rather than
// wayfinding. Measured by making the branch throw: 34 unit tests and five real deck renders —
// including the two decks whose whole subject is this signal — never entered it. The call is a
// no-op at both sites for the same reason (each passes a string it has already stripped).
//
// So a function that says it clips, called by two sites that say they never clip, was a
// contradiction a reader had to resolve before touching anything nearby — and the "clip can slice
// through an HTML entity" hazard it carried was a hazard in code that cannot run. `LABEL_MAX` is
// still the budget; it is enforced where the decision to decline is made, which is where it is
// visible.
/**
 * Where an authored NAME ends and its description begins — an em/en dash between spaces, a
 * colon, or a SENTENCE period.
 *
 * ONE definition, because there were two and they drifted into the same bug twice over. The
 * sentence-period arm was `\.\s+`, which fires on an ABBREVIATION: "FTC v. Avast" printed as
 * "next: FTC v" — a truncated, mis-spelled party name shown as wayfinding — and the same would
 * happen to "Inc.", "No.", "Art." or a middle initial. Three reviewers found it independently on
 * three different decks; none of the 34 unit tests did, because none carried an abbreviation.
 *
 * The discriminator is the token BEFORE the period, not the one after it. Looking AFTER cannot
 * work: "FTC v. Avast" and "Draft the policy. Then circulate" both put a capitalised word there.
 * What separates them is that a sentence ends on a WORD and an abbreviation ends on a stub — "v",
 * "Inc", "No", "Art", "Dr", a middle initial. So the period must follow at least three lower-case
 * letters to count as a sentence end.
 *
 * A heuristic, and its edges are worth stating: a two-letter word ("go.", "be.") will not break,
 * and a long abbreviation would. Both fail toward KEEPING the whole name, which the length budget
 * then judges — the opposite direction from printing half of one, which is what shipped.
 */
const CLAUSE_BREAK = /\s+[—–]\s+|:\s+|(?<=[a-z]{3})\.\s+/;

const LABEL_MAX = 42;
function trimTail(s) {
  return String(s).replace(/[.:;,]+$/, '').trim();
}

/**
 * A member's own title. Card-shaped members lead with `<strong>` (the nested `- Title` /
 * `  - body` contract, HARD RULE #5); a component that renders a real subheading uses
 * `<h3>`+; anything else falls back to the member's leading text before its nested list.
 */
function labelOf(memberOuter) {
  const html = String(memberOuter || '');
  // LEADING `<strong>` only — the card contract puts the title first (`- **Build in region.**`),
  // so anchor the match to the member's opening tag. Matching a `<strong>` ANYWHERE let a bolded
  // phrase buried in the body become the label: a member reading "Sign off — the chair signs the
  // **policy hash**" signaled "→ next: policy hash". Found by the HARD RULE #25 red team.
  // `{1,3}` opening tags: markdown-it wraps a LOOSE list item's first run in a `<p>`
  // (`<li><p><strong>…`) and a table member leads `<tr><td><strong>…`.
  //
  // EVERY path declines the same way, and the guard has to be here rather than only on the flat
  // run below. `<strong>` was read as "the author named this, so it is short" — but a component
  // TRANSFORM can wrap a member's whole text in `<strong>`, and `list-criteria` does exactly
  // that. So the named path clipped full sentences: the shipped `examples/split-structure.pdf`
  // carried "next: A heading that says which run it belongs…" and "next: A way back to the whole
  // — the k-of-N rail…", which are character-for-character the shape the decision record claims
  // was removed. Found by the HARD RULE #25 independent checker, against the committed artifact.
  // CUT AT THE CLAUSE BREAK FIRST, then decline if what is left is still not a name. This is the
  // same two-step the flat path below already does, and applying it here is what keeps the fix
  // from trading truncated labels for no labels at all: "A way back to the whole — the k-of-N
  // rail in the footer band" is 59 characters and becomes "A way back to the whole", while
  // "A heading that says which run it belongs to" is a genuine 42-character name and survives
  // whole. Only a run with no break AND no end in sight declines to the un-labeled pointer.
  const named = (text) => {
    const t = textOf(text).trim();
    const head = t.split(CLAUSE_BREAK)[0].replace(/[.:;,]+$/, '').trim();
    return head && head.length <= LABEL_MAX ? trimTail(head) : '';
  };
  //
  // A FIGURE IS NOT A NAME. `stats` and `kpi` lead their member with the VALUE — `<strong>119%
  // </strong>` above a nested "Net revenue retention" — so taking the leading `<strong>` pointed a
  // whole run at its own numbers: "next: $0.9M" on every page, and a cover reading "$48.2M →".
  // The reader is told which figure comes next, never which metric. Measured on
  // `examples/adaptive-sizing.pdf`.
  //
  // So when the lead is a bare VALUE TOKEN — carries a digit and no space, which is what a
  // figure looks like and what a name does not — the member's following text is preferred if it
  // yields one. That also settles the "next: 31" case the record already carries: a bullet led by
  // a bolded count falls through to its own sentence, which has no clause break and is too long,
  // so it declines to the un-labeled pointer rather than naming a number.
  // A figure with NOTHING after it keeps the figure — a roadmap horizon authored as `2026` alone
  // still points at 2026, because there the numeral IS the name.
  const isFigure = (t) => /\d/.test(t) && !/\s/.test(t.trim());
  // THE CAROUSEL'S OWN TITLE SLOT, checked first because it is the most explicit signal there
  // is: `coverWindow` (lib/core/carousel.js) re-authors each member as
  // `<span class="split-pt-t">title</span><span class="split-pt-b">body</span>`, so the title is
  // not inferred from shape — it is labelled.
  //
  // Without this every re-authored run declined to the un-labelled pointer. The member carries no
  // `<strong>` and no `<h3>`, so the flat path took the whole run ("Recency Time-decay against a
  // configurable half-life."), found no clause break, ran past the 42-character budget and
  // returned ''. Measured on a `list-tabular` split: every page read "→ continues" while the page
  // it pointed at was plainly named "Recency". That is the §0b failure the signal exists to
  // prevent — atomised members with no adornment joining them — reintroduced on the five
  // strategies that re-author their body.
  const slotTitle = html.match(/<span class="split-pt-t">([\s\S]*?)<\/span>/);
  if (slotTitle) return named(slotTitle[1]);
  const strong = html.match(/^(?:<[a-zA-Z][\w-]*[^>]*>\s*){1,3}<strong>([\s\S]*?)<\/strong>/);
  if (strong) {
    const lead = textOf(strong[1]).trim();
    if (!isFigure(lead)) return named(strong[1]);
    // The member's own following text — its nested list's first item (the `stats`/`kpi` shape,
    // where the metric name sits under the figure), else whatever runs on after the `</strong>`
    // (a bullet led by a bolded count). Both go through `named`, so a run that is a sentence
    // rather than a name still declines instead of printing a fragment.
    const nested = html.match(/<(?:ul|ol)\b[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>/);
    const after = html.split(/<\/strong>/)[1] || '';
    const source = nested ? nested[1] : after.split(/<(?:ul|ol)\b/)[0];
    const follow = named(source);
    // A figure with following text that yields no NAME declines rather than falling back to the
    // figure: "31 keep whole and ring on overflow…" points at nothing useful either way, and
    // "continues" at least does not claim a number is the next page's subject. A figure with
    // NOTHING after it keeps the figure, because there the numeral is all the author wrote.
    if (follow) return follow;
    return textOf(source).trim() ? '' : named(strong[1]);
  }
  const head = html.match(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/);
  if (head) return named(head[1]);
  // The FLAT authoring form, which is what a component's docs usually teach: `list-steps` §
  // Authoring is literally `1. First step — a sentence describing what you do here.` — one text
  // run, no `<strong>`, no nested list. Taking the whole run and clipping it at the adornment
  // budget produced "→ next: Match — accounts payable matches the invo…" on every page of a real
  // render: a truncated sentence, not wayfinding. So cut at the first CLAUSE BREAK — an em/en dash
  // between spaces, a colon, or a sentence period — which is exactly where the authored NAME ends
  // and its description begins. Falls through to the whole run when there is no break (a bare
  // label), and `clip` still bounds it.
  const lead = textOf(html.replace(/^<[a-zA-Z][\w-]*[^>]*>/, '').split(/<(?:ul|ol)\b/)[0]);
  const name = lead.split(CLAUSE_BREAK)[0];
  const flat = (name || lead).replace(/[.:;,]+$/, '').trim();
  // A member with no `<strong>`, no subheading and no clause break has no NAME to point at —
  // only a sentence. Clipping one produces a truncated fragment ("→ next: A page carries one
  // structural element; no…"), which reads as a rendering bug rather than wayfinding, and it
  // is the same failure the clause-break split above exists to prevent — it just cannot fire
  // when there is no break to find. So say nothing rather than something broken: '' degrades
  // to the caller's un-labeled pointer, which still points.
  //
  // This became reachable when the carousel went universal (2026-09-01). Before that, the
  // signal ran only on four components whose members are all card-shaped or named, so every
  // member had a real label and the flat-run path effectively never truncated.
  if (flat.length > LABEL_MAX) return '';
  return trimTail(flat);
}

/**
 * The SHARED CRITERIA a comparison is scored on — the badge labels a verdict/pricing member
 * carries (`<span class="badge …">`, markdown-it's `verdictGridBadges`). Read from the FIRST
 * member because §0c's contract is that every option carries the same criteria in the same
 * order; reading them per page would let a drifting card silently rewrite the signal.
 */
function criteriaOf(memberOuter) {
  return [...String(memberOuter || '').matchAll(/<span class="badge[^"]*">([\s\S]*?)<\/span>/g)]
    .map((m) => textOf(m[1]))
    .filter(Boolean);
}

/**
 * The MEMBERS a page holds, as outer HTML, on the split axis. Reads the same primary
 * collection the partition cut (`ul`/`ol` → its `li` children, `table` → its `tr` rows), so
 * the signal describes the members that are really on the page.
 */
function membersIn(pageInner, axis) {
  const html = String(pageInner || '');
  if (axis === 'row') {
    const at = html.search(/<tbody\b/);
    // No `<tbody>` (a hand-written table in raw HTML — markdown-it always emits one): scan from
    // after `</thead>` instead of from 0, or the HEADER row counts as a member and the signal
    // says "Option 1 of 4" for a three-option table. The `<th>`s are the criteria, never a member.
    const headEnd = html.search(/<\/thead\s*>/i);
    const from = at >= 0
      ? html.indexOf('>', at) + 1
      : (headEnd >= 0 ? html.indexOf('>', headEnd) + 1 : 0);
    const region = html.slice(from);
    return directChildren(region, 'tr').map((s) => region.slice(s.start, s.end));
  }
  const ulAt = html.indexOf('<ul');
  const olAt = html.indexOf('<ol');
  let at = -1;
  let tag = '';
  if (ulAt >= 0 && (olAt < 0 || ulAt < olAt)) { at = ulAt; tag = 'ul'; }
  else if (olAt >= 0) { at = olAt; tag = 'ol'; }
  if (at < 0) return [];
  const [span] = directChildren(html.slice(at), tag);
  if (!span) return [];
  const open = html.indexOf('>', at) + 1;
  const region = html.slice(open, at + span.end - `</${tag}>`.length);
  return directChildren(region, 'li').map((s) => region.slice(s.start, s.end));
}

// The signal's MARK is drawn, not typed (HARD RULE #29). `mark` names a shape and the CSS
// paints it with a mask token (`--shape-arrow-right` / `-down` / `-up` / `--shape-refresh`);
// the text beside it carries no glyph at all.
//
// These used to be HTML entities — `&rarr;`, `&#8635;`, `&darr;`, `&uarr;` — written straight
// into the rendered DOM. #29 exists because the deck's own type family carries almost none of
// those characters, so each one fell back to whatever face the rendering machine had, and one
// deck rendered three ways across the three surfaces it reaches. The #29 gate did not catch
// them: `checkTypedGlyphs` matches literal CHARACTERS, and an entity is not one until the
// parser has run.
const marker = (body, mark) => `<div class="lat-split-rel" data-mark="${mark}">${body}</div>`;

/**
 * The signal for every body page of a run — one HTML string per page, `''` where that kind
 * has nothing to say there (a sequence's last page has no next step).
 *
 * `pageMembers` is the per-page member list (`membersIn` over each page inner). Taking the
 * whole matrix rather than one page at a time is what makes the signal derived: page k's
 * signal reads page k+1's first member, so it CANNOT be produced without its neighbor, and
 * editing that neighbor necessarily changes it.
 *
 * Returns null for an unknown kind (the caller then emits no signal at all — never a guess).
 */
function relationshipSignals(kind, pageMembers) {
  if (!RELATIONSHIPS.includes(kind)) return null;
  const pages = Array.isArray(pageMembers) ? pageMembers.map((ms) => (Array.isArray(ms) ? ms : [])) : [];
  if (pages.length < 2) return null;
  const total = pages.reduce((a, ms) => a + ms.length, 0);
  // No members resolved on ANY page — the axis the caller passed found no collection here. Say
  // nothing rather than guess: the comparison branch below floors its range at one member, so an
  // empty matrix would have printed the human-visible nonsense "Option 1 of 0" on every page.
  // (HARD RULE #25 checker.) The three narrative kinds already degrade to '' via empty labels;
  // this makes the degradation uniform and explicit.
  if (total === 0) return pages.map(() => '');
  const lead = pages[0][0] || '';
  const firstLabel = labelOf(lead);
  const criteria = criteriaOf(lead).slice(0, 3);
  // 1-based index of each page's FIRST member, so "Option N of M" counts members, not pages —
  // correct even if a comparison ever paces more than one option to a page.
  const starts = [];
  let acc = 0;
  for (const ms of pages) { starts.push(acc + 1); acc += ms.length; }

  return pages.map((ms, k) => {
    const last = k === pages.length - 1;
    const next = labelOf(pages[k + 1]?.[0] || '');
    const prev = labelOf(pages[k - 1]?.at(-1) || '');
    // A next page always gets a pointer; the LABEL is what may be missing (an unnamed member —
    // see `labelOf`). "→ continues" is the honest un-labeled form: it still tells the reader the
    // run has not ended, which is the signal's whole job, without naming something it cannot name.
    if (kind === 'sequence') return last ? '' : marker(next ? `next: ${next}` : 'continues', 'next');
    if (kind === 'cycle') {
      if (!last) return next ? marker(`next: ${next}`, 'next') : '';
      return firstLabel ? marker(`back to ${firstLabel}`, 'loop') : '';
    }
    if (kind === 'hierarchy') {
      if (!last) return next ? marker(`governs ${next}`, 'down') : '';
      return prev ? marker(`under ${prev}`, 'up') : '';
    }
    const from = starts[k];
    const to = from + Math.max(1, ms.length) - 1;
    const range = from === to ? `Option ${from} of ${total}` : `Options ${from}&ndash;${to} of ${total}`;
    return marker(criteria.length ? `${range} &middot; comparing ${criteria.join(' &middot; ')}` : range, 'count');
  });
}

module.exports = { RELATIONSHIPS, relationshipSignals, membersIn, labelOf, criteriaOf };
