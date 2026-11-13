import { CompletionContext } from '@codemirror/autocomplete';
import { css } from '@codemirror/lang-css';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import typeTokens from '../../../../lib/core/type-tokens.js';
import { cssTokenCompletion, tokenNameAt } from './css-token-complete';

// Slice 4 of the autocomplete audit: the Studio's CSS fields complete token names inside `var(`, from the palette
// contract and the type scale, beside CodeMirror's own CSS completion (CodeField.tsx).
async function labels(doc: string) {
	const ctx = new CompletionContext(EditorState.create({ doc }), doc.length, false);
	const got = await cssTokenCompletion(ctx);
	return got ? got.options.map((o) => o.label) : [];
}

describe('tokenNameAt', () => {
	it('finds the name being typed inside var(', () => {
		expect(tokenNameAt('color: var(--acc')).toEqual({ from: 11, typed: '--acc' });
		expect(tokenNameAt('color: var(')).toEqual({ from: 11, typed: '' });
		expect(tokenNameAt('color: var( -')).toEqual({ from: 12, typed: '-' });
	});
	it('is quiet outside var(', () => {
		expect(tokenNameAt('--accent: #fff')).toBeNull();
		expect(tokenNameAt('color: red')).toBeNull();
		expect(tokenNameAt('section.cards')).toBeNull();
	});
});

describe('cssTokenCompletion', () => {
	it('offers the palette contract and the type scale after var(--', async () => {
		const got = await labels('section.x { color: var(--');
		expect(got).toEqual(expect.arrayContaining(['--accent', '--text-heading', '--bg', '--chart-cat1', '--fs-body']));
	});
	it('offers every type token the ownership gate accepts, and no other --fs- name', async () => {
		const got = (await labels('h2 { font-size: var(--')).filter((l) => l.startsWith('--fs-'));
		expect(new Set(got)).toEqual(typeTokens.TYPE_TOKEN_NAMES);
	});
	it('puts the type scale first after font-size, and the palette first elsewhere', async () => {
		const ctx = (doc: string) => new CompletionContext(EditorState.create({ doc }), doc.length, false);
		const sizing = await cssTokenCompletion(ctx('h2 { font-size: var(--'));
		const coloring = await cssTokenCompletion(ctx('h2 { color: var(--'));
		const boostOf = (r: typeof sizing, label: string) => r?.options.find((o) => o.label === label)?.boost ?? 0;
		expect(boostOf(sizing, '--fs-body')).toBeGreaterThan(0);
		expect(boostOf(coloring, '--fs-body')).toBeLessThan(0);
	});
	it('runs beside the CSS language’s own completion, not instead of it', () => {
		const state = EditorState.create({ doc: 'a { col', extensions: [css(), EditorState.languageData.of(() => [{ autocomplete: cssTokenCompletion }])] });
		const sources = state.languageDataAt('autocomplete', state.doc.length);
		expect(sources).toContain(cssTokenCompletion);
		expect(sources.length).toBeGreaterThan(1);
	});
});
