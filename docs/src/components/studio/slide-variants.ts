import { getClassTokens, setClassTokens, setGroupToken } from './slide-directives';

/**
 * A component's OWN classification of its declared variants (`variantAxes` in
 * `<name>.manifest.json`, validated in `lib/components/index.js`, carried through
 * `dist/docs/components.json`). This is the answer to "which looks are mutually
 * exclusive and which stack" — `map` is `world` OR `us` for its Basemap, but
 * `highlight` / `robinson` / `grouped` are independent modifiers that combine.
 *
 * `exclusive: true` → pick ONE of `members` (a radio group); `default` names the
 * member the base form carries, so "reshape to Default" restores it rather than
 * leaving the slide with no basemap at all.
 * No `exclusive` → the members stack independently (each one toggles).
 */
export type VariantAxis = {
	label: string;
	exclusive?: boolean;
	default?: string;
	members: readonly string[];
};

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
	/** Pick-ONE (clicking swaps within its family) vs a toggle (clicking turns it off). */
	exclusive: boolean;
};

/** `insight-key` → `insight key` (a readable look label; the mono chip keeps the token). */
export function humanizeVariant(token: string): string {
	return token.replace(/-/g, ' ');
}

/**
 * The looks a component offers: a leading **Default** (empty token) then one per
 * DECLARED variant — the component's own alternate forms (kpi › ops/spotlight),
 * NOT the universal config (dark / no-header / insight-*) that belongs in slide
 * settings. Each is tagged with any vocab exclusive axis it belongs to. Order is
 * preserved from the catalog; the caller windows the previews.
 */
export function componentLooks(variants: string[] | undefined, axes: Record<string, readonly string[]> = {}, variantAxes: readonly VariantAxis[] = []): VariantLook[] {
	// Mirrors applyVariant's precedence: the component's own axes, then the vocab axes,
	// then unclassified (which toggles). A look labelled exclusive here is one whose tile
	// SWAPS; everything else turns off when you click it again.
	const classify = (token: string): { axis: string; exclusive: boolean } => {
		const own = variantAxes.find((a) => a.members.includes(token));
		if (own) return { axis: own.label, exclusive: !!own.exclusive };
		for (const [name, members] of Object.entries(axes)) if (members.includes(token)) return { axis: name, exclusive: true };
		return { axis: '', exclusive: false };
	};
	const looks: VariantLook[] = [{ token: '', label: 'Default', axis: '', exclusive: true }];
	for (const t of variants ?? []) looks.push({ token: t, label: humanizeVariant(t), ...classify(t) });
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
 * Apply a variant look to an EXISTING slide chunk (Reshape).
 *
 * REPLACE-vs-STACK is decided per token, most specific rule first:
 *
 *   1. the component's OWN `variantAxes` (`variantAxes`), when it declares them —
 *      an `exclusive` axis replaces within its members, a non-exclusive one toggles;
 *   2. a vocab exclusive axis (`axes`, from lintVocab) — replaces within the axis;
 *   3. anything else — UNCLASSIFIED, so it TOGGLES: on if off, off if on.
 *
 * Rule 3 is the safe fallback, and it is deliberately a toggle rather than either
 * extreme. Treating every declared variant as one pick-ONE family is WRONG — our own
 * decks legitimately stack `map world highlight robinson` (basemap + treatment +
 * projection) and `video companion qr`, and a blanket replace would silently delete two
 * of the author's three tokens. Blindly adding is the #1281 bug: `_class` grows
 * `kpi ops spotlight trajectory` and never shrinks. A toggle fixes "it keeps adding"
 * without ever destroying a token the author can't get back by clicking again — and it
 * is exactly what #1281 asked for ("group what should be grouped and make them a
 * toggle"). Classifying a component in its manifest moves its variants from rule 3 up
 * into rule 1; until then the fallback is honest about not knowing.
 *
 * The empty token is "reshape back to the base form": clear this COMPONENT's variants
 * (its declared set plus every member of its own axes), then restore each exclusive
 * axis's declared `default` — a `map` with no basemap is not a base form, it's a broken
 * slide. The component token and every non-variant token survive, and that emphatically
 * includes the vocab axes (`scale-*`, `tone-*`, `insight-*`, `no-period`, `claim-*`):
 * those are UNIVERSAL per-slide config the author sets in the slide drawer, not looks
 * this picker offers. Reshape must never delete a setting it doesn't even display —
 * there'd be no tile to get it back from.
 *
 * EVERY parameter is REQUIRED, deliberately, with no defaults: they are what makes a
 * look exclusive, and a caller that omits one silently falls through to a weaker rule.
 * That is precisely how #1281 shipped — the apply path dropped `componentVariants`
 * while the preview tiles passed it, so the tile and the committed slide disagreed.
 * Pass `{}` / `[]` explicitly when a caller genuinely has neither.
 */
export function applyVariant(chunk: string, token: string, axes: Record<string, readonly string[]>, componentVariants: readonly string[], variantAxes: readonly VariantAxis[]): string {
	if (token) {
		// 1. The component's own classification wins — it is the most specific thing we know.
		const own = variantAxes.find((a) => a.members.includes(token));
		if (own) return own.exclusive ? swap(chunk, own.members.flatMap(parts), token) : toggleParts(chunk, token);
		// 2. A vocab exclusive axis (e.g. insight-*, were it ever a declared variant).
		for (const members of Object.values(axes)) {
			if (members.includes(token)) return swap(chunk, members, token);
		}
		// 3. Unclassified — toggle, so picking never stacks and never silently strips.
		return toggleParts(chunk, token);
	}
	// Base form: strip THIS COMPONENT's looks — its declared variants and its own axes'
	// members — then put back the declared default of each exclusive axis. The vocab axes
	// are deliberately NOT in the strip set: `scale-xl` / `no-period` / `tone-*` are the
	// author's universal slide settings, and Reshape offers no tile to restore them.
	const strip = new Set<string>([...componentVariants.flatMap(parts), ...variantAxes.flatMap((a) => a.members.flatMap(parts))]);
	const kept = getClassTokens(chunk).filter((t) => !strip.has(t));
	for (const a of variantAxes) if (a.exclusive && a.default) kept.push(...parts(a.default));
	return setClassTokens(chunk, kept);
}

/**
 * Pick `token` out of a mutually-exclusive group — but leave the chunk BYTE-identical
 * when it already holds exactly that member. `setGroupToken` removes-then-appends, so
 * re-picking the look you already have would reorder `_class` (`map world highlight` →
 * `map highlight world`): no visual change, but it dirties the deck and burns an undo
 * checkpoint on a click that did nothing.
 */
function swap(chunk: string, members: readonly string[], token: string): string {
	const next = setGroupToken(chunk, members, token);
	return sameTokens(chunk, next) ? chunk : next;
}

/** Do two chunks carry the same `_class` tokens, order aside? */
function sameTokens(a: string, b: string): boolean {
	const x = getClassTokens(a);
	const y = getClassTokens(b);
	return x.length === y.length && x.every((t) => y.includes(t));
}

/** Would picking this look leave the slide exactly as it is? (Drives the "Current" badge
 *  for the Default tile, whose click can otherwise restore an axis default and so is NOT
 *  a no-op even when no look is active.) */
export function variantNoop(chunk: string, token: string, axes: Record<string, readonly string[]>, componentVariants: readonly string[], variantAxes: readonly VariantAxis[]): boolean {
	return applyVariant(chunk, token, axes, componentVariants, variantAxes) === chunk;
}

/** Turn a look ON if any of its sub-tokens is missing, OFF when all are already present. */
function toggleParts(chunk: string, token: string): string {
	const tokens = getClassTokens(chunk);
	const want = parts(token);
	if (want.every((t) => tokens.includes(t))) return setClassTokens(chunk, tokens.filter((t) => !want.includes(t)));
	return setClassTokens(chunk, [...tokens, ...want.filter((t) => !tokens.includes(t))]);
}
