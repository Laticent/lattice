import { describe, expect, it } from 'vitest';
import { DOCK, idealDockLayout } from './dock-layout';
import { PREVIEW_CHROME } from './preview-rect';

const px = (groupW: number, ids: string[]) => {
	const r = idealDockLayout(groupW, ids, 'e', 'p');
	if (!r) throw new Error('no layout');
	const avail = groupW - (ids.length - 1);
	return { ...r, px: Object.fromEntries(Object.entries(r.layout).map(([k, v]) => [k, Math.round((v * avail) / 100)])) };
};
const sum = (l: Record<string, number>) => Object.values(l).reduce((a, b) => a + b, 0);

describe('idealDockLayout', () => {
	it('returns nothing without a pair or a measured group', () => {
		expect(idealDockLayout(1000, ['s'], 'e', 'p')).toBeUndefined();
		expect(idealDockLayout(0, ['e', 'p'], 'e', 'p')).toBeUndefined();
	});

	it('always sums to 100%', () => {
		for (const w of [700, 820, 1048, 1388, 2508]) expect(sum(idealDockLayout(w, ['s', 'a', 'e', 'p'], 'e', 'p')!.layout)).toBeCloseTo(100, 6);
	});

	it('starts docks at the default and splits the pair 46:54 when there is room', () => {
		const r = px(1388, ['s', 'a', 'e', 'p']);
		expect(r.px.s).toBe(DOCK.default);
		expect(r.px.a).toBe(DOCK.default);
		expect(r.px.e / (r.px.e + r.px.p)).toBeCloseTo(1 - PREVIEW_CHROME.defaultPreviewFrac, 2);
		expect(r.foldEditor).toBe(false);
	});

	it('shrinks docks toward their minimum before touching the pair', () => {
		const r = px(1228, ['s', 'a', 'e', 'p']);
		expect(r.px.s).toBeGreaterThanOrEqual(DOCK.min);
		expect(r.px.s).toBeLessThan(DOCK.default);
		expect(r.px.e).toBeGreaterThanOrEqual(PREVIEW_CHROME.splitEditorMin);
		expect(r.px.p).toBeGreaterThanOrEqual(PREVIEW_CHROME.splitPreviewMin - 1);
	});

	it('folds the editor to its rail when even minimum docks leave the pair too narrow', () => {
		for (const [w, ids] of [[1048, ['s', 'a', 'e', 'p']], [820, ['e', 'p', 'i']]] as const) {
			const r = px(w, [...ids]);
			expect(r.foldEditor).toBe(true);
			expect(r.px.e).toBe(PREVIEW_CHROME.splitRailW);
		}
	});

	it('never lays a panel out under its own minimum', () => {
		for (let w = 700; w <= 2600; w += 37) {
			for (const ids of [['e', 'p'], ['s', 'e', 'p'], ['s', 'a', 'e', 'p'], ['e', 'p', 'i']]) {
				const r = px(w, ids);
				for (const id of ids.filter((i) => i !== 'e' && i !== 'p')) expect(r.px[id]).toBeGreaterThanOrEqual(DOCK.min - 1);
				if (!r.foldEditor) {
					expect(r.px.e).toBeGreaterThanOrEqual(PREVIEW_CHROME.splitEditorMin - 1);
					expect(r.px.p).toBeGreaterThanOrEqual(PREVIEW_CHROME.splitPreviewMin - 1);
				}
			}
		}
	});
});
