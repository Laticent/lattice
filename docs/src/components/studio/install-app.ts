// Install-state plumbing for the Studio's "Install app" entry (Workspace →
// General). The page-level capture lives in PwaHead.astro: Chromium fires
// `beforeinstallprompt` before any island hydrates, so the inline script parks
// the event on `window.__latticeInstallPrompt` and re-announces it via the
// CAN_INSTALL_EVENT; this module is the typed reader the React side consumes.
//
// Install is a four-state world, and honesty about each beats a dead button:
//   installed    running standalone (or the parked prompt was consumed) — done.
//   promptable   Chromium parked a real prompt — one tap opens the native dialog.
//   ios-manual   iOS Safari has NO prompt API, ever — show the two-line
//                Share → Add to Home Screen instruction instead.
//   unsupported  everything else (desktop Safari/Firefox) — point at the
//                browser's own menu, promise nothing.

export const CAN_INSTALL_EVENT = 'lattice:can-install';

export type InstallState = 'installed' | 'promptable' | 'ios-manual' | 'unsupported';

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function parkedPrompt(): BeforeInstallPromptEvent | null {
	if (typeof window === 'undefined') return null;
	return (window as unknown as { __latticeInstallPrompt?: BeforeInstallPromptEvent | null }).__latticeInstallPrompt ?? null;
}

/** Is this page already running as the installed app? */
export function isStandalone(): boolean {
	try {
		return (
			window.matchMedia?.('(display-mode: standalone)').matches ||
			('standalone' in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true)
		);
	} catch {
		return false;
	}
}

function isIos(): boolean {
	try {
		const ua = navigator.userAgent;
		// iPadOS 13+ masquerades as macOS; the touch-point check unmasks it.
		return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	} catch {
		return false;
	}
}

export function installState(): InstallState {
	if (isStandalone()) return 'installed';
	if (parkedPrompt()) return 'promptable';
	if (isIos()) return 'ios-manual';
	return 'unsupported';
}

/** Open the native install dialog (promptable state only). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const p = parkedPrompt();
	if (!p) return 'unavailable';
	await p.prompt();
	const choice = await p.userChoice;
	// A consumed prompt can't be re-shown; drop it either way (Chromium re-parks
	// a fresh one on a later visit if the user dismissed).
	(window as unknown as { __latticeInstallPrompt?: BeforeInstallPromptEvent | null }).__latticeInstallPrompt = null;
	return choice.outcome;
}
