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

// The WRITE half — manifest shape, part names, zip assembly — is shared with the CLI's
// `--reopenable` export (lib/core/reopenable.js, HARD RULE #1), so a `.lattice` from either
// tool is the same file. A DEFAULT import: it is a CommonJS leaf (vite-cjs-lib-dev.mjs).
import reopenable from '../../../../lib/core/reopenable.js';
import type { ParsedBundle } from './asset-bundle';
import type { PackageFiles } from './package-zip';
import type { SlideComment } from './slide-comments';

// The READ half — the caps, the zip-bomb guards, the manifest check, the extraction — is shared with
// the CLI's `.lattice` input too (lib/packages/lattice-read.mjs, loaded on the first read: this module
// is on the Studio's eager path and a read never is). This file keeps only what is the Studio's own:
// handing the packages to the Library's reader and the open archive to the photo restore.

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

export const LATTICE_VERSION: number = reopenable.LATTICE_VERSION;

/** Build the manifest object for a deck (pure — `now` is injected, never read here). */
export function buildLatticeManifest(title: string, comments: SlideComment[], now = 0): LatticeManifest {
	return reopenable.buildLatticeManifest(title, comments, now) as LatticeManifest;
}

/**
 * Parse + validate a manifest from untrusted JSON text (a shared file). Throws on a
 * shape that isn't a Lattice manifest or a future major version we can't read; the
 * `comments` array is returned as-is (the caller re-validates each via the store's
 * guard). Kept pure + fs-free so it unit-tests without a zip. The check is the shared one
 * (lib/core/reopenable.js), so the CLI refuses the same manifests.
 */
export function parseLatticeManifest(json: string): LatticeManifest {
	return reopenable.parseLatticeManifest(json) as LatticeManifest;
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
export async function exportLatticeBlob(source: string, title: string, comments: SlideComment[], now = 0, packages: readonly PackageFiles[] = [], media?: LatticeMedia): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const bytes = await reopenable.buildLatticeZip(JSZip, { source, title, comments, now, packages, media });
	return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

/** The photos a deck names, ready to write: the text of `media.json` and each `media/<file>`'s bytes. */
export type LatticeMedia = { index: string; files: Record<string, Uint8Array> };

/** The result of reading a `.lattice`: the deck source + its manifest fields + the packages
 *  it carries (empty for a file written before packages rode along). `photos` is the opened
 *  archive, present only when the file carries photos. Reading it does not save anything: the
 *  Studio's import funnel restores them through `restoreMedia`, which holds the gates (type
 *  sniff, metadata scrub, size caps, never overwrite). */
export type LatticeImport = { source: string; title: string; comments: SlideComment[]; packages: ParsedBundle; photos?: { zip: { file: (path: string) => object | null } } };

/**
 * Read a `.lattice` file back into a deck source + comments. Throws with a plain
 * message when the zip is missing either required part, so the caller can surface a
 * clean toast rather than a stack trace.
 */
export async function readLatticeFile(file: Blob | Uint8Array): Promise<LatticeImport> {
	// Bytes as well as a Blob: `deck-import.ts` has already read the file (or pulled the
	// `.lattice` out of a PDF / PowerPoint) and hands the bytes straight on.
	const onDisk = file instanceof Uint8Array ? file.byteLength : file.size;
	const [{ default: JSZip }, { readLatticeArchive }] = await Promise.all([import('jszip'), import('../../../../lib/packages/lattice-read.mjs')]);
	// Every cap, the zip-bomb guards, the manifest check and the one read budget are the shared reader's.
	const { source, manifest, packageFiles, carriesPhotos, zip } = await readLatticeArchive(JSZip, file, onDisk);
	// The packages ride through the SAME reader as a Library package zip, so they meet the
	// same spine, the same refusals and the same notes. Saving them is the caller's step,
	// through the Library's import funnel (library/import-parsed.ts), which runs the gates.
	let packages: ParsedBundle = { themes: [], components: [], finishes: [], scenes: [], notes: [], refused: [] };
	if (packageFiles.length) {
		const { unpackPackages } = await import('./asset-bundle');
		const sub = new JSZip();
		for (const [path, text] of packageFiles) sub.file(path, text);
		packages = await unpackPackages(sub, async (path) => (path ? ((await sub.file(path)?.async('string')) ?? undefined) : undefined));
	}
	// Note: `source` is UTF-8 decoded from the zip — round-trip is byte-identical for
	// any well-formed text (a lone surrogate, only reachable via a corrupt paste, is
	// normalized to U+FFFD on encode; an accepted narrow caveat, not a data path).
	return { source, title: manifest.title, comments: manifest.comments as SlideComment[], packages, ...(carriesPhotos ? { photos: { zip } } : {}) };
}
