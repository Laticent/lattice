// Preview-sized copies of a deck's photos — loaded lazily by single-slide-render, so none of this
// rides the Studio's eager bundle (docs/route-budget.json).
//
// WHY. A preview frame decodes every photo at its FULL size, whatever box it is drawn in: a 12MP
// phone photo is ~48MB of bitmap in a 320px thumbnail exactly as in the main preview, and WebKit
// keeps that bitmap long after the slide is gone. Measured on WebKit (tools/bench-preview-photo-
// memory.mjs), ten distinct 4032x3024 photos across ten preview frames: 1016MB, against 204MB for the
// same photos as copies. Pooling frames does not touch this — frames showing the same photo already
// share one bitmap — so the cost grows with the number of DISTINCT photos the session has looked at.
// That, not the pools, is what got the tab discarded on an iPhone.
//
// WHAT. Each photo — an `<img src>`, or a `url()` at the top level of a `background` or `background-image`
// declaration in an element's (first) `style` attribute, which is every `![bg]` panel and full-slide
// background — is fetched once by a dedicated worker, decoded there, scaled to the TIER the host
// needs and handed to the frame as a `blob:` URL. The frame never sees the original address, so it
// never decodes the original. The worker's own decode is freed with the worker, which is terminated
// once idle (WebKit and Firefox return that memory; Chromium keeps it as a high-water mark).
//
// WHERE IT PAYS, AND ONLY THERE. On a touch device every host gets a copy, at most 1920px (a landscape
// Present or a zoom is then a little soft, never a 48MB original). With a fine pointer only hosts up to
// FINE_POINTER_MAX_CSS CSS pixels wide do — the thumbnails; a desktop's main preview or Present keeps the
// original at any DPR: it never had the memory problem, and a re-encoded copy there would be slower and
// softer than the export. (The width is in CSS pixels, not device pixels: an 800px main preview at DPR 1
// needs only 800 device pixels, and once took a copy for it.)
//
// A worker that dies before its first answer is read as a `worker-src` refusal (`giveUp`): copies stay off
// for the session and every photo shows its original, as before this module.
//
// WHICH ENGINES GAIN. Measured with eight 12MP photos shown at 320px: WebKit (the iPhone's) 987MB to
// 541MB, Firefox 1290MB to 719MB. Chromium gains little: it keeps the worker's peak decode memory as a
// high-water mark after the worker stops (851MB either way), so the copies save on WebKit and Firefox.
//
// WHICH ADDRESSES. Only the ones the frame may load anyway: the site's own files, the web origins the
// reader allowed (remote-ref.js `withOwnOrigin`), and the page's own `blob:` URLs — the Studio's
// Library photos (media-urls.ts), where a camera-roll photo lives. The worker runs in the parent
// page, which no frame policy governs, so this check is what keeps it from fetching a web image the
// reader refused. The caller runs remote-ref's `blockWebImages` AFTER this rewrite, so whatever the
// rewrite writes still passes the same gate the frame's markup always did. Markup is read with
// remote-ref's own HTML scanner and CSS reader, never a regex, in one linear pass per attribute.
//
// WHAT IS LEFT ALONE, and why each is safe:
//   · every other property: a custom property (the engine's `--background-image` string), an SVG
//     paint (`fill:url(#gradient)`), a mask or a logo tint; a `url()` nested in a function
//     (`image-set()`); a `#fragment`, which is never a photo.
//   · a photo the worker cannot read — no CORS headers, a redirect, a network failure — keeps its
//     original address; it is tried again after FAILURE_RETRY_MS, and keeps its original meanwhile.
//   · SVG, GIF and animated PNG/WebP/AVIF (vector art is not a bitmap problem; scaling would freeze
//     an animation), and any picture already no bigger than the copy would be (it keeps its address).
//
// A PROSE PHOTO (`<img src>`) gets its copy too, once one exists, laid out at the original's size; until
// then it keeps its original, because a replaced element has no honest pending state (the Underpainting
// is drawn with ::before/::after). The copy is an SVG of the original's size wrapping the smaller bitmap,
// and the prefetch makes the same wrapped copy ahead for the photos on nearby slides. So a prose photo's FIRST view in a session can still decode its
// original once; the prefetch makes the neighbors' copies ahead (followups.d/2998-p1).
//
// WHILE A COPY IS BEING MADE, an image panel (`.lattice-bg`) shows the Underpainting
// (lib/core/image-painting.js) with no picture under it; a full-slide background stays blank (only
// panels draw the painting). A copy already made at another tier stands in meanwhile, so resizing the
// pane never blanks a photo it has shown. When the copy lands, every host that asked for it gets
// `lattice:preview-images-ready` and re-renders, with the copy's size known up front — under the
// original's address too, so the slide stamps its final layout from the first paint thereafter.
//
// Without Worker / createImageBitmap / OffscreenCanvas, or once the worker has failed to start (a
// `worker-src` policy), `rewrite` returns the markup untouched: the frame loads the originals.

/** Widths a copy is made at. Few on purpose: two hosts that land on the same tier share one copy. */
export const TIERS = [640, 1280, 1920] as const;
/** The largest tier made with a fine pointer (a desktop): thumbnails only. */
export const FINE_POINTER_MAX_TIER = 1280;
/** With a fine pointer, the widest host (CSS px) that gets a copy: the thumbnails, never a main preview. */
export const FINE_POINTER_MAX_CSS = 480;
/** Encoded bytes held across all copies. Over it the least recently used copy is dropped — never one
 *  shown or asked for in the last RECENT_MS, so a slide whose copies outgrow the cache cannot loop. */
export const CACHE_MAX_BYTES = 64 * 1024 * 1024;
export const RECENT_MS = 30_000;
/** How long an idle worker lives. Terminating it is what returns its decode memory. */
export const WORKER_IDLE_MS = 3000;
/** A job the worker has not answered by then is given up on: the photo keeps its original. */
export const JOB_TIMEOUT_MS = 30_000;
/** How long a photo the worker could not read waits before it is tried again (keeping its original). */
export const FAILURE_RETRY_MS = 5 * 60_000;
/** The event a host receives when a copy it was waiting for is ready (or when a zoom outgrew it). */
export const READY_EVENT = 'lattice:preview-images-ready';
/** Fired on `window` by lib/preview-zoom.ts on every zoom paint; this module waits for them to stop. */
export const ZOOM_EVENT = 'lattice:preview-zoom';
/** How long the zoom paints must stop for before a host is measured again. */
export const ZOOM_SETTLE_MS = 250;

type Ready = { state: 'ready'; url: string; width: number; height: number; ow: number; oh: number; bytes: number; used: number };
type Pending = { state: 'pending'; hosts: Set<EventTarget>; fallback: boolean };
type Entry = Ready | Pending | { state: 'original'; until: number };

const entries = new Map<string, Entry>();
/** Every copy's address, so a copy is never taken for a Library photo and copied again. */
const copyUrls = new Set<string>();
/** The spellings each photo was written with in the markup, so its size is remembered under each. */
const aliases = new Map<string, Set<string>>();
let cachedBytes = 0;
/** False once the worker failed to start: every photo keeps its original for the session. */
let workerOk = true;

/** Can this engine make copies at all? */
export function supported(): boolean {
	return workerOk && typeof Worker === 'function' && typeof Blob === 'function' && typeof URL?.createObjectURL === 'function' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
}

/** The tier for a host `cssWidth` CSS pixels wide at `dpr`. On a touch device (`coarse`) a host that needs
 *  more than 1920px still gets the 1920 copy — a phone's landscape Present or a zoom is a little soft rather
 *  than a 48MB original. With a fine pointer (a desktop), 0 for a host wider than FINE_POINTER_MAX_CSS or
 *  needing more than FINE_POINTER_MAX_TIER: keep the original, which costs a desktop nothing it lacks. */
export function tierFor(cssWidth: number, dpr: number, coarse = typeof matchMedia !== 'function' || !matchMedia('(pointer: fine)').matches): number {
	if (!coarse && cssWidth > FINE_POINTER_MAX_CSS) return 0;
	const need = Math.max(1, cssWidth) * Math.max(1, dpr || 1);
	const tier = TIERS.find((t) => need <= t) ?? (coarse ? TIERS[TIERS.length - 1] : 0);
	return coarse || tier <= FINE_POINTER_MAX_TIER ? tier : 0;
}

/** The slide's height over its width, rounded: part of a copy's identity (a story slide is tall). */
const shape = (aspect: number) => Math.max(0.75, Math.round((aspect || 0.5625) * 20) / 20);
/** `wrap`: the copy a prose photo (`<img>`) shows, wrapped to keep the original's intrinsic size. */
const key = (url: string, tier: number, aspect: number, wrap = false) => `${wrap ? 'i' : ''}${tier}:${shape(aspect)} ${url}`;

/** A raster we may scale: http(s) or the page's own `blob:`, not an SVG or GIF by its path, and not a
 *  copy of ours. Whether the frame may load it at all is checked separately (`allowedBy`). */
export function scalable(url: string): boolean {
	if (copyUrls.has(url)) return false;
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (u.protocol === 'blob:') return typeof location !== 'undefined' && u.origin === location.origin;
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
	return !/\.(svgz?|gif)$/i.test(u.pathname);
}

// ── The worker ────────────────────────────────────────────────────────────────────────
// One job at a time: each holds a full-size decode while it runs, and a phone should hold one.
// The copy COVERS a box `tier` wide and `tier * shape` tall (the slide's own proportions, never
// flatter than 4:3), so a panorama or a story slide is never stretched. It keeps the source's
// orientation (EXIF) and, where the engine has it, a Display P3 canvas. An opaque picture is written
// as JPEG, one with transparency as PNG; a file that does not start like a JPEG is checked for
// transparency whatever its Content-Type says.
const WORKER_SRC = `
const head = (b) => String.fromCharCode.apply(null, b);
const animated = (s) => (s.startsWith('\\x89PNG') && s.includes('acTL')) || (s.startsWith('RIFF') && s.includes('ANIM')) || /ftypavis/.test(s.slice(0, 64));
onmessage = async (e) => {
	const { id, url, tier, shape, wrap } = e.data;
	try {
		const res = await fetch(url, { mode: 'cors', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) });
		if (!res.ok) throw new Error('HTTP ' + res.status);
		const blob = await res.blob();
		if (/svg|gif/i.test(blob.type)) throw new Error('not scaled: ' + blob.type);
		const first = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
		let s = '';
		for (let i = 0; i < first.length; i += 8192) s += head(first.subarray(i, i + 8192));
		if (animated(s)) throw new Error('not scaled: animated');
		const jpeg = first[0] === 0xff && first[1] === 0xd8;
		const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
		const width = full.width, height = full.height;
		const k = Math.max(tier / width, (tier * shape) / height);
		// Already no bigger than the copy would be: nothing to save, so the photo keeps its own address.
		if (k >= 1) { full.close(); postMessage({ id, small: true }); return; }
		const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
		const canvas = new OffscreenCanvas(w, h);
		let ctx = null;
		try { ctx = canvas.getContext('2d', { colorSpace: 'display-p3' }); } catch (_) {}
		ctx = ctx || canvas.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(full, 0, 0, w, h);
		full.close();
		let opaque = jpeg;
		if (!opaque) {
			const px = ctx.getImageData(0, 0, w, h).data;
			opaque = true;
			for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { opaque = false; break; }
		}
		let out = await canvas.convertToBlob(opaque ? { type: 'image/jpeg', quality: 0.86 } : { type: 'image/png' });
		// A prose photo's copy is an SVG the ORIGINAL's size holding the copy: as an <img src> it lays out
		// exactly as the original did (intrinsic size and ratio), and is drawn from the smaller bitmap.
		if (wrap) {
			const data = new FileReaderSync().readAsDataURL(out);
			const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none"><image width="' + width + '" height="' + height + '" preserveAspectRatio="none" href="' + data + '"/></svg>';
			out = new Blob([svg], { type: 'image/svg+xml' });
		}
		postMessage({ id, blob: out, width: w, height: h, ow: width, oh: height });
	} catch (err) {
		postMessage({ id, error: String(err && err.message || err) });
	}
};`;

type Job = { id: number; url: string; tier: number; shape: number; wrap: boolean; key: string };
type Reply = { id: number; blob?: Blob; width?: number; height?: number; ow?: number; oh?: number; small?: boolean; error?: string };

let worker: Worker | null = null;
let workerUrl: string | null = null;
/** Whether the current worker has answered anything: one that fails before it ever does could not start. */
let answered = false;
/** Whether any worker has ever answered this session: a later worker's early error is a failed job, not a policy. */
let everAnswered = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let jobTimer: ReturnType<typeof setTimeout> | null = null;
let busy: Job | null = null;
const queue: Job[] = [];
let nextId = 1;

function stopWorker() {
	worker?.terminate();
	worker = null;
	if (workerUrl) URL.revokeObjectURL(workerUrl);
	workerUrl = null;
}

function ensureWorker(): Worker {
	if (worker) return worker;
	workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
	worker = new Worker(workerUrl);
	answered = false;
	worker.onmessage = (e: MessageEvent<Reply>) => {
		answered = true;
		everAnswered = true;
		finish(e.data);
	};
	worker.onerror = () => {
		// A `worker-src` policy refuses a blob: worker asynchronously, as an error before any answer
		// (measured in Chromium, WebKit and Firefox): the worker cannot run here, so stop trying.
		if (!answered && !everAnswered) return giveUp();
		// One that dies mid-job takes its job with it: give that photo its original address.
		const job = busy;
		stopWorker();
		if (job) finish({ id: job.id, error: 'worker failed' });
	};
	return worker;
}

/** The worker cannot run here: every photo, pending or queued, gets its original address, and every
 *  later render leaves the markup alone. */
function giveUp() {
	workerOk = false;
	stopWorker();
	if (jobTimer) clearTimeout(jobTimer);
	jobTimer = null;
	const jobs = [...(busy ? [busy] : []), ...queue.splice(0)];
	busy = null;
	for (const job of jobs) settle(job, { id: job.id, error: 'no worker' });
}

function pump() {
	if (busy || !workerOk) return;
	const job = queue.shift();
	if (!job) {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			idleTimer = null;
			if (!busy && !queue.length) stopWorker();
		}, WORKER_IDLE_MS);
		return;
	}
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = null;
	busy = job;
	try {
		ensureWorker().postMessage({ id: job.id, url: job.url, tier: job.tier, shape: job.shape, wrap: job.wrap });
	} catch {
		giveUp();
		return;
	}
	// A worker the system stopped without an `error` event (an iPhone under memory pressure) never
	// answers; without this the photo and every one queued behind it would wait for good.
	if (jobTimer) clearTimeout(jobTimer);
	jobTimer = setTimeout(() => {
		jobTimer = null;
		if (busy?.id !== job.id) return;
		stopWorker();
		finish({ id: job.id, error: 'timed out' });
	}, JOB_TIMEOUT_MS);
}

/** Store what a job produced and tell its hosts. */
function settle(job: Job, reply: Reply) {
	const was = entries.get(job.key);
	const hosts = was?.state === 'pending' ? was.hosts : new Set<EventTarget>();
	entries.delete(job.key); // re-inserted below: most recently used last
	if (reply.blob && reply.width && reply.height) {
		const entry: Ready = { state: 'ready', url: URL.createObjectURL(reply.blob), width: reply.width, height: reply.height, ow: reply.ow || reply.width, oh: reply.oh || reply.height, bytes: reply.blob.size, used: Date.now() };
		entries.set(job.key, entry);
		copyUrls.add(entry.url);
		cachedBytes += entry.bytes;
		// The copy has the original's proportions, so its size is the original's for layout purposes.
		for (const u of [entry.url, job.url, ...(aliases.get(job.url) ?? [])]) sizeListener?.(u, entry.width, entry.height);
		evict();
	} else {
		// A photo already small enough keeps its original for good; one the worker could not read, for a while.
		entries.set(job.key, { state: 'original', until: reply.small ? Number.POSITIVE_INFINITY : Date.now() + FAILURE_RETRY_MS });
	}
	for (const host of hosts) host.dispatchEvent(new CustomEvent(READY_EVENT));
}

/** Called once a copy lands (or will not). Exported for tests. */
export function finish(reply: Reply) {
	const job = busy && busy.id === reply.id ? busy : null;
	if (!job) return;
	busy = null;
	if (jobTimer) clearTimeout(jobTimer);
	jobTimer = null;
	settle(job, reply);
	pump();
}

/** Drop least recently used copies until the cache fits — never one used within RECENT_MS. A slide
 *  whose copies are bigger than the cache keeps them all rather than evicting and re-making them. */
function evict() {
	const now = Date.now();
	for (const [k, e] of entries) {
		if (cachedBytes <= CACHE_MAX_BYTES) break;
		if (e.state !== 'ready' || now - e.used < RECENT_MS) continue;
		entries.delete(k);
		cachedBytes -= e.bytes;
		// A frame that already loaded this copy keeps its picture; one whose markup names it but has
		// not fetched it yet would lose it, so the bytes outlive the entry for a moment.
		setTimeout(() => {
			URL.revokeObjectURL(e.url);
			copyUrls.delete(e.url);
		}, 10_000);
	}
}

/** Told the natural size of every copy as it lands (under the copy's address and the original's),
 *  so a host can stamp its section final. */
let sizeListener: ((url: string, width: number, height: number) => void) | null = null;
export function onCopySized(fn: typeof sizeListener) {
	sizeListener = fn;
}

const touch = (k: string, e: Ready) => {
	e.used = Date.now();
	entries.delete(k); // re-insert: most recently used last
	entries.set(k, e);
	return e.url;
};

/** A copy of `url` already made at another tier, the nearest larger first: it stands in while the
 *  asked-for tier is made, so a host that changed size never loses a photo it was showing. */
function standIn(url: string, tier: number, aspect: number, wrap = false): string | null {
	return readyCopy(url, tier, aspect, false, wrap)?.url ?? null;
}

/** The copy of `url` a host at `tier` can show now: the tier's own, or (with `exact` false, or when the
 *  tier's own is not made yet) the nearest other tier's, larger first. Marked as just used. */
function readyCopy(url: string, tier: number, aspect: number, exact = true, wrap = false): Ready | null {
	const order = [...(exact ? [tier] : []), ...TIERS.filter((t) => t > tier), ...TIERS.filter((t) => t < tier).reverse()];
	for (const t of order) {
		const k = key(url, t, aspect, wrap);
		const e = entries.get(k);
		if (e?.state === 'ready') {
			touch(k, e);
			return e;
		}
	}
	return null;
}

/**
 * What `host` should load for `url` at `tier` right now: the copy's address; the original's (a photo
 * the worker could not read, also while it is retried); a copy at another tier while this one is made;
 * or `null` while the first copy is being made (the host is told when it is ready).
 */
export function resolve(url: string, tier: number, host: EventTarget, urgent = true, aspect = 0.5625, wrap = false): string | null {
	const k = key(url, tier, aspect, wrap);
	const e = entries.get(k);
	if (e?.state === 'ready') return touch(k, e);
	if (e?.state === 'original' && Date.now() < e.until) return url;
	if (e?.state === 'pending') {
		e.hosts.add(host);
		// A photo a host is showing now goes ahead of the prefetches (`warm`) queued before it.
		if (urgent) {
			const at = queue.findIndex((j) => j.key === k);
			if (at > 0) queue.unshift(...queue.splice(at, 1));
		}
		return e.fallback ? url : standIn(url, tier, aspect, wrap);
	}
	// A retry keeps showing the original until the copy lands: it never blanks a photo it was showing.
	const fallback = e?.state === 'original';
	entries.set(k, { state: 'pending', hosts: new Set([host]), fallback });
	const job: Job = { id: nextId++, url, tier, shape: shape(aspect), wrap, key: k };
	if (urgent) queue.unshift(job);
	else queue.push(job);
	pump();
	if (!workerOk || fallback) return url; // `giveUp` settled it as the original, or a retry
	return standIn(url, tier, aspect, wrap);
}

/** Start the copy of a photo no host is showing yet (the slides around the shown one). True when a
 *  copy will be made, so the caller need not load the original itself. False when none will be (the
 *  worker could not read the photo, it is already small, or copies are off): the caller then measures
 *  the original as before, or the next slide would lay out without its photo's size. `url` must already be one the
 *  frame may load (the caller filters by the reader's allowed origins). */
export function warm(url: string, tier: number, base?: string, aspect = 0.5625, wrap = false): boolean {
	if (!supported() || !tier) return false;
	let abs: string;
	try {
		abs = new URL(url, base).href;
	} catch {
		return false;
	}
	if (!scalable(abs)) return false;
	alias(abs, url);
	// `resolve` hands back the original address exactly when no copy is coming.
	return resolve(abs, tier, new EventTarget(), false, aspect, wrap) !== abs;
}

function alias(abs: string, written: string) {
	if (written === abs) return;
	let set = aliases.get(abs);
	if (!set) aliases.set(abs, (set = new Set()));
	set.add(written);
}

// ── Zoom ──────────────────────────────────────────────────────────────────────────────
// Zoom magnifies a host with a transform and no re-render, so its copies were sized for the unzoomed
// box. Once a zoom settles, a host that now draws clearly wider is told to re-render: its measured box
// includes the transform, so the render asks for a bigger tier (at most 1920 on a touch device).
const zoomHosts = new Map<Element, number>();
let zoomListening = false;
function watchZoom(host: EventTarget) {
	if (!(typeof Element !== 'undefined' && host instanceof Element) || typeof window === 'undefined') return;
	if (!zoomHosts.has(host)) {
		// Hosts unmount without telling this module: forget the detached ones as new ones arrive.
		if (zoomHosts.size >= 32) for (const h of zoomHosts.keys()) if (!h.isConnected) zoomHosts.delete(h);
		zoomHosts.set(host, host.getBoundingClientRect().width);
	}
	if (zoomListening) return;
	zoomListening = true;
	let settle: ReturnType<typeof setTimeout> | undefined;
	window.addEventListener(ZOOM_EVENT, () => {
		clearTimeout(settle);
		settle = setTimeout(zoomSettled, ZOOM_SETTLE_MS);
	});
}
function zoomSettled() {
		for (const [h, drawn] of zoomHosts) {
			if (!h.isConnected) {
				zoomHosts.delete(h);
				continue;
			}
			const w = h.getBoundingClientRect().width;
			if (drawn > 0 && w > drawn * 1.25) h.dispatchEvent(new CustomEvent(READY_EVENT));
			zoomHosts.set(h, Math.max(w, 1));
		}
}

// ── The markup rewrite ────────────────────────────────────────────────────────────────
const PAINTING = 'data-lattice-painting';
/** On an <img> shown as its copy: the original's address. */
export const ORIGINAL = 'data-lattice-original';
/** The only declarations a photo is scaled in. */
const PHOTO_PROPS = new Set(['background', 'background-image']);

type CssSpan = { from: number; to: number; kind: 'url' | 'string'; value: string; fontFace: boolean; selector: boolean };
type ScannedAttr = { name: string; from: number; to: number; vFrom: number; vTo: number; quote: string };
type ScannedTag = { nameEnd: number; name: string; attrs: ScannedAttr[] };
/** What the rewrite reads markup and CSS with, and decides what the frame may load with: remote-ref.js,
 *  handed in by the caller (which already loaded it), so this chunk does not carry a second copy. */
export type RemoteRefLike = {
	// remote-ref.js declares its tags as plain objects (its JSDoc); they carry the ScannedTag fields.
	scanHtml: (html: string) => { tags: object[]; risky: boolean };
	decodeEntitiesMapped: (v: string, opts?: { attribute?: boolean }) => { text: string; map: number[] };
	cssRefSpans: (css: string) => CssSpan[];
	withOwnOrigin: (allowed: string[]) => string[];
	webOrigin: (u: string) => string | null;
};

/**
 * For each of `spans` (sorted), whether it is a top-level `url()` of a photo declaration: the property
 * its declaration names is `background` or `background-image`, and it is not nested in another
 * function (`image-set()`). ONE forward pass over the declarations, honoring strings, comments and
 * parentheses, so a `;` or `:` inside one does not split it — linear in the attribute's length.
 */
function photoSpans(css: string, spans: CssSpan[]): boolean[] {
	const out: boolean[] = [];
	let prop = '';
	let propFrom = 0;
	let sawColon = false;
	let depth = 0;
	let si = 0;
	for (let i = 0; i < css.length && si < spans.length; i++) {
		while (si < spans.length && spans[si].from <= i) {
			out.push(depth === 0 && sawColon && PHOTO_PROPS.has(prop));
			si++;
		}
		const c = css[i];
		if (c === '\\') i++;
		else if (c === '"' || c === "'") {
			for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++;
		} else if (c === '/' && css[i + 1] === '*') {
			const e = css.indexOf('*/', i + 2);
			i = e < 0 ? css.length : e + 1;
		} else if (c === '(') depth++;
		else if (c === ')') depth = Math.max(0, depth - 1);
		else if (c === ':' && depth === 0 && !sawColon) {
			prop = css.slice(propFrom, i).trim().toLowerCase();
			sawColon = true;
		} else if (c === ';' && depth === 0) {
			prop = '';
			sawColon = false;
			propFrom = i + 1;
		}
	}
	while (out.length < spans.length) out.push(false);
	return out;
}

/**
 * `html` with every scalable background photo pointed at its copy for `tier` (a slide `aspect` tall
 * over wide). A photo whose copy is still being made loses its `url()` (so the frame cannot fetch the
 * original); an image panel shows the Underpainting until `host` re-renders. `base` resolves a
 * relative address the way the frame would (the page's own); `allow` is the reader's allowed web
 * origins. Markup the scanner does not model (`risky`) is left untouched: the frame then loads
 * originals, which costs memory and nothing else.
 */
export function rewrite(html: string, tier: number, host: EventTarget, base: string, rr: RemoteRefLike, allow: string[], aspect = 0.5625): { html: string; pending: number } {
	if (!tier || !supported() || !/url|\\|&|<img/i.test(html)) return { html, pending: 0 };
	const { tags: found, risky } = rr.scanHtml(html);
	const tags = found as ScannedTag[];
	if (risky) return { html, pending: 0 };
	const origins = new Set(rr.withOwnOrigin(allow));
	const allowed = (u: string) => u.startsWith('blob:') || origins.has(rr.webOrigin(u) ?? '');
	watchZoom(host);
	const edits: Array<[number, number, string]> = [];
	let pending = 0;
	let inCollage = false;
	const photo = (target: string): string | null => {
		if (!target || target.startsWith('#')) return null;
		let abs: string;
		try {
			abs = new URL(target, base).href;
		} catch {
			return null;
		}
		if (!scalable(abs) || !allowed(abs)) return null;
		alias(abs, target);
		return abs;
	};
	// A PROSE PHOTO (`<img src>`, what the Compose picker, the chat agent and a collage write) shows its
	// copy as soon as one exists: an SVG the original's size wrapping the copy (see the worker), so the
	// slide lays out exactly as it did, drawn from the smaller bitmap. (A `srcset` density would do the
	// same, but the slide sanitizer deliberately admits a `blob:` only as a `src`.) There is no honest
	// pending state for a replaced element, so until a copy exists the original stays (its copy is
	// being made, and neighbors' are made ahead by the prefetch). An author's own `srcset` stays.
	const imageEdit = (t: ScannedTag) => {
		// A COLLAGE keeps its originals: its photos' copies land one by one, each a re-render, and a collage
		// repacks its tiles on each, which lost a hover or an open lightbox mid-gesture (the collage e2e went
		// from 20/20 to 16/20 on desktop). followups.d/2998-p3 has the way back.
		if (inCollage) return;
		if (t.attrs.some((a) => a.name === 'srcset')) return;
		const src = t.attrs.find((a) => a.name === 'src');
		if (!src || src.vFrom < 0) return;
		const abs = photo(rr.decodeEntitiesMapped(html.slice(src.vFrom, src.vTo), { attribute: true }).text.trim());
		if (!abs || resolve(abs, tier, host, true, aspect, true) === abs) return;
		const copy = readyCopy(abs, tier, aspect, true, true);
		if (!copy) return;
		edits.push(src.quote ? [src.vFrom, src.vTo, copy.url] : [src.vFrom, src.vTo, `"${copy.url}"`]);
		// The original's address, as written, beside the copy: what reads the photo itself (its pixel size,
		// or, once collages get copies, the lightbox that enlarges it) finds it here. Only an address the frame
		// may load reaches this point, and nothing fetches from a data attribute.
		if (!t.attrs.some((a) => a.name === ORIGINAL)) edits.push([t.nameEnd, t.nameEnd, ` ${ORIGINAL}="${html.slice(src.vFrom, src.vTo).replace(/"/g, '&quot;')}"`]);
	};
	for (const t of tags) {
		if (t.name === 'section') inCollage = /(?:^|\s)collage(?:\s|$)/.test(html.slice(t.attrs.find((a) => a.name === 'class')?.vFrom ?? 0, t.attrs.find((a) => a.name === 'class')?.vTo ?? 0));
		if (t.name === 'img') imageEdit(t);
		// The browser reads an element's FIRST style attribute and ignores the rest.
		const style = t.attrs.find((a) => a.name === 'style');
		if (!style || style.vFrom < 0) continue;
		const raw = html.slice(style.vFrom, style.vTo);
		if (!/url|\\|&/i.test(raw)) continue;
		const { text, map } = rr.decodeEntitiesMapped(raw, { attribute: true });
		const spans = rr.cssRefSpans(text);
		const isPhoto = photoSpans(text, spans);
		const reps: Array<[number, number, string]> = [];
		let waiting = false;
		spans.forEach((sp, n) => {
			if (!isPhoto[n] || sp.kind !== 'url' || sp.selector || sp.fontFace) return;
			const abs = photo(sp.value.trim());
			if (!abs) return;
			const to = resolve(abs, tier, host, true, aspect);
			if (to === abs) return;
			if (to === null) waiting = true;
			// A copy's address is `blob:<origin>/<uuid>`: no quote, space or parenthesis to escape.
			reps.push([sp.from, sp.to, to === null ? 'none' : `url(${to})`]);
		});
		if (!reps.length) continue;
		let next = '';
		let at = 0;
		for (const [from, to, rep] of reps) {
			next += raw.slice(at, map[from]) + rep;
			at = map[to];
		}
		next += raw.slice(at);
		// An unquoted value is quoted on the way out, with any `"` in it escaped: unescaped, it would
		// end the attribute and turn the rest of the value into attributes of its own.
		edits.push(style.quote ? [style.vFrom, style.vTo, next] : [style.vFrom, style.vTo, `"${next.replace(/"/g, '&quot;')}"`]);
		if (waiting) {
			pending++;
			// The Underpainting is drawn on image panels only (`section [data-lattice-painting]`), as the
			// runtime draws it; a full-slide background stays blank meanwhile.
			if (t.name !== 'section' && !t.attrs.some((a) => a.name === PAINTING)) edits.push([t.nameEnd, t.nameEnd, ` ${PAINTING}=""`]);
		}
	}
	if (!edits.length) return { html, pending: 0 };
	edits.sort((a, b) => a[0] - b[0]);
	let out = '';
	let at = 0;
	for (const [from, to, rep] of edits) {
		out += html.slice(at, from) + rep;
		at = to;
	}
	return { html: out + html.slice(at), pending };
}

/** Drop every copy and job (tests). */
export function reset() {
	for (const e of entries.values()) if (e.state === 'ready') URL.revokeObjectURL(e.url);
	entries.clear();
	copyUrls.clear();
	aliases.clear();
	zoomHosts.clear();
	cachedBytes = 0;
	queue.length = 0;
	busy = null;
	workerOk = true;
	answered = false;
	everAnswered = false;
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = null;
	if (jobTimer) clearTimeout(jobTimer);
	jobTimer = null;
	stopWorker();
}
