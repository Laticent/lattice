// The oldest browser of each kind that Lattice supports, and how a reader on an older one updates
// (engineering/decisions/2026-11-12-device-capability-tiers.md §6.2).
//
// The floor is the site's CSS framework's: Tailwind 4 needs Chrome 111, Safari 16.4 and Firefox 128, for `color-mix()`
// and `@property`. Lattice's own features (`:has()`, container queries, `structuredClone`) all sit below it. The guard
// never reads these numbers to DECIDE: it tests features (device-profile.ts FEATURE_PROBES). The numbers only make the
// notice actionable ("you have Safari 15.6; Lattice needs 16.4 or newer") and fill the docs' "Supported browsers" table,
// which a unit test holds to this list.
//
// Every link was checked to resolve to the page its label names on 2026-11-15. The steps use words, not arrows (#29).

export interface BrowserFloor {
	/** What the notice's ES5 user-agent reader calls this browser (old-browser-notice.es5.js). */
	id: 'chrome' | 'edge' | 'firefox' | 'safari' | 'ios' | 'samsung' | 'opera';
	/** The browser's name as a reader knows it. */
	name: string;
	/** The oldest supported version, as the browser numbers it. */
	min: string;
	/** One sentence a reader needs before the steps, when there is one ("Safari updates with macOS."). */
	note?: string;
	/** How to update, one action per step: the notice shows them as a numbered list. */
	steps: readonly string[];
	/** What to do when the steps can't work, when there is a fallback. */
	after?: string;
	/** The vendor's own update page. */
	link: string;
	/** On Android, where the update comes from the app store, the store page and the steps for it. */
	android?: { steps: readonly string[]; link: string };
}

export const BROWSER_FLOOR: readonly BrowserFloor[] = [
	{
		id: 'chrome',
		name: 'Chrome',
		min: '111',
		steps: ['Open the menu: the three dots at the top right.', 'Choose Help, then About Google Chrome.', 'Chrome downloads the update. Select Relaunch when it is ready.'],
		link: 'https://support.google.com/chrome/answer/95414',
		android: { steps: ['Open the Play Store.', 'Search for Chrome.', 'Select Update.'], link: 'https://play.google.com/store/apps/details?id=com.android.chrome' },
	},
	{
		id: 'edge',
		name: 'Edge',
		min: '111',
		steps: ['Open the menu: the three dots at the top right.', 'Choose Help and feedback, then About Microsoft Edge.', 'Edge downloads the update. Select Restart when it is ready.'],
		link: 'https://support.microsoft.com/topic/microsoft-edge-update-settings-af8aaca2-1b69-4870-94fe-18822dbb7ef1',
	},
	{
		id: 'firefox',
		name: 'Firefox',
		min: '128',
		steps: ['Open the menu: the three lines at the top right.', 'Choose Help, then About Firefox.', 'Firefox downloads the update. Select Restart to update Firefox.'],
		link: 'https://support.mozilla.org/kb/update-firefox-latest-release',
		android: { steps: ['Open the Play Store.', 'Search for Firefox.', 'Select Update.'], link: 'https://play.google.com/store/apps/details?id=org.mozilla.firefox' },
	},
	{
		id: 'safari',
		name: 'Safari',
		min: '16.4',
		note: 'Safari updates with macOS.',
		steps: ['Open the Apple menu, then System Settings.', 'Choose General, then Software Update.', 'Install the update, then open this page again.'],
		after: "On older Macs, use System Preferences, then Software Update. If your Mac can't update, a current Chrome or Firefox may still install on it.",
		link: 'https://support.apple.com/en-us/102665',
	},
	{
		id: 'ios',
		name: 'iOS',
		min: '16.4',
		note: "Every browser on an iPhone or iPad runs on Safari's engine, so updating iOS updates them all.",
		steps: ['Open Settings.', 'Choose General, then Software Update.', 'Install iOS 16.4 or later.'],
		link: 'https://support.apple.com/en-us/118575',
	},
	{
		id: 'samsung',
		name: 'Samsung Internet',
		min: '22',
		steps: ['Open the Galaxy Store or the Play Store.', 'Search for Samsung Internet.', 'Select Update.'],
		link: 'https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser',
	},
	{
		id: 'opera',
		name: 'Opera',
		min: '97',
		steps: ['Open the menu.', 'Choose Update & Recovery.', 'Select Check for update.'],
		link: 'https://www.opera.com/download',
	},
];

/** Windows 7 and 8 can no longer run any browser at the floor: Chrome and Edge stopped at 109 there, Firefox at 115. */
export const OLD_WINDOWS = {
	note: 'Chrome, Edge and Firefox have all stopped updating on Windows 7 and 8, so no browser there is new enough. Lattice needs Windows 10 or later, or another device.',
	link: 'https://support.microsoft.com/windows/windows-7-support-ended-on-january-14-2020-b75d4580-2cc7-895a-2c9c-1466d9a53962',
};

/** "Chrome 111+, Edge 111+, …" for a sentence, in table order (iOS is said with Safari). */
export function floorSummary(): string {
	return BROWSER_FLOOR.filter((b) => b.id !== 'ios')
		.map((b) => `${b.name} ${b.min}`)
		.join(', ');
}
