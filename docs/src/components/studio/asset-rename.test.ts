// Unit: renaming a saved asset, propagated into deck source.
//
// This is the piece that edits decks the author is NOT looking at, so the tests are
// weighted toward what must NOT change: a fenced code sample that merely talks about
// `_class`, a token that only starts with the old name, an unrelated deck, and the
// bytes around every edit.

import { describe, expect, it } from 'vitest';
import { renameAssetAcrossDecks, renameAssetInSource } from './asset-rename';

const deck = (body: string, fm = 'theme: indaco\n') => `---\n${fm}---\n\n${body}`;

describe('renameAssetInSource — theme', () => {
	it('rewrites the deck-wide theme key', () => {
		const src = deck('# Title\n', 'theme: midnight\npaginate: true\n');
		const out = renameAssetInSource(src, 'theme', 'midnight', 'midnight-blue');
		expect(out.hits).toBe(1);
		expect(out.source).toContain('theme: midnight-blue');
		expect(out.source).toContain('paginate: true'); // the neighbors are untouched
	});

	it('leaves a deck on a different theme alone', () => {
		const src = deck('# Title\n', 'theme: indaco\n');
		expect(renameAssetInSource(src, 'theme', 'midnight', 'midnight-blue')).toEqual({ source: src, hits: 0 });
	});
});

describe('renameAssetInSource — component', () => {
	it('rewrites the class token on every slide that uses it', () => {
		const src = deck('<!-- _class: scorecard -->\n\n# A\n\n---\n\n<!-- _class: scorecard dark -->\n\n# B\n');
		const out = renameAssetInSource(src, 'component', 'scorecard', 'scoreboard');
		expect(out.hits).toBe(2);
		expect(out.source).toContain('<!-- _class: scoreboard -->');
		expect(out.source).toContain('<!-- _class: scoreboard dark -->');
		expect(out.source).not.toContain('scorecard');
	});

	it('keeps the other tokens, and their order', () => {
		const src = deck('<!-- _class: dark scorecard compact -->\n\n# A\n');
		const out = renameAssetInSource(src, 'component', 'scorecard', 'scoreboard');
		expect(out.source).toContain('<!-- _class: dark scoreboard compact -->');
	});

	it('does NOT touch a token that merely starts with the old name', () => {
		// `scorecard-wide` is a different component. A substring rewrite would rename it
		// to `scoreboard-wide` and break a deck that was never referring to this asset.
		const src = deck('<!-- _class: scorecard-wide -->\n\n# A\n');
		expect(renameAssetInSource(src, 'component', 'scorecard', 'scoreboard')).toEqual({ source: src, hits: 0 });
	});

	it('does NOT edit a `_class` written inside a fenced code block', () => {
		// A `code` slide DEMONSTRATING the directive is documentation, not a reference.
		const src = deck('<!-- _class: code -->\n\n# Docs\n\n```md\n<!-- _class: scorecard -->\n```\n');
		const out = renameAssetInSource(src, 'component', 'scorecard', 'scoreboard');
		expect(out.hits).toBe(0);
		expect(out.source).toContain('<!-- _class: scorecard -->'); // the sample survives verbatim
	});
});

describe('renameAssetInSource — finish', () => {
	it('rewrites the deck-wide key AND the per-slide finish- token', () => {
		const src = deck('<!-- _class: title finish-velvet -->\n\n# A\n', 'theme: indaco\nfinish: velvet\n');
		const out = renameAssetInSource(src, 'finish', 'velvet', 'navy');
		expect(out.hits).toBe(2);
		expect(out.source).toContain('finish: navy');
		expect(out.source).toContain('<!-- _class: title finish-navy -->');
	});

	it('leaves finish-override alone — it is keyed on LAYER names, not the finish name', () => {
		// The tempting bug: "the override belongs to this finish, so move it too." It does
		// not — the keys are the layer names of whichever finish is active, so rewriting
		// one to the new finish name would silently void the author's tuning.
		const src = '---\ntheme: indaco\nfinish: velvet\nfinish-override:\n  backdrop: { strength: 0.4 }\n---\n\n# A\n';
		const out = renameAssetInSource(src, 'finish', 'velvet', 'navy');
		expect(out.source).toContain('finish: navy');
		expect(out.source).toContain('backdrop: { strength: 0.4 }');
		expect(out.source).not.toContain('navy: { strength');
	});

	it('does not mistake a component named like the finish', () => {
		const src = deck('<!-- _class: velvet -->\n\n# A\n');
		// The finish token is `finish-velvet`; a bare `velvet` component is a different asset.
		expect(renameAssetInSource(src, 'finish', 'velvet', 'navy')).toEqual({ source: src, hits: 0 });
	});
});

describe('renameAssetInSource — guards', () => {
	it('is a no-op for an empty or unchanged name', () => {
		const src = deck('<!-- _class: scorecard -->\n\n# A\n');
		expect(renameAssetInSource(src, 'component', 'scorecard', 'scorecard').hits).toBe(0);
		expect(renameAssetInSource(src, 'component', '', 'x').hits).toBe(0);
		expect(renameAssetInSource(src, 'component', 'scorecard', '').hits).toBe(0);
	});

	it('preserves every untouched byte around the edit', () => {
		const src = deck('<!-- _class: scorecard -->\n<!-- _footer: hello -->\n\n# A\n\nBody with trailing spaces   \n');
		const out = renameAssetInSource(src, 'component', 'scorecard', 'scoreboard');
		expect(out.source).toBe(src.replace('scorecard', 'scoreboard'));
	});
});

describe('renameAssetAcrossDecks', () => {
	it('returns only the decks that changed', () => {
		const decks: Array<[string, string]> = [
			['a', deck('<!-- _class: scorecard -->\n\n# A\n')],
			['b', deck('# B with no components\n')],
			['c', deck('<!-- _class: scorecard dark -->\n\n# C\n')],
		];
		const { changed, hits } = renameAssetAcrossDecks(decks, 'component', 'scorecard', 'scoreboard');
		expect([...changed.keys()]).toEqual(['a', 'c']);
		expect(hits).toBe(2);
		// A deck that never mentioned the asset must not be rewritten — writing it would
		// bump it in every recently-changed surface and add a version for nothing.
		expect(changed.has('b')).toBe(false);
	});

	it('counts every reference, not every deck', () => {
		const decks: Array<[string, string]> = [['a', deck('<!-- _class: scorecard -->\n\n# A\n\n---\n\n<!-- _class: scorecard -->\n\n# B\n')]];
		expect(renameAssetAcrossDecks(decks, 'component', 'scorecard', 'scoreboard').hits).toBe(2);
	});
});
