import { afterEach, describe, expect, it } from 'vitest';
import { buildSheetText, collectPillRules, PILL_SCOPE, pillSheetReady, releasePillSheet, syncPillSheet, tokenNames } from './pill-sheet';

function sheetFrom(css: string): CSSStyleSheet {
	const style = document.createElement('style');
	style.textContent = css;
	document.head.append(style);
	return style.sheet as CSSStyleSheet;
}

describe('collectPillRules', () => {
	const css = `
		article.lattice > section .lat-pill[data-shape]{display:inline-block;padding:var(--pill-pad-y) var(--pill-pad-x);background:var(--pill-bg,var(--bg))}
		article.lattice > section .lat-pill[data-shape="tag"]{border-radius:var(--pill-radius)}
		article.lattice > section h2{font-size:2em;color:var(--text-heading)}
		.card{background:var(--surface)}
		@media (min-width:1px){ article.lattice > section .lat-pill{font-size:var(--pill-fs)} .other{color:red} }
		@media print{ .unrelated{color:blue} }
	`;
	const rules = collectPillRules([sheetFrom(css)]);

	it('keeps every rule that styles a pill, and nothing else', () => {
		expect(rules.some((r) => r.includes('lat-pill[data-shape]') && r.includes('inline-block'))).toBe(true);
		expect(rules.some((r) => r.includes('data-shape="tag"') || r.includes("data-shape=\"tag\""))).toBe(true);
		expect(rules.join('\n')).not.toMatch(/h2|\.card|\.unrelated|\.other/);
	});

	it('keeps a pill rule inside @media together with its wrapper', () => {
		const wrapped = rules.find((r) => r.startsWith('@media'));
		expect(wrapped).toBeTruthy();
		expect(wrapped).toContain('lat-pill');
		expect(wrapped).not.toContain('.other');
	});

	it('survives a sheet it may not read', () => {
		const hostile = { get cssRules(): CSSRuleList { throw new DOMException('no', 'SecurityError'); } } as unknown as CSSStyleSheet;
		expect(collectPillRules([hostile])).toEqual([]);
	});
});

describe('tokenNames', () => {
	it('lists each custom property the rules read once, in first-use order', () => {
		const names = tokenNames(['a{padding:var(--pill-pad-y) var(--pill-pad-x);background:var( --pill-bg , var(--bg))}', 'b{color:var(--pill-pad-y)}']);
		expect(names).toEqual(['--pill-pad-y', '--pill-pad-x', '--pill-bg', '--bg']);
	});
});

describe('buildSheetText', () => {
	it('puts the tokens on the scope and the rules inside @scope, and leaves out empty tokens', () => {
		const text = buildSheetText(['.lat-pill{display:inline-block}'], { '--pill-bg': 'red', '--empty': '' });
		expect(text.startsWith(`.${PILL_SCOPE}{--pill-bg:red}`)).toBe(true);
		expect(text).not.toContain('--empty');
		expect(text).toContain(`@scope (.${PILL_SCOPE}){.lat-pill{display:inline-block}}`);
	});

	it('carries the preview frame\'s color scheme, so light-dark() resolves as it does in the slide', () => {
		expect(buildSheetText([], { '--a': 'light-dark(#fff, #000)' }, 'dark')).toBe(`.${PILL_SCOPE}{--a:light-dark(#fff, #000);color-scheme:dark}\n@scope (.${PILL_SCOPE}){}`);
		expect(buildSheetText([], {}, 'light dark')).toContain('color-scheme:light dark');
	});

	it('keeps a scheme the deck pins with `only`', () => {
		expect(buildSheetText([], {}, 'only dark')).toContain('color-scheme:only dark');
		expect(buildSheetText([], {}, 'light dark only')).toContain('color-scheme:light dark only');
	});

	it('writes no scheme it does not recognize, so a stray value can never reach the stylesheet', () => {
		expect(buildSheetText([], {}, 'dark; background:red')).not.toContain('color-scheme');
		expect(buildSheetText([], {}, '')).not.toContain('color-scheme');
	});
});

describe('syncPillSheet', () => {
	afterEach(releasePillSheet);

	it('is not ready, and does not throw, when there is no preview frame', () => {
		expect(syncPillSheet()).toBe(false);
		expect(pillSheetReady()).toBe(false);
	});
});
