// The restore's "Not restored" report rides the reload in sessionStorage (workspace-backup-meta.ts):
// shown once on the restored Studio, never twice, and never from junk.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEvictionProneBrowser, stashRestoreReport, takeRestoreReport } from './workspace-backup-meta';

beforeEach(() => sessionStorage.clear());

describe('the restore report carried across the reload', () => {
	it('is read back once, then gone', () => {
		stashRestoreReport({ done: 'Workspace restored — 1 deck in.', notRestored: 'Not restored: Reference docs (over the 256 MB a restore reads)' });
		expect(takeRestoreReport()).toEqual({ done: 'Workspace restored — 1 deck in.', notRestored: 'Not restored: Reference docs (over the 256 MB a restore reads)' });
		expect(takeRestoreReport()).toBeNull();
	});

	it('reads nothing when none was stashed, or when the stash is not a report', () => {
		expect(takeRestoreReport()).toBeNull();
		sessionStorage.setItem('lattice-studio-restore-report', '{not json');
		expect(takeRestoreReport()).toBeNull();
		sessionStorage.setItem('lattice-studio-restore-report', JSON.stringify({ done: 5 }));
		expect(takeRestoreReport()).toBeNull();
	});
});

describe('isEvictionProneBrowser — the Safari backup warning', () => {
	const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
	// WebKitGTK, the desktop app's engine on Linux, carries the same Safari token.
	const WEBKITGTK = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
	type W = Window & { __TAURI_INTERNALS__?: unknown };
	afterEach(() => {
		vi.restoreAllMocks();
		delete (window as W).__TAURI_INTERNALS__;
	});

	it('warns in a Safari tab', () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(SAFARI);
		expect(isEvictionProneBrowser()).toBe(true);
	});

	it('does not warn in the desktop app, whose WebKit engine also reads as Safari', () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(WEBKITGTK);
		(window as W).__TAURI_INTERNALS__ = { invoke: async () => true };
		expect(isEvictionProneBrowser()).toBe(false);
	});
});
