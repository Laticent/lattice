#!/usr/bin/env node
/**
 * build-preset-thumbs — render the Studio's preset-picker thumbnails.
 *
 * The deck panel's Preset picker shows each preset as a small picture of ONE fixed sample
 * slide, so an author chooses by look rather than by name. This renders that slide once per
 * built-in preset through the real emulator and writes a WebP per preset to
 * docs/public/presets/<name>.webp. The images are committed, so the docs build never needs
 * Chromium.
 *
 * Freshness: docs/scripts/preset-thumbs-sources.json records a sha256 of each preset's values
 * (lib/core/front-matter-key.js `PRESETS`), the deck header and the sample slide. The unit test
 * test/unit/core/preset-thumbs-fresh.test.js recomputes it, so changing what a preset sets
 * without re-running this fails `npm test` rather than shipping a thumbnail of the old look.
 * WebP bytes are not compared — encoders differ across machines; the SOURCE hash does not.
 * The hash cannot see the CSS the values resolve to (a finish, the title component, the
 * palette): after a visual change there, re-run this by hand. See tools/lib/preset-thumbs.cjs.
 *
 * Usage:  node tools/build-preset-thumbs.mjs
 * Needs:  Chromium (CHROME_PATH), and docs/node_modules (sharp).
 * engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md §7.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { PRESET_NAMES } = require(path.join(ROOT, 'lib/core/front-matter-key.js'));
const { presetThumbHash, PRESET_THUMB_HEADER, PRESET_THUMB_SAMPLE } = require(path.join(ROOT, 'tools/lib/preset-thumbs.cjs'));
const sharp = require(path.join(ROOT, 'docs/node_modules/sharp'));

const OUT = path.join(ROOT, 'docs/public/presets');
const SOURCES = path.join(ROOT, 'docs/scripts/preset-thumbs-sources.json');
/** 2x the largest size the picker draws it at (a 2-up grid cell in a 390px panel). */
const WIDTH = 320;

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-thumbs-'));
try {
	for (const name of PRESET_NAMES) {
		const md = path.join(tmp, `${name}.md`);
		fs.writeFileSync(md, PRESET_THUMB_HEADER.replace('{name}', name) + PRESET_THUMB_SAMPLE);
		const png = path.join(tmp, `${name}.png`);
		execFileSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), md, png], { stdio: 'ignore' });
		const first = fs.readdirSync(tmp).filter((f) => f.startsWith(`${name}.`) && f.endsWith('.png')).sort()[0];
		await sharp(path.join(tmp, first)).resize({ width: WIDTH }).webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
		console.log(`preset-thumbs: docs/public/presets/${name}.webp`);
	}
	fs.writeFileSync(SOURCES, `${JSON.stringify({ hash: presetThumbHash(), presets: [...PRESET_NAMES] }, null, '\t')}\n`);
	console.log('preset-thumbs: docs/scripts/preset-thumbs-sources.json');
} finally {
	fs.rmSync(tmp, { recursive: true, force: true });
}
