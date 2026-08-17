// Reference-doc attach UI (#640, #651) — one hook, reused by every Studio surface
// that grounds AI generation in a user-supplied doc (theme, component, deck chat).
// Keeps the paperclip control + filename chip in ONE place (HARD RULE #15).
//
// The paperclip opens a SEARCHABLE picker (a Popover + cmdk Command): "Add a file…"
// plus every doc in the SHARED library (IndexedDB, reusable across all decks), with a
// search box so it scales past a handful of files (#651 — a flat dropdown didn't). Pick
// a saved doc to reuse it, or trash it; an optional "Manage in Library" link opens the
// full manager. The chip shows the active doc + an honest "billed each run" note.
import { Check, Paperclip, Plus, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatBytes, MAX_GROUND_DOCS, REF_DOC_ACCEPT, type ReferenceDoc, readReferenceDoc } from './reference-doc';
import { deleteRefDoc, listRefDocs, type RefDocRecord, recordToDoc, saveRefDoc } from './reference-doc-store';

/** A short uppercase type label from the filename (PDF / MD / TXT), for the row badge. */
function typeLabel(rec: RefDocRecord): string {
	if (rec.docKind === 'pdf') return 'PDF';
	const ext = /\.([a-z0-9]+)$/i.exec(rec.name)?.[1];
	return (ext || 'txt').slice(0, 4).toUpperCase();
}

/** "Jul 1" — the honest, free metadata we DO have (addedAt); no fabricated "used in N decks". */
function fmtAdded(ts: number): string {
	try {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	} catch {
		return '';
	}
}

/**
 * Manage one attached reference document for a generation surface. Returns the
 * current `doc` (feed it to the generate / chatComplete calls), a `clear()` to drop
 * it after a successful run, and two ready-made elements: `attachButton` (the
 * paperclip picker — drop it in the prompt row) and `chip` (render it below the row).
 * `onManage`, when given, adds a "Manage in Library" link to the picker footer.
 */
export function useReferenceDoc(notify?: (msg: string) => void, onManage?: () => void) {
	// Multiple docs can ground ONE generation (#656). `docs` is the active set the
	// caller feeds to generate*/chatComplete; the picker toggles membership.
	const [docs, setDocs] = React.useState<ReferenceDoc[]>([]);
	const [saved, setSaved] = React.useState<RefDocRecord[]>([]);
	const [open, setOpen] = React.useState(false);
	const inputRef = React.useRef<HTMLInputElement>(null);

	const refresh = React.useCallback(() => {
		listRefDocs().then(setSaved).catch(() => setSaved([]));
	}, []);
	React.useEffect(() => refresh(), [refresh]);

	const capReached = () => { if (docs.length >= MAX_GROUND_DOCS) { notify?.(`You can ground up to ${MAX_GROUND_DOCS} docs at once — remove one first.`); return true; } return false; };

	const onFile = async (file?: File | null) => {
		if (!file) return;
		if (capReached()) return;
		try {
			const d = await readReferenceDoc(file);
			const rec = await saveRefDoc(d, Date.now()); // persist to the shared library
			// Add to the active set (carry the record id so toggle/remove match by identity).
			// The cap is re-checked INSIDE the updater so concurrent adds can't race past it.
			setDocs((cur) => (cur.some((x) => x.id === rec.id) || cur.length >= MAX_GROUND_DOCS ? cur : [...cur, { ...d, id: rec.id }]));
			refresh();
			notify?.(`Attached “${d.name}” — saved to your library and grounding the next generation (billed each run).`);
		} catch (e) {
			notify?.((e as Error)?.message || 'Could not read that file.');
		}
		if (inputRef.current) inputRef.current.value = ''; // allow re-picking the same file
	};

	// Toggle a saved doc in/out of the grounding set; the popover stays open so you
	// can pick several.
	const toggleSaved = (rec: RefDocRecord) => {
		setDocs((cur) => {
			if (cur.some((d) => d.id === rec.id)) return cur.filter((d) => d.id !== rec.id);
			if (cur.length >= MAX_GROUND_DOCS) { notify?.(`You can ground up to ${MAX_GROUND_DOCS} docs at once — remove one first.`); return cur; }
			return [...cur, recordToDoc(rec)];
		});
	};

	const removeSaved = async (rec: RefDocRecord, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		await deleteRefDoc(rec.id);
		refresh();
		setDocs((cur) => cur.filter((d) => d.id !== rec.id)); // also drop from the active set
	};

	const attachButton = (
		<>
			{/* Re-read the shared library each time the picker opens, so a doc saved (or
			    deleted) from another surface's picker shows up here without a remount. */}
			<Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) refresh(); }}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="Attach a reference document"
						title="Attach or reuse a reference doc (.txt, .md, .pdf) to ground generation"
						className={cn(
							'grid size-7 shrink-0 place-items-center rounded-md hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]',
							docs.length ? 'text-[var(--accent)]' : 'text-muted-foreground',
						)}
					>
						<Paperclip className="size-4" />
					</button>
				</PopoverTrigger>
				{/* Default side flips up automatically near the screen bottom (the chat), so
				    the same picker works in the chat and in the Fabricate bars. */}
				<PopoverContent align="start" className="w-72 p-0">
					<Command>
						<CommandInput placeholder="Search your docs…" className="text-[12.5px]" />
						{/* Pinned above the list so search never hides it. */}
						<button
							type="button"
							onClick={() => { setOpen(false); setTimeout(() => inputRef.current?.click(), 0); }}
							className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-[12.5px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
						>
							<Plus className="size-4 shrink-0" />Add a file…
						</button>
						<CommandList>
							{saved.length === 0 ? (
								// Empty LIBRARY (not an empty search) — keep the onboarding hint.
								<div className="px-3 py-4 text-center text-[11.5px] leading-snug text-muted-foreground">No saved docs yet — add a brand guide, deck, or brief above. Shared across all your decks.</div>
							) : (
								<>
									<CommandEmpty className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">No docs match your search.</CommandEmpty>
									<CommandGroup>
										{saved.map((rec) => {
											const active = docs.some((d) => d.id === rec.id);
											return (
												// value = unique id, keywords = name → cmdk selection identity can't collide on
												// same-named docs, while search still matches the filename. onSelect TOGGLES
												// membership (multi-select) and keeps the popover open.
												<CommandItem key={rec.id} value={rec.id} keywords={[rec.name]} onSelect={() => toggleSaved(rec)} className="group gap-2.5">
													<span className={cn('grid size-6 shrink-0 place-items-center rounded-md border border-border bg-card font-mono text-[8.5px] font-bold', rec.docKind === 'pdf' ? 'text-[var(--text-heading)]' : 'text-[var(--accent)]')}>{typeLabel(rec)}</span>
													<span className="min-w-0 flex-1">
														<span className="block truncate text-[12.5px] font-medium text-[var(--text-heading)]">{rec.name}</span>
														<span className="block font-mono text-[10px] text-muted-foreground">{rec.docKind === 'pdf' ? 'pdf' : 'text'} · {formatBytes(rec.bytes)} · {fmtAdded(rec.addedAt)}</span>
													</span>
													{active && <Check aria-label="Grounding this generation" className="size-4 shrink-0 text-[var(--accent)]" />}
													{/* Delete is ALWAYS present (muted), prominent on hover/focus — reachable by
													    mouse, touch, AND keyboard alike, incl. for the active doc. No hover-gating
													    or width heuristic (a hover-less tablet ≥sm width would miss those). */}
													<button type="button" aria-label={`Delete ${rec.name}`} onClick={(e) => removeSaved(rec, e)} className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:text-[var(--fail,#b3261e)] hover:opacity-100 focus-visible:opacity-100">
														<Trash2 className="size-3.5" />
													</button>
												</CommandItem>
											);
										})}
									</CommandGroup>
								</>
							)}
						</CommandList>
						<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
							<span>Stored in your browser · never uploaded</span>
							{onManage && (
								<button type="button" onClick={() => { setOpen(false); onManage(); }} className="ml-auto shrink-0 font-semibold text-[var(--accent)]">Manage in Library ↗</button>
							)}
						</div>
					</Command>
				</PopoverContent>
			</Popover>
			<input ref={inputRef} type="file" accept={REF_DOC_ACCEPT} hidden onChange={(e) => onFile(e.target.files?.[0])} />
		</>
	);

	// One chip per grounding doc (removable), plus an honest combined "billed each run"
	// note when more than one is attached.
	const chip = docs.length ? (
		<div className="flex flex-wrap items-center gap-1.5">
			{docs.map((d) => (
				<span key={d.id ?? d.name} className="flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] text-[var(--text-heading)]">
					<Paperclip className="size-3 shrink-0 text-[var(--accent)]" />
					<span className="max-w-[11rem] truncate font-medium">{d.name}</span>
					<span className="shrink-0 text-muted-foreground">{d.kind === 'pdf' ? 'PDF' : 'text'} · {formatBytes(d.bytes)}</span>
					<button type="button" onClick={() => setDocs((cur) => cur.filter((x) => x.id !== d.id))} aria-label={`Remove ${d.name}`} className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground">
						<X className="size-3" />
					</button>
				</span>
			))}
			<span className="text-[10px] text-muted-foreground">{docs.length > 1 ? `${docs.length} docs · ` : ''}billed each run</span>
		</div>
	) : null;

	return { docs, clear: () => setDocs([]), attachButton, chip };
}
