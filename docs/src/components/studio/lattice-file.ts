// The `.lattice` project file — a portable zip that carries a deck AND its review
// comments so the comments TRAVEL with the deck, separately from the Markdown.
//
// A comment is app-state (never baked into the source or a shared PDF unless opted
// in), so the deck's `.md` alone can't carry it. The `.lattice` zip is its home
// off-device: the verbatim source in `deck.md` (a lossless round-trip — re-import
// restores exactly what you wrote) + a `manifest.json` sidecar holding the comments
// and metadata. This is the project-format MVP from the export-format decision doc;
// the self-contained `.html` player + full theme/asset envelope are the flagship
// follow-ons. See engineering/decisions/2026-06-16-lattice-export-format.md and
// 2026-07-04-comments-layer.md (comments travel in the `.lattice` manifest).

import type { ParsedBundle } from './asset-bundle';
import type { PackageFiles } from './package-zip';
import type { SlideComment } from './slide-comments';
import { assertZipWithinLimits, declaredInflatedBytes, MAX_INFLATED_BYTES, MAX_ZIP_BYTES, readBudget } from './zip-limits';

// Untrusted-input guards: a `.lattice` is a file from anyone, so reading one must
// not let a tiny deflate bomb inflate to gigabytes and OOM the tab. Cap both the
// on-disk size and the declared inflated size before decompressing. The numbers are
// shared with the asset `.zip` import (`zip-limits.ts`).
// A deck title from an untrusted manifest is clamped to the same spirit as the
// `.md` import path (titleFromSource caps length) — no multi-MB titles in the index.
const MAX_TITLE_LEN = 120;

/** The manifest envelope. `version` gates forward-compat; bump on a breaking shape change. */
export type LatticeManifest = {
	format: 'lattice';
	version: number;
	title: string;
	engine: 'lattice';
	/** ms epoch the file was written (0 when the caller didn't stamp one). */
	generatedAt: number;
	/** The traveling review comments (the whole point of the format). */
	comments: SlideComment[];
};

export const LATTICE_VERSION = 1;
const MANIFEST_FILE = 'manifest.json';
const DECK_FILE = 'deck.md';

/** Build the manifest object for a deck (pure — `now` is injected, never read here). */
export function buildLatticeManifest(title: string, comments: SlideComment[], now = 0): LatticeManifest {
	return {
		format: 'lattice',
		version: LATTICE_VERSION,
		title: String(title || 'Untitled deck'),
		engine: 'lattice',
		generatedAt: now,
		comments: Array.isArray(comments) ? comments : [],
	};
}

/**
 * Parse + validate a manifest from untrusted JSON text (a shared file). Throws on a
 * shape that isn't a Lattice manifest or a future major version we can't read; the
 * `comments` array is returned as-is (the caller re-validates each via the store's
 * guard). Kept pure + fs-free so it unit-tests without a zip.
 */
export function parseLatticeManifest(json: string): LatticeManifest {
	let obj: unknown;
	try {
		obj = JSON.parse(json);
	} catch {
		throw new Error('Not a Lattice file — the manifest is unreadable.');
	}
	const m = obj as Partial<LatticeManifest>;
	if (!m || typeof m !== 'object' || m.format !== 'lattice') {
		throw new Error('Not a Lattice file — missing the Lattice manifest.');
	}
	if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) {
		throw new Error('Not a Lattice file — the manifest version is invalid.');
	}
	if (m.version > LATTICE_VERSION) {
		throw new Error(`This .lattice file needs a newer Lattice (format v${m.version}).`);
	}
	// Clamp the untrusted title to the index's expectations (length + no newlines).
	const title = typeof m.title === 'string' ? m.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LEN) : '';
	return {
		format: 'lattice',
		version: m.version,
		title: title || 'Untitled deck',
		engine: 'lattice',
		generatedAt: typeof m.generatedAt === 'number' ? m.generatedAt : 0,
		comments: Array.isArray(m.comments) ? (m.comments as SlideComment[]) : [],
	};
}

/**
 * Assemble a `.lattice` zip Blob: `deck.md` (verbatim source) + `manifest.json`
 * (metadata + comments). `source` is stored byte-for-byte so re-import is lossless.
 *
 * `packages` are the USER packages the deck uses — a saved theme, components, finishes —
 * written as `packages/<type>/<name>/`, the same folders a package zip and a repo hold
 * (engineering/decisions/2026-09-23-portable-packages.md §4, finally delivering
 * 2026-06-16-lattice-export-format.md §3b). Shipped packages ride with the engine, so a
 * `.lattice` opens on a machine that has never seen the author's Library.
 */
export async function exportLatticeBlob(source: string, title: string, comments: SlideComment[], now = 0, packages: readonly PackageFiles[] = []): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	zip.file(DECK_FILE, source);
	zip.file(MANIFEST_FILE, `${JSON.stringify(buildLatticeManifest(title, comments, now), null, 2)}\n`);
	for (const p of packages) for (const [f, text] of Object.entries(p.files)) zip.file(`${PACKAGES_DIR}${p.type}/${p.name}/${f}`, text);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

const PACKAGES_DIR = 'packages/';

/** The result of reading a `.lattice`: the deck source + its manifest fields + the packages
 *  it carries (empty for a file written before packages rode along). */
export type LatticeImport = { source: string; title: string; comments: SlideComment[]; packages: ParsedBundle };

/**
 * Read a `.lattice` file back into a deck source + comments. Throws with a plain
 * message when the zip is missing either required part, so the caller can surface a
 * clean toast rather than a stack trace.
 */
export async function readLatticeFile(file: Blob): Promise<LatticeImport> {
	// Reject an oversized archive before touching it (cheap, catches the obvious case).
	if (file.size > MAX_ZIP_BYTES) {
		throw new Error('That .lattice file is too large to open.');
	}
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(file).catch(() => {
		throw new Error('That .lattice file is not a valid archive.');
	});
	const deckEntry = zip.file(DECK_FILE);
	const manifestEntry = zip.file(MANIFEST_FILE);
	if (!deckEntry || !manifestEntry) {
		throw new Error('That .lattice file is missing its deck or manifest.');
	}
	// Deflate-bomb guard: refuse to inflate if the DECLARED uncompressed size is huge
	// (a few-KB zip can otherwise expand to gigabytes and crash the tab). JSZip exposes
	// the entry's uncompressed size on its internal `_data`.
	if (declaredInflatedBytes(deckEntry) + declaredInflatedBytes(manifestEntry) > MAX_INFLATED_BYTES) {
		throw new Error('That .lattice file is too large to open.');
	}
	// The package folders count against the same cap, together with the deck.
	const packagePaths = Object.keys(zip.files).filter((p) => p.startsWith(PACKAGES_DIR) && !zip.files[p].dir);
	assertZipWithinLimits(zip, 'That .lattice file is too large to open.', [DECK_FILE, MANIFEST_FILE, ...packagePaths]);
	// ONE running budget for every read out of this file — the deck, the manifest and the
	// packages. The declared-size check above trusts what the archive SAYS; the budget stops
	// the inflate at the chunk that crosses the cap, so an entry that understates its size
	// cannot inflate past it (zip-limits.ts). Read in order, not in parallel, so the charge
	// is deterministic.
	const charge = readBudget('That .lattice file is too large to open.');
	const source = (await charge(deckEntry)) ?? '';
	const manifest = parseLatticeManifest((await charge(manifestEntry)) ?? '');
	// The packages ride through the SAME reader as a Library package zip, so they meet the
	// same spine, the same refusals and the same notes. Saving them is the caller's step,
	// through the Library's import funnel (library/import-parsed.ts), which runs the gates.
	let packages: ParsedBundle = { themes: [], components: [], finishes: [], scenes: [], notes: [], refused: [] };
	if (packagePaths.length) {
		const { unpackPackages } = await import('./asset-bundle');
		const sub = new JSZip();
		for (const p of packagePaths) {
			const entry = zip.file(p);
			if (entry) sub.file(p.slice(PACKAGES_DIR.length), (await charge(entry)) ?? '');
		}
		packages = await unpackPackages(sub, async (path) => (path ? ((await sub.file(path)?.async('string')) ?? undefined) : undefined));
	}
	// Note: `source` is UTF-8 decoded from the zip — round-trip is byte-identical for
	// any well-formed text (a lone surrogate, only reachable via a corrupt paste, is
	// normalized to U+FFFD on encode; an accepted narrow caveat, not a data path).
	return { source, title: manifest.title, comments: manifest.comments, packages };
}
