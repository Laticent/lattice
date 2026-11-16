// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
// Gate: the STORAGE diagnostic overlay is wired onto every surface PerfOverlay
// reaches, and its Workspace toggle stays present. A source-string test (like
// RuntimeWarm.test.ts) — the unit tier never runs a real `astro build`, but the
// failure mode worth guarding (an include silently dropped so the overlay can't be
// turned on somewhere) is visible in source without one.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..'); // docs/src/components/site → docs/src
const read = (p: string) => readFileSync(join(src, p), 'utf8');

// The same three includers PerfOverlay uses: ResourceHints (standalone routes),
// Header (docs zone), and features.astro (its own head). Together they give the
// overlay parity reach with the perf overlay.
describe('StorageOverlay is included on every surface', () => {
	const cases = ['components/site/ResourceHints.astro', 'components/Header.astro', 'pages/features.astro'];
	for (const file of cases) {
		it(`${file} imports and renders <StorageOverlay />`, () => {
			const s = read(file);
			expect(s).toMatch(/import StorageOverlay from ['"][^'"]*StorageOverlay\.astro['"]/);
			expect(s).toMatch(/<StorageOverlay\s*\/>/);
		});
	}

	// The wrapper mounts ONE island that carries both the Storage overlay and the System panel's gate
	// (SiteDiagnostics.tsx): a second island would add a tag to every page's HTML, and the Studio's HTML
	// sits at its route-budget ceiling.
	it('the .astro wrapper mounts the shared island client-only', () => {
		expect(read('components/site/StorageOverlay.astro')).toMatch(/<SiteDiagnostics\s+client:only="react"\s*\/>/);
	});

	it('the shared island renders the Storage overlay and the System panel gate', () => {
		const s = read('components/site/SiteDiagnostics.tsx');
		expect(s).toMatch(/import StorageOverlay from '\.\/StorageOverlay'/);
		expect(s).toMatch(/import SystemOverlay from '\.\/SystemOverlay'/);
		expect(s).toMatch(/<StorageOverlay\s*\/>/);
		expect(s).toMatch(/<SystemOverlay\s*\/>/);
	});

	it('the System gate loads its panel lazily, so a page with it off downloads none of it', () => {
		const s = read('components/site/SystemOverlay.tsx');
		expect(s).toMatch(/import\('\.\/SystemOverlayPanel'\)/);
		expect(s).not.toMatch(/from '\.\/SystemOverlayPanel'/);
		expect(s).not.toMatch(/from '@\/lib\/(device-profile|system-report)'/);
	});
});

describe('the Workspace Diagnostics toggle exists', () => {
	const ws = read('components/studio/WorkspaceSheet.tsx');
	it('renders a Storage overlay switch bound to the shared pref', () => {
		expect(ws).toContain('storage-overlay-prefs');
		expect(ws).toContain('id="ws-storage-overlay"');
		expect(ws).toContain('setStorageOverlayEnabled(next)');
	});
});
