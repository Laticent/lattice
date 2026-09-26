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
import { listStoredScenes, putUnreadableScene, type StudioScene, saveStudioScene, type UnreadableScene, unreadableSceneShelf } from './scene-library';
import { exportStudioState, type ImportSummary, importStudioState, requestSourceFlush, resolvedSources, type StudioExport, titleFromSource } from './studio-store';
import { listStudioThemes, saveStudioTheme } from './theme-library';
import { declaredInflatedBytes, jsonGuard, MAX_INFLATED_BYTES, MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, readBudget, readBytesBudget } from './zip-limits';

export const WORKSPACE_FORMAT = 'lattice-workspace/1';
// The light helpers the Studio needs on first paint live in workspace-backup-meta.ts, so this
// module (pack and restore) loads only when a backup is made or restored.
export { downloadBlob, isEvictionProneBrowser, storageSummary, WORKSPACE_ZIP_NAME } from './workspace-backup-meta';

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
/** What `packWorkspace` measured while writing, for the caller's message. */
export type PackReport = {
	/** UTF-8 bytes of the `refdocs.json` written. */
	refdocsBytes: number;
	/** Rows in it, one per reference doc. */
	refdocRows?: number;
	/** Bytes and entries of the nested `library.zip`, and what its files inflate to. */
	libraryBytes?: number;
	libraryEntries?: number;
	libraryInflatedBytes?: number;
	/** UTF-8 bytes of `workspace.json` plus `manifest.json`. */
	stateBytes?: number;
};

export async function packWorkspace(now: number, report?: PackReport): Promise<Blob> {
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
	const stateJson = JSON.stringify(state, null, 2);
	zip.file('workspace.json', stateJson);
	if (report) report.stateBytes = utf8Length(stateJson);

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
		if (report) {
			// Reading a zip's directory inflates nothing, so counting its entries is cheap.
			const { default: JSZip } = await import('jszip');
			const lib = await JSZip.loadAsync(assets);
			report.libraryBytes = assets.size;
			const files = Object.values(lib.files).filter((f) => !f.dir);
			report.libraryEntries = files.length;
			// Summed the way `unpackPackages` sums it: package folders only, not the loose README.
			report.libraryInflatedBytes = files.filter((f) => f.name.includes('/') && !f.name.startsWith('showcases/')).reduce((n, f) => n + declaredInflatedBytes(f), 0);
		}
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
	if (refdocs.length) {
		const json = JSON.stringify(refdocs, null, 2);
		zip.file('refdocs.json', json);
		// In UTF-8 bytes: the restore's first check reads the size the zip declares, which is UTF-8,
		// and a UTF-8 length is never shorter than the UTF-16 one its read budget counts.
		if (report) {
			report.refdocsBytes = utf8Length(json);
			report.refdocRows = refdocs.length;
		}
	}

	const manifest: WorkspaceManifest = {
		format: WORKSPACE_FORMAT,
		exportedAt: new Date(now).toISOString(),
		counts: { decks: state.index.length, themes: themes.length, components: components.length, finishes: finishes.length, scenes: scenes.length, unreadableScenes: unreadableScenes.length, refdocs: refdocs.length },
		...(scenesUnavailable ? { scenesUnavailable: true as const } : {}),
	};
	const manifestJson = JSON.stringify(manifest, null, 2);
	zip.file('manifest.json', manifestJson);
	if (report) report.stateBytes = (report.stateBytes ?? 0) + utf8Length(manifestJson);
	zip.file(
		'README.md',
		`# Lattice workspace backup\n\nExported ${manifest.exportedAt}. ${manifest.counts.decks} deck(s), ${manifest.counts.themes} theme(s), ${manifest.counts.components} component(s), ${manifest.counts.finishes} finish(es), ${scenes.length} scene(s), ${refdocs.length} reference doc(s).\n\n- \`decks/*.md\` — your decks, readable anywhere.\n- \`workspace.json\` + \`library.zip\` + \`refdocs.json\` — the full workspace; restore via Studio → Workspace → General → Restore backup.\n${unreadableScenes.length ? `- \`library-unreadable-scenes.json\` — ${unreadableScenes.length} saved scene(s) this version could not read. They are kept here exactly as stored, and a restore puts them back untouched. Nothing was discarded.\n` : ''}${scenesUnavailable ? `\n**Scenes are not in this backup.** The scene shelf could not be read when this file was written, so this backup makes no claim about your saved scenes — it does not mean you have none. Take another backup once the Studio opens normally.\n` : ''}\nYour OpenRouter connection is deliberately NOT in this file — reconnect with one click after a restore.\n`,
	);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * The most `refdocs.json` may inflate to. Reference docs are the one part of a backup that is
 * legitimately large: a PDF is capped at 5 MB (`reference-doc.ts`) but the Library holds any
 * number, and a 5 MB PDF rides as a 6.7 MiB data URL. Measured (2026-09-25, Node, random-byte
 * PDFs): 8 of them make a 53 MiB file, 36 make 240 MiB and take about 6 s and 1.8 GB to read
 * and parse. 256 MiB keeps 38 maximum-size docs (far more typical ones) and is half of
 * Chrome's longest string (about 512 MiB), above which the export could not write the file at
 * all. A backup between the two still downloads, and the Workspace sheet warns that it will not
 * restore (`backupRestoreGaps`).
 */
export const MAX_REFDOCS_BYTES = 256 * 1024 * 1024;

/**
 * Read one side lane of a backup (`refdocs.json`, `library-unreadable-scenes.json`): its rows, or
 * nothing with the reason pushed to `skipped`. Never throws, so a lane that is oversized, not
 * JSON, not a list, or longer than `MAX_BACKUP_ROWS` cannot stop the rest of a restore.
 */
async function readLane(entry: object | null, max: number, what: string, parseJsonCapped: (text: string, message: string) => unknown, skipped: NonNullable<ImportRefusal>[]): Promise<unknown[]> {
	if (!entry) return [];
	const skip = (why: string) => {
		skipped.push({ name: what, why });
		return [];
	};
	const over = `over the ${Math.floor(max / 1_048_576)} MB a restore reads`;
	if (declaredInflatedBytes(entry) > max) return skip(over);
	let rows: unknown;
	try {
		rows = parseJsonCapped((await readBudget(over, max)(entry)) as string, 'more values than a Library holds');
	} catch (e) {
		return skip(e instanceof SyntaxError ? 'the file is not readable' : (e as Error).message);
	}
	if (!Array.isArray(rows)) return skip('the file is not readable');
	// Each row is an IndexedDB write, so under the value cap a 3 MB file could still ask for half
	// a million of them.
	if (rows.length > MAX_BACKUP_ROWS) return skip(`more than ${MAX_BACKUP_ROWS.toLocaleString('en-US')} rows`);
	return rows;
}

/** UTF-8 length of `s` without encoding it (a backup's refdocs can be hundreds of MB). */
function utf8Length(s: string): number {
	let n = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c < 0x80) n += 1;
		else if (c < 0x800) n += 2;
		else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
			n += 4; // a surrogate pair is one 4-byte character
			i++;
		} else n += 3;
	}
	return n;
}

/**
 * Most rows `refdocs.json` or `library-unreadable-scenes.json` may hold. Each row is one
 * IndexedDB write, so the value cap alone still lets a 3 MB file ask for half a million of them.
 * Both lanes hold things a person adds by hand (a reference doc is a file you attached; an
 * unreadable scene is one a schema change stranded), so a real Library holds tens, not thousands.
 */
export const MAX_BACKUP_ROWS = 2_000;

/**
 * What a restore of this backup would not bring back, in words, or `[]`. A backup is still written
 * whatever this says, because a file you hold beats none (the owner's call, followups.d/2336 item
 * 17b), but it must not look like one that restores in full when it won't. Every limit
 * SIZE limit `restoreWorkspace` applies to what `packWorkspace` writes is checked here: the packed
 * and unpacked size and file count of the library, the size of the state and of the reference
 * docs, and the reference-doc row count. So no warning means no size limit will refuse the file.
 * The value cap is not checked: it counts JSON values, and nothing the Studio writes comes near it.
 */
export function backupRestoreGaps(report: PackReport): string[] {
	const mb = (n: number) => `${Math.ceil(n / 1_048_576)} MB`;
	const limit = (n: number) => `${Math.floor(n / 1_048_576)} MB`;
	const gaps: string[] = [];
	if ((report.libraryBytes ?? 0) > MAX_ZIP_BYTES || (report.libraryEntries ?? 0) > MAX_ZIP_ENTRIES || (report.libraryInflatedBytes ?? 0) > MAX_INFLATED_BYTES) {
		gaps.push(`your saved themes, components and finishes (${mb(report.libraryBytes ?? 0)} packed, ${mb(report.libraryInflatedBytes ?? 0)} unpacked, ${report.libraryEntries ?? 0} files) are over what a restore reads (${limit(MAX_ZIP_BYTES)} packed, ${limit(MAX_INFLATED_BYTES)} unpacked, ${MAX_ZIP_ENTRIES.toLocaleString('en-US')} files), so this backup will not restore at all`);
	}
	if ((report.stateBytes ?? 0) > MAX_INFLATED_BYTES) gaps.push(`your decks, chats and settings (${mb(report.stateBytes ?? 0)}) are over the ${limit(MAX_INFLATED_BYTES)} a restore reads, so this backup will not restore at all`);
	if (report.refdocsBytes > MAX_REFDOCS_BYTES) gaps.push(`your reference docs (${mb(report.refdocsBytes)}) are over the ${limit(MAX_REFDOCS_BYTES)} a restore reads, so they will not come back from it`);
	else if ((report.refdocRows ?? 0) > MAX_BACKUP_ROWS) gaps.push(`you have more than ${MAX_BACKUP_ROWS.toLocaleString('en-US')} reference docs, more than a restore reads, so they will not come back from it`);
	return gaps;
}

/**
 * Restore a workspace zip into the current browser. Merge-by-default (see
 * importStudioState: nothing local is ever overwritten; diverged decks come
 * back as "(restored)" copies; library assets upsert by name).
 */
/**
 * What is wrong with a parsed `workspace.json`, in words a person can act on, or null when its
 * shape is one `importStudioState` can walk. The file comes from outside (a backup can be
 * hand-edited, truncated by a tool, or someone else's), and `importStudioState` trusts the
 * shape: `"chats": null` used to surface as "Cannot read properties of null (reading
 * 'welcome')". Checked before anything is written, so a refusal leaves the workspace as it was.
 * The optional fields a pre-split backup lacks (`settings`, `instructions`,
 * `onDeviceInstructions`) may be absent, but not the wrong type.
 */
export function malformedWorkspaceState(state: unknown): string | null {
	const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
	const what = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `a ${typeof v}`);
	if (!isRecord(state)) return `it holds ${what(state)}, not a workspace.`;
	if (!Array.isArray(state.index)) return `"index" should be the list of decks, but it is ${state.index === undefined ? 'missing' : what(state.index)}.`;
	const bad = state.index.findIndex((e) => !isRecord(e) || typeof e.id !== 'string' || typeof e.title !== 'string');
	if (bad >= 0) return `deck ${bad + 1} in "index" has no id or title.`;
	const maps: [string, string, (v: unknown) => boolean][] = [
		['sources', 'deck sources', (v) => typeof v === 'string'],
		['checkpoints', 'checkpoint lists', Array.isArray],
		['chats', 'chat histories', Array.isArray],
	];
	for (const [key, noun, ok] of maps) {
		const v = state[key];
		if (!isRecord(v)) return `"${key}" should be an object of ${noun} by deck, but it is ${v === undefined ? 'missing' : what(v)}.`;
		const deck = Object.keys(v).find((id) => v[id] != null && !ok(v[id]));
		if (deck !== undefined) return `"${key}" has ${what(v[deck])} for deck "${deck}".`;
	}
	if (state.settings !== undefined && !isRecord(state.settings)) return `"settings" should be an object, but it is ${what(state.settings)}.`;
	for (const key of ['instructions', 'onDeviceInstructions']) {
		if (state[key] !== undefined && typeof state[key] !== 'string') return `"${key}" should be text, but it is ${what(state[key])}.`;
	}
	return null;
}

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
	// The budgets differ by entry because what is legitimate differs by orders of magnitude: the
	// text the Studio store wrote gets the 64 MB package cap (it came out of localStorage, whose
	// quota is 5–10 MB); `library.zip` gets the asset-zip cap `unpackBundle` enforces anyway; the
	// reference docs get their own, larger number. Declared sizes refuse an honest bomb before a
	// byte inflates; the running budgets stop a liar at the cap (`zip-limits.ts`). Every parse
	// counts its values first (`parseJsonCapped`): the byte caps bound the inflate, not what
	// `JSON.parse` builds.
	//
	// Two kinds of entry, and they fail differently. The CORE (manifest, `workspace.json`,
	// `library.zip`) refuses the whole restore, before anything is written: without it there is
	// nothing coherent to restore. The two SIDE LANES (reference docs, unreadable scenes) are
	// skipped and named instead, and everything else restores: a backup is most needed when the
	// browser's copy is gone, and oversized reference docs must not cost you your decks.
	const { parseJsonCapped } = await jsonGuard();
	const tooLarge = (what: string) => `That workspace backup's ${what} is too large to restore.`;
	const declared = (e: unknown) => (e ? declaredInflatedBytes(e) : 0);
	if (declared(manifestFile) + declared(stateFile) > MAX_INFLATED_BYTES) throw new Error(tooLarge('workspace.json'));
	if (declared(libraryFile) > MAX_ZIP_BYTES) throw new Error(tooLarge('library'));
	const readText = readBudget(tooLarge('workspace.json'));

	const manifest = parseJsonCapped((await readText(manifestFile)) as string, tooLarge('manifest')) as WorkspaceManifest;
	if (manifest.format !== WORKSPACE_FORMAT) throw new Error(`Unsupported backup format: ${manifest.format}`);
	if (!stateFile) throw new Error('Backup is missing workspace.json.');
	const state = parseJsonCapped((await readText(stateFile)) as string, tooLarge('workspace.json')) as StudioExport;
	const malformed = malformedWorkspaceState(state);
	if (malformed) throw new Error(`That workspace backup's workspace.json can't be restored: ${malformed} Nothing was changed.`);

	// Parse the asset library BEFORE importing any state: `unpackBundle` refuses an
	// oversized archive (`zip-limits.ts`), and refusing it after the decks and settings
	// had already been replaced left a half-restored workspace. The side lanes are read here too,
	// so nothing about them is decided after the decks are in.
	const libraryBytes = await readBytesBudget(tooLarge('library'), MAX_ZIP_BYTES)(libraryFile);
	let parsed: ParsedBundle | null = null;
	if (libraryBytes) {
		try {
			parsed = await unpackBundle(new Blob([libraryBytes]));
		} catch (e) {
			// `unpackBundle` speaks of "that asset zip"; here it is the backup's library.
			throw new Error(/too large/i.test((e as Error).message) ? tooLarge('library') : `That workspace backup's library could not be read: ${(e as Error).message}`);
		}
	}
	const lanes: NonNullable<ImportRefusal>[] = [];
	const refdocRecords = await readLane(refdocsFile, MAX_REFDOCS_BYTES, 'Reference docs', parseJsonCapped, lanes);
	const unreadableRows = await readLane(unreadableFile, MAX_INFLATED_BYTES, 'Unreadable scenes', parseJsonCapped, lanes);

	// A backup is a file, and a file can come from someone else. The themes and components in
	// it meet the SAME gates as a Library `.zip` import (`import-gate.ts`), one item at a time:
	// a refused item is skipped and named in `refused`, and every other item still restores.
	// Per item, never a hard refusal of the whole file, because `import-gate.ts` measured the
	// gate's false positives and one of them in your OWN backup must not cost you the rest of
	// it; the skipped item is still in the file you hold. The verdicts are taken BEFORE any
	// state is imported, so a gate that throws (its core failed to load) aborts the restore
	// with nothing half-written, as an oversized library already does.
	const { refuseImportedComponent, refuseImportedTheme } = await import('./import-gate');
	const refused: NonNullable<ImportRefusal>[] = [...lanes, ...(parsed?.refused ?? [])];
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
	const rows = unreadableRows as { name?: unknown; record?: unknown }[];
	const shelf = rows.length ? await unreadableSceneShelf() : undefined;
	for (const row of rows) {
		// Count what was actually STORED. `putUnreadableScene` declines a row with no name or
		// no object, and incrementing regardless would report "N restored" having written
		// zero — the same "could not read" / "nothing there" conflation this whole change is
		// about, one file over.
		if (await putUnreadableScene(row?.record, shelf)) summary.unreadableScenes++;
		// Declined rows are named, not dropped in silence. The bytes stay in the file you hold.
		else {
			const rec = row?.record && typeof row.record === 'object' ? (row.record as { name?: unknown }) : null;
			const name = typeof rec?.name === 'string' ? rec.name : typeof row?.name === 'string' ? row.name : '(unnamed)';
			summary.refused.push({ name: `scene ${name.slice(0, 60)}`, why: rec ? 'a working scene of this name is already here, or its name is not one Lattice writes' : 'the row is not a scene record' });
		}
	}

	for (const rec of refdocRecords as RefDocRecord[]) {
		// A row that is not a named record is junk, not a doc: skip it without a write.
		if (!rec || typeof rec !== 'object' || typeof rec.name !== 'string' || !rec.name) continue;
		// saveRefDoc upserts by name — the same path Library import uses.
		await saveRefDoc(recordToDoc(rec), rec.addedAt ?? now);
		summary.refdocs++;
	}
	return summary;
}
