// The browser-backed `AgentAssets`: reads the Library shelf, scales a photo to a thumbnail, stores a
// caption. The pure half (shapes, manifest, list view) is agent-assets.ts.
import { type AgentAssets, type AssetInfo, cleanCaption, MAX_THUMB_EDGE } from './agent-assets';
import { listMedia, type MediaRecord, setMediaCaption, visibleMedia } from './media-store';
import { activeAssetDeckId } from './media-urls';

const infoOf = (m: MediaRecord): AssetInfo => ({ name: m.name, kind: m.kind, width: m.width, height: m.height, bytes: m.bytes, scope: m.scope === 'library' ? 'library' : 'deck', caption: cleanCaption(m.caption) || undefined });

/** A Blob scaled so its long edge is at most `edge`, as a JPEG data URL. Null when the browser
 *  cannot decode it. A transparent PNG is flattened onto white, which is what a JPEG does anyway. */
async function thumbOf(blob: Blob, edge: number): Promise<string | null> {
	try {
		const bmp = await createImageBitmap(blob);
		const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
		const w = Math.max(1, Math.round(bmp.width * k));
		const h = Math.max(1, Math.round(bmp.height * k));
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, w, h);
		ctx.drawImage(bmp, 0, 0, w, h);
		bmp.close?.();
		return canvas.toDataURL('image/jpeg', 0.72);
	} catch {
		return null;
	}
}

/** The Library as the chat sees it, for ONE turn. It reads the shelf (every photo's bytes) at most once and
 *  serves the list, every thumbnail and every caption from that read: a `view_asset` call over six photos
 *  used to read the whole shelf six times. A photo added mid-turn is not seen until the next turn, which is
 *  when the chat would see it anyway; a caption it saves is written to the store and to this copy. */
export function createAgentAssets(): AgentAssets {
	let held: Promise<MediaRecord[]> | null = null;
	const shelf = () => {
		held ??= listMedia().then((all) => visibleMedia(all, activeAssetDeckId()));
		return held;
	};
	return {
		async list() {
			// Photos only. The manifest tells the model "a deck shows one as `asset:<name>`", and a slide cannot show
			// a video yet, so a clip the author sent in the chat must not be offered as something to put on one.
			return (await shelf()).filter((m) => m.kind === 'image').map(infoOf);
		},
		async thumbnail(name, edge = MAX_THUMB_EDGE) {
			const rec = (await shelf()).find((m) => m.name === name && m.kind === 'image');
			return rec ? thumbOf(rec.blob, edge) : null;
		},
		async setCaption(name, caption) {
			const rec = (await shelf()).find((m) => m.name === name && m.kind === 'image');
			if (!rec) return null;
			const saved = await setMediaCaption(rec.id, caption);
			if (!saved) return null;
			rec.caption = saved.caption;
			return saved.caption ?? '';
		},
	};
}
