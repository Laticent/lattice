/**
 * Unit: what Calco's PPTX writer says that the parity reader cannot see, each held to the spec or to what the browser
 * drew rather than to what pptxgenjs used to write (engineering/decisions/2026-11-13-native-pptx-writer.md §Right, not
 * parity). Every case here replaced a pptxgenjs default:
 * - kerning at every size, as Chromium kerns (pptxgenjs left runs on the 12pt default and set spaced text unkerned);
 * - the run's language from the page, not "en-US" everywhere;
 * - the font's class (PANOSE, pitch and family) from the face or the CSS generic, not "swiss, variable" for every face;
 * - lengths and opacity exact, not rounded through points or whole percents;
 * - a notes page whose slide image has the slide's aspect;
 * - a layout's header and footer flags that say whether it numbers its slides;
 * - document properties that state only what the deck says.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { writePptx } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame, ttf } = require('./_fixtures');

const open = async (deck) => JSZip.loadAsync(await writePptx(JSZip, deck, 'nodebuffer'));
const read = async (zip, name) => zip.file(name).async('string');
const wide = (slides, over = {}) => ({ width: 1280, height: 720, slides, ...over });
const one = (frames, over = {}) => wide([{ image: ONE_PX_PNG, frames }], over);

describe('calco pptx — right, not parity', () => {
	test('every run is kerned at every size: plain, letter-spaced and 9pt alike', async () => {
		const zip = await open(one([frame([[{ text: 'AVATAR', style: style({ size: 12 }) }, { text: 'TRACKED', style: style({ letterSpacing: 2 }) }, { text: 'Body', style: style() }]])]));
		const xml = await read(zip, 'ppt/slides/slide1.xml');
		const runs = xml.match(/<a:rPr [^>]*>/g);
		assert.equal(runs.length, 3);
		for (const r of runs) assert.match(r, / kern="100"/, r);
		assert.doesNotMatch(xml, /kern="0"/, '0 reads as "off" in PowerPoint');
	});

	test('a run takes its own lang, then the deck\'s; a malformed tag is skipped', async () => {
		const zip = await open(
			one(
				[
					frame([
						[
							{ text: 'Ciao', style: style({ lang: 'it-IT' }) },
							{ text: ' x', style: style() },
							{ text: ' y', style: style({ lang: 'not a tag"/>' }) },
						],
					]),
				],
				{ lang: 'fr' },
			),
		);
		const xml = await read(zip, 'ppt/slides/slide1.xml');
		const langs = [...xml.matchAll(/<a:rPr lang="([^"]*)"/g)].map((m) => m[1]);
		assert.deepEqual(langs, ['it-IT', 'fr', 'fr']);
		assert.doesNotMatch(xml, /en-US/);
	});

	test('the notes take the deck\'s language', async () => {
		const zip = await open(wide([{ image: ONE_PX_PNG, frames: [], notes: 'Dites ceci' }], { lang: 'fr-CA' }));
		assert.match(await read(zip, 'ppt/notesSlides/notesSlide1.xml'), /<a:rPr lang="fr-CA"[^>]*\/><a:t>Dites ceci/);
	});

	test('a monospaced face is fixed pitch and modern, read from the face itself', async () => {
		const mono = await ttf('jetbrains-400');
		const zip = await open(one([frame([[{ text: 'code', style: style({ family: 'JetBrains Mono' }) }]])], { fonts: [{ family: 'JetBrains Mono', weight: 400, italic: false, bytes: mono }] }));
		const latin = (await read(zip, 'ppt/slides/slide1.xml')).match(/<a:latin [^>]*>/)[0];
		assert.match(latin, / pitchFamily="49"/, latin);
		assert.match(latin, / panose="[0-9A-F]{20}"/);
	});

	test('a face that leaves its family blank takes the CSS generic; with neither, no claim is made', async () => {
		const zip = await open(
			one([
				frame([
					[
						{ text: 'a', style: style({ family: 'Fraunces', generic: 'serif' }) },
						{ text: 'b', style: style({ family: 'Nowhere Sans', generic: 'sans-serif' }) },
						{ text: 'c', style: style({ family: 'Nowhere Mono', generic: 'monospace' }) },
						{ text: 'd', style: style({ family: 'Nowhere' }) },
					],
				]),
			]),
		);
		const xml = await read(zip, 'ppt/slides/slide1.xml');
		const latin = (family) => xml.match(new RegExp(`<a:latin typeface="${family}"[^>]*>`))[0];
		assert.match(latin('Fraunces'), / pitchFamily="18"/);
		assert.match(latin('Nowhere Sans'), / pitchFamily="34"/);
		assert.match(latin('Nowhere Mono'), / pitchFamily="49"/);
		assert.doesNotMatch(latin('Nowhere'), /pitchFamily|panose|charset/);
	});

	test('line widths and opacity are exact, not rounded through points or whole percents', async () => {
		const box = { kind: 'box', x: 100, y: 100, w: 300, h: 160, radii: [0, 0, 0, 0], fill: { color: '#336699', alpha: 0.125 }, stroke: { color: '#000000', alpha: 1, width: 1.333 } };
		const xml = await read(await open(wide([{ image: ONE_PX_PNG, frames: [], shapes: [box] }])), 'ppt/slides/slide1.xml');
		assert.match(xml, /<a:srgbClr val="336699"><a:alpha val="12500"\/>/);
		assert.match(xml, /<a:ln w="12697"/, '1.333px is 12697 EMU (rounded through points it was 12700)');
	});

	test('the notes page shows a portrait slide undistorted', async () => {
		const zip = await open({ width: 1080, height: 1920, slides: [{ image: ONE_PX_PNG, frames: [], notes: 'n' }] });
		const master = await read(zip, 'ppt/notesMasters/notesMaster1.xml');
		const [, cx, cy] = master.match(/<p:ph type="sldImg"[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/);
		assert.ok(Math.abs(Number(cx) / Number(cy) - 1080 / 1920) < 0.001, `${cx} × ${cy}`);
	});

	test('a layout that numbers its slides says so in its header and footer flags', async () => {
		const number = (n) => frame([[{ text: String(n), style: style({ size: 14 }) }]], { role: 'number', x: 1200, y: 680, w: 40, h: 20 });
		// Chrome moves to a layout only on slides that share a background (masters.ts).
		const zip = await open(wide([1, 2].map((n) => ({ image: ONE_PX_PNG, frames: [number(n)], background: 0 })), { backgrounds: [{ color: '#ffffff' }] }));
		const layout = await read(zip, 'ppt/slideLayouts/slideLayout1.xml');
		assert.match(layout, /<p:hf sldNum="1" hdr="0" ftr="0" dt="0"\/>/);
	});

	test('document properties state only what the deck says', async () => {
		const bare = await open(one([]));
		const core = await read(bare, 'docProps/core.xml');
		const app = await read(bare, 'docProps/app.xml');
		assert.doesNotMatch(core, /<dc:title>|<dc:creator>|<cp:lastModifiedBy>/);
		assert.doesNotMatch(app, /<Company>|<Words>|<Paragraphs>/);
		assert.match(app, /<PresentationFormat>Widescreen<\/PresentationFormat>/);
		const named = await open(one([], { title: 'Q3 review', author: 'A. Author', company: 'Acme' }));
		assert.match(await read(named, 'docProps/core.xml'), /<dc:title>Q3 review<\/dc:title><dc:creator>A\. Author<\/dc:creator>/);
		assert.match(await read(named, 'docProps/app.xml'), /<Company>Acme<\/Company>/);
	});
});
