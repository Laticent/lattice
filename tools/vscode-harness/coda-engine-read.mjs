#!/usr/bin/env node
// The engine side of probes/coda-parity.mjs: render a deck to `.html` with this repo's own engine (lattice.js), open it
// in Chromium, and print the same per-slide projection (`readSlides`) the VS Code probe reads, as JSON on stdout.
//
//   node tools/vscode-harness/coda-engine-read.mjs <deck.md> [palette] > expect.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSlides } from './probes/coda-parity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [deck, palette] = process.argv.slice(2);
if (!deck) throw new Error('usage: coda-engine-read.mjs <deck.md> [palette]');
// Beside the deck, so the deck's own relative assets resolve (the engine refuses a path outside the deck folder).
const html = path.join(path.dirname(path.resolve(deck)), `coda-engine-${process.pid}.html`);
execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.resolve(deck), html, ...(palette ? [palette] : [])], { stdio: ['ignore', 'ignore', 'inherit'] });
const puppeteer = (await import('puppeteer')).default;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 1600, height: 1000 });
	await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
	await new Promise((r) => setTimeout(r, 1500));
	process.stdout.write(`${JSON.stringify(await page.evaluate(readSlides), null, 1)}\n`);
} finally {
	await browser.close();
	fs.rmSync(html, { force: true });
}
