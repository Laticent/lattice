#!/usr/bin/env node
/**
 * Open a deck in a REAL VS Code Markdown preview (marp-vscode) and probe it with a real pointer, on first paint and after each of N real edits.
 *
 * The VS Code preview is a surface no other tool reaches: marp-vscode renders with raw
 * marp-core, the webview's security level decides whether our runtime runs at all, and VS
 * Code's built-in `mermaid-markdown-features` extension strips our SVGs on every update
 * (engineering/gotchas/vscode.md). A claim about that surface needs an artifact from it
 * (HARD RULE #23). This is the harness that produced the #2734 evidence, committed so the
 * next session does not rebuild it from prose.
 *
 * Two hosts, the same probe:
 *   desktop      VS Code desktop (the Electron binary under xvfb-run). The deck opens at the
 *                level you ask for, seeded into the profile's state.vscdb. CDP keystrokes do
 *                not reach this window, so edits come from the launcher extension
 *                (tools/vscode-harness/launcher) as real WorkspaceEdits.
 *   code-server  VS Code for the web, driven by puppeteer's own Chromium. The level is set
 *                through the command palette; edits are real keystrokes in the editor.
 *
 * Usage:
 *   node tools/vscode-preview-probe.mjs --deck <file.md> [--host desktop|code-server]
 *        [--probe <module.mjs>] [--edits 3] [--level disable|strict]
 *        [--runtime <lattice-runtime-min.js>] [--kit dist/marp-kit] [--out <dir>]
 *
 * Example (the #2734 run; `npm run marp-kit:build` first):
 *   node tools/vscode-preview-probe.mjs --host desktop \
 *     --deck tools/vscode-harness/decks/mermaid-click.md \
 *     --probe tools/vscode-harness/probes/mermaid-click.mjs --out .scratch/vscode
 *
 * The workspace is a fresh copy of the Export-to-Marp kit (`--kit`, default dist/marp-kit)
 * with the deck added as Probe-Deck.md. The kit's script tags are appended if the deck has
 * none. `--runtime` swaps in another runtime build, which is how a run against main's runtime
 * proves a probe can fail.
 *
 * A probe module exports `probe({ page, frame, sleep, label })` returning a JSON-able result
 * (a `pass` boolean is summarized), and may export `diagrams`, the number of drawn Mermaid
 * SVGs to wait for before the first probe. With no `--probe`, each step records only the
 * runtime state: settle states, SVG count, how many SVGs the host stripped, and a screenshot.
 *
 * Downloads, once, into $LATTICE_VSCODE_HOME (default ~/lattice-vscode), and pinned so a
 * rerun measures the same thing: VS Code desktop 1.142.0 (~350MB), code-server 4.141.0
 * (~120MB), marp-vscode 3.6.1 from Open VSX (it is not on npm). The workspace is built there
 * too, which constrains where that directory can be, and each rule was measured:
 *   - not under the session scratch path: from there VS Code refuses its own workbench.html;
 *   - no dot-directory anywhere in the path (so not ~/.cache): marp-vscode then never
 *     registers the workspace's themes, and the preview silently renders without Lattice;
 *   - no symlink in the path, which broke the same way.
 * The tool refuses a path that breaks the last two rather than produce a hollow run.
 *
 * Exit code 0 when every step's probe passed (or there is no probe), 1 otherwise.
 * On-demand only; it is not a CI job.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINS = {
	desktop: { version: '1.142.0', url: 'https://update.code.visualstudio.com/1.142.0/linux-x64/stable', dir: 'VSCode-linux-x64' },
	codeServer: { version: '4.141.0', url: 'https://github.com/coder/code-server/releases/download/v4.141.0/code-server-4.141.0-linux-amd64.tar.gz', dir: 'code-server-4.141.0-linux-amd64' },
	marp: { version: '3.6.1', url: 'https://open-vsx.org/api/marp-team/marp-vscode/3.6.1/file/marp-team.marp-vscode-3.6.1.vsix' },
};
const SCRIPT_TAGS = ['mermaid-v11-min.js', 'lattice-dagre-min.js', 'lattice-runtime-min.js'].map((s) => `<script src="${s}"></script>`).join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(`[vscode-probe ${new Date().toISOString().slice(11, 19)}]`, ...a);

function parseArgs(argv) {
	const opts = { host: 'desktop', edits: 3, level: 'disable', kit: path.join(ROOT, 'dist', 'marp-kit') };
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i].replace(/^--/, '');
		if (!['deck', 'host', 'probe', 'edits', 'level', 'runtime', 'kit', 'out'].includes(key)) throw new Error(`unknown option ${argv[i]}`);
		opts[key] = argv[++i];
	}
	if (!opts.deck) throw new Error('--deck <file.md> is required');
	if (!['desktop', 'code-server'].includes(opts.host)) throw new Error('--host is desktop or code-server');
	if (!['disable', 'strict'].includes(opts.level)) throw new Error('--level is disable or strict');
	opts.edits = Number(opts.edits);
	opts.out = path.resolve(opts.out || path.join(ROOT, '.scratch', 'vscode-probe'));
	return opts;
}

/** Download and unpack a pinned artifact once. Returns its path in the cache. */
function ensure(home, url, name, { untar } = {}) {
	const target = path.join(home, name);
	if (fs.existsSync(target)) return target;
	const file = path.join(home, untar ? `${name}.tgz` : name);
	log(`downloading ${url}`);
	execFileSync('curl', ['-fsSL', '-o', file, url], { stdio: 'inherit' });
	if (untar) {
		execFileSync('tar', ['xzf', file, '-C', home]);
		fs.rmSync(file);
	}
	return target;
}

function freePort() {
	return new Promise((resolve) => {
		const s = createServer().listen(0, '127.0.0.1', () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

/** A fresh workspace: the kit, the deck as Probe-Deck.md, optionally another runtime. */
function buildWorkspace(opts, dir) {
	if (!fs.existsSync(path.join(opts.kit, 'lattice-runtime-min.js'))) throw new Error(`no kit at ${opts.kit}; run \`npm run marp-kit:build\``);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.cpSync(opts.kit, dir, { recursive: true });
	let deck = fs.readFileSync(opts.deck, 'utf8');
	if (!deck.includes('lattice-runtime')) deck = `${deck.trimEnd()}\n\n${SCRIPT_TAGS}\n`;
	fs.writeFileSync(path.join(dir, 'Probe-Deck.md'), deck);
	if (opts.runtime) fs.copyFileSync(opts.runtime, path.join(dir, 'lattice-runtime-min.js'));
	return path.join(dir, 'Probe-Deck.md');
}

function writeUserSettings(userDataDir) {
	fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
	fs.writeFileSync(
		path.join(userDataDir, 'User', 'settings.json'),
		JSON.stringify({
			'security.workspace.trust.enabled': false,
			'workbench.startupEditor': 'none',
			'chat.disableAIFeatures': true,
			'workbench.tips.enabled': false,
			'telemetry.telemetryLevel': 'off',
			'update.mode': 'none',
			'extensions.autoUpdate': false,
		}),
	);
}

/** The markdown extension keeps the preview level per folder in globalState; Disable is 2. */
function seedSecurityLevel(userDataDir, workspace, level) {
	const db = path.join(userDataDir, 'User', 'globalStorage', 'state.vscdb');
	fs.mkdirSync(path.dirname(db), { recursive: true });
	const value = JSON.stringify({ [`preview_security_level:${pathToFileURL(workspace).href}`]: level === 'disable' ? 2 : 0 });
	execFileSync('python3', ['-c', 'import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)"); d.execute("INSERT INTO ItemTable VALUES (?,?)", (sys.argv[2], sys.argv[3])); d.commit()', db, 'vscode.markdown-language-features', value]);
}

async function previewFrame(page, timeout = 90_000) {
	const t0 = Date.now();
	while (Date.now() - t0 < timeout) {
		for (const f of page.frames()) {
			try {
				if (await f.evaluate(() => document.body?.classList.contains('marp-vscode'))) return f;
			} catch {
				/* a frame mid-navigation */
			}
		}
		await sleep(500);
	}
	throw new Error('no marp-vscode preview frame');
}

const runtimeState = (frame) =>
	frame.evaluate(() => ({
		runtime: document.documentElement.getAttribute('data-lattice-runtime'),
		settle: [...document.querySelectorAll('pre[data-lattice-settle]')].map((p) => p.getAttribute('data-lattice-settle')),
		svgs: document.querySelectorAll('[data-lattice-figure] > svg').length,
		strips: window.__latticeProbeStrips || 0,
	}));

/** Count SVGs the host removes from a drawn figure (`[data-lattice-figure]`), across every later update. */
const watchStrips = (frame) =>
	frame.evaluate(() => {
		if (window.__latticeProbeObs) return;
		window.__latticeProbeStrips = 0;
		window.__latticeProbeObs = new MutationObserver((recs) => {
			for (const r of recs) for (const n of r.removedNodes) if (n.nodeName === 'svg' && r.target.hasAttribute?.('data-lattice-figure')) window.__latticeProbeStrips++;
		});
		window.__latticeProbeObs.observe(document.body, { subtree: true, childList: true });
	});

async function waitSettled(page, diagrams) {
	const t0 = Date.now();
	let frame = await previewFrame(page);
	while (Date.now() - t0 < 90_000) {
		const s = await runtimeState(frame).catch(() => null);
		if (s && s.svgs >= diagrams && s.settle.length >= diagrams && s.settle.every((x) => x === 'rendered')) return frame;
		await sleep(500);
		frame = await previewFrame(page);
	}
	return frame;
}

async function step(ctx, label) {
	const frame = await waitSettled(ctx.page, ctx.diagrams);
	const result = ctx.probe ? await ctx.probe({ page: ctx.page, frame, sleep, label }) : {};
	const state = await runtimeState(frame);
	// A HOLLOW PASS GUARD. VS Code's built-in Mermaid extension draws a fence too, with its own
	// click handling, so drawn SVGs prove nothing on their own. Every expected diagram must be a
	// fence OUR runtime settled, or the step fails however well the probe did. (Measured: with
	// the workspace's themes unregistered, marp-vscode rendered the deck, the built-in extension
	// drew all three diagrams and the click probe passed, with zero fences settled.)
	if (state.settle.filter((x) => x === 'rendered').length < ctx.diagrams) {
		result.pass = false;
		result.hollow = `only ${state.settle.length} fence(s) settled by the Lattice runtime; expected ${ctx.diagrams}`;
	}
	await ctx.page.screenshot({ path: path.join(ctx.out, `${label}.png`) });
	log(label, JSON.stringify({ ...result, ...state }));
	return { ...result, ...state };
}

async function runDesktop(opts, ctx, home, workspace, deckPath) {
	const vscode = ensure(home, PINS.desktop.url, PINS.desktop.dir, { untar: true });
	const vsix = ensure(home, PINS.marp.url, `marp-vscode-${PINS.marp.version}.vsix`);
	const extDir = path.join(home, 'ext-desktop');
	if (!fs.existsSync(path.join(extDir, `marp-team.marp-vscode-${PINS.marp.version}`))) {
		execFileSync(path.join(vscode, 'bin', 'code'), ['--no-sandbox', '--user-data-dir', path.join(home, 'ud-install'), '--extensions-dir', extDir, '--install-extension', vsix], { stdio: 'inherit' });
	}
	const userDataDir = path.join(home, 'ud-desktop');
	fs.rmSync(userDataDir, { recursive: true, force: true });
	writeUserSettings(userDataDir);
	seedSecurityLevel(userDataDir, workspace, opts.level);
	const trigger = path.join(home, 'trigger');
	fs.rmSync(trigger, { force: true });
	const port = await freePort();
	// The Electron binary, not bin/code: bin/code hands off to a launcher and the debug port
	// never opens. Detached, so the whole process group can be stopped at the end.
	const child = spawn(
		'xvfb-run',
		['-a', '--server-args=-screen 0 1600x1000x24', path.join(vscode, 'code'), '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', `--user-data-dir=${userDataDir}`, `--extensions-dir=${extDir}`, `--extensionDevelopmentPath=${path.join(ROOT, 'tools', 'vscode-harness', 'launcher')}`, `--remote-debugging-port=${port}`, '--new-window', workspace],
		{ detached: true, stdio: 'ignore', env: { ...process.env, LATTICE_PROBE_DECK: deckPath, LATTICE_PROBE_TRIGGER: trigger, LATTICE_PROBE_LOG: path.join(ctx.out, 'launcher.log') } },
	);
	try {
		const puppeteer = (await import('puppeteer')).default;
		let browser;
		for (let i = 0; i < 90 && !browser; i++) {
			try {
				browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
			} catch {
				await sleep(1000);
			}
		}
		if (!browser) throw new Error('VS Code never opened its debug port');
		let page;
		for (let i = 0; i < 90 && !page; i++) {
			page = (await browser.pages()).find((p) => p.url().includes('workbench'));
			if (!page) await sleep(1000);
		}
		ctx.page = page;
		const steps = { fresh: await step(ctx, '0-fresh') };
		for (let i = 1; i <= opts.edits; i++) {
			await watchStrips(await previewFrame(page));
			fs.writeFileSync(trigger, 'edit');
			await sleep(4500);
			steps[`edit${i}`] = await step(ctx, `${i}-after-edit`);
		}
		browser.disconnect();
		return steps;
	} finally {
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			/* already gone */
		}
	}
}

async function runCodeServer(opts, ctx, home, workspace) {
	const cs = ensure(home, PINS.codeServer.url, PINS.codeServer.dir, { untar: true });
	const vsix = ensure(home, PINS.marp.url, `marp-vscode-${PINS.marp.version}.vsix`);
	const bin = path.join(cs, 'bin', 'code-server');
	const extDir = path.join(home, 'ext-code-server');
	const userDataDir = path.join(home, 'ud-code-server');
	fs.rmSync(userDataDir, { recursive: true, force: true });
	writeUserSettings(userDataDir);
	if (!fs.existsSync(path.join(extDir, `marp-team.marp-vscode-${PINS.marp.version}`))) {
		execFileSync(bin, ['--user-data-dir', userDataDir, '--extensions-dir', extDir, '--install-extension', vsix], { stdio: 'inherit' });
	}
	const port = await freePort();
	const child = spawn(bin, ['--bind-addr', `127.0.0.1:${port}`, '--auth', 'none', '--user-data-dir', userDataDir, '--extensions-dir', extDir, '--disable-telemetry', '--disable-workspace-trust', workspace], { detached: true, stdio: 'ignore' });
	const puppeteer = (await import('puppeteer')).default;
	const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1600,1000'], defaultViewport: { width: 1600, height: 1000 } });
	try {
		const page = await browser.newPage();
		ctx.page = page;
		for (let i = 0; i < 30; i++) {
			try {
				await page.goto(`http://127.0.0.1:${port}/?folder=${encodeURIComponent(workspace)}`, { waitUntil: 'networkidle2', timeout: 90_000 });
				break;
			} catch {
				await sleep(1000);
			}
		}
		await page.waitForSelector('.monaco-workbench', { timeout: 90_000 });
		await sleep(4000);
		const palette = async (cmd, pick) => {
			await page.keyboard.press('F1');
			await sleep(700);
			await page.keyboard.type(cmd, { delay: 10 });
			await sleep(900);
			await page.keyboard.press('Enter');
			await sleep(1200);
			if (pick) {
				await page.keyboard.type(pick, { delay: 10 });
				await sleep(600);
				await page.keyboard.press('Enter');
				await sleep(1500);
			}
		};
		await page.keyboard.press('Escape');
		await page.keyboard.down('Control');
		await page.keyboard.press('KeyP');
		await page.keyboard.up('Control');
		await sleep(800);
		await page.keyboard.type('Probe-Deck.md', { delay: 10 });
		await sleep(1000);
		await page.keyboard.press('Enter');
		await sleep(2500);
		await palette('Markdown: Open Preview to the Side');
		await previewFrame(page);
		// code-server keeps globalState in the browser profile, so the level is set here, live.
		await palette('Markdown: Change Preview Security Settings', opts.level === 'disable' ? 'Disable' : 'Strict');
		await sleep(5000);
		const steps = { fresh: await step(ctx, '0-fresh') };
		for (let i = 1; i <= opts.edits; i++) {
			await watchStrips(await previewFrame(page));
			await page.click('.monaco-editor .view-lines');
			await sleep(300);
			await page.keyboard.down('Control');
			await page.keyboard.press('End');
			await page.keyboard.up('Control');
			await page.keyboard.type(' x', { delay: 30 });
			await sleep(4000);
			steps[`edit${i}`] = await step(ctx, `${i}-after-edit`);
		}
		return steps;
	} finally {
		await browser.close();
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			/* already gone */
		}
	}
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const home = path.resolve(process.env.LATTICE_VSCODE_HOME || path.join(os.homedir(), 'lattice-vscode'));
	if (home.split(path.sep).some((part) => part.startsWith('.'))) throw new Error(`${home} has a dot-directory in it; marp-vscode would not load the workspace themes. Set LATTICE_VSCODE_HOME elsewhere.`);
	fs.mkdirSync(home, { recursive: true });
	if (fs.realpathSync(home) !== home) throw new Error(`${home} resolves through a symlink; marp-vscode would not load the workspace themes. Set LATTICE_VSCODE_HOME to a real path.`);
	fs.mkdirSync(opts.out, { recursive: true });
	const workspace = path.join(home, 'ws');
	const deckPath = buildWorkspace(opts, workspace);
	const mod = opts.probe ? await import(pathToFileURL(path.resolve(opts.probe)).href) : {};
	const ctx = { out: opts.out, probe: mod.probe, diagrams: mod.diagrams ?? 0 };
	const steps = opts.host === 'desktop' ? await runDesktop(opts, ctx, home, workspace, deckPath) : await runCodeServer(opts, ctx, home, workspace);
	const pass = !ctx.probe || Object.values(steps).every((s) => s.pass === true);
	const report = { host: opts.host, versions: { desktop: PINS.desktop.version, codeServer: PINS.codeServer.version, marpVscode: PINS.marp.version }, level: opts.level, runtime: opts.runtime || 'kit', pass, steps };
	fs.writeFileSync(path.join(opts.out, 'results.json'), JSON.stringify(report, null, 1));
	console.log(JSON.stringify({ host: opts.host, pass, out: opts.out }));
	process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
