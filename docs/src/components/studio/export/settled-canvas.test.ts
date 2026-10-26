// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { embeddedPictures, SETTLE_DEADLINE_MS, settle } from './settled-canvas.js';

// WebKit draws an SVG's nested pictures only after the first draw, so the export's single
// html-to-image draw shipped slides with no pictures (followups.d/2640). `settle` warms each picture
// alone until it arrives, draws the slide, and re-warms any picture the decode cache dropped. The
// browser calls are injected: a picture is a scripted sequence of check() answers.
const clock = () => {
	let t = 0;
	return { now: () => t, wait: async (ms: number) => void (t += ms) };
};

/** A picture whose check() answers from a script, repeating the last answer when it runs out. */
const picture = (answers: boolean[]) => {
	let n = 0;
	return { check: () => answers[Math.min(n++, answers.length - 1)] };
};

/** A slide whose draws are numbered, so a test can see which draw shipped. */
const slide = () => {
	let n = 0;
	return { draw: () => n++, count: () => n };
};

describe('settle — the wait for WebKit to decode a slide’s pictures', () => {
	it('draws once and stops when the slide has no picture WebKit decodes late', async () => {
		const s = slide();
		const out = await settle({ pictures: [], drawSlide: s.draw, ...clock() });
		expect(s.count()).toBe(1);
		expect(out.stuck).toEqual([]);
	});

	it('waits for a picture to arrive before it draws the slide, and draws it once', async () => {
		const s = slide();
		const c = clock();
		const out = await settle({ pictures: [picture([false, false, false, true])], drawSlide: s.draw, ...c });
		expect(out.stuck).toEqual([]);
		expect(s.count()).toBe(1);
		expect(c.now()).toBeGreaterThan(0);
	});

	it('takes a picture already decoded (the cache kept it from an earlier slide) with no wait at all', async () => {
		const s = slide();
		const c = clock();
		const out = await settle({ pictures: [picture([true])], drawSlide: s.draw, ...c });
		expect(out.stuck).toEqual([]);
		expect(c.now()).toBe(0);
	});

	it('waits for EVERY picture, not the first to arrive', async () => {
		const s = slide();
		const late = picture([false, false, false, false, false, true]);
		const out = await settle({ pictures: [picture([true]), late], drawSlide: s.draw, ...clock() });
		expect(out.stuck).toEqual([]);
		expect(s.count()).toBe(1);
	});

	it('redraws the slide when the cache dropped a picture between the warm and the draw', async () => {
		const s = slide();
		// Arrives, is gone on the check after the draw, comes back.
		const dropped = picture([true, false, false, true, true]);
		const out = await settle({ pictures: [dropped], drawSlide: s.draw, ...clock() });
		expect(out.stuck).toEqual([]);
		expect(out.canvas).toBe(1);
		expect(s.count()).toBe(2);
	});

	it('is bounded: a picture that never arrives ships at the deadline and is reported', async () => {
		const s = slide();
		const c = clock();
		const out = await settle({ pictures: [picture([true]), picture([false])], drawSlide: s.draw, ...c });
		expect(out.stuck).toEqual([1]);
		expect(c.now()).toBeGreaterThanOrEqual(SETTLE_DEADLINE_MS);
		expect(c.now()).toBeLessThan(SETTLE_DEADLINE_MS + 100);
		expect(s.count()).toBe(1);
	});

	it('gives a cache that keeps dropping a picture three draws, then reports it', async () => {
		const s = slide();
		let n = 0;
		// Arrives on every warm, gone on every check after a draw.
		const flaky = { check: () => n++ % 2 === 0 };
		const out = await settle({ pictures: [flaky], drawSlide: s.draw, ...clock() });
		expect(out.stuck).toEqual([0]);
		expect(s.count()).toBe(3);
	});
});

describe('embeddedPictures', () => {
	// html-to-image's toSvg output: XMLSerializer, then encodeURIComponent.
	const svgUrl = (xml: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

	it('finds each base64 picture once, in <img> src and in a style url(&quot;…&quot;)', () => {
		const png = 'data:image/png;base64,iVBORw0KGgo+/AA==';
		const jpg = 'data:image/jpeg;base64,/9j/4AAQ+Z=';
		const xml = `<svg><img src="${png}"/><img src="${png}"/><div style="background-image: url(&quot;${jpg}&quot;);"></div></svg>`;
		expect(embeddedPictures(svgUrl(xml))).toEqual([png, jpg]);
	});

	it('leaves fonts and utf-8 SVGs alone (a theme mask, `logo: lattice`): WebKit draws those the first time', () => {
		const xml = '<svg><style>@font-face{src:url(data:font/woff2;base64,AAAA)}@font-face{src:url(data:application/font-woff;base64,BBBB)}@font-face{src:url(data:application/x-font-ttf;base64,CCCC)}</style><img src="data:image/svg+xml,%3Csvg/%3E"/></svg>';
		expect(embeddedPictures(svgUrl(xml))).toEqual([]);
	});

	// html-to-image copies a server's Content-Type verbatim, so a picture can arrive with a parameter, a
	// non-image type or no type at all. A regex that wanted `image/<subtype>;base64` skipped all of these,
	// and WebKit shipped them blank with no warning (the checker measured it).
	it('finds a picture whatever media type it arrived with', () => {
		const urls = [
			'data:image/jpeg;charset=binary;base64,/9j/AA==',
			'data:image/jpeg; charset=UTF-8;base64,/9j/BB==',
			'data:binary/octet-stream;base64,/9j/CC==',
			'data:application/octet-stream;base64,/9j/DD==',
			'data:;base64,/9j/EE==',
			'data:image/svg+xml;base64,PHN2Zz4=',
			'data:image/vnd.microsoft.icon;base64,AAAB',
		];
		const xml = `<svg>${urls.map((u) => `<img src="${u}"/>`).join('')}</svg>`;
		expect(embeddedPictures(svgUrl(xml))).toEqual(urls);
	});
});
