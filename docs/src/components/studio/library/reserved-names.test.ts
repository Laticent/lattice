// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RESERVED_COMPONENT_NAMES, RESERVED_THEME_NAMES, renameComponentSelectors, unreservedName } from './reserved-names';
import { findNameClash } from './save-guard.js';

describe('reserved-names — the shipped sets', () => {
	it('reserves every shipped theme, its -dark companion and the base theme', () => {
		for (const n of ['indaco', 'indaco-dark', 'a11y-base', 'lattice']) expect(RESERVED_THEME_NAMES.has(n), n).toBe(true);
	});
	it('reserves the shipped components', () => {
		for (const n of ['kpi', 'content', 'verdict-grid']) expect(RESERVED_COMPONENT_NAMES.has(n), n).toBe(true);
	});
	it('renames only a reserved name', () => {
		expect(unreservedName(RESERVED_THEME_NAMES, 'indaco')).toBe('indaco-custom');
		expect(unreservedName(RESERVED_THEME_NAMES, 'brand')).toBe('brand');
	});
});

// The checker's blocking finding on the first cut: Fabricate's duplicate-name guard ran on
// the TYPED name, so a second theme typed "indaco" found no clash and overwrote the first
// `indaco-custom`. The guard now asks about the name the store will use.
describe('reserved-names — the duplicate guard sees the name the store will use', () => {
	const saved = [{ id: 'theme:1', name: 'indaco-custom' }];
	it('finds the earlier `-custom` record when the author types the shipped name again', () => {
		expect(findNameClash(saved, unreservedName(RESERVED_THEME_NAMES, 'indaco'), null)).toEqual(saved[0]);
	});
	it('would have missed it on the typed name (the defect)', () => {
		expect(findNameClash(saved, 'indaco', null)).toBeUndefined();
	});
});

describe('renameComponentSelectors', () => {
	const r = (css: string) => renameComponentSelectors(css, 'kpi', 'kpi-custom');
	it('rewrites the class token, including inside :is() and :not()', () => {
		expect(r('section.kpi h2, :is(.kpi) p, section:not(.kpi) li {}')).toBe('section.kpi-custom h2, :is(.kpi-custom) p, section:not(.kpi-custom) li {}');
	});
	it('rewrites the escaped spellings the browser reads as the same class (.\\6b pi is .kpi)', () => {
		expect(r('section.\\6b pi h2, section.k\\70 i p, section.\\kpi li {}')).toBe('section.kpi-custom h2, section.kpi-custom p, section.kpi-custom li {}');
		expect(r('section.\\6b pis, .\\6b  pi {}')).toBe('section.\\6b pis, .\\6b  pi {}');
	});
	it('leaves a longer class alone', () => {
		expect(r('.kpi-row, .kpis, .xkpi {}')).toBe('.kpi-row, .kpis, .xkpi {}');
	});
	it('rewrites a class attribute selector whose value is exactly the name', () => {
		expect(r('section[class~="kpi"], [class=kpi], [class*=\'kpi\' i] {}')).toBe('section[class~="kpi-custom"], [class=kpi-custom], [class*=\'kpi-custom\' i] {}');
	});
	it('leaves an attribute value that only contains the name', () => {
		expect(r('[class~="kpi-row"] {}')).toBe('[class~="kpi-row"] {}');
	});
});
