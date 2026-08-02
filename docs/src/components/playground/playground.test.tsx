import { describe, expect, it } from 'vitest';
import {
	type Catalog,
	detectComponent,
	renderSig,
	resolveThemeName,
	sanitizePalette,
	variantOptions,
	variantSource,
} from '@/lib/playground-controller';

const catalog: Catalog = {
	'verdict-grid': {
		skeleton: '<!-- _class: verdict-grid -->\n\n# skeleton\n',
		sample: '<!-- _class: verdict-grid -->\n\n# sample\n',
		variants: [
			{ key: 'compact', label: 'compact', caption: 'tighter rows', sample: '<!-- _class: verdict-grid compact -->\n' },
			{ key: 'wide', label: 'wide', caption: '', sample: '<!-- _class: verdict-grid wide -->\n' },
		],
	},
	'big-number': {
		skeleton: '<!-- _class: big-number -->\n',
		sample: '<!-- _class: big-number -->\n\n# 42\n',
		variants: [],
	},
};

describe('detectComponent', () => {
	it('returns null when there is no _class comment', () => {
		expect(detectComponent(catalog, '# just a heading')).toBeNull();
	});

	it('returns null when no token names a known component', () => {
		expect(detectComponent(catalog, '<!-- _class: unknown thing -->')).toBeNull();
	});

	it('detects the component and defaults the variant', () => {
		expect(detectComponent(catalog, '<!-- _class: verdict-grid -->\n# x')).toEqual({
			name: 'verdict-grid',
			variant: 'default',
		});
	});

	it('detects a documented variant token alongside the component', () => {
		expect(detectComponent(catalog, '<!-- _class: verdict-grid compact -->')).toEqual({
			name: 'verdict-grid',
			variant: 'compact',
		});
	});

	it('picks the first component token when several appear', () => {
		// base modifiers (e.g. `dark`) precede; the component is still found.
		expect(detectComponent(catalog, '<!-- _class: dark verdict-grid wide -->')?.name).toBe('verdict-grid');
	});
});

describe('variantOptions', () => {
	it('is empty for no component (control disabled)', () => {
		expect(variantOptions(catalog, null)).toEqual([]);
	});

	it('is empty for a component with no variants', () => {
		expect(variantOptions(catalog, 'big-number')).toEqual([]);
	});

	it('leads with default then each documented modifier, carrying titles', () => {
		const opts = variantOptions(catalog, 'verdict-grid');
		expect(opts.map((o) => o.value)).toEqual(['default', 'compact', 'wide']);
		expect(opts[1].title).toBe('tighter rows');
		expect(opts[2].title).toBeUndefined(); // empty caption → no title
	});
});

describe('variantSource', () => {
	it('returns the base sample for default', () => {
		expect(variantSource(catalog, 'verdict-grid', 'default')).toBe(catalog['verdict-grid'].sample);
	});

	it('returns the modifier sample for a named variant', () => {
		expect(variantSource(catalog, 'verdict-grid', 'compact')).toBe(catalog['verdict-grid'].variants[0].sample);
	});

	it('falls back to the base sample for an unknown variant', () => {
		expect(variantSource(catalog, 'verdict-grid', 'nope')).toBe(catalog['verdict-grid'].sample);
	});

	it('returns empty string for an unknown component', () => {
		expect(variantSource(catalog, 'nope', 'default')).toBe('');
	});
});

describe('resolveThemeName', () => {
	it('uses the dark theme only in dark mode when it is loaded', () => {
		expect(resolveThemeName('indaco', 'dark', true)).toBe('indaco-dark');
		expect(resolveThemeName('indaco', 'dark', false)).toBe('indaco');
		expect(resolveThemeName('indaco', 'light', true)).toBe('indaco');
	});
});

describe('renderSig', () => {
	it('is stable per theme/mode/geometry and changes when any differs', () => {
		expect(renderSig('indaco', 'light', 1280, 720)).toBe('indaco|light|1280x720');
		expect(renderSig('indaco', 'light', 1280, 720)).not.toBe(renderSig('indaco', 'dark', 1280, 720));
		expect(renderSig('indaco', 'light', 3840, 2160)).toBe('indaco|light|3840x2160');
	});
});

describe('sanitizePalette', () => {
	const valid = ['indaco', 'cuoio', 'onyx'];
	it('keeps a registered palette unchanged', () => {
		expect(sanitizePalette('cuoio', valid)).toBe('cuoio');
		expect(sanitizePalette('indaco', valid)).toBe('indaco');
	});
	it('falls back to the default palette for a retired/unknown one (the stale-localStorage blank)', () => {
		expect(sanitizePalette('zaffre-legacy', valid)).toBe('cuoio');
		expect(sanitizePalette('', valid)).toBe('cuoio');
	});
	it('falls back to the first palette when indaco is absent', () => {
		expect(sanitizePalette('gone', ['cuoio', 'onyx'])).toBe('cuoio');
	});
	it('passes through unchanged when the vocabulary is empty (cannot judge validity)', () => {
		expect(sanitizePalette('anything', [])).toBe('anything');
	});
});
