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
//                       lattice-asset/1 bundle — restore feeds it straight back
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

import { packBundle, unpackBundle } from './asset-bundle';
import { listStudioComponents, saveStudioComponent } from './component-library';
import { listStudioFinishes, saveStudioFinish } from './finish-library';
import { listRefDocs, type RefDocRecord, recordToDoc, saveRefDoc } from './reference-doc-store';
import { listStudioScenes, saveStudioScene } from './scene-library';
import { exportStudioState, type ImportSummary, importStudioState, requestSourceFlush, resolvedSources, type StudioExport, titleFromSource } from './studio-store';
import { listStudioThemes, saveStudioTheme } from './theme-library';

export const WORKSPACE_FORMAT = 'lattice-workspace/1';
export const WORKSPACE_ZIP_NAME = 'lattice-workspace.zip';

export type WorkspaceManifest = {
	format: typeof WORKSPACE_FORMAT;
	exportedAt: string; // ISO — provenance for the human opening the zip
	// `refdocs` is absent from pre-refdoc backups — read with ?? 0.
	// `scenes` is absent from pre-scene backups — read with ?? 0.
	counts: { decks: number; themes: number; components: number; finishes: number; scenes?: number; refdocs?: number };
};

export type RestoreSummary = ImportSummary & { themes: number; components: number; finishes: number; scenes: number; refdocs: number };

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
	const [themes, components, finishes, scenes, refdocs] = await Promise.all([listStudioThemes(), listStudioComponents(), listStudioFinishes(), listStudioScenes(), listRefDocs()]);

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

	// The Library rides as a nested lattice-asset/1 bundle (no showcase PDFs).
	if (themes.length || components.length || finishes.length || scenes.length) {
		const assets = await packBundle(themes.map((theme) => ({ theme })), components, finishes, scenes);
		zip.file('library.zip', assets);
	}
	// Reference docs are user-imported content (the Architect's brand guidelines
	// etc.) — as much "the workspace" as the decks are.
	if (refdocs.length) zip.file('refdocs.json', JSON.stringify(refdocs, null, 2));

	const manifest: WorkspaceManifest = {
		format: WORKSPACE_FORMAT,
		exportedAt: new Date(now).toISOString(),
		counts: { decks: state.index.length, themes: themes.length, components: components.length, finishes: finishes.length, scenes: scenes.length, refdocs: refdocs.length },
	};
	zip.file('manifest.json', JSON.stringify(manifest, null, 2));
	zip.file(
		'README.md',
		`# Lattice workspace backup\n\nExported ${manifest.exportedAt}. ${manifest.counts.decks} deck(s), ${manifest.counts.themes} theme(s), ${manifest.counts.components} component(s), ${manifest.counts.finishes} finish(es), ${scenes.length} scene(s), ${refdocs.length} reference doc(s).\n\n- \`decks/*.md\` — your decks, readable anywhere.\n- \`workspace.json\` + \`library.zip\` + \`refdocs.json\` — the full workspace; restore via Studio → Workspace → General → Restore backup.\n\nYour OpenRouter connection is deliberately NOT in this file — reconnect with one click after a restore.\n`,
	);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

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
	const manifest = JSON.parse(await manifestFile.async('string')) as WorkspaceManifest;
	if (manifest.format !== WORKSPACE_FORMAT) throw new Error(`Unsupported backup format: ${manifest.format}`);
	const stateFile = zip.file('workspace.json');
	if (!stateFile) throw new Error('Backup is missing workspace.json.');
	const state = JSON.parse(await stateFile.async('string')) as StudioExport;

	const summary: RestoreSummary = { ...importStudioState(state, now), themes: 0, components: 0, finishes: 0, scenes: 0, refdocs: 0 };

	const libraryFile = zip.file('library.zip');
	if (libraryFile) {
		const parsed = await unpackBundle(await libraryFile.async('blob'));
		for (const t of parsed.themes) {
			await saveStudioTheme({ name: t.name, label: t.label, essentials: t.essentials ?? {}, css: t.css });
			summary.themes++;
		}
		for (const c of parsed.components) {
			await saveStudioComponent({ name: c.name, css: c.css, skeleton: c.skeleton });
			summary.components++;
		}
		for (const f of parsed.finishes) {
			await saveStudioFinish({ name: f.name, label: f.label, css: f.css, recipe: f.recipe });
			summary.finishes++;
		}
		for (const s of parsed.scenes) {
			// unpackBundle already dropped any scene whose spec didn't re-validate, so every
			// scene here is renderable. saveStudioScene sanitizes the untrusted poster/art at
			// the store boundary — so restoring a hand-crafted backup can't persist raw markup.
			await saveStudioScene({ name: s.name, label: s.label, description: s.description, spec: s.spec, poster: s.poster, art: s.art });
			summary.scenes++;
		}
	}

	const refdocsFile = zip.file('refdocs.json');
	if (refdocsFile) {
		const records = JSON.parse(await refdocsFile.async('string')) as RefDocRecord[];
		for (const rec of records) {
			// saveRefDoc upserts by name — the same path Library import uses.
			await saveRefDoc(recordToDoc(rec), rec.addedAt ?? now);
			summary.refdocs++;
		}
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
