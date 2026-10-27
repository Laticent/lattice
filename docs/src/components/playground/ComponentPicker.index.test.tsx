// @vitest-environment jsdom
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The picker builds its search index on the first real query, not at mount: at mount it cost 160 ms of the
// Playground's hydration task on the phone profile (2026-10-26-lighthouse-home-runtime-prefetch.md §12).
const built = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/lib/component-search', async (orig) => {
	const real = await orig<typeof import('@/lib/component-search')>();
	return {
		...real,
		makeSearchIndex: (...args: Parameters<typeof real.makeSearchIndex>) => {
			built.count++;
			return real.makeSearchIndex(...args);
		},
	};
});

const { ComponentPicker } = await import('./ComponentPicker');

const item = (name: string) => ({ name, bucket: 'evidence', function: 'show', form: 'grid', substance: 'number', family: 'kpi', familyLabel: 'KPI', description: `${name} slide`, tags: [] });
const props = (query: string) => ({
	components: [item('kpi'), item('table')],
	lenses: [{ id: 'az', label: 'A-Z', field: null, order: null }],
	current: 'kpi',
	query,
	onQueryChange() {},
	lensId: 'az',
	onLensChange() {},
	onPick() {},
});

describe('ComponentPicker search index', () => {
	beforeEach(() => {
		built.count = 0;
	});
	it('is not built for an empty or one-letter query', () => {
		renderToString(<ComponentPicker {...props('')} />);
		renderToString(<ComponentPicker {...props('k')} />);
		expect(built.count).toBe(0);
	});
	it('is built once a query can rank', () => {
		renderToString(<ComponentPicker {...props('kp')} />);
		expect(built.count).toBe(1);
	});
});
