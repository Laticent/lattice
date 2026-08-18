/**
 * §9.2's numbers, made checkable.
 *
 * The table in §9.2 reports the deck `<style>` element's size pre-fix and post-fix. A first
 * draft reported `textContent.length` — UTF-16 CODE UNITS — while calling them bytes, and the
 * gap is 1,507 on this fixture because the engine sheet is full of `—` and `’`. This prints
 * both, so the figure in the note can be re-derived rather than taken on trust (§9.4's own
 * lesson about a number nobody can check).
 *
 *   node engineering/decisions/2026-08-17-theme-css-is-a-preview-sink/probe-truncation-bytes.mjs <file.html>...
 *
 * Render the fixture with a payload-bearing front-matter `style:` block or `--css` sheet; see
 * test/integration/export/style-sink-breakout.test.js for the exact shapes.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const files = process.argv.slice(2);
if (!files.length) {
	console.error('usage: probe-truncation-bytes.mjs <rendered.html>...');
	process.exit(2);
}
const browser = await puppeteer.launch({
	executablePath: process.env.CHROME_PATH,
	headless: 'new',
	args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
for (const f of files) {
	const page = await browser.newPage();
	await page.goto(pathToFileURL(path.resolve(f)).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
	const r = await page.evaluate(() =>
		[...document.querySelectorAll('style')]
			// the base64 font block dwarfs everything and is not the deck sheet
			.filter((s) => s.id !== 'lattice-embedded-fonts')
			.map((s) => ({ chars: s.textContent.length, bytes: new TextEncoder().encode(s.textContent).length, tail: s.textContent.slice(-46).replace(/\s+/g, ' ') }))
			.sort((a, b) => b.bytes - a.bytes)[0],
	);
	console.log(`${path.basename(f)}  chars=${r.chars}  bytes=${r.bytes}  ends: …${r.tail}`);
	await page.close();
}
await browser.close();
