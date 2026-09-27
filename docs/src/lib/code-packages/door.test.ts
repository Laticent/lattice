// The Studio's door for code packages, the parts that need no sandbox frame (door.ts): which
// packages a deck needs approved, consent pinned to the bytes, the stamp every preview cache keys
// on, and the render wrapper's two passes. The sandboxed frame itself is proven on the real Studio
// (docs/e2e/code-packages.spec.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveCodePackage, codeDigest, codePackagesStamp, isApproved, renderWithCodePackages, revokeCodePackage, setCodePackages, unapprovedIn } from './door';

const CODE = 'function t(s){return s.html}export{t as default};';

beforeEach(async () => {
	localStorage.clear();
	await setCodePackages([{ name: 'tally', code: CODE }]);
});
afterEach(async () => {
	await setCodePackages([]);
});

describe('which packages a deck needs approved', () => {
	it('reads class directives, front matter and pane markers; skips fenced code', () => {
		expect(unapprovedIn('<!-- _class: tally -->\n\n## x').map((p) => p.name)).toEqual(['tally']);
		expect(unapprovedIn('---\nclass: tally\n---\n\n## x').map((p) => p.name)).toEqual(['tally']);
		expect(unapprovedIn('## host\n\n<!-- pane: tally -->\n\n- 3').map((p) => p.name)).toEqual(['tally']);
		expect(unapprovedIn('## x\n\n```md\n<!-- _class: tally -->\n```\n')).toEqual([]);
		expect(unapprovedIn('<!-- _class: other -->')).toEqual([]);
	});

	it('an approval is for exactly this code, in this browser, and can be withdrawn', async () => {
		const sha256 = await codeDigest(CODE);
		expect(isApproved({ name: 'tally', sha256 })).toBe(false);
		approveCodePackage({ name: 'tally', sha256 });
		expect(unapprovedIn('<!-- _class: tally -->')).toEqual([]);
		expect(isApproved({ name: 'tally', sha256: await codeDigest(`${CODE} `) })).toBe(false);
		revokeCodePackage('tally');
		expect(isApproved({ name: 'tally', sha256 })).toBe(false);
	});

	it('the stamp names each package, its code and its approval, and is empty with none', async () => {
		expect(codePackagesStamp()).toMatch(/^\/\* lattice code packages: tally@[0-9a-f]{16}- \*\/$/);
		approveCodePackage({ name: 'tally', sha256: await codeDigest(CODE) });
		expect(codePackagesStamp()).toMatch(/tally@[0-9a-f]{16}\+/);
		await setCodePackages([]);
		expect(codePackagesStamp()).toBe('');
	});
});

describe('the render wrapper', () => {
	const calls: { hook: boolean }[] = [];
	const PG = {
		render(source: string, _theme: string, opts?: Record<string, unknown>) {
			calls.push({ hook: typeof opts?.codePackages === 'function' });
			let html = `<article><section class="${source}"><p>x</p></section></article>`;
			if (typeof opts?.codePackages === 'function') html = (opts.codePackages as (h: string, c: object) => string)(html, { slideIndex: (i: number) => i, idPrefix: '' });
			return { html };
		},
	};
	beforeEach(() => {
		calls.length = 0;
	});

	it('with no package it is exactly the engine: one render, no hook', async () => {
		await setCodePackages([]);
		await renderWithCodePackages(PG, 'tally', 'indaco', {});
		expect(calls).toEqual([{ hook: false }]);
	});

	it('a deck no package claims renders once; an unapproved claim renders twice and carries the note', async () => {
		await renderWithCodePackages(PG, 'plain', 'indaco', {});
		expect(calls.length).toBe(1);
		calls.length = 0;
		const out = await renderWithCodePackages<{ html: string }>(PG, 'tally', 'indaco', {});
		expect(calls.length).toBe(2);
		expect(out.html).toContain('data-package-error="tally"');
		expect(out.html).toContain('its code has not been approved in this browser');
	});

	it('the preview flag never reaches the engine', async () => {
		let seen: Record<string, unknown> | undefined;
		const PGseen = {
			render: (_s: string, _t: string, o?: Record<string, unknown>) => {
				seen = o;
				return { html: '' };
			},
		};
		await renderWithCodePackages(PGseen, 'x', 'indaco', { codeStatus: true, baseUrl: '/b/' });
		expect(seen).toMatchObject({ baseUrl: '/b/' });
		expect(seen && 'codeStatus' in seen).toBe(false);
	});
});

describe('the final checker', () => {
	it('a quoted class names the package too', () => {
		expect(unapprovedIn('---\nclass: "tally"\n---\n\n## x').map((p) => p.name)).toEqual(['tally']);
		expect(unapprovedIn("<!-- _class: 'tally' -->").map((p) => p.name)).toEqual(['tally']);
	});
});
