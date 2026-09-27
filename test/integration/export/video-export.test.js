/**
 * Integration: `lib/export/video.mjs` turns a narrated HTML export into an MP4 whose audio, captions
 * and slides agree with the export's own timing track.
 *
 * The video is a capture of the export's player on a clock the capture owns
 * (engineering/decisions/2026-09-25-video-export.md §3, §9), so this test does what the spike's checks
 * did, on the file the exporter wrote, decoded back independently:
 *
 *   · every voiced caption starts within 12 ms of its clip's sound in the muxed audio (the AAC
 *     encoder's own 21 ms of priming, left uncorrected, fails this);
 *   · every slide change lands on the first frame at or after its time (a capture that noticed a
 *     change a frame late fails this);
 *   · the file carries H.264 video and AAC audio, and lasts as long as the layout;
 *   · its caption track is 3GPP timed text (`tx3g`, the subtitle format QuickTime reads), read
 *     back here box by box, and every caption shows exactly while its cue plays, with the screen
 *     cleared between cues.
 *
 * Two deck shapes. The first exercises the edges the note names: a silent title slide (the lead-in),
 * a silent slide mid-deck (a hold), a cue whose clip will not decode (rule 4: it holds its caption
 * silently), and a cue with no clip at all. The second speaks on its first slide, where the first word
 * sits at the very start of the video. The clips are tones with 40 ms of declared leading silence, at
 * lengths far from Cadenza's estimate, so a capture that ignored `measuredMs` or the lead would miss.
 *
 * Slow tier: one CLI render and two captures, about 30 s.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const FPS = 30;
const FRAME = 1000 / FPS;
const LEAD = 40;
const CHROME = () => process.env.CHROME_PATH || require('puppeteer').executablePath();

/** A mono 24 kHz WAV: `lead` ms of silence, then a 440 Hz tone for `ms`, with 5 ms fades. */
function tone(ms, lead = LEAD, rate = 24000) {
	const n = Math.round((rate * (ms + lead)) / 1000);
	const buf = Buffer.alloc(44 + n * 2);
	buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
	buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
	const l = Math.round((rate * lead) / 1000);
	const fade = Math.round(rate * 0.005);
	for (let i = l; i < n; i++) {
		const env = Math.min(1, (i - l) / fade, (n - 1 - i) / fade);
		buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * (i - l)) / rate) * 12000 * env), 44 + i * 2);
	}
	return `data:audio/wav;base64,${buf.toString('base64')}`;
}
const clip = (audio) => ({ audio, clip: `sha256:${createHash('sha256').update(audio).digest('hex')}`, leadMs: LEAD });

const SOURCE = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# Quarterly review\n\n---\n\n## Revenue grew\n\n- Up nine percent\n\n---\n\n<!-- _class: divider -->\n\n## Outlook\n\n---\n\n## Next quarter\n\n- Hold the margin\n';
let tmp;
let docHtml;
let browser;
let decoder;

before(async () => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-video-test-'));
	fs.writeFileSync(path.join(tmp, 'deck.md'), SOURCE);
	execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), path.join(tmp, 'deck.md'), path.join(tmp, 'deck.html'), '-q'], { stdio: 'pipe' });
	docHtml = fs.readFileSync(path.join(tmp, 'deck.html'), 'utf8');
	browser = await require('puppeteer').launch({ executablePath: CHROME(), headless: true, args: ['--no-sandbox'] });
	decoder = await browser.newPage();
	fs.writeFileSync(path.join(tmp, 'blank.html'), '<!doctype html><title>check</title>');
	await decoder.goto(`file://${path.join(tmp, 'blank.html')}`);
	const mb = path.join(path.dirname(require.resolve('mediabunny')), 'mediabunny.min.cjs');
	await decoder.addScriptTag({ content: `var module={exports:{}},exports=module.exports;${fs.readFileSync(mb, 'utf8')};window.MB=module.exports;` });
});

after(async () => {
	await browser?.close();
	if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * The MP4's subtitle tracks, read box by box without the exporter's code: each track's sample entry
 * type and handler, and for tx3g its samples as `{ startMs, endMs, text }` on a ms clock.
 */
function readSubtitleTracks(buf) {
	const kids = (at, end) => {
		const out = [];
		while (at < end) {
			const size = buf.readUInt32BE(at);
			out.push({ type: buf.toString('latin1', at + 4, at + 8), at, size, body: at + 8 });
			at += size;
		}
		return out;
	};
	const find = (list, type) => list.find((b) => b.type === type);
	const inside = (b) => kids(b.body, b.at + b.size);
	const moov = find(kids(0, buf.length), 'moov');
	const tracks = [];
	for (const trak of inside(moov).filter((b) => b.type === 'trak')) {
		const mdia = find(inside(trak), 'mdia');
		const handler = buf.toString('latin1', find(inside(mdia), 'hdlr').body + 8, find(inside(mdia), 'hdlr').body + 12);
		if (handler === 'vide' || handler === 'soun') continue;
		const mdhd = find(inside(mdia), 'mdhd').body;
		const scale = buf.readUInt32BE(mdhd + 12);
		const stbl = find(inside(find(inside(mdia), 'minf')), 'stbl');
		const t = inside(stbl);
		const entry = buf.toString('latin1', find(t, 'stsd').body + 12, find(t, 'stsd').body + 16);
		const durs = [];
		const stts = find(t, 'stts').body;
		for (let i = 0; i < buf.readUInt32BE(stts + 4); i++) for (let k = 0; k < buf.readUInt32BE(stts + 8 + i * 8); k++) durs.push(buf.readUInt32BE(stts + 12 + i * 8));
		const stsz = find(t, 'stsz').body;
		const sizes = durs.map((_, i) => buf.readUInt32BE(stsz + 12 + i * 4));
		const stsc = find(t, 'stsc').body;
		assert.equal(buf.readUInt32BE(stsc + 4), 1, 'one chunk run');
		let off = buf.readUInt32BE(find(t, 'stco').body + 8);
		let clock = 0;
		const samples = durs.map((d, i) => {
			const n = buf.readUInt16BE(off);
			const s = { startMs: (clock * 1000) / scale, endMs: ((clock + d) * 1000) / scale, text: buf.toString('utf8', off + 2, off + 2 + n) };
			assert.equal(sizes[i], n + 2, 'a sample is its 2-byte length plus its text');
			off += sizes[i];
			clock += d;
			return s;
		});
		tracks.push({ handler, entry, language: buf.readUInt16BE(mdhd + 20), samples });
	}
	return tracks;
}

/** The caption track is tx3g, tiles the whole video, and shows each cue exactly while it plays. */
function assertCaptionTrack(buf, cues, durationMs) {
	const subs = readSubtitleTracks(buf);
	assert.deepEqual(subs.map((s) => `${s.handler}:${s.entry}`), ['sbtl:tx3g'], 'one subtitle track, and it is tx3g');
	const [{ samples, language }] = subs;
	assert.equal(language, ((5 << 10) | (14 << 5) | 7), 'tagged English');
	assert.equal(samples[0].startMs, 0, 'the track starts with the video');
	assert.equal(samples.at(-1).endMs, Math.round(durationMs), 'and ends with it');
	const shown = samples.filter((s) => s.text !== '');
	assert.deepEqual(shown.map((s) => s.text), cues.map((c) => c.text), 'every cue, in order, as plain text');
	shown.forEach((s, n) => {
		assert.equal(s.startMs, Math.round(cues[n].startMs), `cue ${n} shows when it starts`);
		assert.equal(s.endMs, Math.min(Math.round(cues[n].startMs + cues[n].playedMs), Math.round(cues[n + 1]?.startMs ?? Infinity), Math.round(durationMs)), `cue ${n} clears when it ends`);
	});
	for (let n = 1; n < samples.length; n++) assert.ok(samples[n].text !== '' || samples[n - 1].text !== '', 'no two empty samples in a row');
}

/** Export `slides` as a narrated webpage, capture it, and decode the MP4 back independently. */
async function capture(name, slides) {
	const { buildPlayerHtml } = require(path.join(ROOT, 'lib/export/html-player.js'));
	const { exportVideo } = await import(path.join(ROOT, 'lib/export/video.mjs'));
	const { html } = await buildPlayerHtml({ docHtml, source: SOURCE, title: 'Quarterly review', now: 0, narration: { voice: { model: 'test/tone', voice: '440hz', speed: 1 }, slides }, theme: { name: 'indaco', mode: 'dark' } });
	const mp4File = path.join(tmp, `${name}.mp4`);
	const out = await exportVideo({ html, outFile: mp4File, executablePath: CHROME(), fps: FPS, leadInMs: 1000, outroMs: 1000 });
	assert.ok(!fs.existsSync(`${mp4File}.partial`), 'the partial file was renamed into place');
	assertCaptionTrack(fs.readFileSync(mp4File), out.cues, out.report.durationMs);
	const check = await decoder.evaluate(async (b64) => {
		const { Input, ALL_FORMATS, BufferSource, AudioBufferSink, VideoSampleSink } = window.MB;
		const input = new Input({ source: new BufferSource(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))), formats: ALL_FORMATS });
		const codecs = (await input.getTracks()).map((t) => `${t.type}:${t.codec}`);
		const pcm = [];
		let rate = 48000;
		for await (const { buffer } of new AudioBufferSink(await input.getPrimaryAudioTrack()).buffers()) {
			rate = buffer.sampleRate;
			pcm.push(buffer.getChannelData(0).slice());
		}
		const all = new Float32Array(pcm.reduce((n, a) => n + a.length, 0));
		let o = 0;
		for (const a of pcm) {
			all.set(a, o);
			o += a.length;
		}
		// Onsets: the first 2 ms window above 2% of full scale after at least 20 ms of quiet.
		const win = Math.round(rate * 0.002);
		const onsets = [];
		let loud = false;
		let quiet = 0;
		for (let i = 0; i + win < all.length; i += win) {
			let e = 0;
			for (let j = i; j < i + win; j++) e = Math.max(e, Math.abs(all[j]));
			if (!loud && e > 0.02) {
				loud = true;
				quiet = 0;
				onsets.push((i / rate) * 1000);
			} else if (loud && e < 0.008) {
				if (++quiet > 10) loud = false;
			} else if (loud) quiet = 0;
		}
		// Slide changes: a jump in a 64x36 luminance signature between consecutive frames.
		const g = new OffscreenCanvas(64, 36).getContext('2d', { willReadFrequently: true });
		const changes = [];
		let prev = null;
		let frames = 0;
		for await (const s of new VideoSampleSink(await input.getPrimaryVideoTrack()).samples()) {
			s.draw(g, 0, 0, 64, 36);
			const d = g.getImageData(0, 0, 64, 36).data;
			if (prev) {
				let diff = 0;
				for (let j = 0; j < d.length; j++) diff += Math.abs(d[j] - prev[j]);
				if (diff / d.length > 1.5) changes.push(s.timestamp * 1000);
			}
			prev = d;
			frames++;
			s.close();
		}
		return { codecs, durationMs: (await input.computeDuration()) * 1000, onsets, changes, frames };
	}, fs.readFileSync(mp4File).toString('base64'));
	return { ...out, check };
}

/** The checks both deck shapes must pass: codecs, length, captions against sound, slides on time. */
function assertInStep({ slideStarts, report, check }, voicedCues) {
	assert.ok(check.codecs.includes('video:avc'), `H.264 video (${check.codecs})`);
	assert.ok(check.codecs.includes('audio:aac'), `AAC audio (${check.codecs})`);
	assert.ok(Math.abs(check.durationMs - report.durationMs) <= FRAME * 2, `the MP4 lasts ${check.durationMs} ms, the layout ${report.durationMs} ms`);
	assert.equal(check.frames, report.frames, 'one frame per step of the clock');
	assert.equal(check.onsets.length, voicedCues.length, `exactly the voiced clips sound (${check.onsets.map(Math.round)})`);
	voicedCues.forEach((c, n) => {
		assert.ok(Math.abs(check.onsets[n] - c.startMs) <= 12, `caption at ${c.startMs} ms, its sound at ${Math.round(check.onsets[n])} ms`);
	});
	for (const b of slideStarts.slice(1)) {
		const hit = check.changes.reduce((x, t) => (Math.abs(t - b) < Math.abs(x - b) ? t : x), Number.POSITIVE_INFINITY);
		assert.ok(hit - b >= -0.5 && hit - b < FRAME + 0.5, `a slide change on the first frame at or after ${b} ms (nearest ${Math.round(hit)} ms; changes at ${check.changes.map(Math.round)})`);
	}
}

test('silent title, silent divider, a corrupt clip and a cue with no clip: all in step', { timeout: 240_000 }, async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const { vttTime } = await import(path.join(ROOT, 'lib/export/video.mjs'));
	const said = (text, clips) => ({ text, track: buildTrack(text), clips });
	const out = await capture('edges', [
		null, // the silent title slide: the video's lead-in holds it
		said('Revenue grew nine percent this quarter. Every region contributed.', [clip(tone(2100)), clip(tone(1300))]),
		null, // a silent divider: a hold segment
		// cue 0's clip is corrupt (rule 4: it holds its caption silently); cue 1 has no clip.
		said('We will hold the margin next quarter. That is the plan.', [clip('data:audio/wav;base64,AAAAAAAA'), null]),
	]);
	const { vtt, cues, slideStarts, report } = out;
	assert.equal(report.clipsThatFailedToDecode, 1, 'the corrupt clip is reported');
	assert.equal(report.voicedCuesLogged, 2, 'only the two decodable clips are voiced');
	assert.equal(cues.length, 4);
	// Play on the silent title advances at once and holds on slide 2 before it speaks (rule 1), so the
	// first caption follows the lead-in plus that hold, and slide 2 arrives right at the lead-in.
	assert.equal(slideStarts[1], 1000, 'slide 2 arrives when the one-second lead-in ends');
	assert.ok(cues[0].startMs > slideStarts[1], 'and speaks after its hold');
	assert.ok(vtt.startsWith(`WEBVTT\n\n1\n${vttTime(cues[0].startMs)} --> `), 'the .vtt carries the same times');
	assertInStep(out, cues.filter((c) => c.slide === 1));
});

test('a voiced first slide keeps its first word, one frame into the video', { timeout: 240_000 }, async () => {
	const { buildTrack } = await import('@laticent/cadenza');
	const said = (text, clips) => ({ text, track: buildTrack(text), clips });
	// The first word is at the start of the timeline, and the audio is placed earlier by the encoder's
	// delay, so without a lead-in its first 21 ms would fall before zero and be cut (found by the checker).
	const out = await capture('voiced-first', [said('Good morning, and welcome.', [clip(tone(1500))]), null, null, said('That is the plan.', [clip(tone(900))])]);
	assert.equal(out.report.leadInMs, Math.round(FRAME), 'one frame of lead-in');
	assert.equal(out.cues[0].startMs, out.report.leadInMs, 'the first caption starts when the lead-in ends');
	assertInStep(out, out.cues);
});
