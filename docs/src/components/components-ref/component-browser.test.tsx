import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLens, setQuery } from '@/lib/component-browser-store';
import { type CatalogItem, groupBy, type Lens, makeSearchIndex, rankedFor } from '@/lib/component-search';
import { buildLenses } from '@/lib/families.mjs';
import { ComponentIndexIsland } from './ComponentIndexIsland';
import { ComponentNavIsland } from './ComponentNavIsland';

const lenses = buildLenses() as unknown as Lens[];

const catalog: CatalogItem[] = [
	{ name: 'verdict-grid', bucket: 'comparison', function: 'comparison', form: 'matrix', substance: 'structure', family: 'compare', familyLabel: 'Compare', description: 'Score options against criteria.', tags: ['scorecard', 'ranking'] },
	{ name: 'timeline-list', bucket: 'progression', function: 'progression', form: 'ledger', substance: 'series', family: 'timelines', familyLabel: 'Timelines & roadmaps', description: 'A chronological list of milestones.', tags: ['roadmap'] },
	{ name: 'big-number', bucket: 'statement', function: 'statement', form: 'hero', substance: 'prose', family: 'statements', familyLabel: 'Statements', description: 'One headline metric.', tags: ['kpi'] },
];

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	setQuery('');
	setLens('family');
});
afterEach(() => {
	setQuery('');
	setLens('family');
});

describe('component search — pure logic', () => {
	it('rankedFor returns null below 2 chars, a ranked list at/above', () => {
		const index = makeSearchIndex(catalog);
		expect(rankedFor(catalog, index, 'v')).toBeNull();
		const hits = rankedFor(catalog, index, 'verdict');
		expect(hits?.map((h) => h.name)).toEqual(['verdict-grid']);
	});

	it('substring search matches tags, not just names', () => {
		const index = makeSearchIndex(catalog);
		expect(rankedFor(catalog, index, 'scorecard')?.map((h) => h.name)).toEqual(['verdict-grid']);
	});

	const lensById = (id: string) => {
		const l = lenses.find((x) => x.id === id);
		if (!l) throw new Error(`lens ${id} missing`);
		return l;
	};

	it('groupBy changes structure with the lens', () => {
		const family = groupBy(catalog, lensById('family'));
		const az = groupBy(catalog, lensById('az'));
		expect(family.map((g) => g.label)).not.toEqual(az.map((g) => g.label));
		// A–Z buckets by first letter.
		expect(az.map((g) => g.key)).toEqual(['B', 'T', 'V']);
	});
});

describe('ComponentIndexIsland', () => {
	it('renders every card when no query, and narrows on search', () => {
		render(<ComponentIndexIsland catalog={catalog} lenses={lenses} base="/lattice/" />);
		// All three present in the grouped view.
		expect(screen.getByRole('heading', { name: 'verdict-grid' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'timeline-list' })).toBeInTheDocument();

		const search = screen.getAllByLabelText(/search components/i)[0];
		fireEvent.change(search, { target: { value: 'verdict' } });

		expect(screen.getByRole('heading', { name: 'verdict-grid' })).toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'timeline-list' })).not.toBeInTheDocument();
		expect(screen.getByText('1 of 3')).toBeInTheDocument();
	});

	it('shows the empty state when nothing matches', () => {
		render(<ComponentIndexIsland catalog={catalog} lenses={lenses} base="/lattice/" />);
		fireEvent.change(screen.getAllByLabelText(/search components/i)[0], { target: { value: 'zzzznope' } });
		expect(screen.getByText(/no components match/i)).toBeInTheDocument();
	});

	it('hrefs go through the base path', () => {
		render(<ComponentIndexIsland catalog={catalog} lenses={lenses} base="/lattice/" />);
		const link = screen.getByRole('heading', { name: 'verdict-grid' }).closest('a');
		expect(link).toHaveAttribute('href', '/lattice/components/comparison/verdict-grid/');
	});
});

describe('ComponentNavIsland', () => {
	it('shares the store with the index — typing in the index filters the nav', () => {
		render(
			<>
				<ComponentIndexIsland catalog={catalog} lenses={lenses} base="/lattice/" />
				<ComponentNavIsland catalog={catalog} lenses={lenses} base="/lattice/" current="verdict-grid" />
			</>,
		);
		const nav = screen.getByRole('navigation', { name: /components/i });
		// Before search: all names appear in the nav.
		expect(within(nav).getByRole('link', { name: 'timeline-list' })).toBeInTheDocument();

		fireEvent.change(screen.getAllByLabelText(/search components/i)[0], { target: { value: 'verdict' } });
		expect(within(nav).getByRole('link', { name: 'verdict-grid' })).toBeInTheDocument();
		expect(within(nav).queryByRole('link', { name: 'timeline-list' })).not.toBeInTheDocument();
	});

	it('marks the current component with aria-current', () => {
		render(<ComponentNavIsland catalog={catalog} lenses={lenses} base="/lattice/" current="verdict-grid" />);
		const current = screen.getByRole('link', { name: 'verdict-grid' });
		expect(current).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'All components' })).not.toHaveAttribute('aria-current', 'page');
	});
});
