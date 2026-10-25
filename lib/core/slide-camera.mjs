// THE SLIDE CAMERA — one picture of a slide, taken the same way by the CLI and the Studio.
//
// Before this, each host photographed a slide its own way: the CLI took a native Chrome screenshot, the
// Studio ran html-to-image (which copies computed styles onto a clone and floors every font size by up to
// 1px). The same deck came out as different pixels: on a 52-slide deck, 52 of 52 slides differed between
// hosts, the Studio's PNG set was 52% larger, and a topic slide's bottom shelf was missing. A picture that
// differs by host is not a spine (engineering/pipeline.md § Pictures).
//
// HOW IT WORKS. The slide is laid out again, by Chromium, inside an SVG image, using the page's OWN
// stylesheets, not copied computed styles. The page's `html` and `body` rules are re-pointed at two wrapper
// divs, the slide and its ancestors are cloned with their attributes, every picture the slide uses is inlined
// as a data URI, and the SVG is drawn onto a canvas. No style is copied, so none can drift: the same
// selectors match the same elements. Measured against a native Chrome screenshot on a 52-slide deck, at most
// 0.0065% of pixels differ by more than 8 levels (html-to-image: 4.3% on average, 21% on the worst slide).
//
// ONE FUNCTION, TWO HOSTS. It runs in a page: the Studio's tab, and the CLI's headless Chrome (the same
// Chromium family, so the same pixels). The host supplies only what a page cannot do for itself:
// `toDataUri(url)`, which turns a picture's address into a `data:` URI (the Studio fetches `blob:` and
// same-origin URLs; the CLI reads confined local files through Node).
//
// FACE. `face: 'screen'` photographs the slide as the live preview shows it; `face: 'export'` adds the
// `.lattice-exporting` class first (the flat face the PDF's photo layer sits under).

const NS = 'http://www.w3.org/1999/xhtml';
const ROOT = '__lc-root';
const BODY = '__lc-body';

// One pass per document: the page's stylesheet text, with `html`, `body` and `:root` re-pointed at the wrappers.
const cssCache = new WeakMap();

// What the ancestors of the slide must NOT bring along. They are cloned so the slide inherits what it inherits (the deck's
// tokens, its mode, its fonts), but their own BOX is the host's chrome, not the slide: the Studio's preview wraps a slide
// in a frame with a shadow, a margin and a backdrop, and a native screenshot of the slide never includes any of it. These
// declarations strip the box and leave everything that inherits (custom properties, color-scheme, font, container-type).
const ISOLATE = `.__lc-wrap{display:block!important;position:static!important;inset:auto!important;float:none!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:none!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;zoom:1!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;overflow:visible!important;filter:none!important;backdrop-filter:none!important;opacity:1!important;clip-path:none!important;mask:none!important;outline:0!important;border-radius:0!important;contain:none!important;content-visibility:visible!important;aspect-ratio:auto!important;gap:0!important}`;

function pageCss(doc) {
	const sheets = Array.from(doc.styleSheets);
	const adopted = Array.from(doc.adoptedStyleSheets || []);
	const key = `${sheets.length}:${adopted.length}:${doc.querySelectorAll('style').length}`;
	const hit = cssCache.get(doc);
	if (hit && hit.key === key) return hit.text;
	const parts = [];
	for (const owner of doc.querySelectorAll('style')) parts.push(owner.textContent || '');
	for (const sheet of sheets) {
		if (sheet.ownerNode && sheet.ownerNode.localName === 'style') continue; // already taken verbatim above
		try {
			parts.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'));
		} catch {
			// a cross-origin sheet cannot be read: the host's `fontCss` carries what matters (its faces)
		}
	}
	for (const sheet of adopted) parts.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'));
	const text = parts
		.join('\n')
		.replace(/:root\b/g, `.${ROOT}`)
		.replace(/(^|[\s,{}>+~(])html\b(?![-\w])/g, `$1.${ROOT}`)
		.replace(/(^|[\s,{}>+~(])body\b(?![-\w])/g, `$1.${BODY}`);
	cssCache.set(doc, { key, text });
	return text;
}

const REMOTE = /^(?:file|blob|https?):/i;
// `url(...)` in CSS text or in a serialized style attribute (where a double quote is written `&quot;` and `&` as `&amp;`).
const CSS_URL = /url\(\s*(&quot;|&#39;|["']?)((?:file|blob|https?):[^)"']+?)\1\s*\)/gi;
const unescapeXml = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function inlineAll(urls, toDataUri, onImageError) {
	const out = new Map();
	for (const url of urls) {
		try {
			out.set(url, await toDataUri(url));
		} catch {
			out.set(url, null);
			if (onImageError) onImageError(url);
		}
	}
	return out;
}

function wrapperOf(src, cls, doc) {
	const el = doc.createElementNS(NS, 'div');
	for (const a of Array.from(src.attributes)) {
		if (a.name === 'class' || a.name === 'id') continue;
		try {
			el.setAttribute(a.name, a.value);
		} catch {
			// an attribute name XML refuses: it carries no style
		}
	}
	el.setAttribute('class', `${cls} __lc-wrap ${src.getAttribute('class') || ''}`.trim());
	return el;
}

/**
 * Photograph one slide onto a canvas.
 * @param {Element} section  the slide, laid out in a document
 * @param {object} [opts]
 * @param {number} [opts.scale]  device pixels per CSS pixel (default 1)
 * @param {'screen'|'export'} [opts.face]  default 'screen'
 * @param {string} [opts.fontCss]  `@font-face` rules the page cannot expose (fonts loaded through the FontFace API, or a cross-origin sheet)
 * @param {(url: string) => Promise<string>} [opts.toDataUri]  a picture's address to a `data:` URI; without it, only `data:` pictures draw
 * @param {boolean} [opts.opaque]  paint the page's own background behind the slide (a native screenshot does, so a rounded corner shows it); default transparent, like `omitBackground`
 * @param {(url: string) => void} [opts.onImageError]  called once per picture that could not be read; its `<img>` is hidden
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function captureSlideCanvas(section, opts = {}) {
	const { scale = 1, face = 'screen', fontCss = '', toDataUri = null, onImageError = null, opaque = false } = opts;
	const doc = section.ownerDocument;
	const w = section.offsetWidth || section.getBoundingClientRect().width;
	const h = section.offsetHeight || section.getBoundingClientRect().height;

	// The chain from the slide up to <html>, cloned shallowly: the wrappers keep the ancestors' classes and attributes
	// (the deck's mode, its custom properties), and the slide is the only child on the way down.
	const chain = [];
	for (let e = section.parentElement; e; e = e.parentElement) chain.unshift(e);
	let top = null;
	let tip = null;
	for (const e of chain) {
		const node = e === doc.documentElement ? wrapperOf(e, ROOT, doc) : e === doc.body ? wrapperOf(e, BODY, doc) : doc.createElementNS(NS, e.localName);
		if (e !== doc.documentElement && e !== doc.body) {
			for (const a of Array.from(e.attributes)) {
				try {
					node.setAttribute(a.name, a.name === 'class' ? `__lc-wrap ${a.value}` : a.value);
				} catch {
					/* see wrapperOf */
				}
			}
			if (!e.hasAttribute('class')) node.setAttribute('class', '__lc-wrap');
		}
		if (tip) tip.appendChild(node);
		else top = node;
		tip = node;
	}
	const clone = section.cloneNode(true);
	if (face === 'export') clone.classList.add('lattice-exporting');
	clone.style.transform = 'none';
	clone.style.margin = '0';

	// A live <canvas> clones as an empty one: take its pixels. A picture the host cannot read is hidden, not left broken.
	const liveCanvases = section.querySelectorAll('canvas');
	clone.querySelectorAll('canvas').forEach((c, i) => {
		try {
			const img = doc.createElementNS(NS, 'img');
			img.setAttribute('src', liveCanvases[i].toDataURL('image/png'));
			img.setAttribute('style', c.getAttribute('style') || '');
			img.setAttribute('class', c.getAttribute('class') || '');
			c.replaceWith(img);
		} catch {
			/* a tainted canvas draws as nothing */
		}
	});

	// Every picture the slide names, taken from the LIVE element (its resolved address, `currentSrc` for srcset and lazy swaps),
	// and written onto the clone's own element once the host has turned it into a data: URI.
	const need = new Set();
	const note = (u) => {
		if (u && REMOTE.test(u)) need.add(u);
	};
	const imgJobs = [];
	const livePics = section.querySelectorAll('img');
	clone.querySelectorAll('img').forEach((img, i) => {
		const live = livePics[i];
		const abs = (live && (live.currentSrc || live.src)) || '';
		img.removeAttribute('srcset');
		img.removeAttribute('sizes');
		img.removeAttribute('loading');
		if (abs && !abs.startsWith('data:')) {
			note(abs);
			imgJobs.push([img, abs, 'src']);
		} else if (abs) img.setAttribute('src', abs);
	});
	const liveSvgPics = section.querySelectorAll('image');
	clone.querySelectorAll('image').forEach((el, i) => {
		const live = liveSvgPics[i];
		const abs = live && (live.href?.baseVal ? new URL(live.href.baseVal, doc.baseURI).href : '');
		if (abs && !abs.startsWith('data:')) {
			note(abs);
			imgJobs.push([el, abs, el.hasAttribute('xlink:href') ? 'xlink:href' : 'href']);
		}
	});
	const sheetText = pageCss(doc) + (fontCss ? `\n${fontCss}` : '');

	// Pictures named from CSS (a background, a mask) live in the page's stylesheet or the slide's inline styles.
	for (const m of `${sheetText}\n${new XMLSerializer().serializeToString(clone)}`.matchAll(CSS_URL)) note(unescapeXml(m[2]));
	const data = toDataUri ? await inlineAll(need, toDataUri, onImageError) : new Map();
	if (!toDataUri) for (const u of need) if (onImageError) onImageError(u);
	// An <img> or <image> whose picture the host could not read is hidden, so the browser's broken-image glyph and the alt text never ship.
	for (const [el, abs, attr] of imgJobs) {
		const d = data.get(abs);
		if (d) el.setAttribute(attr, d);
		else {
			el.removeAttribute(attr);
			el.setAttribute('style', `${el.getAttribute('style') || ''};visibility:hidden`);
		}
	}

	let xhtml = '';
	{
		const host = tip || doc.createElementNS(NS, 'div');
		if (!tip) top = host;
		host.appendChild(clone);
		const style = doc.createElementNS(NS, 'style');
		style.textContent = `${sheetText}\n${ISOLATE}`;
		top.insertBefore(style, top.firstChild);
		xhtml = new XMLSerializer().serializeToString(top);
	}
	// Replace by address, longest first, so one URL that prefixes another cannot be cut short.
	// (An address can sit in the serialized markup in its escaped form, `&` written `&amp;`: replace that one too.)
	for (const u of [...data.keys()].sort((a, b) => b.length - a.length)) {
		const d = data.get(u) ?? 'data:,';
		xhtml = xhtml.split(u.replace(/&/g, '&amp;')).join(d).split(u).join(d);
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
	// A data: URL, not a blob: one: from a file:// page (the CLI's) a blob: image is cross-origin and taints the canvas.
	const utf8 = new TextEncoder().encode(svg);
	let bin = '';
	for (let i = 0; i < utf8.length; i += 0x8000) bin += String.fromCharCode.apply(null, utf8.subarray(i, i + 0x8000));
	try {
		const img = new Image();
		img.src = `data:image/svg+xml;base64,${btoa(bin)}`;
		await img.decode();
		const canvas = doc.createElement('canvas');
		canvas.width = Math.max(1, Math.round(w * scale));
		canvas.height = Math.max(1, Math.round(h * scale));
		const g = canvas.getContext('2d');
		if (opaque) {
			// What a native screenshot shows behind a rounded corner: the body's background, else the root's, else white.
			const win = doc.defaultView;
			const clear = (c) => !c || c === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c);
			const bg = [doc.body, doc.documentElement].map((e) => win.getComputedStyle(e).backgroundColor).find((c) => !clear(c));
			g.fillStyle = bg || '#fff';
			g.fillRect(0, 0, canvas.width, canvas.height);
		}
		g.scale(canvas.width / w, canvas.height / h);
		g.drawImage(img, 0, 0, w, h);
		return canvas;
	} finally {
		bin = '';
	}
}

// ── PNG ENCODER ──────────────────────────────────────────────────────────────────────────────────────
// `canvas.toBlob('image/png')` compresses lightly (a 52-slide deck came out 40% larger than Chrome's own screenshot
// encoder wrote it), and the Studio's PNGs paid that price for every export. This writes the same pixels with a
// per-row adaptive filter and the platform's deflate: opaque slides as 8-bit RGB (3 bytes a pixel, and the PDF writer's
// direct-embed path reads it as it is), slides with transparency as RGBA. One encoder, so both hosts write one file.
const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(bytes, start, end) {
	let c = 0xffffffff;
	for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes) {
	const cs = new CompressionStream('deflate');
	const w = cs.writable.getWriter();
	w.write(bytes);
	w.close();
	return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** PNG bytes for a canvas, smaller than the browser's own encoder writes. */
export async function encodePng(canvas) {
	const { width: W, height: H } = canvas;
	const rgba = canvas.getContext('2d').getImageData(0, 0, W, H).data;
	let opaque = true;
	for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break; }
	const bpp = opaque ? 3 : 4;
	const stride = W * bpp;
	// Raw rows, then filter each one by the type with the smallest sum of absolute (signed) residuals.
	const raw = new Uint8Array(stride * H);
	if (opaque) for (let i = 0, o = 0; i < rgba.length; i += 4) { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; }
	else raw.set(rgba);
	const out = new Uint8Array((stride + 1) * H);
	const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
	const zero = new Uint8Array(stride);
	for (let y = 0; y < H; y++) {
		const row = raw.subarray(y * stride, (y + 1) * stride);
		const up = y ? raw.subarray((y - 1) * stride, y * stride) : zero;
		let best = 0;
		let bestSum = Infinity;
		for (let f = 0; f < 5; f++) {
			const c = cand[f];
			let sum = 0;
			for (let x = 0; x < stride; x++) {
				const a = x >= bpp ? row[x - bpp] : 0;
				const b = up[x];
				const cc = x >= bpp ? up[x - bpp] : 0;
				let v;
				if (f === 0) v = row[x];
				else if (f === 1) v = row[x] - a;
				else if (f === 2) v = row[x] - b;
				else if (f === 3) v = row[x] - ((a + b) >> 1);
				else {
					const p = a + b - cc;
					const pa = Math.abs(p - a);
					const pb = Math.abs(p - b);
					const pc = Math.abs(p - cc);
					v = row[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
				}
				v &= 0xff;
				c[x] = v;
				sum += v < 128 ? v : 256 - v;
			}
			if (sum < bestSum) { bestSum = sum; best = f; }
		}
		out[y * (stride + 1)] = best;
		out.set(cand[best], y * (stride + 1) + 1);
	}
	const idat = await deflate(out);
	const chunk = (type, data) => {
		const b = new Uint8Array(12 + data.length);
		const dv = new DataView(b.buffer);
		dv.setUint32(0, data.length);
		for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
		b.set(data, 8);
		dv.setUint32(8 + data.length, crc32(b, 4, 8 + data.length));
		return b;
	};
	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, W);
	dv.setUint32(4, H);
	ihdr[8] = 8;
	ihdr[9] = opaque ? 2 : 6;
	const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
	const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) { png.set(p, at); at += p.length; }
	return png;
}

/**
 * Photograph one slide and encode it. PNG, or JPEG or WebP at `quality` (1 to 100); a JPEG is drawn on white, since it has no alpha.
 * @returns {Promise<{ bytes: Uint8Array, type: 'png'|'jpeg'|'webp' }>}
 */
export async function captureSlide(section, { type = 'png', quality = 90, ...rest } = {}) {
	const canvas = await captureSlideCanvas(section, rest);
	let source = canvas;
	if (type === 'jpeg') {
		source = canvas.ownerDocument.createElement('canvas');
		source.width = canvas.width;
		source.height = canvas.height;
		const g = source.getContext('2d');
		g.fillStyle = '#fff';
		g.fillRect(0, 0, source.width, source.height);
		g.drawImage(canvas, 0, 0);
	}
	if (type === 'png') return { bytes: await encodePng(source), type };
	const mime = type === 'jpeg' ? 'image/jpeg' : type === 'webp' ? 'image/webp' : 'image/png';
	const blob = await new Promise((res, rej) => source.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob returned null'))), mime, type === 'png' ? undefined : quality / 100));
	return { bytes: new Uint8Array(await blob.arrayBuffer()), type };
}
