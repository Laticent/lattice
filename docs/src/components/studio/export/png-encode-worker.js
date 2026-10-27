// The PNG writer, off the main thread. The slide camera (lib/core/slide-camera.mjs) encodes a slide's picture with a per-row filter
// search and deflate, a few hundred milliseconds of script per slide that would otherwise stall the tab and delay the next capture.
// The page sends an ImageBitmap of the canvas (transferred, not copied); the same `encodePng` runs here on an OffscreenCanvas and the
// bytes come back, identical to what the main thread would write.
import { encodePng } from '../../../../../lib/core/slide-camera.mjs';

self.onmessage = async (e) => {
	const { id, bitmap } = e.data;
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		canvas.getContext('2d').drawImage(bitmap, 0, 0);
		bitmap.close();
		const bytes = await encodePng(canvas);
		self.postMessage({ id, bytes }, [bytes.buffer]);
	} catch (err) {
		self.postMessage({ id, error: String(err?.message || err) });
	}
};
