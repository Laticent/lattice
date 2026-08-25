import { History, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listAssetVersions } from './library/asset-history.js';
import { restoreAssetVersion } from './library/asset-store.js';

// The version list behind a Library card — the way back out of an in-place edit.
//
// Editing a saved theme, component or finish OVERWRITES the record, so every deck
// already using it picks the change up immediately. That is the behavior people
// expect and on its own it is unforgiving; `library/asset-history.js` is the undo
// that makes it safe to offer, and this is where a person actually reaches it.
//
// A DIALOG rather than a nested sheet: the Library is itself a PanelSheet on tablet
// and phone, and a sheet inside a sheet gives two stacked dismiss gestures with no
// way to tell which one a swipe will hit. A dialog is in the top layer, dismisses
// once, and needs no new transport (HARD RULE #15).
//
// IT IS CALLED "EARLIER VERSIONS", NOT "VERSION HISTORY", and that is not a synonym
// picked at random. The Studio already has a "Version history" — the DECK checkpoint
// sheet (`CHROME.versionHistory` in docs/e2e/studio-fixture.ts) — and two unrelated
// surfaces under one name is a product smell before it is a test problem. It is both:
// Playwright's `getByRole` name option is a SUBSTRING match unless `exact: true`, so
// an asset control named "Version history for X" silently makes every existing spec's
// bare `'Version history'` ambiguous. Distinct names cost nothing and fix both.
//
// RESTORING IS ITSELF AN OVERWRITE, and it goes through the same door: the restore
// path is `restoreAssetVersion` in the store, which checkpoints the current record
// before putting the old one back. So a mis-clicked restore is recoverable from this
// same list — there is no state a person can reach here that they cannot leave.

export type VersionedAsset = { id: string; label: string };

type Version = {
	id: string;
	assetId: string;
	ts: number;
	label: string;
	snapshot: { text?: string; name?: string };
};

/** A version's date and time — versions minutes apart need more than a date. */
function fmtStamp(ts: number): string {
	try {
		return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	} catch {
		return '';
	}
}

/**
 * How big the stylesheet in this version was.
 *
 * Deliberately the only thing summarized. A real diff against the live record is the
 * obvious next want, and it is NOT a small feature done honestly — a CSS diff worth
 * reading is a semantic one, and a line diff of generated CSS is noise. Size is a
 * true, cheap signal for the one question the list has to answer ("which of these is
 * the one I want"), and it does not pretend to be more.
 */
function fmtSize(text: string | undefined): string {
	const n = (text || '').length;
	return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function AssetVersionsDialog({
	asset,
	open,
	onOpenChange,
	onRestored,
	notify,
}: {
	asset: VersionedAsset | null;
	open: boolean;
	onOpenChange: (o: boolean) => void;
	onRestored: () => void;
	notify: (msg: string) => void;
}) {
	const [versions, setVersions] = React.useState<Version[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [busy, setBusy] = React.useState<string | null>(null);

	const assetId = asset?.id;
	React.useEffect(() => {
		if (!open || !assetId) return;
		let live = true;
		// CLEAR FIRST. The effect runs after commit and paint, so without this the dialog
		// renders asset B's title over asset A's rows for a frame or two — with live
		// Restore buttons. A click in that window restores A while the dialog says B.
		setVersions([]);
		setLoading(true);
		listAssetVersions(assetId)
			.then((rows: Version[]) => { if (live) setVersions(rows); })
			.catch(() => { if (live) setVersions([]); })
			.finally(() => { if (live) setLoading(false); });
		return () => { live = false; };
	}, [open, assetId]);

	async function restore(v: Version) {
		setBusy(v.id);
		try {
			await restoreAssetVersion(v);
			notify(`Restored ${asset?.label ?? 'asset'} to its ${fmtStamp(v.ts)} version.`);
			onRestored();
			onOpenChange(false);
		} catch (e) {
			notify(String((e as Error)?.message || 'Could not restore that version.'));
		} finally {
			setBusy(null);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2"><History className="size-4" />Earlier versions</DialogTitle>
					<DialogDescription>
						{asset ? `Earlier saves of ${asset.label}, newest first. Restoring keeps the current version too, so you can come back.` : ''}
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain">
					{loading ? (
						<p className="py-6 text-center text-[12.5px] text-muted-foreground">Loading…</p>
					) : versions.length === 0 ? (
						<p className="py-6 text-center text-[12.5px] text-muted-foreground">No earlier versions yet — one is kept each time you save over this asset.</p>
					) : (
						<ul className="flex flex-col gap-1.5">
							{versions.map((v) => (
								<li key={v.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12.5px] font-semibold text-[var(--text-heading)]">{v.label}</div>
										<div className="truncate font-mono text-[10.5px] text-muted-foreground">{fmtStamp(v.ts)} · {fmtSize(v.snapshot?.text)}</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										className="shrink-0 gap-1.5"
										disabled={!!busy}
										onClick={() => restore(v)}
										aria-label={`Restore the ${fmtStamp(v.ts)} version`}
									>
										<RotateCcw className="size-3.5" />
										{busy === v.id ? 'Restoring…' : 'Restore'}
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
