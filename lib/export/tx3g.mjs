// The MP4's caption track, as 3GPP timed text (`tx3g`), the subtitle format of QuickTime, iOS and
// macOS (whether QuickTime offers this file's track is the owner's check: the note's §10).
//
// mediabunny 1.60 muxes only WebVTT-in-MP4 (`wvtt`), and no player the owner tried offered that
// track (engineering/decisions/2026-09-25-video-export.md §7). So `lattice video` muxes picture and
// sound with mediabunny and then adds this track to the finished file itself:
//
//   · `tx3gSamples()` lays the cues out as samples that tile the whole video: a text sample for
//     each cue, an empty sample for each gap, so a caption shows exactly while its sentence plays;
//   · `tx3gTrak()` builds the `trak` box. Its sample entry has the layout FFmpeg's `mov_text`
//     muxer writes (bottom-centered, one style, one font), the most widely played tx3g there is,
//     with the deck's own colors (`brandCaptionStyle`); the track is off until the viewer picks it;
//   · `addTx3gTrack()` appends the samples as a second `mdat` and rewrites `moov` with the new track.
//     No byte of the existing picture or sound moves, so their chunk offsets stay valid.
//
// Pure except `addTx3gTrack`, which reads and writes the file in place and holds only `moov` and
// the caption text in memory.

import { closeSync, fstatSync, ftruncateSync, openSync, readSync, writeSync } from 'node:fs';

const TIMESCALE = 1000; // the track's clock: ms, the unit the LTT lays cues out in
const MAX_TEXT = 0xffff; // a tx3g sample's text length is a 16-bit field

const u8 = (n) => Buffer.from([n & 0xff]);
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]); };
const full = (type, version, flags, ...parts) => box(type, u8(version), Buffer.from([(flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]), ...parts);

/** ISO 639-2/T code packed as three 5-bit letters, as `mdhd` stores it. */
const packLanguage = (code) => /^[a-z]{3}$/.test(code) ? [...code].reduce((n, c) => (n << 5) | (c.charCodeAt(0) - 0x60), 0) : 0x55c4; // 'und'

/** A cue's text as one line of plain UTF-8: tx3g carries no markup, so nothing is escaped. */
function sampleText(s) {
	let t = Buffer.from(String(s).replace(/\s*\n\s*/g, ' ').trim(), 'utf8');
	if (t.length > MAX_TEXT) t = Buffer.from(t.subarray(0, MAX_TEXT).toString('utf8').replace(/�+$/, ''), 'utf8');
	return t;
}

/**
 * The cues as samples that tile [0, durationMs]: `{ startMs, durMs, text }`, with `text: null` for
 * the empty sample that clears the screen between cues. Times are whole ms. A cue that overruns the
 * next one is cut at the next one's start, and one past the end of the video at the end.
 * @param {{startMs: number, playedMs: number, text: string}[]} cues in time order
 */
export function tx3gSamples(cues, durationMs) {
	const end = Math.round(durationMs);
	const out = [];
	let at = 0;
	const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
	sorted.forEach((c, n) => {
		const start = Math.max(at, Math.min(end, Math.round(c.startMs)));
		const next = n + 1 < sorted.length ? Math.round(sorted[n + 1].startMs) : end;
		const stop = Math.min(end, next, Math.round(c.startMs + c.playedMs));
		if (stop <= start) return;
		if (start > at) out.push({ startMs: at, durMs: start - at, text: null });
		out.push({ startMs: start, durMs: stop - start, text: String(c.text) });
		at = stop;
	});
	if (end > at || out.length === 0) out.push({ startMs: at, durMs: Math.max(0, end - at), text: null });
	return out;
}

/** Each sample's bytes: a 16-bit length, then the UTF-8 text (an empty sample is just `00 00`). */
export function tx3gPayloads(samples) {
	return samples.map((s) => { const t = s.text == null ? Buffer.alloc(0) : sampleText(s.text); return Buffer.concat([u16(t.length), t]); });
}

/**
 * The look the file SUGGESTS: a player applies each part only where the viewer's own caption style
 * lets the video override it (iOS: Settings → Accessibility → Subtitles & Captioning → Style).
 * The default is FFmpeg `mov_text`'s own: white Arial, size 16, on opaque black.
 * @typedef {{ text?: number[], background?: number[], bold?: boolean, font?: string, size?: number }} Tx3gStyle
 */
export const FFMPEG_STYLE = Object.freeze({ text: [0xff, 0xff, 0xff, 0xff], background: [0, 0, 0, 0xff], bold: false, font: 'Arial', size: 0x10 });

/** Relative luminance (WCAG 2) of an [r, g, b] in 0–255. */
const luminance = (c) => {
	const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
	return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" as [r, g, b], or null. */
const parseRgb = (s) => { const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(s ?? '')); return m ? m.slice(1, 4).map(Number) : null; };

// The owner's pick, 2026-09-27: "tasteful opacity that does not diminish readability". 72% let a white
// slide turn the ink panel gray on the iPhone; at 86% it reads as the deck's ink (note §10a).
export const PANEL_OPACITY = 0.86;
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/**
 * The on-brand caption look (owner, 2026-09-27: variant A): light bold text on a translucent panel in
 * the deck's own dark color, the same way in dark and light mode. The panel is the darker of the
 * theme's `--bg` and `--text-heading` (dark mode: the page; light mode: the ink), the text the lighter.
 * Light text is the only safe choice on iOS: it takes the file's text color but may keep the
 * viewer's own dark panel, and dark text on that panel was unreadable (variant B).
 *
 * Readability is checked, not assumed: the text must clear WCAG AA (4.5:1) against the panel over
 * a white slide, the worst case under a translucent dark panel; a theme whose colors do not is
 * given white on black instead.
 * @param {{bg?: string, heading?: string}} tokens computed CSS colors from the export
 * @returns {Tx3gStyle}
 */
export function brandCaptionStyle({ bg, heading } = {}) {
	const pair = [parseRgb(bg), parseRgb(heading)].filter(Boolean).sort((a, b) => luminance(a) - luminance(b));
	let [panel, text] = pair.length === 2 ? pair : [BLACK, WHITE];
	if (contrast(text, mix(panel, WHITE, PANEL_OPACITY)) < 4.5) [panel, text] = [BLACK, WHITE];
	return { text: [...text, 255], background: [...panel, Math.round(PANEL_OPACITY * 255)], bold: true, font: 'Avenir Next', size: 0x10 };
}

const rgba = (c) => Buffer.from([0, 1, 2, 3].map((i) => Math.max(0, Math.min(255, Math.round(c[i] ?? 255)))));

/** The tx3g sample entry: bottom-centered, one style record, one font. */
function tx3gEntry(style = FFMPEG_STYLE) {
	const s = { ...FFMPEG_STYLE, ...style };
	const font = Buffer.from(String(s.font).slice(0, 255), 'utf8');
	return box('tx3g',
		Buffer.alloc(6), u16(1), // SampleEntry: reserved, data_reference_index
		u32(0), // displayFlags
		u8(1), u8(0xff), // horizontal: center; vertical: bottom (-1)
		rgba(s.background), // background-color-rgba
		Buffer.alloc(8), // default-text-box: top, left, bottom, right (0 = the player's own)
		u16(0), u16(0), u16(1), u8(s.bold ? 1 : 0), u8(s.size), rgba(s.text), // StyleRecord
		box('ftab', u16(1), u16(1), u8(font.length), font));
}

/**
 * The `trak` for the caption track. `offset` is where the first sample's bytes sit in the file;
 * all samples sit in one chunk, back to back.
 */
export function tx3gTrak({ trackId, samples, sizes, offset, movieTimescale, language = 'eng', style }) {
	const durationMs = samples.reduce((n, s) => n + s.durMs, 0);
	const movieDur = Math.round((durationMs * movieTimescale) / TIMESCALE);
	const matrix = Buffer.concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);
	// Runs of equal durations, as `stts` stores them.
	const stts = [];
	for (const s of samples) {
		const last = stts[stts.length - 1];
		if (last && last[1] === s.durMs) last[0]++;
		else stts.push([1, s.durMs]);
	}
	const big = offset > 0xffffffff;
	return box('trak',
		// Flags 2: in the movie, NOT enabled. iOS plays an enabled subtitle track even while its own
		// Subtitles menu reads "Off" (owner, iPhone, 2026-09-27), so the track is off until the viewer
		// picks it: "captions if someone enables it". Alternate group 3, as FFmpeg writes it.
		full('tkhd', 0, 2, u32(0), u32(0), u32(trackId), u32(0), u32(movieDur), Buffer.alloc(8), u16(0), u16(3), u16(0), u16(0), matrix, u32(0), u32(0)),
		box('mdia',
			full('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(durationMs), u16(packLanguage(language)), u16(0)),
			full('hdlr', 0, 0, u32(0), Buffer.from('sbtl', 'latin1'), Buffer.alloc(12), Buffer.from('SubtitleHandler\0', 'latin1')),
			box('minf',
				full('nmhd', 0, 0),
				box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
				box('stbl',
					full('stsd', 0, 0, u32(1), tx3gEntry(style)),
					full('stts', 0, 0, u32(stts.length), ...stts.flatMap(([n, d]) => [u32(n), u32(d)])),
					full('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
					full('stsz', 0, 0, u32(0), u32(sizes.length), ...sizes.map(u32)),
					big ? full('co64', 0, 0, u32(1), u64(offset)) : full('stco', 0, 0, u32(1), u32(offset))))));
}

/** The top-level boxes of an open file: `{ type, at, size }`. */
function topBoxes(fd) {
	const size = fstatSync(fd).size;
	const head = Buffer.alloc(16);
	const out = [];
	for (let at = 0; at < size;) {
		if (readSync(fd, head, 0, 16, at) < 8) throw new Error(`a truncated box at byte ${at}`);
		let n = head.readUInt32BE(0);
		if (n === 1) n = Number(head.readBigUInt64BE(8));
		else if (n === 0) n = size - at;
		if (n < 8 || at + n > size) throw new Error(`a malformed box at byte ${at}`);
		out.push({ type: head.toString('latin1', 4, 8), at, size: n });
		at += n;
	}
	return out;
}

/**
 * Add a tx3g caption track to the MP4 at `file`, in place. `cues` are `{startMs, playedMs, text}`
 * on the video's own timeline; `durationMs` is the video's length.
 *
 * The caption bytes go in a new `mdat` and the rewritten `moov` follows it. When `moov` is the
 * file's last box (mediabunny's layout without fast start) both replace it; otherwise the old
 * `moov` becomes a `free` box and both are appended. Either way no existing sample moves.
 * @returns {{trackId: number, samples: number, bytes: number}}
 */
export function addTx3gTrack(file, { cues, durationMs, language = 'eng', style }) {
	const fd = openSync(file, 'r+');
	try {
		const boxes = topBoxes(fd);
		const m = boxes.findIndex((b) => b.type === 'moov');
		if (m < 0) throw new Error('the MP4 has no moov box');
		const mv = boxes[m];
		const moov = Buffer.alloc(mv.size);
		readSync(fd, moov, 0, mv.size, mv.at);
		if (moov.readUInt32BE(0) === 1) throw new Error('a 64-bit moov is not supported');

		// mvhd: its timescale for the track's duration, and next_track_ID for the new track's id.
		let hd = 8;
		while (hd + 8 <= moov.length && moov.toString('latin1', hd + 4, hd + 8) !== 'mvhd') {
		const n = moov.readUInt32BE(hd);
		if (n < 8) throw new Error(`a malformed box in moov at byte ${hd}`);
		hd += n;
	}
		if (hd + 8 > moov.length) throw new Error('the MP4 has no mvhd box');
		const v1 = moov[hd + 8] === 1;
		const movieTimescale = moov.readUInt32BE(hd + 12 + (v1 ? 16 : 8));
		const nextAt = hd + 12 + (v1 ? 28 : 16) + 4 + 2 + 10 + 36 + 24;
		const trackId = moov.readUInt32BE(nextAt);

		const samples = tx3gSamples(cues, durationMs);
		const payloads = tx3gPayloads(samples);
		const data = Buffer.concat(payloads);
		const mdat = Buffer.concat([u32(8 + data.length), Buffer.from('mdat', 'latin1'), data]);

		const last = m === boxes.length - 1;
		const at = last ? mv.at : boxes[boxes.length - 1].at + boxes[boxes.length - 1].size;
		const trak = tx3gTrak({ trackId, samples, sizes: payloads.map((p) => p.length), offset: at + 8, movieTimescale, language, style });
		const next = Buffer.from(moov);
		next.writeUInt32BE(trackId + 1, nextAt);
		const newMoov = Buffer.concat([next, trak]);
		newMoov.writeUInt32BE(newMoov.length, 0);

		if (!last) writeSync(fd, Buffer.from('free', 'latin1'), 0, 4, mv.at + 4);
		const tail = Buffer.concat([mdat, newMoov]);
		writeSync(fd, tail, 0, tail.length, at);
		ftruncateSync(fd, at + tail.length);
		return { trackId, samples: samples.length, bytes: data.length };
	} finally {
		closeSync(fd);
	}
}
