import { Image as ImageIcon, Layers, Lock } from 'lucide-react';
import * as React from 'react';
import { DeleteBtn } from './delete-btn';
import { LIBRARY_SCOPE, type MediaRecord } from './media-store';
import { formatBytes } from './reference-doc';

// One photo or video on the Images tab. Manage-only, like a reference-doc card: media is
// not a lattice-asset, so there is no select box and no zip share. The thumbnail is an object
// URL minted for the card's lifetime and revoked on unmount (a leaked URL pins the Blob).

function useObjectUrl(blob: Blob): string | null {
	const [url, setUrl] = React.useState<string | null>(null);
	React.useEffect(() => {
		const u = URL.createObjectURL(blob);
		setUrl(u);
		return () => URL.revokeObjectURL(u);
	}, [blob]);
	return url;
}

export function MediaCard({ m, activeDeckId, usedIn, usedElsewhere, armed, confirmLabel, onArm, onCancel, onDelete, onScope }: {
	m: MediaRecord;
	/** The deck open in the Studio, or null when none is. A deck-scoped asset can only be moved from its own deck. */
	activeDeckId: string | null;
	/** How many decks reference `asset:<name>` right now. */
	usedIn: number;
	/** How many decks OTHER than the open one reference it: while any does, it cannot be kept to this deck. */
	usedElsewhere: number;
	armed: boolean;
	confirmLabel: string;
	onArm: () => void;
	onCancel: () => void;
	onDelete: () => void;
	onScope: (scope: string) => void;
}) {
	const url = useObjectUrl(m.blob);
	const shared = m.scope === LIBRARY_SCOPE;
	// The scope flip is offered only where it can be named: a shared asset can become this deck's (needs an
	// open deck, and no OTHER deck naming it: keeping it to one deck would turn the rest into placeholders),
	// and this deck's can become shared.
	const pinned = shared && usedElsewhere > 0;
	const canFlip = shared ? activeDeckId !== null && !pinned : m.scope === activeDeckId;
	return (
		<div className="relative overflow-hidden rounded-xl border border-border bg-card" data-media-card={m.name}>
			{/* The image is ABSOLUTE inside a fixed box. As a `h-full` grid item it was sized by its own
			    row, not by the 88px: a 1920×2560 photo painted 351px tall, `object-cover` had nothing to
			    crop to, and `overflow-hidden` showed only the top strip (measured in Chromium). */}
			<div className="relative h-[88px] w-full overflow-hidden bg-[var(--bg-alt)]">
				{url ? (
					<img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" draggable={false} />
				) : (
					<ImageIcon className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
				)}
			</div>
			<div className="p-2.5">
				<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]">
					<ImageIcon className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
					<span className="truncate" title={m.sourceName}>asset:{m.name}</span>
					<span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">{shared ? 'All decks' : 'This deck'}</span>
				</div>
				<div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">
					{m.width}×{m.height} · {formatBytes(m.bytes)}
					{m.original ? '' : ' · optimized'}
					{usedIn > 0 ? ` · used in ${usedIn} deck${usedIn === 1 ? '' : 's'}` : ''}
				</div>
				<div className="mt-2.5 flex items-center gap-1.5">
					{canFlip ? (
						<button
							type="button"
							onClick={() => onScope(shared ? (activeDeckId as string) : LIBRARY_SCOPE)}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-[11.5px] font-semibold text-foreground"
						>
							{shared ? <Lock className="size-3.5" aria-hidden /> : <Layers className="size-3.5" aria-hidden />}
							{shared ? 'Keep to this deck' : 'Share to all decks'}
						</button>
					) : (
						<span className="flex-1 truncate px-1 font-mono text-[10.5px] text-muted-foreground">{pinned ? `Used by ${usedElsewhere} other deck${usedElsewhere === 1 ? '' : 's'}, so it stays shared` : shared ? 'Open a deck to scope it' : 'Belongs to another deck'}</span>
					)}
					<DeleteBtn labelClass={confirmLabel} armed={armed} onArm={onArm} onConfirm={onDelete} onCancel={onCancel} label={m.name} />
				</div>
			</div>
		</div>
	);
}
