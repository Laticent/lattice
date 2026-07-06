// Vetrina — THEMING: the JS convenience over the first-class `--vt-*` CSS token contract.
// A host can theme entirely in CSS (style the tokens; light/dark rides its own cascade —
// the stage layer inherits from :root). This module is the zero-CSS convenience: pass a
// `Theme` object of VALUES and Vetrina writes the tokens for you.
//
// Colors are VALIDATED (the human-not-machine tenet applied to color):
//   - no exfiltration sink: `url(` / `image(` / control chars are REJECTED (corrected I4).
//   - legibility floor: a light/same-hue `accent` can't render the cursor invisible - the
//     cue co-stroke adapts to CONTRAST with the accent (not always white).

export type Color = string;
export type VtToken =
	| 'accent'
	| 'cursorFill'
	| 'cursorStroke'
	| 'captionBg'
	| 'captionInk'
	| 'captionHint'
	| 'ringHalo'
	| 'glowHalo'
	| 'tickHalo'
	| 'exitBg'
	| 'exitInk';

export interface Theme {
	/** Brand hue -> --vt-accent (validated; the co-stroke adapts so it can't go invisible). */
	accent?: Color;
	/** Curated, guaranteed-followable pacing (default 'moderate'). Not a free numeric. */
	speed?: 'slow' | 'moderate' | 'fast';
	/** Curated cursor SHAPE (default 'arrow'). */
	pointer?: 'arrow' | 'ring' | 'dot';
	/** Which edge the narration dock sits at (default 'bottom'). A curated choice, not a
	 *  free coordinate; shape (corner radius) is the CSS `--vt-caption-radius` token. */
	placement?: 'top' | 'bottom';
	/** Silence a cue (never replace one with a callback). */
	cues?: Partial<Record<'anticipate' | 'press' | 'circle' | 'intro', false>>;
	/** Escape hatch: set any --vt-* token value directly, in JS. */
	tokens?: Partial<Record<VtToken, Color>>;
	/** Where the overlay mounts (default: the root's document body). */
	portalRoot?: HTMLElement;
	/** Stacking context for hosts that go higher than the default. */
	zIndex?: number;
}

/** What the stage consumes - a Theme resolved to concrete token values + pacing + shape. */
export interface ResolvedTheme {
	tokens: Record<string, string>; // --vt-* -> value
	pace: number; // duration multiplier (slow > 1 > fast)
	pointer: 'arrow' | 'ring' | 'dot';
	placement: 'top' | 'bottom'; // which edge the narration dock sits at
	silenced: Set<string>; // cue names to skip
}

const TOKEN_VAR: Record<VtToken, string> = {
	accent: '--vt-accent',
	cursorFill: '--vt-cursor-fill',
	cursorStroke: '--vt-cursor-stroke',
	captionBg: '--vt-caption-bg',
	captionInk: '--vt-caption-ink',
	captionHint: '--vt-caption-hint',
	ringHalo: '--vt-ring-halo',
	glowHalo: '--vt-glow-halo',
	tickHalo: '--vt-tick-halo',
	exitBg: '--vt-exit-bg',
	exitInk: '--vt-exit-ink',
};
const SPEED_PACE: Record<'slow' | 'moderate' | 'fast', number> = { slow: 1.4, moderate: 1, fast: 0.72 };

const SINK_FN = /url\(|image\(|expression\(/i;
/** True if the value carries a non-printable control char (C0/C1) — an injection tell. */
function hasControlChar(v: string): boolean {
	for (let i = 0; i < v.length; i++) {
		const c = v.charCodeAt(i);
		if (c < 32 || (c >= 127 && c < 160)) return true;
	}
	return false;
}
/** Reject a value that could exfiltrate (a url()-accepting sink fetches it) or inject control chars. */
function assertSafeColor(v: string): void {
	if (SINK_FN.test(v) || hasControlChar(v)) {
		throw new Error(`vetrina: unsafe color value rejected (url()/image()/control chars): ${JSON.stringify(v)}`);
	}
}

/** Approximate relative luminance (0..1). Returns 0.5 (neutral) for values we can't parse. */
function luminance(c: string): number {
	const m = c.trim().toLowerCase();
	let r = 0;
	let g = 0;
	let b = 0;
	const hex = m.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
	if (hex) {
		let h = hex[1];
		if (h.length === 3)
			h = h
				.split('')
				.map((x) => x + x)
				.join('');
		r = parseInt(h.slice(0, 2), 16);
		g = parseInt(h.slice(2, 4), 16);
		b = parseInt(h.slice(4, 6), 16);
	} else {
		const rgb = m.match(/rgba?\(([^)]+)\)/);
		if (!rgb) return 0.5; // named / var() / gradient - the host's concern
		const parts = rgb[1].split(',').map((s) => parseFloat(s));
		r = parts[0] ?? 0;
		g = parts[1] ?? 0;
		b = parts[2] ?? 0;
	}
	const lin = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The legibility floor: pick a co-stroke that contrasts with the accent (F4). */
function contrastInk(accent: string): string {
	return luminance(accent) > 0.6 ? '#0c0e13' : '#ffffff';
}

/** Resolve a `Theme` (validating colors) into concrete tokens + pacing + shape for the stage. */
export function resolveTheme(theme: Theme = {}): ResolvedTheme {
	const tokens: Record<string, string> = {};
	const set = (cssVar: string, v: string) => {
		assertSafeColor(v);
		tokens[cssVar] = v;
	};
	if (theme.accent != null) {
		set('--vt-accent', theme.accent);
		// The cursor BODY tints from the accent too. It MUST be written inline on the SAME
		// layer as --vt-accent: `--vt-cursor-fill`'s default lives on :root (in the @layer),
		// where its `var(--vt-accent)` substitutes :root's accent — an inline accent override
		// on the layer would NOT re-resolve that already-inherited value, leaving the body
		// unthemed while the cues track the accent. Emitting it here (it substitutes the
		// layer's accent) keeps body + cues one color. An explicit tokens.cursorFill wins below.
		tokens['--vt-cursor-fill'] = 'var(--vt-accent)';
		// Adaptive co-stroke so a light or same-hue accent stays legible on any ground.
		const ink = contrastInk(theme.accent);
		tokens['--vt-cursor-stroke'] = ink;
		tokens['--vt-ring-halo'] = ink;
		tokens['--vt-glow-halo'] = ink;
		tokens['--vt-tick-halo'] = ink;
	}
	if (theme.tokens) {
		for (const [k, v] of Object.entries(theme.tokens)) {
			const cssVar = TOKEN_VAR[k as VtToken];
			if (cssVar && v != null) set(cssVar, v); // explicit token override wins over the adaptive default
		}
	}
	return {
		tokens,
		pace: SPEED_PACE[theme.speed ?? 'moderate'],
		pointer: theme.pointer ?? 'arrow',
		placement: theme.placement ?? 'bottom',
		silenced: new Set(
			Object.entries(theme.cues ?? {})
				.filter(([, v]) => v === false)
				.map(([k]) => k),
		),
	};
}
