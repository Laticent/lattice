#!/usr/bin/env node
/**
 * Foreground preview server for Playwright's `webServer`.
 *
 * WHY THIS EXISTS. astro 7 made the `astro preview` CLI a DAEMON: it forks the
 * server, prints `Preview server running at … (pid N)`, and the command EXITS —
 * `--background` being merely opt-in *reporting*, not opt-in behavior. Measured on
 * astro 7.2.10: the foreground invocation returns in ~3s with rc=0 while
 * `astro preview status` still reports the server up, "background", and the port
 * serves HTTP 200.
 *
 * Playwright's `webServer` requires a process that STAYS UP; a command that exits is
 * reported as `Process from config.webServer exited early` and the whole run fails
 * before a single test starts. That is what broke `studio-smoke` on the astro 6 -> 7
 * bump (#1483), identically in CI and locally.
 *
 * WHY NOT JUST STOP THE DAEMON ON THE WAY OUT. That was the first version of this
 * file, and it leaked anyway — measured, not predicted. Playwright ends the run by
 * signaling the `webServer` command, which is `npm run preview:e2e`; npm does not
 * reliably forward that signal to the node process it spawned, so the handlers here
 * never ran and the daemon outlived the suite. The next Playwright run then found
 * port 4321 already answering, and `reuseExistingServer` (on locally, off in CI)
 * adopted it — so 179 tests ran green against a build from a DIFFERENT checkout
 * before anyone noticed. A cleanup that depends on receiving a signal is not a
 * cleanup.
 *
 * So there is no daemon to leak: astro's programmatic `preview()` runs the server
 * IN THIS PROCESS. Whatever ends this process — SIGTERM, SIGKILL, a lost signal
 * through npm, the parent dying — takes the server with it, because it is the same
 * process. `await server.closed()` is what keeps it in the foreground.
 */
import { preview } from 'astro';

const PORT = Number(process.env.PREVIEW_PORT || 4321);

// Belt and braces for a daemon an OLDER checkout may still have running: it would
// hold the port and serve a stale `dist/`. Best-effort — the CLI is not present in
// every tree this might run from, and a failure here is not a reason not to start.
try {
	const { spawnSync } = await import('node:child_process');
	spawnSync('npx', ['astro', 'preview', 'stop'], { stdio: 'ignore' });
} catch {
	// nothing to stop, or no CLI to stop it with
}

const server = await preview({ root: process.cwd(), server: { port: PORT } });
console.log(`preview-e2e: serving ${server.urls?.local ?? `http://localhost:${server.port}`} in the foreground`);

const stop = async (code) => {
	try {
		await server.stop();
	} catch {
		// already down
	}
	process.exit(code);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => void stop(0));

// Block for as long as the server lives. This is the whole job.
await server.closed();
