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

import { type SlideComment } from './slide-comments';

/** The manifest envelope. `version` gates forward-compat; bump on a breaking shape change. */
export type LatticeManifest = {
	format: 'lattice';
	version: number;
	title: string;
	engine: 'lattice';
	/** ms epoch the file was written (0 when the caller didn't stamp one). */
	generatedAt: number;
	/** The travelling review comments (the whole point of the format). */
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
	if (typeof m.version !== 'number' || m.version > LATTICE_VERSION) {
		throw new Error(`This .lattice file needs a newer Lattice (format v${m.version}).`);
	}
	return {
		format: 'lattice',
		version: m.version,
		title: typeof m.title === 'string' ? m.title : 'Untitled deck',
		engine: 'lattice',
		generatedAt: typeof m.generatedAt === 'number' ? m.generatedAt : 0,
		comments: Array.isArray(m.comments) ? (m.comments as SlideComment[]) : [],
	};
}

/**
 * Assemble a `.lattice` zip Blob: `deck.md` (verbatim source) + `manifest.json`
 * (metadata + comments). `source` is stored byte-for-byte so re-import is lossless.
 */
export async function exportLatticeBlob(source: string, title: string, comments: SlideComment[], now = 0): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	zip.file(DECK_FILE, source);
	zip.file(MANIFEST_FILE, `${JSON.stringify(buildLatticeManifest(title, comments, now), null, 2)}\n`);
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** The result of reading a `.lattice`: the deck source + its manifest fields. */
export type LatticeImport = { source: string; title: string; comments: SlideComment[] };

/**
 * Read a `.lattice` file back into a deck source + comments. Throws with a plain
 * message when the zip is missing either required part, so the caller can surface a
 * clean toast rather than a stack trace.
 */
export async function readLatticeFile(file: Blob): Promise<LatticeImport> {
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(file).catch(() => {
		throw new Error('That .lattice file is not a valid archive.');
	});
	const deckEntry = zip.file(DECK_FILE);
	const manifestEntry = zip.file(MANIFEST_FILE);
	if (!deckEntry || !manifestEntry) {
		throw new Error('That .lattice file is missing its deck or manifest.');
	}
	const [source, manifestText] = await Promise.all([deckEntry.async('string'), manifestEntry.async('string')]);
	const manifest = parseLatticeManifest(manifestText);
	return { source, title: manifest.title, comments: manifest.comments };
}
