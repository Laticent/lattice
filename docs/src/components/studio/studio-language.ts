// The Studio language. TWO fields that DEFAULT to the same value but are no longer
// one knob (2026-07-14-language-settings.md, "split the data model"):
//   · DOCUMENT language — a deck's `lang:` (else the workspace default). What the deck
//     IS: carried into the preview + every export as `<html lang>`, and read-aloud.
//   · AI-OUTPUT language — what the AI WRITES a deck's prose in. Defaults to the
//     document language, but a deck's `ai-lang:` overrides it independently (deckOutputLang).
// They coincide today (English-only, so both resolve to English), but keeping them
// separate means a future TRANSLATION LENS gets its source (document) vs target
// (AI-output) distinction for free — no un-fusing of callers. Either way this governs
// natural-language prose ONLY: theme and component generation stay canonical English
// (a structural contract — slugs, CSS, manifest keys, `_class` invokes — that must
// stay ASCII/English to pass the gates and resolve at render time).
//
// We support English only for now. The end goal is any language plus that lens; the
// list is data-driven so widening it later is rows of data, not a refactor (the real
// gate is fonts + layout — RTL, CJK line breaking — not the catalog). Adding a
// language means: a row here + its flag SVG under docs/public/flags/, nothing more.

import { getFrontMatter } from './front-matter';

export type StudioLanguage = {
	/** BCP-47 tag — also the value persisted in Studio settings / a deck's `lang:`. */
	code: string;
	/** Menu label, written in English so the picker stays legible in any locale. */
	label: string;
	/** The language's own name, shown as a secondary hint in the picker. */
	endonym: string;
	/** ISO 3166 alpha-2 country whose vendored flag SVG marks this row (flagSrc). */
	flag: string;
	/** Optional extra clause folded into the directive (e.g. a spelling note). */
	note?: string;
};

// The region-canonical entry comes FIRST per base language, so a region-less
// browser tag ('en') resolves to the house default for that language
// (en → en-US). Order is load-bearing — see detectLanguage.
export const STUDIO_LANGUAGES: StudioLanguage[] = [
	{ code: 'en-US', label: 'English (United States)', endonym: 'English', flag: 'us', note: 'Use American spelling, idiom, and punctuation (color, organize, -ize endings).' },
	{ code: 'en-GB', label: 'English (United Kingdom)', endonym: 'English', flag: 'gb', note: 'Use British spelling, idiom, and punctuation (-our and -ise endings, single quotes).' },
];

/** The house default when nothing is saved and the browser can't be matched. */
export const DEFAULT_LANGUAGE = 'en-US';

const byCode = new Map(STUDIO_LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** The descriptor for a code, falling back to the default's descriptor. */
export function languageFor(code: string | null | undefined): StudioLanguage {
	return byCode.get(String(code ?? '').toLowerCase()) ?? (byCode.get(DEFAULT_LANGUAGE.toLowerCase()) as StudioLanguage);
}

/** The menu label for a code (default's label when unknown). */
export function languageLabel(code: string | null | undefined): string {
	return languageFor(code).label;
}

/**
 * The supported catalog code a raw tag maps to — exact (case-insensitive), or the
 * base-language house default (`en` / `en-us` / `EN-GB` → `en-US` / `en-GB`) — or
 * null when it maps to nothing supported (e.g. `fr-FR`, `es`). Distinct from
 * `languageFor`, which never returns null (it substitutes the default descriptor):
 * this answers "IS this value one we support?", which `languageFor` conflates. The
 * picker uses it so a valid English tag isn't branded "unsupported" over a spurious
 * exact-string miss, while a genuinely-dropped locale still is. Mirrors
 * `detectLanguage`'s exact-then-base resolution for a single tag.
 */
export function resolveSupported(code: string | null | undefined): string | null {
	const raw = String(code ?? '').toLowerCase();
	if (!raw) return null;
	const exact = byCode.get(raw);
	if (exact) return exact.code;
	const base = raw.split('-')[0];
	const hit = STUDIO_LANGUAGES.find((l) => l.code.toLowerCase().split('-')[0] === base);
	return hit ? hit.code : null;
}

/**
 * The language the AI writes a DECK's prose in — the deck's explicit AI-output
 * override (`ai-lang:`), else its DOCUMENT language (`lang:`), else '' so the caller
 * applies the workspace default (`withStudioVoice`'s `deckLang || loadSettings()`).
 *
 * This is the SPLIT: the document language (`lang:` alone → `<html lang>`, exports,
 * read-aloud) and the AI-output language are two fields that default to the same
 * value but resolve independently, so a future translation lens (or a wider catalog)
 * can have the AI write a language OTHER than the deck's own — WITHOUT the document
 * paths, which read `lang:` only, ever seeing `ai-lang:`. The AI paths call this; the
 * document paths must NOT (they'd leak the AI target into `<html lang>`).
 */
export function deckOutputLang(source: string): string {
	return getFrontMatter(source, 'ai-lang') || getFrontMatter(source, 'lang') || '';
}

type NavLike = { language?: string; languages?: readonly string[] };

/**
 * Resolve a browser locale to a supported language code. An exact tag match wins;
 * else the first supported entry sharing the base language (list order encodes the
 * house default per language, so 'en' → en-US); else DEFAULT_LANGUAGE. Safe with no
 * navigator (tests / SSR).
 */
export function detectLanguage(nav: NavLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as NavLike)): string {
	const tags = [...(nav?.languages ?? []), nav?.language].filter((t): t is string => !!t);
	for (const raw of tags) {
		const exact = byCode.get(raw.toLowerCase());
		if (exact) return exact.code;
	}
	for (const raw of tags) {
		const base = raw.toLowerCase().split('-')[0];
		const hit = STUDIO_LANGUAGES.find((l) => l.code.toLowerCase().split('-')[0] === base);
		if (hit) return hit.code;
	}
	return DEFAULT_LANGUAGE;
}

/**
 * The system-prompt clause that pins the AI's prose to `code`. Scoped to
 * natural-language content (and explicit about leaving code / component names /
 * `_class` directives alone) so it never fights the deck's structural markup.
 * Always returns a non-empty directive — languageFor always resolves.
 */
export function languageDirective(code: string | null | undefined): string {
	const lang = languageFor(code);
	const note = lang.note ? ` ${lang.note}` : '';
	return (
		`Write all natural-language prose — slide titles, body copy, speaker notes, and your chat replies — in ${lang.label}.${note} ` +
		"Match that language's grammar, idiom, punctuation, and number/date conventions. Do not switch languages unless the author explicitly asks. " +
		'Leave code, Lattice component names, and `_class` directives exactly as given — do not translate them.'
	);
}
