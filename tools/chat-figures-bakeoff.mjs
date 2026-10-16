#!/usr/bin/env node
/**
 * chat-figures-bakeoff — what does it cost to draw a mermaid / math / plot / slide figure in a
 * chat bubble, per strategy, in a real browser?
 *
 * Drives the isolated harness at `/proto/chat-figures/` (docs/src/components/proto/
 * ChatFiguresBakeoff.tsx) once per (strategy, kind, n) in a FRESH browser each time, so one
 * run's memory can never leak into the next. Reports, per configuration:
 *
 *   tFirstMs / tSettledMs  mount -> first figure drawn / every expected figure drawn
 *   scrollMs               jump to the bottom of the transcript -> the figures there drawn
 *   docs, frames, nodes    Chromium's own counters (Performance.getMetrics), idle and after the scroll
 *   heapMB                 JS heap in use
 *   rssMB                  resident memory summed over the browser's whole process tree
 *
 * Decision record: engineering/decisions/2026-10-12-chat-figures-bakeoff.md. Chromium only — the
 * documents-not-reclaimed hazard that shaped the pool is WebKit's (2026-09-13-gallery-preview-memory.md),
 * and that half is NOT measured here.
 *
 * Needs the docs site built and served: `cd docs && npm run build:e2e && npm run preview:e2e`.
 *
 * Usage:
 *   node tools/chat-figures-bakeoff.mjs [--url=http://localhost:4321] [--kinds=mermaid,math,plot,slide]
 *     [--ns=1,10,40] [--strategies=eager,pool,bake,bake-img] [--out=results.json]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const URL_BASE = arg('url', 'http://localhost:4321');
const KINDS = arg('kinds', 'mermaid,math,plot,slide').split(',');
const NS = arg('ns', '1,10,40').split(',').map(Number);
const STRATS = arg('strategies', 'eager,pool,bake,bake-img').split(',');
const OUT = arg('out', '');
const TIMEOUT = 90_000;

const rssMB = (rootPid) => {
	const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
		.trim()
		.split('\n')
		.map((l) => l.trim().split(/\s+/).map(Number));
	const kids = new Map();
	for (const [pid, ppid, rss] of rows) kids.set(pid, { ppid, rss });
	const inTree = (pid) => {
		for (let p = pid, hops = 0; p && hops < 12; hops++) {
			if (p === rootPid) return true;
			p = kids.get(p)?.ppid;
		}
		return false;
	};
	let kb = 0;
	for (const [pid, { rss }] of kids) if (inTree(pid)) kb += rss;
	return Math.round(kb / 1024);
};

const metrics = async (cdp) => {
	const { metrics: m } = await cdp.send('Performance.getMetrics');
	const get = (n) => m.find((x) => x.name === n)?.value ?? 0;
	return { docs: get('Documents'), frames: get('Frames'), nodes: get('Nodes'), heapMB: Math.round(get('JSHeapUsedSize') / 1048576) };
};

async function run(strategy, kind, n) {
	const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	const row = { strategy, kind, n };
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 480, height: 800 });
		const cdp = await page.createCDPSession();
		await cdp.send('Performance.enable');
		await page.goto(`${URL_BASE}/proto/chat-figures/?strategy=${strategy}&kind=${kind}&n=${n}`, { waitUntil: 'load' });
		// n=0 is the BASELINE: the page, the engine and nothing drawn — what every other row's memory
		// is measured against.
		if (n > 0) await page.waitForFunction(() => window.__bake?.done === true, { timeout: TIMEOUT }).catch(() => {});
		const st = n > 0 ? await page.evaluate(() => ({ ...window.__bake })) : { done: true, tFirst: 0, tSettled: 0, iframes: 0 };
		row.settled = st.done ? 'yes' : `NO ${st.settled}/${st.expected}`;
		row.tFirstMs = Math.round(st.tFirst);
		row.tSettledMs = st.done ? Math.round(st.tSettled) : null;
		row.iframes = st.iframes;
		await new Promise((r) => setTimeout(r, 1500));
		Object.assign(row, await metrics(cdp));
		row.rssMB = rssMB(browser.process().pid);

		// The bottom of the transcript: the path a long conversation takes when it is scrolled.
		if (n > 1) {
			await page.evaluate(() => {
				window.__bake.done = false;
				window.__bake.tSettled = 0;
				window.__jump = performance.now();
				const s = document.getElementById('scroller');
				s.scrollTop = s.scrollHeight;
			});
			await page.waitForFunction(() => window.__bake.done === true, { timeout: TIMEOUT }).catch(() => {});
			row.scrollMs = await page.evaluate(() => (window.__bake.done ? Math.round(performance.now() - window.__jump) : null));
			await new Promise((r) => setTimeout(r, 1500));
			const after = await metrics(cdp);
			row.docsAfter = after.docs;
			row.rssAfterMB = rssMB(browser.process().pid);
		}
	} catch (e) {
		row.error = String(e.message || e).slice(0, 120);
	} finally {
		await browser.close();
	}
	return row;
}

const rows = [];
for (const kind of KINDS)
	for (const n of NS)
		for (const strategy of STRATS) {
			const r = await run(strategy, kind, n);
			rows.push(r);
			console.log(JSON.stringify(r));
		}
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(rows, null, 2)}\n`);
