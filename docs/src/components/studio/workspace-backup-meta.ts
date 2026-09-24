// The light half of the workspace backup: what the Studio needs on first paint (the settings
// row's storage line, the Safari-tab nudge, the file name and the download). The pack and restore
// code lives in workspace-backup.ts and is imported only when the user makes or restores a
// backup, which keeps it off the Studio's eager path (docs/route-budget.json).

export const WORKSPACE_ZIP_NAME = 'lattice-workspace.zip';

/** One human line for the settings row: what's in this browser right now. */
export async function storageSummary(): Promise<string> {
	let bytes = 0;
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k?.startsWith('lattice-studio-')) continue;
			bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
		}
	} catch {
		/* storage unavailable */
	}
	try {
		const est = await navigator.storage?.estimate?.();
		if (est?.usage) bytes = Math.max(bytes, est.usage);
	} catch {
		/* estimate unsupported (Safari tabs) — the localStorage count stands */
	}
	if (!bytes) return 'nothing stored yet';
	const mb = bytes / 1_048_576;
	return mb >= 1 ? `~${mb.toFixed(1)} MB in this browser` : `~${Math.max(1, Math.round(bytes / 1024))} KB in this browser`;
}

/**
 * A Safari TAB (not the installed app) is the one place storage quietly expires
 * (WebKit's 7-day rule; the installed home-screen app is exempt). Used to append
 * one situational sentence to the backup copy — never a modal, never red.
 */
export function isEvictionProneBrowser(): boolean {
	try {
		const ua = navigator.userAgent;
		const isWebKitSafari = /Safari\//.test(ua) && !/Chrom|Edg|OPR|Firefox/i.test(ua);
		const standalone = window.matchMedia?.('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true);
		return isWebKitSafari && !standalone;
	} catch {
		return false;
	}
}

// Every Studio save goes through the platform seam (download.ts → lib/platform.js), so the
// backup zip lands in the OS save dialog inside the desktop app. Re-exported, not copied.
export { downloadBlob } from './download';

/**
 * What a restore could not bring back, carried across the reload that follows it. The restore
 * reloads (the one honest way to re-derive every view), and a notice raised before the reload
 * would be cleared by it. Leaving the page un-reloaded until the user reads the notice is worse:
 * the editor stays live over the store the restore just rewrote, and one keystroke writes the
 * stale deck back over the restored one. So the report rides `sessionStorage` (this tab only)
 * and the Studio shows it once it has booted on the restored data.
 */
const RESTORE_REPORT_KEY = 'lattice-studio-restore-report';
export type RestoreReport = { done: string; notRestored: string };

export function stashRestoreReport(report: RestoreReport): void {
	try {
		sessionStorage.setItem(RESTORE_REPORT_KEY, JSON.stringify(report));
	} catch {
		/* storage unavailable: the notice before the reload is all the user gets */
	}
}

/** The stashed report, removed as it is read, so it shows once. */
export function takeRestoreReport(): RestoreReport | null {
	try {
		const raw = sessionStorage.getItem(RESTORE_REPORT_KEY);
		if (!raw) return null;
		sessionStorage.removeItem(RESTORE_REPORT_KEY);
		const r = JSON.parse(raw) as Partial<RestoreReport>;
		return typeof r?.done === 'string' && typeof r?.notRestored === 'string' ? { done: r.done, notRestored: r.notRestored } : null;
	} catch {
		return null;
	}
}

