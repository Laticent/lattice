/**
 * THE NARRATION CODEC PROBE, the page half (PROBE=codec-support). run.mjs drives it in Mobile Safari in an iPhone iOS
 * Simulator; probe.selftest.mjs runs it in Playwright's Chromium, WebKit and Firefox. It is the iOS arm of the narration
 * codec bake-off: the streaming design keeps narration compressed in browser storage, and the codec has to decode on an
 * iPhone, encode in the page, and add no lead-in silence. Linux WebKit uses GStreamer, not Apple's media stack, so only an
 * iOS run can answer for an iPhone.
 *
 *   latticeCodecProbe(files)   files: [{ name, b64 }] from codec-fixtures/ (speech.wav is the 2 s source)
 *
 * It reports, for every fixture, whether decodeAudioData decodes it and how much longer than the source it comes out; which
 * codecs WebCodecs' AudioEncoder and AudioDecoder support; and a real round trip: the source speech encoded with
 * AudioEncoder (Opus, AAC) and decoded back with AudioDecoder, with the bytes written and the change in length. That
 * round trip is the path the streaming design would use: raw packets in storage, no container, no decodeAudioData.
 * WebDriver sends it as text, after Suono's Ogg writer (docs/src/lib/suono/ogg-opus.ts) compiled to plain script by run.mjs:
 * it uses its argument, the page's own APIs and that writer.
 */

async function latticeCodecProbe(files) {
	const out = { ua: navigator.userAgent, width: innerWidth, decode: {}, encoder: {}, decoder: {}, roundTrip: {} };
	const bytesOf = (b64) => {
		const bin = atob(b64);
		const u = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
		return u.buffer;
	};
	const ctx = new OfflineAudioContext(1, 1, 48000);
	const source = files.find((f) => f.name === 'speech.wav');
	const sourceBuf = await ctx.decodeAudioData(bytesOf(source.b64));
	const sourceS = sourceBuf.duration;
	out.sourceS = Math.round(sourceS * 1000) / 1000;

	// A. decodeAudioData, resampled to 48 kHz as an iPhone's AudioContext runs.
	for (const f of files) {
		try {
			const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytesOf(f.b64));
			out.decode[f.name] = { ok: true, extraMs: Math.round((buf.duration - sourceS) * 1000) };
		} catch (e) {
			out.decode[f.name] = { ok: false, error: String(e?.name || e).slice(0, 60) };
		}
	}

	// B. What WebCodecs says it supports.
	const codecs = { opus: 'opus', aac: 'mp4a.40.2', flac: 'flac', vorbis: 'vorbis', mp3: 'mp3' };
	for (const [k, codec] of Object.entries(codecs)) {
		for (const sampleRate of [24000, 48000]) {
			const key = `${k}@${sampleRate / 1000}k`;
			try {
				out.encoder[key] = typeof AudioEncoder === 'function' ? (await AudioEncoder.isConfigSupported({ codec, sampleRate, numberOfChannels: 1, bitrate: 32000 })).supported : 'no AudioEncoder';
			} catch (e) {
				out.encoder[key] = `error ${String(e?.name || e).slice(0, 40)}`;
			}
			try {
				out.decoder[key] = typeof AudioDecoder === 'function' ? (await AudioDecoder.isConfigSupported({ codec, sampleRate, numberOfChannels: 1 })).supported : 'no AudioDecoder';
			} catch (e) {
				out.decoder[key] = `error ${String(e?.name || e).slice(0, 40)}`;
			}
		}
	}

	// C. A real round trip, the streaming design's path: AudioEncoder → packets → AudioDecoder.
	const pcm48 = sourceBuf.getChannelData(0); // already resampled to 48 kHz by the decode above
	const roundTrip = async (label, codec, sampleRate, bitrate) => {
		if (typeof AudioEncoder !== 'function' || typeof AudioDecoder !== 'function') return { ok: false, error: 'no WebCodecs' };
		let samples = pcm48;
		if (sampleRate !== 48000) {
			const off = new OfflineAudioContext(1, Math.ceil(pcm48.length * (sampleRate / 48000)), sampleRate);
			const b = off.createBuffer(1, pcm48.length, 48000);
			b.copyToChannel(pcm48, 0);
			const src = off.createBufferSource();
			src.buffer = b;
			src.connect(off.destination);
			src.start();
			samples = (await off.startRendering()).getChannelData(0);
		}
		const chunks = [];
		let decoderConfig = null;
		let error = null;
		const t0 = performance.now();
		const enc = new AudioEncoder({
			output: (chunk, meta) => {
				const data = new Uint8Array(chunk.byteLength);
				chunk.copyTo(data);
				chunks.push({ type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration, data });
				if (meta?.decoderConfig) decoderConfig = meta.decoderConfig;
			},
			error: (e) => (error = String(e?.message || e)),
		});
		try {
			enc.configure({ codec, sampleRate, numberOfChannels: 1, bitrate });
			// 30 ms of silence after the speech, so the encoder's lookahead releases ALL of it on flush; the Ogg writer's
			// `length` trims the file back to the speech.
			const input = new Float32Array(samples.length + Math.ceil(sampleRate * 0.03));
			input.set(samples);
			const frame = 1024;
			for (let i = 0; i < input.length; i += frame) {
				const slice = input.slice(i, Math.min(i + frame, input.length));
				enc.encode(new AudioData({ format: 'f32', sampleRate, numberOfFrames: slice.length, numberOfChannels: 1, timestamp: Math.round((i / sampleRate) * 1e6), data: slice }));
			}
			await enc.flush();
			enc.close();
		} catch (e) {
			return { ok: false, error: `encode: ${String(e?.message || e).slice(0, 80)}` };
		}
		if (error) return { ok: false, error: `encode: ${error.slice(0, 80)}` };
		const encodeMs = performance.now() - t0;
		const bytes = chunks.reduce((n, c) => n + c.data.length, 0);
		let decoded = 0;
		let decError = null;
		const dec = new AudioDecoder({
			output: (data) => {
				decoded += data.numberOfFrames * (sampleRate / data.sampleRate);
				data.close();
			},
			error: (e) => (decError = String(e?.message || e)),
		});
		try {
			dec.configure(decoderConfig || { codec, sampleRate, numberOfChannels: 1 });
			for (const c of chunks) dec.decode(new EncodedAudioChunk({ type: c.type, timestamp: c.timestamp, duration: c.duration, data: c.data }));
			await dec.flush();
			dec.close();
		} catch (e) {
			return { ok: false, error: `decode: ${String(e?.message || e).slice(0, 80)}`, bytes };
		}
		if (decError) return { ok: false, error: `decode: ${decError.slice(0, 80)}`, bytes };
		// E. The same packets in OUR Ogg file (Suono's ogg-opus.ts, sent ahead of this script by run.mjs), played back with
		// decodeAudioData: the stored-clip path the streaming design uses. Its added length is what a listener hears.
		let ogg = null;
		if (codec === 'opus' && typeof muxOggOpus === 'function') {
			try {
				const preSkip = preSkipFromDescription(decoderConfig?.description) ?? DEFAULT_PRE_SKIP;
				const file = muxOggOpus({
					packets: chunks.map((c) => ({ data: c.data })),
					preSkip,
					inputSampleRate: sampleRate,
					length: Math.round((samples.length * 48000) / sampleRate),
				});
				const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(file.slice().buffer);
				ogg = { ok: true, bytes: file.length, extraMs: Math.round((buf.duration - samples.length / sampleRate) * 1000), preSkip, preSkipReported: preSkipFromDescription(decoderConfig?.description) !== null };
			} catch (e) {
				ogg = { ok: false, error: String(e?.name || e?.message || e).slice(0, 80) };
			}
		}
		return {
			ogg,
			ok: decoded > 0,
			label,
			bytes,
			kbps: Math.round((bytes * 8) / sourceS / 100) / 10,
			extraMs: Math.round(((decoded - samples.length) / sampleRate) * 1000),
			encodeXRealtime: Math.round(((sourceS * 1000) / encodeMs) * 10) / 10,
			hasDecoderConfig: !!decoderConfig,
		};
	};
	out.roundTrip['opus 24k @48k'] = await roundTrip('opus', 'opus', 48000, 24000);
	out.roundTrip['opus 32k @48k'] = await roundTrip('opus', 'opus', 48000, 32000);
	out.roundTrip['opus 24k @24k'] = await roundTrip('opus', 'opus', 24000, 24000);
	out.roundTrip['aac 64k @48k'] = await roundTrip('aac', 'mp4a.40.2', 48000, 64000);

	// D. The same Opus encode INSIDE A WORKER. On the main thread an iPhone encodes at about 11x realtime, so a 5 s sentence
	// would block Present for about 0.45 s; the streaming design encodes in a worker, which needs AudioEncoder there.
	out.worker = await new Promise((resolve) => {
		const src = `self.onmessage = async (e) => {
			const { pcm, sampleRate, bitrate } = e.data;
			if (typeof AudioEncoder !== 'function') return self.postMessage({ ok: false, error: 'no AudioEncoder in a worker' });
			try {
				let bytes = 0;
				let err = null;
				const t0 = performance.now();
				const enc = new AudioEncoder({ output: (c) => { bytes += c.byteLength; }, error: (x) => { err = String(x && x.message || x); } });
				enc.configure({ codec: 'opus', sampleRate, numberOfChannels: 1, bitrate });
				for (let i = 0; i < pcm.length; i += 1024) {
					const s = pcm.slice(i, Math.min(i + 1024, pcm.length));
					enc.encode(new AudioData({ format: 'f32', sampleRate, numberOfFrames: s.length, numberOfChannels: 1, timestamp: Math.round(i / sampleRate * 1e6), data: s }));
				}
				await enc.flush();
				enc.close();
				const ms = performance.now() - t0;
				self.postMessage(err ? { ok: false, error: err } : { ok: bytes > 0, bytes, encodeXRealtime: Math.round(pcm.length / sampleRate * 1000 / ms * 10) / 10 });
			} catch (x) {
				self.postMessage({ ok: false, error: String(x && x.message || x).slice(0, 80) });
			}
		};`;
		let w;
		const timer = setTimeout(() => resolve({ ok: false, error: 'the worker did not answer in 20 s' }), 20000);
		try {
			w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
		} catch (e) {
			clearTimeout(timer);
			return resolve({ ok: false, error: `no worker: ${String(e?.message || e).slice(0, 60)}` });
		}
		w.onmessage = (e) => {
			clearTimeout(timer);
			w.terminate();
			resolve(e.data);
		};
		w.onerror = (e) => {
			clearTimeout(timer);
			resolve({ ok: false, error: `worker error: ${String(e?.message || e).slice(0, 60)}` });
		};
		w.postMessage({ pcm: pcm48, sampleRate: 48000, bitrate: 32000 });
	});
	return out;
}

// Reached by name from source text (run.mjs's execute-script, probe.selftest.mjs's evaluate).
Object.assign(globalThis, { latticeCodecProbe });
