import type { TypeOps } from '../../lib/vetrina';

// The demo's TYPING CHANNEL — which sink a tour's characters land in, and what has to happen
// afterwards for the author to see them.
//
// It lives in its own module for one reason: it is the piece of `use-studio-demo` that is pure
// wiring, and wiring is the one thing a real-surface test cannot reach. `runner.ts` routes four
// cases through `set` — an `instant: true` beat, the `still` motion tier, an insert over ~1600
// chars, and the prefix reset when the new text diverges from what was typed — and NO shipped tour
// takes any of them, so the desktop `set` path cannot be driven end to end without inventing a
// tour or a test hook in the shell. Both are worse than the defect they would cover. Extracting the
// builder makes the claim "every path that writes the document also follows it" a unit test instead
// of a promise (`demo-typing.test.ts`).
//
// ── The two channels ─────────────────────────────────────────────────────────
//
// DESKTOP types NATIVELY (`typeTail`): a real CodeMirror insert, so the caret moves and the editor
// scrolls to follow for free.
//
// A PHONE CANNOT. A native insert makes the CodeMirror doc run AHEAD of the React `value` prop; the
// editor's value-sync then diffs against the lagging value and deletes the characters typed since —
// intermittent dropped characters, garbled slides, and likelier now that the preview re-renders
// during typing. So phone typing goes through the CONTROLLED `setSource`, a single writer, which
// React coalesces into something that still reads as typing. `acc` mirrors the document, because
// `append(delta)` has to re-set the whole growing string through a prop that takes the whole value.
//
// ── Why `follow` exists, and why the desktop `set` needs it too ──────────────
//
// `setSource` replaces the document from React state with NO caret move, so — unlike a native
// insert — nothing scrolls: the view sits at the top of the document while a long slide types below
// the fold. `follow` is the compensation (see `use-studio-demo`, which defers it past React's commit
// and hands it to CodeMirror rather than setting scrollTop on a guessed element).
//
// Every `set` therefore follows, on BOTH channels. The desktop one is not a per-keystroke path, but
// when it fires it drops a whole slide into the document at once — exactly the case where the view
// being left at the top matters most. `append` on the desktop channel needs nothing: a native insert
// carries its own reveal.

/** The sinks a typing channel writes through, plus the reveal a controlled write owes. */
export interface TypingHost {
	/** True for the controlled channel: a phone, or an editor that has not mounted yet. */
	controlled: boolean;
	/** Replace the whole document through the React value. */
	setSource: (text: string) => void;
	/** Append natively in the editor (caret moves, editor scrolls itself). */
	typeTail: (text: string) => void;
	/** Reveal the document's tail after a controlled write. */
	follow: () => void;
}

/** Build the `TypeOps` a run drives. Pure: every effect goes through `host`. */
export function buildTypeOps(host: TypingHost): TypeOps {
	if (!host.controlled) {
		return {
			set: (text) => {
				host.setSource(text);
				host.follow();
			},
			append: (text) => host.typeTail(text),
		};
	}
	// `acc` mirrors the document for this channel only — the controlled sink takes the whole value,
	// so an append has to re-send everything written so far. A `set` REPLACES that baseline; an
	// append that kept accumulating across a set would duplicate the document's head.
	let acc = '';
	return {
		set: (text) => {
			acc = text;
			host.setSource(text);
			host.follow();
		},
		append: (text) => {
			acc += text;
			host.setSource(acc);
			host.follow();
		},
	};
}
