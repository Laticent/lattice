import { Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useObjectUrl } from './MediaCard';
import { isIsoDate, type MediaMetaPatch } from './media-edit';
import { isMediaName, type MediaRecord } from './media-store';
import { formatBytes } from './reference-doc';

// The detail view behind a Library photo card: see the picture, read what is known about it, and edit
// the metadata a deck can reuse. A DIALOG, for the reason AssetVersions.tsx gives (the Library is itself
// a sheet on tablet and phone, and a sheet inside a sheet has two dismiss gestures).
//
// WHAT IS EDITABLE: the description (the record's `caption`, which the chat also reads), the credit, the date taken, and the name. Renaming keeps the old name as an
// alias, so no deck is edited and `asset:<old>` keeps resolving (media-store.ts `renameMedia`).
// Pixel size, bytes and file name are facts about the stored file and are shown, not edited.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §Editing a photo's metadata.

/** Today as `YYYY-MM-DD` on THIS device's calendar. `toISOString` is UTC, which is already tomorrow (or still yesterday) for most of the world part of the day, and would grey out today's date. */
function localToday(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MediaDetailDialog({ m: incoming, open, onOpenChange, usedIn, aliasUse, onSave, onRemoveAlias, onUseNewName, onSuggest, returnFocusTo }: {
	m: MediaRecord | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Decks that write `asset:<name>` for the current name. */
	usedIn: number;
	/** Decks that still write each alias. */
	/** Decks that still write each old name, or null while that is being worked out (the markdown reader loads on demand). */
	aliasUse: Record<string, number> | null;
	/** Resolves an error line to show, or null on success. */
	onSave: (change: MediaMetaPatch & { name?: string }) => Promise<string | null>;
	onRemoveAlias: (alias: string) => Promise<string | null>;
	/** Rewrite the decks that write `asset:<alias>` to the photo's current name. Resolves an error line, or null. */
	onUseNewName: (alias: string) => Promise<string | null>;
	/** Ask the connected model for a description of this photo. Resolves the text for the field, or a line saying why not. */
	onSuggest: () => Promise<{ text: string } | { note: string }>;
	/** The control that opened the dialog. Closing returns keyboard focus to it, so a person who opened the dialog
	 *  with Enter is back where they were. Left out, the dialog's own default applies. */
	returnFocusTo?: () => HTMLElement | null;
}) {
	// The record stays on screen while the dialog closes. The Library clears it the moment the dialog asks to close, and
	// unmounting then would skip the close sequence: no exit animation, and focus would not return to the card that opened it.
	const lastRecord = React.useRef<MediaRecord | null>(null);
	if (incoming) lastRecord.current = incoming;
	const m = incoming ?? lastRecord.current;
	const url = useObjectUrl(m?.blob);
	const [name, setName] = React.useState('');
	const [caption, setCaption] = React.useState('');
	const [credit, setCredit] = React.useState('');
	const [taken, setTaken] = React.useState('');
	const [error, setError] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [suggesting, setSuggesting] = React.useState(false);
	const [suggestNote, setSuggestNote] = React.useState<string | null>(null);
	const uid = React.useId();
	// The form starts over every time the dialog OPENS, and when a different photo is shown: a draft from a cancelled visit is
	// gone, and a refresh of the same photo (the Library reloads while the dialog is open) does not wipe what is being typed.
	// `base` is what the form was opened with. Save sends only the fields the person changed from it, so a description the
	// chat wrote while the dialog was open is never overwritten by a form that never held it.
	const id = m?.id;
	const [base, setBase] = React.useState({ name: '', caption: '', credit: '', taken: '' });
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on opening and on the photo's identity on purpose
	React.useEffect(() => {
		if (!open) return;
		const start = { name: m?.name ?? '', caption: m?.caption ?? '', credit: m?.credit ?? '', taken: m?.taken ?? '' };
		setBase(start);
		setName(start.name);
		setCaption(start.caption);
		setCredit(start.credit);
		setTaken(start.taken);
		setError(null);
		setSuggestNote(null);
		setSuggesting(false);
	}, [id, open]);
	// A Suggest answer belongs to the visit that asked: the counter moves every time the dialog opens, closes or shows another
	// photo, so an answer from a cancelled visit cannot land in a reopened form, even of the same photo.
	const visit = React.useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: moves on opening, closing and the photo's identity on purpose
	React.useEffect(() => {
		visit.current += 1;
	}, [id, open]);
	if (!m) return null;

	const nameOk = name === base.name || isMediaName(name);
	const dirty = caption !== base.caption || credit !== base.credit || taken !== base.taken || name !== base.name;
	const takenOk = taken === '' || isIsoDate(taken);
	const canSave = dirty && nameOk && takenOk && !busy;

	/** Fill the description field with the model's draft. It is a draft: nothing is saved until the person presses Save,
	 *  and the person can edit it first. A refusal (no model connected, a model that cannot read images, the budget cap)
	 *  is a line under the field, never a silent no-op. */
	async function suggest() {
		const asked = visit.current;
		setSuggesting(true);
		setSuggestNote(null);
		try {
			const r = await onSuggest();
			// The answer belongs to the photo that asked. If the dialog was closed or shows another photo by now, drop it.
			if (visit.current !== asked) return;
			if ('text' in r) setCaption(r.text);
			else setSuggestNote(r.note);
		} catch {
			if (visit.current === asked) setSuggestNote("Couldn't reach the model. Check your connection and try again.");
		} finally {
			if (visit.current === asked) setSuggesting(false);
		}
	}

	/** One of the alias actions: busy while it runs, its refusal shown in the dialog. */
	async function run(action: () => Promise<string | null>) {
		setBusy(true);
		setError(null);
		try {
			const e = await action();
			if (e) setError(e);
		} finally {
			setBusy(false);
		}
	}

	async function save() {
		if (!m) return;
		setBusy(true);
		setError(null);
		try {
			// Only what this person changed: a description the chat wrote while the dialog was open is not erased
			// by a form that never held it. A rename and the edit are one save, so a refused name leaves nothing half done.
			const change: MediaMetaPatch & { name?: string } = {};
			if (name !== base.name) change.name = name;
			if (caption !== base.caption) change.caption = caption;
			if (credit !== base.credit) change.credit = credit;
			if (taken !== base.taken) change.taken = taken;
			if (Object.keys(change).length) {
				const e = await onSave(change);
				if (e) return setError(e);
			}
			onOpenChange(false);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
				data-media-detail={m.name}
				onCloseAutoFocus={(e) => {
					const back = returnFocusTo?.();
					if (back?.isConnected) {
						e.preventDefault();
						back.focus();
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>asset:{m.name}</DialogTitle>
					<DialogDescription>
						{m.width}×{m.height} · {formatBytes(m.bytes)} · from {m.sourceName}
						{usedIn > 0 ? ` · used in ${usedIn} deck${usedIn === 1 ? '' : 's'}` : ''}
					</DialogDescription>
				</DialogHeader>
				{/* A real form: Enter in a field saves, and Save is the submit button. `contents` keeps the dialog's grid. */}
				<form
					className="contents"
					onSubmit={(e) => {
						e.preventDefault();
						if (canSave) void save();
					}}
				>
				<div className="flex max-h-[40dvh] items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-alt)]">
					{url && <img src={url} alt={m.caption ?? ''} className="max-h-[40dvh] w-auto max-w-full object-contain" draggable={false} />}
				</div>
				<div className="grid gap-3 text-[13px]">
					<div className="grid gap-1">
						<div className="flex items-center justify-between gap-2">
							<label htmlFor={`${uid}-caption`} className="font-semibold">Description</label>
							<Button type="button" size="sm" variant="ghost" disabled={suggesting || busy} onClick={() => void suggest()} data-suggest>
								<Sparkles className="size-3.5" aria-hidden />
								{suggesting ? 'Looking…' : 'Suggest'}
							</Button>
						</div>
						<Textarea id={`${uid}-caption`} value={caption} maxLength={140} rows={2} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="What the picture shows. The chat reads it." />
					{suggestNote && <p role="status" className="text-[11.5px] text-muted-foreground">{suggestNote}</p>}
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="grid gap-1">
							<label htmlFor={`${uid}-credit`} className="font-semibold">Credit</label>
							<Input id={`${uid}-credit`} value={credit} maxLength={100} onChange={(e) => setCredit(e.target.value)} placeholder="Photographer or source" />
						</div>
						<div className="grid gap-1">
							<label htmlFor={`${uid}-taken`} className="font-semibold">Date taken</label>
							<Input id={`${uid}-taken`} type="date" value={taken} max={localToday()} onChange={(e) => setTaken(e.target.value)} aria-invalid={!takenOk} />
						</div>
					</div>
					<div className="grid gap-1">
						<label htmlFor={`${uid}-name`} className="font-semibold">Name</label>
						<Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!nameOk} />
						<span className="text-[11.5px] text-muted-foreground">
							{nameOk ? 'Renaming keeps the old name working in every deck.' : 'Use lowercase letters, digits, - and _.'}
						</span>
					</div>
					{(m.fileCaption || m.hadLocation) && (
						<div className="grid gap-1.5 rounded-lg border border-border bg-[var(--bg-alt)] p-3 text-[12.5px]" data-from-file>
							<span className="font-semibold">From the file</span>
							{m.fileCaption && (
								<div className="flex items-start gap-2">
									<p className="min-w-0 flex-1 text-muted-foreground">“{m.fileCaption}”</p>
									{caption !== m.fileCaption && (
										<Button type="button" size="sm" variant="outline" onClick={() => setCaption(m.fileCaption ?? '')}>
											Use as description
										</Button>
									)}
								</div>
							)}
							{m.hadLocation && <p className="text-muted-foreground">This photo carried a location. Lattice removed it when the photo was added, so it never reaches a deck or an export.</p>}
						</div>
					)}
					{(m.aliases?.length ?? 0) > 0 && (
						<div className="grid gap-1.5">
							<span className="font-semibold">Also known as</span>
							<ul className="grid gap-1.5">
								{m.aliases?.map((a) => (
									<li key={a} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[12px]">
										<code className="font-mono">asset:{a}</code>
										<span className="text-muted-foreground">{aliasUse === null ? 'checking decks…' : aliasUse[a] ? `in ${aliasUse[a]} deck${aliasUse[a] === 1 ? '' : 's'}` : 'not used in a deck'}</span>
										<span className="ml-auto flex items-center gap-1.5">
											{aliasUse?.[a] ? (
												<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => onUseNewName(a))}>
													Use new name in {aliasUse[a] === 1 ? 'the deck' : 'decks'}
												</Button>
											) : null}
											<button type="button" aria-label={`Remove the alias ${a}`} className="text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => void run(() => onRemoveAlias(a))}>
												<X className="size-3.5" aria-hidden />
											</button>
										</span>
									</li>
								))}
							</ul>
							<span className="text-[11.5px] text-muted-foreground">The old name keeps working in every deck. Removing one frees the name, and a deck that still writes it will show a placeholder.</span>
						</div>
					)}
				</div>
				{error && <p role="alert" className="text-[12.5px] text-destructive">{error}</p>}
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button type="submit" disabled={!canSave}>Save</Button>
				</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
