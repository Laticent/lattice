// The picture writers, off the main thread. The slide camera's shared PNG and JPEG writers (lib/core/canvas-encode.mjs `encodeCanvas`)
// spend a few hundred milliseconds of script per slide that would otherwise stall the tab and delay the next capture.
// The page sends the canvas's pixels (an ImageData buffer, transferred, not copied) and the format; the same writer runs here on an
// OffscreenCanvas and the bytes come back: the same writer, and the same pixels, as the main thread's. It used to send an ImageBitmap,
// which WebKit could deliver blank (decisions/2026-11-03-pictures-at-drawn-size.md).
import { encodeCanvas } from '../../../../../lib/core/canvas-encode.mjs';

self.onmessage = async (e) => {
	const { id, width, height, buffer, format } = e.data;
	try {
		const canvas = new OffscreenCanvas(width, height);
		canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
		const bytes = await encodeCanvas(canvas, format);
		self.postMessage({ id, bytes }, [bytes.buffer]);
	} catch (err) {
		self.postMessage({ id, error: String(err?.message || err) });
	}
};
