// The browser-backed `AgentAssets`: reads the Library shelf, scales a photo to a thumbnail, stores a
// caption. The pure half (shapes, manifest, list view) is agent-assets.ts.
import { type AgentAssets, type AssetInfo, cleanCaption, MAX_THUMB_EDGE } from './agent-assets';
import { listMedia, type MediaRecord, setMediaCaption, visibleMedia } from './media-store';
import { activeAssetDeckId } from './media-urls';

const infoOf = (m: MediaRecord): AssetInfo => ({ name: m.name, kind: m.kind, width: m.width, height: m.height, bytes: m.bytes, scope: m.scope === 'library' ? 'library' : 'deck', caption: cleanCaption(m.caption) || undefined });

async function shelf(): Promise<MediaRecord[]> {
	return visibleMedia(await listMedia(), activeAssetDeckId());
}

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

export const agentAssets: AgentAssets = {
	async list() {
		return (await shelf()).map(infoOf);
	},
	async thumbnail(name) {
		const rec = (await shelf()).find((m) => m.name === name && m.kind === 'image');
		return rec ? thumbOf(rec.blob, MAX_THUMB_EDGE) : null;
	},
	async setCaption(name, caption) {
		const rec = (await shelf()).find((m) => m.name === name && m.kind === 'image');
		if (!rec) return null;
		const saved = await setMediaCaption(rec.id, caption);
		return saved ? (saved.caption ?? '') : null;
	},
};
