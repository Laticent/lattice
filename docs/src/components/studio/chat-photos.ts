// Photos in the Studio chat: take a picture from the device, keep it in the Library, and show it to
// a model that can see.
//
// A chat photo is a LIBRARY ASSET, not a chat attachment. It goes through the same intake as every
// other photo (`importImage`: decoded, EXIF and GPS removed, capped at 2560 px), is saved to the
// open deck's shelf, and is named `asset:<name>` — so the model is told the name and can put the
// picture on a slide with `![](asset:<name>)`, and the author finds it in Library → Images. The
// thread stores the reference (`ChatPhoto`), never the bytes.
// engineering/decisions/2026-10-12-library-media-assets.md is the intake's contract.
//
// What is sent to the model is a DOWNSCALED copy (`VISION_EDGE`): a vision model reads at roughly
// 1.5 megapixels, so the 2560 px Library original would cost the same tokens and carry more bytes.

import { MAX_VIDEO_BYTES, VISION_EDGE, videoRefusal } from './chat-photo-parts';
import { classifyMedia, importImage, MediaImportError } from './media-import';
import { listMedia, MEDIA_REFUSAL_PREFIX, mediaNameFromFile, namesOf, saveMedia, uniqueName } from './media-store';
import type { ChatPhoto, ChatVideo } from './studio-store';

export { MAX_CHAT_PHOTOS, MAX_VIDEO_SECONDS, VIDEO_TOKENS, VISION_EDGE } from './chat-photo-parts';
export type { ChatPhoto, ChatVideo };

/** What `addChatPhotos` hands back: the photos that landed, and a sentence per file that did not. */
export type AddedPhotos = { photos: ChatPhoto[]; failed: string[]; renamed: string[] };

/**
 * Import files into the open deck's shelf, as the Library does. Copies the file list out before any
 * await (a FileList is live and WebKit empties it), names a batch against the shelf and against each
 * other, and reports each refusal in words.
 */
export async function addChatPhotos(files: FileList | File[] | null, deckId: string): Promise<AddedPhotos> {
	const picked = Array.from(files ?? []);
	const out: AddedPhotos = { photos: [], failed: [], renamed: [] };
	if (!picked.length) return out;
	const taken = new Set((await listMedia()).flatMap(namesOf));
	for (const file of picked) {
		try {
			if (!classifyMedia(file)) throw new MediaImportError(`${file.name} isn't an image.`);
			const rec = await importImage(file, deckId);
			const wanted = rec.name;
			rec.name = uniqueName(rec.name, taken);
			if (rec.name !== wanted) out.renamed.push(`${file.name} is saved as “${rec.name}”`);
			await saveMedia(rec, Date.now());
			taken.add(rec.name);
			out.photos.push({ name: rec.name, width: rec.width, height: rec.height });
		} catch (e) {
			console.warn('lattice: could not add a chat photo', file.name, e);
			const msg = String((e as Error)?.message ?? '');
			out.failed.push(e instanceof MediaImportError || msg.startsWith(MEDIA_REFUSAL_PREFIX) ? msg : `${file.name}: could not be added.`);
		}
	}
	// Browsers may evict a site's storage under pressure; ask to keep it. A refusal changes nothing.
	if (out.photos.length) void navigator.storage?.persist?.().catch(() => {});
	return out;
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error ?? new Error('could not read the photo'));
		r.readAsDataURL(blob);
	});

/**
 * The copy of a stored photo that goes to the model, as a data URL, or `null` when the photo is no
 * longer on the shelf (deleted since). Small photos go as stored; larger ones are redrawn at
 * `VISION_EDGE` as JPEG.
 */
export async function photoDataUrl(name: string): Promise<string | null> {
	const rec = (await listMedia()).find((m) => m.name === name && m.kind === 'image');
	if (!rec) return null;
	const longest = Math.max(rec.width, rec.height);
	if (longest <= VISION_EDGE && /^image\/(jpeg|png|webp)$/.test(rec.mime) && rec.blob.size <= 3 * 1024 * 1024) return blobToDataUrl(rec.blob);
	const bitmap = await createImageBitmap(rec.blob);
	try {
		const scale = Math.min(1, VISION_EDGE / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const ctx = canvas.getContext('2d');
		if (!ctx) return blobToDataUrl(rec.blob);
		ctx.fillStyle = '#fff'; // JPEG has no alpha: a transparent PNG would otherwise turn black
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
		return jpeg ? blobToDataUrl(jpeg) : blobToDataUrl(rec.blob);
	} finally {
		bitmap.close();
	}
}

// ── Video ───────────────────────────────────────────────────────────────────
//
// A clip is held in MEMORY for the turn it is sent on, never stored: the Library has no video shelf
// yet (engineering/decisions/2026-10-12-library-media-assets.md, slice 5), and a stored 15 MB clip per
// message would fill the browser's quota. The thread keeps a poster and a length (`ChatVideo`). A clip
// is read once, measured, refused when it is over the cap, and sent inline as a data URL.

/** At most this many clips are held: the pending one and the one just sent (a same-tab Regenerate
 *  re-sends it). Older ones are released, so memory is bounded however many are attached. */
const MAX_HELD_VIDEOS = 2;
const heldVideos = new Map<string, string>();
/** The clip's data URL while this tab holds it, or null (a reload, or it was released). */
export const heldVideo = (name: string): string | null => heldVideos.get(name) ?? null;
export const forgetVideo = (name: string): void => {
	heldVideos.delete(name);
};

const once = (el: HTMLVideoElement, ok: string, ms: number): Promise<void> =>
	new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('timeout')), ms);
		el.addEventListener(
			ok,
			() => {
				clearTimeout(t);
				resolve();
			},
			{ once: true },
		);
		el.addEventListener(
			'error',
			() => {
				clearTimeout(t);
				reject(new Error('decode'));
			},
			{ once: true },
		);
	});

/**
 * Read a clip, measure it and make its poster. Returns the refusal in words when it cannot be
 * attached (too big, too long, unreadable). The size is checked BEFORE the file is read.
 */
export async function readChatVideo(file: File): Promise<{ video: ChatVideo; dataUrl: string } | { error: string }> {
	if (file.size > MAX_VIDEO_BYTES) return { error: videoRefusal(1, file.size) as string };
	let dataUrl: string;
	try {
		dataUrl = await blobToDataUrl(file);
	} catch {
		return { error: `${file.name} could not be read.` };
	}
	const el = document.createElement('video');
	el.muted = true;
	el.playsInline = true;
	el.preload = 'metadata';
	try {
		el.src = dataUrl;
		await once(el, 'loadedmetadata', 10_000);
		// A recording some browsers write has no length in its header (`Infinity`); seeking far past the
		// end makes the browser find it.
		if (!Number.isFinite(el.duration)) {
			el.currentTime = 1e101;
			await once(el, 'durationchange', 5_000).catch(() => {});
			await new Promise((r) => setTimeout(r, 0));
		}
		const refusal = videoRefusal(el.duration, file.size);
		if (refusal) return { error: refusal };
		el.currentTime = Math.min(0.1, el.duration / 2);
		await once(el, 'seeked', 5_000).catch(() => {});
		const w = 160;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		// Height capped: an extreme aspect ratio must not make a large poster (it is stored in the thread).
		canvas.height = Math.min(240, Math.max(1, Math.round((w * (el.videoHeight || 90)) / (el.videoWidth || 160))));
		canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);
		const poster = canvas.toDataURL('image/jpeg', 0.7);
		// A random suffix, not a counter: the held map is empty after a reload while a persisted thread
		// still names `clip`, and a new `clip.webm` must not be mistaken for the old turn's clip.
		const name = `${mediaNameFromFile(file.name, 'video')}-${Math.random().toString(36).slice(2, 7)}`;
		heldVideos.set(name, dataUrl);
		while (heldVideos.size > MAX_HELD_VIDEOS) heldVideos.delete(heldVideos.keys().next().value as string);
		return { video: { name, durationMs: Math.round(el.duration * 1000), poster }, dataUrl };
	} catch {
		return { error: `${file.name} couldn't be read as a video. It may be a format this browser can't play.` };
	} finally {
		el.removeAttribute('src');
		el.load();
	}
}
