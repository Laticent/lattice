import { getClassTokens, setClassTokens, setGroupToken } from './slide-directives';

// Variants as LOOKS — the model behind the add-slide gallery's variant children and
// the Reshape control (engineering/decisions/2026-07-18-slide-variants-in-gallery.md).
// A variant is not a different kind of slide: it is the SAME authored slide with a
// different class token. So "insert a variant", "pick a variant", and "reshape to a
// variant" are one operation — change the `_class` tokens — and every look is a child
// of its parent component (`quote › insight-key`).

export type VariantLook = {
	/** The class token, e.g. `insight-key`. Empty string = the component's default look. */
	token: string;
	/** Human label for the token (`insight-key` → `insight key`). */
	label: string;
	/** The axis family this look belongs to (from exclusiveAxes), or '' if additive. */
	axis: string;
};

/** `insight-key` → `insight key` (a readable look label; the mono chip keeps the token). */
export function humanizeVariant(token: string): string {
	return token.replace(/-/g, ' ');
}

/**
 * The looks a component offers: a leading **Default** (empty token) then one per
 * `effectiveVariant`, tagged with the exclusive axis it belongs to (so the UI can
 * group and the reshape apply can replace within an axis). Order is preserved from
 * the catalog; the caller windows the previews.
 */
export function componentLooks(effectiveVariants: string[] | undefined, axes: Record<string, readonly string[]> = {}): VariantLook[] {
	const axisOf = (token: string): string => {
		for (const [name, members] of Object.entries(axes)) if (members.includes(token)) return name;
		return '';
	};
	const looks: VariantLook[] = [{ token: '', label: 'Default', axis: '' }];
	for (const t of effectiveVariants ?? []) looks.push({ token: t, label: humanizeVariant(t), axis: axisOf(t) });
	return looks;
}

// A variant token can be a SPACE-SEPARATED set (`tint-corner at-tl`) — `_class` is
// whitespace-tokenized, so we compare and merge at the sub-token level, never treating
// the whole variant as one opaque token (which would double-add and never match).
const parts = (token: string): string[] => token.split(/\s+/).filter(Boolean);

/** Is this variant look currently ON — i.e. are ALL its sub-tokens present? (A
 *  multi-token variant like `tint-corner at-tl` is on only when both tokens are.) */
export function variantActive(present: Set<string>, token: string): boolean {
	return token ? parts(token).every((t) => present.has(t)) : false;
}

/**
 * A variant look's PREVIEW sample: the component's `skeleton` with the variant token
 * added to its `_class`. The empty token renders the base skeleton unchanged. Same
 * span-surgical token edit the Inspector uses, so the preview is exactly what insert
 * would produce.
 */
export function variantSample(skeleton: string, token: string): string {
	if (!token) return skeleton;
	const tokens = getClassTokens(skeleton);
	const merged = [...tokens];
	for (const t of parts(token)) if (!merged.includes(t)) merged.push(t);
	return merged.length === tokens.length ? skeleton : setClassTokens(skeleton, merged);
}

/**
 * Apply a variant look to an EXISTING slide chunk (Reshape). Axis-aware: if the token
 * belongs to an exclusive axis, replace any current member of that axis (so you never
 * get two `insight-*`); otherwise add it (sub-token aware). The empty token clears every
 * axis member AND every one of the component's known variant tokens — "reshape back to
 * the default look" — while keeping the component token and any hand-authored non-variant
 * tokens. `allVariants` is the component's full variant set, needed so the default can
 * strip additive looks (`dark`, `tint-*`) that live on no exclusive axis.
 */
export function applyVariant(chunk: string, token: string, axes: Record<string, readonly string[]> = {}, allVariants: readonly string[] = []): string {
	if (token) {
		for (const members of Object.values(axes)) {
			if (members.includes(token)) return setGroupToken(chunk, members, token);
		}
		// Additive look — ensure each of its sub-tokens is on, without disturbing others.
		const tokens = getClassTokens(chunk);
		const merged = [...tokens];
		for (const t of parts(token)) if (!merged.includes(t)) merged.push(t);
		return merged.length === tokens.length ? chunk : setClassTokens(chunk, merged);
	}
	// Default look: strip every axis member AND every known variant sub-token, leaving
	// the component (`tokens[0]`, never a variant) and any non-variant tokens.
	const strip = new Set<string>([...Object.values(axes).flat(), ...allVariants.flatMap(parts)]);
	const kept = getClassTokens(chunk).filter((t) => !strip.has(t));
	return setClassTokens(chunk, kept);
}
