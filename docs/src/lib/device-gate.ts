// The device gate: the small, eager half of the decline (engineering/decisions/2026-11-12-device-capability-tiers.md §6, §7).
//
// It watches `html[data-device-tier]`. When it reads "unsupported", it loads the decline screen (decline-screen.ts, a lazy
// chunk) over the page; when the tier moves off it, the screen goes. A tab that chose "continue anyway" (sessionStorage is
// per tab) does not see the screen again: the gate turns the attribute to "lite" at once and shows the Lite banner instead.
//
// Owner's scope (§7.3): the Studio (and Present, which runs inside it) and the Playground. The Studio decides its tier in
// its own warm-up after the first slide; on the Playground the gate also applies a pin or the saved tier before the app
// runs, and starts the decision once the page is idle. Landing and docs pages carry no gate and serve everyone.
//
// Kept tiny on purpose: it is eager on both routes, so it reads two strings and loads everything else on demand.

import { CONTINUE_KEY, TIER_KEY } from './device-tier-keys';

const TIERS = /^(full|lite|unsupported)$/;

function continued(): boolean {
	try {
		return sessionStorage.getItem(CONTINUE_KEY) === '1';
	} catch {
		return false;
	}
}

/** Watch the tier and show or hide the decline. `decide`: also apply the saved tier and start the decision (the Playground). */
export function startDeviceGate({ decide = false }: { decide?: boolean } = {}): void {
	const root = document.documentElement;
	if (decide && !root.hasAttribute('data-device-tier')) {
		try {
			let t = new URLSearchParams(location.search).get('tier');
			if (!t || !TIERS.test(t)) t = localStorage.getItem(TIER_KEY);
			if (t && TIERS.test(t)) root.setAttribute('data-device-tier', t);
		} catch {}
	}
	let shown = false;
	const check = () => {
		const tier = root.getAttribute('data-device-tier');
		if (tier === 'unsupported' && continued()) {
			root.setAttribute('data-device-tier', 'lite');
			return;
		}
		if (tier === 'unsupported' && !shown) {
			shown = true;
			void import('./decline-screen').then((m) => m.showDecline());
		} else if (tier !== 'unsupported' && shown) {
			shown = false;
			void import('./decline-screen').then((m) => m.hideDecline());
		}
		// The banner follows the flag both ways: the runtime clears it once the browser is no longer declined.
		if (continued()) void import('./decline-screen').then((m) => m.showLiteBanner());
		else if (document.getElementById('lattice-device-banner')) void import('./decline-screen').then((m) => m.hideLiteBanner());
	};
	new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ['data-device-tier'] });
	check();
	if (decide) {
		const run = () => void import('./device-tier').then((m) => m.ensureDeviceTier(window));
		const idle = (window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
		const later = () => (idle ? idle(run, { timeout: 4000 }) : setTimeout(run, 1500));
		if (document.readyState === 'complete') later();
		else addEventListener('load', later, { once: true });
	}
}
