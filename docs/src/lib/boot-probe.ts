// The boot probe: did the main thread fall behind while the Studio started? (engineering/decisions/2026-11-12-device-
// capability-tiers.md §3, "measured beats guessed".) It sums the BLOCKING time of every long task (the part of each task
// past 50 ms, the same measure as Total Blocking Time) in the first BOOT_WINDOW_MS after navigation, and calls the boot
// slow at BOOT_SLOW_BLOCKING_MS or more. A slow boot adds one weak signal, so it can drop FULL to LITE, never the reverse.
//
// Measured 2026-11-13 on the Studio (Playwright Chromium 153, cloud sandbox, 3 runs each, CDP CPU throttling): blocking
// time in the first 10 s was 461 to 606 ms unthrottled, 3.3 to 3.6 s at 4x and about 5.0 s at 6x. The 2 s cut-off sits
// between them with room on both sides. Safari and Firefox have no long-task API: there the probe answers null (unknown),
// and unknown never lowers the tier.
//
// Every input is passed in (the entries, the clock, the timer), so a test feeds it entries and never makes a page slow
// (HARD RULE #32, F4).

export const BOOT_WINDOW_MS = 10_000;
export const BOOT_SLOW_BLOCKING_MS = 2_000;
const LONG_TASK_MS = 50;

export interface LongTask {
	startTime: number;
	duration: number;
}

/** Blocking time, in ms, of the long tasks that START inside the first `windowMs` after navigation. PURE. */
export function blockingMs(entries: readonly LongTask[], windowMs = BOOT_WINDOW_MS): number {
	let sum = 0;
	for (const e of entries) if (e.startTime >= 0 && e.startTime < windowMs) sum += Math.max(0, e.duration - LONG_TASK_MS);
	return sum;
}

export interface BootProbeDeps {
	/** Start observing long tasks, buffered from navigation; returns a stop function, or null when the browser has no long-task API. */
	observe: (onEntries: (entries: readonly LongTask[]) => void) => (() => void) | null;
	/** Milliseconds since navigation (`performance.now()`). */
	now: () => number;
	setTimeout: (fn: () => void, ms: number) => unknown;
}

/** Resolves once the boot window has closed: true for a slow boot, false for a fast one, null when it cannot tell. */
export function watchBoot(deps: BootProbeDeps): Promise<boolean | null> {
	return new Promise((resolve) => {
		const seen: LongTask[] = [];
		let stop: (() => void) | null;
		try {
			stop = deps.observe((entries) => {
				for (const e of entries) seen.push({ startTime: e.startTime, duration: e.duration });
			});
		} catch {
			stop = null;
		}
		if (!stop) {
			resolve(null);
			return;
		}
		const finish = () => {
			try {
				stop?.();
			} catch {}
			resolve(blockingMs(seen) >= BOOT_SLOW_BLOCKING_MS);
		};
		// A little past the window, so a task that started inside it has had time to end and be reported. Never at once: a
		// buffered observer delivers its backlog in a LATER task (measured in Chromium: 0 entries right after observe(), the
		// boot's long tasks 200 ms on), so a probe started after the window would otherwise read every boot as fast.
		deps.setTimeout(finish, Math.max(250, BOOT_WINDOW_MS + 500 - deps.now()));
	});
}

/** The real long-task source: a buffered PerformanceObserver, or null where `longtask` is not supported. */
export function browserLongTasks(win: Window & typeof globalThis): BootProbeDeps['observe'] {
	return (onEntries) => {
		const PO = win.PerformanceObserver;
		if (!PO || !PO.supportedEntryTypes?.includes('longtask')) return null;
		const po = new PO((list) => onEntries(list.getEntries()));
		po.observe({ type: 'longtask', buffered: true });
		return () => po.disconnect();
	};
}
