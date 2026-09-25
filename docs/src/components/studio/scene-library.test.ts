// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima';
import { sanitizeSceneAssets, saveStudioScene, slugify } from './scene-library';


describe('slugify', () => {
	it('lowercases, hyphenates, and trims', () => {
		expect(slugify('My Gyroscope!')).toBe('my-gyroscope');
		expect(slugify('  --Route 66-- ')).toBe('route-66');
		expect(slugify('###')).toBe('');
	});
});

describe('saveStudioScene', () => {
	it('rejects an invalid spec BEFORE touching the store (fail-closed)', async () => {
		const bad = { source: 'built', duration: -1, hero: 5, elements: [] } as unknown as Scene;
		await expect(saveStudioScene({ name: 'broken', spec: bad })).rejects.toThrow(/invalid scene spec/i);
	});
});

describe('sanitizeSceneAssets (the store-boundary chokepoint, #22)', () => {
	it('strips script/on* from untrusted poster/art but keeps the SVG geometry', async () => {
		const evil = '<svg viewBox="0 0 10 10"><script>window.__x=1</script><path id="p" onload="window.__x=1" d="M0 0 H10" stroke="#000"/></svg>';
		const out = await sanitizeSceneAssets({ poster: evil, art: evil });
		expect(out.poster).not.toMatch(/<script/i);
		expect(out.poster).not.toMatch(/onload/i);
		expect(out.art).not.toMatch(/<script/i);
		expect(out.art).not.toMatch(/onload/i);
		expect(out.art).toContain('<path'); // benign vector survives
		expect(out.art).toContain('d="M0 0 H10"');
	});
	it('passes through undefined poster/art untouched', async () => {
		expect(await sanitizeSceneAssets({})).toEqual({});
		expect(await sanitizeSceneAssets({ poster: undefined, art: undefined })).toEqual({ poster: undefined, art: undefined });
	});
	it('drops every attribute that fetches from another origin, and keeps the drawing', async () => {
		const art =
			'<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
			'<image href="https://evil.test/a.png" width="4" height="4"/>' +
			'<use xlink:href="//evil.test/s.svg#x"/>' +
			'<filter id="f"><feImage href="https://evil.test/f.png"/></filter>' +
			'<rect style="fill:url(https://evil.test/p#p)" width="2" height="2"/>' +
			'<rect fill="u\\72l(https://evil.test/q#q)" filter="url(#f)" width="3" height="3"/>' +
			'<a href="https://ok.test/"><path d="M0 0 H10" stroke="var(--accent)"/></a></svg>';
		const out = await sanitizeSceneAssets({ art, poster: art });
		for (const m of [out.art, out.poster]) {
			expect(m).not.toContain('evil.test');
			expect(m).toContain('d="M0 0 H10"');
			expect(m).toContain('filter="url(#f)"'); // a same-document reference stays
			expect(m).toContain('xmlns="http://www.w3.org/2000/svg"');
		}
	});
	it('is idempotent, so a record re-sanitized on every read does not drift', async () => {
		const art = '<svg viewBox="0 0 10 10"><path d="M0 0 H10" stroke="var(--accent)"></path></svg>';
		const once = (await sanitizeSceneAssets({ art })).art;
		expect((await sanitizeSceneAssets({ art: once })).art).toBe(once);
	});
});
