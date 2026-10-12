// Shared by the Live panel specs: builds the harness (live-panel-harness/) with the site's own
// Tailwind plugin, serves it from an allowlist of what the build wrote, and gives the specs the
// helpers that drive `window.__live`. Never committed as a bundle (HARD RULE #2), so it cannot go
// stale against the panel or the palette tokens.

import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'src');
export const AXE_SRC = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

export type Harness = { baseURL: string; close(): Promise<void> };

export async function startHarness(): Promise<Harness> {
	const { build } = await import('vite');
	const tailwindcss = (await import('@tailwindcss/vite')).default;
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-panel-'));
	await build({
		root: HERE,
		base: './',
		logLevel: 'error',
		configFile: false,
		plugins: [tailwindcss()],
		resolve: { alias: { '@': SRC } },
		esbuild: { jsx: 'automatic' },
		build: { outDir, emptyOutDir: true, minify: false },
	});
	// Serve only what the build wrote: the allowlist is built from the output directory once, so no
	// request URL ever becomes a filesystem path (CodeQL js/path-injection).
	const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
	const files = new Map<string, { file: string; type: string }>();
	const walk = (dir: string, rel: string) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}${e.name}/`);
			else files.set(`/${rel}${e.name}`, { file: path.join(dir, e.name), type: TYPES[path.extname(e.name)] ?? 'application/octet-stream' });
		}
	};
	walk(outDir, '');
	files.set('/', files.get('/index.html') as { file: string; type: string });
	const server: Server = createServer((req, res) => {
		const entry = files.get((req.url || '/').split('?')[0]);
		if (!entry) {
			res.writeHead(404);
			res.end('nf');
			return;
		}
		res.writeHead(200, { 'content-type': entry.type });
		res.end(fs.readFileSync(entry.file));
	});
	await new Promise<void>((r) => server.listen(0, r));
	return {
		baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}/index.html`,
		close: async () => {
			await new Promise<void>((r) => server.close(() => r()));
			fs.rmSync(outDir, { recursive: true, force: true });
		},
	};
}

export type Live = {
	set(patch: Record<string, unknown>): void;
	person(id: string, patch: Record<string, unknown>): void;
	call(patch: Record<string, unknown>): void;
	calls(): unknown[][];
	clear(): void;
};
/** Run `fn` in the page against `window.__live` (the function is serialized, so it closes over nothing). */
export const live = <T>(page: Page, fn: (l: Live, a?: unknown) => T, arg?: unknown) =>
	page.evaluate(([src, a]) => (new Function('l', 'a', `return (${src})(l, a)`) as (l: unknown, a: unknown) => T)((window as unknown as { __live: unknown }).__live, a), [fn.toString(), arg] as const);
export const calls = (page: Page) => live(page, (l) => l.calls());

export async function open(page: Page, baseURL: string, query = '') {
	await page.goto(`${baseURL}${query}`);
	await page.waitForFunction(() => !!(window as unknown as { __live?: unknown }).__live);
}
/** On the call, hearing Amina, who is on it too (with a measured stream and a volume). */
export async function onCall(page: Page, extra: Record<string, unknown> = {}) {
	await live(
		page,
		(l, x) => {
			l.set({ call: { inCall: true, muted: false, denied: false, devices: [{ id: 'm1', label: 'Built-in microphone' }], device: 'm1', highFidelity: false } });
			l.person('me', { mic: 'on' });
			l.person('p2', { mic: 'on', volume: 1, quality: { inKbps: 64.2, lostPct: 0.4, jitterMs: 18.3, sendKbps: 63.8 }, ...(x as object) });
		},
		extra,
	);
}
export const optionsFor = (page: Page, name: string) => page.getByRole('button', { name: `Options for ${name}` });
export const micMenu = (page: Page) => page.getByRole('button', { name: 'Microphone', exact: true });

/**
 * axe's WCAG A/AA findings on the page now, as "rule: target" strings.
 *
 * `menuOpen` drops ONE rule, `aria-hidden-focus`, and only for a page with a Radix menu open. A
 * modal Radix menu marks everything behind it `aria-hidden` and traps focus inside the menu, so
 * the buttons behind it are focusable to axe and unreachable to a person. That is a measured false
 * positive, not a waiver: `assertFocusTrapped` is the evidence, and the spec calls it with every
 * scan that sets this flag. The same page scanned with no menu open runs the full rule set.
 */
export async function axeFindings(page: Page, opts: { menuOpen?: boolean } = {}): Promise<string[]> {
	await page.addScriptTag({ content: AXE_SRC });
	return page.evaluate(async (menuOpen) => {
		type Node = { target: unknown[]; any?: Array<{ message?: string; data?: { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string } }> };
		const r = await (window as unknown as { axe: { run(c: Document, o: unknown): Promise<{ violations: Array<{ id: string; nodes: Node[] }> }> } }).axe.run(document, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
			rules: menuOpen ? { 'aria-hidden-focus': { enabled: false } } : {},
		});
		// A finding names its colors and ratio (or axe's own message), so a failure reads without a re-run.
		const detail = (n: Node) => {
			const d = n.any?.[0]?.data;
			if (d?.contrastRatio) return ` [${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1, needs ${d.expectedContrastRatio}]`;
			return n.any?.[0]?.message ? ` [${n.any[0].message}]` : '';
		};
		return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + detail(n)).join(' | ')}`);
	}, !!opts.menuOpen);
}

/** With a menu open, Tab and Shift+Tab never move focus to anything outside it (the evidence behind `menuOpen`). */
export async function assertFocusTrapped(page: Page): Promise<string[]> {
	const strays: string[] = [];
	for (let i = 0; i < 14; i++) {
		await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
		const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=menu]'));
		if (!inside) strays.push(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? 'none'));
	}
	return strays;
}

/** Close the open menu and wait until it has really gone: Radix removes `aria-hidden` from the page behind it a beat after the menu unmounts, and a scan in that gap reads stale state. */
export async function closeMenu(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('[role=menu]') && !document.querySelector('[data-aria-hidden]'));
}
