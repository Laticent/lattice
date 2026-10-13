import { CalendarDays, ChevronRight, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HelpTip } from '@/components/ui/help-tip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useObjectUrl } from './MediaCard';
import { isIsoDate, type MediaMetaPatch } from './media-edit';
import { isMediaName, type MediaRecord, uniqueName } from './media-store';
import { PhotoPlaceholder } from './PhotoPlaceholder';
import { formatBytes } from './reference-doc';

// The detail view behind a Library photo card: see the picture, read what is known about it, and edit
// the metadata a deck can reuse. A DIALOG, for the reason AssetVersions.tsx gives (the Library is itself
// a sheet on tablet and phone, and a sheet inside a sheet has two dismiss gestures).
//
// WHAT IS EDITABLE: the description (the record's `caption`, which the chat also reads), the credit, the date taken, and the name. Renaming keeps the old name as an
// alias, so no deck is edited and `asset:<old>` keeps resolving (media-store.ts `renameMedia`).
// Pixel size, bytes and file name are facts about the stored file and are shown, not edited.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §Editing a photo's metadata.

/** A name a camera, a phone or a chat app made: `img-4568`, `dsc0042`, `pxl-20231014-123456789-mp`, `img-20231014-wa0003`,
 *  `whatsapp-image-2026-10-13-at-10-30-00`, `screenshot-3`, `img-e4568`, or a long run of digits. It says nothing about the
 *  picture, so a suggested name may replace it without asking; a name the person typed is only ever offered. */
const CAMERA_WORDS = new Set(['img', 'image', 'dsc', 'dscn', 'dscf', 'pxl', 'mvimg', 'photo', 'pic', 'picture', 'screenshot', 'screen', 'shot', 'capture', 'scan', 'whatsapp', 'signal', 'at', 'am', 'pm', 'mp', 'copy', 'jpg', 'jpeg', 'png']);
export function generatedName(n: string): boolean {
	const parts = n.split(/[-_]+/).filter(Boolean);
	if (!parts.length) return false;
	const digits = (n.match(/\d/g) ?? []).length;
	// Every piece is a camera word, a number, or a short tag with a number (`wa0003`, `e4568`, `dsc0042`).
	const made = parts.every((p) => CAMERA_WORDS.has(p) || /^\d+$/.test(p) || /^[a-z]{1,4}\d+$/.test(p));
	if (!made) return false;
	// A bare number is a camera's only from five digits up: a name the person typed may well be `2026`.
	if (parts.every((p) => /^\d+$/.test(p))) return digits >= 5;
	return parts.some((p) => CAMERA_WORDS.has(p)) || digits >= 4;
}

/** Today as `YYYY-MM-DD` on THIS device's calendar. `toISOString` is UTC, which is already tomorrow (or still yesterday) for most of the world part of the day, and would grey out today's date. */
function localToday(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MediaDetailDialog({ m: incoming, open, onOpenChange, usedIn, aliasUse, onSave, aliasUseFailed, takenNames, onRemoveAlias, onUseNewName, onSuggest, returnFocusTo }: {
	m: MediaRecord | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Decks that write `asset:<name>` for the current name. */
	usedIn: number;
	/** Decks that still write each alias. */
	/** Decks that still write each old name, or null while that is being worked out (the markdown reader loads on demand). */
	aliasUse: Record<string, number> | null;
	/** The deck reader failed to load, so `aliasUse` will stay null: say so, and keep removal off since uses are unknown. */
	aliasUseFailed?: boolean;
	/** Every other photo's name and alias: a name Suggest proposes is made unique against these before it is applied. */
	takenNames?: ReadonlySet<string>;
	/** Resolves an error line to show, or null on success. */
	onSave: (change: MediaMetaPatch & { name?: string }) => Promise<string | null>;
	onRemoveAlias: (alias: string) => Promise<string | null>;
	/** Rewrite the decks that write `asset:<alias>` to the photo's current name. Resolves an error line, or null. */
	onUseNewName: (alias: string) => Promise<string | null>;
	/** Ask the connected model for a description of this photo. Resolves the text for the field, or a line saying why not. */
	onSuggest: () => Promise<{ text: string; name?: string } | { note: string }>;
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
	const [unreadable, setUnreadable] = React.useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new URL is a new chance for the picture to draw
	React.useEffect(() => setUnreadable(false), [url]);
	const [name, setName] = React.useState('');
	// The Name field as it is NOW: a Suggest answer can arrive after the person has typed their own, and must not replace it.
	const nameNow = React.useRef('');
	nameNow.current = name;
	const [caption, setCaption] = React.useState('');
	const [credit, setCredit] = React.useState('');
	const [taken, setTaken] = React.useState('');
	const [error, setError] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [suggesting, setSuggesting] = React.useState(false);
	const [suggestNote, setSuggestNote] = React.useState<string | null>(null);
	// A name the model proposed that was NOT applied (the photo already has a name the person chose): offered, never forced.
	const [suggestedName, setSuggestedName] = React.useState<string | null>(null);
	// The old-names section opens itself when there is something to do there (a deck still writes one, or that is still being worked out),
	// and stays shut otherwise. Once the person opens or closes it, it is theirs.
	const [oldOpen, setOldOpen] = React.useState(false);
	const oldToggled = React.useRef(false);
	const oldBusy = aliasUse === null || (m?.aliases ?? []).some((a) => (aliasUse?.[a] ?? 0) > 0);
	React.useEffect(() => {
		// Opens, never closes by itself: after "Use new name" the section must still say "not used in a deck".
		if (!oldToggled.current && oldBusy) setOldOpen(true);
	}, [oldBusy]);
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
		setSuggestedName(null);
		setSuggesting(false);
		oldToggled.current = false;
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
		const askedName = name;
		setSuggesting(true);
		setSuggestNote(null);
		try {
			const r = await onSuggest();
			// The answer belongs to the photo that asked. If the dialog was closed or shows another photo by now, drop it.
			if (visit.current !== asked) return;
			if ('text' in r) {
				setCaption(r.text);
				// A camera's file name (`img-4568`) says nothing, so the model's name replaces it; a name the person chose is only offered.
				// Made unique first (two photos of one shoe would otherwise both be "black-suede-brogue" and the save would be refused),
				// and applied only if the field still holds what it held when Suggest was pressed.
				const proposed = r.name ? uniqueName(r.name, new Set(takenNames ?? [])) : '';
				if (proposed && proposed !== nameNow.current) {
					if (generatedName(askedName) && nameNow.current === askedName) {
						setName(proposed);
						setSuggestNote(`Suggested the name “${proposed}” and a description. Nothing is saved until you press Save.`);
					} else {
						setSuggestedName(proposed);
						setSuggestNote('Suggested a description. Nothing is saved until you press Save.');
					}
				} else setSuggestNote('Suggested a description. Nothing is saved until you press Save.');
			} else setSuggestNote(r.note);
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
				// A column, not the base grid: the header and the Save row stay put and only the body scrolls, so Save is never below the fold.
				className="flex max-h-[90dvh] touch-pan-y touch-pinch-zoom flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
				data-media-detail={m.name}
				onCloseAutoFocus={(e) => {
					const back = returnFocusTo?.();
					if (back?.isConnected) {
						e.preventDefault();
						back.focus();
					}
				}}
			>
				<DialogHeader className="min-w-0 gap-1 px-5 pt-5 pr-12 pb-3 text-left sm:px-6 sm:pt-6">
					<DialogTitle className="truncate">asset:{m.name}</DialogTitle>
					<DialogDescription className="truncate text-xs">
						{m.width}×{m.height} · {formatBytes(m.bytes)} · from {m.sourceName}
						{usedIn > 0 ? ` · used in ${usedIn} deck${usedIn === 1 ? '' : 's'}` : ''}
					</DialogDescription>
				</DialogHeader>
				{/* A real form: Enter in a field saves, and Save is the submit button. */}
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(e) => {
						e.preventDefault();
						if (canSave) void save();
					}}
				>
					<div className="grid min-h-0 flex-1 touch-pan-y touch-pinch-zoom content-start gap-4 overflow-x-hidden overflow-y-auto px-5 pb-4 sm:px-6">
						<div className="flex max-h-[min(30dvh,220px)] items-center justify-center overflow-hidden rounded-md bg-[var(--bg-alt)]">
							{url && !unreadable && <img src={url} alt={m.caption ?? ''} className="max-h-[min(30dvh,220px)] w-auto max-w-full object-contain" draggable={false} onError={() => setUnreadable(true)} />}
							{url && unreadable && <PhotoPlaceholder className="min-h-[140px]" />}
						</div>

						<div className="grid min-w-0 gap-2">
							<div className="flex items-center justify-between gap-2">
								<span className="flex items-center gap-1.5">
									<Label htmlFor={`${uid}-caption`}>Description</Label>
									<HelpTip label="More about the description" side="top">
										It becomes the photo's alt text in the preview and in exports, and the chat reads it. <strong>Suggest with AI</strong> asks your image model (Workspace → Model) to look at the photo and draft a name and a description. Nothing is saved until you press Save.
									</HelpTip>
								</span>
							</div>
							<Textarea id={`${uid}-caption`} value={caption} maxLength={140} rows={3} className="min-h-[4.5rem] resize-none" onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="What the picture shows" />
							<Button type="button" variant="outline" className="w-full" disabled={suggesting || busy} onClick={() => void suggest()} aria-label="Suggest a name and description" data-suggest>
									<Sparkles aria-hidden />
									{suggesting ? 'Looking…' : 'Suggest with AI'}
								</Button>
							{suggestNote && <p role="status" className="text-xs text-muted-foreground">{suggestNote}</p>}
						</div>

						<div className="grid min-w-0 grid-cols-2 gap-3">
							<div className="grid min-w-0 gap-2">
								<Label htmlFor={`${uid}-credit`}>Credit</Label>
								<Input id={`${uid}-credit`} value={credit} maxLength={100} onChange={(e) => setCredit(e.target.value)} placeholder="Photographer" />
							</div>
							<div className="grid min-w-0 gap-2">
								<Label htmlFor={`${uid}-taken`}>Date taken</Label>
								{/* iOS Safari draws a date input with its own pill: taller than `h-9` and wider than its column, and it ignores both
								    until `appearance` is off. So on iOS (the `-webkit-touch-callout` query is iOS-only) the native look is removed, the
								    field is sized like every other Input, and a calendar glyph of our own stands in for the picker button. Elsewhere the
								    native control and its own picker button are kept. */}
								<div className="relative min-w-0">
									<Input
										id={`${uid}-taken`}
										type="date"
										value={taken}
										max={localToday()}
										onChange={(e) => setTaken(e.target.value)}
										aria-invalid={!takenOk}
										className="block min-w-0 max-w-full text-left [&::-webkit-date-and-time-value]:min-h-0 [&::-webkit-date-and-time-value]:text-left [@supports(-webkit-touch-callout:none)]:appearance-none [@supports(-webkit-touch-callout:none)]:[-webkit-appearance:none] [@supports(-webkit-touch-callout:none)]:pr-9"
									/>
									<CalendarDays className="pointer-events-none absolute top-1/2 right-3 hidden size-4 -translate-y-1/2 text-muted-foreground [@supports(-webkit-touch-callout:none)]:block" aria-hidden />
								</div>
							</div>
						</div>

						<div className="grid min-w-0 gap-2">
							<span className="flex items-center gap-1.5">
								<Label htmlFor={`${uid}-name`}>Name</Label>
								<HelpTip label="More about the name" side="top">
									Decks write <code>asset:{m.name}</code>. Renaming keeps the old name working in every deck, so no deck is edited.
								</HelpTip>
							</span>
							<Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-invalid={!nameOk} />
							{!nameOk && <p className="text-xs text-destructive">Use lowercase letters, digits, - and _.</p>}
							{suggestedName && suggestedName !== name && (
								<div className="flex flex-wrap items-center gap-2 text-xs" data-suggested-name>
									<span className="text-muted-foreground">Suggested name: <code className="font-mono">{suggestedName}</code></span>
									<Button type="button" size="sm" variant="outline" onClick={() => { setName(suggestedName); setSuggestedName(null); }}>Use this name</Button>
								</div>
							)}
						</div>

						{(m.aliases?.length ?? 0) > 0 && (
							<Collapsible open={oldOpen} onOpenChange={(v) => { oldToggled.current = true; setOldOpen(v); }} className="grid min-w-0 gap-2" data-old-names>
								<CollapsibleTrigger className="group flex h-9 w-full items-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
									<ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" aria-hidden />
									Old names
									<Badge variant="secondary">{m.aliases?.length}</Badge>
								</CollapsibleTrigger>
								<CollapsibleContent className="grid gap-2">
									<ul className="grid gap-2">
										{m.aliases?.map((a) => (
											<li key={a} className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
												<span className="min-w-0 flex-1">
													<code className="block truncate font-mono text-[13px]">asset:{a}</code>
													<span className="block text-muted-foreground">{aliasUse === null ? (aliasUseFailed ? 'could not check decks, close and reopen to retry' : 'checking decks…') : aliasUse[a] ? `in ${aliasUse[a]} deck${aliasUse[a] === 1 ? '' : 's'}` : 'not used in a deck'}</span>
												</span>
												{aliasUse?.[a] ? (
													<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => onUseNewName(a))}>
														Use new name in {aliasUse[a] === 1 ? 'the deck' : 'decks'}
													</Button>
												) : null}
												<Button type="button" size="icon" variant="ghost" aria-label={`Remove the alias ${a}`} disabled={busy || aliasUse === null} onClick={() => void run(() => onRemoveAlias(a))}>
													<X aria-hidden />
												</Button>
											</li>
										))}
									</ul>
									<p className="text-xs text-muted-foreground">The old name keeps working in every deck. Removing one frees the name, and a deck that still writes it will show a placeholder.</p>
								</CollapsibleContent>
							</Collapsible>
						)}

						{(m.fileCaption || m.hadLocation) && (
							<Collapsible defaultOpen={!!m.fileCaption} className="grid min-w-0 gap-2" data-from-file>
								<CollapsibleTrigger className="group flex h-9 w-full items-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
									<ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" aria-hidden />
									From the file
								</CollapsibleTrigger>
								<CollapsibleContent className="grid gap-2 rounded-md border bg-[var(--bg-alt)] p-3 text-xs">
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
								</CollapsibleContent>
							</Collapsible>
						)}
						{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
					</div>
					<DialogFooter className="grid grid-cols-2 gap-2 border-t px-5 py-3 sm:flex sm:px-6">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
						<Button type="submit" disabled={!canSave}>Save</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
