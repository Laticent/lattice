// Unit tests for the storage-overlay shared pref — the cross-surface flag the
// Workspace switch, the overlay's own close button, and the `?storage` URL param
// all write, and that every surface reads to decide whether to mount the overlay.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	applyStorageOverlayUrlParam,
	onStorageOverlayEnabledChange,
	STORAGE_OVERLAY_AVAILABLE,
	setStorageOverlayEnabled,
	storageOverlayEnabled,
} from './storage-overlay-prefs';

afterEach(() => {
	localStorage.clear();
	// Reset the URL so a `?storage` set in one test can't leak into the next.
	window.history.replaceState({}, '', '/');
});

describe('storage-overlay pref', () => {
	it('is off by default', () => {
		expect(storageOverlayEnabled()).toBe(false);
	});

	it('round-trips on/off through localStorage', () => {
		setStorageOverlayEnabled(true);
		expect(storageOverlayEnabled()).toBe(true);
		expect(localStorage.getItem('lattice-storage-overlay')).toBe('on');
		setStorageOverlayEnabled(false);
		expect(storageOverlayEnabled()).toBe(false);
		// Off clears the key entirely rather than storing 'off'.
		expect(localStorage.getItem('lattice-storage-overlay')).toBeNull();
	});

	it('notifies same-page subscribers on every flip, and stops after unsubscribe', () => {
		const seen: boolean[] = [];
		const off = onStorageOverlayEnabledChange((on) => seen.push(on));
		setStorageOverlayEnabled(true);
		setStorageOverlayEnabled(false);
		off();
		setStorageOverlayEnabled(true);
		expect(seen).toEqual([true, false]);
	});

	it('AVAILABLE is a hard gate — a false flag would force enabled() off', () => {
		// It ships available; this documents the GA-gate contract the other overlays share.
		expect(STORAGE_OVERLAY_AVAILABLE).toBe(true);
	});
});

describe('applyStorageOverlayUrlParam', () => {
	it('does nothing without the param', () => {
		applyStorageOverlayUrlParam();
		expect(storageOverlayEnabled()).toBe(false);
	});

	it('?storage turns it on', () => {
		window.history.replaceState({}, '', '/studio?storage');
		applyStorageOverlayUrlParam();
		expect(storageOverlayEnabled()).toBe(true);
	});

	it('?storage=off / ?storage=0 turns it off', () => {
		setStorageOverlayEnabled(true);
		window.history.replaceState({}, '', '/studio?storage=off');
		applyStorageOverlayUrlParam();
		expect(storageOverlayEnabled()).toBe(false);

		setStorageOverlayEnabled(true);
		window.history.replaceState({}, '', '/studio?storage=0');
		applyStorageOverlayUrlParam();
		expect(storageOverlayEnabled()).toBe(false);
	});

	it('swallows a storage failure without throwing', () => {
		const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});
		window.history.replaceState({}, '', '/studio?storage');
		expect(() => applyStorageOverlayUrlParam()).not.toThrow();
		spy.mockRestore();
	});
});
