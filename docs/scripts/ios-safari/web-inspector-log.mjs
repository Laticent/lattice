#!/usr/bin/env node
/**
 * SAFARI'S OWN EVIDENCE, for the runs the probes cannot explain (#3523).
 *
 * Two iPhone failures were read from the outside, one signal per run: a Studio that never hydrated (no preview, no engine
 * request, followups.d/3368-p1) and a tap the simulator held for seconds. Safari's Web Inspector already records what both
 * need: every console message (astro logs `[astro-island] Error hydrating <file>` when an island's import fails), every
 * request with its status or failure reason, and the main thread's timeline. Every iOS Simulator runs `webinspectord` for
 * that; this attaches to it the way Appium does (appium-remote-debugger, found by run.sh's diagnostics install) and writes
 * one JSON line per event to the file it is given, for the whole run, re-attaching whenever the probes open a new page.
 *
 * It never fails the suite: anything that goes wrong here is written to its own log and the probes run as before.
 *
 * Usage: ARD_DIR=<install prefix> node web-inspector-log.mjs <simulator udid> <out.jsonl>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [udid, outFile] = process.argv.slice(2);
const out = fs.createWriteStream(outFile, { flags: 'a' });
const t0 = Date.now();
const write = (kind, data) => out.write(`${JSON.stringify({ t: Date.now() - t0, kind, ...data })}\n`);
const note = (msg) => console.log(`web-inspector-log: ${msg}`);

/**
 * The simulator's inspector socket. First the way appium-ios-simulator asks for it, `simctl getenv <udid> RWI_LISTEN_SOCKET`,
 * which asks this one simulator; then launchd_sim's open sockets through lsof, which scans every process and timed out at
 * 15 s three times running on a host at load 300 (run 45552549848).
 */
function socketPath() {
	try {
		const env = execFileSync('xcrun', ['simctl', 'getenv', udid, 'RWI_LISTEN_SOCKET'], { encoding: 'utf8', timeout: 30000 }).trim();
		if (env) return env;
	} catch (e) {
		note(`simctl getenv: ${e.message}`);
	}
	const all = execFileSync('lsof', ['-aUc', 'launchd_sim'], { encoding: 'utf8', timeout: 30000 });
	const pick = all.split('\n').find((l) => l.includes('com.apple.webinspectord_sim.socket'));
	const m = pick?.match(/(\/private\/tmp\/\S+webinspectord_sim\.socket)/);
	return m ? m[1] : null;
}

async function main() {
	// The package is ESM-only (its exports name only an `import` entry), so it is loaded by file URL from run.sh's install.
	const entry = path.join(process.env.ARD_DIR || '.', 'node_modules', 'appium-remote-debugger', 'build', 'lib', 'index.js');
	const { createRemoteDebugger } = await import(pathToFileURL(entry).href);
	let sock = null;
	for (let i = 0; i < 30 && !sock; i++) {
		try {
			sock = socketPath();
		} catch (e) {
			note(`lsof: ${e.message}`);
		}
		if (!sock) await new Promise((r) => setTimeout(r, 2000));
	}
	if (!sock) return note('no webinspectord_sim socket found');
	note(`socket ${sock}`);
	const rd = createRemoteDebugger({ bundleId: 'com.apple.mobilesafari', isSafari: true, socketPath: sock, garbageCollectOnExecute: false, pageLoadMs: 1000 }, false);
	let current = '';
	let listening = false;
	const attach = async () => {
		const pages = await rd.selectApp(null, 20, true);
		// The page under test is the localhost one; Safari also lists its start page and any blank tab.
		const page = [...(pages || [])].reverse().find((p) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(p.url)) || pages?.[0];
		if (!page) return;
		const key = `${page.id}`;
		if (key === current) return;
		// selectPage's simple initialization enables Runtime, Network, Console and Inspector on the page (rpc-client.js).
		await rd.selectPage(rd._appIdKey, page.id, true);
		current = key;
		write('attach', { url: page.url, page: page.id });
		if (!listening) {
			// Once: the client keeps listeners across pages, so adding them per page would write every event twice.
			listening = true;
			rd.startConsole((err, ev) => write('console', { err: err?.message, level: ev?.level, source: ev?.source, text: String(ev?.text ?? '').slice(0, 600), url: ev?.url, line: ev?.line }));
			// appium-remote-debugger hands Network.* events to one 'NetworkEvent' listener as (error, params, method).
			rd.startNetwork((err, p = {}, m = '') => {
				// Only what says why a load failed or was slow: the request, its response status, a failure, and the finish.
				if (m === 'Network.requestWillBeSent') write('net', { id: p.requestId, ev: 'req', url: p.request?.url });
				else if (m === 'Network.responseReceived') write('net', { id: p.requestId, ev: 'res', status: p.response?.status, source: p.response?.source });
				else if (m === 'Network.loadingFailed') write('net', { id: p.requestId, ev: 'FAILED', error: p.errorText, canceled: p.canceled });
				else if (m === 'Network.loadingFinished') write('net', { id: p.requestId, ev: 'done' });
				else if (err) write('net', { err: err.message });
			});
		}
		try {
			await rd.startTimeline((err, params) => {
				// A record that ran 50 ms or more on the main thread: what it was and how long (Timeline.eventRecorded's params.record).
				const rec = params?.record || params;
				const ms = rec?.endTime && rec.startTime ? (rec.endTime - rec.startTime) * 1000 : 0;
				if (ms >= 50) write('timeline', { type: rec.type, ms: Math.round(ms), data: JSON.stringify(rec.data || {}).slice(0, 300) });
				else if (err) write('timeline', { err: err.message });
			});
		} catch (e) {
			note(`timeline: ${e.message}`);
		}
	};
	await rd.connect(60000);
	rd.on('remote_debugger_page_change', () => attach().catch((e) => note(`re-attach: ${e.message}`)));
	// Pages come and go between probes (each opens a fresh page); a slow poll catches what the event misses.
	for (;;) {
		await attach().catch((e) => note(`attach: ${e.message}`));
		await new Promise((r) => setTimeout(r, 5000));
	}
}

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => out.end(() => process.exit(0)));
main().catch((e) => note(`stopped: ${e.stack || e.message}`));
