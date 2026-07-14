import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, deckOutputLang, detectLanguage, languageDirective, languageFor, languageLabel, resolveSupported, STUDIO_LANGUAGES } from './studio-language';

describe('studio-language — catalog', () => {
	it('is English-only for now and lists en-US first (the house default)', () => {
		expect(STUDIO_LANGUAGES.map((l) => l.code)).toEqual(['en-US', 'en-GB']);
		expect(DEFAULT_LANGUAGE).toBe('en-US');
	});
	it('has unique codes and a label + endonym + flag for every entry', () => {
		const codes = STUDIO_LANGUAGES.map((l) => l.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const l of STUDIO_LANGUAGES) {
			expect(l.label.length).toBeGreaterThan(0);
			expect(l.endonym.length).toBeGreaterThan(0);
			expect(l.flag).toMatch(/^[a-z]{2}$/); // an ISO 3166 alpha-2 for a vendored flag SVG
		}
	});
});

describe('studio-language — detectLanguage', () => {
	it('matches an exact BCP-47 tag (case-insensitive)', () => {
		expect(detectLanguage({ language: 'en-GB' })).toBe('en-GB');
		expect(detectLanguage({ language: 'EN-us' })).toBe('en-US');
	});
	it('resolves a region-less tag to the house default for that language', () => {
		expect(detectLanguage({ language: 'en' })).toBe('en-US'); // not en-GB
	});
	it('prefers the first supported entry in navigator.languages', () => {
		expect(detectLanguage({ languages: ['de-DE', 'en-GB'] })).toBe('en-GB'); // de-DE unsupported, en-GB wins
	});
	it('falls back to en-US for an unsupported or missing locale', () => {
		expect(detectLanguage({ language: 'ja-JP' })).toBe(DEFAULT_LANGUAGE);
		expect(detectLanguage({ language: 'fr-FR' })).toBe(DEFAULT_LANGUAGE); // no longer supported → default
		expect(detectLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
		expect(detectLanguage({})).toBe(DEFAULT_LANGUAGE);
	});
});

describe('studio-language — directive + labels', () => {
	it('languageFor / languageLabel fall back to the default for unknown codes', () => {
		expect(languageFor('zz-ZZ').code).toBe(DEFAULT_LANGUAGE);
		expect(languageFor('fr-FR').code).toBe(DEFAULT_LANGUAGE); // dropped language → default descriptor
		expect(languageLabel('en-GB')).toBe('English (United Kingdom)');
	});
	it('directive names the language and folds in the spelling note', () => {
		const us = languageDirective('en-US');
		expect(us).toContain('English (United States)');
		expect(us).toContain('American spelling');
		expect(languageDirective('en-GB')).toContain('British spelling');
	});
	it('directive protects code / component names / _class from translation', () => {
		const d = languageDirective('en-GB');
		expect(d).toContain('English (United Kingdom)');
		expect(d).toContain('_class');
	});
	it('always returns a non-empty directive, even for an unknown code', () => {
		expect(languageDirective(null).length).toBeGreaterThan(0);
	});
});

describe('studio-language — resolveSupported', () => {
	it('resolves canonical, case-variant, and base-language English tags to a catalog code', () => {
		expect(resolveSupported('en-US')).toBe('en-US');
		expect(resolveSupported('en-GB')).toBe('en-GB');
		expect(resolveSupported('EN-us')).toBe('en-US'); // case-insensitive
		expect(resolveSupported('en')).toBe('en-US'); // base → house default
	});
	it('returns null for a genuinely-unsupported or empty tag (unlike languageFor)', () => {
		expect(resolveSupported('fr-FR')).toBeNull();
		expect(resolveSupported('fr')).toBeNull();
		expect(resolveSupported('es')).toBeNull();
		expect(resolveSupported('')).toBeNull();
		expect(resolveSupported(null)).toBeNull();
		expect(resolveSupported(undefined)).toBeNull();
		// languageFor never returns null — it substitutes the default; resolveSupported is the honest test.
		expect(languageFor('fr-FR').code).toBe('en-US');
	});
});

describe('studio-language — deckOutputLang (document vs AI-output split)', () => {
	it('prefers the deck ai-lang override over the document lang', () => {
		expect(deckOutputLang('---\nlang: en-US\nai-lang: en-GB\n---\n\n# Hi')).toBe('en-GB');
	});
	it('falls back to the document lang when no ai-lang is set', () => {
		expect(deckOutputLang('---\nlang: en-GB\n---\n\n# Hi')).toBe('en-GB');
	});
	it('returns empty when neither is set (caller applies the workspace default)', () => {
		expect(deckOutputLang('# Hi, no front matter')).toBe('');
		expect(deckOutputLang('---\ntheme: indaco\n---\n\n# Hi')).toBe('');
	});
});
