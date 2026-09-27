/**
 * Unit: `lib/export/tx3g.mjs`, the MP4's tx3g caption track.
 *
 * The integration test (`test/integration/export/video-export.test.js`) reads the track back out of
 * a real capture. This file pins the edges a capture rarely reaches: overlapping and out-of-range
 * cues, an empty cue list, text past the 16-bit length field, and both ways the track can be added
 * to a file (over a trailing `moov`, or after a `moov` that is not last).
 */

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

let T;
before(async () => {
	T = await import(path.resolve(__dirname, '../../../lib/export/tx3g.mjs'));
});

const cue = (startMs, playedMs, text = `at ${startMs}`) => ({ startMs, playedMs, text });

test('samples tile the video: empty gaps, text while each cue plays', () => {
	assert.deepEqual(T.tx3gSamples([cue(1000, 500, 'a'), cue(2000, 250.4, 'b')], 3000), [
		{ startMs: 0, durMs: 1000, text: null },
		{ startMs: 1000, durMs: 500, text: 'a' },
		{ startMs: 1500, durMs: 500, text: null },
		{ startMs: 2000, durMs: 250, text: 'b' },
		{ startMs: 2250, durMs: 750, text: null },
	]);
});

test('a cue that overruns the next is cut at its start; one past the end at the end', () => {
	const s = T.tx3gSamples([cue(0, 900, 'a'), cue(600, 5000, 'b')], 1000);
	assert.deepEqual(s, [{ startMs: 0, durMs: 600, text: 'a' }, { startMs: 600, durMs: 400, text: 'b' }]);
});

test('no cues still makes one empty sample the length of the video', () => {
	assert.deepEqual(T.tx3gSamples([], 1234), [{ startMs: 0, durMs: 1234, text: null }]);
});

test('a zero-length cue and one past the end leave no sample', () => {
	const s = T.tx3gSamples([cue(100, 0, 'z'), cue(5000, 100, 'late')], 1000);
	assert.deepEqual(s, [{ startMs: 0, durMs: 1000, text: null }]);
});

test('payloads: a 16-bit length then plain UTF-8, one line, clipped on a character boundary', () => {
	const [empty, text, long] = T.tx3gPayloads([{ text: null }, { text: 'Q3 <FY26> & “more”\n next' }, { text: 'é'.repeat(40000) }]);
	assert.deepEqual([...empty], [0, 0]);
	assert.equal(text.readUInt16BE(0), text.length - 2);
	assert.equal(text.subarray(2).toString('utf8'), 'Q3 <FY26> & “more” next', 'no escaping and no line break');
	assert.ok(long.length - 2 <= 0xffff, 'fits the length field');
	assert.equal(long.readUInt16BE(0), long.length - 2);
	assert.ok(!long.subarray(2).toString('utf8').includes('�'), 'no split character');
});

/** A minimal MP4 shell: ftyp, an mdat of `media` bytes, and a moov holding only an mvhd. */
function shell({ moovLast = true, timescale = 600, nextTrack = 3, v1 = false } = {}) {
	const n = v1 ? 120 : 108;
	const mvhd = Buffer.alloc(n);
	mvhd.writeUInt32BE(n, 0);
	mvhd.write('mvhd', 4, 'latin1');
	mvhd[8] = v1 ? 1 : 0;
	mvhd.writeUInt32BE(timescale, v1 ? 28 : 20);
	mvhd.writeUInt32BE(nextTrack, n - 4);
	const moov = Buffer.concat([Buffer.from([0, 0, 0, 8 + n]), Buffer.from('moov'), mvhd]);
	const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom'), Buffer.alloc(4)]);
	const mdat = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from('mdat'), Buffer.from('PICT')]);
	return moovLast ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat]);
}

function tops(buf) {
	const out = [];
	for (let at = 0; at < buf.length; at += buf.readUInt32BE(at)) out.push(buf.toString('latin1', at + 4, at + 8));
	return out;
}

for (const [moovLast, v1] of [[true, false], [false, false], [true, true]]) {
	test(`addTx3gTrack ${moovLast ? 'replaces a trailing moov' : 'frees a moov that is not last and appends'}${v1 ? ' (version-1 mvhd)' : ''}`, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx3g-'));
		try {
			const file = path.join(dir, 'a.mp4');
			const before = shell({ moovLast, v1 });
			fs.writeFileSync(file, before);
			const r = T.addTx3gTrack(file, { cues: [cue(500, 1000, 'hello')], durationMs: 2000 });
			const after = fs.readFileSync(file);
			assert.deepEqual(r, { trackId: 3, samples: 3, bytes: 2 + 7 + 2 });
			assert.deepEqual(tops(after), moovLast ? ['ftyp', 'mdat', 'mdat', 'moov'] : ['ftyp', 'free', 'mdat', 'mdat', 'moov']);
			assert.ok(after.includes(Buffer.from('PICT')) && after.indexOf('PICT') === before.indexOf('PICT'), 'existing media did not move');
			const moovAt = after.lastIndexOf('moov') - 4;
			assert.equal(after.readUInt32BE(moovAt), after.length - moovAt, 'moov size covers the new trak');
			assert.equal(after.readUInt32BE(moovAt + 8 + (v1 ? 116 : 104)), 4, 'next_track_ID moves past the new track');
			// The stco points at the caption bytes: `00 05 hello`.
			const stco = after.lastIndexOf('stco');
			const off = after.readUInt32BE(stco + 12);
			assert.equal(after.toString('latin1', off, off + 2 + 2 + 5 + 2), '\0\0\0\u0005hello\0\0');
			// The track's duration is in the movie's timescale (600): 2 s.
			const tkhd = after.lastIndexOf('tkhd');
			assert.equal(after.readUInt32BE(tkhd + 4 + 20), 1200);
			assert.equal(after.toString('latin1', after.lastIndexOf('hdlr') + 12, after.lastIndexOf('hdlr') + 16), 'sbtl');
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}

test('addTx3gTrack refuses a file with no moov, and leaves it as it was', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx3g-'));
	try {
		const file = path.join(dir, 'a.mp4');
		const buf = shell().subarray(0, 28);
		fs.writeFileSync(file, buf);
		assert.throws(() => T.addTx3gTrack(file, { cues: [], durationMs: 10 }), /no moov/);
		assert.deepEqual(fs.readFileSync(file), buf);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

/** The first box of `type` inside `buf`, as its body (after the 8-byte header). */
const bodyOf = (buf, type) => {
	const at = buf.indexOf(Buffer.from(type, 'latin1')) - 4;
	return buf.subarray(at + 8, at + buf.readUInt32BE(at));
};

test('the sample entry is FFmpeg mov_text\'s own bytes, and the track is off until picked', () => {
	const trak = T.tx3gTrak({ trackId: 3, samples: [{ startMs: 0, durMs: 1000, text: null }], sizes: [2], offset: 100, movieTimescale: 1000 });
	// FFmpeg 7.0.2, `-c:s mov_text` into MP4: the tx3g body up to and including its ftab ("Arial").
	assert.equal(bodyOf(trak, 'tx3g').toString('hex'), `${'00000000000000010000000001ff000000ff00000000000000000000000000010010ffffffff'}00000012667461620001000105417269616c`);
	const tkhd = bodyOf(trak, 'tkhd');
	assert.equal(tkhd.readUInt32BE(0), 2, 'version 0, flags 2: in the movie but not enabled, so it is off until picked');
	assert.equal(tkhd.readUInt16BE(34), 3, 'alternate group 3');
	assert.equal(bodyOf(trak, 'mdhd').readUInt16BE(20), 0x15c7, "language 'eng'");
	assert.equal(bodyOf(T.tx3gTrak({ trackId: 3, samples: [], sizes: [], offset: 0, movieTimescale: 1, language: 'EN' }), 'mdhd').readUInt16BE(20), 0x55c4, "an invalid code is 'und'");
});

test('a caption chunk past 4 GiB gets a 64-bit offset', () => {
	const trak = T.tx3gTrak({ trackId: 3, samples: [{ startMs: 0, durMs: 10, text: null }], sizes: [2], offset: 2 ** 32 + 5, movieTimescale: 1000 });
	assert.equal(trak.indexOf('stco'), -1);
	assert.equal(bodyOf(trak, 'co64').readBigUInt64BE(8), BigInt(2 ** 32 + 5));
});

test('a zero-size box inside moov is refused, not looped on', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx3g-'));
	try {
		const file = path.join(dir, 'a.mp4');
		const bad = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('moov'), Buffer.from([0, 0, 0, 0]), Buffer.from('udta')]);
		fs.writeFileSync(file, bad);
		assert.throws(() => T.addTx3gTrack(file, { cues: [], durationMs: 10 }), /malformed box in moov/);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('a suggested style lands in the sample entry: colors, bold, font', () => {
	const trak = T.tx3gTrak({ trackId: 3, samples: [], sizes: [], offset: 0, movieTimescale: 1000, style: { text: [10, 22, 40, 255], background: [0, 29, 51, 184], bold: true, font: 'Avenir Next' } });
	const e = bodyOf(trak, 'tx3g');
	assert.deepEqual([...e.subarray(14, 18)], [0, 29, 51, 184], 'background-color-rgba');
	assert.equal(e[32], 1, 'bold face flag');
	assert.deepEqual([...e.subarray(34, 38)], [10, 22, 40, 255], 'text-color-rgba');
	assert.ok(e.includes(Buffer.from('Avenir Next')), 'font name in ftab');
});
