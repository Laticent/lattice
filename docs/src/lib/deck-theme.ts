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
// A deck's PRESET recommends a palette and a color mode too (engineering/decisions/
// 2026-11-20-deck-preset-study.md §5 D1): an absent `theme:` / `color-mode:` reads as the
// preset's, exactly as the engine reads it (lib/core/front-matter-key.js
// `topLevelRegisterValue`), so the preview renders the palette the export does. The preset
// TABLE is the engine's, imported (HARD RULE #15); the rule that applies it is mirrored here.
//
// Pure (its own tiny front-matter reader, matching the engine's
// `parseFrontMatter` regex, and the engine's preset table as its one import) so BOTH the TS surfaces (Studio, single-slide) and the
// JS ones (playground-engine) can share ONE implementation instead of each re-reading
// front matter and re-deciding precedence. See engineering/decisions/
// 2026-07-08-deck-theme-independence.md.

/** The raw leading `---\n…\n---` front-matter block body, or '' when absent.
 *  CRLF-tolerant, matching lib/engine/directives.js parseFrontMatter. */
import frontMatterKey from '../../../lib/core/front-matter-key.js';

/** The engine's preset lookup, through a DEFAULT import: front-matter-key.js is CommonJS outside the
 *  docs root, and Rollup resolves a default import off it, not named ones (deck-preset.ts does the same). */
const PRESETS = frontMatterKey as unknown as { presetValue: (name: string, key: string) => string | null; frontMatterScalar: (raw: string) => string };

/** The engine's color-axis class tokens (lib/core/color-mode.js `COLOR_MODE_TOKENS`): any one in a deck-wide
 *  `class:` pins the scheme, so a preset's recommended color mode yields to it. Case-sensitive, as the engine reads it. */
const COLOR_AXIS = new Set(['dark', 'light', 'color-light', 'color-system', 'color-inherited', 'print']);

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
 *  Reads only the leading front-matter block (a deck-level global, like the engine),
 *  and only a TOP-LEVEL key: the engine's `parseFrontMatter` anchors at column 0 (#2050),
 *  so a `theme:` nested under another block is not the deck's palette. */
export function deckThemeName(source: string): string | null {
	return ownThemeName(source) ?? presetRecommends(source, 'theme');
}

/** The `theme:` the deck itself WRITES (top-level), or null — no preset fallback. */
function ownThemeName(source: string): string | null {
	const m = lastLine(/^theme[ \t]*:[ \t]*(.*)$/gm, frontMatterBody(source));
	if (!m) return null;
	const v = scalar(m[1]).trim();
	return v || null;
}

/** A value read by the engine's own scalar rule (quotes, a trailing comment); a comment-only value reads as ''. */
function scalar(raw: string): string {
	const t = raw.trim();
	return t.startsWith('#') ? '' : PRESETS.frontMatterScalar(t);
}

/** What the deck's top-level `preset:` recommends for `key`, or null (no preset, an unknown one, or a
 *  preset that leaves the key alone). */
function presetRecommends(source: string, key: string): string | null {
	const m = lastLine(/^preset[ \t]*:[ \t]*(.*)$/gm, frontMatterBody(source));
	if (!m) return null;
	const name = scalar(m[1]).trim();
	return name ? PRESETS.presetValue(name, key) : null;
}

/** The deck-wide `class:` tokens (front matter), lowercased + split. Deck-wide
 *  `class: dark` propagates a `.dark` (section-scoped `color-scheme:dark`) onto
 *  every slide — an explicit deck-dark pin. */
export function deckClassTokens(source: string): string[] {
	const m = lastLine(CLASS_LINE, frontMatterBody(source));
	if (!m) return [];
	return stripQuotes(m[1]).trim().split(/\s+/).filter(Boolean);
}

/** `class:` and `color-mode:` at COLUMN 0 — the two registers the engine also WRITES
 *  (`--print`, the Studio's front-matter writer, the Export-to-Marp boundary), and
 *  every writer anchors there because an indented `class:` may be a key nested under
 *  another one or a line inside a `style: |` block scalar. `^\s*` matched those too,
 *  so this preview could pin a mode off a nested key the engine correctly ignores.
 *  Mirrors `topLevelFrontMatterValue` in lib/core/front-matter-key.js — which this
 *  module cannot import (Rollup will not read named exports off a CJS file outside
 *  the docs root), hence the mirrored spelling and this note. */
const CLASS_LINE = /^class[ \t]*:[ \t]*(.*)$/gm;
const COLOR_MODE_LINE = /^color-mode[ \t]*:[ \t]*(.*)$/gm;

/** The LAST matching line: a repeated key reads as its last value, as the engine and
 *  `topLevelFrontMatterValue` read it (#3050, D1). `re` must carry the `g` and `m` flags. */
function lastLine(re: RegExp, body: string): RegExpMatchArray | null {
	return [...body.matchAll(re)].pop() ?? null;
}

/** The five first-class `color-mode:` values. `inherited` adopts the host (site) mode;
 *  `system` follows the OS; `print` renders the whole deck in the B&W-safe ink-on-white
 *  print band (section.print) — a medium, not a scheme, so it pins neither light nor dark
 *  (the band overrides the canvas). Mirrors lib/core/resolve-color-mode.js COLOR_MODE_NAMES. */
export type ColorMode = 'light' | 'dark' | 'system' | 'inherited' | 'print';

/** The deck's first-class `color-mode:` value (front matter), or null when it declares
 *  none. This SUPERSEDES the legacy `class: dark`/`class: light` color axis. */
export function deckColorMode(source: string): ColorMode | null {
	const m = lastLine(COLOR_MODE_LINE, frontMatterBody(source));
	const own = m ? scalar(m[1]).trim() : '';
	// The deck's preset answers only for an absent or empty key, and never over a scheme the deck pins
	// in `class:` (any color-axis token) or names a `-dark` theme — lib/core/resolve-color-mode.js
	// `deckColorModeValue`, which this mirrors.
	const legacyPin = deckClassTokens(source).some((t) => COLOR_AXIS.has(t)) || /-dark$/.test(ownThemeName(source) ?? '');
	const v = (own || (legacyPin ? '' : (presetRecommends(source, 'color-mode') ?? ''))).toLowerCase();
	return v === 'light' || v === 'dark' || v === 'system' || v === 'inherited' || v === 'print' ? v : null;
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
