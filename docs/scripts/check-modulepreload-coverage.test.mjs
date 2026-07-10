// Unit tests for the pure parsing/matching logic behind
// scripts/check-modulepreload-coverage.mjs. No real build — .astro source is a
// plain string fixture, ENTRIES is passed explicitly (never the real one) so
// these stay stable regardless of what real islands get added later.

import { describe, expect, it } from 'vitest';
import { findClientOnlyIslands, isCovered } from './check-modulepreload-coverage.mjs';

describe('findClientOnlyIslands', () => {
	it('finds a client:only component and resolves its import to an absolute path', () => {
		const source = ['---', "import FutureApp from '../components/future/FutureApp.tsx';", '---', '<html><body><FutureApp client:only="react" /></body></html>'].join('\n');
		const islands = findClientOnlyIslands(source, '/repo/docs/src/pages/future.astro');
		expect(islands).toEqual([{ componentName: 'FutureApp', sourcePath: '/repo/docs/src/components/future/FutureApp.tsx' }]);
	});

	it('ignores components hydrated with client:load / client:idle / client:visible', () => {
		const source = [
			'---',
			"import A from '../components/A.tsx';",
			"import B from '../components/B.tsx';",
			"import C from '../components/C.tsx';",
			'---',
			'<A client:load /><B client:idle /><C client:visible />',
		].join('\n');
		expect(findClientOnlyIslands(source, '/repo/docs/src/pages/x.astro')).toEqual([]);
	});

	it('does not false-positive on a component name that merely CONTAINS another as a substring', () => {
		// "StudioShell" client:only should not also match a hypothetical "Studio" import.
		const source = ['---', "import Studio from '../components/Studio.tsx';", "import StudioShell from '../components/studio/StudioShell.tsx';", '---', '<StudioShell client:only="react" />'].join('\n');
		const islands = findClientOnlyIslands(source, '/repo/docs/src/pages/x.astro');
		expect(islands.map((i) => i.componentName)).toEqual(['StudioShell']);
	});

	it('dedupes a component used with client:only more than once in the same page', () => {
		const source = ['---', "import Foo from '../components/Foo.tsx';", '---', '<Foo client:only="react" /><Foo client:only="react" />'].join('\n');
		expect(findClientOnlyIslands(source, '/repo/docs/src/pages/x.astro')).toHaveLength(1);
	});

	it('reports sourcePath: null when no matching import statement is found (unresolved, not silently skipped)', () => {
		const source = ['---', '---', '<Mystery client:only="react" />'].join('\n');
		expect(findClientOnlyIslands(source, '/repo/docs/src/pages/x.astro')).toEqual([{ componentName: 'Mystery', sourcePath: null }]);
	});

	it('returns nothing for a page with no client:only usage at all', () => {
		const source = ['---', "import A from '../components/A.tsx';", '---', '<A client:load />'].join('\n');
		expect(findClientOnlyIslands(source, '/repo/docs/src/pages/x.astro')).toEqual([]);
	});
});

describe('isCovered', () => {
	const entries = [{ page: 'studio/index.html', sourceSuffix: 'src/components/studio/StudioShell.tsx' }];

	it('is true when sourcePath ends with a covered suffix', () => {
		expect(isCovered('/repo/docs/src/components/studio/StudioShell.tsx', entries)).toBe(true);
	});

	it('is false when sourcePath matches nothing', () => {
		expect(isCovered('/repo/docs/src/components/future/FutureApp.tsx', entries)).toBe(false);
	});

	it('is false for a null sourcePath (unresolved import)', () => {
		expect(isCovered(null, entries)).toBe(false);
	});

	it('normalizes Windows-style backslashes before matching', () => {
		expect(isCovered('C:\\repo\\docs\\src\\components\\studio\\StudioShell.tsx', entries)).toBe(true);
	});
});
