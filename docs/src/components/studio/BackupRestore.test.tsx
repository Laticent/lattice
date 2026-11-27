import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { type BackupBusy, BackupRestore } from './BackupRestore';

// The pack or restore in flight belongs to the HOST (checker finding on #3588): Workspace settings unmounts this
// component with its Data tab, so busy state kept inside it was lost on a tab switch mid-restore, and both buttons came
// back live over stores the restore was still rewriting. Remounting with the host's state must keep both held.
describe('BackupRestore busy state is the host’s', () => {
	const host = (busy: BackupBusy) => <BackupRestore open busy={busy} onBusyChange={() => {}} />;

	it('a restore in flight survives a remount: both buttons stay held', () => {
		const first = render(host('restore'));
		first.unmount(); // the Data tab closes
		render(host('restore')); // and opens again
		expect(screen.getByRole('button', { name: /Restoring/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByRole('button', { name: /Download backup/ }).hasAttribute('disabled')).toBe(true);
	});

	it('a pack in flight reads "Packing…", and idle buttons are live', () => {
		const { rerender } = render(host('backup'));
		expect(screen.getByRole('button', { name: /Packing/ }).hasAttribute('disabled')).toBe(true);
		rerender(host(null));
		expect(screen.getByRole('button', { name: 'Download backup' }).hasAttribute('disabled')).toBe(false);
		expect(screen.getByRole('button', { name: 'Restore backup' }).hasAttribute('disabled')).toBe(false);
	});
});
