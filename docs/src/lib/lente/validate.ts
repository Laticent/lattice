// Validators + the base-flip rewriter — the anti-drift surface. Pure lookups the review UI renders as
// badges (typo'd tokens, orphan tags, contradictions, an unavailable default, a rung that does not
// contain the rung below it), plus rebaseLensTags,
// which re-expresses a lens's membership when its base flips so a bare toggle can't turn written tokens
// into dead config (design doc §9.1).

import { ladderRungs, lensEligibility, lensEscapees } from './project';
import { allDirectiveBodies, applyTag, parseSlideTags } from './tags';
import { type Diagnostic, FULL_LENS_ID, type LensBase, type LensRegistry } from './types';

/** Every `_lens` token (include or `-`exclude) in the deck that names NO registered lens — a typo like
 *  `_lens: brif`, surfaced as an error instead of silently granting membership to a phantom lens
 *  (mirrors the codebase's `unknownComponents` guard for `_class`). Skips fenced code blocks so a
 *  DOCUMENTED example token isn't reported as a typo. */
export function unknownLensTokens(src: string, reg: LensRegistry): string[] {
	const known = new Set(reg.lenses.map((l) => l.id));
	const seen = new Set<string>();
	for (const body of allDirectiveBodies(src, 'lens')) {
		for (const raw of body.split(/\s+/).filter(Boolean)) {
			const id = raw.replace(/^[+-]/, '');
			if (id && !known.has(id) && !seen.has(id)) seen.add(id);
		}
	}
	return [...seen];
}

/** Deck-wide lens health for the review panel: an unavailable default, per-slide `+x`/`-x`
 *  contradictions, orphan tags, and the ladder invariant (`validateLadder`, below — the one `error`
 *  among otherwise warnings). Pure; never throws. */
export function validateRegistry(slides: string[], reg: LensRegistry): Diagnostic[] {
	const out: Diagnostic[] = [];
	const src = Array.isArray(slides) ? slides : [];

	if (reg.default !== FULL_LENS_ID) {
		const elig = lensEligibility(src, reg, reg.default);
		if (elig.status !== 'ok') {
			out.push({
				level: 'warning',
				code: 'default-unavailable',
				lensId: reg.default,
				message: `lens-default "${reg.default}" is ${elig.reason} — readers will land on Full instead`,
			});
		}
	}

	const known = new Set(reg.lenses.map((l) => l.id));
	src.forEach((slide, index) => {
		const t = parseSlideTags(slide);
		for (const id of t.include) {
			if (t.exclude.has(id)) {
				out.push({ level: 'warning', code: 'tag-contradiction', slide: index, lensId: id, message: `slide ${index + 1}: both +${id} and -${id} — the wrong-polarity token is dead` });
			}
		}
		for (const id of [...t.include, ...t.exclude]) {
			if (!known.has(id)) out.push({ level: 'warning', code: 'orphan-tag', slide: index, lensId: id, message: `slide ${index + 1}: _lens token "${id}" names no registered lens` });
		}
	});
	out.push(...validateLadder(src, reg));
	return out;
}

/** The LADDER invariant — every rung contains the rung below it (design note §4.2). This is the check
 *  that makes "go deeper" honest: containment is what guarantees an escalation is ADDITIVE, so a reader
 *  never loses a slide they just read, and it is the same rule that neutralizes the B2 finding which
 *  deferred `includes:` in the first place — a cross-polarity include that balloons a low rung is not a
 *  configuration to be restricted case by case, it is a ladder violation this reports.
 *
 *  It closes the gap the suggester-side pin could not: `lens-containment.test.ts` proves the SHIPPED
 *  rule table decomposes into rungs and cuts, but a person tagging by hand can still produce
 *  `brief ⊄ evidence` in their own deck, and until now nothing looked.
 *
 *  Reported per ESCAPING SLIDE — the shape `orphan-tag` uses — because the fix is per-slide: tag it
 *  into the upper view, or drop it from the lower one. `error`, not `warning`: a view that DECLARED
 *  itself a rung and does not nest is a broken invariant, not a style note. It gates nothing at read
 *  time, though — `deeperLens` fails closed on its own — so a deck with a broken ladder still reads
 *  safely; it just cannot climb. Only ADJACENT pairs are checked, which covers the whole chain:
 *  containment is transitive, so a sound chain of adjacent links is a sound chain throughout. */
export function validateLadder(slides: string[], reg: LensRegistry): Diagnostic[] {
	const src = Array.isArray(slides) ? slides : [];
	const ladder = ladderRungs(src, reg);
	const out: Diagnostic[] = [];
	for (let i = 0; i < ladder.length - 1; i++) {
		const lower = ladder[i];
		const upper = ladder[i + 1];
		for (const slide of lensEscapees(src, reg, upper.id, lower.id)) {
			out.push({
				level: 'error',
				code: 'ladder-containment',
				slide,
				lensId: lower.id,
				message: `slide ${slide + 1}: in "${lower.label}" but not in "${upper.label}" — a rung must contain every rung below it, so going deeper never drops a slide`,
			});
		}
	}
	return out;
}

/** Re-express a lens's membership when its `base` flips (none<->all): recompute the current member set
 *  under the OLD base, then write the equivalent tokens under the NEW base, so no membership silently
 *  inverts. Pure — returns a new slides array. The caller routes the result through the approve/diff
 *  flow. */
export function rebaseLensTags(slides: string[], reg: LensRegistry, lensId: string, from: LensBase, to: LensBase): string[] {
	const known = reg.lenses.some((l) => l.id === lensId);
	if (from === to || !known) return [...slides]; // unknown lens id => nothing to rebase
	return (Array.isArray(slides) ? slides : []).map((slide) => {
		const t = parseSlideTags(slide);
		const member = from === 'all' ? !t.exclude.has(lensId) : t.include.has(lensId);
		return applyTag(slide, lensId, member, to);
	});
}
