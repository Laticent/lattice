- **Vetrina — a cue now scrolls its target into view before it points at it.** Nothing in the
  stage scrolled except the drop target of a drag, so a `point()`, a drag's pick-up or a gesture
  aimed at anything below the fold sent the cursor off-screen and played the beat to an empty
  viewport. Every verb now reveals its target first — `scrollIntoView({ block: 'nearest', inline:
  'nearest', behavior: 'instant' })`, so a target already in view moves nothing and a host's
  `scroll-behavior: smooth` cannot turn the landing into a race between two animations. Two
  deliberate exceptions: `wave` and `shake` play at the cursor and ignore the target they are
  handed, and a cue silenced through `theme.cues` draws nothing, so neither scrolls. Under
  `bounds: 'host'` the dock is re-seated after a scroll the stage performed itself.
- **Studio — the demo's typing follow asks the editor to scroll, instead of guessing which
  element does.** Typing on a phone goes through the controlled `setSource` path, which moves no
  caret and so never scrolls; the compensation set `scrollTop = scrollHeight` on
  `#studio-pane-editor .cm-scroller` — an extent CodeMirror may not have measured yet, on an
  element that is the scroller only while the editor is the height-constrained box.
  `EditorHandle.revealTail()` hands both questions to CodeMirror, which measures its own document
  and walks the real scrollable ancestors. Measured behavior is unchanged on both engines reachable
  here (worst gap between the document's end and the visible box across the whole phone tour: 0px
  on Chromium at 390px, 53px on real WebKit at an iPhone box — the same before and after), so this
  removes a fragility rather than a visible defect. It also wires up a path that had no follow at all: the
  desktop `set`, which `runner.ts` reaches for an `instant` beat, the `still` motion tier, an insert
  over ~1600 characters, or a prefix reset. No shipped tour takes that path, so it cannot be
  driven end to end; the typing channel is now a module of its own (`demo-typing.ts`) whose wiring is
  unit-tested on both channels, and the mutant that is the old state dies to that test.
