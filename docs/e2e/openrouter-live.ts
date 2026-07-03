import { type APIRequestContext, type Page, request } from '@playwright/test';

// Live-OpenRouter harness for the AI-assisted scenario tier.
//
// The Studio's in-app connect flow is OAuth (PKCE) — not automatable headlessly —
// but the whole connection contract is one localStorage key: `lattice-db-or-key`
// holds the raw API key, and `ready()` is literally "has a key"
// (docs/src/components/studio/ai/architect-model.js). So the test-only injection path is
// env var → localStorage, seeded BEFORE the island hydrates.
//
// KEY HYGIENE: the key must never reach logs or artifacts. The spec that uses
// this harness turns trace + video OFF (they would otherwise record the init
// script and request headers), and nothing here prints the key.
//
// COST GUARDRAILS (the Architect makes real paid calls):
//   - the model stays on the Studio default `~anthropic/claude-haiku-latest` —
//     the cheapest capable family, server-resolved so it can never rot;
//   - the Studio's own budget cap is armed in HARD-STOP mode ($2 for the whole
//     session), so a runaway test is refused by the app itself before it spends;
//   - the Studio's per-call `max_tokens` ceiling (4096) bounds each reply.

/** The provisioning env var. Present → the live tier runs; absent → it skips. */
export const LIVE_KEY = process.env.OPEN_ROUTER_KEY ?? '';

/** Session-cap armed in hard-stop mode — the app refuses to spend past this. */
const BUDGET_CAP_USD = '2';

/**
 * Seed the OpenRouter connection (and the spend guardrail) into localStorage
 * before any app code runs. Call before `gotoStudio`.
 */
export async function injectOpenRouter(page: Page, key: string): Promise<void> {
	await page.addInitScript(
		([k, cap]) => {
			window.localStorage.setItem('lattice-db-or-key', k);
			window.localStorage.setItem('lattice-db-budget-cap', cap);
			window.localStorage.setItem('lattice-db-budget-mode', 'stop');
		},
		[key, BUDGET_CAP_USD],
	);
}

/**
 * Relay the page's openrouter.ai traffic through a Node-side request context.
 *
 * In the cloud sandbox, outbound HTTPS rides an agent proxy that Chromium's
 * network stack cannot use (its CONNECTs are refused), while Node-side fetch
 * honors HTTPS_PROXY + NODE_EXTRA_CA_CERTS. On an unproxied runner (CI, a
 * laptop) the relay is a transparent pass-through, so the shim is safe to keep
 * on unconditionally — it makes the spec environment-independent.
 *
 * Returns the relay context; dispose it after the test.
 */
export async function routeOpenRouterViaNode(page: Page): Promise<APIRequestContext> {
	const relay = await request.newContext();
	await page.route('https://openrouter.ai/**', async (route) => {
		const req = route.request();
		try {
			const headers = await req.allHeaders();
			delete headers['content-length']; // recomputed by the relay
			const resp = await relay.fetch(req.url(), {
				method: req.method(),
				headers,
				data: req.postDataBuffer() ?? undefined,
				maxRedirects: 0,
				timeout: 120_000, // completions can legitimately take a while
			});
			// resp.body() is already decoded — drop the transport headers so the
			// browser doesn't try to decode (or length-check) the body again.
			const { 'content-encoding': _enc, 'content-length': _len, ...respHeaders } = resp.headers();
			await route.fulfill({ status: resp.status(), headers: respHeaders, body: await resp.body() });
		} catch (e) {
			// A failed OpenRouter call degrades to the app's silent floor (no error
			// toast), so without THIS line a relay problem reads as an inexplicable
			// toast timeout. Log the message only — never headers, never the key.
			console.warn(`openrouter relay failed: ${e instanceof Error ? e.message : String(e)}`);
			await route.abort('connectionfailed').catch(() => {});
		}
	});
	return relay;
}

/** Tear the relay down safely: unroute first so a mid-flight handler can't
 *  race the disposed context, then dispose the Node request context. */
export async function disposeRelay(page: Page, relay: APIRequestContext): Promise<void> {
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await relay.dispose();
}
