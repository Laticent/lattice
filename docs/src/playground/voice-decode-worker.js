// Gemini speech decoding, off the main thread: the page transfers the response body, this parses it and decodes the
// clip (voice-decode.js), and transfers the WAV bytes back. A bad answer comes back as `{ fail }`, not `{ error }`:
// the worker pool reads `error` as a broken worker and would stop using workers for the rest of the session.
import { decodeGeminiSpeech } from './voice-decode.js';

self.onmessage = (e) => {
	const { id, body } = e.data;
	try {
		const out = decodeGeminiSpeech(body);
		if ('error' in out) self.postMessage({ id, fail: out.error });
		else self.postMessage({ id, wav: out.wav, wrapped: out.wrapped }, [out.wav]);
	} catch (err) {
		self.postMessage({ id, error: String(err?.message || err) });
	}
};
