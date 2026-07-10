import { Check, Download, FileBox, FileText, Package, Plus, Search, Share2, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { componentZipName, finishZipName, packBundle, packComponent, packFinish, packTheme, themeZipName, unpackBundle } from './asset-bundle';
import { deleteStudioComponent, listStudioComponents, type StudioComponent, saveStudioComponent } from './component-library';
import { generateSwatch } from './finish-generate';
import { deleteStudioFinish, listStudioFinishes, type StudioFinish, saveStudioFinish } from './finish-library';
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

// A few representative swatches for a theme card: the picked essentials, or the
// accent as a fallback when a legacy record has none.
function themeSwatches(t: StudioTheme): string[] {
	const e = t.essentials;
	if (e) return Object.values(e).filter((v) => /^#|^oklch|^rgb|^hsl/i.test(v)).slice(0, 10);
	return ['var(--accent)'];
}

export function Library({ open, onOpenChange, options, activePalette, activeFinish, initialFilter, onApplyTheme, onApplyFinish, onInsert, onChanged, notify }: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	options: SingleSlideOptions;
	activePalette: string;
	activeFinish: string;
	initialFilter?: Filter;
	onApplyTheme: (name: string) => void;
	onApplyFinish: (name: string) => void;
	onInsert: (skeleton: string, name: string) => void;
	onChanged: () => void;
	notify: (msg: string) => void;
}) {
	const [themes, setThemes] = React.useState<StudioTheme[]>([]);
	const [components, setComponents] = React.useState<StudioComponent[]>([]);
	const [finishes, setFinishes] = React.useState<StudioFinish[]>([]);
	const [docs, setDocs] = React.useState<RefDocRecord[]>([]);
	const [filter, setFilter] = React.useState<Filter>('all');
	const [query, setQuery] = React.useState('');
	const [sel, setSel] = React.useState<Set<string>>(new Set());
	const [busy, setBusy] = React.useState<string | null>(null);
	const [armed, setArmed] = React.useState<string | null>(null);
	const fileRef = React.useRef<HTMLInputElement>(null);
	const docFileRef = React.useRef<HTMLInputElement>(null);

	const reload = React.useCallback(() => {
		Promise.all([listStudioThemes(), listStudioComponents(), listStudioFinishes(), listRefDocs()]).then(([t, c, f, d]) => {
			setThemes(t);
			setComponents(c);
			setFinishes(f);
			setDocs(d);
		});
	}, []);
	// Load (and refresh) whenever the drawer opens; honor a requested initial tab
	// (the picker's "Manage in Library" link opens straight to Docs).
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

	const tKey = (t: StudioTheme) => `theme:${t.id}`;
	const cKey = (c: StudioComponent) => `comp:${c.id}`;
	const fKey = (f: StudioFinish) => `finish:${f.id}`;
	const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

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
		try {
			for (const f of Array.from(files)) {
				const { themes: ts, components: cs, finishes: fs } = await unpackBundle(f);
				for (const t of ts) { await saveStudioTheme({ name: t.name, label: t.label, essentials: t.essentials ?? {}, css: t.css }); nThemes++; }
				for (const c of cs) { await saveStudioComponent({ name: c.name, css: c.css, skeleton: c.skeleton, meta: { bucket: c.bucket || undefined } }); nComps++; }
				// Symmetric unpack — a shared finish lands in the finish library, pickable
				// from the Inspector Finish menu (the same consumption loop a saved finish uses).
				for (const fin of fs) { await saveStudioFinish({ name: fin.name, label: fin.label, css: fin.css, recipe: fin.recipe }); nFinishes++; }
			}
			reload();
			onChanged();
			notify(`Imported ${nThemes} theme(s) + ${nComps} component(s)${nFinishes ? ` + ${nFinishes} finish(es)` : ''}.`);
		} catch (e) {
			notify(`Import failed — ${String((e as Error)?.message || e)}`);
		} finally {
			setBusy(null);
			if (fileRef.current) fileRef.current.value = '';
		}
	}
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

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[720px]">
				<SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-border py-3 pl-4 pr-12">
					<SheetTitle className="flex shrink-0 items-center gap-2 text-[15px]"><FileBox className="size-[18px] text-[var(--accent)]" />Library</SheetTitle>
					<div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-muted-foreground">
						<Search className="size-3.5 shrink-0" />
						<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search themes, components, finishes & docs…" aria-label="Search library" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground" />
					</div>
					{/* Contextual add: the Docs tab attaches .txt/.md/.pdf reference docs; every
					    other tab imports a lattice-asset .zip — one button, meaning by tab. */}
					{filter === 'refdoc' ? (
						<Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => docFileRef.current?.click()} aria-label="Add a reference doc" title="Add a .txt/.md/.pdf reference doc"><Plus className="size-3.5" /><span className="hidden sm:inline">Add file</span></Button>
					) : (
						<Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => fileRef.current?.click()} aria-label="Import .zip" title="Import a .zip"><Upload className="size-3.5" /><span className="hidden sm:inline">Import</span></Button>
					)}
					<input ref={fileRef} type="file" accept=".zip" multiple hidden onChange={(e) => importFiles(e.target.files)} />
					<input ref={docFileRef} type="file" accept={REF_DOC_ACCEPT} multiple hidden onChange={(e) => addDocFiles(e.target.files)} />
				</SheetHeader>

				<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5">
					<div className="inline-flex rounded-lg border border-border bg-background p-[3px]">
						{(['all', 'theme', 'component', 'finish', 'refdoc'] as Filter[]).map((f) => (
							<button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn('rounded-md px-3 py-1 text-[12px] font-semibold capitalize', filter === f ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}>{f === 'all' ? 'All' : f === 'refdoc' ? 'Docs' : f === 'finish' ? 'Finishes' : `${f}s`}</button>
						))}
					</div>
					<span className="ml-auto font-mono text-[11px] text-muted-foreground">{selCount > 0 ? `${selCount} selected · ` : ''}{total} total</span>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					{total === 0 ? (
						<div className="grid h-full place-content-center gap-2 text-center text-muted-foreground">
							<FileBox className="mx-auto size-7 opacity-40" />
							<p className="text-[13px]">No saved assets yet.</p>
							<p className="text-[11.5px]">Fabricate a theme or a component, or <button type="button" className="font-semibold text-[var(--accent)]" onClick={() => fileRef.current?.click()}>import a .zip</button>.</p>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{vThemes.map((t) => {
								const k = tKey(t);
								const active = t.name === activePalette;
								return (
									<div key={k} className={cn('relative overflow-hidden rounded-xl border bg-card', sel.has(k) ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border')}>
										<button type="button" aria-label={`Select ${t.label}`} aria-pressed={sel.has(k)} onClick={() => toggle(k)} className={cn('absolute left-2.5 top-2.5 z-10 grid size-[18px] place-items-center rounded-md border bg-background', sel.has(k) ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-border')}>{sel.has(k) && <Check className="size-3" />}</button>
										{/* biome-ignore lint/suspicious/noArrayIndexKey: a fixed positional color ramp — the index IS the swatch identity */}
										<div className="flex h-[88px] w-full">{themeSwatches(t).map((c, i) => <span key={`${k}-${i}`} className="flex-1" style={{ background: c }} />)}</div>
										<div className="p-2.5">
											<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><span className="truncate">{t.label}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">Theme</span>{active && <span className="ml-auto font-mono text-[9px] uppercase text-[var(--accent)]">Active</span>}</div>
											<div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">{t.name} · {t.essentials ? `${Object.keys(t.essentials).length} essentials` : 'theme'} · AA</div>
											<div className="mt-2.5 flex items-center gap-1.5">
												<button type="button" onClick={() => { onApplyTheme(t.name); notify(`Applied ${t.label}.`); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-soft)] py-1.5 text-[11.5px] font-semibold text-[var(--accent)]"><Check className="size-3.5" />Apply</button>
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
										<button type="button" aria-label={`Select .${c.name}`} aria-pressed={sel.has(k)} onClick={() => toggle(k)} className={cn('absolute left-2.5 top-2.5 z-10 grid size-[18px] place-items-center rounded-md border bg-background', sel.has(k) ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-border')}>{sel.has(k) && <Check className="size-3" />}</button>
										<div className="grid h-[88px] w-full place-content-center bg-[repeating-linear-gradient(45deg,var(--bg-alt),var(--bg-alt)_8px,var(--bg)_8px,var(--bg)_16px)]"><span className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-[12px] font-semibold text-[var(--accent)] shadow-sm">.{c.name}</span></div>
										<div className="p-2.5">
											<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><span className="truncate">.{c.name}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_30%,transparent)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--chart-3,#2e6f00)]">Component</span></div>
											<div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">{c.bucket || 'local'} · scoped · palette-blind</div>
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
										<button type="button" aria-label={`Select ${f.label}`} aria-pressed={sel.has(k)} onClick={() => toggle(k)} className={cn('absolute left-2.5 top-2.5 z-10 grid size-[18px] place-items-center rounded-md border bg-background', sel.has(k) ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-border')}>{sel.has(k) && <Check className="size-3" />}</button>
										<div className="h-[88px] w-full bg-[var(--bg)]" style={{ backgroundImage: sw.background, backgroundSize: sw.backgroundSize }} />
										<div className="p-2.5">
											<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><span className="truncate">{f.label}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">Finish</span>{active && <span className="ml-auto font-mono text-[9px] uppercase text-[var(--accent)]">Active</span>}</div>
											<div className="mt-1 truncate font-mono text-[10.5px] text-muted-foreground">{f.name} · layered · palette-blind</div>
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
										<div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--text-heading)]"><FileText className="size-3.5 shrink-0 text-[var(--accent)]" /><span className="truncate">{d.name}</span><span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--accent)]">Doc</span></div>
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
					<div className="flex items-center gap-2 border-t border-border bg-[color-mix(in_srgb,var(--accent)_7%,var(--card))] px-4 py-2.5">
						<Button size="sm" className="gap-1.5" onClick={bulkExport}><Package className="size-4" />Export {selCount} as .zip</Button>
						<button type="button" className="ml-auto text-[12px] font-semibold text-[var(--accent)]" onClick={() => setSel(new Set())}>Clear selection</button>
					</div>
				)}
			</SheetContent>
		</Sheet>
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
