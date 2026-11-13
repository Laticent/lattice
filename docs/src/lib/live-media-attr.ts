// The `data-lattice-live-media` attribute a live-preview builder writes on its frame's <html>.
//
// The attribute opts a frame into the Underpainting (lib/core/image-painting.js): a picture still loading
// shows a painting instead of an empty panel. On a LITE device (html[data-device-tier="lite"], the device
// tier, engineering/decisions/2026-11-12-device-capability-tiers.md §4) the value is "still", and the runtime
// (`holdsStill` in lib/core/image-painting.js) lays the painting down with no sweep and no drifting brushwork, so a
// software renderer composites nothing per frame. Both values opt in: the runtime asks first whether the attribute is there.
// Read once per full frame write; a tier decided mid-session reaches the next write, not a frame already up.

// The LITE read is inlined, not device-lite.js: this module rides the slide builder, which is eager on the home page, and
// importing device-lite.js split it into a chunk of its own there (the home route's startup-JavaScript ceiling).
export function liveMediaAttr(doc: { documentElement?: { getAttribute(name: string): string | null } | null } | undefined = globalThis.document): string {
	try {
		return doc?.documentElement?.getAttribute('data-device-tier') === 'lite' ? ' data-lattice-live-media="still"' : ' data-lattice-live-media';
	} catch {
		return ' data-lattice-live-media';
	}
}
