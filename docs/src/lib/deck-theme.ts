// Deck theme independence — the deck's own `theme:` front matter is authoritative;
// the site palette is only a fallback for a deck that declares none.
//
// WHY THIS EXISTS
// Every docs preview surface used to read the site's `<html data-palette/-mode>`
// and hand it to the engine as an EXPLICIT theme, which overrides the deck's own
// `theme:` directive (lib/engine/index.js render(): `if (theme) globalBase.theme =
// theme`). So a themed deck rendered in whatever palette the website chrome
// happened to be on, and flipping the website palette re-styled a deck that had
// pinned its own — the two were fused into one global attribute. This pure helper
// splits them back into the two independent axes the user actually wants:
//
//   • PALETTE — the deck's `theme:` wins when present; the site palette is the
//     fallback for an un-themed deck. Changing the website palette never touches a
//     self-themed deck; a deck's theme never touches the website chrome.
//   • MODE (light/dark) — a SHARED axis: the site's light/dark drives a deck that
//     doesn't pin its own. But an explicit deck-dark pin (`class: dark` deck-wide,
//     a `<name>-dark` theme, or per-slide `<!-- _class: dark -->`, which is
//     section-scoped and already survives on its own) is authoritative and ignores
//     the site mode.
//
// Pure + dependency-free (its own tiny front-matter reader, matching the engine's
// `parseFrontMatter` regex) so BOTH the TS surfaces (Studio, single-slide) and the
// JS ones (playground-engine) can share ONE implementation instead of each re-reading
// front matter and re-deciding precedence. See engineering/decisions/
// 2026-07-08-deck-theme-independence.md.

/** The raw leading `---\n…\n---` front-matter block body, or '' when absent.
 *  CRLF-tolerant, matching lib/engine/directives.js parseFrontMatter. */
function frontMatterBody(source: string): string {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(String(source ?? ''));
	return m ? m[1] : '';
}

function stripQuotes(v: string): string {
	const t = v.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
	return t;
}

/** The deck's own `theme:` directive value, trimmed, or null when it declares none.
 *  Reads only the leading front-matter block (a deck-level global, like the engine). */
export function deckThemeName(source: string): string | null {
	const m = /^\s*theme:\s*(.*)$/m.exec(frontMatterBody(source));
	if (!m) return null;
	const v = stripQuotes(m[1]).trim();
	return v || null;
}

/** The deck-wide `class:` tokens (front matter), lowercased + split. Deck-wide
 *  `class: dark` propagates a `.dark` (section-scoped `color-scheme:dark`) onto
 *  every slide — an explicit deck-dark pin. */
export function deckClassTokens(source: string): string[] {
	const m = /^\s*class:\s*(.*)$/m.exec(frontMatterBody(source));
	if (!m) return [];
	return stripQuotes(m[1]).trim().split(/\s+/).filter(Boolean);
}

/** The four first-class `color-mode:` values. `inherited` adopts the host (site) mode;
 *  `system` follows the OS. Mirrors lib/core/resolve-color-mode.js COLOR_MODE_NAMES. */
export type ColorMode = 'light' | 'dark' | 'system' | 'inherited';

/** The deck's first-class `color-mode:` value (front matter), or null when it declares
 *  none. This SUPERSEDES the legacy `class: dark`/`class: light` color axis. */
export function deckColorMode(source: string): ColorMode | null {
	const m = /^\s*color-mode:\s*(.*)$/m.exec(frontMatterBody(source));
	if (!m) return null;
	const v = stripQuotes(m[1]).trim().toLowerCase();
	return v === 'light' || v === 'dark' || v === 'system' || v === 'inherited' ? v : null;
}

export type ResolvedDeckTheme = {
	/** Base palette name to render with (never a `-dark` variant — mode carries that). */
	palette: string;
	/** Effective light/dark: the deck's pin when it has one, else the site mode. */
	mode: 'light' | 'dark';
	/** The deck pins dark (`color-mode: dark`, a `-dark` theme, or the legacy `class: dark`) — ignore site mode. */
	pinnedDark: boolean;
	/** The deck pins light (`color-mode: light` or the legacy `class: light`) — ignore a dark site mode. */
	pinnedLight: boolean;
	/** The deck's authored `color-mode:` value, or null. `system`/`inherited` don't PIN
	 *  a light/dark side (the section tokens follow the OS / host); the drawer reflects it. */
	colorMode: ColorMode | null;
	/** The palette came from the deck's own `theme:`, not the site fallback. */
	fromDeck: boolean;
};

/** The mode a caller should force on the render (DeckPreview's modeOverride), or
 *  undefined when the deck follows the shared site mode. */
export function pinnedMode(r: ResolvedDeckTheme): 'light' | 'dark' | undefined {
	return r.pinnedDark ? 'dark' : r.pinnedLight ? 'light' : undefined;
}

/**
 * Resolve the palette + mode a deck should render with, given the current site
 * (website) palette + mode. `isKnownTheme(name)` gates whether a deck's declared
 * `theme:` is honored — an unknown/misspelled name falls through to the site
 * palette (the deck-config drawer already surfaces the "unknown theme" note), so a
 * typo never blanks the preview with a 404 theme fetch. `name` is passed BOTH bare
 * and with any `-dark` stripped, so a caller can accept either form.
 */
export function resolveDeckTheme(
	source: string,
	opts: { sitePalette: string; siteMode: 'light' | 'dark'; isKnownTheme: (name: string) => boolean },
): ResolvedDeckTheme {
	const raw = deckThemeName(source);
	let palette = opts.sitePalette;
	let fromDeck = false;
	let darkTheme = false;

	if (raw) {
		const isDarkVariant = /-dark$/.test(raw);
		const base = raw.replace(/-dark$/, '');
		// Prefer an EXACT-name match before stripping `-dark`. A saved (Fabricated)
		// theme is registered under its FULL name and may legitimately end in `-dark`
		// (e.g. `noir-dark`, whose base `noir` is NOT separately registered) — stripping
		// it would fetch a nonexistent `noir.css` and blank the preview/export. Built-in
		// `-dark` variants are the opposite: `cuoio-dark` is NOT registered but `cuoio`
		// is, so it falls to the base branch (unchanged) and the render re-expands the
		// `-dark` via `hasTheme(palette + '-dark')`.
		if (opts.isKnownTheme(raw)) {
			palette = raw;
			fromDeck = true;
			if (isDarkVariant) darkTheme = true;
		} else if (opts.isKnownTheme(base)) {
			palette = base;
			fromDeck = true;
			if (isDarkVariant) darkTheme = true;
		}
	}

	// The first-class `color-mode:` key is authoritative when present. `light`/`dark`
	// PIN a side (ignore the site mode); `system` follows the OS and `inherited` follows
	// the host (site) toggle — NEITHER pins here (the engine's section tokens —
	// `color-system` / `color-inherited` — do the CSS work in the preview), so the deck
	// tracks the site mode as its ambient.
	const colorMode = deckColorMode(source);
	if (colorMode) {
		const pinnedDark = colorMode === 'dark';
		const pinnedLight = colorMode === 'light';
		const mode = pinnedDark ? 'dark' : pinnedLight ? 'light' : opts.siteMode;
		return { palette, mode, pinnedDark, pinnedLight, colorMode, fromDeck };
	}

	// Legacy fallback (no `color-mode:` key): the deck-wide `class: dark` / `class: light`
	// alias + a `-dark` theme's implicit dark. One vocabulary shared with the per-slide
	// `_class: dark` / `_class: light`. An explicit `class: light` wins over a `-dark`
	// theme's implicit dark; a deck wouldn't sanely carry both, but if it does `dark` wins.
	const tokens = new Set(deckClassTokens(source).map((t) => t.toLowerCase()));
	const classDark = tokens.has('dark');
	const classLight = tokens.has('light');
	const pinnedDark = classDark || (darkTheme && !classLight);
	const pinnedLight = classLight && !classDark;

	const mode = pinnedDark ? 'dark' : pinnedLight ? 'light' : opts.siteMode;
	// Surface the legacy alias as its color-mode equivalent so the drawer shows a value.
	const legacyColorMode: ColorMode | null = classDark ? 'dark' : classLight ? 'light' : null;
	return { palette, mode, pinnedDark, pinnedLight, colorMode: legacyColorMode, fromDeck };
}
