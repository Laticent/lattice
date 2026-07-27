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

// The signal is one line of --fs-meta chrome; a member title can be a whole clause, so clip it
// rather than let a long step name wrap the adornment into a paragraph. Trailing sentence
// punctuation goes too — card titles are authored as "Draft the policy." and the signal reads
// "→ next: Draft the policy", not "…policy.".
const LABEL_MAX = 42;
function clip(s) {
  const t = String(s).replace(/[.:;,]+$/, '').trim();
  return t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1).trimEnd()}…` : t;
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
  // **policy hash**" signalled "→ next: policy hash". Found by the HARD RULE #25 red team.
  // `{1,3}` opening tags: markdown-it wraps a LOOSE list item's first run in a `<p>`
  // (`<li><p><strong>…`) and a table member leads `<tr><td><strong>…`.
  const strong = html.match(/^(?:<[a-zA-Z][\w-]*[^>]*>\s*){1,3}<strong>([\s\S]*?)<\/strong>/);
  if (strong) return clip(textOf(strong[1]));
  const head = html.match(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/);
  if (head) return clip(textOf(head[1]));
  // The FLAT authoring form, which is what a component's docs usually teach: `list-steps` §
  // Authoring is literally `1. First step — a sentence describing what you do here.` — one text
  // run, no `<strong>`, no nested list. Taking the whole run and clipping it at the adornment
  // budget produced "→ next: Match — accounts payable matches the invo…" on every page of a real
  // render: a truncated sentence, not wayfinding. So cut at the first CLAUSE BREAK — an em/en dash
  // between spaces, a colon, or a sentence period — which is exactly where the authored NAME ends
  // and its description begins. Falls through to the whole run when there is no break (a bare
  // label), and `clip` still bounds it.
  const lead = textOf(html.replace(/^<[a-zA-Z][\w-]*[^>]*>/, '').split(/<(?:ul|ol)\b/)[0]);
  const name = lead.split(/\s+[—–]\s+|:\s+|\.\s+/)[0];
  return clip(name || lead);
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

const marker = (body) => `<div class="lat-split-rel">${body}</div>`;

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
    if (kind === 'sequence') return last || !next ? '' : marker(`&rarr; next: ${next}`);
    if (kind === 'cycle') {
      if (!last) return next ? marker(`&rarr; next: ${next}`) : '';
      return firstLabel ? marker(`&#8635; back to ${firstLabel}`) : '';
    }
    if (kind === 'hierarchy') {
      if (!last) return next ? marker(`governs &darr; ${next}`) : '';
      return prev ? marker(`under &uarr; ${prev}`) : '';
    }
    const from = starts[k];
    const to = from + Math.max(1, ms.length) - 1;
    const range = from === to ? `Option ${from} of ${total}` : `Options ${from}&ndash;${to} of ${total}`;
    return marker(criteria.length ? `${range} &middot; comparing ${criteria.join(' &middot; ')}` : range);
  });
}

module.exports = { RELATIONSHIPS, relationshipSignals, membersIn, labelOf, criteriaOf };
