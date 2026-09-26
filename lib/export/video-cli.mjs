#!/usr/bin/env node
// `lattice video <export.html> [out.mp4]` — render a narrated HTML export to an MP4 and a .vtt.
//
// The input is the narrated HTML export the Studio writes, because the voice lives there: the CLI
// has no speech engine, and video is a capture of the export, never a second renderer
// (engineering/decisions/2026-09-25-video-export.md §0). lattice-emulator.js dispatches here as a
// child process, the way it dispatches `lattice packages`.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { exportVideo } from './video.mjs';

const require = createRequire(import.meta.url);

const HELP = `Usage: lattice video <narrated-export.html> [out.mp4] [options]

Renders a narrated HTML export (Share -> HTML in the Studio, with narration) to an MP4
(H.264 video, AAC audio, a WebVTT caption track) and a .vtt sidecar beside it. The video is
the export's own player, played on a virtual clock and captured frame by frame, so it shows
exactly what the export shows.

OPTIONS
  --fps N          Frames per second (default 30)
  --lead-in MS     Hold on slide 1 before narration starts, when slide 1 is silent (default 1000)
  --outro MS       Hold on the last slide after narration ends (default 1000)
  -q, --quiet      No progress output
  -h, --help       Show this help

Needs a Chromium whose WebCodecs encodes H.264 (Chrome or Chrome for Testing). Set CHROME_PATH
to choose one. AAC is encoded by FFmpeg's encoder compiled to WebAssembly when the browser has none.

The captions ride twice: as a WebVTT track inside the MP4 and as the .vtt beside it. Only the
.vtt is known to work outside a browser; attach it in PowerPoint, Keynote or your player if the
track does not show.

NOTICE
  This command uses code of FFmpeg (https://ffmpeg.org), its AAC encoder, licensed under the
  LGPL-2.1-or-later, unmodified, through the @mediabunny/aac-encoder package. Its source is at
  https://github.com/FFmpeg/FFmpeg, and the license text is assets/licenses/LGPL-2.1-ffmpeg.txt
  in the Lattice repository.
`;

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('-h') || argv.includes('--help')) {
	process.stdout.write(HELP);
	process.exit(argv.length ? 0 : 1);
}
const opts = { fps: 30, leadInMs: 1000, outroMs: 1000 };
const pos = [];
let quiet = false;
const num = (flag, v) => {
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) {
		console.error(`lattice video: ${flag} needs a non-negative number`);
		process.exit(1);
	}
	return n;
};
for (let i = 0; i < argv.length; i++) {
	const [a, inline] = argv[i].split(/=(.*)/s, 2);
	const val = () => inline ?? argv[++i];
	if (a === '-q' || a === '--quiet') quiet = true;
	else if (a === '--fps') opts.fps = num(a, val());
	else if (a === '--lead-in') opts.leadInMs = num(a, val());
	else if (a === '--outro') opts.outroMs = num(a, val());
	else if (a.startsWith('-')) {
		console.error(`lattice video: unknown option ${a}`);
		process.exit(1);
	} else pos.push(argv[i]);
}
if (!(opts.fps >= 1 && opts.fps <= 60)) {
	console.error('lattice video: --fps must be between 1 and 60');
	process.exit(1);
}
if (opts.leadInMs > 60000 || opts.outroMs > 60000) {
	console.error('lattice video: --lead-in and --outro are at most 60000 ms');
	process.exit(1);
}
const [input, output = input?.replace(/\.html?$/i, '') + '.mp4'] = pos;
if (!input || !/\.html?$/i.test(input)) {
	console.error('lattice video: the input is a narrated HTML export (.html). Export one from the Studio with narration first.');
	process.exit(1);
}
// The output must be a new .mp4, never the export itself: a narrated export can hold paid voice audio.
if (!/\.mp4$/i.test(output) || path.resolve(output) === path.resolve(input)) {
	console.error('lattice video: the output must be a .mp4 path other than the input');
	process.exit(1);
}
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || require('puppeteer').executablePath();
const vttFile = output.replace(/\.mp4$/i, '') + '.vtt';
let shown = -1;
try {
	const { vtt, report } = await exportVideo({
		html: readFileSync(input, 'utf8'),
		outFile: output,
		executablePath,
		...opts,
		onProgress: ({ frame, frames }) => {
			const pct = Math.floor((100 * frame) / frames);
			if (!quiet && pct !== shown && pct % 10 === 0) {
				shown = pct;
				process.stderr.write(`  capturing ${pct}% (${frame}/${frames} frames)\n`);
			}
		},
	});
	writeFileSync(vttFile, vtt);
	if (!quiet) {
		const s = (report.durationMs / 1000).toFixed(1);
		console.log(`✓ ${path.relative(process.cwd(), output)} — ${s} s, ${report.size} at ${report.fps} fps, ${(report.bytes / 1048576).toFixed(1)} MB (${report.encoders.audio})`);
		console.log(`✓ ${path.relative(process.cwd(), vttFile)} — ${report.cues} captions`);
	}
	// Printed even under --quiet: a sentence the video will not say is not progress output.
	if (report.clipsThatFailedToDecode) console.warn(`lattice video: ${report.clipsThatFailedToDecode} clip(s) would not decode; those sentences hold their caption silently, as the player does`);
} catch (e) {
	console.error(`lattice video: ${e?.message || e}`);
	process.exit(1);
}
