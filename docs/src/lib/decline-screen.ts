// The decline screen and the Lite banner (engineering/decisions/2026-11-12-device-capability-tiers.md §6, §7.2).
//
// A full page over the app, in the site's own tokens: what failed, what to use instead, "Copy system report", and a small
// "Continue anyway" that runs this tab as LITE under a banner that stays up. Plain DOM rather than React: the
// gate loads it on the Studio and on the Playground, before either app may have mounted, and a missing browser feature is
// exactly when the app's own code may not run.
//
// Loaded only when the tier reads "unsupported" (device-gate.ts), so no page pays for it at startup.

import { continueAnyway, ensureDeviceTier, type TierState } from './device-tier';
import { browserName, reportRows, reportText } from './system-report';

const SCREEN_ID = 'lattice-device-decline';
const BANNER_ID = 'lattice-device-banner';

type NavExtras = Navigator & { connection?: { effectiveType?: string; saveData?: boolean }; userAgentData?: { brands?: { brand: string; version: string }[] } };

/** What the screen says: the failed checks, and what to do about them. PURE, so the wording is unit-tested. */
export function declineWords(s: Pick<TierState, 'profile' | 'pinned'>): { lead: string; advice: string } {
	const features = s.profile.reasons.filter((r) => r.kind === 'feature');
	const floors = s.profile.reasons.filter((r) => r.kind === 'floor');
	if (features.length) {
		const names = features.map((r) => r.text.replace(/^This browser doesn't support (.*)\.$/, '$1'));
		const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
		return {
			lead: `It needs ${list}, which this browser doesn't support.`,
			advice: 'Use a current Chrome, Edge, Safari or Firefox.',
		};
	}
	if (floors.length) {
		return {
			lead: `This device is below what Lattice needs: ${floors.map((r) => r.text.replace(/\.$/, '')).join('; ')}.`,
			advice: 'Use a newer computer, or continue here in Lite mode, where some things may be slow.',
		};
	}
	return {
		lead: s.pinned === 'unsupported' ? 'This page was opened with ?tier=unsupported, which shows this screen on purpose.' : 'Lattice could not confirm this browser can run it.',
		advice: 'Use a current Chrome, Edge, Safari or Firefox.',
	};
}

/** The System panel's report, as text, for "Copy system report". */
function report(s: TierState): string {
	const nav = navigator as NavExtras;
	return reportText(
		reportRows({
			profile: s.pinned ? { ...s.profile, tier: s.pinned } : s.profile,
			signals: s.signals,
			pinned: s.pinned,
			browser: browserName(nav.userAgent, nav.userAgentData?.brands),
			storage: null,
			network: nav.connection ? { effectiveType: nav.connection.effectiveType, saveData: nav.connection.saveData } : null,
			reducedMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
			reducedData: !!window.matchMedia?.('(prefers-reduced-data: reduce)').matches,
			gpuRank: s.gpuRank,
		}),
	);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	e.style.cssText = css;
	if (text !== undefined) e.textContent = text;
	return e;
}

/**
 * Everything under <body> but the screen, made inert while it shows, so focus and screen readers stay on it. Only what THIS
 * screen made inert is given back, so an element another component had set inert keeps it; anything added to <body> while
 * the screen is up (a toast, a portal) is made inert as it arrives.
 */
const madeInert = new Set<Element>();
let watcher: MutationObserver | null = null;
function inertOne(c: Element): void {
	if (c.id === SCREEN_ID || c.id === BANNER_ID || c.hasAttribute('inert')) return;
	c.setAttribute('inert', '');
	madeInert.add(c);
}
function setAppInert(on: boolean): void {
	if (on) {
		for (const c of Array.from(document.body.children)) inertOne(c);
		watcher ??= new MutationObserver((records) => {
			for (const r of records) for (const n of Array.from(r.addedNodes)) if (n instanceof Element) inertOne(n);
		});
		watcher.observe(document.body, { childList: true });
		return;
	}
	watcher?.disconnect();
	watcher = null;
	for (const c of madeInert) c.removeAttribute('inert');
	madeInert.clear();
}
let focusBefore: Element | null = null;

const BUTTON = 'font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:999px;cursor:pointer;';

export function showDecline(): void {
	if (document.getElementById(SCREEN_ID)) return;
	const s = ensureDeviceTier(window).state;
	// Starting the runtime may itself have moved the tier off the decline (a saved decline the signals no longer support):
	// then there is nothing to show, and the gate has already been told.
	if (s.tier !== 'unsupported' && document.documentElement.getAttribute('data-device-tier') !== 'unsupported') return;
	const { lead, advice } = declineWords(s);

	const screen = el(
		'div',
		'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px 16px;overflow:auto;background:var(--bg,Canvas);color:var(--text-body,CanvasText);font-family:var(--font-body,system-ui,sans-serif);',
	);
	screen.id = SCREEN_ID;
	screen.setAttribute('role', 'alertdialog');
	screen.setAttribute('aria-modal', 'true');
	screen.setAttribute('aria-labelledby', `${SCREEN_ID}-title`);
	screen.setAttribute('aria-describedby', `${SCREEN_ID}-lead`);
	screen.dataset.testid = 'device-decline';

	const card = el('div', 'max-width:34rem;display:flex;flex-direction:column;gap:14px;');
	const title = el('h1', 'margin:0;font-size:clamp(22px,4vw,28px);line-height:1.2;font-weight:700;color:var(--text-heading,CanvasText);outline:none;', "Lattice can't run well in this browser.");
	title.id = `${SCREEN_ID}-title`;
	title.tabIndex = -1;
	const leadP = el('p', 'margin:0;font:inherit;font-size:16px;line-height:1.5;', lead);
	leadP.id = `${SCREEN_ID}-lead`;
	const adviceP = el('p', 'margin:0;font:inherit;font-size:16px;line-height:1.5;', advice);

	const row = el('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding-top:6px;');
	const copy = el('button', `${BUTTON}background:var(--accent,Highlight);color:var(--on-accent,var(--bg,Canvas));border:1px solid var(--accent,Highlight);`, 'Copy system report');
	copy.type = 'button';
	copy.addEventListener('click', () => {
		const text = report(ensureDeviceTier(window).state);
		navigator.clipboard?.writeText(text).then(
			() => {
				copy.textContent = 'Copied';
			},
			() => {
				copy.textContent = 'Copy failed';
			},
		);
	});
	const go = el('button', `${BUTTON}background:none;border:0;padding:9px 2px;color:var(--text-body,CanvasText);text-decoration:underline;text-underline-offset:3px;font-weight:500;`, 'Continue anyway');
	go.type = 'button';
	go.addEventListener('click', () => {
		continueAnyway(sessionStore());
		hideDecline();
		showLiteBanner();
	});
	row.append(copy, go);
	card.append(title, leadP, adviceP, row);
	screen.append(card);
	focusBefore = document.activeElement;
	document.body.append(screen);
	setAppInert(true);
	title.focus();
}

export function hideDecline(): void {
	const screen = document.getElementById(SCREEN_ID);
	if (!screen) return;
	screen.remove();
	setAppInert(false);
	if (focusBefore instanceof HTMLElement && focusBefore.isConnected) focusBefore.focus();
	focusBefore = null;
}

export function hideLiteBanner(): void {
	document.getElementById(BANNER_ID)?.remove();
}

/** The banner a continued session keeps (§7.2): it never closes, so nobody forgets why something misbehaves. */
export function showLiteBanner(): void {
	if (document.getElementById(BANNER_ID)) return;
	const bar = el(
		'div',
		'position:fixed;left:0;right:0;bottom:0;z-index:2147482999;padding:4px 16px;font:500 12px/1.4 var(--font-body,system-ui,sans-serif);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--bg-alt,Canvas);color:var(--text-heading,CanvasText);border-top:1px solid var(--border,GrayText);',
	);
	// One line at every width, so it covers as little of the app as it can: the long sentence, or on a phone the short one.
	const long = el('span', '', "Lite mode: Lattice doesn't support this browser, so some things may not work.");
	long.className = 'lx-banner-long';
	const short = el('span', '', "Lite mode: this browser isn't supported.");
	short.className = 'lx-banner-short';
	const style = document.createElement('style');
	style.textContent = '#' + BANNER_ID + ' .lx-banner-short{display:none}@media (max-width:640px){#' + BANNER_ID + ' .lx-banner-long{display:none}#' + BANNER_ID + ' .lx-banner-short{display:inline}}';
	bar.append(style, long, short);
	bar.id = BANNER_ID;
	bar.setAttribute('role', 'status');
	bar.dataset.testid = 'device-banner';
	document.body.append(bar);
}

function sessionStore(): Storage | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}
