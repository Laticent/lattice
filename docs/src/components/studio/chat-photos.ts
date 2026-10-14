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

import { MAX_VIDEO_BYTES, VISION_EDGE, videoRefusal, videoWireType } from './chat-photo-parts';
import { classifyMedia, importImage, importVideo, MediaImportError } from './media-import';
import { deleteMedia, listMedia, MEDIA_REFUSAL_PREFIX, namesOf, saveMedia, uniqueName } from './media-store';
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
			if (classifyMedia(file) !== 'image') throw new MediaImportError(`${file.name} isn't an image.`);
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
// A chat clip is a LIBRARY ASSET too: `importVideo` reads it, the open deck's shelf keeps it (Library →
// Videos), and the thread stores only its name and length. It survives a reload and Regenerate re-reads
// it from the shelf. The chat's caps are tighter than the Library's (15 seconds, 15 MB): video is billed
// by the second, so a longer clip is refused here, before anything is saved.

/** Save a clip to the open deck's shelf and hand back what the thread keeps of it, or the refusal in
 *  words. The size is checked BEFORE the file is read; the length BEFORE it is saved, so a refused clip
 *  leaves nothing on the shelf. */
export async function addChatVideo(file: File, deckId: string): Promise<{ video: ChatVideo } | { error: string }> {
	if (file.size > MAX_VIDEO_BYTES) return { error: videoRefusal(1, file.size) as string };
	try {
		const rec = await importVideo(file, deckId);
		const refusal = videoRefusal((rec.durationMs ?? 0) / 1000, rec.bytes);
		if (refusal) return { error: refusal };
		const taken = new Set((await listMedia()).map((a) => a.name));
		// A random suffix, not just a free name: the thread names its clip, and a clip deleted from the Library
		// and a new `video.mp4` attached later must not be mistaken for the old turn's clip on Regenerate.
		rec.name = uniqueName(`${rec.name.slice(0, 40)}-${Math.random().toString(36).slice(2, 7)}`, taken);
		await saveMedia(rec, Date.now());
		void navigator.storage?.persist?.().catch(() => {});
		return { video: { name: rec.name, durationMs: rec.durationMs ?? 0 } };
	} catch (e) {
		console.warn('lattice: could not add a chat video', file.name, e);
		const msg = String((e as Error)?.message ?? '');
		return { error: e instanceof MediaImportError || msg.startsWith(MEDIA_REFUSAL_PREFIX) ? msg : `${file.name}: could not be added.` };
	}
}

/** The clip as a data URL for the model, or `null` when it is no longer on the shelf (deleted since). */
export async function videoDataUrl(name: string): Promise<string | null> {
	const rec = (await listMedia()).find((m) => m.name === name && m.kind === 'video');
	// The bytes are untouched; only the type the data URL declares is the one the provider accepts (`videoWireType`).
	return rec ? blobToDataUrl(rec.blob.slice(0, rec.blob.size, videoWireType(rec.blob.type))) : null;
}

/** Remove a clip that was attached but never sent (taken out of the strip, or its deck was left). A photo
 *  stays in the Library as a keepsake; a clip is up to 15 MB and the author never chose to keep it. */
export async function discardChatVideo(name: string): Promise<void> {
	try {
		const rec = (await listMedia()).find((m) => m.name === name && m.kind === 'video');
		if (rec) await deleteMedia(rec.id);
	} catch {
		/* the Library lists it; the author can delete it there */
	}
}
