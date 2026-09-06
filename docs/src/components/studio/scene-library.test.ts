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
	it('strips script/on* from untrusted poster/art but keeps the SVG geometry', () => {
		const evil = '<svg viewBox="0 0 10 10"><script>window.__x=1</script><path id="p" onload="window.__x=1" d="M0 0 H10" stroke="#000"/></svg>';
		const out = sanitizeSceneAssets({ poster: evil, art: evil });
		expect(out.poster).not.toMatch(/<script/i);
		expect(out.poster).not.toMatch(/onload/i);
		expect(out.art).not.toMatch(/<script/i);
		expect(out.art).not.toMatch(/onload/i);
		expect(out.art).toContain('<path'); // benign vector survives
		expect(out.art).toContain('d="M0 0 H10"');
	});
	it('passes through undefined poster/art untouched', () => {
		expect(sanitizeSceneAssets({})).toEqual({ poster: undefined, art: undefined });
	});
});
