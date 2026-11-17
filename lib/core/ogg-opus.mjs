/**
 * lib/core/ogg-opus.mjs — Opus packets into a standard Ogg file (RFC 7845), and Ogg pages back out.
 *
 * WHY. Narration is kept compressed in browser storage as Opus (engineering/decisions/2026-11-17-narration-codec-bakeoff.md).
 * WebCodecs' AudioEncoder hands back raw Opus packets; this wraps them in Ogg so every engine's decodeAudioData plays the
 * clip, and trims the codec's lead-in itself: the bake-off measured 0 ms added from Ogg in Chromium, WebKit, Firefox and
 * iPhone Safari, where raw packets through AudioDecoder came back 14 ms long.
 *
 * WHAT IT WRITES. Page 0 holds the ID header (OpusHead: version 1, channel count, pre-skip, the input sample rate, gain 0,
 * channel mapping family 0) and is marked beginning-of-stream. Page 1 holds the comment header (OpusTags: a vendor string, no
 * comments). The audio pages follow, each closed after about one second of packets or before its segment table would pass
 * 255 entries. A page's granule position is the 48 kHz sample count at the end of its last packet, pre-skip included, and
 * the last page, marked end-of-stream, may carry a smaller granule: the original length plus pre-skip, which tells the
 * decoder to drop the encoder's padding at the end (RFC 7845 §4).
 *
 * A LEAF: pure, no imports, no I/O, so the Studio, its workers and the CLI share one implementation (HARD RULE #1).
 */

/** Ogg's CRC-32: polynomial 0x04C11DB7, initial value 0, no reflection, no final XOR (RFC 3533 §6). */
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let r = i << 24;
		for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
		t[i] = r >>> 0;
	}
	return t;
})();

/** @param {Uint8Array} bytes */
export function oggCrc(bytes) {
	let crc = 0;
	for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
	return crc >>> 0;
}

/** Opus's usual encoder lookahead at 48 kHz (libopus: 3.5 ms plus its delay compensation), used when the encoder reports none. */
export const DEFAULT_PRE_SKIP = 312;

/** About one second of audio per page: small enough to stream, large enough that page headers stay a rounding error. */
const PAGE_SAMPLES = 48000;

const HEADER_TYPE = { continued: 0x01, bos: 0x02, eos: 0x04 };

/**
 * One Ogg page. `packets` are whole packets that end on this page (this writer never splits a packet across pages).
 * @param {{ packets: Uint8Array[], granule: bigint, serial: number, sequence: number, type: number }} p
 */
function page({ packets, granule, serial, sequence, type }) {
	const lacing = [];
	for (const pkt of packets) {
		let n = pkt.length;
		while (n >= 255) {
			lacing.push(255);
			n -= 255;
		}
		lacing.push(n); // a packet of a multiple of 255 bytes ends with a 0
	}
	if (lacing.length > 255) throw new Error(`an Ogg page holds at most 255 segments, got ${lacing.length}`);
	const body = packets.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(27 + lacing.length + body);
	const v = new DataView(out.buffer);
	out.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
	out[4] = 0; // stream structure version
	out[5] = type;
	v.setBigInt64(6, granule, true);
	v.setUint32(14, serial >>> 0, true);
	v.setUint32(18, sequence >>> 0, true);
	// 22..25 is the CRC, zero while it is computed
	out[26] = lacing.length;
	out.set(lacing, 27);
	let at = 27 + lacing.length;
	for (const pkt of packets) {
		out.set(pkt, at);
		at += pkt.length;
	}
	v.setUint32(22, oggCrc(out), true);
	return out;
}

/** The Opus ID header (RFC 7845 §5.1). */
export function opusHead({ channels = 1, preSkip = DEFAULT_PRE_SKIP, inputSampleRate = 48000 } = {}) {
	const b = new Uint8Array(19);
	const v = new DataView(b.buffer);
	b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
	b[8] = 1; // version
	b[9] = channels;
	v.setUint16(10, preSkip, true);
	v.setUint32(12, inputSampleRate, true);
	v.setInt16(16, 0, true); // output gain
	b[18] = 0; // channel mapping family 0: mono or stereo
	return b;
}

/** The Opus comment header (RFC 7845 §5.2): a vendor string and no comments. */
function opusTags(vendor) {
	const name = new TextEncoder().encode(vendor);
	const b = new Uint8Array(8 + 4 + name.length + 4);
	const v = new DataView(b.buffer);
	b.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
	v.setUint32(8, name.length, true);
	b.set(name, 12);
	v.setUint32(12 + name.length, 0, true);
	return b;
}

/**
 * The pre-skip an encoder reported, read from an OpusHead (WebCodecs puts one in `decoderConfig.description` when it gives a
 * description). Anything else returns null, and the caller uses DEFAULT_PRE_SKIP.
 * @param {ArrayBuffer | ArrayBufferView | null | undefined} description
 */
export function preSkipFromDescription(description) {
	if (!description) return null;
	const b = description instanceof ArrayBuffer ? new Uint8Array(description) : new Uint8Array(description.buffer, description.byteOffset, description.byteLength);
	if (b.length < 19 || String.fromCharCode(...b.subarray(0, 8)) !== 'OpusHead') return null;
	return b[10] | (b[11] << 8);
}

/**
 * The 48 kHz samples an Opus packet decodes to, read from its own TOC byte (RFC 6716 §3.1), so a page's granule position
 * never depends on the encoder's metadata. An encoder's `duration` is not reliable for this: trusting it made Linux
 * WebKit's decoder (GStreamer) cut 125 ms to a whole second off a clip, because the granule positions did not match the
 * audio. Bits 7-3 are the configuration (frame size), bits 1-0 the frame-count code. Returns 0 for an empty packet.
 * @param {Uint8Array} data
 */
export function opusPacketSamples(data) {
	if (!data?.length) return 0;
	const config = data[0] >> 3;
	// Frame sizes in units of 2.5 ms (120 samples at 48 kHz). SILK 0-11 cycle 10/20/40/60 ms, Hybrid 12-15 cycle 10/20 ms,
	// CELT 16-31 cycle 2.5/5/10/20 ms.
	const units = config < 12 ? [4, 8, 16, 24][config % 4] : config < 16 ? [4, 8][config % 2] : [1, 2, 4, 8][config % 4];
	const code = data[0] & 0x03;
	const frames = code === 0 ? 1 : code === 3 ? (data.length > 1 ? data[1] & 0x3f : 0) : 2;
	return frames * units * 120;
}

/**
 * Opus packets into an Ogg Opus file.
 * @param {{
 *   packets: { data: Uint8Array, samples?: number }[],  // each packet; its 48 kHz samples are read from its TOC byte
 *   channels?: number,
 *   preSkip?: number,             // the encoder's lookahead, 48 kHz samples
 *   inputSampleRate?: number,     // informational: the rate the audio was recorded at
 *   length?: number,              // the original audio's length in 48 kHz samples; trims the encoder's end padding
 *   serial?: number,
 *   vendor?: string,
 * }} o
 * @returns {Uint8Array}
 */
export function muxOggOpus({ packets, channels = 1, preSkip = DEFAULT_PRE_SKIP, inputSampleRate = 48000, length, serial = 0x4c617474, vendor = 'Lattice' }) {
	if (!packets?.length) throw new Error('muxOggOpus: no packets');
	const pages = [];
	let sequence = 0;
	pages.push(page({ packets: [opusHead({ channels, preSkip, inputSampleRate })], granule: 0n, serial, sequence: sequence++, type: HEADER_TYPE.bos }));
	pages.push(page({ packets: [opusTags(vendor)], granule: 0n, serial, sequence: sequence++, type: 0 }));
	let granule = BigInt(preSkip);
	let held = [];
	let heldSegments = 0;
	let heldSamples = 0;
	const sized = packets.map((p) => ({ data: p.data, samples: opusPacketSamples(p.data) }));
	const total = sized.reduce((n, p) => n + p.samples, 0);
	const flush = (last) => {
		let g = granule;
		// The last page may end before the encoder's padding: original length plus pre-skip, never past what was encoded.
		if (last && Number.isFinite(length) && length > 0) g = BigInt(Math.min(preSkip + Math.round(length), preSkip + total));
		pages.push(page({ packets: held, granule: g, serial, sequence: sequence++, type: last ? HEADER_TYPE.eos : 0 }));
		held = [];
		heldSegments = 0;
		heldSamples = 0;
	};
	for (let i = 0; i < sized.length; i++) {
		const { data, samples } = sized[i];
		const segments = Math.floor(data.length / 255) + 1;
		if (held.length && (heldSegments + segments > 255 || heldSamples >= PAGE_SAMPLES)) flush(false);
		held.push(data);
		heldSegments += segments;
		heldSamples += samples;
		granule += BigInt(samples);
	}
	flush(true);
	const size = pages.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(size);
	let at = 0;
	for (const p of pages) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/**
 * Ogg pages back out, each with its packets reassembled and its CRC checked: what the tests read the writer's output with,
 * and what a reader of a stored clip can use to find its length (the last page's granule minus pre-skip).
 * @param {Uint8Array} bytes
 * @returns {{ type: number, granule: bigint, serial: number, sequence: number, crcOk: boolean, packets: Uint8Array[] }[]}
 */
export function readOggPages(bytes) {
	const pages = [];
	let at = 0;
	let partial = null;
	while (at + 27 <= bytes.length) {
		if (bytes[at] !== 0x4f || bytes[at + 1] !== 0x67 || bytes[at + 2] !== 0x67 || bytes[at + 3] !== 0x53) throw new Error(`no Ogg page at byte ${at}`);
		const v = new DataView(bytes.buffer, bytes.byteOffset + at);
		const n = bytes[at + 26];
		const lacing = bytes.subarray(at + 27, at + 27 + n);
		const bodyLen = lacing.reduce((s, x) => s + x, 0);
		const end = at + 27 + n + bodyLen;
		if (end > bytes.length) throw new Error(`a truncated Ogg page at byte ${at}`);
		const raw = bytes.slice(at, end);
		const stored = new DataView(raw.buffer).getUint32(22, true);
		raw.fill(0, 22, 26);
		const packets = [];
		let off = at + 27 + n;
		let cur = partial ? [partial] : [];
		partial = null;
		for (const len of lacing) {
			cur.push(bytes.subarray(off, off + len));
			off += len;
			if (len < 255) {
				const size = cur.reduce((s, c) => s + c.length, 0);
				const pkt = new Uint8Array(size);
				let p = 0;
				for (const c of cur) {
					pkt.set(c, p);
					p += c.length;
				}
				packets.push(pkt);
				cur = [];
			}
		}
		if (cur.length) {
			const size = cur.reduce((s, c) => s + c.length, 0);
			partial = new Uint8Array(size);
			let p = 0;
			for (const c of cur) {
				partial.set(c, p);
				p += c.length;
			}
		}
		pages.push({ type: bytes[at + 5], granule: v.getBigInt64(6, true), serial: v.getUint32(14, true), sequence: v.getUint32(18, true), crcOk: oggCrc(raw) === stored, packets });
		at = end;
	}
	return pages;
}
