// WELCOME STATE — has this visitor been welcomed, and may we welcome them automatically here?
//
// Per-viewer, so browser storage is the right home: losing it costs one repeated welcome. Every
// access is guarded (storage throws in a private window or with site data blocked), and a visitor
// whose storage refuses simply never sees the card on their own — safer than seeing it every load.
// Design record: engineering/decisions/2026-10-20-first-run-onboarding.md.

const KEY = 'lattice-studio-welcomed';

export const wasWelcomed = (): boolean => {
	try {
		return localStorage.getItem(KEY) != null;
	} catch {
		return true; // can't remember it, so don't risk showing it every time
	}
};

export const markWelcomed = (): void => {
	try {
		localStorage.setItem(KEY, '1');
	} catch {
		/* the visitor sees the card again next visit, nothing worse */
	}
};

/**
 * Should the Studio open the welcome card on its own? Only on the production site (the page build
 * stamps `data-tours="on"` there, the same switch the Playground tour honors) and never under test
 * automation, so a PR preview, a local dev server and an e2e run all stay quiet. `?welcome=1` forces
 * it for support and QA, on any host; a visitor who turned tours off never gets it.
 */
export function shouldAutoWelcome(opts: { toursOn: boolean; search: string; toursStamp?: string; automated?: boolean }): boolean {
	if (!opts.toursOn) return false;
	if (new URLSearchParams(opts.search).get('welcome') === '1') return true;
	if (opts.toursStamp !== 'on' || opts.automated) return false;
	return !wasWelcomed();
}
