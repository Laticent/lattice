// The Drawing Board — the presentation canon, as a distilled principle pack.
//
// The deterministic review DETECTS problems (a label title, a wall of text, no
// ask); this pack carries the QUALITATIVE judgement behind why they matter and how
// the field's canon says to fix them — Minto, Duarte, Knaflic, Reynolds, and the
// common-pitfalls literature. It's our own terse synthesis of public *frameworks*
// (ideas, not anyone's copyrighted prose), with attribution, so it's small,
// cache-friendly, and clean to ship. See
// engineering/decisions/2026-06-13-coach-canon-knowledge-pack.md.
//
// Two consumers, both cloud-tier only (a tiny WASM model drowns in extra context):
//   - Converse (drawing-board-chat.js) injects the cards matching THIS deck's
//     findings into the rich prompt, so the model's advice is canon-grounded.
//   - The per-finding Fix (architect-fix.js) injects the one card for that finding,
//     so a rewrite follows the principle, not the model's generic instinct.
// Pure + dependency-free → headless-testable.

// Each card: a principle, its source, the smell that betrays it, and the fix —
// each one line. `rules` are the deterministic finding rules it speaks to (the
// retrieval key; see lib/authoring/review-core.js); `core` cards form the
// always-on arc set used for deck-level grounding when no specific rule matches.
export const CANON = [
	{
		id: 'answer-first',
		principle: 'Lead with the answer, then support it (SCQA: Situation → Complication → Question → Answer).',
		source: 'Minto, The Pyramid Principle',
		smell: 'the recommendation arrives last, or never',
		fix: 'State the ask up front; the audience should know your conclusion by the second slide.',
		rules: ['no-ask', 'agenda-missing'],
		core: true,
	},
	{
		id: 'one-idea',
		principle: 'One idea per slide — if you can’t title it in a single line, it’s two slides.',
		source: 'Reynolds, Presentation Zen; Duarte',
		smell: 'a slide carrying three arguments at once',
		fix: 'Split it to one message; push the supporting detail to speaker notes.',
		rules: ['wall-of-text', 'stub-slide'],
		core: true,
	},
	{
		id: 'takeaway-titles',
		principle: 'Make the title the takeaway, not the topic — the slide then proves its headline.',
		source: 'Knaflic, Storytelling with Data',
		smell: 'a label title like “Q3 Revenue” instead of the point it makes',
		fix: 'Rewrite the title as the conclusion: “Q3 revenue grew 18%, ahead of plan.”',
		rules: ['label-title', 'long-heading'],
		core: true,
	},
	{
		id: 'chart-so-what',
		principle: 'Every chart earns its “so what” — highlight the one point it makes.',
		source: 'Knaflic, Storytelling with Data',
		smell: 'an unannotated chart the audience must decode themselves',
		fix: 'Annotate the takeaway and mute everything else; lead the eye to the signal.',
		rules: ['chart-no-takeaway'],
	},
	{
		id: 'number-referent',
		principle: 'Anchor every number to a referent so the audience knows if it’s good.',
		source: 'Knaflic; Duarte',
		smell: 'a hero metric with no baseline (target, prior period, benchmark)',
		fix: 'Pair the number with its comparison — vs. plan, vs. last year, vs. the market.',
		rules: ['metric-no-referent'],
	},
	{
		id: 'through-line',
		principle: 'Give the deck an arc: contrast what-is with what-could-be, build to a call to action.',
		source: 'Duarte, Resonate',
		smell: 'a flat run of status updates with no tension or turn',
		fix: 'Open with the gap, build the case, end on the change you’re asking for.',
		rules: ['monotone-openings'],
		core: true,
	},
	{
		id: 'vary-cadence',
		principle: 'Vary the cadence — a big statement, then evidence, then a turn.',
		source: 'Duarte, Resonate',
		smell: 'every slide opens the same way (same heading shape, same rhythm)',
		fix: 'Alternate the beat; repetition of form flattens attention.',
		rules: ['monotone-openings', 'duplicate-heading'],
	},
	{
		id: 'dont-read',
		principle: 'Slides support the speaker; they don’t replace them.',
		source: 'common-pitfalls literature; Reynolds',
		smell: 'full sentences on the slide that the presenter will read aloud',
		fix: 'Keep keywords and visuals on screen; the prose belongs in your mouth and the notes.',
		rules: ['wall-of-text'],
	},
	{
		id: 'signpost',
		principle: 'Signpost the structure so the audience always knows where they are.',
		source: 'Minto, The Pyramid Principle',
		smell: 'no roadmap or section turns; the argument’s shape is hidden',
		fix: 'Open with the shape of the argument and mark the turns between sections.',
		rules: ['agenda-missing'],
	},
	{
		id: 'explicit-ask',
		principle: 'End on one explicit ask: the decision you need and the next step.',
		source: 'Minto; common-pitfalls literature',
		smell: 'the deck stops without a clear recommendation or decision',
		fix: 'Add a closing slide that names the single decision and what happens next.',
		rules: ['no-ask'],
		core: true,
	},
	{
		id: 'rehearse-to-time',
		principle: 'Budget the clock — roughly one to two minutes a slide — and cut to fit.',
		source: 'Reynolds; common-pitfalls literature',
		smell: 'more slides than the time allows',
		fix: 'Trim to the time you have rather than talking faster to survive it.',
		rules: ['length-vs-time'],
	},
];

const byId = new Map(CANON.map((c) => [c.id, c]));
const CORE = CANON.filter((c) => c.core);

// The single most relevant card for one finding (the Fix prompt's grounding), or
// null when no rule maps — keeps the per-finding context to exactly what helps.
export function canonForFinding(finding) {
	if (!finding) return null;
	return CANON.find((c) => c.rules.includes(finding.rule)) || null;
}

// Render selected cards as a terse, model-facing block: principle · smell → fix,
// attributed. One line per card so the whole pack stays in the low hundreds of
// tokens even when several fire.
function render(cards) {
	if (!cards.length) return '';
	const lines = cards.map(
		(c) => `- ${c.principle} (${c.source}) — when: ${c.smell}; fix: ${c.fix}`,
	);
	return (
		'PRESENTATION PRINCIPLES — the canon behind the findings. Apply these when ' +
		'you advise or rewrite; cite the principle, not the author:\n' +
		lines.join('\n')
	);
}

// Build the canon context for a deck: the cards matching THIS deck's findings,
// plus the always-on arc cards (so deck-level through-line/structure grounding is
// present even when the mechanical findings are sparse). Deduped, capped, rendered.
// Empty findings → just the core arc set; `limit` bounds the token cost.
export function buildCanonContext({ findings = [], limit = 6 } = {}) {
	const present = new Set((findings || []).map((f) => f?.rule).filter(Boolean));
	const picked = [];
	const seen = new Set();
	const take = (c) => {
		if (c && !seen.has(c.id)) { seen.add(c.id); picked.push(c); }
	};
	// Finding-matched cards first (most relevant to what's actually wrong here)…
	for (const c of CANON) if (c.rules.some((r) => present.has(r))) take(c);
	// …then the core arc set, to ground structure/through-line advice.
	for (const c of CORE) take(c);
	return render(picked.slice(0, Math.max(1, limit)));
}

export { byId as _canonById }; // test seam
