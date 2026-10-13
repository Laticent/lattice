import { deflateSync } from 'node:zlib';
import { CHROME, expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

// A PHOTO IN THE STUDIO CHAT, ON THE REAL SURFACE.
//
// The paperclip's "Add a photo…" opens the device's own picker (no `capture` attribute, so a phone
// offers Photo Library, Take Photo and Choose File). The picture goes through the Library's intake
// to the open deck's shelf, shows as a thumbnail, and travels to the model as an image part, with a
// note naming it `asset:<name>` so the model can put it on a slide. The model is MOCKED, not spent
// (HARD RULE #24); this spec reads the request body the mock receives.

// A real PNG, built here (zlib + CRC), so the browser's own decoder reads it — nothing is stubbed.
function makePng(w: number, h: number): Buffer {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buf: Buffer) => {
		let c = 0xffffffff;
		for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const sum = Buffer.alloc(4);
		sum.writeUInt32BE(crc(body));
		return Buffer.concat([len, body, sum]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB
	const rows = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set([(x * 255) / w, (y * 255) / h, 120], y * (w * 3 + 1) + 1 + x * 3);
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng(160, 120);

const MODELS = (vision: boolean, video = false) => [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: [...(vision ? ['text', 'image'] : ['text']), ...(video ? ['video'] : [])] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

async function seed(page: import('@playwright/test').Page, vision: boolean, video = false) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-or-model', 'test/model');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the spec fails loudly on the missing control */
		}
	});
	const bodies: { messages: { role: string; content: unknown }[] }[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS(vision, video) } : { data: [] }) });
			return;
		}
		bodies.push(route.request().postDataJSON());
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: sse([
				{ id: 'g', choices: [{ index: 0, delta: { content: 'I can see a small striped image.' } }] },
				{ id: 'g', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0.01 } },
			]),
		});
	});
	return bodies;
}

async function pickPhoto(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: 'Attach a photo, video or reference document' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add a photo or video…' }).click();
	await (await chooser).setFiles({ name: 'Team Offsite.png', mimeType: 'image/png', buffer: PNG });
}

for (const [w, h] of [
	[1440, 900],
	[390, 844],
] as const) {
	test.describe(`at ${w}px`, () => {
		test.use({ viewport: { width: w, height: h } });

		test(`a picked photo is kept in the Library, shown, and sent to the model as an image${w === 390 ? ' @webkit-phone' : ''}`, async ({ page }) => {
			test.setTimeout(90_000);
			const bodies = await seed(page, true);
			await gotoStudio(page);
			await openChatAtWidth(page, w);
			await pickPhoto(page);

			// A thumbnail of what was picked, before anything is sent.
			const strip = page.getByTestId('chat-photo-strip');
			// The IMAGE, not the placeholder: a photo the map cannot resolve shows an `ImageOff` tile whose label
			// starts with the same words, so match the name exactly and read the decoded pixels.
			const thumb = strip.getByRole('img', { name: 'Attachment team-offsite', exact: true });
			await expect(thumb).toBeVisible({ timeout: 20_000 });
			await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.naturalWidth), { message: 'the thumbnail never decoded' }).toBeGreaterThan(0);
			await page.screenshot({ path: test.info().outputPath(`chat-photos-strip-${w}.png`) });

			await page.getByRole('textbox', { name: 'Message the Architect' }).fill('what is in this photo?');
			await page.getByRole('button', { name: 'Send', exact: true }).click();
			await expect(page.getByText('I can see a small striped image.')).toBeVisible({ timeout: 30_000 });

			// The sent bubble keeps the picture, and the strip is empty again.
			const sentThumb = page.getByTestId('chat-message-photos').getByRole('img', { name: 'Attachment team-offsite', exact: true });
			await expect(sentThumb).toBeVisible();
			await expect.poll(() => sentThumb.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
			await expect(page.getByTestId('chat-photo-strip')).toHaveCount(0);

			// What the model received: the LAST user message holds an image part (a real data URL) and a
			// note naming the asset. Its data URL is the picture, not a path.
			const sent = bodies.at(-1)?.messages.filter((m) => m.role === 'user').at(-1)?.content as { type: string; text?: string; image_url?: { url: string } }[];
			expect(Array.isArray(sent), 'the photo was sent as plain text').toBe(true);
			expect(sent.find((p) => p.type === 'image_url')?.image_url?.url).toMatch(/^data:image\/(jpeg|png|webp);base64,/);
			expect(sent.find((p) => p.type === 'text')?.text).toContain('asset:team-offsite');
			await page.screenshot({ path: test.info().outputPath(`chat-photos-sent-${w}.png`) });
		});
	});
}

test('a model that cannot read images refuses the photo before anything is sent', async ({ page }) => {
	test.setTimeout(60_000);
	const bodies = await seed(page, false);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await pickPhoto(page);
	await expect(page.getByText(/can't read photos/)).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('chat-photo-strip')).toHaveCount(0);
	// Nothing was sent: the refusal happens at attach time, before any message exists.
	expect(bodies).toHaveLength(0);
});

// A real clip, recorded in the page (canvas -> MediaRecorder), so the browser's own decoder reads it.
async function recordClip(page: import('@playwright/test').Page, seconds: number): Promise<Buffer> {
	const b64 = await page.evaluate(async (secs) => {
		const c = document.createElement('canvas');
		c.width = 160;
		c.height = 90;
		const ctx = c.getContext('2d') as CanvasRenderingContext2D;
		const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
		const chunks: Blob[] = [];
		rec.ondataavailable = (e) => chunks.push(e.data);
		const done = new Promise<void>((r) => {
			rec.onstop = () => r();
		});
		rec.start();
		const t0 = performance.now();
		await new Promise<void>((resolve) => {
			const tick = () => {
				ctx.fillStyle = `hsl(${((performance.now() - t0) / 8) % 360} 70% 50%)`;
				ctx.fillRect(0, 0, 160, 90);
				if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick);
				else resolve();
			};
			tick();
		});
		rec.stop();
		await done;
		const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
		let s = '';
		for (const x of buf) s += String.fromCharCode(x);
		return btoa(s);
	}, seconds);
	return Buffer.from(b64, 'base64');
}

async function pickFile(page: import('@playwright/test').Page, file: { name: string; mimeType: string; buffer: Buffer }) {
	await page.getByRole('button', { name: 'Attach a photo, video or reference document' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add a photo or video…' }).click();
	await (await chooser).setFiles(file);
}

test('a short clip is attached with a poster and a length, and goes to a video model as a video part', async ({ page }) => {
	test.setTimeout(90_000);
	const bodies = await seed(page, true, true);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	const clip = await recordClip(page, 2);
	await pickFile(page, { name: 'Walkthrough.webm', mimeType: 'video/webm', buffer: clip });

	const strip = page.getByTestId('chat-photo-strip');
	const poster = strip.getByRole('img', { name: /^Video walkthrough-[a-z0-9]+$/ });
	await expect(poster).toBeVisible({ timeout: 20_000 });
	await expect.poll(() => poster.evaluate((el: HTMLImageElement) => el.naturalWidth), { message: 'the poster never decoded' }).toBeGreaterThan(0);
	await expect(strip.getByText(/^0:0[1-3]$/)).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('chat-video-strip.png') });

	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('what happens in this clip?');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText('I can see a small striped image.')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('chat-message-photos').getByRole('img', { name: /^Video walkthrough-[a-z0-9]+$/ })).toBeVisible();

	const sent = bodies.at(-1)?.messages.filter((m) => m.role === 'user').at(-1)?.content as { type: string; text?: string; video_url?: { url: string } }[];
	expect(Array.isArray(sent), 'the clip was sent as plain text').toBe(true);
	expect(sent.find((p) => p.type === 'video_url')?.video_url?.url).toMatch(/^data:video\/webm;base64,/);
	expect(sent.find((p) => p.type === 'text')?.text).toContain('short video');
	await page.screenshot({ path: test.info().outputPath('chat-video-sent.png') });
});

test('a clip over the size cap is refused before it is read, and nothing is attached', async ({ page }) => {
	test.setTimeout(60_000);
	const bodies = await seed(page, true, true);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	await pickFile(page, { name: 'Long.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(16 * 1024 * 1024) });
	await expect(page.getByText(/at most 15 MB/)).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('chat-photo-strip')).toHaveCount(0);
	expect(bodies).toHaveLength(0);
});

test('a model that reads images but not video refuses a clip up front', async ({ page }) => {
	test.setTimeout(60_000);
	await seed(page, true, false);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	const clip = await recordClip(page, 1);
	await pickFile(page, { name: 'Clip.webm', mimeType: 'video/webm', buffer: clip });
	await expect(page.getByText(/can't read video/)).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('chat-photo-strip')).toHaveCount(0);
});

test('a mixed pick judges each kind on its own: the photo attaches, the refused clip is explained', async ({ page }) => {
	test.setTimeout(60_000);
	await seed(page, true, false);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	const clip = await recordClip(page, 1);
	await page.getByRole('button', { name: 'Attach a photo, video or reference document' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add a photo or video…' }).click();
	await (
		await chooser
	).setFiles([
		{ name: 'Team Offsite.png', mimeType: 'image/png', buffer: PNG },
		{ name: 'Clip.webm', mimeType: 'video/webm', buffer: clip },
	]);
	await expect(page.getByText(/can't read video/)).toBeVisible({ timeout: 20_000 });
	const strip = page.getByTestId('chat-photo-strip');
	await expect(strip.getByRole('img')).toHaveCount(1, { timeout: 20_000 });
	await expect(strip.getByRole('img', { name: /^Video/ })).toHaveCount(0);
});

test('a sent clip lives in Library → Videos, survives a reload, and Regenerate re-sends it from the shelf', async ({ page }) => {
	test.setTimeout(120_000);
	const bodies = await seed(page, true, true);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	const clip = await recordClip(page, 2);
	await pickFile(page, { name: 'Walkthrough.webm', mimeType: 'video/webm', buffer: clip });
	await expect(page.getByTestId('chat-photo-strip').getByRole('img', { name: /^Video walkthrough-[a-z0-9]+$/ })).toBeVisible({ timeout: 20_000 });
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('what happens in this clip?');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText('I can see a small striped image.')).toBeVisible({ timeout: 30_000 });
	const videoPart = (i: number) => (bodies[i]?.messages.filter((m) => m.role === 'user').at(-1)?.content as { type: string; video_url?: { url: string } }[] | undefined)?.find((p) => p.type === 'video_url')?.video_url?.url;
	expect(videoPart(0)).toMatch(/^data:video\/webm;base64,/);

	// A reload empties every in-memory copy: what is left is what the shelf and the thread kept.
	await page.reload();
	await openChatAtWidth(page, 1440);
	const poster = page.getByTestId('chat-message-photos').getByRole('img', { name: /^Video walkthrough-[a-z0-9]+$/ });
	await expect(poster).toBeVisible({ timeout: 20_000 });
	await expect.poll(() => poster.evaluate((el: HTMLImageElement) => el.naturalWidth), { message: 'the poster never decoded' }).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Regenerate last reply' }).click();
	await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(2);
	expect(videoPart(1), 'Regenerate dropped the clip').toMatch(/^data:video\/webm;base64,/);
	expect(videoPart(1)).toBe(videoPart(0));
	await expect(page.getByText(/no longer in the Library/)).toHaveCount(0);

	// And it is a Library asset: on the Videos tab, with a length, and playable.
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Videos' }).click();
	const card = page.locator('[data-media-card^="walkthrough-"]');
	await expect(card).toBeVisible();
	await expect(card).toContainText(/0:0[1-3]/);
	await expect(page.getByRole('tab', { name: 'Images' })).toBeVisible();
	await card.getByRole('button', { name: /^Play walkthrough-/ }).click();
	await expect(card.locator('video')).toBeVisible();
	// A playing clip is not the 88px still strip: it takes its own proportions (a portrait phone clip was a sliver).
	expect((await card.locator('video').boundingBox())?.height ?? 0).toBeGreaterThan(120);
	await page.screenshot({ path: test.info().outputPath('library-videos.png') });
});

test('the Library adds a clip from its own picker, and the Images tab does not list it', async ({ page }) => {
	test.setTimeout(90_000);
	await seed(page, true, true);
	await gotoStudio(page);
	const clip = await recordClip(page, 1);
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Videos' }).click();
	await page.getByRole('button', { name: 'Add videos' }).click().catch(() => {});
	await page.locator('input[type=file][accept*="video"]').first().setInputFiles({ name: 'Site Visit.webm', mimeType: 'video/webm', buffer: clip });
	await expect(page.locator('[data-media-card="site-visit"]')).toBeVisible({ timeout: 20_000 });
	await page.getByRole('tab', { name: 'Images' }).click();
	await expect(page.locator('[data-media-card="site-visit"]')).toHaveCount(0);
	await page.getByRole('tab', { name: 'All', exact: true }).click();
	await expect(page.locator('[data-media-card="site-visit"]')).toBeVisible();
});

test('a clip taken out of the strip before it is sent is not left in the Library', async ({ page }) => {
	test.setTimeout(90_000);
	await seed(page, true, true);
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	const clip = await recordClip(page, 1);
	await pickFile(page, { name: 'Draft.webm', mimeType: 'video/webm', buffer: clip });
	const strip = page.getByTestId('chat-photo-strip');
	await expect(strip.getByRole('img', { name: /^Video draft-[a-z0-9]+$/ })).toBeVisible({ timeout: 20_000 });
	await strip.getByRole('button', { name: /^Remove draft-/ }).click();
	await expect(strip).toHaveCount(0);
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Videos' }).click();
	await expect(page.getByText('No saved assets yet')).toBeVisible();
	await expect(page.locator('[data-media-card^="draft-"]')).toHaveCount(0);
});
