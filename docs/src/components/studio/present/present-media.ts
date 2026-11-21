// What Present tells the OPERATING SYSTEM while a deck plays: the lock-screen and headphone controls (Media Session)
// and the kind of audio the page makes (Audio Session). The screen-on half is `WakeKeeper` (../live/live-wake.ts).
//
// Media Session: with handlers set, the phone's lock screen, Control Center, a Bluetooth headset's buttons and a car's
// steering-wheel keys drive the deck — play, pause, next, previous — the same verbs as the transport. Without them a
// presenter who pockets the phone has no way to pause short of unlocking it.
//
// Audio Session (`navigator.audioSession`, WebKit 16.4+): `playback` tells iOS this page plays MEDIA, not interface
// sounds, so narration keeps sounding with the ring/silent switch on and is the category the OS lets play on when the
// screen locks. Set while Present is open and put back on close, so the rest of the Studio keeps what it had.
// NEVER over `play-and-record`: the Audio Session spec ends a live microphone track under any other explicit type, so
// opening Present during a Studio Live call would cut the presenter's mic (the rule `lib/suono/stage.ts` states). And
// left alone when it is already `playback` (Suono promotes it on unlock), so closing does not demote the editor's own
// read-aloud to the ambient channel the silent switch mutes.
//
// Both APIs are optional and absent on many browsers; every call here is guarded and never throws.

type Action = 'play' | 'pause' | 'nexttrack' | 'previoustrack' | 'stop';
type MediaSessionLike = {
	setActionHandler(action: Action, handler: (() => void) | null): void;
	playbackState?: 'none' | 'paused' | 'playing';
	metadata?: unknown;
};
type MediaNavigator = { mediaSession?: MediaSessionLike; audioSession?: { type: string } };
type MetadataCtor = new (init: { title?: string; artist?: string; album?: string }) => unknown;

const ACTIONS: Action[] = ['play', 'pause', 'nexttrack', 'previoustrack', 'stop'];

export type PresentMediaHandlers = { play(): void; pause(): void; next(): void; prev(): void; stop(): void };

/**
 * Bind the OS media controls to Present's transport. Returns an unbind that clears every handler and puts the audio
 * session back. `handlers` is read at call time through the object, so a caller can hand in refs-backed functions.
 */
export function bindPresentMedia(
	handlers: PresentMediaHandlers,
	title: string,
	nav: MediaNavigator | undefined = typeof navigator === 'undefined' ? undefined : (navigator as MediaNavigator),
	Metadata: MetadataCtor | undefined = typeof MediaMetadata === 'undefined' ? undefined : (MediaMetadata as unknown as MetadataCtor),
): () => void {
	const ms = nav?.mediaSession;
	const map: Record<Action, () => void> = { play: handlers.play, pause: handlers.pause, nexttrack: handlers.next, previoustrack: handlers.prev, stop: handlers.stop };
	if (ms) {
		for (const a of ACTIONS) {
			try {
				ms.setActionHandler(a, () => map[a]());
			} catch {
				/* an action this browser does not know */
			}
		}
		try {
			if (Metadata) ms.metadata = new Metadata({ title: title || 'Presentation', artist: 'Lattice' });
		} catch {
			/* best-effort */
		}
	}
	const session = nav?.audioSession;
	const before = session?.type;
	let changed = false;
	try {
		if (session && before !== 'play-and-record' && before !== 'playback') {
			session.type = 'playback';
			changed = true;
		}
	} catch {
		/* best-effort */
	}
	return () => {
		if (ms) {
			for (const a of ACTIONS) {
				try {
					ms.setActionHandler(a, null);
				} catch {
					/* best-effort */
				}
			}
			try {
				ms.metadata = null;
				ms.playbackState = 'none';
			} catch {
				/* best-effort */
			}
		}
		try {
			// Only undo our own change, and only if nothing changed it since (a Live call starting meanwhile wins).
			if (session && changed && session.type === 'playback') session.type = before ?? 'auto';
		} catch {
			/* best-effort */
		}
	};
}

/** Mirror the deck's play state onto the lock screen, so it shows Pause while the deck delivers. */
export function setPresentPlaybackState(playing: boolean, nav: MediaNavigator | undefined = typeof navigator === 'undefined' ? undefined : (navigator as MediaNavigator)): void {
	try {
		if (nav?.mediaSession) nav.mediaSession.playbackState = playing ? 'playing' : 'paused';
	} catch {
		/* best-effort */
	}
}
