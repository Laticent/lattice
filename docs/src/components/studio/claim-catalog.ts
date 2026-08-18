// The Studio claim catalog — DISPLAY metadata for the `claim:` register (how much frame
// a slide's content sits inside: the standard frame, a quieter one, a hero, or full
// bleed). Sibling of mode-catalog.ts / corners-catalog.ts. The engine's single source of
// truth is CLAIM_REGISTER (lib/core/resolve-claim.js); THIS file adds only the human
// layer the picker needs. Rot-guard: claim-catalog.test.ts.
//
// Authored deck-wide via `claim:` or per-slide via `_class: claim-hero` etc.
// (`claim-framed` is the explicit per-slide opt-out from a deck-wide claim).

export type ClaimEntry = {
	/** the `claim:` register value (and engine CLAIM_REGISTER key) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — content inset shrinking as the claim grows */
	swatch: { background: string; backgroundSize?: string };
};

const INK = (pct: number) => `color-mix(in srgb, var(--text-heading) ${pct}%, transparent)`;
// Each chip shows the same block at a different inset — the axis the register controls.
const block = (size: string, tone: number) =>
	`linear-gradient(${INK(tone)}, ${INK(tone)}) center / ${size} no-repeat, var(--bg)`;

// Ordered as the picker shows them, quietest frame → loudest. `framed` is the baseline
// (it maps to no class token, so omitting the key renders it).
export const CLAIMS: ClaimEntry[] = [
	{
		name: 'framed', label: 'Framed',
		blurb: 'The standard frame — content sits inside the usual margins. The default.',
		swatch: { background: block('60% 46%', 22) },
	},
	{
		name: 'quiet', label: 'Quiet',
		blurb: 'A restrained frame — less presence around the content, for dense or serial slides.',
		swatch: { background: block('52% 38%', 14) },
	},
	{
		name: 'hero', label: 'Hero',
		blurb: 'The content claims the slide — a larger, more assertive frame for a statement.',
		swatch: { background: block('76% 60%', 30) },
	},
	{
		name: 'bleed', label: 'Bleed',
		blurb: 'Content runs to the slide edges, with no frame at all.',
		swatch: { background: block('100% 100%', 26) },
	},
];

export const CLAIM_BY_NAME: Record<string, ClaimEntry> = Object.fromEntries(
	CLAIMS.map((s) => [s.name, s]),
);

/** The active claim entry for a value; unknown / empty → the `framed` baseline. */
export function activeClaim(value: string | undefined | null): ClaimEntry {
	const key = (value ?? '').trim().toLowerCase();
	return CLAIM_BY_NAME[key] ?? CLAIM_BY_NAME.framed;
}
