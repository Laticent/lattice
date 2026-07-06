// Pure orchestration logic for the playground, lifted out of the old inline
// IIFE (playground.astro) so it is unit-testable and free of DOM/global
// coupling. The React controller (PlaygroundApp) owns the wiring; this module
// owns the decisions: which component a deck is, which variants it offers, and
// the theme-name resolution. The render itself (engine + iframe) is driven by
// the React layer through window.LatticePlayground / window.LatticeDeckPreview —
// those irreducible, scar-tissued pieces are WRAPPED, never reimplemented.

export type VariantDoc = { key: string; label: string; caption: string; sample: string };
export type CatalogEntry = { skeleton: string; sample: string; variants: VariantDoc[] };
export type Catalog = Record<string, CatalogEntry>;

export type VariantOption = { value: string; label: string; title?: string };

export const SOURCE_KEY = 'lattice-docs-pg-source';
// ── Persisted-state keys (2026-07-05 Specimen Book decision §4) ──────────────
// The Playground remembers where you were: the picked component, the picker's
// last search + lens, and the surface mode. Draft protection: every writer that
// would replace the one saved draft goes through the one-shot handoff key and
// the insert-time fingerprint, with the previous draft parked under the backup
// key (a confirm alone is not sufficient protection for the only copy of user
// content).
export const COMPONENT_KEY = 'lattice-docs-pg-component';
export const SEARCH_KEY = 'lattice-docs-pg-search';
export const LENS_KEY = 'lattice-docs-pg-lens';
export const VIEW_KEY = 'lattice-docs-pg-view';
export const HANDOFF_KEY = 'lattice-docs-pg-handoff';
export const BACKUP_KEY = 'lattice-docs-pg-source-backup';
export const INSERTED_HASH_KEY = 'lattice-docs-pg-inserted-hash';

export type Handoff = { md: string; from: string; ts: number };

/**
 * Insert-time fingerprint (djb2, hex). Pristine-ness is "the draft still hashes
 * to what the last programmatic writer recorded" — NEVER equality against the
 * current catalog, which would break fleet-wide on every voice-migration deploy
 * (an untouched old-bytes sample would suddenly read as a dirty draft).
 */
export function fingerprint(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) {
		h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(16);
}

/** A draft is pristine when it is empty or still matches the recorded insert hash. */
export function isPristine(source: string, insertedHash: string | null): boolean {
	if (!source || !source.trim()) return true;
	return insertedHash != null && fingerprint(source) === insertedHash;
}

/** Parse a raw handoff payload; malformed/foreign shapes read as "no handoff". */
export function readHandoff(raw: string | null): Handoff | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as Partial<Handoff>;
		if (typeof v.md !== 'string' || !v.md) return null;
		return { md: v.md, from: typeof v.from === 'string' && v.from ? v.from : 'link', ts: typeof v.ts === 'number' ? v.ts : 0 };
	} catch {
		return null;
	}
}

/** Serialize a handoff payload (the writers' half of the contract). */
export function makeHandoff(md: string, from: string, ts: number): string {
	return JSON.stringify({ md, from, ts } satisfies Handoff);
}

/**
 * Resolve an externally-persisted component pointer against the live catalog —
 * a renamed/retired component (stale localStorage, old link) falls back to the
 * first catalog entry instead of a blank frame or a throw (decision §4 I5).
 */
export function resolveComponent(catalog: Catalog, persisted: string | null): { name: string; fallback: boolean } {
	if (persisted && catalog[persisted]) return { name: persisted, fallback: false };
	const first = Object.keys(catalog).sort()[0] ?? '';
	return { name: first, fallback: Boolean(persisted) };
}

/**
 * Mode on load — one precedence rule (decision §4): an incoming handoff forces
 * Edit; an explicit persisted view wins next; otherwise a pristine/empty draft
 * opens the walkthrough surface and a dirty draft opens the editor (a constant
 * walkthrough default would ambush every returning editor user). The Explore
 * surface itself lands in PR 6 — until then callers clamp 'read' to 'edit'.
 */
export function resolveStartupView(opts: {
	hasHandoff: boolean;
	savedView: string | null;
	source: string;
	insertedHash: string | null;
}): 'read' | 'edit' {
	if (opts.hasHandoff) return 'edit';
	if (opts.savedView === 'read' || opts.savedView === 'edit') return opts.savedView;
	return isPristine(opts.source, opts.insertedHash) ? 'read' : 'edit';
}

/**
 * The first `<!-- _class: ... -->` token line of a source — the variant-sync
 * discriminator. The Variant select may snap only when THIS changes (the user
 * actually edited the class line), never on every keystroke elsewhere.
 */
export function classTokenLine(src: string): string {
	const m = /<!--\s*_class:\s*([^>]*?)\s*-->/.exec(src || '');
	return m ? m[1].trim().replace(/\s+/g, ' ') : '';
}

/**
 * Detect which component (and variant) a deck source is, from the first
 * `<!-- _class: ... -->`: the first class token that names a component, plus any
 * remaining token that matches one of its documented variant keys. Lets the
 * pickers reflect a deck loaded via "Open in Playground", a reload, or a paste —
 * instead of sitting on "Pick a component…". Returns null when no component is
 * recognised. Faithful port of the inline `detectComponent`.
 */
export function detectComponent(catalog: Catalog, src: string): { name: string; variant: string } | null {
	const m = /<!--\s*_class:\s*([^>]*?)\s*-->/.exec(src || '');
	if (!m) return null;
	const tokens = m[1].trim().split(/\s+/).filter(Boolean);
	let name: string | null = null;
	for (const tok of tokens) {
		if (catalog[tok]) {
			name = tok;
			break;
		}
	}
	if (!name) return null;
	let variant = 'default';
	const vs = catalog[name].variants || [];
	for (const v of vs) {
		if (tokens.indexOf(v.key) >= 0) {
			variant = v.key;
			break;
		}
	}
	return { name, variant };
}

/**
 * The Variant <select> options for a component: 'default' (the base sample) plus
 * each documented modifier. Empty array → the control is disabled (no variants
 * or no component picked). Faithful port of the inline `populateVariants`.
 */
export function variantOptions(catalog: Catalog, name: string | null): VariantOption[] {
	const comp = name ? catalog[name] : null;
	const variants = comp?.variants || [];
	if (!comp || !variants.length) return [];
	return [
		{ value: 'default', label: 'default' },
		...variants.map((v) => ({ value: v.key, label: v.label, title: v.caption || undefined })),
	];
}

/**
 * The markdown for a picked component + variant: the base sample for 'default',
 * else the modifier's own sample (falling back to the base sample). Port of the
 * inline variant-change handler.
 */
export function variantSource(catalog: Catalog, name: string, variantKey: string): string {
	const comp = catalog[name];
	if (!comp) return '';
	if (!variantKey || variantKey === 'default') return comp.sample;
	const v = (comp.variants || []).find((x) => x.key === variantKey);
	return v ? v.sample : comp.sample;
}

/**
 * Resolve the theme name to render with: `<palette>-dark` in dark mode when that
 * theme is loaded, else the base palette. Mirrors the inline render().
 */
export function resolveThemeName(palette: string, mode: 'light' | 'dark', hasDark: boolean): string {
	return mode === 'dark' && hasDark ? `${palette}-dark` : palette;
}

/** The render signature deck-preview.js keys its patch-vs-rewrite decision on. */
export function renderSig(theme: string, mode: string, w: number, h: number): string {
	return `${theme}|${mode}|${w}x${h}`;
}

/**
 * Keep the render on a palette the engine can actually theme. `lattice-docs-palette`
 * is persisted across sessions and seeded onto `data-palette` before hydration; a
 * value that names a retired/renamed theme would 404 its theme CSS and blank the
 * preview (the "blank in my browser, fine in private browsing" report). Returns the
 * palette unchanged when it is still registered, else a safe default (`indaco` when
 * present, else the first known palette). An empty vocabulary (the test harness, or
 * before the palette list loads) is a pass-through — we can't judge validity, so we
 * don't override.
 */
export function sanitizePalette(palette: string, valid: string[]): string {
	if (!valid.length || valid.includes(palette)) return palette;
	return valid.includes('indaco') ? 'indaco' : valid[0];
}
