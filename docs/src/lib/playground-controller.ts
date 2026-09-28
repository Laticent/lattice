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
export const FOCUS_KEY = 'lattice-docs-pg-focus';
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
	if (!source?.trim()) return true;
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
	/** An explicit `?view=` in the URL — wins over the persisted view, loses to a handoff. */
	urlView?: string | null;
}): 'read' | 'edit' {
	if (opts.hasHandoff) return 'edit';
	if (opts.urlView === 'read' || opts.urlView === 'edit') return opts.urlView;
	if (opts.savedView === 'read' || opts.savedView === 'edit') return opts.savedView;
	return isPristine(opts.source, opts.insertedHash) ? 'read' : 'edit';
}

// ── The Explore surface (decision §4, PR 6) ──────────────────────────────────

/** One slide of a component's walk plan, as emitted into plans/<name>.json by
 * sync-playground-assets.mjs from the SAME exported `galleryPlan(m)` the PDF
 * renderer consumes — the walk order cannot fork between them. `kind` is the
 * STABLE step key (`title`, `default`, `variant:<key>`, `stress`,
 * `composition:<mod>`, `anti-patterns`, `see-also`) — never an index, so links
 * survive variant additions. */
export type PlanSlide = { kind: string; caption: string; md: string };
export type Plan = { name: string; slides: PlanSlide[] };

/** Parse a fetched plan payload; malformed/foreign shapes read as "no plan"
 * (the caller's 404 path — never a throw, never a dead Next button). */
export function readPlan(raw: string | null): Plan | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as Partial<Plan>;
		if (typeof v.name !== 'string' || !Array.isArray(v.slides) || !v.slides.length) return null;
		const slides: PlanSlide[] = [];
		for (const s of v.slides) {
			if (!s || typeof s.md !== 'string' || typeof s.kind !== 'string') return null;
			slides.push({ kind: s.kind, caption: typeof s.caption === 'string' ? s.caption : '', md: s.md });
		}
		return { name: v.name, slides };
	} catch {
		return null;
	}
}

/**
 * Resolve a persisted step key (`?s=`) against a live plan — the I5 fallback:
 * an exact kind match lands on its slide; a renamed/removed kind (stale
 * bookmark) lands on the title slide with a non-blocking notice; no key at all
 * is silently the title slide. Never a blank frame or a throw.
 */
export function resolvePlanStep(plan: Plan, step: string | null): { index: number; notice: string | null } {
	if (!step) return { index: 0, notice: null };
	const i = plan.slides.findIndex((s) => s.kind === step);
	if (i >= 0) return { index: i, notice: null };
	return { index: 0, notice: `“${step.replace(/^variant:/, '')}” no longer exists in ${plan.name} — showing its title slide.` };
}

export type PlaygroundUrlState = { c: string | null; view: 'read' | 'edit' | null; s: string | null; v: string | null };

/** Read the playground's URL params (`?c=<component>&view=read&s=<kind>` /
 * `?c&view=edit&v=<variant>`). Unknown values pass through here; resolution
 * against the catalog/plan happens in resolveComponent / resolvePlanStep. */
export function parsePlaygroundUrl(search: string): PlaygroundUrlState {
	const q = new URLSearchParams(search || '');
	const rawView = q.get('view');
	return {
		c: q.get('c'),
		view: rawView === 'read' || rawView === 'explore' ? 'read' : rawView === 'edit' ? 'edit' : null,
		s: q.get('s'),
		v: q.get('v'),
	};
}

/** Serialize the walk position back into a query string (for replaceState and
 * the docs-reference deep links). Empty/default fields are omitted. */
export function playgroundQuery(state: Partial<PlaygroundUrlState>): string {
	const q = new URLSearchParams();
	if (state.c) q.set('c', state.c);
	if (state.view) q.set('view', state.view);
	if (state.s && state.s !== 'title') q.set('s', state.s);
	if (state.v && state.v !== 'default') q.set('v', state.v);
	const s = q.toString();
	return s ? `?${s}` : '';
}

/**
 * The next/previous component in the continuous walk (catalog order: the
 * caller passes the same ordered list the picker renders — bucket, then A–Z).
 * Returns null at either end so the Walk bar can say so instead of wrapping.
 */
export function adjacentComponent(order: string[], current: string, dir: 1 | -1): string | null {
	const i = order.indexOf(current);
	if (i < 0) return null;
	const j = i + dir;
	return j >= 0 && j < order.length ? order[j] : null;
}

/** The Walk bar's step chips are FULL-WORD labels, never single letters (the
 * §0.6 amendment — abbreviating to a letter is an AA anti-pattern). Variant
 * kinds resolve through the catalog's own labels. */
export function walkChipLabel(kind: string, variantLabels: Record<string, string> = {}): string {
	if (kind === 'title') return 'Title';
	if (kind === 'default') return 'Default';
	if (kind === 'stress') return 'Stress test';
	if (kind === 'anti-patterns') return 'Anti-patterns';
	// A gallery pages its anti-patterns once they run long (tools/build-component-docs.js
	// `antiPatternPages`), so the second and third slides carry `anti-patterns:2` / `:3`.
	const a = /^anti-patterns:(\d+)$/.exec(kind);
	if (a) return `Anti-patterns ${a[1]}`;
	if (kind === 'see-also') return 'See also';
	const v = /^variant:(.+)$/.exec(kind);
	if (v) return variantLabels[v[1]] || v[1];
	const c = /^composition:(.+)$/.exec(kind);
	if (c) return `+ ${c[1]}`;
	return kind;
}

/**
 * A slide's copy as plain text — the ≤560px "Read this slide's copy"
 * disclosure. A 1280×720 slide at phone width is a preview, not a reading
 * surface (~0.28 scale); the transcript carries the words at body size.
 * Plain-text extraction rendered as React text — no HTML, no #22 surface.
 */
export function slideTranscript(md: string): string {
	// Strip directive comments to a FIXED POINT: one pass over crafted input
	// like `<!<!-- x -->-- y -->` leaves a live `<!-- … -->` behind (CodeQL
	// "incomplete multi-character sanitization"). The transcript renders as
	// React text — never HTML — so this is defense in depth, not a sink fix.
	let noComments = md || '';
	for (let prev = ''; prev !== noComments; ) {
		prev = noComments;
		noComments = noComments.replace(/<!--[\s\S]*?-->/g, '');
	}
	const lines: string[] = [];
	for (const raw of noComments.split('\n')) {
		let line = raw.trim();
		if (!line || /^[-=]{3,}$/.test(line)) continue;
		if (/^\|[\s|:-]+\|$/.test(line)) continue; // table rule row (| --- | --- |)
		line = line
			.replace(/^#{1,6}\s+/, '')
			.replace(/^>\s?/, '')
			.replace(/^(?:[-*+]|\d+\.)\s+/, '')
			.replace(/^\|(.*)\|$/, (_, cells: string) =>
				cells
					.split('|')
					.map((c) => c.trim())
					.filter(Boolean)
					.join(' · '),
			)
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/`([^`]+)`/g, '$1')
			.trim();
		if (line) lines.push(line);
	}
	return lines.join('\n');
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
 * recognized. Faithful port of the inline `detectComponent`.
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
	return valid.includes('cuoio') ? 'cuoio' : valid[0];
}

/** One slide's vertical band inside the preview filmstrip, in the frame document's own
 *  coordinates. The height must be the VISUAL one — `getBoundingClientRect()`, not
 *  `offsetHeight`, which reports the unscaled 720px layout box the in-iframe FIT agent
 *  then `transform: scale()`s down (measured at 390px: offsetHeight 720, real height 179).
 *  Feeding this the layout height overstates every slide by 4x on a phone. The `top` may
 *  come from `offsetTop`, which the same agent keeps honest with a negative
 *  `marginBottom` — see `frameBands` in PlaygroundApp.tsx for why that is load-bearing. */
export type SlideBand = { top: number; height: number };

/**
 * WHICH SLIDE IS THE READER LOOKING AT — the inverse of the walk's scroll.
 *
 * The Explore preview is a filmstrip the reader can scroll freely, and the walk bar
 * ("6 / 13"), the caption, the Step dropdown and the `?s=` URL all claim to name the
 * slide on screen. Before this function existed nothing computed that claim from the
 * scroll, so every one of them was written on a step and never corrected: scrolling to
 * slide 7 left the bar reading "1 / 13", and the next press of Next then yanked the
 * reader back to slide 2. The chrome lied, and the primary control fought the primary
 * gesture (#2124).
 *
 * TWO RULES, and the second one is what makes this safe to run as a live observer.
 *
 * 1. GREATEST OVERLAP, ties to the lower index — the slide filling most of the pane is
 *    the slide you are reading. An anchor line (`last top <= scrollY + k`) is exact for
 *    the scroll the stepper performs and arbitrary everywhere else, since `k` has to be
 *    guessed against a slide height that changes with the pane width; the viewport CENTER
 *    (deck-preview.js's `rootMargin: -45%`) is stable only while a slide is about as tall
 *    as the pane, and silently reports i+1 for a jump to i when one is shorter.
 *
 * 2. HYSTERESIS: while the slide the caller is ALREADY on is at least half as visible as
 *    the winner, it keeps the position. Without it the rule fights the stepper at narrow
 *    widths, where the pane shows three slides at once and the filmstrip cannot scroll far
 *    enough to put the last one at the top: measured at 390x844, pressing End clamps the
 *    scroll with slides 11, 12 and 13 all fully on screen, and pure overlap then names 11
 *    while the reader is plainly looking at the end of the deck. Hysteresis also stops the
 *    counter twitching under a small nudge of the wheel, which is the same defect one
 *    frame wide.
 *
 * Both together give the honest invariant this exists to hold: **the chrome never names a
 * slide the reader cannot see.** Pass `current` as -1 (the default) when there is no
 * position to keep — a fresh deck, or a caller that wants the unbiased answer.
 *
 * Coordinates are the frame document's; `scrollY` is `contentWindow.scrollY`. Returns 0
 * for an empty deck so a caller never has to special-case a frame mid-render.
 */
export function readingSlideIndex(bands: SlideBand[], scrollY: number, viewportH: number, current = -1): number {
	if (!bands.length) return 0;
	const top = scrollY;
	const bottom = scrollY + viewportH;
	const seen = (b: SlideBand) => Math.max(0, Math.min(bottom, b.top + b.height) - Math.max(top, b.top));
	let best = 0;
	let bestSeen = -1;
	for (let i = 0; i < bands.length; i++) {
		// Strictly greater keeps the tie on the LOWER index: two slides splitting the
		// pane exactly should read as the one you scrolled away from, not the one you
		// have not reached, so the counter never runs ahead of the reader.
		const s = seen(bands[i]);
		if (s > bestSeen) {
			bestSeen = s;
			best = i;
		}
	}
	if (current >= 0 && current < bands.length && seen(bands[current]) * 2 >= bestSeen) return current;
	return best;
}

// ── Caret → slide (the Edit view's preview follows the author) ───────────────
//
// Which rendered slide holds the editor's caret, answered from what is ON SCREEN rather than
// by re-deriving the engine's split rules. The Playground splits on headings as well as rules
// by default, and a portrait deck is further cut into pages (structural-split.js), so a count
// of `---` lines disagrees with the preview on exactly the decks where following matters. Text
// does not: the words on the caret's line are in the slide that renders them.
//
// The source-side count is kept, as a TIEBREAK — the same heading or bullet can appear on two
// slides, and the one nearest the separator count (never before it, since headings only ever
// ADD slides) is the one the author is in. `-1` means "cannot tell", and the caller then
// leaves the preview where it is rather than guess.

/** Letters, digits and single spaces, lowercased — the shape both sides are compared in. */
export function foldSlideText(text: string): string {
	return text
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[#a-z0-9]+;/gi, ' ')
		.replace(/\]\([^)]*\)/g, ' ')
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

const HR_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_SPLIT = /^ {0,3}#{1,2}[ \t]+\S/;
const SETEXT_EQ = /^ {0,3}=+[ \t]*$/;
const SETEXT_DASH = /^ {0,3}-+[ \t]*$/;

/**
 * The rendered slide index the caret sits in, or -1.
 * `caretLine` is 1-based (CodeMirror's `line.number`); `slideTexts` is each rendered
 * section's `textContent`, in order.
 */
export function caretSlideIndex(source: string, caretLine: number, slideTexts: string[]): number {
	if (!slideTexts.length) return -1;
	// The editor's own text — CodeMirror hands it over with `\n` line breaks already.
	const lines = source.split('\n');
	const at = Math.min(Math.max(caretLine - 1, 0), lines.length - 1);
	// Front matter: a leading `---` block is config, not a slide boundary. It also says
	// whether headings split slides (`split: rule` turns that off; the default is on).
	let bodyStart = 0;
	let byHeading = true;
	if (lines[0]?.trim() === '---') {
		const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
		if (end > 0) {
			bodyStart = end + 1;
			const split = lines.slice(1, end).find((l) => /^split:/.test(l));
			if (split && /^split:[ \t]*["']?rule\b/i.test(split)) byHeading = false;
		}
	}
	if (at < bodyStart) return 0;
	// Where each slide STARTS, the way the engine splits: a thematic break, and — under the
	// default heading split — every h1/h2 after the first one in its chunk. A `---` straight
	// under a line of text is a setext HEADING, not a break; a fenced block is quoted.
	const isRule: boolean[] = new Array(lines.length).fill(false);
	const starts: number[] = [];
	let fence = '';
	let headed = false;
	for (let i = bodyStart; i < lines.length; i++) {
		const l = lines[i];
		const f = l.match(FENCE_LINE);
		if (fence) {
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = '';
			continue;
		}
		if (f) {
			fence = f[1];
			continue;
		}
		const prevText = i > bodyStart && lines[i - 1].trim() !== '' && !isRule[i - 1];
		const setext = prevText && (SETEXT_EQ.test(l) || SETEXT_DASH.test(l));
		if (!setext && HR_LINE.test(l)) {
			isRule[i] = true;
			starts.push(i);
			headed = false;
			continue;
		}
		if (byHeading && (setext || ATX_SPLIT.test(l))) {
			// A setext heading's text is the line above; the slide starts there.
			if (headed) starts.push(setext ? i - 1 : i);
			headed = true;
		}
	}
	const startsBefore = starts.filter((i) => i <= at).length;
	// The lines of the caret's own chunk, nearest first: the caret line, then outward. A
	// directive comment or a blank line carries no text, so its neighbors speak for it.
	const probes: number[] = [at];
	for (let d = 1; d < 40; d++) {
		if (at + d < lines.length && !isRule[at + d]) probes.push(at + d);
		if (at - d >= bodyStart && !isRule[at - d]) probes.push(at - d);
	}
	// Whole words only — padded, so "cost" does not find "costs".
	const folded = slideTexts.map((t) => ` ${foldSlideText(t)} `);
	for (const i of probes) {
		// Stay inside the caret's slide: a probe past a slide start belongs to another one.
		if (i > at && starts.some((st) => st > at && st <= i)) continue;
		if (i < at && starts.some((st) => st > i && st <= at)) continue;
		const full = foldSlideText(lines[i]);
		// A long line is cut at 60 characters, back to a whole word.
		const needle = full.length > 60 ? full.slice(0, 60).replace(/ \S*$/, '').trim() : full;
		if (needle.length < 3) continue;
		let best = -1;
		let bestCost = Number.POSITIVE_INFINITY;
		folded.forEach((t, k) => {
			if (t.indexOf(` ${needle} `) === -1) return;
			// Nearest the source's own count, never before it: a portrait page split or a
			// generated slide only ever ADDS sections ahead of the caret's slide.
			const cost = k >= startsBefore ? k - startsBefore : 1000 + (startsBefore - k);
			if (cost < bestCost) {
				bestCost = cost;
				best = k;
			}
		});
		if (best >= 0) return best;
	}
	return -1;
}
