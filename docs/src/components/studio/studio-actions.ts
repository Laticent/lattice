// The Studio action bag — the setters a Vetrina tour drives, each bound to real Studio state in
// use-studio-demo.ts. Kept in its own module (the tours + the hook both import it) so a tour is a
// plain data script with no dependency on any particular walkthrough. The individual tours live
// in ./tours; this is the vocabulary they all speak.

/** The Studio setters the demo's `act` closures drive (each bound to real state in the hook).
 *  Only what `first-look` uses: the nine setters the retired tours alone called left with them, and
 *  the lessons' verbs live in the shared action list (studio-commands.ts). */
export type StudioActions = {
	openDeckMenu: (open: boolean) => void;
	createFirstDeck: () => void;
	gotoSlide: (index: number) => void;
	/** Swap the phone's single Edit/Preview pane (mobile only). Desktop/tablet ignore it. */
	setMobilePane: (pane: 'edit' | 'preview') => void;
	/** Flip light/dark. The tour flips it and flips it back; a stopped tour restores the look it found. */
	toggleMode: () => void;
	/** Click the real control a selector (or a lookup) names, so the app does exactly what a click does.
	 *  A tour's cursor draws the click; this makes it happen. A control that is not there is skipped. */
	press: (target: string | (() => HTMLElement | null)) => void;
	/** Close every panel, sheet and overlay a tour may have opened, leaving the page itself as it is. */
	closeAll: () => void;
	setPresent: (open: boolean) => void;
	setShare: (open: boolean) => void;
	setPosture: (p: 'read' | 'write' | 'craft') => void;
	/** Move the caption bar to the other edge for the beats that point at a control it would cover. */
	captionEdge: (edge: 'top' | 'bottom') => void;
};
