// Narration clip packing, off the main thread: compress, base64 and hash one clip (narration-pack.js), then answer.
// The page transfers a copy of the clip's bytes; the answer is strings and numbers, so nothing transfers back.
import { packClip } from './narration-pack.js';

self.onmessage = async (e) => {
	const { id, bytes, type, kbps } = e.data;
	try {
		self.postMessage({ id, ...(await packClip({ bytes, type, kbps })) });
	} catch (err) {
		self.postMessage({ id, error: String(err?.message || err) });
	}
};
