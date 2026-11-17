// Suono — speech samples to an Ogg Opus file, with the browser's own encoder (WebCodecs AudioEncoder). Runs on the main
// thread or in a worker; the Studio runs it in a worker, because an iPhone encodes at about 28x realtime on the main
// thread and 35x in a worker (engineering/decisions/2026-11-17-narration-codec-bakeoff.md), and a 5 s sentence must not
// block Present. Where there is no AudioEncoder, or it refuses Opus, it returns null and the caller keeps its WAV:
// a missing encoder costs bytes, never audio.
//
// THE LEAD-IN. An Ogg file says how many samples the decoder skips at the start (pre-skip). Encoders report it
// differently: Chromium's and Firefox's report 312 samples their packets do not carry, so a file written with the reported
// value plays 6 ms short. So the delay is MEASURED once per sample rate: encode a single click, decode the packets back,
// and see where the click lands. The file's pre-skip is that measurement.

import { muxOggOpus } from './ogg-opus.js';

export interface OpusOptions {
	/** Bits per second. The Studio passes the workspace narration bitrate. */
	bitrate?: number;
	channels?: number;
}

type Packet = { data: Uint8Array };

const hasCodecs = () => typeof AudioEncoder === 'function' && typeof AudioDecoder === 'function' && typeof AudioData === 'function';

/** Feed mono Float32 samples through an Opus AudioEncoder; resolves the packets and the decoder config, or null. */
async function encodePackets(samples: Float32Array, sampleRate: number, bitrate: number): Promise<{ packets: Packet[]; config: AudioDecoderConfig | null } | null> {
	const packets: Packet[] = [];
	let config: AudioDecoderConfig | null = null;
	let failed = false;
	const enc = new AudioEncoder({
		output: (chunk, meta) => {
			const data = new Uint8Array(chunk.byteLength);
			chunk.copyTo(data);
			packets.push({ data });
			if (meta?.decoderConfig) config = meta.decoderConfig;
		},
		error: () => {
			failed = true;
		},
	});
	try {
		enc.configure({ codec: 'opus', sampleRate, numberOfChannels: 1, bitrate });
		const frame = 1024;
		for (let i = 0; i < samples.length; i += frame) {
			const part = samples.slice(i, Math.min(i + frame, samples.length));
			enc.encode(new AudioData({ format: 'f32', sampleRate, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((i / sampleRate) * 1e6), data: part }));
		}
		await enc.flush();
	} catch {
		failed = true;
	} finally {
		try {
			enc.close();
		} catch {
			/* already closed by an error */
		}
	}
	return failed || !packets.length ? null : { packets, config };
}

const measured = new Map<number, Promise<number | null>>();

/**
 * The encoder's real delay at `sampleRate`, in 48 kHz samples: a click encoded at a known sample, decoded back, found.
 * Cached per rate; null where it cannot be measured (the caller then uses the encoder's reported value).
 */
export function measureOpusDelay(sampleRate: number): Promise<number | null> {
	let p = measured.get(sampleRate);
	if (!p) {
		p = (async () => {
			if (!hasCodecs()) return null;
			const at = Math.round(sampleRate * 0.1);
			const probe = new Float32Array(Math.round(sampleRate * 0.25));
			probe[at] = 0.9;
			const encoded = await encodePackets(probe, sampleRate, 64000);
			if (!encoded) return null;
			const out: Float32Array[] = [];
			let rate = 48000;
			let failed = false;
			const dec = new AudioDecoder({
				output: (data) => {
					rate = data.sampleRate;
					const buf = new Float32Array(data.numberOfFrames);
					data.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
					out.push(buf);
					data.close();
				},
				error: () => {
					failed = true;
				},
			});
			try {
				// NO description: given the encoder's OpusHead, Chromium's decoder trims the pre-skip it states, and the click
				// then reads early. Told nothing, every decoder hands back the packets' real delay.
				dec.configure({ codec: 'opus', sampleRate: encoded.config?.sampleRate ?? sampleRate, numberOfChannels: 1 });
				let ts = 0;
				for (const { data } of encoded.packets) {
					dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: ts, data }));
					ts += 20000;
				}
				await dec.flush();
				dec.close();
			} catch {
				return null;
			}
			if (failed) return null;
			let peak = 0;
			let where = -1;
			let i = 0;
			for (const buf of out) {
				for (let k = 0; k < buf.length; k++, i++) {
					const a = Math.abs(buf[k]);
					if (a > peak) {
						peak = a;
						where = i;
					}
				}
			}
			if (where < 0 || peak < 0.05) return null;
			const delay = Math.round(((where - (at * rate) / sampleRate) * 48000) / rate);
			return delay >= 0 && delay < 4800 ? delay : null;
		})();
		measured.set(sampleRate, p);
	}
	return p;
}

/**
 * Mono speech samples to an Ogg Opus file that every engine's decodeAudioData plays at the original length. Pads the
 * encoder's flush with silence so its lookahead releases all of the speech, then trims the file back to the speech.
 * Resolves null where the page has no Opus encoder.
 */
export async function encodeOpus(samples: Float32Array, sampleRate: number, { bitrate = 64000 }: OpusOptions = {}): Promise<Uint8Array | null> {
	if (!hasCodecs() || !samples.length) return null;
	try {
		const support = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate, numberOfChannels: 1, bitrate });
		if (!support.supported) return null;
	} catch {
		return null;
	}
	const delay = await measureOpusDelay(sampleRate);
	const padded = new Float32Array(samples.length + Math.ceil(sampleRate * 0.03));
	padded.set(samples);
	const encoded = await encodePackets(padded, sampleRate, bitrate);
	if (!encoded) return null;
	const preSkip = delay ?? 312;
	return muxOggOpus({ packets: encoded.packets, preSkip, inputSampleRate: sampleRate, length: Math.round((samples.length * 48000) / sampleRate) });
}

/** Mono samples out of a 16-bit PCM WAV (what the Gemini and Kokoro rungs hand back), or null for anything else. */
export function samplesFromWav(bytes: ArrayBuffer): { samples: Float32Array; sampleRate: number } | null {
	const v = new DataView(bytes);
	const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
	if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
	let at = 12;
	let rate = 0;
	let channels = 0;
	let bits = 0;
	let format = 0;
	while (at + 8 <= bytes.byteLength) {
		const id = tag(at);
		const size = v.getUint32(at + 4, true);
		const body = at + 8;
		if (id === 'fmt ') {
			format = v.getUint16(body, true);
			channels = v.getUint16(body + 2, true);
			rate = v.getUint32(body + 4, true);
			bits = v.getUint16(body + 14, true);
		} else if (id === 'data') {
			if (format !== 1 || bits !== 16 || !channels || !rate) return null;
			const frames = Math.floor(Math.min(size, bytes.byteLength - body) / (2 * channels));
			const samples = new Float32Array(frames);
			for (let i = 0; i < frames; i++) {
				let sum = 0;
				for (let c = 0; c < channels; c++) sum += v.getInt16(body + (i * channels + c) * 2, true);
				samples[i] = sum / channels / 32768;
			}
			return { samples, sampleRate: rate };
		}
		at = body + size + (size & 1);
	}
	return null;
}
