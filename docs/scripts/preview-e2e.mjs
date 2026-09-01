#!/usr/bin/env node
/**
 * Foreground preview server for Playwright's `webServer`.
 *
 * WHY THIS EXISTS — and the reason is narrower than "astro 7 daemonizes", which is
 * what an earlier version of this comment said and what the bump's first attempt
 * (#1491) assumed. astro 7 backgrounds `astro preview` when it detects an AGENTIC
 * environment, and only then:
 *
 *   // astro/dist/cli/preview/index.js
 *   const agentDetected = !process.env.ASTRO_PREVIEW_BACKGROUND && isRunByAgent();
 *   if (flags.background || agentDetected) { await background(...); return; }
 *
 * Measured on astro 7.2.10, same tree, same command:
 *   - in a Claude Code session (`am-i-vibing` reports `type: "agent"`): returns in
 *     ~3s with rc=0 while `astro preview status` reports the server up, background;
 *   - with the agent variables stripped and `CI=true GITHUB_ACTIONS=true`: stays in
 *     the FOREGROUND until killed.
 *
 * So plain `astro preview` is fine on a GitHub runner, and breaks for an agent —
 * which is exactly the path `npm run test:e2e` takes when an agent runs it here.
 * Playwright's `webServer` needs a process that STAYS UP; a command that exits with
 * rc=0 is reported `Process from config.webServer exited early` and the run is
 * abandoned before a test body executes. `--background` is a real opt-in and
 * `ASTRO_PREVIEW_BACKGROUND` a real opt-out, but that variable is astro's own marker
 * for the process it forked (it sets it on the child), so leaning on it to mean
 * "stay foreground" is leaning on an internal.
 *
 * Serving IN THIS PROCESS sidesteps the question: there is no fork to detect, no
 * daemon to leak, and CI and an agent session behave identically. `server.closed()`
 * is what holds the foreground.
 *
 * WHAT NOT TO PUT BACK. An earlier version ran `astro preview stop` first, as
 * "belt and braces" against a daemon from an older checkout. Two things were wrong
 * with it. It cannot do that job — astro's preview lockfile is `.astro/preview.json`
 * resolved against the ROOT, so a daemon started from a different checkout is
 * invisible to it. And on an astro 6 tree it is actively destructive: astro 6's
 * preview CLI has no `stop` subcommand, ignores the positional, and STARTS A
 * FOREGROUND SERVER — so the `spawnSync` never returned and left a server holding
 * 4321. A later Playwright run then found the port answering and, because
 * `reuseExistingServer` is on outside CI, adopted it and tested a build from another
 * worktree entirely. Measured, not hypothetical.
 */
import { preview } from 'astro';

const PORT = Number(process.env.PREVIEW_PORT || 4321);

// `strictPort` so a busy port is an ERROR rather than a silent slide to 4322: this
// server exists to answer the one URL `playwright.config.ts` waits on, and drifting
// off it turns a fast failure into a five-minute `webServer.timeout` — or, worse,
// leaves Playwright testing whatever else is on 4321.
const server = await preview({
	root: process.cwd(),
	server: { port: PORT },
	vite: { preview: { strictPort: true } },
});

const shown = Array.isArray(server.urls?.local) ? server.urls.local[0] : server.urls?.local;
console.log(`preview-e2e: serving ${shown || `http://localhost:${server.port}`} in the foreground`);

// Playwright tears the webServer down with a process-group SIGKILL (it only attempts
// a graceful close when `webServer.gracefulShutdown` is configured, and it is not),
// so these handlers are for a human's ctrl-C rather than for the suite. The reason
// nothing leaks is that the server is in this process, not that a handler runs.
const stop = async (code) => {
	try {
		await server.stop();
	} catch {
		// already down
	}
	process.exit(code);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => void stop(0));

await server.closed();
