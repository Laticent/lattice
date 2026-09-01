#!/usr/bin/env node
/**
 * Foreground wrapper around `astro preview`, for Playwright's `webServer`.
 *
 * WHY THIS EXISTS. astro 7 made `astro preview` a DAEMON: it forks the server,
 * prints `Preview server running at … (pid N)`, and the command EXITS — with
 * `--background` being merely opt-in *reporting*, not opt-in behavior. Measured on
 * astro 7.2.9: the foreground invocation returns in ~2s with rc=0 while
 * `astro preview status` still reports the server up, "background".
 *
 * Playwright's `webServer` requires a process that STAYS UP; a command that exits
 * is reported as `Process from config.webServer exited early` and the whole run
 * fails before a single test starts. That is what broke `studio-smoke` on the
 * astro 6 -> 7 bump (#1491), and it fails identically in CI and locally.
 *
 * Leaving the daemon behind is its own footgun: the next run finds port 4321
 * already answering, `reuseExistingServer` picks it up, and the suite silently
 * tests a STALE build. So this starts the server, blocks in the foreground by
 * following its logs, and stops it again on the way out — including on the
 * SIGTERM Playwright sends when the run is over.
 */
import { spawn, spawnSync } from 'node:child_process';

const PORT = process.env.PREVIEW_PORT || '4321';
const astro = (args, opts = {}) => spawnSync('npx', ['astro', ...args], { stdio: 'inherit', ...opts });

// A daemon left over from an earlier run would serve a stale dist/ — never reuse it.
astro(['preview', 'stop'], { stdio: 'ignore' });

const start = astro(['preview', '--port', PORT]);
if (start.status !== 0) process.exit(start.status ?? 1);

let stopping = false;
const stop = (code) => {
	if (stopping) return;
	stopping = true;
	spawnSync('npx', ['astro', 'preview', 'stop'], { stdio: 'ignore' });
	process.exit(code);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(0));
process.on('exit', () => {
	if (!stopping) spawnSync('npx', ['astro', 'preview', 'stop'], { stdio: 'ignore' });
});

// Blocking in the foreground for as long as the server lives is the whole job.
const logs = spawn('npx', ['astro', 'preview', 'logs', '--follow'], { stdio: 'inherit' });
logs.on('exit', (code) => stop(code ?? 0));
