// The restore's "Not restored" report rides the reload in sessionStorage (workspace-backup-meta.ts):
// shown once on the restored Studio, never twice, and never from junk.
import { beforeEach, describe, expect, it } from 'vitest';
import { stashRestoreReport, takeRestoreReport } from './workspace-backup-meta';

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
