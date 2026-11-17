// Narration clips to Ogg Opus, off the main thread: the page transfers a 16-bit PCM WAV (what the Gemini and Kokoro rungs
// return), this decodes its samples and encodes them with Suono's encodeOpus (WebCodecs), and transfers the Ogg bytes back.
// An iPhone encodes at about 35x realtime here, so a sentence is ready long before it is needed
// (engineering/decisions/2026-11-17-narration-codec-bakeoff.md). A clip this cannot encode comes back as `{ fail }`, not
// `{ error }`: the worker pool reads `error` as a broken worker and would stop using workers for the rest of the session.
import { encodeOpus, samplesFromWav } from '../lib/suono/opus';

self.onmessage = async (e) => {
	const { id, wav, kbps } = e.data;
	try {
		const pcm = samplesFromWav(wav);
		if (!pcm) return self.postMessage({ id, fail: 'not a 16-bit PCM WAV' });
		const ogg = await encodeOpus(pcm.samples, pcm.sampleRate, { bitrate: Math.round(kbps * 1000) });
		if (!ogg) return self.postMessage({ id, fail: 'no Opus encoder here' });
		self.postMessage({ id, ogg: ogg.buffer }, [ogg.buffer]);
	} catch (err) {
		self.postMessage({ id, fail: String(err?.message || err).slice(0, 120) });
	}
};
