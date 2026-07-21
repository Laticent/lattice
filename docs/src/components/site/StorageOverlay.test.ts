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

	it('the .astro wrapper mounts the island client-only', () => {
		expect(read('components/site/StorageOverlay.astro')).toMatch(/<StorageOverlay\s+client:only="react"\s*\/>/);
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
