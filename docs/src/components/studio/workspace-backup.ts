// Whole-workspace backup & restore — the durability half of "your decks live
// in this browser". Browser storage is best-effort everywhere (WebKit's 7-day
// tab eviction is just the loudest case; clearing browsing data is the common
// one), so the workspace needs a file the USER holds. One zip:
//
//   lattice-workspace.zip
//     manifest.json     { format: 'lattice-workspace/1', exportedAt, counts }
//     workspace.json    the Studio store snapshot (decks/checkpoints/chats/settings)
//     decks/<slug>.md   a readable copy of every deck — the backup stays useful
//                       even opened by hand, with no Lattice at all
//     library.zip       the saved themes/components/finishes, as a NESTED
//                       library bundle (package folders since 2026-09) — restore feeds it straight back
//                       through unpackBundle, zero new parsing code
//     refdocs.json      the Library's reference docs (kind:'refdoc' records —
//                       JSON-safe, PDFs ride as data URLs); restore upserts by
//                       name through saveRefDoc, the same path Library import uses
//
// Deliberately EXCLUDED: the OpenRouter key + PKCE verifier (a backup file gets
// emailed and synced; secrets don't belong in it) and theme showcase PDFs
// (re-renderable weight). See engineering/decisions/2026-07-02-workspace-backup.md.
//
// Like asset-bundle.ts, this module is pure data + JSZip; collectors read the
// stores, pack/parse are testable without a browser beyond localStorage.

import { type ParsedBundle, packBundle, unpackBundle } from './asset-bundle';
import { applyImportRenames } from './asset-rename';
import { listStudioComponents, saveStudioComponent, toMeta } from './component-library';
import { listStudioFinishes, saveStudioFinish } from './finish-library';
import type { ImportRefusal } from './import-gate';
import { listRefDocs, type RefDocRecord, recordToDoc, saveRefDoc } from './reference-doc-store';
import { listStoredScenes, putUnreadableScene, type StudioScene, saveStudioScene, type UnreadableScene } from './scene-library';
import { exportStudioState, type ImportSummary, importStudioState, requestSourceFlush, resolvedSources, type StudioExport, titleFromSource } from './studio-store';
import { listStudioThemes, saveStudioTheme } from './theme-library';
import { declaredInflatedBytes, MAX_INFLATED_BYTES, MAX_ZIP_BYTES, readBudget, readBytesBudget } from './zip-limits';

export const WORKSPACE_FORMAT = 'lattice-workspace/1';
export const WORKSPACE_ZIP_NAME = 'lattice-workspace.zip';

export type WorkspaceManifest = {
	format: typeof WORKSPACE_FORMAT;
	exportedAt: string; // ISO — provenance for the human opening the zip
	// `refdocs` is absent from pre-refdoc backups — read with ?? 0.
	// `scenes` is absent from pre-scene backups — read with ?? 0.
	counts: { decks: number; themes: number; components: number; finishes: number; scenes?: number; unreadableScenes?: number; refdocs?: number };
	/** Set only when the scene shelf could not be READ. Distinguishes "no scenes" from "we could
	 *  not see the scenes", which the old `catch { return [] }` collapsed into a silent `0`. */
	scenesUnavailable?: true;
};

/** `refused`: library packages the backup held that could not be read back, each with the reason. */
export type RestoreSummary = ImportSummary & { themes: number; components: number; finishes: number; scenes: number; unreadableScenes: number; refdocs: number; refused: { name: string; why: string }[] };

// biome-ignore lint/suspicious/noExplicitAny: JSZip is dynamically imported.
async function jszip(): Promise<any> {
	const { default: JSZip } = await import('jszip');
	return new JSZip();
}

const fileSlug = (title: string, id: string) =>
	`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || id}`;

/**
 * Pack the whole workspace → a `.zip` Blob. `now` is passed in (provenance
 * stamp) so the module stays clock-free and deterministic under test.
 */
export async function packWorkspace(now: number): Promise<Blob> {
	// The shell persists the active deck on a 400ms debounce — flush it first,
	// or a backup taken mid-keystroke misses the newest edits (and a JUST-edited
	// built-in would have no stored source at all and drop out entirely).
	requestSourceFlush();
	const state = exportStudioState();
	// Scenes come through the RAW reader, not `listStudioScenes`. That list drops any record whose
	// spec no longer validates, and this function is what turns that drop into permanent data loss:
	// the backup is built from the list, so a tightened schema erased the user's scenes from their
	// only copy (2026-09-02-frame-model-for-motion.md §7c). `listStoredScenes` also THROWS rather
	// than returning [] on a store failure, so a backup can no longer claim `0 scene(s)` because
	// IndexedDB hiccuped — the rejection surfaces instead of a quietly incomplete file.
	const [themes, components, finishes, storedScenes, refdocs] = await Promise.all([listStudioThemes(), listStudioComponents(), listStudioFinishes(), listStoredScenes().catch(() => null), listRefDocs()]);
	// A shelf we could not read is NOT a shelf with nothing on it, and the difference decides what
	// this file may claim. `null` here means the read failed; it is recorded in the manifest and the
	// README so the backup never reports `0 scene(s)` for scenes it simply could not see. It does
	// NOT abort the backup: a browser with no IndexedDB at all (private mode, an SSR/jsdom context)
	// has no scenes to lose, and refusing to back up the decks in that case would trade a small
	// reporting lie for a much larger loss.
	const scenesUnavailable = storedScenes === null;
	const scenes = (storedScenes ?? []).filter((s): s is { valid: true; scene: StudioScene } => s.valid).map((s) => s.scene);
	const unreadableScenes = (storedScenes ?? []).filter((s): s is UnreadableScene => !s.valid);

	const zip = await jszip();
	zip.file('workspace.json', JSON.stringify(state, null, 2));

	// Readable copies — EVERY deck in the switcher, at its current source
	// (edited override or the canonical built-in). workspace.json still carries
	// edited sources only (untouched built-ins re-seed on restore); decks/ is
	// for the human inspecting the file, and it must match the deck list.
	const seen = new Set<string>();
	for (const { entry, source } of resolvedSources()) {
		// Derive from the SOURCE, not the index label: the label is a creation record, so
		// a deck renamed by its heading (or never opened since) would export as
		// `untitled-deck.md` — a readable copy that reads nothing like the deck.
		let name = fileSlug(titleFromSource(source, entry.title), entry.id);
		while (seen.has(name)) name = `${name}-2`;
		seen.add(name);
		zip.file(`decks/${name}.md`, source);
	}

	// The Library rides as a nested library bundle (package folders; a pre-2026-09 backup holds a lattice-asset/1 one) (no showcase PDFs).
	if (themes.length || components.length || finishes.length || scenes.length) {
		const assets = await packBundle(themes.map((theme) => ({ theme })), components, finishes, scenes);
		zip.file('library.zip', assets);
	}
	// Scenes we could not parse ride in their OWN file, verbatim. They cannot go through
	// `packBundle` — it takes `StudioScene[]`, which requires a spec that validates, and coercing
	// one to fit would be inventing content the author never wrote. A separate lane keeps
	// `packBundle`'s type honest AND keeps the bytes, which is the whole obligation §7c names.
	if (unreadableScenes.length) {
		zip.file('library-unreadable-scenes.json', JSON.stringify(unreadableScenes.map((s) => ({ name: s.name, label: s.label, reason: s.reason, specVersion: s.specVersion, record: s.raw })), null, 2));
	}
	// Reference docs are user-imported content (the Architect's brand guidelines
	// etc.) — as much "the workspace" as the decks are.
	if (refdocs.length) zip.file('refdocs.json', JSON.stringify(refdocs, null, 2));

	const manifest: WorkspaceManifest = {
		format: WORKSPACE_FORMAT,
		exportedAt: new Date(now).toISOString(),
		counts: { decks: state.index.length, themes: themes.length, components: components.length, finishes: finishes.length, scenes: scenes.length, unreadableScenes: unreadableScenes.length, refdocs: refdocs.length },
		...(scenesUnavailable ? { scenesUnavailable: true as const } : {}),
	};
	zip.file('manifest.json', JSON.stringify(manifest, null, 2));
	zip.file(
		'README.md',
		`# Lattice workspace backup\n\nExported ${manifest.exportedAt}. ${manifest.counts.decks} deck(s), ${manifest.counts.themes} theme(s), ${manifest.counts.components} component(s), ${manifest.counts.finishes} finish(es), ${scenes.length} scene(s), ${refdocs.length} reference doc(s).\n\n- \`decks/*.md\` — your decks, readable anywhere.\n- \`workspace.json\` + \`library.zip\` + \`refdocs.json\` — the full workspace; restore via Studio → Workspace → General → Restore backup.\n${unreadableScenes.length ? `- \`library-unreadable-scenes.json\` — ${unreadableScenes.length} saved scene(s) this version could not read. They are kept here exactly as stored, and a restore puts them back untouched. Nothing was discarded.\n` : ''}${scenesUnavailable ? `\n**Scenes are not in this backup.** The scene shelf could not be read when this file was written, so this backup makes no claim about your saved scenes — it does not mean you have none. Take another backup once the Studio opens normally.\n` : ''}\nYour OpenRouter connection is deliberately NOT in this file — reconnect with one click after a restore.\n`,
	);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

const BACKUP_TOO_LARGE = 'That workspace backup is too large to restore.';

/**
 * The most `refdocs.json` may inflate to. Reference docs are the one part of a backup that is
 * legitimately large: a PDF is capped at 5 MB (`reference-doc.ts`) but the Library holds any
 * number, and a 5 MB PDF rides as a 6.7 MiB data URL. Measured (2026-09-25, Node, random-byte
 * PDFs): 8 of them make a 53 MiB file, 36 make 240 MiB and take about 6 s and 1.8 GB to read
 * and parse. 256 MiB keeps 38 maximum-size docs (far more typical ones) and is half of
 * Chrome's longest string (about 512 MiB), above which the export could not write the file at
 * all. A backup between the two exports but will not restore, and nothing warns at export yet
 * (followups.d/2336 item 17).
 */
export const MAX_REFDOCS_BYTES = 256 * 1024 * 1024;

/**
 * Restore a workspace zip into the current browser. Merge-by-default (see
 * importStudioState: nothing local is ever overwritten; diverged decks come
 * back as "(restored)" copies; library assets upsert by name).
 */
export async function restoreWorkspace(file: Blob, now: number): Promise<RestoreSummary> {
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(file);
	const manifestFile = zip.file('manifest.json');
	if (!manifestFile) throw new Error('Not a Lattice workspace backup — manifest.json missing.');
	const stateFile = zip.file('workspace.json');
	const libraryFile = zip.file('library.zip');
	const unreadableFile = zip.file('library-unreadable-scenes.json');
	const refdocsFile = zip.file('refdocs.json');

	// Size caps, BEFORE anything inflates or any state is imported (followups.d/2336 item 15).
	// A backup is a file from anyone, and a few-KB `workspace.json` can inflate to gigabytes.
	// Three budgets, because the entries differ by orders of magnitude in what is legitimate:
	// the text the Studio store wrote shares the 64 MB package cap (it came out of
	// localStorage, whose quota is 5–10 MB); `library.zip` gets the asset-zip cap that
	// `unpackBundle` enforces anyway; the reference docs get their own, larger number.
	// Declared sizes refuse an honest bomb before a byte inflates; the running budgets stop a
	// liar at the cap (`zip-limits.ts`).
	const text = [manifestFile, stateFile, unreadableFile];
	const declared = (entries: unknown[]) => entries.reduce((n: number, e) => n + (e ? declaredInflatedBytes(e) : 0), 0);
	if (declared(text) > MAX_INFLATED_BYTES || declared([libraryFile]) > MAX_ZIP_BYTES || declared([refdocsFile]) > MAX_REFDOCS_BYTES) throw new Error(BACKUP_TOO_LARGE);
	const readText = readBudget(BACKUP_TOO_LARGE);

	const manifest = JSON.parse((await readText(manifestFile)) as string) as WorkspaceManifest;
	if (manifest.format !== WORKSPACE_FORMAT) throw new Error(`Unsupported backup format: ${manifest.format}`);
	if (!stateFile) throw new Error('Backup is missing workspace.json.');
	const state = JSON.parse((await readText(stateFile)) as string) as StudioExport;

	// Parse the asset library BEFORE importing any state: `unpackBundle` refuses an
	// oversized archive (`zip-limits.ts`), and refusing it after the decks and settings
	// had already been replaced left a half-restored workspace. The two side files are read
	// here too, for the same reason: a refusal after the decks are in is a half restore.
	const libraryBytes = await readBytesBudget(BACKUP_TOO_LARGE, MAX_ZIP_BYTES)(libraryFile);
	const parsed = libraryBytes ? await unpackBundle(new Blob([libraryBytes])) : null;
	const unreadableText = await readText(unreadableFile);
	const refdocsText = await readBudget(BACKUP_TOO_LARGE, MAX_REFDOCS_BYTES)(refdocsFile);
	// Parsed here as well, not where they are used: a side file that does not parse must refuse
	// the restore before the decks are in, not after.
	const unreadableRows = unreadableText === undefined ? [] : (JSON.parse(unreadableText) as unknown);
	const refdocRecords = refdocsText === undefined ? [] : (JSON.parse(refdocsText) as unknown);
	if (!Array.isArray(refdocRecords)) throw new Error('Backup has an unreadable refdocs.json.');

	// A backup is a file, and a file can come from someone else. The themes and components in
	// it meet the SAME gates as a Library `.zip` import (`import-gate.ts`), one item at a time:
	// a refused item is skipped and named in `refused`, and every other item still restores.
	// Per item, never a hard refusal of the whole file, because `import-gate.ts` measured the
	// gate's false positives and one of them in your OWN backup must not cost you the rest of
	// it; the skipped item is still in the file you hold. The verdicts are taken BEFORE any
	// state is imported, so a gate that throws (its core failed to load) aborts the restore
	// with nothing half-written, as an oversized library already does.
	const { refuseImportedComponent, refuseImportedTheme } = await import('./import-gate');
	const refused: NonNullable<ImportRefusal>[] = [...(parsed?.refused ?? [])];
	const themes: ParsedBundle['themes'] = [];
	const components: ParsedBundle['components'] = [];
	for (const t of parsed?.themes ?? []) {
		const no = await refuseImportedTheme(t.css, t.label || t.name);
		if (no) refused.push(no);
		else themes.push(t);
	}
	for (const c of parsed?.components ?? []) {
		const no = await refuseImportedComponent(c.css, c.name, c.skeleton);
		if (no) refused.push(no);
		else components.push(c);
	}

	// A backup made before shipped names were reserved can hold a saved `indaco`. The save
	// below stores it as `indaco-custom`, so the backed-up decks that said `theme: indaco`
	// are pointed at that name before they are restored — or they would quietly render the
	// shipped theme instead of the one they were made with.
	// Only the items that passed the gate: a refused `indaco` is not saved as `indaco-custom`,
	// so pointing a deck at that name would point it at nothing.
	if (parsed && state.sources) {
		const { backupRenames } = await import('./library/import-parsed');
		const renames = await backupRenames({ ...parsed, themes, components });
		if (renames.length) state.sources = Object.fromEntries(Object.entries(state.sources).map(([id, src]) => [id, applyImportRenames(src, renames)]));
	}

	const summary: RestoreSummary = { ...importStudioState(state, now), themes: 0, components: 0, finishes: 0, scenes: 0, unreadableScenes: 0, refdocs: 0, refused };

	if (parsed) {
		for (const t of themes) {
			await saveStudioTheme({ name: t.name, label: t.label, essentials: t.essentials ?? {}, css: t.css, ...(t.overrides ? { overrides: t.overrides } : {}), ...(t.rampStrategy ? { rampStrategy: t.rampStrategy } : {}), ...(t.pkg ? { pkg: t.pkg } : {}) });
			summary.themes++;
		}
		for (const c of components) {
			// The library zip is package folders, so a component's full manifest survives a
			// backup round trip (a legacy backup carried no meta at all).
			await saveStudioComponent({ name: c.name, css: c.css, skeleton: c.skeleton, ...(c.manifest ? { meta: toMeta(c.manifest) } : {}), ...(c.pkg ? { pkg: c.pkg } : {}) });
			summary.components++;
		}
		// A finish needs no gate: `saveStudioFinish` discards the carried CSS and regenerates it
		// from the recipe, which `coerceRecipe` clamps (the same reasoning as import-parsed.ts).
		for (const f of parsed.finishes) {
			await saveStudioFinish({ name: f.name, label: f.label, css: f.css, recipe: f.recipe, ...(f.pkg ? { pkg: f.pkg } : {}) });
			summary.finishes++;
		}
		for (const s of parsed.scenes) {
			// unpackBundle already dropped any scene whose spec didn't re-validate, so every
			// scene here is renderable. saveStudioScene sanitizes the untrusted poster/art at
			// the store boundary — so restoring a hand-crafted backup can't persist raw markup.
			// A scene the store will not take is skipped and named, like a refused theme, rather
			// than aborting a restore whose decks are already in.
			try {
				await saveStudioScene({ name: s.name, label: s.label, description: s.description, spec: s.spec, poster: s.poster, art: s.art, ...(s.pkg ? { pkg: s.pkg } : {}) });
				summary.scenes++;
			} catch {
				summary.refused.push({ name: s.label || s.name, why: 'its motion plan is not valid' });
			}
		}
	}

	// Scenes this version could not read go back exactly as they came out. A restore that put back
	// only the readable ones would lose them on the round trip — the same defect as the export half,
	// just one step later.
	for (const row of (Array.isArray(unreadableRows) ? unreadableRows : []) as { record?: unknown }[]) {
		// Count what was actually STORED. `putUnreadableScene` declines a row with no name or
		// no object, and incrementing regardless would report "N restored" having written
		// zero — the same "could not read" / "nothing there" conflation this whole change is
		// about, one file over.
		if (await putUnreadableScene(row?.record)) summary.unreadableScenes++;
	}

	for (const rec of refdocRecords as RefDocRecord[]) {
		// saveRefDoc upserts by name — the same path Library import uses.
		await saveRefDoc(recordToDoc(rec), rec.addedAt ?? now);
		summary.refdocs++;
	}
	return summary;
}

/** One human line for the settings row: what's in this browser right now. */
export async function storageSummary(): Promise<string> {
	let bytes = 0;
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k?.startsWith('lattice-studio-')) continue;
			bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
		}
	} catch {
		/* storage unavailable */
	}
	try {
		const est = await navigator.storage?.estimate?.();
		if (est?.usage) bytes = Math.max(bytes, est.usage);
	} catch {
		/* estimate unsupported (Safari tabs) — the localStorage count stands */
	}
	if (!bytes) return 'nothing stored yet';
	const mb = bytes / 1_048_576;
	return mb >= 1 ? `~${mb.toFixed(1)} MB in this browser` : `~${Math.max(1, Math.round(bytes / 1024))} KB in this browser`;
}

/**
 * A Safari TAB (not the installed app) is the one place storage quietly expires
 * (WebKit's 7-day rule; the installed home-screen app is exempt). Used to append
 * one situational sentence to the backup copy — never a modal, never red.
 */
export function isEvictionProneBrowser(): boolean {
	try {
		const ua = navigator.userAgent;
		const isWebKitSafari = /Safari\//.test(ua) && !/Chrom|Edg|OPR|Firefox/i.test(ua);
		const standalone = window.matchMedia?.('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true);
		return isWebKitSafari && !standalone;
	} catch {
		return false;
	}
}

/** Trigger a client-side download of the backup zip. */
export function downloadBlob(filename: string, blob: Blob): void {
	if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
