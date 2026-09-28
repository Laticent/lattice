#!/usr/bin/env node
// `lattice video <deck.md | export.html> [out.mp4]` — render a narrated deck to an MP4 and a .vtt.
//
// Video is a capture of the narrated HTML export, never a second renderer
// (engineering/decisions/2026-09-25-video-export.md §0). So a `.md` input is first exported the way
// the CLI exports any player (`lattice deck.md x.html --player`), voiced with Kokoro (`--narrate`,
// lib/export/narrate-kokoro.mjs), and that export is what gets captured. An `.html` input is a
// narrated export someone already made, usually the Studio. lattice-emulator.js dispatches here as
// a child process, the way it dispatches `lattice packages`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL_HINT } from './narrate-kokoro.mjs';
import { exportVideo } from './video.mjs';

const require = createRequire(import.meta.url);

const HELP = `Usage: lattice video <deck.md | narrated-export.html> [out.mp4] [options]

Renders a narrated deck to an MP4 (H.264 video, AAC audio, a caption track) and a .vtt sidecar
beside it. The video is the deck's own HTML player, played on a virtual clock and captured frame
by frame, so it shows exactly what the export shows, the Guide's gestures included.

  deck.md        Voiced here with Kokoro, the Studio's on-device voice, as the Studio's export
                 voices it. Needs the optional kokoro-js; the first run downloads its ~80 MB
                 model once:  ${INSTALL_HINT}
  export.html    A narrated HTML export someone already made (Share -> HTML in the Studio, with
                 narration). Nothing is voiced again.

OPTIONS
  --mode M         light, dark or system: the mode a deck.md is exported in (default: the
                   deck's own color-mode)
  --size NAME      the canvas a deck.md is laid out on, over its own size: — mobile-landscape
                   (19.5:9) fills a phone held sideways with no side bars
  --no-guide       leave the Guide out of a deck.md's video (on by default: the focus and
                   gestures that follow the narration, as in Present; delivery: picks their style)
  --no-captions    write no caption track and no .vtt (on by default)
  --fps N          Frames per second (default 30)
  --lead-in MS     Hold on slide 1 before narration starts, when slide 1 is silent (default 1000)
  --outro MS       Hold on the last slide after narration ends (default 1000)
  -q, --quiet      No progress output
  -h, --help       Show this help

Needs a Chromium whose WebCodecs encodes H.264 (Chrome or Chrome for Testing). Set CHROME_PATH
to choose one. AAC is encoded by FFmpeg's encoder compiled to WebAssembly when the browser has none.

The captions ride twice: as a caption track inside the MP4 (3GPP timed text, off until the viewer
picks it) and as the .vtt beside it. The track shows on iOS; attach the .vtt in PowerPoint, Keynote
or a player that does not list it.

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
let mode = null;
let guide = true;
let captions = true;
let size = null;
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
	else if (a === '--size') size = val();
	else if (a === '--no-guide') guide = false;
	else if (a === '--no-captions') captions = false;
	else if (a === '--mode') {
		mode = val();
		if (!['light', 'dark', 'system'].includes(mode)) {
			console.error('lattice video: --mode is light, dark or system');
			process.exit(1);
		}
	}
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
const [input, output = input?.replace(/\.(html?|md)$/i, '') + '.mp4'] = pos;
const fromDeck = !!input && /\.md$/i.test(input);
if (!input || !(fromDeck || /\.html?$/i.test(input))) {
	console.error('lattice video: the input is a deck (.md) or a narrated HTML export (.html).');
	process.exit(1);
}
if ((mode || size || !guide) && !fromDeck) {
	console.error('lattice video: --mode, --size and --no-guide apply to a deck (.md); an export keeps what it was made with');
	process.exit(1);
}
// The output must be a new .mp4, never the export itself: a narrated export can hold paid voice audio.
if (!/\.mp4$/i.test(output) || path.resolve(output) === path.resolve(input)) {
	console.error('lattice video: the output must be a .mp4 path other than the input');
	process.exit(1);
}
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || require('puppeteer').executablePath();
const vttFile = output.replace(/\.mp4$/i, '') + '.vtt';
/**
 * A deck becomes its narrated player export first, through the CLI's own `--player --narrate`
 * path, into a scratch folder that is removed however the run ends.
 */
function exportDeck(deck) {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'lattice-video-'));
	const cleanup = () => rmSync(dir, { recursive: true, force: true });
	process.once('exit', cleanup);
	// Ctrl-C and a kill do not fire `exit`, and the folder can hold the voiced export by then.
	for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
		process.once(sig, () => {
			cleanup();
			process.exit(code);
		});
	}
	const out = path.join(dir, 'deck.html');
	const emulator = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'lattice-emulator.js');
	const args = [emulator, deck, out, '--player', '--narrate', ...(mode ? ['--player-mode', mode] : []), ...(size ? ['--size', size] : []), ...(guide ? [] : ['--no-guide']), ...(quiet ? ['--quiet'] : [])];
	if (!quiet) process.stderr.write(`  exporting and voicing ${deck}\n`);
	const r = spawnSync(process.execPath, args, { stdio: ['ignore', quiet ? 'ignore' : 'inherit', 'inherit'] });
	if (r.status !== 0) {
		cleanup();
		process.exit(r.status ?? 1);
	}
	return readFileSync(out, 'utf8');
}
let shown = -1;
try {
	const html = fromDeck ? exportDeck(input) : readFileSync(input, 'utf8');
	const { vtt, report } = await exportVideo({
		html,
		outFile: output,
		executablePath,
		...opts,
		captions,
		onProgress: ({ frame, frames }) => {
			const pct = Math.floor((100 * frame) / frames);
			if (!quiet && pct !== shown && pct % 10 === 0) {
				shown = pct;
				process.stderr.write(`  capturing ${pct}% (${frame}/${frames} frames)\n`);
			}
		},
	});
	if (captions) writeFileSync(vttFile, vtt);
	if (!quiet) {
		const s = (report.durationMs / 1000).toFixed(1);
		console.log(`✓ ${path.relative(process.cwd(), output)} — ${s} s, ${report.size} at ${report.fps} fps, ${(report.bytes / 1048576).toFixed(1)} MB (${report.encoders.audio})`);
		if (captions) console.log(`✓ ${path.relative(process.cwd(), vttFile)} — ${report.cues} captions`);
	}
	// Printed even under --quiet: a sentence the video will not say is not progress output.
	if (report.clipsThatFailedToDecode) console.warn(`lattice video: ${report.clipsThatFailedToDecode} clip(s) would not decode; those sentences hold their caption silently, as the player does`);
} catch (e) {
	console.error(`lattice video: ${e?.message || e}`);
	process.exit(1);
}
