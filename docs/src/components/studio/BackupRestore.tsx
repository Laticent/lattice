import { Download, SlidersHorizontal, Upload } from 'lucide-react';
import * as React from 'react';
import { notify } from '@/lib/notify';
import { iosNeedsShareSheet } from './download';
import { lastBackupAt, markBackupTaken } from './studio-store';
import { DEGRADED_TOAST_MS } from './toast-duration';
import type { PackReport } from './workspace-backup';
import { downloadBlob, isEvictionProneBrowser, stashRestoreReport, storageSummary, WORKSPACE_ZIP_NAME } from './workspace-backup-meta';

// BACKUP AND RESTORE: the escape hatch, in one place, shown in two (design §7 of
// engineering/decisions/2026-11-22-local-first-drive-storage.md). Workspace settings has held it since the start, and
// the Library opens the same controls in a Dialog, because the Library is now where your stored things live. One
// component, so the copy, the busy states and the reload after a restore cannot drift between the two.
//
// UI only: packing and restoring stay in workspace-backup.ts, loaded on click (they are off the Studio's eager path).
//
// Ownership framing, never alarm. The one place a browser-specific sentence appears is a Safari TAB (the storage-
// eviction case); the installed app and other browsers do not get it.

export type BackupBusy = 'backup' | 'restore' | null;

export function BackupRestore({ open, busy, onBusyChange, disabled = false, children }: {
	/** Re-read the last-backup line and the storage readout each time the host surface opens. */
	open: boolean;
	/**
	 * The pack or restore in flight, OWNED BY THE HOST. Workspace settings unmounts this with its Data tab, so state kept
	 * here was lost on a tab switch mid-backup, and both buttons came back enabled over a restore still rewriting the
	 * stores. The host's state outlives the tab.
	 */
	busy: BackupBusy;
	onBusyChange: (busy: BackupBusy) => void;
	/** Another long job on the host surface (Workspace settings' scene export) holds both buttons. */
	disabled?: boolean;
	/** Rendered between the buttons and the last-backup line (Workspace settings' saved-scenes door). */
	children?: React.ReactNode;
}) {
	const [backupAt, setBackupAt] = React.useState<number | null>(() => lastBackupAt());
	const [storageLine, setStorageLine] = React.useState('');
	const restoreInput = React.useRef<HTMLInputElement>(null);
	const setBusy = onBusyChange;
	React.useEffect(() => {
		if (!open) return;
		setBackupAt(lastBackupAt());
		storageSummary().then(setStorageLine).catch(() => {});
	}, [open]);

	const downloadBackup = async () => {
		setBusy('backup');
		try {
			const now = Date.now();
			const { backupRestoreGaps, packWorkspace } = await import('./workspace-backup');
			const report: PackReport = { refdocsBytes: 0 };
			// Recorded once the file is actually handed over: on iOS that is after the share sheet,
			// and a Save toast left to time out must not leave "Last backup: today" behind it.
			downloadBlob(WORKSPACE_ZIP_NAME, await packWorkspace(now, report), {
				onSaved: () => {
					markBackupTaken(now);
					setBackupAt(now);
				},
			});
			// Still downloaded: a backup you hold beats none. But it must not look like one that will
			// restore in full when it won't (followups.d/2336 item 17b, the owner's call: warn, still
			// save), and the warning stays up long enough to read.
			const gaps = backupRestoreGaps(report);
			const verb = iosNeedsShareSheet() ? 'Backup ready' : 'Backup downloaded';
			if (gaps.length) notify(`${verb} — but ${gaps.join('; and ')}. Keep the original files, or remove some and back up again.`, { duration: DEGRADED_TOAST_MS });
			else if (!iosNeedsShareSheet()) notify('Backup downloaded — your whole workspace, yours to keep.');
		} catch (e) {
			notify(`Backup failed: ${(e as Error)?.message || 'unknown error'}`);
		} finally {
			setBusy(null);
		}
	};
	const restoreBackup = async (file: File) => {
		setBusy('restore');
		try {
			const { restoreWorkspace } = await import('./workspace-backup');
			const s = await restoreWorkspace(file, Date.now());
			const decks = s.added + s.restoredCopies;
			const assets = s.themes + s.components + s.finishes + s.scenes;
			const photos = s.media;
			// A library package the backup held but could not be read back is NAMED, never
			// dropped in silence — the reload below would otherwise hide that it was ever there.
			const done = `Workspace restored — ${decks} deck${decks === 1 ? '' : 's'}${assets ? ` + ${assets} library asset${assets === 1 ? '' : 's'}` : ''}${photos ? ` + ${photos} photo${photos === 1 ? '' : 's'}` : ''} in${s.mediaRenamed ? `. ${s.mediaRenamed} photo${s.mediaRenamed === 1 ? '' : 's'} came back under a new name because a different photo already had it` : ''}.`;
			// The restore touches decks, settings, and the Library across several
			// stores; a reload is the one honest way to re-derive every view of them.
			// Always reload at once, while this modal still covers the editor: a tab left live over the
			// store the restore just rewrote writes its stale deck back on the next keystroke. What was
			// skipped rides the reload (`stashRestoreReport`) and is shown, until dismissed, once the
			// Studio has booted on the restored data.
			const notRestored = s.refused.length ? `Not restored: ${s.refused.map((r) => `${r.name} (${r.why})`).join('; ')}` : '';
			if (notRestored) stashRestoreReport({ done, notRestored });
			notify(`${done} Reloading…`, notRestored ? { description: notRestored } : undefined);
			setTimeout(() => window.location.reload(), 1100);
		} catch (e) {
			notify(`Restore failed: ${(e as Error)?.message || 'not a workspace backup'}`);
			setBusy(null);
		}
	};

	const held = busy != null || disabled;
	return (
		<>
			<p className="mb-3 text-xs text-muted-foreground">
				Your decks live in this browser — private to this device. A backup keeps them yours even if the browser clears its data.
				{isEvictionProneBrowser() ? ' Safari clears unused site data after a week — a backup makes that a non-event.' : ''}
			</p>
			<div className="grid grid-cols-2 gap-2.5">
				<button type="button" onClick={downloadBackup} disabled={held} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
					<Download className="size-4" />
					{busy === 'backup' ? 'Packing…' : 'Download backup'}
				</button>
				<button type="button" onClick={() => restoreInput.current?.click()} disabled={held} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-semibold text-[var(--text-heading)] disabled:opacity-60">
					<Upload className="size-4" />
					{busy === 'restore' ? 'Restoring…' : 'Restore backup'}
				</button>
				<input
					ref={restoreInput}
					type="file"
					accept=".zip"
					aria-label="Restore a workspace backup"
					className="sr-only"
					onChange={(e) => {
						const f = e.target.files?.[0];
						e.target.value = '';
						if (f) restoreBackup(f);
					}}
				/>
			</div>
			{children}
			<p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
				<SlidersHorizontal className="size-3" />
				Last backup: {backupAt ? new Date(backupAt).toLocaleDateString() : 'never'}
				{storageLine ? ` · ${storageLine}` : ''}
			</p>
			<p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
				One zip: every deck (readable .md copies included), version history, chats, settings, and your Library — saved themes, components, finishes, and reference docs. Restoring never overwrites — a deck that changed since the backup comes back beside the current one as “(restored)”. Your OpenRouter connection is never in the file.
			</p>
		</>
	);
}
