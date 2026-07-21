// Render test for the STORAGE overlay island — the source-string wiring test
// (StorageOverlay.test.ts) proves it's INCLUDED everywhere, but never executes the
// component, so the gate, the mount-time scan, and the effect teardown go
// unverified. This renders it for real (jsdom) to cover that runtime half.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setStorageOverlayEnabled } from '@/playground/storage-overlay-prefs';
import StorageOverlay from './StorageOverlay';

afterEach(() => {
	cleanup();
	setStorageOverlayEnabled(false);
	localStorage.clear();
});

describe('StorageOverlay island', () => {
	it('renders nothing while the pref is off (a normal page pays nothing)', () => {
		setStorageOverlayEnabled(false);
		render(<StorageOverlay />);
		expect(document.getElementById('lattice-storage-overlay')).toBeNull();
	});

	it('mounts, scans localStorage, and shows the real category breakdown when enabled', async () => {
		localStorage.setItem('lattice-studio-src-deck1', 'x'.repeat(200));
		setStorageOverlayEnabled(true);
		render(<StorageOverlay />);
		// The panel portals to <body>; the synchronous first scan populates it.
		await waitFor(() => expect(document.getElementById('lattice-storage-overlay')).not.toBeNull());
		expect(screen.getByText('deck sources')).toBeInTheDocument();
		// The SCAN metric is present (the thesis number) — as a verdict chip AND a row,
		// so it appears more than once — and the boot-cost section renders without throwing
		// under jsdom (no Storage API).
		expect(screen.getAllByText('scan').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('boot cost')).toBeInTheDocument();
	});

	it('unmounts cleanly (interval + listeners torn down, no throw)', async () => {
		setStorageOverlayEnabled(true);
		const { unmount } = render(<StorageOverlay />);
		await waitFor(() => expect(document.getElementById('lattice-storage-overlay')).not.toBeNull());
		expect(() => unmount()).not.toThrow();
		// The singleton claim is released on unmount, so a fresh mount still renders one.
		render(<StorageOverlay />);
		await waitFor(() => expect(document.getElementById('lattice-storage-overlay')).not.toBeNull());
	});
});
