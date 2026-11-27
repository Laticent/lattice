// @vitest-environment node
// Suono's Ogg Opus writer (ogg-opus.ts), which narration storage uses (engineering/decisions/2026-11-17-narration-codec-bakeoff.md).
//
// The CRC and the page layout are checked against a file ffmpeg wrote (docs/scripts/ios-safari/codec-fixtures/opus.ogg):
// if this reader validates every page of THAT file, the CRC is Ogg's, not merely self-consistent. Then the writer's own
// output is read back: headers, packets, granule positions, the end trim and the page limits. Whether every engine DECODES
// the output with 0 ms of lead-in is a browser question; the codec probe and the Playwright self-test answer it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { muxOggOpus, opusHead, opusPacketSamples, preSkipFromDescription, readOggPages } from './ogg-opus';

const FIXTURE = fileURLToPath(new URL('../../../scripts/ios-safari/codec-fixtures/opus.ogg', import.meta.url));
const fixture = () => new Uint8Array(readFileSync(FIXTURE));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const ascii = (b: Uint8Array) => String.fromCharCode(...b.subarray(0, 8));

/** A packet of `len` bytes whose TOC byte says one 20 ms CELT frame (config 31, code 0): 960 samples at 48 kHz. */
const pkt20 = (len: number, fill = 7) => {
	const b = new Uint8Array(len).fill(fill);
	b[0] = 0xf8;
	return b;
};

describe('opusPacketSamples', () => {
	it("reads a packet's 48 kHz length from its TOC byte (RFC 6716 §3.1)", () => {
		expect(opusPacketSamples(Uint8Array.of(0xf8))).toBe(960); // CELT 20 ms, one frame
		expect(opusPacketSamples(Uint8Array.of(0xf9))).toBe(1920); // CELT 20 ms, code 1: two frames
		expect(opusPacketSamples(Uint8Array.of(16 << 3))).toBe(120); // CELT 2.5 ms
		expect(opusPacketSamples(Uint8Array.of(3 << 3))).toBe(2880); // SILK 60 ms
		expect(opusPacketSamples(Uint8Array.of(13 << 3))).toBe(960); // Hybrid 20 ms
		expect(opusPacketSamples(Uint8Array.of((1 << 3) | 3, 3))).toBe(3 * 960); // SILK 20 ms, code 3, 3 frames
		expect(opusPacketSamples(new Uint8Array(0))).toBe(0);
	});
});

describe('readOggPages', () => {
	it("validates every page of an ffmpeg-written Ogg Opus file, so the CRC is Ogg's", () => {
		const pages = readOggPages(fixture());
		expect(pages.length).toBeGreaterThanOrEqual(3);
		expect(pages.map((p) => p.crcOk)).toEqual(pages.map(() => true));
		expect(ascii(pages[0].packets[0])).toBe('OpusHead');
		expect(ascii(pages[1].packets[0])).toBe('OpusTags');
		expect(pages[0].type & 0x02).toBe(0x02); // beginning-of-stream
		expect(pages.at(-1)!.type & 0x04).toBe(0x04); // end-of-stream
	});
});

describe('muxOggOpus', () => {
	it("rewrites ffmpeg's packets so they read back identical, with valid CRCs and the same pre-skip", () => {
		const src = readOggPages(fixture());
		const preSkip = preSkipFromDescription(src[0].packets[0]);
		expect(preSkip).toBeGreaterThan(0);
		const audio = src.slice(2).flatMap((p) => p.packets);
		const length = Number(src.at(-1)!.granule) - preSkip!;
		const pages = readOggPages(muxOggOpus({ packets: audio.map((data) => ({ data })), preSkip: preSkip!, length, inputSampleRate: 24000 }));
		expect(pages.every((p) => p.crcOk)).toBe(true);
		expect(pages.slice(2).flatMap((p) => p.packets.map(hex))).toEqual(audio.map(hex));
		expect(preSkipFromDescription(pages[0].packets[0])).toBe(preSkip);
		expect(Number(pages.at(-1)!.granule)).toBe(preSkip! + length); // the end padding trimmed to the original length
	});

	it('counts granule positions as the samples the packets decode to, like ffmpeg, and only grows them', () => {
		const pages = readOggPages(muxOggOpus({ packets: Array.from({ length: 120 }, (_, i) => ({ data: pkt20(60, i) })), preSkip: 312 }));
		const audio = pages.slice(2);
		expect(audio.length).toBeGreaterThanOrEqual(3); // 2.4 s of 20 ms packets: several one-second pages
		const granules = audio.map((p) => Number(p.granule));
		for (let i = 1; i < granules.length; i++) expect(granules[i]).toBeGreaterThan(granules[i - 1]);
		expect(granules.at(-1)).toBe(120 * 960); // no length given: every packet's samples
		let seen = 0;
		for (const p of audio.slice(0, -1)) {
			seen += p.packets.length * 960;
			// each page ends at the samples its completed packets decode to; pre-skip is inside them, not added on top
			expect(Number(p.granule)).toBe(seen);
		}
		expect(pages.map((p) => p.sequence)).toEqual(pages.map((_, i) => i));
	});

	it('never puts more than 255 segments on a page, and keeps the terminating 0 of a multiple-of-255 packet', () => {
		const big = Array.from({ length: 40 }, () => ({ data: pkt20(1275) })); // 6 segments each
		const edge = { data: pkt20(510, 9) }; // exactly 2 x 255: lacing 255, 255, 0
		const pages = readOggPages(muxOggOpus({ packets: [...big, edge] }));
		expect(pages.every((p) => p.crcOk)).toBe(true);
		const back = pages.slice(2).flatMap((p) => p.packets);
		expect(back).toHaveLength(41);
		expect(back.at(-1)!.length).toBe(510);
		expect(back.slice(0, 40).every((p) => p.length === 1275)).toBe(true);
	});

	it('keeps the granule from shrinking when the end trim reaches back past the last page boundary', () => {
		// 51 packets of 960 samples: one full 50-packet page (48,000), then one packet. A trim to 47,000 + 312 ends BEFORE
		// that first page's 48,000, so the writer used to close the page anyway and write a last granule smaller than the one
		// before it (0, 0, 48000, 47312). The packets past the trim now stay on the last page.
		for (const length of [47_000, 46_600, 48_500]) {
			const pages = readOggPages(muxOggOpus({ packets: Array.from({ length: 51 }, (_, i) => ({ data: pkt20(40, i) })), preSkip: 312, length }));
			const granules = pages.slice(2).map((p) => Number(p.granule));
			for (let i = 1; i < granules.length; i++) expect(granules[i], `granules ${granules} at length ${length}`).toBeGreaterThanOrEqual(granules[i - 1]);
			expect(granules.at(-1)).toBe(312 + length);
			expect(pages.slice(2).flatMap((p) => p.packets)).toHaveLength(51); // nothing dropped
			expect(pages.every((p) => p.crcOk)).toBe(true);
		}
	});

	it('never claims more audio than was encoded when trimming the end', () => {
		const pages = readOggPages(muxOggOpus({ packets: Array.from({ length: 5 }, () => ({ data: pkt20(40) })), preSkip: 312, length: 999999 }));
		expect(Number(pages.at(-1)!.granule)).toBe(5 * 960);
	});

	it("writes the same page granules as ffmpeg for ffmpeg's own packets", () => {
		const src = readOggPages(fixture());
		const preSkip = preSkipFromDescription(src[0].packets[0])!;
		const audio = src.slice(2).flatMap((p) => p.packets);
		const ours = readOggPages(muxOggOpus({ packets: audio.map((data) => ({ data })), preSkip, length: Number(src.at(-1)!.granule) - preSkip }));
		expect(ours.slice(2).map((p) => Number(p.granule))).toEqual(src.slice(2).map((p) => Number(p.granule)));
	});

	it('reads no pre-skip from a description that is not an OpusHead, and refuses no packets', () => {
		expect(preSkipFromDescription(new Uint8Array(4))).toBeNull();
		expect(preSkipFromDescription(null)).toBeNull();
		const head = opusHead({ preSkip: 3840 });
		expect(preSkipFromDescription(head)).toBe(3840); // a view
		expect(preSkipFromDescription(head.slice().buffer as ArrayBuffer)).toBe(3840); // a plain ArrayBuffer
		expect(() => muxOggOpus({ packets: [] })).toThrow(/no packets/);
	});
});
