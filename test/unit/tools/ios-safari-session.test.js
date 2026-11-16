/**
 * Unit: how docs/scripts/ios-safari/run.mjs makes its WebDriver session (createSession), against a fake safaridriver.
 *
 * Two behaviors the iOS nightly of 2026-11-15 (run 43712612297) asked for, which a simulator run reaches only by luck:
 *   - every POST /session is bounded (SESSION_TIMEOUT_MS): a driver that never answers is "no session" (exit 3), where it
 *     used to hang 305 s until Node's own headers timeout;
 *   - before a retry, the simulator's Safari is relaunched (`xcrun simctl terminate` then `launch`), so the next attempt does
 *     not meet a Safari still paired with the session that timed out.
 *
 * The real run.mjs runs as a child process, with WEBDRIVER_URL on a fake server (its own free port per test) and a stub
 * `xcrun` on PATH that records its arguments. Order is read from the fake server's own log: when the second POST arrives,
 * the server notes what the stub had recorded by then. Nothing here measures time; the child's `timeout` is only a guard
 * so a regression that hangs fails instead of holding the suite.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const RUN_MJS = path.join(__dirname, '..', '..', '..', 'docs', 'scripts', 'ios-safari', 'run.mjs');

/**
 * A fake safaridriver. `answer(n)` decides the n-th POST /session (1-based): 'hang' never replies, 'refuse' is the 500
 * safaridriver sends ("session not created"), 'ok' makes a session. Every other request gets a 404.
 */
async function fakeDriver(answer, xcrunLog) {
	const posts = [];
	const held = [];
	const server = http.createServer((req, res) => {
		let body = '';
		req.on('data', (c) => {
			body += c;
		});
		req.on('end', () => {
			if (req.method === 'POST' && req.url === '/session') {
				const n = posts.length + 1;
				posts.push({ n, xcrunSoFar: fs.existsSync(xcrunLog) ? fs.readFileSync(xcrunLog, 'utf8') : '', body });
				const a = answer(n);
				if (a === 'hang') return held.push(res);
				res.setHeader('content-type', 'application/json');
				if (a === 'refuse') {
					res.statusCode = 500;
					return res.end(JSON.stringify({ value: { error: 'session not created', message: 'Could not create a session: The session timed out while connecting to a Safari instance.' } }));
				}
				// A session, but a macOS one: run.mjs refuses it (exit 1) before any probe, which ends the child here.
				return res.end(JSON.stringify({ value: { sessionId: 's1', capabilities: { platformName: 'mac' } } }));
			}
			res.statusCode = 404;
			res.end('{}');
		});
	});
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		posts,
		close: () => {
			for (const r of held) r.destroy();
			server.close();
		},
	};
}

/** Run run.mjs against `answer`, with a stub xcrun. Resolves with the exit code, the output, the POSTs and the xcrun calls. */
async function runSession(answer, env) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-session-'));
	const xcrunLog = path.join(dir, 'xcrun.log');
	const bin = path.join(dir, 'bin');
	fs.mkdirSync(bin);
	fs.writeFileSync(path.join(bin, 'xcrun'), `#!/usr/bin/env bash\necho "$*" >> '${xcrunLog}'\n`, { mode: 0o755 });
	const driver = await fakeDriver(answer, xcrunLog);
	try {
		const child = spawn(process.execPath, [RUN_MJS], {
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				WEBDRIVER_URL: driver.url,
				SIM_UDID: 'udid-under-test',
				SIM_LABEL: 'iPad',
				ARTIFACT_DIR: path.join(dir, 'out'),
				SAFARI_RELAUNCH_MS: '1',
				...env,
			},
			timeout: 60000, // a guard against a hang, not a measurement
		});
		let output = '';
		child.stdout.on('data', (c) => {
			output += c;
		});
		child.stderr.on('data', (c) => {
			output += c;
		});
		const status = await new Promise((r) => child.on('close', (code, signal) => r(code ?? signal)));
		const xcrun = fs.existsSync(xcrunLog) ? fs.readFileSync(xcrunLog, 'utf8').trim().split('\n').filter(Boolean) : [];
		return { status, output, posts: driver.posts, xcrun };
	} finally {
		driver.close();
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

test('(a) a POST /session that never answers is "no session" (exit 3) at SESSION_TIMEOUT_MS, not a hang', async () => {
	const r = await runSession(() => 'hang', { SESSION_TIMEOUT_MS: '300', SESSION_ATTEMPTS: '3' });
	assert.equal(r.status, 3, r.output);
	assert.match(r.output, /iPad: no session \(safaridriver did not answer POST \/session within 300 ms\)/);
	assert.equal(r.posts.length, 1, 'a stuck driver is not asked again: run.sh restarts it');
});

test('(b) after "session not created", Safari is terminated and launched BEFORE the next POST /session', async () => {
	const r = await runSession((n) => (n === 1 ? 'refuse' : 'ok'), { SESSION_ATTEMPTS: '3' });
	assert.equal(r.posts.length, 2, r.output);
	assert.equal(r.posts[0].xcrunSoFar, '', 'nothing is relaunched before the first attempt');
	assert.deepEqual(r.posts[1].xcrunSoFar.trim().split('\n'), ['simctl terminate udid-under-test com.apple.mobilesafari', 'simctl launch udid-under-test com.apple.mobilesafari'], r.output);
	assert.match(r.output, /session not created \(attempt 1 of 3\).*relaunching Safari/);
	// The second POST made a session (a macOS one, which run.mjs then refuses before any probe): not "no session".
	assert.equal(r.status, 1, r.output);
	assert.match(r.output, /refusing a macOS fallback/);
});

test('(c) "session not created" on every attempt: exit 3 after SESSION_ATTEMPTS, relaunching between attempts only', async () => {
	const r = await runSession(() => 'refuse', { SESSION_ATTEMPTS: '2' });
	assert.equal(r.status, 3, r.output);
	assert.equal(r.posts.length, 2, r.output);
	assert.match(r.output, /iPad: no session \(attempt 2 of 2\)/);
	assert.deepEqual(r.xcrun, ['simctl terminate udid-under-test com.apple.mobilesafari', 'simctl launch udid-under-test com.apple.mobilesafari']);
});
