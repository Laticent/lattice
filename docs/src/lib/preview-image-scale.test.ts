// Preview-sized photo copies (./preview-image-scale.ts). The worker and the browser's image
// pipeline are stubbed: what is pinned here is the CONTRACT around them — a frame never receives
// an original address for a photo a copy is being made of, a host waiting on a copy is told when
// it lands, and a photo the worker cannot read falls back to its original address exactly once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import remoteRefModule from '../../../lib/core/remote-ref.js';
import * as scale from './preview-image-scale';

const remoteRef = remoteRefModule as unknown as scale.RemoteRefLike;
/** What single-slide-render hands the rewrite: remote-ref itself, and the reader's allowed web
 *  origins (the site's own origin and the page's `blob:` Library photos are allowed besides). */
const ALLOWED = ['https://lattice.example', 'https://images.example'];
const deps = (allowed = ALLOWED): [scale.RemoteRefLike, string[]] => [remoteRef, allowed];

const BASE = 'https://lattice.example/studio/';
const PHOTO = 'https://images.example/photo-1.jpg';
const panel = (url: string) => `<section class="image"><div class="lattice-bg" style="background-image:url(&quot;${url}&quot;);background-size:cover"></div><h2>Hi</h2></section>`;

let posted: { id: number; url: string; tier: number }[] = [];
let created = 0;
let terminated = 0;

class FakeWorker {
	onmessage: ((e: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	constructor() {
		created++;
		current = this;
	}
	postMessage(job: { id: number; url: string; tier: number }) {
		posted.push(job);
	}
	terminate() {
		terminated++;
	}
}
let current: FakeWorker | null = null;
const reply = (data: object) => current?.onmessage?.({ data } as MessageEvent);

beforeEach(() => {
	posted = [];
	created = 0;
	terminated = 0;
	vi.useFakeTimers();
	vi.stubGlobal('Worker', FakeWorker);
	vi.stubGlobal('createImageBitmap', () => {});
	vi.stubGlobal('OffscreenCanvas', class {});
	let n = 0;
	URL.createObjectURL = vi.fn(() => `blob:${BASE}${++n}`);
	URL.revokeObjectURL = vi.fn();
	scale.reset();
});
afterEach(() => {
	scale.reset();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('preview-sized photo copies', () => {
	it('picks the smallest tier that covers the host at its pixel ratio', () => {
		expect(scale.tierFor(110, 3)).toBe(640);
		expect(scale.tierFor(390, 3)).toBe(1280);
		expect(scale.tierFor(600, 3)).toBe(1920);
	});

	it('makes no copy where it does not pay: past 1920px, or past 1280px with a fine pointer (a desktop)', () => {
		expect(scale.tierFor(1440, 2, false), 'a Retina main preview keeps its original').toBe(0);
		expect(scale.tierFor(932, 3, true), 'a phone\'s landscape Present gets the 1920 copy, never the original').toBe(1920);
		expect(scale.tierFor(960, 2, false), 'a desktop main preview keeps its original').toBe(0);
		expect(scale.tierFor(260, 2, false), 'a desktop thumbnail still gets a copy').toBe(640);
		expect(scale.tierFor(800, 1, false), 'a DPR-1 desktop main preview keeps its original').toBe(0);
		expect(scale.tierFor(640, 2, false), 'a Retina side pane keeps its original').toBe(0);
		expect(scale.tierFor(480, 2, false), 'the widest desktop thumbnail gets a copy').toBe(1280);
		expect(scale.rewrite(panel(PHOTO), 0, new EventTarget(), BASE, ...deps()).html).toBe(panel(PHOTO));
	});

	it('never hands the frame the original while a copy is being made, and paints the panel meanwhile', () => {
		const host = new EventTarget();
		const out = scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		expect(out.pending).toBe(1);
		expect(out.html).not.toContain(PHOTO);
		expect(out.html).toContain('background-image:none');
		expect(out.html).toContain('<div data-lattice-painting="" class="lattice-bg"');
		expect(posted).toEqual([{ id: expect.any(Number), url: PHOTO, tier: 640, shape: 0.75, wrap: false }]);
	});

	it('tells the waiting host when the copy lands, then serves the copy with its size known', () => {
		const host = new EventTarget();
		const ready = vi.fn();
		host.addEventListener(scale.READY_EVENT, ready);
		const sized = vi.fn();
		scale.onCopySized(sized);
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		expect(ready).toHaveBeenCalledTimes(1);
		const after = scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		expect(after.pending).toBe(0);
		expect(after.html).toContain(`url(blob:${BASE}`);
		expect(after.html).not.toContain(PHOTO);
		expect(after.html).not.toContain('data-lattice-painting');
		expect(sized).toHaveBeenCalledWith(expect.stringMatching(/^blob:/), 640, 480);
		scale.onCopySized(null);
	});

	it('falls back to the original when the worker cannot read the photo, and tries again later', () => {
		const host = new EventTarget();
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		reply({ id: posted[0].id, error: 'TypeError: Load failed' });
		const after = scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		expect(after.html).toBe(panel(PHOTO));
		expect(posted).toHaveLength(1);
		// A timeout on a slow network is not a verdict for the whole session.
		vi.advanceTimersByTime(scale.FAILURE_RETRY_MS + 1);
		// The retry keeps showing the original until the copy lands: it never blanks the photo.
		expect(scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps()).html).toBe(panel(PHOTO));
		expect(posted).toHaveLength(2);
	});

	it('one job per photo and tier, however many hosts ask', () => {
		const a = new EventTarget();
		const b = new EventTarget();
		const fa = vi.fn();
		const fb = vi.fn();
		a.addEventListener(scale.READY_EVENT, fa);
		b.addEventListener(scale.READY_EVENT, fb);
		scale.rewrite(panel(PHOTO), 640, a, BASE, ...deps());
		scale.rewrite(panel(PHOTO), 640, b, BASE, ...deps());
		expect(posted).toHaveLength(1);
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		expect(fa).toHaveBeenCalledTimes(1);
		expect(fb).toHaveBeenCalledTimes(1);
	});

	it('makes the photo a host is showing before the prefetches queued ahead of it', () => {
		const warmed = ['a', 'b', 'c'].map((n) => `https://images.example/warm-${n}.jpg`);
		for (const u of warmed) expect(scale.warm(u, 640)).toBe(true);
		// The first warm job is already with the worker; b and c wait.
		expect(posted.map((j) => j.url)).toEqual([warmed[0]]);
		scale.rewrite(panel(PHOTO), 640, new EventTarget(), BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		expect(posted[1].url, 'the shown photo waited behind the prefetches').toBe(PHOTO);
		// A photo already queued by a prefetch moves up when a host asks for it.
		reply({ id: posted[1].id, blob: new Blob(['x']), width: 640, height: 480 });
		expect(posted[2].url).toBe(warmed[1]);
		scale.warm('https://images.example/warm-d.jpg', 640);
		scale.rewrite(panel('https://images.example/warm-d.jpg'), 640, new EventTarget(), BASE, ...deps());
		reply({ id: posted[2].id, blob: new Blob(['x']), width: 640, height: 480 });
		expect(posted[3].url).toBe('https://images.example/warm-d.jpg');
	});

	it('leaves SVG, GIF, data: and another origin\'s blob: addresses alone', () => {
		const host = new EventTarget();
		for (const url of ['https://images.example/logo.svg', 'https://images.example/anim.gif', 'data:image/png;base64,AAAA', 'blob:https://x/1']) {
			expect(scale.rewrite(panel(url), 640, host, BASE, ...deps()).html).toBe(panel(url));
		}
		expect(posted).toHaveLength(0);
	});

	it('resolves a relative address against the page, as the frame would', () => {
		scale.rewrite(panel('/images/team.jpg'), 640, new EventTarget(), BASE, ...deps());
		expect(posted[0].url).toBe('https://lattice.example/images/team.jpg');
	});

	it('stops the worker once idle, which is what gives its full-size decode back', () => {
		scale.rewrite(panel(PHOTO), 640, new EventTarget(), BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		expect(terminated).toBe(0);
		vi.advanceTimersByTime(scale.WORKER_IDLE_MS + 1);
		expect(terminated).toBe(1);
	});

	it('is a no-op where the engine cannot make copies', () => {
		vi.stubGlobal('OffscreenCanvas', undefined);
		expect(scale.rewrite(panel(PHOTO), 640, new EventTarget(), BASE, ...deps()).html).toBe(panel(PHOTO));
		expect(created).toBe(0);
	});
});

// The adversarial review of #2998 (red team, inversion, checker). Each case below was reproduced
// against the first version of the rewrite, which read markup with regexes.
describe('what the rewrite must never touch', () => {
	const EVIL = 'https://evil.example/beacon.jpg';

	it('never hands the worker an origin the reader did not allow (the worker runs where no frame policy does)', () => {
		const out = scale.rewrite(panel(EVIL), 640, new EventTarget(), BASE, ...deps());
		expect(out.html).toBe(panel(EVIL));
		expect(posted).toHaveLength(0);
	});

	it('reads only real style attributes: not a style= inside alt or title text, a comment, a textarea or a script', () => {
		const shapes = [
			`<section><img alt="a style='background:url(${EVIL})' x" src="own.png"></section>`,
			`<section><a title="t style='background:url(${EVIL})'" href="#">x</a></section>`,
			`<section><!-- <div style="background:url(${EVIL})"></div> --></section>`,
			`<section><textarea><div style="background:url(${EVIL})"></div></textarea></section>`,
			`<section><script type="text/plain"><div style="background:url(${EVIL})"></div></script></section>`,
		];
		// Even with every origin allowed, none of these is a background the frame would paint.
		const everything = deps(['https://evil.example', 'https://lattice.example']);
		for (const html of shapes) expect(scale.rewrite(html, 640, new EventTarget(), BASE, ...everything).html).toBe(html);
		// (The <img>'s own same-origin src is a photo and gets a copy; nothing from evil.example is queued.)
		expect(posted.filter((j) => j.url.includes('evil'))).toHaveLength(0);
	});

	it('scales a photo only in background and background-image: not a custom property, an SVG paint, a mask or a fragment', () => {
		const shapes = [
			'<section style="--background-image:&quot;url(\\&quot;https://images.example/a.jpg\\&quot;)&quot;"></section>',
			'<svg><path style="fill:url(#grad)"></path></svg>',
			'<div class="lattice-bg" style="background-image:url(#grad)"></div>',
			'<span class="logo-mark" style="mask-image:url(https://images.example/logo.png)"></span>',
			'<section style="--deck-logo-filter:url(#deck-logo-tint-1)"></section>',
		];
		for (const html of shapes) expect(scale.rewrite(html, 640, new EventTarget(), BASE, ...deps()).html).toBe(html);
		expect(posted).toHaveLength(0);
	});

	it('scales the real declaration of an engine-shaped full-slide background, once, and leaves its string copy alone', () => {
		const section = `<section style="background-image:url(&quot;${PHOTO}&quot;);background-position:center;--background-image:&quot;url(\\&quot;${PHOTO}\\&quot;)&quot;"><h2>Hi</h2></section>`;
		const out = scale.rewrite(section, 640, new EventTarget(), BASE, ...deps());
		expect(posted.map((j) => j.url)).toEqual([PHOTO]);
		expect(out.html).toContain('background-image:none;');
		expect(out.html).toContain(`--background-image:&quot;url(\\&quot;${PHOTO}`);
		// The Underpainting is drawn on image panels only, so a section is not stamped with it.
		expect(out.html).not.toContain('data-lattice-painting');
	});

	it('reads a crafted tag in linear time (the regex took ~3 s on 3.4 KB)', () => {
		const crafted = `<section><div class="lattice-bg" style="background-image:url(${PHOTO})"></div>${`<a"`.repeat(4000)}'</section>`;
		const t = performance.now();
		scale.rewrite(crafted, 640, new EventTarget(), BASE, ...deps());
		expect(performance.now() - t).toBeLessThan(250);
	});
});

describe('the cache, the queue and the worker', () => {
	it('scales a Library photo (the page\'s own blob: URL), which is where a camera-roll photo lives', () => {
		const library = `blob:${window.location.origin}/0f1e2d3c`;
		const out = scale.rewrite(panel(library), 640, new EventTarget(), BASE, ...deps());
		expect(posted.map((j) => j.url)).toEqual([library]);
		expect(out.html).not.toContain(library);
	});

	it('never copies one of its own copies', () => {
		const host = new EventTarget();
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		const copy = /url\((blob:[^)]+)\)/.exec(scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps()).html)?.[1] as string;
		expect(copy).toMatch(/^blob:/);
		expect(scale.rewrite(panel(copy), 640, host, BASE, ...deps()).html).toBe(panel(copy));
		expect(posted).toHaveLength(1);
	});

	it('shows a copy made at another tier while the asked-for one is made, so a resize never blanks a photo', () => {
		const host = new EventTarget();
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		const bigger = scale.rewrite(panel(PHOTO), 1280, host, BASE, ...deps());
		expect(bigger.pending).toBe(0);
		expect(bigger.html).toMatch(/background-image:url\(blob:/);
		expect(posted.map((j) => j.tier)).toEqual([640, 1280]);
	});

	it('never evicts the copy that just landed, so one bigger than the cache cannot loop', () => {
		const host = new EventTarget();
		const ready = vi.fn();
		host.addEventListener(scale.READY_EVENT, ready);
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		const huge = new Blob([new Uint8Array(scale.CACHE_MAX_BYTES + 1)]);
		reply({ id: posted[0].id, blob: huge, width: 640, height: 480 });
		// Even long after, a copy that is still being shown is not dropped and re-made.
		vi.advanceTimersByTime(scale.RECENT_MS * 2);
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		const after = scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		expect(after.html).toMatch(/url\(blob:/);
		expect(posted).toHaveLength(1);
		expect(ready).toHaveBeenCalledTimes(1);
	});

	it('gives every photo its original when the worker cannot start (a worker-src policy fails it asynchronously)', () => {
		const host = new EventTarget();
		const ready = vi.fn();
		host.addEventListener(scale.READY_EVENT, ready);
		expect(scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps()).html).not.toContain(PHOTO);
		// Measured in Chromium, WebKit and Firefox: a refused blob: worker raises `error`, it never throws.
		current?.onerror?.();
		expect(ready).toHaveBeenCalledTimes(1);
		expect(scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps()).html).toBe(panel(PHOTO));
		expect(scale.rewrite(panel('https://images.example/two.jpg'), 640, host, BASE, ...deps()).html).toBe(panel('https://images.example/two.jpg'));
		expect(created, 'it kept starting workers that cannot run').toBe(1);
	});

	it('gives up on a job the worker never answers (stopped by the system), and moves on', () => {
		const host = new EventTarget();
		const ready = vi.fn();
		host.addEventListener(scale.READY_EVENT, ready);
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		scale.rewrite(panel('https://images.example/next.jpg'), 640, host, BASE, ...deps());
		expect(posted).toHaveLength(1);
		vi.advanceTimersByTime(scale.JOB_TIMEOUT_MS + 1);
		expect(ready).toHaveBeenCalledTimes(1);
		expect(scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps()).html).toBe(panel(PHOTO));
		expect(posted.map((j) => j.url)).toEqual([PHOTO, 'https://images.example/next.jpg']);
	});

	it('warms a relative prefetch address under the same key the rewrite uses, so it is not fetched twice', () => {
		expect(scale.warm('/images/team.jpg', 640, BASE)).toBe(true);
		scale.rewrite(panel('/images/team.jpg'), 640, new EventTarget(), BASE, ...deps());
		expect(posted.map((j) => j.url)).toEqual(['https://lattice.example/images/team.jpg']);
	});
});

describe('round 2 of the review', () => {
	it('escapes a quote in an unquoted style value, so the rewrite cannot add attributes after the sanitizer gate', () => {
		const html = '<div><img alt="x" style=background:url(/a.jpg);x:"src=https://beacon.images.example/b.png></div>';
		const out = scale.rewrite(html, 640, new EventTarget(), BASE, ...deps()).html;
		const img = new DOMParser().parseFromString(out, 'text/html').querySelector('img');
		expect(img?.getAttribute('src'), 'the rewrite created a src attribute').toBeNull();
		expect([...(img?.attributes ?? [])].map((a) => a.name).sort()).toEqual(['alt', 'data-lattice-painting', 'style']);
	});

	it('reads a style attribute in one linear pass (the per-url rescan took ~43 s on 384 KB)', () => {
		const html = `<div style="mask:${Array(32000).fill('url(/a.jpg)').join(',')}"></div>`;
		const t = performance.now();
		scale.rewrite(html, 640, new EventTarget(), BASE, ...deps());
		expect(performance.now() - t).toBeLessThan(1500);
	});

	it('attributes each url to its own declaration, through strings and parentheses that hold ; and :', () => {
		const html = `<div style="font-family:'a;b:c';mask:url(&quot;/m.png&quot;);background-image:url(/x.jpg)"></div>`;
		scale.rewrite(html, 640, new EventTarget(), BASE, ...deps());
		expect(posted.map((j) => j.url)).toEqual(['https://lattice.example/x.jpg']);
	});

	it('leaves an image-set() alone: none is not a valid candidate, and the browser loads only one', () => {
		const html = '<div class="lattice-bg" style="background-image:image-set(url(/a.jpg) 1x, url(/b.jpg) 2x)"></div>';
		expect(scale.rewrite(html, 640, new EventTarget(), BASE, ...deps()).html).toBe(html);
		expect(posted).toHaveLength(0);
	});

	it('reads the first style attribute only, as the browser does', () => {
		const html = '<div class="lattice-bg" style style="background-image:url(/a.jpg)"></div>';
		expect(scale.rewrite(html, 640, new EventTarget(), BASE, ...deps()).html).toBe(html);
		expect(posted).toHaveLength(0);
	});

	it('shows the copy already made to a second host that asks while the bigger one is made', () => {
		const a = new EventTarget();
		scale.rewrite(panel(PHOTO), 640, a, BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		scale.rewrite(panel(PHOTO), 1280, a, BASE, ...deps());
		const second = scale.rewrite(panel(PHOTO), 1280, new EventTarget(), BASE, ...deps());
		expect(second.html).toMatch(/background-image:url\(blob:/);
	});

	it('sizes a copy for the slide it is on: a tall slide gets a taller copy, under its own key', () => {
		scale.rewrite(panel(PHOTO), 1280, new EventTarget(), BASE, remoteRef, ALLOWED, 1920 / 1080);
		scale.rewrite(panel(PHOTO), 1280, new EventTarget(), BASE, remoteRef, ALLOWED, 9 / 16);
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 1280, height: 2304 });
		expect(posted.map((j) => (j as { shape?: number }).shape)).toEqual([1.8, 0.75]);
	});

	it('remembers a copy\'s size under the original\'s address as written, so the slide stamps final next time', () => {
		const sized = vi.fn();
		scale.onCopySized(sized);
		scale.rewrite(panel('/images/team.jpg'), 640, new EventTarget(), BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 960 });
		expect(sized).toHaveBeenCalledWith('/images/team.jpg', 640, 960);
		expect(sized).toHaveBeenCalledWith('https://lattice.example/images/team.jpg', 640, 960);
		scale.onCopySized(null);
	});

	it('tells a host to re-render once a zoom settles with it drawn clearly wider, and only then', () => {
		const host = document.createElement('figure');
		document.body.appendChild(host);
		let width = 400;
		host.getBoundingClientRect = () => ({ width, height: 225, top: 0, left: 0, right: width, bottom: 225, x: 0, y: 0, toJSON() {} }) as DOMRect;
		const ready = vi.fn();
		host.addEventListener(scale.READY_EVENT, ready);
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		width = 440;
		window.dispatchEvent(new Event(scale.ZOOM_EVENT));
		vi.advanceTimersByTime(scale.ZOOM_SETTLE_MS + 1);
		expect(ready).not.toHaveBeenCalled();
		// Mid-gesture paints do not re-render; only the rest after them does.
		width = 1600;
		window.dispatchEvent(new Event(scale.ZOOM_EVENT));
		vi.advanceTimersByTime(scale.ZOOM_SETTLE_MS / 2);
		window.dispatchEvent(new Event(scale.ZOOM_EVENT));
		expect(ready).not.toHaveBeenCalled();
		vi.advanceTimersByTime(scale.ZOOM_SETTLE_MS + 1);
		expect(ready).toHaveBeenCalledTimes(1);
		host.remove();
	});
});

describe('prose photos (<img src>): what the Compose picker, the chat agent and a collage write', () => {
	const IMG = '<p><img src="https://images.example/photo-1.jpg" alt="A harbor"></p>';

	it('keeps the original while the copy is made (no blank, no layout jump), and asks for the copy', () => {
		const out = scale.rewrite(IMG, 640, new EventTarget(), BASE, ...deps());
		expect(out.html).toBe(IMG);
		expect(posted.map((j) => j.url)).toEqual([PHOTO]);
	});

	it('then shows the copy as its src: a copy made for a prose photo (wrapped to keep the original\'s size)', () => {
		const host = new EventTarget();
		const ready = vi.fn();
		host.addEventListener(scale.READY_EVENT, ready);
		scale.rewrite(IMG, 640, host, BASE, ...deps());
		expect((posted[0] as { wrap?: boolean }).wrap, 'the worker was not asked for the wrapped copy').toBe(true);
		reply({ id: posted[0].id, blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), width: 640, height: 480, ow: 4032, oh: 3024 });
		expect(ready).toHaveBeenCalledTimes(1);
		const html = scale.rewrite(IMG, 640, host, BASE, ...deps()).html;
		const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img');
		expect(img?.getAttribute('src')).toMatch(/^blob:/);
		expect(img?.getAttribute('alt')).toBe('A harbor');
		// The original's address stays beside the copy, for what reads the photo itself.
		expect(img?.getAttribute(scale.ORIGINAL)).toBe(PHOTO);
	});

	it('keeps prose and background copies apart: a background never shows the wrapped SVG', () => {
		const host = new EventTarget();
		scale.rewrite(IMG, 640, host, BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), width: 640, height: 480, ow: 4032, oh: 3024 });
		const bg = scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		expect(bg.pending, 'the background took the prose photo\'s wrapped copy').toBe(1);
	});

	it('leaves an author\'s own srcset, a refused origin and an SVG alone', () => {
		for (const html of ['<img src="/a.jpg" srcset="/a.jpg 1x, /a@2x.jpg 2x">', '<img src="https://evil.example/b.jpg">', '<img src="/logo.svg">']) {
			expect(scale.rewrite(html, 640, new EventTarget(), BASE, ...deps()).html).toBe(html);
		}
		expect(posted).toHaveLength(0);
	});
});

describe('round 3 of the review', () => {
	it('warms the wrapped copy a prose photo shows, so the next render shows it without a second job', () => {
		expect(scale.warm('https://images.example/photo-1.jpg', 640, BASE, 0.5625, true)).toBe(true);
		expect((posted[0] as { wrap?: boolean }).wrap).toBe(true);
		reply({ id: posted[0].id, blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), width: 640, height: 480, ow: 4032, oh: 3024 });
		const html = scale.rewrite('<p><img src="https://images.example/photo-1.jpg" alt="A"></p>', 640, new EventTarget(), BASE, ...deps()).html;
		expect(html).toMatch(/src="blob:/);
		expect(posted, 'the prefetched copy was not the one the <img> looked for').toHaveLength(1);
	});

	it('treats a later worker\'s early error as a failed job, not as a policy that forbids workers', () => {
		const host = new EventTarget();
		scale.rewrite(panel(PHOTO), 640, host, BASE, ...deps());
		reply({ id: posted[0].id, blob: new Blob(['x']), width: 640, height: 480 });
		vi.advanceTimersByTime(scale.WORKER_IDLE_MS + 1); // the idle worker stops
		scale.rewrite(panel('https://images.example/two.jpg'), 640, host, BASE, ...deps());
		current?.onerror?.(); // the new worker dies on its first job (out of memory, say)
		scale.rewrite(panel('https://images.example/three.jpg'), 640, host, BASE, ...deps());
		expect(posted.map((j) => j.url), 'copies were switched off for the session').toContain('https://images.example/three.jpg');
	});
});

describe('a photo already no bigger than its copy', () => {
	it('keeps its own address for good: no swap to a copy of the same bytes, no second job', () => {
		const host = new EventTarget();
		const IMG = '<p><img src="https://images.example/small.png" alt="S"></p>';
		scale.rewrite(IMG, 1280, host, BASE, ...deps());
		reply({ id: posted[0].id, small: true });
		vi.advanceTimersByTime(scale.FAILURE_RETRY_MS * 2);
		expect(scale.rewrite(IMG, 1280, host, BASE, ...deps()).html).toBe(IMG);
		expect(posted).toHaveLength(1);
	});

	it('is not reported as warmed once no copy will come, so the prefetch measures it itself', () => {
		const url = 'https://images.example/warm-small.png';
		expect(scale.warm(url, 640), 'the first warm starts a copy').toBe(true);
		reply({ id: posted[0].id, small: true });
		expect(scale.warm(url, 640), 'a small photo gets no copy').toBe(false);
		const failing = 'https://images.example/warm-no-cors.jpg';
		expect(scale.warm(failing, 640)).toBe(true);
		reply({ id: posted[1].id, error: 'no cors' });
		expect(scale.warm(failing, 640), 'an unreadable photo gets no copy').toBe(false);
	});
});

describe('a collage', () => {
	it('keeps its photos\' originals: each copy landing would re-render and repack it mid-gesture', () => {
		const html = '<section class="collage"><div class="collage-tile"><img src="https://images.example/a.jpg" alt="A"></div></section>';
		expect(scale.rewrite(html, 640, new EventTarget(), BASE, ...deps()).html).toBe(html);
		expect(posted).toHaveLength(0);
	});
});
