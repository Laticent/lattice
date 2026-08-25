import { Check, Download, FileBox, FileText, Package, Pencil, Plus,  Share2, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PanelDock, PanelEmpty, PanelHeader, PanelSearch, PanelSheet } from '@/components/ui/panel';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Tip } from '@/components/ui/tooltip';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { useBreakpoint, useLandscapePhone } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import { AssetVersionsDialog, type VersionedAsset } from './AssetVersions';
import { componentZipName, finishZipName, packBundle, packComponent, packFinish, packTheme, themeZipName, unpackBundle } from './asset-bundle';
import { deleteStudioComponent, listStudioComponents, type StudioComponent, saveStudioComponent } from './component-library';
import { generateSwatch } from './finish-generate';
import { deleteStudioFinish, listStudioFinishes, type StudioFinish, saveStudioFinish } from './finish-library';
import { type ImportRefusal, refuseImportedComponent, refuseImportedTheme } from './import-gate';
import { listAllAssetVersions, pruneOrphanVersions } from './library/asset-history.js';
import { listAssets } from './library/asset-store.js';
import { formatBytes, REF_DOC_ACCEPT, readReferenceDoc } from './reference-doc';
import { deleteRefDoc, listRefDocs, type RefDocRecord, saveRefDoc } from './reference-doc-store';
import { renderThemeShowcase } from './share-export';
import { deleteStudioTheme, listStudioThemes, type StudioTheme, saveStudioTheme } from './theme-library';

// The unified Library — one shelf for every saved theme + component + finish + the
// user's reference docs (#651), with a consistent apply/insert · share · manage flow
// (#54/#56) and zip import/export on the lattice-asset contract (#55). The two deck
// actions (apply a theme, insert a component) delegate to the shell; storage ops
// (delete, import) run here, then `onChanged` refreshes the shell's topbar/insert lists.

type Filter = 'all' | 'theme' | 'component' | 'finish' | 'refdoc';

function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Rebuild a Blob from a `data:…;base64,…` URL (a stored PDF's original bytes).
function dataUrlToBlob(dataUrl: string): Blob {
	const [head, b64] = dataUrl.split(',');
	const mime = /:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
	const bin = atob(b64 || '');
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

// Honest, free date label for a reference-doc card (the record's addedAt).
function fmtDate(ts: number): string {
	try {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	} catch {
		return '';
	}
}

/** The reference-file extensions the picker accepts, as a lower-cased set. */
const REF_DOC_EXTS = new Set(
	REF_DOC_ACCEPT.split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.startsWith('.')),
);

const extOf = (name: string) => (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? '').toLowerCase();

/**
 * Split a dropped set into the Library's two existing ingests, plus what neither takes.
 *
 * Keyed on EXTENSION, not on the picker that would have been used: dropping is one
 * gesture for every kind, so a `.zip` imports and a `.md` attaches regardless of which
 * filter tab happens to be showing. Exported so the routing is testable without a DOM —
 * the drag wiring around it is verified on the real Studio, but which file goes where
 * is plain logic and belongs in a unit test.
 */
export function classifyDropped(files: File[]): { zips: File[]; docs: File[]; rejected: File[] } {
	const zips: File[] = [];
	const docs: File[] = [];
	const rejected: File[] = [];
	for (const f of files) {
		const ext = extOf(f.name);
		if (ext === '.zip') zips.push(f);
		else if (REF_DOC_EXTS.has(ext)) docs.push(f);
		else rejected.push(f);
	}
	return { zips, docs, rejected };
}

/**
 * What to say about files the Library cannot take. Named rather than counted, and
 * capped at three so a stray folder-drop of fifty does not become a wall of toast — a
 * drop that silently does nothing reads as broken, which is the failure this avoids.
 */
export function rejectedMessage(names: string[]): string {
	const shown = names.slice(0, 3).join(', ');
	const rest = names.length > 3 ? ` and ${names.length - 3} more` : '';
	return `Can't add ${shown}${rest} — drop a .zip or ${REF_DOC_ACCEPT}.`;
}

// A few representative swatches for a theme card: the picked essentials, or the
// accent as a fallback when a legacy record has none.
function themeSwatches(t: StudioTheme): string[] {
	const e = t.essentials;
	if (e) return Object.values(e).filter((v) => /^#|^oklch|^rgb|^hsl/i.test(v)).slice(0, 10);
	return ['var(--accent)'];
}

// The Library's transport: a docked left column (desktop-Craft) or a PanelSheet
// (compact) — a right sheet at tablet, a bottom sheet on a phone. The inner content
// is identical across all three; `PanelHeader` absorbs the one difference that used
// to need a fork (a bare `h2` when docked vs `SheetTitle` inside the portal).
function LibraryFrame({ docked, open, onOpenChange, dropProps, children }: { docked?: boolean; open: boolean; onOpenChange: (o: boolean) => void; dropProps?: React.HTMLAttributes<HTMLDivElement>; children: React.ReactNode }) {
	// [container-type:inline-size]: the docked column is a size container so its header
	// controls (the Import label, the filter-tab count) collapse on PANE width when it's
	// dragged narrow — the Sheet is viewport-wide, so it doesn't need it.
	//
	// `dropProps` lands on the element that fills the panel in BOTH transports, so a file
	// dropped anywhere in the Library is caught — not only over the card grid. Inside the
	// Sheet that needs its own filling div: PanelSheet owns its root, and a drop target
	// that covers only part of the panel is one an author finds by accident.
	if (docked) return <div className="relative flex h-full min-h-0 flex-col [container-type:inline-size]" {...dropProps}>{children}</div>;
	// PanelSheet, not a hand-rolled SheetContent: it is what makes this a bottom sheet
	// on a phone (and keeps the 720px right sheet at tablet) — one framing decision,
	// made once, for every panel the drawer can open (#1211).
	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="lg">
			<div className="relative flex h-full min-h-0 flex-col" {...dropProps}>{children}</div>
		</PanelSheet>
	);
}

export function Library({ open, onOpenChange, docked, options, activePalette, activeFinish, initialFilter, onApplyTheme, onApplyFinish, onInsert, onEditTheme, onChanged, notify }: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	/** Desktop-Craft: render as a docked left column (plain div, no Sheet portal),
	 *  closed via its launcher toggle. Compact: omit → the right-side Sheet. */
	docked?: boolean;
	options: SingleSlideOptions;
	activePalette: string;
	activeFinish: string;
	initialFilter?: Filter;
	onApplyTheme: (name: string) => void;
	onApplyFinish: (name: string) => void;
	onInsert: (skeleton: string, name: string) => void;
	/** Reopen a saved theme in Fabricate for editing. Optional so a host that has no
	 *  Fabricate mount (there is only one) simply does not show the control. */
	onEditTheme?: (t: StudioTheme) => void;
	onChanged: () => void;
	notify: (msg: string) => void;
}) {
	// A phone docks the search field at the bottom; the docked column and the tablet
	// sheet keep it in the header. Same predicate `PanelSheet` uses to pick its edge.
	const bp = useBreakpoint();
	const landscape = useLandscapePhone();
	const phone = !docked && (bp === 'mobile' || landscape);
	const [themes, setThemes] = React.useState<StudioTheme[]>([]);
	const [components, setComponents] = React.useState<StudioComponent[]>([]);
	const [finishes, setFinishes] = React.useState<StudioFinish[]>([]);
	const [docs, setDocs] = React.useState<RefDocRecord[]>([]);
	const [filter, setFilter] = React.useState<Filter>('all');
	const [query, setQuery] = React.useState('');
	const [sel, setSel] = React.useState<Set<string>>(new Set());
	const [busy, setBusy] = React.useState<string | null>(null);
	const [armed, setArmed] = React.useState<string | null>(null);
	// assetId → how many earlier versions it has. Read as ONE sweep of the history
	// store rather than a query per card, so a shelf of forty assets is one read.
	const [versionCounts, setVersionCounts] = React.useState<Record<string, number>>({});
	const [historyFor, setHistoryFor] = React.useState<VersionedAsset | null>(null);
	const fileRef = React.useRef<HTMLInputElement>(null);
	const docFileRef = React.useRef<HTMLInputElement>(null);

	const reload = React.useCallback(() => {
		Promise.all([listStudioThemes(), listStudioComponents(), listStudioFinishes(), listRefDocs()]).then(([t, c, f, d]) => {
			setThemes(t);
			setComponents(c);
			setFinishes(f);
			setDocs(d);
			// Version counts, and the orphan net, in the same pass.
			//
			// `listAssets()` — the RAW store, every kind, one read — and deliberately not the
			// `t`/`c`/`f` lists above. Those three each swallow a throw and return `[]` so a
			// read never breaks the shelf, which is right for rendering and catastrophic for a
			// prune: one transient failure would hand `pruneOrphanVersions` a live set missing
			// a whole kind, and it would permanently delete every version of it. The raw read
			// rejects instead, so the `.catch` below skips the prune entirely.
			//
			// It also has to be every kind rather than the three the Library shows: the prune
			// sweeps the WHOLE history store, so a kind that is versioned but not displayed
			// would be wiped on every Library open. Nothing is versioned but undisplayed today
			// — and `asset-store.js` tells the next change to add `'scene'` to `VERSIONED_KINDS`
			// when scenes get a card, which is exactly that shape.
			//
			// Why prune at all, when `deleteAsset` drops an asset's versions with it: a
			// workspace RESTORE re-saves assets with no id, so a record whose name changed
			// between backup and restore returns under a NEW id and strands its old history on
			// a dead one. An orphan is invisible through the UI and un-deletable, so it only
			// ever accumulates.
			Promise.all([listAllAssetVersions(), listAssets()])
				.then(async ([rows, all]: [{ assetId: string }[], { id: string }[]]) => {
					const live = new Set<string>(all.map((a) => a.id));
					const counts: Record<string, number> = {};
					for (const r of rows) if (live.has(r.assetId)) counts[r.assetId] = (counts[r.assetId] || 0) + 1;
					setVersionCounts(counts);
					if (rows.some((r) => !live.has(r.assetId))) await pruneOrphanVersions(live);
				})
				.catch(() => setVersionCounts({}));
		});
	}, []);
	// Load (and refresh) whenever the drawer opens; honor a requested initial tab
	// (the picker's "Manage in Library" link opens straight to Files).
	React.useEffect(() => {
		if (open) {
			reload();
			if (initialFilter) setFilter(initialFilter);
		} else {
			setSel(new Set());
			setArmed(null);
		}
	}, [open, reload, initialFilter]);

	const q = query.trim().toLowerCase();
	const vThemes = filter === 'all' || filter === 'theme' ? themes.filter((t) => !q || t.label.toLowerCase().includes(q) || t.name.includes(q)) : [];
	const vComponents = filter === 'all' || filter === 'component' ? components.filter((c) => !q || c.name.includes(q) || (c.bucket || '').includes(q)) : [];
	const vFinishes = filter === 'all' || filter === 'finish' ? finishes.filter((f) => !q || f.label.toLowerCase().includes(q) || f.name.includes(q)) : [];
	const vDocs = filter === 'all' || filter === 'refdoc' ? docs.filter((d) => !q || d.name.toLowerCase().includes(q)) : [];
	const total = themes.length + components.length + finishes.length + docs.length;
	// Only the reference files carry a byte size (a theme/component/finish is CSS + a
	// recipe, measured in kilobytes nobody budgets), so the status bar reports the one
	// number a browser-storage shelf can genuinely run out of rather than a made-up total.
	const docBytes = docs.reduce((n, d) => n + (d.bytes || 0), 0);

	const tKey = (t: StudioTheme) => `theme:${t.id}`;
	const cKey = (c: StudioComponent) => `comp:${c.id}`;
	const fKey = (f: StudioFinish) => `finish:${f.id}`;
	const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

	// A card's metadata line: the facts, then the way into this asset's earlier versions.
	//
	// The version affordance is HERE and not in the action row because that row already
	// carries four controls at 390px and a fifth does not fit. But the line cannot stay a
	// single `truncate` span once it holds a control: `truncate` is `overflow:hidden` on a
	// nowrap line, so on a narrow card the button rendered, reported itself visible, and
	// was UNCLICKABLE — the clipped parent took the pointer events. Caught by driving the
	// real Studio, invisible to every unit test (HARD RULE #23).
	//
	// So the line is a flex row: the facts truncate, the control is `shrink-0` and always
	// reachable. That is also the right priority — a name you can half-read still tells
	// you which card you are on; a button you cannot press tells you nothing.
	const metaLine = (facts: React.ReactNode, asset: VersionedAsset) => {
		const n = versionCounts[asset.id] || 0;
		return (
			<div className="mt-1 flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
				<span className="min-w-0 truncate">{facts}</span>
				{n > 0 && (
					<>
						<span aria-hidden="true">·</span>
						<button
							type="button"
							onClick={() => setHistoryFor(asset)}
							aria-label={`Earlier versions of ${asset.label} (${n})`}
							className="shrink-0 whitespace-nowrap font-semibold text-[var(--accent)] underline decoration-dotted underline-offset-2"
						>
							{n} version{n === 1 ? '' : 's'}
						</button>
					</>
				)}
			</div>
		);
	};

	// Reference docs (#651) — download rebuilds the original bytes from the record;
	// delete removes it from the shared library. No bulk-export/share (docs aren't
	// lattice assets), so refdoc cards carry no selection checkbox.
	function downloadDoc(d: RefDocRecord) {
		try {
			if (d.docKind === 'pdf' && !d.dataUrl) { notify('Could not download that doc.'); return; } // don't ship a 0-byte .pdf
			const blob = d.docKind === 'pdf' && d.dataUrl ? dataUrlToBlob(d.dataUrl) : new Blob([d.text ?? ''], { type: 'text/plain' });
			download(blob, d.name);
		} catch {
			notify('Could not download that doc.');
		}
	}
	function removeDoc(d: RefDocRecord) {
		deleteRefDoc(d.id).then(() => { reload(); notify(`Deleted ${d.name}.`); });
	}
	async function addDocFiles(files: FileList | null) {
		if (!files?.length) return;
		setBusy('Adding…');
		let n = 0;
		try {
			for (const file of Array.from(files)) {
				const d = await readReferenceDoc(file);
				await saveRefDoc(d, Date.now());
				n++;
			}
			reload();
			notify(`Added ${n} reference doc${n === 1 ? '' : 's'}.`);
		} catch (e) {
			notify(String((e as Error)?.message || 'Could not add that file.'));
		} finally {
			setBusy(null);
			if (docFileRef.current) docFileRef.current.value = '';
		}
	}

	async function shareTheme(t: StudioTheme) {
		setBusy(`Rendering ${t.label} showcase…`);
		try {
			let pdf: Blob | null = null;
			try { pdf = await renderThemeShowcase(options, t); } catch { pdf = null; } // showcase is best-effort
			download(await packTheme(t, pdf), themeZipName(t));
			notify(pdf ? `Shared ${t.label} (with showcase PDF).` : `Shared ${t.label} (showcase skipped — engine busy).`);
		} catch {
			notify('Could not build the theme zip.');
		} finally {
			setBusy(null);
		}
	}
	async function shareComponent(c: StudioComponent) {
		setBusy(`Packing .${c.name}…`);
		try {
			download(await packComponent(c), componentZipName(c));
			notify(`Shared .${c.name}.`);
		} finally {
			setBusy(null);
		}
	}
	async function shareFinish(f: StudioFinish) {
		setBusy(`Packing ${f.label}…`);
		try {
			download(await packFinish(f), finishZipName(f));
			notify(`Shared ${f.label}.`);
		} finally {
			setBusy(null);
		}
	}
	async function bulkExport() {
		const selThemes = themes.filter((t) => sel.has(tKey(t)));
		const selComps = components.filter((c) => sel.has(cKey(c)));
		const selFinishes = finishes.filter((f) => sel.has(fKey(f)));
		const n = selThemes.length + selComps.length + selFinishes.length;
		if (n === 0) return;
		// A single selected asset shares as its own zip; a mix becomes a bundle.
		if (n === 1 && selThemes.length === 1) return shareTheme(selThemes[0]);
		if (n === 1 && selComps.length === 1) return shareComponent(selComps[0]);
		if (n === 1 && selFinishes.length === 1) return shareFinish(selFinishes[0]);
		setBusy(`Packing ${n} assets…`);
		try {
			const withPdf = await Promise.all(selThemes.map(async (theme) => ({ theme, showcase: await renderThemeShowcase(options, theme).catch(() => null) })));
			download(await packBundle(withPdf, selComps, selFinishes), 'lattice-assets.zip');
			notify(`Exported ${n} assets as lattice-assets.zip.`);
			setSel(new Set());
		} catch {
			notify('Could not build the bundle.');
		} finally {
			setBusy(null);
		}
	}
	async function importFiles(files: FileList | null) {
		if (!files?.length) return;
		setBusy('Importing…');
		let nThemes = 0;
		let nComps = 0;
		let nFinishes = 0;
		// PER ITEM, not per bundle. The whole three-loop import used to sit in one `try`,
		// so one bad asset skipped every asset after it — and `reload()`/`onChanged()` sat
		// inside that `try` too, so the shelf was not even refreshed for the ones that HAD
		// landed. The result was a silent partial import that the toast denied. Now a
		// refused item is named and the rest still import.
		const refused: ImportRefusal[] = [];
		try {
			for (const f of Array.from(files)) {
				const { themes: ts, components: cs, finishes: fs } = await unpackBundle(f);
				// `historyLabel` — an import that lands on a name you already use REPLACES that
				// record (the store dedupes by kind+name when no id is passed), so the version it
				// snapshots is the one thing between a stranger's .zip and your own work.
				for (const t of ts) {
					const no = refuseImportedTheme(t.css, t.label || t.name);
					if (no) { refused.push(no); continue; }
					await saveStudioTheme({ name: t.name, label: t.label, essentials: t.essentials ?? {}, css: t.css }, { historyLabel: 'Before import' });
					nThemes++;
				}
				for (const c of cs) {
					const no = refuseImportedComponent(c.css, c.name);
					if (no) { refused.push(no); continue; }
					await saveStudioComponent({ name: c.name, css: c.css, skeleton: c.skeleton, meta: { bucket: c.bucket || undefined } }, { historyLabel: 'Before import' });
					nComps++;
				}
				// A finish needs no CSS gate: `saveStudioFinish` DISCARDS the bundle's CSS and
				// regenerates it from the recipe, and `coerceRecipe` clamps every number and
				// enum-checks every keyword on the way in. Safe by construction, not by a scan.
				for (const fin of fs) { await saveStudioFinish({ name: fin.name, label: fin.label, css: fin.css, recipe: fin.recipe }, { historyLabel: 'Before import' }); nFinishes++; }
			}
		} catch (e) {
			notify(`Import failed — ${String((e as Error)?.message || e)}`);
		} finally {
			// ALWAYS refresh, even on the failure path: whatever did land is on the shelf, and
			// a stale shelf is how a partial import reads as "nothing happened".
			reload();
			onChanged();
			const got = nThemes + nComps + nFinishes;
			if (got) notify(`Imported ${nThemes} theme(s) + ${nComps} component(s)${nFinishes ? ` + ${nFinishes} finish(es)` : ''}.`);
			for (const r of refused) if (r) notify(`Refused ${r.name} — ${r.why}`);
			if (!got && !refused.length) notify('Nothing to import from that file.');
			setBusy(null);
			if (fileRef.current) fileRef.current.value = '';
		}
	}
	// ── Drop a file on the Library ──────────────────────────────────────────────
	// The Library already had two ingests behind two buttons — a `.zip` of lattice
	// assets and a reference file — and no way to drop either (#1655). Drop routes to
	// the SAME two functions rather than growing a third ingest: `unpackBundle` already
	// normalizes a component skeleton's line endings on the way in
	// (SANCTIONED_EOL_BOUNDARIES), and `readReferenceDoc` already owns the size/kind
	// rules. A second parser here would be a second set of both.
	//
	// The kind is decided by EXTENSION, not by the picker that would have been used:
	// dropping is one gesture for every kind, so a `.zip` imports and a `.md` attaches
	// regardless of which filter tab happens to be showing. Anything else is named in
	// the toast rather than silently ignored — a drop that does nothing reads as broken.
	async function acceptDropped(files: File[]) {
		const { zips, docs, rejected } = classifyDropped(files);
		// A FileList is what both ingests take; rebuild one per group rather than
		// widening their signatures for this one caller.
		const asList = (fs: File[]) => {
			const dt = new DataTransfer();
			for (const f of fs) dt.items.add(f);
			return dt.files;
		};
		if (zips.length) await importFiles(asList(zips));
		if (docs.length) await addDocFiles(asList(docs));
		if (rejected.length) notify(rejectedMessage(rejected.map((f) => f.name)));
	}
	// A counter, not a boolean: `dragleave` fires every time the pointer crosses into a
	// CHILD element, so a boolean flickers the overlay off while the pointer is still
	// plainly inside the panel.
	const dragDepth = React.useRef(0);
	const [dragging, setDragging] = React.useState(false);
	const dropProps: React.HTMLAttributes<HTMLDivElement> = {
		onDragEnter: (e) => {
			if (!e.dataTransfer?.types?.includes('Files')) return;
			dragDepth.current += 1;
			setDragging(true);
		},
		onDragOver: (e) => {
			if (!e.dataTransfer?.types?.includes('Files')) return;
			e.preventDefault(); // without this the browser refuses the drop and opens the file instead
			e.dataTransfer.dropEffect = 'copy';
		},
		onDragLeave: () => {
			dragDepth.current = Math.max(0, dragDepth.current - 1);
			if (dragDepth.current === 0) setDragging(false);
		},
		onDrop: (e) => {
			if (!e.dataTransfer?.files?.length) return;
			e.preventDefault();
			dragDepth.current = 0;
			setDragging(false);
			void acceptDropped(Array.from(e.dataTransfer.files));
		},
	};

	function removeTheme(t: StudioTheme) {
		deleteStudioTheme(t.id).then(() => { reload(); onChanged(); notify(`Deleted ${t.label}.`); });
	}
	function removeComponent(c: StudioComponent) {
		deleteStudioComponent(c.id).then(() => { reload(); onChanged(); notify(`Deleted .${c.name}.`); });
	}
	function removeFinish(f: StudioFinish) {
		deleteStudioFinish(f.id).then(() => { reload(); onChanged(); notify(`Deleted ${f.label}.`); });
	}

	const selCount = sel.size;

	// The header controls (search + contextual add) — shared by both transports; only
	// The search field, hoisted OUT of the header. On a phone it used to wrap to its own
	// row inside the header (`basis-full` + the header's `flex-wrap`), and that is what
	// made this panel's header 125px against every other panel's 56px — the largest
	// single deviation in a set of surfaces that claim to share a frame. It now docks at
	// the BOTTOM on a phone (above the keyboard, beside the thumb that types it) and
	// stays in the header on the docked column and the tablet sheet, which have room.
	const searchField = (
		<PanelSearch
			value={query}
			onChange={setQuery}
			onClear={() => setQuery('')}
			placeholder="Search themes, components, finishes & files…"
			label="Search library"
			className={phone ? undefined : 'ml-1 flex-1'}
		/>
	);

	const headerControls = (
		<>
			{phone ? null : searchField}
					{/* Contextual add: the Files tab attaches .txt/.md/.pdf reference files; every
					    other tab imports a lattice-asset .zip — one button, meaning by tab. */}
					{filter === 'refdoc' ? (
						<Tip label="Add a .txt/.md/.pdf reference doc"><Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => docFileRef.current?.click()} aria-label="Add a reference doc"><Plus className="size-3.5" /><span className={cn('hidden', docked ? '@[20rem]:inline' : 'sm:inline')}>Add file</span></Button></Tip>
					) : (
						<Tip label="Import a .zip"><Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => fileRef.current?.click()} aria-label="Import .zip"><Upload className="size-3.5" /><span className={cn('hidden', docked ? '@[20rem]:inline' : 'sm:inline')}>Import</span></Button></Tip>
					)}
					<input ref={fileRef} type="file" accept=".zip" multiple hidden onChange={(e) => importFiles(e.target.files)} />
					<input ref={docFileRef} type="file" accept={REF_DOC_ACCEPT} multiple hidden onChange={(e) => addDocFiles(e.target.files)} />
		</>
	);

	// ONE header for both transports. `PanelHeader` already resolves the docked-vs-sheet
	// difference internally (a bare `h2` when docked, `SheetTitle` inside the portal), so
	// the two hand-rolled variants this replaces were the fork the primitive exists to
	// prevent — and the reason this panel's close was the Sheet's own 16px X rather than
	// the 44px one every other panel now gets on a phone (#1211).
	const header = (
		<PanelHeader
			icon={<FileBox />}
			title="Library"
			srDescription="Saved themes, components, finishes, and files — search, filter, apply, or drop a file in."
			actions={headerControls}
			onClose={docked ? () => onOpenChange(false) : undefined}
			showClose={!docked}
		/>
	);

	return (
		<LibraryFrame docked={docked} open={open} onOpenChange={onOpenChange} dropProps={dropProps}>
			{header}

				<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5">
					{/* `PillTabs`, not a hand-rolled segmented track. This forked the shared
					    primitive: same job (pick one section of the panel), different shape, and
					    — because it was `aria-pressed` buttons rather than a `role="tablist"` —
					    no roving tabindex and no arrow-key movement, which Settings, Workspace and
					    the slide drawer all have. It also WRAPS now instead of scrolling sideways,
					    so a narrow pane no longer hides filters behind a horizontal scroller
					    nested in the panel's vertical one. (HARD RULE #15 — reuse.) */}
					<PillTabs
						className="min-w-0 flex-1"
						ariaLabel="Library sections"
						value={filter}
						onValueChange={(v) => setFilter(v as Filter)}
						tabs={(['all', 'theme', 'component', 'finish', 'refdoc'] as Filter[]).map((f) => ({
							value: f,
							label: f === 'all' ? 'All' : f === 'refdoc' ? 'Files' : f === 'finish' ? 'Finishes' : `${f[0].toUpperCase()}${f.slice(1)}s`,
						}))}
					/>
					{/* The count MOVED to the status bar at the foot of the panel (#1655). It sat
					    here competing with the filters for the same row, which is why it had to
					    hide on a narrow pane and on a phone at all — five pills need ~340px, and
					    at 390px the count stole just enough that "Files" clipped mid-word and sat
					    flush against "0 total" (#1211). A status bar has the row to itself, so the
					    count is legible at every width instead of disappearing at the two where a
					    shelf is hardest to read. */}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-4 overscroll-contain [touch-action:pan-y] min-w-0">
					{total === 0 ? (
						/* `PanelEmpty`, not a hand-rolled centered block — one zero-state grammar
						   across every drawer, the same way there is one header. */
						<div className="grid h-full place-items-center">
							<PanelEmpty icon={<FileBox />} title="No saved assets yet">
								Fabricate a theme or a component, or <button type="button" className="font-semibold text-[var(--accent)]" onClick={() => fileRef.current?.click()}>import a .zip</button>.
							</PanelEmpty>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{vThemes.map((t) => {
								const k = tKey(t);
								const active = t.name === activePalette;
								return (
									<div key={k} className={cn('relative overflow-hidden rounded-xl border bg-card', sel.has(k) ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border')}>
										<button type="button" aria-label={`Select ${t.label}`} aria-pressed={sel.has(k)} onClick={() => toggle(k)} className={cn('absolute left-2.5 top-2.5 z-10 grid size-[18px] place-items-center rounded-md border bg-background', sel.has(k) ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-border')}>{sel.has(k) && <Check className="size-3" />}</button>
										{/* biome-ignore lint/suspicious/noArrayIndexKey: a fixed positional color ramp — the index IS the swatch identity */}
										<div className="flex h-[88px] w-full">{themeSwatches(t).map((c, i) => <span key={`${k}-${i}`} className="flex-1" style={{ background: c }} />)}</div>
										<div className="p-2.5">
											<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><span className="truncate">{t.label}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">Theme</span>{active && <span className="ml-auto font-mono text-[9px] uppercase text-[var(--accent)]">Active</span>}</div>
											{metaLine(<>{t.name} · {t.essentials ? `${Object.keys(t.essentials).length} essentials` : 'theme'} · AA</>, { id: t.id, label: t.label })}
											<div className="mt-2.5 flex items-center gap-1.5">
												<button type="button" onClick={() => { onApplyTheme(t.name); notify(`Applied ${t.label}.`); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-soft)] py-1.5 text-[11.5px] font-semibold text-[var(--accent)]"><Check className="size-3.5" />Apply</button>
												{/* Icon-only, like Share: the row is already tight at mobile. This is
												    the ONLY way back into a saved theme — Fabricate had no seed at all,
												    so a theme could be made and never reopened. */}
												{onEditTheme && <button type="button" onClick={() => { onEditTheme(t); onOpenChange(false); }} aria-label={`Edit ${t.label}`} className="flex items-center justify-center rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground"><Pencil className="size-3.5" /></button>}
												<button type="button" disabled={!!busy} onClick={() => shareTheme(t)} aria-label={`Share ${t.label}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground disabled:opacity-50"><Share2 className="size-3.5" />Share</button>
												<DeleteBtn armed={armed === k} onArm={() => setArmed(k)} onConfirm={() => { setArmed(null); removeTheme(t); }} onCancel={() => setArmed(null)} label={t.label} />
											</div>
										</div>
									</div>
								);
							})}
							{vComponents.map((c) => {
								const k = cKey(c);
								return (
									<div key={k} className={cn('relative overflow-hidden rounded-xl border bg-card', sel.has(k) ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border')}>
										<button type="button" aria-label={`Select .${c.name}`} aria-pressed={sel.has(k)} onClick={() => toggle(k)} className={cn('absolute left-2.5 top-2.5 z-10 grid size-[18px] place-items-center rounded-md border bg-background', sel.has(k) ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-border')}>{sel.has(k) && <Check className="size-3" />}</button>
										<div className="grid h-[88px] w-full place-content-center bg-[repeating-linear-gradient(45deg,var(--bg-alt),var(--bg-alt)_8px,var(--bg)_8px,var(--bg)_16px)]"><span className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-[12px] font-semibold text-[var(--accent)] shadow-sm">.{c.name}</span></div>
										<div className="p-2.5">
											<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><span className="truncate">.{c.name}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--text-muted)_30%,transparent)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--text-muted)]">Component</span></div>
											{metaLine(<>{c.bucket || 'local'} · scoped · palette-blind</>, { id: c.id, label: `.${c.name}` })}
											<div className="mt-2.5 flex items-center gap-1.5">
												<button type="button" onClick={() => { onInsert(c.skeleton, c.name); notify(`Inserted .${c.name}.`); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-soft)] py-1.5 text-[11.5px] font-semibold text-[var(--accent)]"><Plus className="size-3.5" />Insert</button>
												<button type="button" disabled={!!busy} onClick={() => shareComponent(c)} aria-label={`Share .${c.name}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground disabled:opacity-50"><Share2 className="size-3.5" />Share</button>
												<DeleteBtn armed={armed === k} onArm={() => setArmed(k)} onConfirm={() => { setArmed(null); removeComponent(c); }} onCancel={() => setArmed(null)} label={`.${c.name}`} />
											</div>
										</div>
									</div>
								);
							})}
							{vFinishes.map((f) => {
								const k = fKey(f);
								// The deck names a saved finish by its prefixed token `finish-<slug>`
								// (bare slug accepted too, for back-compat).
								const active = activeFinish === `finish-${f.name}` || activeFinish === f.name;
								const sw = generateSwatch(f.recipe);
								return (
									<div key={k} className={cn('relative overflow-hidden rounded-xl border bg-card', sel.has(k) ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border')}>
										<button type="button" aria-label={`Select ${f.label}`} aria-pressed={sel.has(k)} onClick={() => toggle(k)} className={cn('absolute left-2.5 top-2.5 z-10 grid size-[18px] place-items-center rounded-md border bg-background', sel.has(k) ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-border')}>{sel.has(k) && <Check className="size-3" />}</button>
										<div className="h-[88px] w-full bg-[var(--bg)]" style={{ backgroundImage: sw.background, backgroundSize: sw.backgroundSize }} />
										<div className="p-2.5">
											<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><span className="truncate">{f.label}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">Finish</span>{active && <span className="ml-auto font-mono text-[9px] uppercase text-[var(--accent)]">Active</span>}</div>
											{metaLine(<>{f.name} · layered · palette-blind</>, { id: f.id, label: f.label })}
											<div className="mt-2.5 flex items-center gap-1.5">
												<button type="button" onClick={() => { onApplyFinish(f.name); notify(`Applied ${f.label}.`); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-soft)] py-1.5 text-[11.5px] font-semibold text-[var(--accent)]"><Check className="size-3.5" />Apply</button>
												<button type="button" disabled={!!busy} onClick={() => shareFinish(f)} aria-label={`Share ${f.label}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground disabled:opacity-50"><Share2 className="size-3.5" />Share</button>
												<DeleteBtn armed={armed === k} onArm={() => setArmed(k)} onConfirm={() => { setArmed(null); removeFinish(f); }} onCancel={() => setArmed(null)} label={f.label} />
											</div>
										</div>
									</div>
								);
							})}
							{vDocs.map((d) => (
								// Reference doc — manage-only card (no select/share; docs aren't lattice assets).
								<div key={`refdoc:${d.id}`} className="relative overflow-hidden rounded-xl border border-border bg-card">
									<div className="grid h-[88px] w-full place-content-center bg-[var(--accent-soft)]"><span className="grid size-11 place-items-center rounded-xl border border-border bg-card font-mono text-[11px] font-bold text-[var(--accent)]">{d.docKind === 'pdf' ? 'PDF' : (/\.([a-z0-9]+)$/i.exec(d.name)?.[1] || 'txt').slice(0, 4).toUpperCase()}</span></div>
									<div className="p-2.5">
										<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><FileText className="size-3.5 shrink-0 text-[var(--accent)]" /><span className="truncate">{d.name}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">File</span></div>
										<div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">{d.docKind === 'pdf' ? 'pdf' : 'text'} · {formatBytes(d.bytes)} · added {fmtDate(d.addedAt)}</div>
										<div className="mt-2.5 flex items-center gap-1.5">
											<button type="button" onClick={() => downloadDoc(d)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-[11.5px] font-semibold text-foreground"><Download className="size-3.5" />Download</button>
											<DeleteBtn armed={armed === `refdoc:${d.id}`} onArm={() => setArmed(`refdoc:${d.id}`)} onConfirm={() => { setArmed(null); removeDoc(d); }} onCancel={() => setArmed(null)} label={d.name} />
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{busy && <div className="border-t border-border bg-[var(--accent-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--accent)]">{busy}</div>}
				{selCount > 0 && !busy && (
					<div className="flex items-center gap-2 border-t border-border bg-[color-mix(in_srgb,var(--accent)_7%,var(--bg-alt))] px-4 py-2.5">
						<Button size="sm" className="gap-1.5" onClick={bulkExport}><Package className="size-4" />Export {selCount} as .zip</Button>
						<button type="button" className="ml-auto text-[12px] font-semibold text-[var(--accent)]" onClick={() => setSel(new Set())}>Clear selection</button>
					</div>
				)}
				{/* The status bar — what the shelf HOLDS, always visible, at every width. The
				    breakdown is what "N total" could never say from inside the filter row: which
				    kinds you actually have, and how much disk the files are using (the one number
				    a browser-storage shelf can genuinely run out of). Both are read off the same
				    loaded lists, so the bar cannot disagree with the cards above it. */}
				<div className="flex items-center gap-2 border-t border-border bg-card px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
					<span className="shrink-0 font-semibold text-foreground">{total} {total === 1 ? 'item' : 'items'}</span>
					<span className={cn('min-w-0 truncate', docked ? 'hidden @[18rem]:inline' : 'hidden xs:inline')}>
						{[
							themes.length && `${themes.length} theme${themes.length === 1 ? '' : 's'}`,
							components.length && `${components.length} component${components.length === 1 ? '' : 's'}`,
							finishes.length && `${finishes.length} finish${finishes.length === 1 ? '' : 'es'}`,
							docs.length && `${docs.length} file${docs.length === 1 ? '' : 's'}`,
						].filter(Boolean).join(' · ') || 'nothing saved yet'}
					</span>
					<span className="ml-auto shrink-0 whitespace-nowrap">
						{selCount > 0 ? `${selCount} selected` : docBytes > 0 ? formatBytes(docBytes) : ''}
					</span>
				</div>
			{/* Phone: the search field docks here, above the keyboard. */}
			{phone && <PanelDock>{searchField}</PanelDock>}
			{/* The drop target, made visible only while something is over it. `pointer-events-
			    none` is load-bearing: an overlay that swallows pointer events takes the
			    `dragleave` with it, so the panel never learns the drag ended and the overlay
			    sticks. The real handlers are on the frame; this is only the sign. */}
			{dragging && (
				<div className="pointer-events-none absolute inset-2 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-alt))]">
					<div className="flex flex-col items-center gap-2 text-center">
						<Upload className="size-7 text-[var(--accent)]" />
						<div className="text-[13px] font-bold text-[var(--text-heading)]">Drop to add</div>
						<div className="font-mono text-[10.5px] text-muted-foreground">a lattice-asset .zip, or {REF_DOC_ACCEPT}</div>
					</div>
				</div>
			)}
			{/* Mounted inside the frame so it shares the Library's lifecycle, but rendered by
			    Dialog into the TOP LAYER, so it sits above the panel in both transports rather
			    than inside the sheet that would otherwise own the dismiss gesture. */}
			<AssetVersionsDialog
				asset={historyFor}
				open={!!historyFor}
				onOpenChange={(o) => { if (!o) setHistoryFor(null); }}
				onRestored={() => { reload(); onChanged(); }}
				notify={notify}
			/>
		</LibraryFrame>
	);
}

// Two-tap delete (matches the slide-toolbar pattern) — first tap arms, second
// confirms. Exported so other Studio surfaces (the Workspace Privacy & Data tab)
// reuse the same delete affordance instead of re-styling their own (HARD RULE #15).
//
// Owns its own un-arm behavior rather than leaning on each caller to remember
// it: a "Sure?" left alone is a footgun waiting for an accidental later click
// to land as a real delete. It reverts on whichever comes first — ~3s of
// inactivity (matching StudioShell's RailOp slide-toolbar delete) or a
// pointerdown anywhere outside this button, captured at the document level so
// another component's stopPropagation can't swallow it first.
export function DeleteBtn({ armed, onArm, onConfirm, onCancel, label }: { armed: boolean; onArm: () => void; onConfirm: () => void; onCancel: () => void; label: string }) {
	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (!armed) return;
		const timer = setTimeout(onCancel, 3000);
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) onCancel();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('pointerdown', onPointerDown, true);
		};
	}, [armed, onCancel]);
	return armed ? (
		<button ref={ref} type="button" onClick={onConfirm} aria-label={`Confirm delete ${label}`} className="flex items-center gap-1 rounded-lg border border-[color-mix(in_srgb,var(--fail,#c0392b)_40%,transparent)] bg-[color-mix(in_srgb,var(--fail,#c0392b)_12%,transparent)] px-2 py-1.5 text-[11px] font-semibold text-[var(--fail,#c0392b)]"><Trash2 className="size-3.5" />Sure?</button>
	) : (
		<button type="button" onClick={onArm} aria-label={`Delete ${label}`} className="grid place-items-center rounded-lg border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:text-[var(--fail,#c0392b)]"><Trash2 className="size-3.5" /></button>
	);
}
