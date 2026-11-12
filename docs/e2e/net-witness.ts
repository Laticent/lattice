import dgram from 'node:dgram';
import http from 'node:http';
import { type BrowserContext, expect } from '@playwright/test';

/** A loopback HTTP server (WebSocket upgrades included) and a UDP socket, each logging what reaches it. */
export type Listeners = { origin: string; udpPort: number; hits: string[]; udpHits: string[]; close: () => Promise<void> };

export async function openListeners(contentType = 'image/png'): Promise<Listeners> {
	const hits: string[] = [];
	const server = http.createServer((req, res) => {
		hits.push(req.url || '');
		res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
		res.end();
	});
	server.on('upgrade', (req, sock) => {
		hits.push(req.url || '');
		sock.destroy();
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	const udpHits: string[] = [];
	const udp = dgram.createSocket('udp4');
	udp.on('message', () => udpHits.push('udp'));
	await new Promise<void>((r) => udp.bind(0, '127.0.0.1', () => r()));
	return {
		origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
		udpPort: udp.address().port,
		hits,
		udpHits,
		close: async () => {
			// `close()` waits for every open connection, and the browser can still hold one (an image it loaded): end them first.
			server.closeAllConnections();
			await new Promise((r) => server.close(() => r(null)));
			udp.close();
		},
	};
}

/**
 * THE WITNESS for an absence check on a network log (engineering/decisions/2026-11-06-flaky-tests.md, `request-log.js`).
 *
 * "The walled subject sent NOTHING" has no signal of its own, and a poll of an empty log goes green on its first tick,
 * so these checks used to wait a fixed 2500 ms (HARD RULE #32). The subject's attempts are all made by the time the
 * caller calls this (a code package makes them inside the render whose result the caller has already seen drawn).
 * What is left is how long an attempt that got out would take to land. So make the same KINDS of attempt, unwalled,
 * from a fresh page in the same browser (no Studio CSP in the way), against a SECOND pair of listeners, and wait until
 * each has landed: a fetch, a WebSocket, an image and, where the engine gathers loopback candidates for the page
 * (`udp`), a WebRTC STUN request. Anything the subject leaked, started before these, has had as long.
 *
 * What it does not prove, as `request-log.js` says of its own witness: that a subject HOLDING a request back on purpose
 * has sent it. That is what the subject-side reports (`data-wall`, `data-rtc`) and the import gate are for.
 */
export async function witnessLanded(context: BrowserContext, { udp }: { udp: boolean }): Promise<void> {
	const witness = await openListeners();
	const page = await context.newPage();
	try {
		await page.evaluate(
			async ({ origin, udpPort, udp }) => {
				fetch(`${origin}/witness-fetch`).catch(() => {});
				try {
					new WebSocket(`${origin.replace('http', 'ws')}/witness-ws`);
				} catch {
					/* counted below as missing */
				}
				const img = new Image();
				img.src = `${origin}/witness-img`;
				document.body.append(img);
				if (udp) {
					const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${udpPort}` }] });
					pc.createDataChannel('x');
					await pc.setLocalDescription(await pc.createOffer());
				}
			},
			{ origin: witness.origin, udpPort: witness.udpPort, udp },
		);
		await expect
			.poll(() => ['/witness-fetch', '/witness-ws', '/witness-img'].filter((h) => !witness.hits.includes(h)), { timeout: 30_000, message: 'the witness attempts never landed' })
			.toEqual([]);
		if (udp) await expect.poll(() => witness.udpHits.length, { timeout: 30_000, message: 'the witness STUN request never landed' }).toBeGreaterThan(0);
	} finally {
		await page.close();
		await witness.close();
	}
}
