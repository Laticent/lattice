import { normalizeSourceText } from '../normalize-source-text';
import { type Kind, VaultError } from './types';

const MAX_PATH = 1024;
// C0 controls, DEL and a backslash: a path that holds one cannot round-trip through Drive and a desktop file system alike.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control range is exactly what this rejects
const BAD_CHAR = /[\u0000-\u001f\u007f\\]/;

/**
 * The one spelling of a vault path: `/`-separated, no leading or trailing slash, NFC, no empty, `.` or `..`
 * segment. The root directory is `''`. Throws `invalid-path`.
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
const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'csv', 'yaml', 'yml', 'css', 'json']);

export function isTextPath(path: string): boolean {
	return TEXT_EXT.has(ext(path));
}

const encoder = new TextEncoder();

/**
 * The bytes a write stores. THE VAULT IS A MARKDOWN INGEST
 * (engineering/decisions/2026-08-04-line-endings-lf-boundaries.md): a string, or the bytes of a text
 * path, is stored with LF line endings and no leading BOM, through the shared `normalizeSourceText`.
 * Bytes that are not valid UTF-8 are stored as given; any other path is stored byte for byte.
 */
export async function toBytes(path: string, data: Blob | string | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
	if (typeof data === 'string') return encoder.encode(normalizeSourceText(data));
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
