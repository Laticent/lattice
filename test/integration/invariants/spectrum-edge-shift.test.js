/**
 * Integration: the spectrum bar never moves, crowds or is crowded by a slide's content.
 *
 * `tools/check-edge-shift.js` renders components in Chromium under every bar placement and fails if
 * (a) any element's position depends on the placement, (b) a full-bleed frame's overlay strips are
 * malformed or an opted-out component draws a bar, (c) text or chrome sits inside the strip the bar
 * occupies, or (d) a dark slide steps from its light twin. It used to be an on-demand tool, and the
 * one regression its absence let through (a stamp reverted to `top: 0`) passed every unit test and
 * moved 34 elements by 4px. This runs it inside the existing integration tier: a new stamp, tab or
 * chrome rule written without the per-side bar tokens fails here, not in a boardroom.
 *
 * Slow tier: two Chromium sweeps. See engineering/decisions/2026-10-26-spectrum-edge-shift.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'check-edge-shift.js');
const TIMEOUT = 600000;
const chrome = resolveChrome();

function sweep(args) {
	return spawnSync(process.execPath, [TOOL, ...args], {
		cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) },
	});
}

describe('spectrum bar: placement holds still, nothing crowds the bar', { skip: skipWithoutChrome(chrome) }, () => {
	test('the stamps, chrome and a spread of layouts hold still and stay clear of the bar, light and dark', { timeout: TIMEOUT }, () => {
		const r = sweep(['--components', 'content,kpi,table,cards-grid,bar,topic,title,closing,divider,premise', '--limit', '400']);
		assert.equal(r.status, 0, `${r.stdout.split('\n').slice(-40).join('\n')}\n${r.stderr}`);
		assert.match(r.stdout, /PASS: no element moves/);
		const pairs = Number(/Compared (\d+) dark\/light twin pairs/.exec(r.stdout)?.[1] ?? 0);
		assert.ok(pairs >= 8, `the scheme-parity check paired ${pairs} dark/light slides; it must not run empty`);
	});

	test('a claimed chart and video keep their words off the bar, a dark accent slide matches its light twin, and a deck logo holds still', { timeout: TIMEOUT }, () => {
		for (const args of [
			['--components', 'bar,video,big-number,content', '--classes', 'claim-bleed', '--no-dark'],
			['--components', 'content,kpi,code,compare-code', '--classes', 'accent'],
			['--components', 'content,image,split-panel,title', '--classes', 'logo-top-left', '--front-matter', 'logo: lattice'],
		]) {
			const r = sweep(args);
			assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout.split('\n').slice(-40).join('\n')}\n${r.stderr}`);
			assert.match(r.stdout, /PASS: no element moves/);
		}
	});

	test('every full-bleed frame draws two clean strips and holds still across its variants', { timeout: TIMEOUT }, () => {
		const r = sweep(['--components', 'image,scene,split-panel,split-compare,collage', '--variants', '--limit', '400']);
		assert.equal(r.status, 0, `${r.stdout.split('\n').slice(-40).join('\n')}\n${r.stderr}`);
		assert.match(r.stdout, /PASS: no element moves/);
	});
});
