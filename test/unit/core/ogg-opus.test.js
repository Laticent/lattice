// lib/core/ogg-opus.mjs — the Ogg Opus writer narration storage uses (engineering/decisions/2026-11-17-narration-codec-bakeoff.md).
//
// The CRC and the page layout are checked against a file ffmpeg wrote (docs/scripts/ios-safari/codec-fixtures/opus.ogg):
// if this reader validates every page of THAT file, the CRC is Ogg's, not merely self-consistent. Then the writer's own
// output is read back: headers, packets, granule positions, the end trim and the page limits. Whether every engine DECODES
// the output with 0 ms of lead-in is a browser question; the codec probe and the Playwright self-test answer it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const FIXTURE = path.join(ROOT, 'docs/scripts/ios-safari/codec-fixtures/opus.ogg');
const load = () => import('../../../lib/core/ogg-opus.mjs');

/** A packet of `len` bytes whose TOC byte says one 20 ms CELT frame (config 31, code 0): 960 samples at 48 kHz. */
const pkt20 = (len, fill = 7) => {
	const b = new Uint8Array(len).fill(fill);
	b[0] = 0xf8;
	return b;
};

test('a packet\'s 48 kHz length is read from its TOC byte (RFC 6716 §3.1)', async () => {
	const { opusPacketSamples } = await load();
	assert.equal(opusPacketSamples(Uint8Array.of(0xf8)), 960, 'CELT 20 ms, one frame');
	assert.equal(opusPacketSamples(Uint8Array.of(0xf9)), 1920, 'CELT 20 ms, code 1: two frames');
	assert.equal(opusPacketSamples(Uint8Array.of((16 << 3) | 0)), 120, 'CELT 2.5 ms');
	assert.equal(opusPacketSamples(Uint8Array.of((3 << 3) | 0)), 2880, 'SILK 60 ms');
	assert.equal(opusPacketSamples(Uint8Array.of((13 << 3) | 0)), 960, 'Hybrid 20 ms');
	assert.equal(opusPacketSamples(Uint8Array.of((1 << 3) | 3, 3)), 3 * 960, 'SILK 20 ms, code 3 with 3 frames');
	assert.equal(opusPacketSamples(new Uint8Array(0)), 0);
});

test('the reader validates every page of an ffmpeg-written Ogg Opus file, so the CRC is Ogg\'s', async () => {
	const { readOggPages } = await load();
	const pages = readOggPages(new Uint8Array(fs.readFileSync(FIXTURE)));
	assert.ok(pages.length >= 3, `expected header pages and audio, got ${pages.length} pages`);
	assert.deepEqual(
		pages.map((p) => p.crcOk),
		pages.map(() => true),
	);
	assert.equal(String.fromCharCode(...pages[0].packets[0].subarray(0, 8)), 'OpusHead');
	assert.equal(String.fromCharCode(...pages[1].packets[0].subarray(0, 8)), 'OpusTags');
	assert.equal(pages[0].type & 0x02, 0x02, 'the first page is marked beginning-of-stream');
	assert.equal(pages.at(-1).type & 0x04, 0x04, 'the last page is marked end-of-stream');
});

test('ffmpeg\'s packets, rewritten by the writer, read back identical with valid CRCs', async () => {
	const { readOggPages, muxOggOpus, preSkipFromDescription } = await load();
	const src = readOggPages(new Uint8Array(fs.readFileSync(FIXTURE)));
	const head = src[0].packets[0];
	const preSkip = preSkipFromDescription(head);
	assert.ok(preSkip > 0, 'ffmpeg wrote a pre-skip');
	const audio = src.slice(2).flatMap((p) => p.packets);
	const length = Number(src.at(-1).granule) - preSkip;
	const out = muxOggOpus({ packets: audio.map((data) => ({ data })), preSkip, length, inputSampleRate: 24000 });
	const pages = readOggPages(out);
	assert.ok(pages.every((p) => p.crcOk), 'every page the writer made has a valid CRC');
	assert.deepEqual(
		pages.slice(2).flatMap((p) => p.packets.map((x) => Buffer.from(x).toString('hex'))),
		audio.map((x) => Buffer.from(x).toString('hex')),
	);
	assert.equal(preSkipFromDescription(pages[0].packets[0]), preSkip);
	assert.equal(Number(pages.at(-1).granule), preSkip + length, 'the last granule trims the end padding to the original length');
});

test('granule positions count 48 kHz samples from the start, pre-skip included, and only grow', async () => {
	const { readOggPages, muxOggOpus } = await load();
	const packets = Array.from({ length: 120 }, (_, i) => ({ data: pkt20(60, i) }));
	const pages = readOggPages(muxOggOpus({ packets, preSkip: 312 }));
	const audio = pages.slice(2);
	assert.ok(audio.length >= 3, `120 packets of 20 ms span about 2.4 s, so several one-second pages, got ${audio.length}`);
	const granules = audio.map((p) => Number(p.granule));
	for (let i = 1; i < granules.length; i++) assert.ok(granules[i] > granules[i - 1], `granules grow: ${granules.join(', ')}`);
	assert.equal(granules.at(-1), 312 + 120 * 960, 'with no length given, the last granule is pre-skip plus every packet');
	let seen = 0;
	for (const p of audio) {
		seen += p.packets.length * 960;
		if (p !== audio.at(-1)) assert.equal(Number(p.granule), 312 + seen, 'each page ends at the samples of the packets it completed');
	}
	assert.deepEqual(
		pages.map((p) => p.sequence),
		pages.map((_, i) => i),
		'page sequence numbers count up from 0',
	);
});

test('a page never holds more than 255 segments, and a packet of a multiple of 255 bytes keeps its terminating 0', async () => {
	const { readOggPages, muxOggOpus } = await load();
	const big = Array.from({ length: 40 }, () => ({ data: pkt20(1275) })); // 6 segments each
	const edge = { data: pkt20(510, 9) }; // exactly 2 x 255: lacing 255, 255, 0
	const pages = readOggPages(muxOggOpus({ packets: [...big, edge] }));
	assert.ok(pages.every((p) => p.crcOk));
	const back = pages.slice(2).flatMap((p) => p.packets);
	assert.equal(back.length, 41);
	assert.equal(back.at(-1).length, 510, 'the 510-byte packet reads back whole, not merged with the next');
	assert.ok(
		back.slice(0, 40).every((p) => p.length === 1275),
		'the 1275-byte packets read back whole',
	);
});

test('the end trim never claims more audio than was encoded', async () => {
	const { readOggPages, muxOggOpus } = await load();
	const packets = Array.from({ length: 5 }, () => ({ data: pkt20(40) }));
	const pages = readOggPages(muxOggOpus({ packets, preSkip: 312, length: 999999 }));
	assert.equal(Number(pages.at(-1).granule), 312 + 5 * 960);
});

test('a description that is not an OpusHead gives no pre-skip, and no packets is an error', async () => {
	const { preSkipFromDescription, muxOggOpus, opusHead } = await load();
	assert.equal(preSkipFromDescription(new Uint8Array(4)), null);
	assert.equal(preSkipFromDescription(null), null);
	assert.equal(preSkipFromDescription(opusHead({ preSkip: 3840 }).buffer), 3840);
	assert.throws(() => muxOggOpus({ packets: [] }), /no packets/);
});
