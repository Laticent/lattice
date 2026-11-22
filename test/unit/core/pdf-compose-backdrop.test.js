// A finish's backdrop as drawing (lib/core/pdf-compose/backdrop.mjs): the pure half, which turns the computed CSS of the
// `.backdrop` layers into primitives. The reader and the writer around it run in a page; test/integration/export/
// pdf-backdrop-vector.test.js renders real decks through the CLI. engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md.
const test = require('node:test');
const assert = require('node:assert/strict');

let bd, compose;
test.before(async () => {
	bd = await import('../../../lib/core/pdf-compose/backdrop.mjs');
	compose = await import('../../../lib/core/pdf-compose/compose.mjs');
});

const ACCENT = 'color(srgb 0 0.435294 0.658824 / 0.13)';
const BOX = [0, 0, 1280, 716];
const WHITE = [255, 255, 255];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('parseColor: the computed forms a finish produces, and nothing else', () => {
	assert.deepEqual(bd.parseColor('rgb(0, 111, 168)'), { c: [0, 111, 168], a: 1, legacy: true });
	assert.deepEqual(bd.parseColor('rgba(0, 0, 0, 0)'), { c: [0, 0, 0], a: 0, legacy: true });
	const c = bd.parseColor(ACCENT);
	near(c.c[2], 168, 0.01, 'color(srgb) scales to 0..255');
	assert.equal(c.a, 0.13);
	assert.equal(c.legacy, false, 'color(srgb) is not a legacy color, so a gradient of it blends in Oklab');
	assert.equal(bd.parseColor('oklch(0.5 0.1 200)'), null, 'an unread form refuses, and the backdrop stays in the photo');
});

test('mixStops: a fade to transparent keeps its hue (premultiplied), in sRGB and in Oklab', () => {
	const ink = bd.parseColor(ACCENT), clear = bd.parseColor('rgba(0, 0, 0, 0)');
	for (const space of ['srgb', 'oklab']) {
		const m = bd.mixStops(ink, clear, 0.5, space);
		near(m.a, 0.065, 1e-9, `${space} alpha halves`);
		for (let k = 0; k < 3; k++) near(m.c[k], ink.c[k], 0.01, `${space} channel ${k} stays the accent, not black`);
	}
	// Oklab and sRGB part ways between two opaque colors: black to white at the midpoint is L 0.5 in Oklab (sRGB 99),
	// against 127.5 blended in sRGB.
	const black = bd.parseColor('color(srgb 0 0 0)'), white = bd.parseColor('color(srgb 1 1 1)');
	near(bd.mixStops(black, white, 0.5, 'oklab').c[0], 99, 1, 'Oklab midpoint');
	near(bd.mixStops(black, white, 0.5, 'srgb').c[0], 127.5, 1e-9, 'sRGB midpoint');
});

test('parseLayer + resolveStops: the computed gradient grammar, calc() ends included', () => {
	const L = bd.parseLayer('linear-gradient(to right, rgba(0, 0, 0, 0) 0px, rgb(0, 0, 0) 128px, rgb(0, 0, 0) calc(100% - 128px), rgba(0, 0, 0, 0) 100%)');
	assert.equal(L.kind, 'linear');
	assert.equal(L.angle, 90);
	assert.deepEqual(bd.resolveStops(L.stops, 1000).map((s) => s.u), [0, 128, 872, 1000]);
	const R = bd.parseLayer(`radial-gradient(120% 90% at 100% 0%, ${ACCENT} 0%, rgba(0, 0, 0, 0) 60%)`);
	assert.deepEqual(R.radial.size, ['120%', '90%']);
	assert.deepEqual(R.radial.at, ['100%', '0%']);
	assert.equal(R.space, 'oklab');
	// CSS's fix-up: an unpositioned stop spreads between its neighbors, and a stop never goes back.
	const F = bd.parseLayer('linear-gradient(rgb(0, 0, 0), rgb(1, 1, 1), rgb(2, 2, 2) 10%, rgb(3, 3, 3) 5%)');
	assert.deepEqual(bd.resolveStops(F.stops, 100).map((s) => s.u), [0, 5, 10, 10]);
	assert.equal(bd.parseLayer('url(a.png)').refuse, 'backdrop-image');
	assert.equal(bd.parseLayer('linear-gradient(rgb(0, 0, 0), 30%, rgb(1, 1, 1))').refuse, 'backdrop-hint');
	assert.equal(bd.parseLayer('linear-gradient(to top right, rgb(0, 0, 0), rgb(1, 1, 1))').refuse, 'backdrop-angle');
});

test('radialRadii: explicit sizes, and CSS extent keywords for a circle and an ellipse', () => {
	assert.deepEqual(bd.radialRadii({ size: ['120%', '90%'] }, 1000, 500, 1000, 0), [1200, 450]);
	const [r] = bd.radialRadii({ shape: 'circle', extent: 'farthest-corner' }, 300, 400, 0, 0);
	near(r, 500, 1e-9, 'farthest corner of a 300x400 box from its corner');
	const [rx, ry] = bd.radialRadii({ shape: 'ellipse', extent: 'farthest-corner' }, 100, 50, 50, 25);
	near(rx, 50 * Math.SQRT2, 1e-9, 'ellipse through the corner keeps the side ratio');
	near(ry, 25 * Math.SQRT2, 1e-9, 'ellipse through the corner keeps the side ratio');
});

test('a repeating texture becomes stripes of one color, never a ramp; a ramp in it is refused', () => {
	const weave = bd.backdropPrims({ stack: [{ image: 'repeating-linear-gradient(45deg, color(srgb 0 0.4 0.6 / 0.09) 0px, color(srgb 0 0.4 0.6 / 0.09) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 34px)', size: 'auto', position: '0% 0%', repeat: 'repeat' }], box: BOX, bg: WHITE });
	assert.equal(weave.prims.length, 1);
	const [f] = weave.prims;
	assert.equal(f.kind, 'fill');
	assert.equal(f.a, 0.09, 'the band keeps its own alpha: a constant-opacity fill');
	const stripes = f.path.filter(([cmd]) => cmd === 'M').length;
	const span = 1280 * Math.SQRT1_2 + 716 * Math.SQRT1_2;
	assert.ok(stripes >= Math.floor(span / 34) && stripes <= Math.ceil(span / 34) + 2, `one stripe a period across the box: ${stripes}`);
	const ramp = bd.backdropPrims({ stack: [{ image: 'repeating-linear-gradient(rgb(0, 0, 0) 0px, rgb(255, 255, 255) 10px)', size: 'auto', position: '0% 0%', repeat: 'repeat' }], box: BOX, bg: WHITE });
	assert.equal(ramp.refuse, 'backdrop-texture-ramp');
});

test('rings and dots: a repeating radial is rings to the far corner, a small tiled radial is one disk a tile', () => {
	const rings = bd.backdropPrims({ stack: [{ image: 'repeating-radial-gradient(circle at 50% 42%, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 56px, color(srgb 0 0.4 0.6 / 0.08) 56px, color(srgb 0 0.4 0.6 / 0.08) 57px)', size: 'auto', position: '0% 0%', repeat: 'repeat' }], box: BOX, bg: WHITE });
	const far = Math.hypot(640, 716 * 0.58);
	const outlines = rings.prims[0].path.filter(([cmd]) => cmd === 'M').length;
	assert.equal(outlines, 2 * (Math.floor((far - 56) / 57) + 1), 'an outer and an inner ellipse for each ring that reaches the box');
	const dots = bd.backdropPrims({ stack: [{ image: 'radial-gradient(color(srgb 0 0.4 0.6 / 0.15) 0px, color(srgb 0 0.4 0.6 / 0.15) 1.3px, rgba(0, 0, 0, 0) 1.7px)', size: '26px 26px', position: '0% 0%', repeat: 'repeat' }], box: BOX, bg: WHITE });
	assert.equal(dots.prims[0].path.filter(([cmd]) => cmd === 'M').length, Math.ceil(1280 / 26) * Math.ceil(716 / 26));
	const blob = bd.backdropPrims({ stack: [{ image: 'radial-gradient(rgb(0, 0, 0) 0px, rgba(0, 0, 0, 0) 10px)', size: '26px 26px', position: '0% 0%', repeat: 'repeat' }], box: BOX, bg: WHITE });
	assert.equal(blob.refuse, 'backdrop-tile', 'a soft blob in a small tile is not a dot texture: it stays in the photo');
});

test('the glows under the first texture are one opaque picture blended onto the slide color', () => {
	const got = bd.backdropPrims({ stack: [{
		image: `repeating-linear-gradient(0deg, color(srgb 0 0.4 0.6 / 0.09) 0px, color(srgb 0 0.4 0.6 / 0.09) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 38px), radial-gradient(120% 90% at 100% 0%, ${ACCENT} 0%, rgba(0, 0, 0, 0) 60%)`,
		size: 'auto, cover', position: '0% 0%, 0% 0%', repeat: 'repeat, no-repeat',
	}], box: BOX, bg: WHITE });
	assert.deepEqual(got.prims.map((p) => p.kind), ['rgbmap', 'fill'], 'the glow (bottom layer) flattens; the grid above it stays a path');
	const m = got.prims[0];
	assert.equal(m.w, Math.ceil(1280 / bd.ALPHA_STEP));
	const px = (x, y) => { const o = (Math.floor(y / bd.ALPHA_STEP) * m.w + Math.floor(x / bd.ALPHA_STEP)) * 3; return [m.data[o], m.data[o + 1], m.data[o + 2]]; };
	assert.deepEqual(px(4, 700), WHITE, 'past the glow the picture is the slide color');
	// At the glow's center: 13% of the accent (0, 111, 168) over white.
	const c = px(1278, 2);
	near(c[0], 255 * 0.87, 1.5, 'red');
	near(c[1], 111 * 0.13 + 255 * 0.87, 1.5, 'green');
	near(c[2], 168 * 0.13 + 255 * 0.87, 1.5, 'blue');
});

test('fades of one color above a texture merge into one opacity map; the clear panel is the product of its ramps', () => {
	const ramp = (dir) => `linear-gradient(${dir}rgba(0, 0, 0, 0) 0px, rgb(0, 0, 0) 128px, rgb(0, 0, 0) calc(100% - 128px), rgba(0, 0, 0, 0) 100%)`;
	const got = bd.backdropPrims({ stack: [
		{ image: 'repeating-linear-gradient(rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 39px, color(srgb 0 0.4 0.6 / 0.1) 39px, color(srgb 0 0.4 0.6 / 0.1) 40px)', size: 'auto', position: '0% 0%', repeat: 'repeat' },
		{ image: 'linear-gradient(rgb(30, 26, 21), rgb(30, 26, 21))', size: 'calc(100% + 256px) calc(100% + 256px)', position: '-128px -128px', repeat: 'no-repeat', box: [120, 232, 1096, 256], clip: [0, 0, 1280, 716],
			mask: { image: `${ramp('to right, ')}, ${ramp('')}`, size: 'calc(100% + 256px) calc(100% + 256px), calc(100% + 256px) calc(100% + 256px)', position: '-128px -128px, -128px -128px', repeat: 'no-repeat, no-repeat', composite: 'intersect, intersect', box: [120, 232, 1096, 256] } },
	], box: BOX, bg: [10, 10, 10] });
	assert.deepEqual(got.prims.map((p) => p.kind), ['fill', 'alphamap']);
	const m = got.prims[1];
	assert.deepEqual(m.c, [30, 26, 21]);
	const at = (x, y) => m.data[Math.floor((y - m.clip[1]) / (m.clip[3] / m.h)) * m.w + Math.floor((x - m.clip[0]) / (m.clip[2] / m.w))];
	assert.equal(at(640, 360), 255, 'the panel core is opaque');
	near(at(56, 360), 255 * (64 / 128), 8, 'halfway up the left ramp (sample centers fall 2 px off the line)');
	near(at(56, 168), 255 * (64 / 128) ** 2, 8, 'a corner multiplies both ramps');
	near(at(2, 360), 255 * (10 / 128), 8, 'the bleed starts 8 px left of the slide: 10 px into the ramp at x 2');
	assert.equal(m.clip[1], 232 - 128, 'the map starts where the bleed does, above the panel');
	assert.ok(at(640, 105) <= 4, 'and its first row is all but clear');
	// Two same-colored fades in a row are one map: 1 - (1 - a1)(1 - a2), not two layers.
	const twin = bd.backdropPrims({ stack: [
		{ image: 'repeating-linear-gradient(rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 39px, rgb(1, 2, 3) 39px, rgb(1, 2, 3) 40px)', size: 'auto', position: '0% 0%', repeat: 'repeat' },
		{ image: 'radial-gradient(50% 50% at 25% 50%, rgba(9, 9, 9, 0.5) 0%, rgba(9, 9, 9, 0) 100%), radial-gradient(50% 50% at 75% 50%, rgba(9, 9, 9, 0.5) 0%, rgba(9, 9, 9, 0) 100%)', size: 'cover, cover', position: '0% 0%, 0% 0%', repeat: 'no-repeat, no-repeat' },
	], box: BOX, bg: WHITE });
	assert.deepEqual(twin.prims.map((p) => p.kind), ['fill', 'alphamap']);
});

test('a radial glow is clipped to the ring where it still paints; a vignette has its empty middle cut out', () => {
	const glow = bd.layerPrims(bd.parseLayer(`radial-gradient(60% 60% at 12% 18%, ${ACCENT} 0%, rgba(0, 0, 0, 0) 60%)`), BOX, BOX, false);
	// Through backdropPrims (which trims), as an upper layer so it is not flattened: a fill below it.
	const got = bd.backdropPrims({ stack: [
		{ image: 'repeating-linear-gradient(rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 39px, rgb(1, 2, 3) 39px, rgb(1, 2, 3) 40px)', size: 'auto', position: '0% 0%', repeat: 'repeat' },
		{ image: `radial-gradient(60% 60% at 12% 18%, ${ACCENT} 0%, rgba(0, 0, 0, 0) 60%)`, size: 'cover', position: '0% 0%', repeat: 'no-repeat' },
	], box: BOX, bg: WHITE });
	const map = got.prims.find((p) => p.kind === 'alphamap');
	const rx = 0.6 * 1280 * 0.6;
	near(map.clip[2], 0.12 * 1280 + rx, 1, `trimmed to the glow's reach, no further and no less`);
	assert.equal(glow.prims[0].clip[2], 1280, 'untrimmed, it would cover the box');
	// A vignette: clear inside 62% of its radius, ink outside it. The middle is cut out (`hole`), and the map reads zero there.
	const vig = bd.backdropPrims({ stack: [
		{ image: 'repeating-linear-gradient(rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 39px, rgb(1, 2, 3) 39px, rgb(1, 2, 3) 40px)', size: 'auto', position: '0% 0%', repeat: 'repeat' },
		{ image: 'radial-gradient(78% 78%, rgba(9, 9, 9, 0) 62%, rgba(9, 9, 9, 0.3) 100%)', size: 'cover', position: '0% 0%', repeat: 'no-repeat' },
	], box: BOX, bg: WHITE }).prims.find((p) => p.kind === 'alphamap');
	const v = (x, y) => vig.data[Math.floor(y / bd.ALPHA_STEP) * vig.w + Math.floor(x / bd.ALPHA_STEP)];
	assert.equal(v(640, 358), 0, 'clear in the middle');
	assert.ok(v(2, 2) > 40, `ink in the corner: ${v(2, 2)}`);
});

test('inkBoxes: a mostly empty photo keeps only the boxes that hold ink', () => {
	const W = 200, H = 100;
	const a = new Uint8Array(W * H);
	for (let y = 5; y < 10; y++) for (let x = 5; x < 20; x++) a[y * W + x] = 255; // a header, top left
	for (let y = 90; y < 95; y++) for (let x = 180; x < 190; x++) a[y * W + x] = 255; // a page number, bottom right
	assert.deepEqual(compose.inkBoxes(a, W, H, 8), [[4, 4, 17, 7], [179, 89, 12, 7]]);
	assert.deepEqual(compose.inkBoxes(new Uint8Array(W * H), W, H, 8), [], 'an empty photo is no picture at all');
	const many = new Uint8Array(W * H);
	for (let k = 0; k < 30; k++) many[(k * 3) * W + k * 6] = 255;
	assert.equal(compose.inkBoxes(many, W, H, 1).length, 1, `past ${compose.MAX_INK_BOXES} boxes, one box holds them all`);
});

test('a spotlight scrim (transparent in its window, opaque slide color outside it) is never trimmed away', () => {
	// The opaque slide color is "nothing" only for the bottom glow, which is blended onto that color. Above a texture, the
	// scrim's opaque canvas covers the finish outside the window; trimming it as empty printed the rings everywhere but there.
	const got = bd.backdropPrims({ stack: [
		{ image: 'repeating-radial-gradient(circle at 50% 42%, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 56px, rgb(1, 2, 3) 56px, rgb(1, 2, 3) 57px)', size: 'auto', position: '0% 0%', repeat: 'repeat' },
		{ image: 'radial-gradient(30% 30% at 78% 26%, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.5) 50%, rgb(255, 255, 255) 70%)', size: 'cover', position: '0% 0%', repeat: 'no-repeat', box: BOX, clip: BOX },
	], box: BOX, bg: WHITE });
	const scrim = got.prims.find((p) => p.kind === 'alphamap');
	assert.deepEqual(scrim.clip, BOX, 'the scrim covers the whole backdrop');
	const at = (x, y) => scrim.data[Math.floor(y / bd.ALPHA_STEP) * scrim.w + Math.floor(x / bd.ALPHA_STEP)];
	assert.equal(at(20, 700), 255, 'far from the window, the scrim is opaque');
	assert.ok(at(Math.round(0.78 * 1280), Math.round(0.26 * 716)) < 8, 'in the window, clear');
});

test('a wide-gamut color is clipped as the screen clips it, never wrapped or thrown', () => {
	const c = bd.parseColor('color(srgb -0.369865 0.785229 1.6 / 0.09)');
	assert.deepEqual(c.c.map(Math.round), [0, 200, 255]);
	const got = bd.backdropPrims({ stack: [{ image: 'linear-gradient(color(srgb -0.37 0.785 -0.23), color(srgb -0.37 0.785 -0.23))', size: 'cover', position: '0% 0%', repeat: 'no-repeat' }], box: BOX, bg: WHITE });
	assert.deepEqual([...got.prims[0].data.slice(0, 3)], [0, 200, 0], 'the glow picture holds the clipped color, not 162, 200, 197');
});

test('a hard edge or a strip is not blurred into the quarter-resolution picture', () => {
	// strata's thin bar along the top: a strip of the box, so it stays a vector shading of its own.
	const strip = bd.backdropPrims({ stack: [{ image: 'linear-gradient(90deg, rgb(0, 111, 168) 0%, rgba(0, 111, 168, 0.35) 55%, rgba(0, 0, 0, 0) 100%)', size: '100% 3.5712px', position: '0% 0%', repeat: 'no-repeat' }], box: BOX, bg: WHITE });
	assert.deepEqual(strip.prims.map((p) => p.kind), ['shade']);
	// A band with hard stops across the whole box: also a shading, whose edges are exact.
	const band = bd.backdropPrims({ stack: [{ image: 'linear-gradient(rgb(255, 0, 0) 0px, rgb(255, 0, 0) 6px, rgba(0, 0, 0, 0) 6px)', size: 'cover', position: '0% 0%', repeat: 'no-repeat' }], box: BOX, bg: WHITE });
	assert.deepEqual(band.prims.map((p) => p.kind), ['shade']);
});

test('rings that start far out are counted from where the loop starts: the cap holds', () => {
	// Five inked bands in each 1 px period, the first stop 3000 px out: about 3,700 rings reach the box, past the cap.
	// Counted from k1 alone (negative here), the cap let them all through: 293k curve operators on one page.
	const stops = Array.from({ length: 10 }, (_, i) => {
		const c = i % 2 ? 'rgba(0, 0, 0, 0)' : 'rgb(1, 2, 3)';
		return `${c} ${3000 + i / 10}px, ${c} ${3000 + (i + 1) / 10}px`;
	}).join(', ');
	const got = bd.backdropPrims({ stack: [{ image: `repeating-radial-gradient(circle at 50% 50%, ${stops})`, size: 'auto', position: '0% 0%', repeat: 'repeat' }], box: BOX, bg: WHITE });
	assert.equal(got.refuse, 'backdrop-too-many-bands');
});

test('pngHasAlpha: only an RGBA or gray-alpha PNG is a transparent photo', () => {
	const ihdr = (type) => { const b = new Uint8Array(33); b[25] = type; return b; };
	assert.equal(compose.pngHasAlpha(ihdr(6)), true);
	assert.equal(compose.pngHasAlpha(ihdr(4)), true);
	assert.equal(compose.pngHasAlpha(ihdr(2)), false, 'an opaque RGB screenshot would bury the drawing');
});

test("the section's own strip (a hairline) goes above the glow picture, so the glows still flatten", () => {
	const got = bd.backdropPrims({ stack: [
		{ image: 'linear-gradient(90deg, rgb(10, 20, 30), rgb(40, 50, 60))', size: '100% 1px', position: '0% 0%', repeat: 'no-repeat', box: BOX, clip: BOX, section: true },
		{ image: `radial-gradient(120% 90% at 100% 0%, ${ACCENT} 0%, rgba(0, 0, 0, 0) 60%)`, size: 'cover', position: '0% 0%', repeat: 'no-repeat' },
	], box: BOX, bg: WHITE });
	assert.deepEqual(got.prims.map((p) => p.kind), ['rgbmap', 'shade'], 'the glow is the picture; the 1 px strip draws over it, sharp');
});
