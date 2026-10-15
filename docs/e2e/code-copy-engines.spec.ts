import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';

// A code block's copy buttons in the OTHER two engine families. @gecko @webkit-tablet
//
// code-copy.spec.ts drives the Studio and the exported webpage in Chromium, and reads the clipboard
// back through `grantPermissions(['clipboard-read'])`, a permission only Chromium grants. Clipboard
// writes are the kind of thing engines disagree on: each decides for itself what counts as a user
// gesture, whether a `file://` page may write, and whether `ClipboardItem` takes `text/html`. So this
// spec opens the exported webpage — the one surface a recipient reads outside our site — in Gecko and
// WebKit, clicks both buttons, and checks what the REAL clipboard accepted.
//
// HOW IT READS THE RESULT without a read permission: an init script wraps the page's own
// `writeText`/`write` and `execCommand('copy')` (the last-resort path in lib/core/code-copy.mjs) in a
// pass-through that records the call and then calls the engine's real method. The engine still does
// the copy, and still accepts or refuses it; the button's `data-copied` reports which (`yes` only
// when a path resolved). The record says which path ran and what it carried.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');

test('the exported webpage copies code and colored HTML in each engine @gecko @webkit-tablet', async ({ page }, testInfo) => {
	test.setTimeout(240_000);
	const dir = testInfo.outputDir;
	fs.mkdirSync(dir, { recursive: true });
	const deck = path.join(dir, 'deck.md');
	fs.writeFileSync(deck, ['---', 'marp: true', 'theme: indaco', '---', '', '# Copy', '', '`@code{copy}`', '```ts', 'const answer = 42;', '```', ''].join('\n'));
	const out = path.join(dir, 'deck.html');
	// `--player`: the self-contained webpage, which is what carries the copy script (the plain `.html`
	// is a static render with no reader chrome). The emulator needs a Chrome binary; hand it the one this tier installs (see
	// export-subresource-engines.spec.ts for why that is declared rather than inherited).
	const { status, stderr } = await new Promise<{ status: number | null; stderr: string }>((res, rej) => {
		const child = spawn(process.execPath, [EMULATOR, deck, out, '--player', '--quiet'], {
			cwd: ROOT,
			env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: chromium.executablePath() },
		});
		let err = '';
		child.stderr.on('data', (b) => { err += b; });
		child.on('error', rej);
		child.on('close', (code) => res({ status: code, stderr: err }));
	});
	expect(status, `the export itself succeeded — stderr: ${stderr.slice(-800)}`).toBe(0);

	await page.addInitScript(() => {
		const log: Array<{ via: string; text?: string; types?: string[]; html?: string; error?: string }> = [];
		(window as unknown as { __copies: typeof log }).__copies = log;
		const clip = navigator.clipboard;
		if (clip?.writeText) {
			const real = clip.writeText.bind(clip);
			clip.writeText = (text: string) => real(text).then(
				() => { log.push({ via: 'writeText', text }); },
				(e) => { log.push({ via: 'writeText', error: String(e) }); throw e; },
			);
		}
		if (clip?.write) {
			const real = clip.write.bind(clip);
			// The REAL write goes first, synchronously inside the click: WebKit ends the click's user
			// activation at the first `await`, so a spy that read the item before writing would make
			// the engine refuse a copy the page itself makes correctly. The item is read afterwards.
			clip.write = (items: ClipboardItems) => {
				const done = real(items);
				const [item] = items;
				const entry: (typeof log)[number] = { via: 'write', types: [...item.types] };
				const read = async () => {
					if (item.types.includes('text/plain')) entry.text = await (await item.getType('text/plain')).text();
					if (item.types.includes('text/html')) entry.html = await (await item.getType('text/html')).text();
				};
				return done.then(
					async () => { await read(); log.push(entry); },
					async (e) => { await read().catch(() => {}); log.push({ ...entry, error: String(e) }); throw e; },
				);
			};
		}
		const exec = document.execCommand.bind(document);
		document.execCommand = (cmd: string, ...rest: unknown[]) => {
			const ok = (exec as (...a: unknown[]) => boolean)(cmd, ...rest);
			if (cmd === 'copy') log.push({ via: 'execCommand', text: document.getSelection()?.toString() ?? '', error: ok ? undefined : 'refused' });
			return ok;
		};
	});

	await page.goto(`file://${out}`);
	// The player shows the block on its slide and in its reading view: two buttons each.
	await expect(page.locator('pre[data-copy] .lat-code-copy-btn')).toHaveCount(4, { timeout: 20_000 });
	const copies = () => page.evaluate(() => (window as unknown as { __copies: unknown[] }).__copies);

	const pre = page.locator('pre[data-copy]').first();
	await pre.hover();
	const asText = pre.locator('.lat-code-copy-btn[data-kind="text"]');
	await asText.click();
	await expect(asText, 'the engine accepted the copy').toHaveAttribute('data-copied', 'yes');
	const [first] = (await copies()) as Array<{ via: string; text?: string; error?: string }>;
	expect(first.error, `${first.via} succeeded`).toBeUndefined();
	expect(first.text).toBe('const answer = 42;');

	await pre.hover();
	const asHtml = pre.locator('.lat-code-copy-btn[data-kind="html"]');
	await asHtml.click();
	await expect(asHtml, 'the engine accepted the copy').toHaveAttribute('data-copied', 'yes');
	const [, second] = (await copies()) as Array<{ via: string; text?: string; html?: string; error?: string }>;
	expect(second.error, `${second.via} succeeded`).toBeUndefined();
	testInfo.annotations.push({ type: 'copy path', description: `text: ${first.via} · html: ${second.via}` });
	if (second.via === 'write') {
		expect(second.text).toBe('const answer = 42;');
		expect(second.html, 'colored, inline').toMatch(/<pre style="[^"]*background[^"]*">[\s\S]*<span style="color: rgb\(/);
	}
});
