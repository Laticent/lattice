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
	id: 'chrome' | 'edge' | 'edge-legacy' | 'firefox' | 'safari' | 'ios' | 'samsung' | 'opera';
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
	/** On Android, where the update comes from the app store: the store page, the steps, and what to do if it can't. */
	android?: { steps: readonly string[]; link: string; after?: string };
	/** The button's label, when "How to update <name>" would mislead (a download page is not an update guide). */
	linkText?: string;
}

/** What to do when an Android app store offers no update: the phone itself is too old for a current browser. */
const ANDROID_AFTER = "If there's no Update button, this phone can't get a newer version. Open this page on a computer or a newer phone.";

export const BROWSER_FLOOR: readonly BrowserFloor[] = [
	{
		id: 'chrome',
		name: 'Chrome',
		min: '111',
		steps: ['Open the menu: the three dots at the top right.', 'Choose Help, then About Google Chrome.', 'Chrome downloads the update. Select Relaunch when it is ready.'],
		link: 'https://support.google.com/chrome/answer/95414',
		android: { steps: ['Open the Play Store.', 'Search for Chrome.', 'Select Update.'], link: 'https://play.google.com/store/apps/details?id=com.android.chrome', after: ANDROID_AFTER },
	},
	{
		id: 'edge',
		name: 'Edge',
		min: '111',
		steps: ['Open the menu: the three dots at the top right.', 'Choose Help and feedback, then About Microsoft Edge.', 'Edge downloads the update. Select Restart when it is ready.'],
		link: 'https://support.microsoft.com/topic/microsoft-edge-update-settings-af8aaca2-1b69-4870-94fe-18822dbb7ef1',
		android: { steps: ['Open the Play Store.', 'Search for Microsoft Edge.', 'Select Update.'], link: 'https://play.google.com/store/apps/details?id=com.microsoft.emmx', after: ANDROID_AFTER },
	},
	{
		// The original Edge (EdgeHTML, versions 12 to 18). It updated only with Windows, and Microsoft retired it in 2021, so
		// no update brings it to the floor: the reader installs the current Edge. Seen for real: Edge 15 on Windows 10 (the
		// owner's screenshot, 2026-11-15).
		id: 'edge-legacy',
		name: 'Edge',
		min: '111',
		note: "This is the old Edge, which Microsoft stopped updating in 2021. Install the new Edge instead: it's free and replaces the old one.",
		steps: ['Open microsoft.com/edge.', 'Download and install Microsoft Edge.', 'Open this page again in the new Edge.'],
		link: 'https://www.microsoft.com/edge',
		linkText: 'Get the new Edge',
	},
	{
		id: 'firefox',
		name: 'Firefox',
		min: '128',
		steps: ['Open the menu: the three lines at the top right.', 'Choose Help, then About Firefox.', 'Firefox downloads the update. Select Restart to update Firefox.'],
		link: 'https://support.mozilla.org/kb/update-firefox-latest-release',
		android: { steps: ['Open the Play Store.', 'Search for Firefox.', 'Select Update.'], link: 'https://play.google.com/store/apps/details?id=org.mozilla.firefox', after: ANDROID_AFTER },
	},
	{
		id: 'safari',
		name: 'Safari',
		min: '16.4',
		note: "Safari updates along with your Mac's system software.",
		steps: [
			'Click the Apple logo at the top left of the screen.',
			'Choose System Settings, then General, then Software Update. On older Macs, choose System Preferences, then Software Update.',
			'Install the update, then open this page again.',
		],
		after: "If your Mac can't update, a current Chrome or Firefox may still install on it.",
		link: 'https://support.apple.com/en-us/102665',
	},
	{
		id: 'ios',
		name: 'iOS',
		min: '16.4',
		note: 'Every browser on an iPhone or iPad is built on Safari, so updating the iPhone or iPad updates all of them.',
		steps: ['Open Settings.', 'Choose General, then Software Update.', 'Install iOS 16.4 or later.'],
		after: "Older iPhones and iPads can't install iOS 16.4. If yours doesn't offer it, open this page on a computer or a newer device.",
		link: 'https://support.apple.com/en-us/118575',
	},
	{
		id: 'samsung',
		name: 'Samsung Internet',
		min: '22',
		steps: ['Open the Galaxy Store or the Play Store.', 'Search for Samsung Internet.', 'Select Update.'],
		after: ANDROID_AFTER,
		link: 'https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser',
	},
	{
		id: 'opera',
		name: 'Opera',
		min: '97',
		steps: ['Open the Opera menu: the red O at the top left (on a Mac, the Opera menu at the top of the screen).', 'Choose Update & Recovery.', 'Select Check for update.'],
		link: 'https://help.opera.com/en/latest/crashes-and-issues/#update',
		android: { steps: ['Open the Play Store.', 'Search for Opera.', 'Select Update.'], link: 'https://play.google.com/store/apps/details?id=com.opera.browser', after: ANDROID_AFTER },
	},
];

/** Windows 7 and 8 can no longer run any browser at the floor: Chrome and Edge stopped at 109 there, Firefox at 115. */
export const OLD_WINDOWS = {
	need: 'A newer computer or phone',
	note: "Windows 7 and 8 can't run a browser new enough for Lattice, because Chrome, Edge and Firefox all stopped updating there. Open this page on a computer with Windows 10 or later, a Mac, or a newer phone or tablet.",
	// No button: Microsoft's "support ended" page gives the reader nothing they can do.
};

/** "Chrome 111, Edge 111, …" for a sentence, in table order (iOS is said with Safari, the original Edge with Edge). */
export function floorSummary(): string {
	return BROWSER_FLOOR.filter((b) => b.id !== 'ios' && b.id !== 'edge-legacy')
		.map((b) => `${b.name} ${b.min}`)
		.join(', ');
}

/**
 * The supported browsers as a reader says them, one per line ("Safari 16.4 or newer on a Mac"). The notice shows this list
 * itself: it must never send a reader to another page of the site, which their browser can't show properly either.
 */
export function supportedList(): string[] {
	return BROWSER_FLOOR.filter((b) => b.id !== 'edge-legacy').map((b) => {
		if (b.id === 'ios') return `iPhone and iPad: iOS ${b.min} or newer, in any browser`;
		if (b.id === 'safari') return `Mac: Safari ${b.min} or newer`;
		return `${b.name} ${b.min} or newer`;
	});
}
