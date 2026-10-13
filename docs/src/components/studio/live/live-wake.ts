// Keeps the screen on while a Live session is up. A phone that locks its screen suspends the page, and a host that is
// suspended drops out of the room (the guest sees "Nobody answered"). The Screen Wake Lock API is the standard way to ask
// a browser not to sleep the screen; where it is missing (older browsers) this does nothing.
//
// Written as a class over an injected `navigator` and `document` so the cases that went wrong in review are testable:
// a request still pending when `keep(true)` is called again must not start a second lock, and `keep(false)` must
// release a lock that arrives after it.

type Sentinel = { release(): Promise<void>; addEventListener(type: 'release', cb: () => void): void };
type WakeNavigator = { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };
type WakeDocument = { visibilityState: string; addEventListener(type: 'visibilitychange', cb: () => void): void; removeEventListener(type: 'visibilitychange', cb: () => void): void };

export class WakeKeeper {
	private lock: Sentinel | null = null;
	private pending = false;
	private wanted = false;
	private bound = false;
	private readonly onVisible = () => {
		// A hidden page loses its lock; take it again when the page is back.
		if (this.doc?.visibilityState === 'visible' && this.wanted) this.keep(true);
	};

	constructor(
		private readonly nav: WakeNavigator | undefined = typeof navigator === 'undefined' ? undefined : (navigator as WakeNavigator),
		private readonly doc: WakeDocument | undefined = typeof document === 'undefined' ? undefined : (document as WakeDocument),
	) {}

	/** What the screen lock is doing, for the connection log. */
	get state(): 'held' | 'not held' | 'unsupported' {
		return this.lock ? 'held' : this.nav?.wakeLock ? 'not held' : 'unsupported';
	}

	keep(on: boolean): void {
		this.wanted = on;
		if (!on) {
			const held = this.lock;
			this.lock = null;
			void held?.release().catch(() => {});
			if (this.bound) this.doc?.removeEventListener('visibilitychange', this.onVisible);
			this.bound = false;
			return;
		}
		if (!this.nav?.wakeLock) return;
		if (!this.bound && this.doc) {
			this.bound = true;
			this.doc.addEventListener('visibilitychange', this.onVisible);
		}
		if (this.lock || this.pending) return;
		this.pending = true;
		this.nav.wakeLock
			.request('screen')
			.then((lock) => {
				this.pending = false;
				if (!this.wanted) return void lock.release().catch(() => {});
				this.lock = lock;
				lock.addEventListener('release', () => {
					if (this.lock === lock) this.lock = null;
				});
			})
			.catch(() => {
				this.pending = false;
			});
	}
}
