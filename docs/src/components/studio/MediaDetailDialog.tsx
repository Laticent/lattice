import { X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useObjectUrl } from './MediaCard';
import { isMediaName, type MediaMetaPatch, type MediaRecord } from './media-store';
import { formatBytes } from './reference-doc';

// The detail view behind a Library photo card: see the picture, read what is known about it, and edit
// the metadata a deck can reuse. A DIALOG, for the reason AssetVersions.tsx gives (the Library is itself
// a sheet on tablet and phone, and a sheet inside a sheet has two dismiss gestures).
//
// WHAT IS EDITABLE: the description (the record's `caption`, which the chat also reads, and which a deck
// can use as alt text), the credit, the date taken, and the name. Renaming keeps the old name as an
// alias, so no deck is edited and `asset:<old>` keeps resolving (media-store.ts `renameMedia`).
// Pixel size, bytes and file name are facts about the stored file and are shown, not edited.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §Metadata.

export function MediaDetailDialog({ m, open, onOpenChange, usedIn, aliasUse, onSave, onRename, onRemoveAlias }: {
	m: MediaRecord | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Decks that write `asset:<name>` for the current name. */
	usedIn: number;
	/** Decks that still write each alias. */
	aliasUse: Record<string, number>;
	/** Resolves an error line to show, or null on success. */
	onSave: (patch: MediaMetaPatch) => Promise<string | null>;
	onRename: (to: string) => Promise<string | null>;
	onRemoveAlias: (alias: string) => Promise<string | null>;
}) {
	const url = useObjectUrl(m?.blob);
	const [name, setName] = React.useState('');
	const [caption, setCaption] = React.useState('');
	const [credit, setCredit] = React.useState('');
	const [taken, setTaken] = React.useState('');
	const [error, setError] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);
	const uid = React.useId();
	// Reset the form only when a different record opens, not on every refresh of the same one.
	const id = m?.id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the record's identity on purpose
	React.useEffect(() => {
		setName(m?.name ?? '');
		setCaption(m?.caption ?? '');
		setCredit(m?.credit ?? '');
		setTaken(m?.taken ?? '');
		setError(null);
	}, [id]);
	if (!m) return null;

	const nameOk = name === m.name || isMediaName(name);
	const dirty = caption !== (m.caption ?? '') || credit !== (m.credit ?? '') || taken !== (m.taken ?? '') || name !== m.name;
	const takenOk = taken === '' || /^\d{4}-\d{2}-\d{2}$/.test(taken);

	async function save() {
		if (!m) return;
		setBusy(true);
		setError(null);
		try {
			if (name !== m.name) {
				const e = await onRename(name);
				if (e) return setError(e);
			}
			const e = await onSave({ caption, credit, taken });
			if (e) return setError(e);
			onOpenChange(false);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-media-detail={m.name}>
				<DialogHeader>
					<DialogTitle>asset:{m.name}</DialogTitle>
					<DialogDescription>
						{m.width}×{m.height} · {formatBytes(m.bytes)} · from {m.sourceName}
						{usedIn > 0 ? ` · used in ${usedIn} deck${usedIn === 1 ? '' : 's'}` : ''}
					</DialogDescription>
				</DialogHeader>
				<div className="flex max-h-[40dvh] items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-alt)]">
					{url && <img src={url} alt={m.caption ?? ''} className="max-h-[40dvh] w-auto max-w-full object-contain" draggable={false} />}
				</div>
				<div className="grid gap-3 text-[13px]">
					<div className="grid gap-1">
						<label htmlFor={`${uid}-caption`} className="font-semibold">Description</label>
						<Textarea id={`${uid}-caption`} value={caption} maxLength={140} rows={2} onChange={(e) => setCaption(e.target.value)} placeholder="What the picture shows. Used as its alt text and by the chat." />
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label htmlFor={`${uid}-credit`} className="font-semibold">Credit</label>
							<Input id={`${uid}-credit`} value={credit} maxLength={100} onChange={(e) => setCredit(e.target.value)} placeholder="Photographer or source" />
						</div>
						<div className="grid gap-1">
							<label htmlFor={`${uid}-taken`} className="font-semibold">Date taken</label>
							<Input id={`${uid}-taken`} value={taken} inputMode="numeric" onChange={(e) => setTaken(e.target.value)} placeholder="YYYY-MM-DD" aria-invalid={!takenOk} />
						</div>
					</div>
					<div className="grid gap-1">
						<label htmlFor={`${uid}-name`} className="font-semibold">Name</label>
						<Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!nameOk} />
						<span className="text-[11.5px] text-muted-foreground">
							{nameOk ? 'Renaming keeps the old name working in every deck.' : 'Use lowercase letters, digits, - and _.'}
						</span>
					</div>
					{(m.aliases?.length ?? 0) > 0 && (
						<div className="grid gap-1">
							<span className="font-semibold">Also known as</span>
							<ul className="flex flex-wrap gap-1.5">
								{m.aliases?.map((a) => (
									<li key={a} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[11px]">
										asset:{a}
										{aliasUse[a] ? <span className="text-muted-foreground">· {aliasUse[a]} deck{aliasUse[a] === 1 ? '' : 's'}</span> : null}
										<button type="button" aria-label={`Remove the alias ${a}`} className="text-muted-foreground hover:text-foreground" onClick={() => void onRemoveAlias(a).then((e) => e && setError(e))}>
											<X className="size-3" aria-hidden />
										</button>
									</li>
								))}
							</ul>
							<span className="text-[11.5px] text-muted-foreground">Removing one frees the name. A deck that still writes it will show a placeholder.</span>
						</div>
					)}
				</div>
				{error && <p role="alert" className="text-[12.5px] text-destructive">{error}</p>}
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button onClick={() => void save()} disabled={!dirty || !nameOk || !takenOk || busy}>Save</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
