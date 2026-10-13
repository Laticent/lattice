import { deflateSync } from 'node:zlib';
import { expect, gotoStudio, openChatAtWidth, test } from './studio-fixture';

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

const MODELS = (vision: boolean) => [{ id: 'test/model', name: 'Test Model', context_length: 100000, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: vision ? ['text', 'image'] : ['text'] }, top_provider: { max_completion_tokens: 8000 } }];
const sse = (frames: unknown[]) => `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

async function seed(page: import('@playwright/test').Page, vision: boolean) {
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
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/models') ? { data: MODELS(vision) } : { data: [] }) });
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
	await page.getByRole('button', { name: 'Attach a photo or reference document' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add a photo…' }).click();
	await (await chooser).setFiles({ name: 'Team Offsite.png', mimeType: 'image/png', buffer: PNG });
}

for (const [w, h] of [
	[1440, 900],
	[390, 844],
] as const) {
	test.describe(`at ${w}px`, () => {
		test.use({ viewport: { width: w, height: h } });

		test('a picked photo is kept in the Library, shown, and sent to the model as an image', async ({ page }) => {
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
