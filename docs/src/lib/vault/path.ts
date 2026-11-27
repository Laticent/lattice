import { normalizeSourceText } from '../normalize-source-text';
import { type Kind, VaultError } from './types';

const MAX_PATH = 1024;
// Characters a Windows, macOS or Linux folder (and Drive) cannot all hold: C0 controls, DEL, `\` and `<>:"|?*`.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control range is exactly what this rejects
const BAD_CHAR = /[\u0000-\u001f\u007f\\<>:"|?*]/;
// Windows reserves these names with any extension (`NUL.md`), case-insensitively.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

/**
 * The one spelling of a vault path: `/`-separated, no leading or trailing slash, NFC, no empty, `.` or `..`
 * segment, and only names every desktop file system can hold. The root directory is `''`. Throws
 * `invalid-path`. NOT checked yet: two paths that differ only in case (`Q3.md`, `q3.md`), which collide on
 * macOS and Windows; the desktop host (slice 10) owns that rule.
 */
export function normalizePath(path: string, { dir = false }: { dir?: boolean } = {}): string {
	if (typeof path !== 'string') throw new VaultError('invalid-path', 'vault: a path is a string');
	const p = path.normalize('NFC').replace(/^\/+|\/+$/g, '');
	if (p === '') {
		if (dir) return '';
		throw new VaultError('invalid-path', 'vault: a file path cannot be empty');
	}
	if (p.length > MAX_PATH) throw new VaultError('invalid-path', `vault: a path is at most ${MAX_PATH} characters`);
	if (BAD_CHAR.test(p)) throw new VaultError('invalid-path', `vault: ${JSON.stringify(path)} holds a control character or a backslash`);
	for (const seg of p.split('/')) {
		if (seg === '' || seg === '.' || seg === '..') throw new VaultError('invalid-path', `vault: ${JSON.stringify(path)} has an empty, "." or ".." segment`);
		if (RESERVED.test(seg)) throw new VaultError('invalid-path', `vault: ${JSON.stringify(seg)} is a name Windows reserves`);
		if (/[. ]$/.test(seg)) throw new VaultError('invalid-path', `vault: ${JSON.stringify(seg)} ends in a dot or a space, which Windows drops`);
	}
	return p;
}

const KINDS: Record<string, Kind> = {
	md: 'markdown',
	markdown: 'markdown',
	png: 'image',
	jpg: 'image',
	jpeg: 'image',
	gif: 'image',
	webp: 'image',
	avif: 'image',
	svg: 'image',
	mp4: 'video',
	webm: 'video',
	mov: 'video',
	mp3: 'audio',
	wav: 'audio',
	ogg: 'audio',
	m4a: 'audio',
	woff: 'font',
	woff2: 'font',
	ttf: 'font',
	otf: 'font',
	pdf: 'document',
	css: 'stylesheet',
	json: 'json',
	yjs: 'yjs',
	yjsu: 'yjs',
	txt: 'text',
	csv: 'text',
	yaml: 'text',
	yml: 'text',
};

function ext(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function kindOf(path: string): Kind {
	return KINDS[ext(path)] ?? 'file';
}

/** Extensions whose bytes are author text, so they cross the boundary normalized. SVG is markup an editor
 *  saves too, but it is an image the vault stores byte for byte. */
const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'csv', 'tsv', 'yaml', 'yml', 'css', 'json']);

export function isTextPath(path: string): boolean {
	return TEXT_EXT.has(ext(path));
}

const encoder = new TextEncoder();

/**
 * The bytes a write stores. THE VAULT IS A MARKDOWN INGEST
 * (engineering/decisions/2026-08-04-line-endings-lf-boundaries.md): a text path's content, given as a
 * string or as bytes, is stored with LF line endings and no leading BOM, through the shared
 * `normalizeSourceText`. Bytes that are not valid UTF-8 are stored as given. Any other path is stored as
 * given (a string as its UTF-8), so a string and its bytes always store as the same blob.
 */
export async function toBytes(path: string, data: Blob | string | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
	if (typeof data === 'string') return encoder.encode(isTextPath(path) ? normalizeSourceText(data) : data);
	let bytes: Uint8Array;
	if (data instanceof Uint8Array) bytes = new Uint8Array(data);
	else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data.slice(0));
	else bytes = new Uint8Array(await data.arrayBuffer());
	if (!isTextPath(path)) return bytes;
	let text: string;
	try {
		// `ignoreBOM: true` keeps a leading U+FEFF in the string, so normalizeSourceText is the one place that drops it.
		text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
	} catch {
		return bytes;
	}
	const canonical = normalizeSourceText(text);
	return canonical === text ? bytes : encoder.encode(canonical);
}

export async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
	let hex = '';
	for (const b of digest) hex += b.toString(16).padStart(2, '0');
	return hex;
}
