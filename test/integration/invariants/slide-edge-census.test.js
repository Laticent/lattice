/**
 * THE SLIDE EDGE CENSUS — for every slide, on every side: the engine's keyline is off
 * exactly where a spectrum bar is that side's edge, and on everywhere else.
 *
 * The engine draws a slide's 1px edge on a `.slide-edge` berth, a border whose width per side is a flag,
 * and each side's width yields to the brand bar when the bar sits there (`--_edge-t/r/b/l`,
 * base.modifiers.css "The slide's EDGE"). Those flags are set BY HAND in the rules that place
 * the bar, and hand-set flags drift: an image slide that drops its bar with `border: none`,
 * an `accent` slide that re-adds one under `spectrum: off`, a split frame that rebuilds its
 * bar as a child element. A static gate reads rules; this reads the RENDER. It asks the
 * browser, per side, "is there a bar?" (a border, a spectrum background band, a split frame's
 * segment bar) and "is the keyline off?", and the two must agree — whatever selector, file or
 * register produced either answer.
 *
 * Record: engineering/decisions/2026-09-25-one-slide-frame.md
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const GALLERY = path.join(ROOT, 'test', 'integration', 'baseline-decks', 'gallery.md');
const TIMEOUT = 600000;

function resolveChrome() {
	if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
	for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
		if (!fs.existsSync(root)) continue;
		for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
			const bin = path.join(root, build, 'chrome-linux64', 'chrome');
			if (fs.existsSync(bin)) return bin;
		}
	}
	return undefined;
}

/** The slides that move, drop or re-add the bar, under each spectrum register. */
const REGISTER_SLIDES = [
	'<!-- _class: content -->\n\n## A content slide\n\n- one',
	'<!-- _class: content accent -->\n\n## An accent slide\n\n- one',
	'<!-- _class: content tone-warn tone-edge -->\n\n## A tone-edge slide\n\n- one',
	'<!-- _class: content dark -->\n\n## A dark slide\n\n- one',
	'<!-- _class: content dark accent -->\n\n## A dark accent slide\n\n- one',
	'<!-- _class: title -->\n\n# A title',
	'<!-- _class: divider -->\n\n## A divider',
	'<!-- _class: divider light -->\n\n## A light divider',
	'<!-- _class: closing -->\n\n# Thanks',
	'<!-- _class: big-number claim-bleed -->\n\n`Bleed`\n\n- 42\n  - a claim that bleeds',
	'<!-- _class: content tone-fail -->\n\n## A tone rail\n\n- one',
	'<!-- _class: content tone-warn tone-glow -->\n\n## A tone glow\n\n- one',
	'<!-- _class: content corners-rounded -->\n\n## A rounded slide\n\n- one',
];
const REGISTERS = ['', 'spectrum: off', 'spectrum-edge: left', 'spectrum-edge: right', 'spectrum-edge: bottom', 'spectrum-edge: off', 'spectrum: solid'];

/** In-page: every mismatch between "a bar is this side's edge" and "the keyline is off". */
function census() {
	const out = [];
	const px = (v) => Number.parseFloat(v) || 0;
	for (const s of document.querySelectorAll('section[data-lattice-slide]')) {
		const cs = getComputedStyle(s);
		const flag = (side) => {
			const v = cs.getPropertyValue(`--_edge-${side}`).trim();
			return v === '' ? 1 : Number(v); // the berth's own fallback is 1
		};
		const bgImage = cs.backgroundImage !== 'none';
		const [bw, bh] = cs.backgroundSize.split(/\s+/);
		const bar = {
			t: px(cs.borderTopWidth) > 0.5 || (bgImage && bw === '100%' && /px$/.test(bh ?? '') && cs.backgroundPositionY === '0%'),
			r: px(cs.borderRightWidth) > 0.5,
			b: px(cs.borderBottomWidth) > 0.5,
			l: px(cs.borderLeftWidth) > 0.5 || (bgImage && bh === '100%' && /px$/.test(bw) && cs.backgroundPositionX === '0%'),
		};
		// A tone mark is an inset box-shadow: the rail is the left edge, the glow every edge.
		if (/\btone-(pass|warn|fail|skip)\b/.test(s.className) && !/\btone-edge\b/.test(s.className)) {
			bar.l = true;
			if (/\btone-glow\b/.test(s.className)) bar.t = bar.r = bar.b = true;
		}
		// A split frame rebuilds its top bar as a segment on each panel (`::after`, top: 0).
		for (const panel of s.querySelectorAll(':scope > .panel-left, :scope > .compare-left, :scope .panel-left, :scope .compare-left')) {
			const a = getComputedStyle(panel, '::after');
			if (a.content !== 'none' && a.position === 'absolute' && a.top === '0px' && px(a.height) > 0) bar.t = true;
		}
		const edgeEls = s.querySelectorAll(':scope > .slide-edge[data-lattice-berth]');
		if (edgeEls.length !== 1) out.push(`${s.className}: ${edgeEls.length} edge berths (want exactly one, a direct child)`);
		// The edge box covers the slide's BORDER box on every side whose keyline draws, or its
		// corner arc cannot meet the clip-path's (a rounded deck showed a wedge at each top corner).
		if (edgeEls.length === 1) {
			const a = s.getBoundingClientRect();
			const b = edgeEls[0].getBoundingClientRect();
			const off = { t: b.top - a.top, r: a.right - b.right, b: a.bottom - b.bottom, l: b.left - a.left };
			for (const side of ['t', 'r', 'b', 'l']) if (flag(side) === 1 && Math.abs(off[side]) > 0.5) out.push(`${s.className}: the edge box is ${off[side].toFixed(1)}px in from the slide on side ${side}`);
			// …and on a side with a BORDER bar, it reaches under the bar too (the corner meets).
			const bw = { t: cs.borderTopWidth, r: cs.borderRightWidth, b: cs.borderBottomWidth, l: cs.borderLeftWidth };
			for (const side of ['t', 'r', 'b', 'l']) if (px(bw[side]) > 0.5 && Math.abs(off[side]) > 0.5) out.push(`${s.className}: the edge box stops ${off[side].toFixed(1)}px short under the ${side} bar`);
		}
		for (const side of ['t', 'r', 'b', 'l']) {
			const want = bar[side] ? 0 : 1;
			if (flag(side) !== want) out.push(`${s.className}: side ${side} has ${bar[side] ? 'a bar' : 'no bar'} but --_edge-${side} is ${flag(side)}`);
		}
	}
	return out;
}

test('the engine keyline yields to the spectrum bar on exactly the sides the bar is the edge', { timeout: TIMEOUT }, async (t) => {
	const executablePath = resolveChrome();
	if (!executablePath) {
		t.skip('no Chromium in this environment');
		return;
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-edge-census-'));
	const decks = [['gallery', GALLERY]];
	for (const reg of REGISTERS) {
		const name = `registers-${reg.replace(/[^a-z]+/g, '-') || 'default'}`;
		const md = path.join(dir, `${name}.md`);
		fs.writeFileSync(md, `---\nmarp: true\ntheme: indaco\n${reg ? `${reg}\n` : ''}---\n\n${REGISTER_SLIDES.join('\n\n---\n\n')}\n`);
		decks.push([name, md]);
	}
	const browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox'] });
	const mismatches = [];
	let slides = 0;
	try {
		for (const [name, md] of decks) {
			const html = path.join(dir, `${name}.html`);
			const r = spawnSync(process.execPath, [EMULATOR, md, html], { cwd: path.dirname(md), encoding: 'utf8', timeout: TIMEOUT });
			assert.equal(r.status, 0, `${name} rendered: ${r.stderr}`);
			const page = await browser.newPage();
			await page.goto(`file://${html}`, { waitUntil: 'load' });
			slides += await page.evaluate(() => document.querySelectorAll('section[data-lattice-slide]').length);
			for (const m of await page.evaluate(census)) mismatches.push(`${name} · ${m}`);
			await page.close();
		}
	} finally {
		await browser.close();
		fs.rmSync(dir, { recursive: true, force: true });
	}
	assert.ok(slides > 60, `censused the slides (${slides})`);
	assert.deepEqual(mismatches, [], 'a slide whose keyline and spectrum bar disagree about a side');
});
