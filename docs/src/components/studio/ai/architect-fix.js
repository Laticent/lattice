// The Drawing Board — single-finding model fix (the Coach card's "Fix" action).
//
// The deterministic Architect flags findings; for the MECHANICAL ones it already
// offers an exact, model-free "Apply fix" (lint-core.applyFix). This module covers
// the JUDGEMENT findings — a wall-of-text slide, a label-only title — where the fix
// needs rewriting, not a rule. When a generation backend is available the Coach
// card grows a "Fix" button that asks the model to rewrite JUST the flagged slide
// and returns a reviewable { edit, before, after } the card renders as a diff. It
// NEVER applies anything itself: the author clicks Apply and the deterministic
// engine re-scores (the model never owns correctness — see the Coach-vs-Converse
// decision doc). Pure except for the injected `model`/`gate`, so it's unit-testable
// headless with a mock backend. The DOM card lives in drawing-board-architect.js;
// the prose-fix sibling for Converse is drawing-board-chat.js — both speak the SAME
// EDIT BLOCK protocol (architect-edits.js), reused here, so a fix is consistent
// wherever it's offered.

import { EDIT_PROTOCOL, numberSlides, parseEdits, sliceSlide } from './architect-edits.js';
import { buildLatticePrimer } from './architect-knowledge.js';
import { canonForFinding } from './presentation-canon.js';

// Build the messages for fixing ONE finding. Mirrors the chat's rich prompt: a
// cacheable STATIC prefix (persona + Lattice primer + the edit protocol —
// byte-identical across findings and decks) and a DYNAMIC tail (this finding + the
// deck). Only the caching-capable cloud path sends the structured cache_control
// blocks; every other backend gets the flattened string (behaviour-identical).
export function buildFixMessages({ source, finding, catalog, cache } = {}) {
	const slideNo = finding?.slide;
	const persona =
		'You are the Architect inside the Lattice Drawing Board. The deterministic ' +
		'review flagged ONE issue on ONE slide; rewrite THAT slide to resolve it. ' +
		'Keep the author’s facts and intent — improve the structure, wording, and the ' +
		'layout choice; never invent content the author didn’t give you. Return EXACTLY ' +
		'ONE edit block for the flagged slide and nothing else (no prose, no preamble).';
	const systemStatic = `${persona}\n\n${buildLatticePrimer(catalog)}\n\n${EDIT_PROTOCOL}`;
	// Ground the rewrite in the canon principle behind this finding (when one maps),
	// so the fix follows the field's guidance, not the model's generic instinct.
	const card = canonForFinding(finding);
	const principle = card ? `Apply this principle: ${card.principle} (${card.source}) — ${card.fix}\n` : '';
	const systemDynamic =
		`\n\nThe flagged slide is slide ${slideNo}.\n` +
		`Issue: ${finding?.message || ''}\n` +
		(finding?.fix ? `How to fix (guidance): ${finding.fix}\n` : '') +
		principle +
		`\nThe full deck (each slide tagged [slide N] — edit ONLY slide ${slideNo}, and never ` +
		`copy the [slide N] marker into the edit body):\n${numberSlides(source)}`;
	const system = systemStatic + systemDynamic;
	const userText = `Rewrite slide ${slideNo} to fix: ${finding?.message || 'the flagged issue'}.`;
	const systemMessage = cache
		? {
				role: 'system',
				content: [
					{ type: 'text', text: systemStatic, cache_control: { type: 'ephemeral' } },
					{ type: 'text', text: systemDynamic },
				],
			}
		: { role: 'system', content: system };
	return [systemMessage, { role: 'user', content: userText }];
}

// Prefer the edit that targets the flagged slide; fall back to the first replace
// the model returned (a stray `slide=N` mismatch shouldn't lose an otherwise-good
// rewrite). Inserts/deletes are ignored — a finding-fix only ever replaces.
function pickEdit(edits, slideNo) {
	return (
		edits.find((e) => e.action === 'replace' && e.slide === slideNo) ||
		edits.find((e) => e.action === 'replace') ||
		null
	);
}

// Ask the model to fix one finding. Resolves to { edit, before, after } the card
// renders as a diff, or null when nothing usable came back (no edit block, an empty
// body, or a no-op rewrite). Throws only on a hard model/transport error — the
// caller surfaces that and leaves the deterministic guidance in place.
export async function requestSlideFix({ model, gate, source, finding, catalog, signal } = {}) {
	if (!model || !finding || !(finding.slide >= 1)) return null;
	const cache = gate?.cache ? !!gate.cache() : false;
	const messages = buildFixMessages({ source, finding, catalog, cache });
	const reply = await model.complete({ messages, onUsage: gate?.onUsage, signal });
	const { edits } = parseEdits(reply || '');
	const edit = pickEdit(edits, finding.slide);
	if (!edit) return null;
	const before = sliceSlide(source, finding.slide);
	const after = (edit.body || '').trim();
	if (!after || after === before.trim()) return null; // empty or no-op — nothing to review
	// Normalise the edit to the flagged slide so Apply splices the right one even if
	// the model labelled the block with a drifted number.
	return { edit: { action: 'replace', slide: finding.slide, body: after }, before, after };
}
