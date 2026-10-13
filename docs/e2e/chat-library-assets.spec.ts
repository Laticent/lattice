import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openChat, setEditorContent, test } from './studio-fixture';

// THE CHAT KNOWS THE LIBRARY, LOOKS AT A PHOTO ONCE, AND REMEMBERS WHAT IT SAW.
//
// Real surface (HARD RULE #23): the real Studio, photos added through the Library's own file
// input (so they are decoded, resized and stored by the real importer), the real chat agent,
// and the real thumbnail code (`createImageBitmap` + canvas) in Chromium. The MODEL is mocked,
// never spent (HARD RULE #24): the seeded key is a throwaway and every openrouter.ai request is
// fulfilled here. What the mock lets us assert is exactly what the real model would be sent.
//
//   · the prompt carries a one-line-per-photo list, and only when the Library has something;
//   · a vision model asking to see a photo gets ONE small JPEG, labeled by name;
//   · the caption the model writes is stored on the photo and comes back as text next turn;
//   · a model that cannot read images is told so and is never sent a picture.
//
// NOT covered, and marked UNVERIFIED in the PR: how a real model chooses between photos.

const DECK = ['---', 'theme: indaco', '---', '', '<!-- _class: title -->', '# Our work', '', '---', '', '<!-- _class: content -->', '## Photos', '', '- Coming'].join('\n');
const MODEL = '~anthropic/claude-sonnet-latest';

type Body = { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] };
type Round = { text?: string; call?: { name: string; args: unknown } };

function sse(frames: unknown[]): string {
	return `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;
}

/** Script the model: round i answers `rounds[i]`; past the end it answers with plain text. */
async function mockModel(page: Page, vision: boolean, rounds: Round[]): Promise<Body[]> {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the spec fails loudly on the missing control */
		}
	});
	const bodies: Body[] = [];
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/chat/completions')) {
			const body = route.request().postDataJSON() as Body;
			bodies.push(body);
			const r = rounds[bodies.length - 1] ?? { text: 'Done.' };
			const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 };
			const id = `gen-${bodies.length}`;
			const frames = r.call
				? [
						{ id, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${bodies.length}`, type: 'function', function: { name: r.call.name, arguments: JSON.stringify(r.call.args) } }] } }] },
						{ id, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage },
					]
				: [
						{ id, choices: [{ index: 0, delta: { content: r.text ?? 'Done.' } }] },
						{ id, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
					];
			await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(frames) });
		} else if (url.endsWith('/models') || url.includes('/models?')) {
			const model = { id: MODEL, name: 'Mock model', pricing: { prompt: '0.000003', completion: '0.000015' }, context_length: 200000, architecture: { input_modalities: vision ? ['text', 'image'] : ['text'] } };
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [model] }) });
		} else {
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
		}
	});
	return bodies;
}

/** Add photos through the Library's own file input, exactly what the OS picker does. */
async function addPhotos(page: Page, files: { name: string; width: number; height: number }[]) {
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('tab', { name: 'Images' }).click();
	await page.evaluate(async (specs) => {
		const dt = new DataTransfer();
		for (const s of specs) {
			const c = document.createElement('canvas');
			c.width = s.width;
			c.height = s.height;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.fillStyle = '#d02828';
			g.fillRect(0, 0, s.width / 2, s.height);
			g.fillStyle = '#2840d0';
			g.fillRect(s.width / 2, 0, s.width / 2, s.height);
			const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', 0.92));
			dt.items.add(new File([blob], s.name, { type: 'image/jpeg' }));
		}
		const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, files);
	await expect(page.getByText(files[0].name.replace(/\.jpe?g$/i, ''), { exact: false }).first()).toBeVisible({ timeout: 30_000 });
	// Close the Library so the chat is reachable again.
	await page.keyboard.press('Escape');
}

async function ask(page: Page, text: string, settled: string) {
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill(text);
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText(settled).first()).toBeVisible({ timeout: 60_000 });
}

const wire = (b: Body) => JSON.stringify(b.messages);
const toolNames = (b: Body) => (b.tools ?? []).map((t) => t.function.name);
const imageParts = (b: Body) => b.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; image_url?: { url: string } }[]) : [])).filter((p) => p.type === 'image_url');

async function storedCaption(page: Page, name: string): Promise<string | null> {
	return page.evaluate(async (n) => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: Record<string, unknown>[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as Record<string, unknown>[]);
		});
		const row = rows.find((x) => x.kind === 'image' && x.name === n);
		return (row?.caption as string | undefined) ?? null;
	}, name);
}

const PHOTOS = [
	{ name: 'shop-floor.jpg', width: 3000, height: 2000 },
	{ name: 'portrait-ana.jpg', width: 2000, height: 3000 },
];

test('a vision model is shown a photo once, captions it, and next turn reads the caption as text', async ({ page }) => {
	test.setTimeout(180_000);
	const bodies = await mockModel(page, true, [
		{ call: { name: 'view_asset', args: { names: ['shop-floor'] } } },
		{ call: { name: 'caption_asset', args: { captions: [{ name: 'shop-floor', caption: 'A wide shot, red left half, blue right half' }] } } },
		{ text: 'I looked at shop-floor and saved what it shows.' },
		{ text: 'Second turn answered from the captions.' },
	]);
	// Count the Library's real IndexedDB reads: each `listMedia` is two `getAll` calls on the `kind` index (image, video)
	// and loads every photo's bytes, so the count is the cost of reading the shelf.
	await page.addInitScript(() => {
		(window as unknown as { __kindReads: number }).__kindReads = 0;
		const orig = IDBIndex.prototype.getAll;
		IDBIndex.prototype.getAll = function (this: IDBIndex, ...a: Parameters<IDBIndex['getAll']>) {
			if (this.name === 'kind') (window as unknown as { __kindReads: number }).__kindReads++;
			return orig.apply(this, a);
		};
	});
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await addPhotos(page, PHOTOS);
	await openChat(page);

	const reads = () => page.evaluate(() => (window as unknown as { __kindReads: number }).__kindReads);
	const readsBefore = await reads();
	await ask(page, 'Make a collage of my photos.', 'I looked at shop-floor and saved what it shows.');
	// One turn that lists the Library, looks at one photo and saves one caption reads the shelf ONCE (two getAll calls),
	// not once per call. The app's own preview refresh after the caption may add one more read.
	const readsDuring = (await reads()) - readsBefore;
	test.info().annotations.push({ type: 'shelf-reads', description: `getAll(kind) calls during the turn: ${readsDuring}` });
	expect(readsDuring, 'the turn read the shelf more than once per photo call').toBeLessThanOrEqual(4);

	// Round 1: the list is in the prompt and the three Library tools are offered.
	expect(toolNames(bodies[0])).toEqual(expect.arrayContaining(['list_assets', 'view_asset', 'caption_asset']));
	expect(wire(bodies[0])).toContain('LIBRARY ASSETS');
	expect(wire(bodies[0])).toContain('shop-floor · photo · landscape 3:2 · all decks');
	expect(wire(bodies[0])).toContain('portrait-ana · photo · portrait 2:3 · all decks');
	// The list is a few lines, not the pictures: no image has gone out yet.
	expect(imageParts(bodies[0])).toHaveLength(0);

	// Round 2: exactly one picture, a small JPEG, labeled with the name the model asked for.
	const shown = imageParts(bodies[1]);
	expect(shown).toHaveLength(1);
	expect(shown[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
	expect(wire(bodies[1])).toContain('asset:shop-floor');
	// A 3000×2000 photo became a thumbnail well under 150 KB of base64, at most 512 px on a side.
	const url = shown[0].image_url?.url ?? '';
	expect(url.length).toBeLessThan(150_000);
	const dims = await page.evaluate(async (u) => {
		const img = new Image();
		img.src = u;
		await img.decode();
		return [img.naturalWidth, img.naturalHeight];
	}, url);
	expect(Math.max(...dims)).toBeLessThanOrEqual(512);
	expect(dims[0] / dims[1]).toBeCloseTo(1.5, 1);

	// Round 3 carries the save result, and the caption is on the stored photo.
	expect(wire(bodies[2])).toContain('shop-floor: saved.');
	expect(await storedCaption(page, 'shop-floor')).toBe('A wide shot, red left half, blue right half');

	// A second turn: the caption is read as TEXT, and no picture goes out again.
	await ask(page, 'Which photo is the wide one?', 'Second turn answered from the captions.');
	const turn2 = bodies[3];
	expect(wire(turn2)).toContain('shop-floor · photo · landscape 3:2 · all decks · \\"A wide shot, red left half, blue right half\\"');
	expect(wire(turn2)).toContain('1 photo has no caption yet');
	expect(imageParts(turn2)).toHaveLength(0);
	await page.screenshot({ path: test.info().outputPath('chat-library-assets.png') });
});

test('a model that cannot read images is told so and never sent a picture', async ({ page }) => {
	test.setTimeout(180_000);
	const bodies = await mockModel(page, false, [{ call: { name: 'view_asset', args: { names: ['portrait-ana'] } } }, { text: 'Working from names and shapes.' }]);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await addPhotos(page, PHOTOS);
	await openChat(page);
	await ask(page, 'What is in my portrait photo?', 'Working from names and shapes.');
	expect(wire(bodies[1])).toContain('cannot read images');
	for (const b of bodies) expect(imageParts(b)).toHaveLength(0);
	expect(await storedCaption(page, 'portrait-ana')).toBeNull();
});

test('an empty Library adds nothing to the prompt, tools included', async ({ page }) => {
	test.setTimeout(120_000);
	const bodies = await mockModel(page, true, [{ text: 'No photos here.' }]);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openChat(page);
	await ask(page, 'Hello.', 'No photos here.');
	expect(wire(bodies[0])).not.toContain('LIBRARY ASSETS');
	expect(toolNames(bodies[0])).not.toContain('view_asset');
	expect(toolNames(bodies[0])).toContain('edit_slides');
});

// The cost readout beside the chat is a typical-turn estimate (agentTurnUsd). A Library puts its list and three
// tool definitions in every turn, so adding photos must raise it, a little, and removing them must bring it back.
const readout = async (page: Page) => {
	// The per-turn figures live in the model chip's dropdown (ChatCost's ModelChip): open it, read both, close it.
	const chip = page.getByRole('button', { name: /Change model/ });
	if (!(await chip.count())) return null;
	await chip.click();
	const figure = async (label: string) => {
		const row = page.getByText(label, { exact: true }).locator('xpath=following-sibling::span').first();
		if (!(await row.count())) return null;
		const m = (await row.textContent())?.match(/\$([\d.]+)/);
		return m ? Number(m[1]) : null;
	};
	const question = await figure('Ask a question');
	const edit = await figure('Make an edit');
	await page.keyboard.press('Escape');
	return question != null && edit != null ? { question, edit } : null;
};

test('the cost readout rises by a few tenths of a cent when the Library gains photos', async ({ page }) => {
	test.setTimeout(180_000);
	await mockModel(page, true, []);
	// A real user has the model catalog cached (it is fetched when the picker opens or a turn runs), and the
	// readout needs its price. Seed the cache the way the app writes it, at Sonnet's $3 / $15 per million.
	await page.addInitScript((id) => {
		try {
			const models = [{ id, name: 'Mock model', promptPerM: 3, completionPerM: 15, contextLength: 200000, maxOutput: 8192, vision: true }];
			localStorage.setItem('lattice-db-or-catalog', JSON.stringify({ fetchedAt: Date.now(), models }));
		} catch {}
	}, MODEL);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openChat(page);
	await expect.poll(() => readout(page), { timeout: 30_000 }).not.toBeNull();
	const before = await readout(page);
	await addPhotos(page, PHOTOS);
	if (!(await page.getByRole('textbox', { name: 'Message the Architect' }).isVisible())) await openChat(page);
	await expect.poll(async () => (await readout(page))?.edit ?? 0, { timeout: 30_000 }).toBeGreaterThan(before?.edit ?? 0);
	const after = await readout(page);
	await page.screenshot({ path: test.info().outputPath('chat-readout-with-library.png') });
	expect(after?.question).toBeGreaterThanOrEqual(before?.question ?? 0);
	// Two photos add their list lines and the three tool definitions: well under a cent.
	expect((after?.edit ?? 0) - (before?.edit ?? 0)).toBeLessThan(0.01);
	test.info().annotations.push({ type: 'readout', description: `before ${JSON.stringify(before)} after ${JSON.stringify(after)}` });
});
