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

export type ResolvedDeckTheme = {
	/** Base palette name to render with (never a `-dark` variant — mode carries that). */
	palette: string;
	/** Effective light/dark: the deck's pin when it has one, else the site mode. */
	mode: 'light' | 'dark';
	/** The deck pins dark (a `-dark` theme, or deck-wide `class: dark`) — ignore site mode. */
	pinnedDark: boolean;
	/** The deck pins light (deck-wide `class: light`) — ignore a dark site mode. */
	pinnedLight: boolean;
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
		// Honor the deck theme when EITHER the bare name or its base (sans -dark) is
		// registered — so `theme: cuoio` and `theme: cuoio-dark` both resolve.
		if (opts.isKnownTheme(raw) || opts.isKnownTheme(base)) {
			palette = base;
			fromDeck = true;
			if (isDarkVariant) darkTheme = true;
		}
	}

	// Deck-wide `class: dark` / `class: light` are explicit color-mode pins — one
	// vocabulary shared with the per-slide `_class: dark` / `_class: light`. An
	// explicit `class: light` wins over a `-dark` theme's implicit dark; a deck
	// wouldn't sanely carry both `dark` and `light`, but if it does, `dark` wins.
	const tokens = new Set(deckClassTokens(source).map((t) => t.toLowerCase()));
	const classDark = tokens.has('dark');
	const classLight = tokens.has('light');
	const pinnedDark = classDark || (darkTheme && !classLight);
	const pinnedLight = classLight && !classDark;

	const mode = pinnedDark ? 'dark' : pinnedLight ? 'light' : opts.siteMode;
	return { palette, mode, pinnedDark, pinnedLight, fromDeck };
}
