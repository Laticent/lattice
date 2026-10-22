import { afterEach, describe, expect, it } from 'vitest';
import { drawMath, mathReady } from './math-draw';

const katex = {
	renderToString: (tex: string) => `<span class="katex"><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>${tex}</mi></math><script>alert(1)</script><img src=x onerror="alert(2)"></span>`,
};

afterEach(() => {
	window.__latticeKatex = undefined;
});

describe('drawing math', () => {
	it('returns null until the KaTeX bundle has loaded, so the caller draws the TeX', () => {
		expect(mathReady()).toBe(false);
		expect(drawMath('x', false)).toBeNull();
	});
	it('draws the engine KaTeX as MathML and strips anything that runs', () => {
		window.__latticeKatex = katex;
		expect(mathReady()).toBe(true);
		const frag = drawMath('x', false);
		const host = document.createElement('div');
		host.append(frag as DocumentFragment);
		expect(host.querySelector('math')).toBeTruthy();
		expect(host.querySelector('script')).toBeNull();
		expect(host.querySelector('img')).toBeNull();
		expect(host.innerHTML).not.toMatch(/onerror|alert/);
	});
	it('asks KaTeX for MathML with trust off and no throw', () => {
		let seen: Record<string, unknown> = {};
		window.__latticeKatex = {
			renderToString: (_t: string, o?: Record<string, unknown>) => {
				seen = o ?? {};
				return '<math></math>';
			},
		};
		drawMath('x', true);
		expect(seen).toMatchObject({ output: 'mathml', displayMode: true, throwOnError: false, trust: false });
	});
	it('a KaTeX that throws draws nothing, not an error', () => {
		window.__latticeKatex = {
			renderToString: () => {
				throw new Error('boom');
			},
		};
		expect(drawMath('x', false)).toBeNull();
	});
});
