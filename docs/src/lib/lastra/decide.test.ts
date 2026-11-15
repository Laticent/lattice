// @vitest-environment node
// decide.ts: the recode plan and its acceptance, with every threshold passed in. The numbers below are Lattice's
// defaults (lib/core/image-policy.js DEFAULTS), written out so this file tests lastra alone.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { acceptRecode, planRecode, type RecodeThresholds } from './decide.js';
import type { ImageInfo } from './read.js';

const T: RecodeThresholds = { maxEdge: 2560, quality: 90, minBytes: 150 * 1024, formatShare: 0.7, sameFormatShare: 0.9, tightJpegBytesPerPx: 0.5 };
const info = (format: ImageInfo['format'], width: number, height: number, { alpha = false, orientation = 1 } = {}): ImageInfo => ({
	format,
	mime: `image/${format}`,
	width,
	height,
	alpha,
	orientation,
});

test('planRecode: skips small files and tight JPEGs; shrinks the long edge', () => {
	const big = info('png', 4000, 3000);
	assert.equal(planRecode(big, 100 * 1024, T), null, 'under 150 KB');
	assert.deepEqual(planRecode(big, 5e6, T), { width: 2560, height: 1920, quality: 90, checkAlpha: false, formatChange: true });
	const tight = info('jpeg', 1920, 1280);
	assert.equal(planRecode(tight, 600 * 1024, T), null, '0.24 bytes per pixel is already tight');
	assert.ok(planRecode(tight, 3e6, T), 'a loose 1920 px JPEG is worth trying');
	assert.equal(planRecode(info('jpeg', 5000, 3000), 600 * 1024, T)?.formatChange, false);
	assert.equal(planRecode(info('png', 100, 100, { alpha: true }), 5e6, T)?.checkAlpha, true);
	assert.deepEqual(planRecode(info('png', 3000, 1), 5e6, T), { width: 2560, height: 1, quality: 90, checkAlpha: false, formatChange: true }, 'a side never rounds to 0');
});

test('planRecode: the thresholds are the caller’s', () => {
	assert.equal(planRecode(info('png', 4000, 3000), 5e6, { ...T, maxEdge: 1000 })?.width, 1000);
	assert.equal(planRecode(info('png', 4000, 3000), 5e6, { ...T, quality: 70 })?.quality, 70);
	assert.equal(planRecode(info('png', 4000, 3000), 5e6, { ...T, minBytes: 6e6 }), null);
});

test('planRecode: a turned picture (orientation 2 to 8) is never planned: the frame stores it sideways and the encoder would squeeze it', () => {
	for (const orientation of [2, 3, 4, 5, 6, 7, 8]) assert.equal(planRecode(info('jpeg', 4000, 3000, { orientation }), 5e6, T), null, `orientation ${orientation}`);
	assert.equal(planRecode(info('png', 4000, 3000, { orientation: 6 }), 5e6, T), null, 'a PNG eXIf turn too');
	assert.ok(planRecode(info('jpeg', 4000, 3000), 5e6, T), 'an upright one still shrinks');
});

test('planRecode: only PNG and JPEG are planned; GIF, WebP and AVIF stay as they are', () => {
	for (const format of ['gif', 'webp', 'avif'] as const) assert.equal(planRecode(info(format, 4000, 3000), 5e6, T), null, format);
	assert.equal(planRecode(null, 5e6, T), null);
});

test('acceptRecode: a format change needs a 30% win, a resize 10%, and never a larger file', () => {
	assert.equal(acceptRecode(1000, 690, { formatChange: true }, T), true);
	assert.equal(acceptRecode(1000, 710, { formatChange: true }, T), false);
	assert.equal(acceptRecode(1000, 890, { formatChange: false }, T), true);
	assert.equal(acceptRecode(1000, 950, { formatChange: false }, T), false);
	assert.equal(acceptRecode(1000, 0, { formatChange: true }, T), false);
});
