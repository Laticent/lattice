// The picture writers, off the main thread. The slide camera's shared PNG and JPEG writers (lib/core/slide-camera.mjs `encodeCanvas`)
// spend a few hundred milliseconds of script per slide that would otherwise stall the tab and delay the next capture.
// The page sends an ImageBitmap of the canvas (transferred, not copied) and the format; the same writer runs here on an OffscreenCanvas
// and the bytes come back, identical to what the main thread would write.
import { encodeCanvas } from '../../../../../lib/core/slide-camera.mjs';

self.onmessage = async (e) => {
	const { id, bitmap, format } = e.data;
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		canvas.getContext('2d').drawImage(bitmap, 0, 0);
		bitmap.close();
		const bytes = await encodeCanvas(canvas, format);
		self.postMessage({ id, bytes }, [bytes.buffer]);
	} catch (err) {
		self.postMessage({ id, error: String(err?.message || err) });
	}
};
