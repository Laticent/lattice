/**
 * THE PHOTO EXPORT PROBE, run INSIDE the Studio page by WebDriver (run.mjs) on Mobile Safari in the iOS Simulator, and by the
 * Playwright self-test (probe.selftest.mjs) on WebKit. It checks, on the surface the owner exports from, what
 * docs/e2e/export-photo-size.spec.ts checks in Chromium, Firefox and Linux WebKit
 * (engineering/decisions/2026-11-03-pictures-at-drawn-size.md):
 *
 *   1. a phone photo (4032 x 3024, several megabytes as a `data:` URL) is MEASURED: the `image` slide takes its shape
 *      (`data-img-bucket="wide"`), where a regex Safari gave up on left it unmeasured and the export laid it out wrong;
 *   2. the PowerPoint export has one picture per slide, every one different (a WebKit export repeated slide 2's picture),
 *      and none blank (a WebKit export's title slide came out black);
 *   3. each photo slide's picture, and the whole file, stay under the gate's ceilings.
 *
 * The export is read from the page, not from a download: on iOS the Studio saves behind a "Save" toast and the share sheet,
 * which WebDriver cannot drive. So the probe turns the share sheet off (`navigator.canShare` answers false, which is the
 * Studio's own fallback, download.js `saveWithAnchor`), keeps the named File the fallback makes (`URL.createObjectURL`),
 * and stops the fallback's link click, so Safari shows no download prompt. The file's bytes are then read where they are.
 *
 * The file defines one global function, `latticeExportPhotoProbe()`, which resolves to a plain JSON result. Plain browser JS
 * on purpose: WebDriver's execute-script sends source text, not a module.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeExportPhotoProbe() {
	// The gate's ceilings (docs/e2e/export-photo-size.spec.ts): one photo slide's picture, and the whole file.
	const PHOTO_SLIDE_MAX = 168_000;
	const FILE_MAX = 560_000;
	const PHOTOS = 3;

	const result = { ua: navigator.userAgent, width: innerWidth, steps: [], ok: false };
	const step = (name, pass, detail) => {
		result.steps.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
		if (!pass) throw new Error(`${name}: ${detail}`);
	};
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = await fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(100);
		}
	};
	const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const byLabel = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const byText = (re, root = document) => [...root.querySelectorAll('button')].find((b) => visible(b) && re.test(b.textContent.trim()));
	const narrow = innerWidth <= 699;
	const frameDoc = () => {
		try {
			return document.querySelector('[aria-label="Live deck preview"] iframe.live')?.contentDocument || null;
		} catch {
			return null;
		}
	};
	const shown = () => frameDoc()?.querySelector('section h1, section h2')?.textContent?.trim() ?? '';
	const editorText = () => document.querySelector('[aria-label="Deck source"]')?.textContent ?? '';

	// ── The download, kept in the page ──────────────────────────────────────────────────────────────────────────────
	const saved = [];
	const realCreate = URL.createObjectURL.bind(URL);
	URL.createObjectURL = (obj) => {
		if (obj instanceof File) saved.push(obj);
		return realCreate(obj);
	};
	try {
		Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
	} catch {
		/* a read-only navigator: the share path still ends in the same fallback when the toast times out */
	}
	const realClick = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		if (/^blob:/.test(this.href || '')) return;
		return realClick.call(this);
	};

	// ── Photo-like JPEGs at a phone's size, seeded: the gate's own recipe ───────────────────────────────────────────
	const phonePhotos = () => {
		const out = [];
		for (let k = 0; k < PHOTOS; k++) {
			const c = document.createElement('canvas');
			c.width = 4032;
			c.height = 3024;
			const g = c.getContext('2d');
			const grad = g.createLinearGradient(0, 0, 4032, 3024);
			grad.addColorStop(0, `hsl(${k * 110}, 55%, 32%)`);
			grad.addColorStop(1, `hsl(${k * 110 + 140}, 55%, 68%)`);
			g.fillStyle = grad;
			g.fillRect(0, 0, 4032, 3024);
			let seed = 4242 + k;
			const rnd = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return seed / 2 ** 32;
			};
			for (let i = 0; i < 60; i++) {
				g.fillStyle = `hsla(${Math.floor(rnd() * 360)}, 50%, ${30 + rnd() * 40}%, 0.35)`;
				g.beginPath();
				g.arc(rnd() * 4032, rnd() * 3024, 150 + rnd() * 700, 0, Math.PI * 2);
				g.fill();
			}
			const img = g.getImageData(0, 0, 4032, 3024);
			for (let i = 0; i < img.data.length; i += 4) {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				const n = ((seed >>> 24) % 25) - 12;
				img.data[i] += n;
				img.data[i + 1] += n;
				img.data[i + 2] += n;
			}
			g.putImageData(img, 0, 0);
			out.push(c.toDataURL('image/jpeg', 0.9));
			c.width = 0;
			c.height = 0;
		}
		return out;
	};

	// ── The editor (the phone's one-pane layout swaps it in) ────────────────────────────────────────────────────────
	const openSource = async () => {
		if (!narrow) return;
		(await until(() => byLabel('Markdown source'), 15000, 'the Markdown source button')).click();
		await until(() => visible(document.querySelector('[aria-label="Deck source"]')), 15000, 'the editor');
	};
	const openPreview = async () => {
		if (!narrow) return;
		const b = byLabel('Preview') || byText(/^Preview$/);
		if (b) b.click();
		await until(() => frameDoc()?.querySelector('section'), 15000, 'the preview');
	};
	/** Type the deck and keep it: the Studio's starter deck can land after the editor is up and replace it. */
	const setDeck = async (text, marker) => {
		for (let i = 0; i < 4; i++) {
			await openSource();
			const el = document.querySelector('[aria-label="Deck source"]');
			el.focus();
			document.execCommand('selectAll');
			document.execCommand('insertText', false, text);
			const t0 = Date.now();
			while (!editorText().includes(marker) && Date.now() - t0 < 20000) await sleep(250);
			if (editorText().includes(marker)) return;
		}
		throw new Error('the probe deck did not stay in the editor');
	};

	// ── The PowerPoint, read in the page ────────────────────────────────────────────────────────────────────────────
	/** Every `ppt/media/*` part of a zip: name, stored size, SHA-256 of its bytes, and the bytes. Pictures are stored, not deflated. */
	const pictures = async (zip) => {
		const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
		const out = [];
		for (let i = 0; i + 46 <= zip.length; i++) {
			if (view.getUint32(i, true) !== 0x02014b50) continue;
			const method = view.getUint16(i + 10, true);
			const csize = view.getUint32(i + 20, true);
			const size = view.getUint32(i + 24, true);
			const nameLen = view.getUint16(i + 28, true);
			const extraLen = view.getUint16(i + 30, true);
			const commentLen = view.getUint16(i + 32, true);
			const local = view.getUint32(i + 42, true);
			const name = new TextDecoder('latin1').decode(zip.subarray(i + 46, i + 46 + nameLen));
			if (name.startsWith('ppt/media/') && !name.endsWith('/')) {
				const at = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
				const bytes = zip.slice(at, at + csize);
				const hash = method === 0 ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('') : `${method}:${csize}`;
				out.push({ name, size, hash, bytes });
			}
			i += 46 + nameLen + extraLen + commentLen - 1;
		}
		return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
	};
	/** The spread of a picture's pixels: a blank (one flat color) picture is about 0. */
	const spread = async (bytes) => {
		const bmp = await createImageBitmap(new Blob([bytes]));
		const c = document.createElement('canvas');
		c.width = 160;
		c.height = 90;
		const g = c.getContext('2d');
		g.drawImage(bmp, 0, 0, 160, 90);
		const d = g.getImageData(0, 0, 160, 90).data;
		let sum = 0;
		let sq = 0;
		const n = d.length / 4;
		for (let i = 0; i < d.length; i += 4) {
			const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
			sum += v;
			sq += v * v;
		}
		return Math.sqrt(sq / n - (sum / n) ** 2);
	};

	try {
		await until(() => window.__latticeRenderMetrics && document.querySelector('[aria-label="Deck source"]'), 90000, 'the Studio editor');
		await until(() => shown() !== '', 90000, 'the first preview render');
		await sleep(1000);

		const t0 = Date.now();
		const photos = phonePhotos();
		const photoBytes = photos.reduce((s, p) => s + Math.round(((p.length - 23) * 3) / 4), 0);
		step('three 4032 x 3024 photos made in the page', photos.length === PHOTOS, `${Math.round(photoBytes / 1024)} KB of JPEG in ${Date.now() - t0} ms`);
		const marker = 'The caption sits beside the photo.';
		const deck = [
			'## Phone photos',
			...photos.map((p, i) => `<!-- _class: image -->\n\n\`Photo ${i + 1}\`\n\n## A phone photo beside its caption\n\n${marker}\n\n![bg](${p})`),
		].join('\n\n---\n\n');
		await setDeck(`${deck}\n`, marker);
		await openPreview();

		// 1. The photo was measured: the image slide took its shape.
		const bucket = await until(
			() => {
				const s = frameDoc()?.querySelector('section.image');
				return s?.getAttribute('data-img-bucket') || null;
			},
			60000,
			'the image slide to take its photo\'s shape',
		).catch((e) => `none (${frameDoc()?.querySelector('section.image')?.getAttribute('data-img-composition') ?? 'no image slide'}; ${e.message})`);
		step('a phone photo is measured (data-img-bucket)', bucket === 'wide', bucket);

		// 2. Export PowerPoint through the Share sheet.
		// A click that lands while the sheet is still opening, or while a 15 MB deck is still being drawn, can be lost: click the
		// PowerPoint row again until its options step (and its Download button) is up.
		const share = await until(() => byLabel('Share') || byText(/^Share$/), 30000, 'the Share button');
		share.click();
		let downloadButton = null;
		for (let i = 0; i < 4 && !downloadButton; i++) {
			const dialog = await until(() => [...document.querySelectorAll('[role="dialog"]')].find(visible), 15000, 'the Share sheet');
			const row = byText(/^PowerPoint/, dialog);
			if (row) row.click();
			downloadButton = await until(() => byText(/^Download PowerPoint/, document), 20000, 'Download PowerPoint').catch(() => null);
		}
		step('the PowerPoint options step opens', !!downloadButton, downloadButton ? '' : 'no Download PowerPoint button after four tries');
		// The picture export (the default), as the photo-size gate exports it.
		const editable = [...document.querySelectorAll('[role="switch"][aria-label="Editable text"]')].find(visible);
		if (editable?.getAttribute('aria-checked') === 'true') editable.click();
		downloadButton.click();
		const t1 = Date.now();
		const file = await until(() => saved.find((f) => /\.pptx$/i.test(f.name)), 360000, 'the PowerPoint file');
		const exportMs = Date.now() - t1;
		const zip = new Uint8Array(await file.arrayBuffer());
		const pics = await pictures(zip);
		result.sizes = { file: zip.length, slides: pics.map((p) => p.size), exportMs };
		step('one picture per slide', pics.length === PHOTOS + 1, pics.map((p) => p.name).join(' '));
		step('every slide picture differs', new Set(pics.map((p) => p.hash)).size === PHOTOS + 1, pics.map((p) => p.hash.slice(0, 8)).join(' '));
		for (const p of pics) {
			const s = await spread(p.bytes);
			step(`${p.name} is not blank`, s > 8, `pixel spread ${s.toFixed(1)}`);
		}
		for (const p of pics.slice(1)) step(`${p.name} under ${PHOTO_SLIDE_MAX} bytes`, p.size < PHOTO_SLIDE_MAX, p.size);
		step(`the file under ${FILE_MAX} bytes`, zip.length < FILE_MAX, `${zip.length} bytes, exported in ${exportMs} ms`);
		result.ok = true;
	} catch (e) {
		result.error = String(e?.message || e);
	} finally {
		URL.createObjectURL = realCreate;
		HTMLAnchorElement.prototype.click = realClick;
		try {
			delete navigator.canShare;
		} catch {
			/* left as it was set */
		}
	}
	return result;
}
