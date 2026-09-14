---
status: shipped
summary: >
  A tour's caption is not the only thing covering the bottom of a phone screen — the software
  keyboard is in front of it. Every number #2209 shipped is in the LAYOUT viewport, which iOS
  does not shrink for the keyboard, so `tourChromeOverlap` cleared the caption's band and left
  the reveal behind the keyboard anyway. The fix is one line in the consumer: clear whichever
  obstruction reaches higher. The half of the filed gap that said the markdown editor "reserves
  nothing" did not survive measurement — `scrollPastEnd()` already reserves a full pane height,
  which is more than any keyboard takes, so the reserve ComposeView added by hand was never
  missing there.
---

# The keyboard is the other occluder

`engineering/decisions/2026-09-14-tour-caption-is-an-occluder.md` (#2209) closed its own record
by filing one gap in two parts. This note closes the first part, and retires the second, which
was wrong.

## 1. The frame, which was the real defect

`--vt-chrome-top` / `--vt-chrome-bottom` are measured against `window.innerHeight`
(`stage.ts` `chromeInset`), and the host recovers the band's top as `innerHeight - inset` — the
contract the README publishes. That frame is the LAYOUT viewport.

iOS does not shrink the layout viewport when the software keyboard comes up. It shrinks the
VISUAL viewport, and leaves the layout one exactly as it was. Two things follow, and the second
is the one that bites:

- The caption, seated against the window's bottom edge, is itself partly or wholly behind the
  keyboard.
- `innerHeight - inset` therefore names a line the viewer cannot see, and a reveal that stops
  there stops behind the keyboard — having done all the work of clearing a caption that was
  never the binding obstruction.

`tourChromeOverlap` now takes whichever obstruction reaches higher:

```ts
const chromeTop = Math.min(window.innerHeight - inset, visibleBottom());
```

where `visibleBottom()` is `visualViewport.offsetTop + visualViewport.height`, clamped to the
window and falling back to `innerHeight` when the API is absent. `offsetTop` is load-bearing and
not a detail: it is the visual viewport sliding down the layout one as the page scrolls under the
keyboard, and a `resize` listener alone never reports it — the same reason `use-visual-viewport.ts`
listens to both events.

**The publisher did not move, deliberately.** Changing what frame `--vt-chrome-*` reports in would
break every consumer at once, including two e2e oracles and any host outside this repo, and the
README documents the window frame as the contract. The keyboard is also not the stage's business:
it has no way to know whether a host's surface takes text input at all. So this is a CONSUMER-side
correction, and the README gains the three-line recipe rather than a new pair of properties.

## 2. The half that did not survive measurement

The filed gap also said the markdown editor "has no software-keyboard inset at all", with
`ComposeView`'s hand-added `padding-bottom: calc(... + var(--cs-kb-inset, 0px))` as the precedent
it was missing. Both halves of that turned out to be wrong, and the second one is why the first
does not matter.

`Editor.tsx` runs CodeMirror with `scrollPastEnd()`. Read in the installed build, that extension
is a `ViewPlugin` that sets, as an INLINE style on `.cm-content`:

```js
let height = view.viewState.editorHeight - view.defaultLineHeight - view.documentPadding.top - 0.5;
this.attrs = { style: `padding-bottom: ${height}px` };
```

So the markdown editor already reserves one full pane height, minus a line, of scroll extent below
the last line. On the surfaces this swimlane measures — a 741px editor pane on Chromium at 390x844,
556px on real WebKit at an iPhone box — that is 500-700px of give against a software keyboard that
takes roughly 300-340px. The reserve ComposeView had to add by hand was never absent here; it
arrives by a different mechanism, which is exactly what the `scrollPastEnd()` comment in
`Editor.tsx` already said it was for (#1290).

Two consequences worth keeping:

- **Copying Compose's precedent would not have worked anyway.** `scrollPastEnd` writes that padding
  as an inline style through `contentAttributes`, and an inline style beats any
  `EditorView.theme({'.cm-content': …})` rule. A padding-bottom added the Compose way would have
  been silently overridden — green tests, no behavior, and a PR body claiming a reserve that was
  not there.
- **ProseMirror has no `scrollPastEnd`**, which is why Compose needed the hand-rolled reserve and
  the markdown editor does not. The asymmetry is in the editor libraries, not in the two surfaces'
  requirements.

## 3. What is verified, and what is not

- **The arithmetic**: six new unit arms in `docs/src/components/studio/tour-chrome.test.ts`, with a
  `visualViewport` stub the suite did not have before (jsdom ships none, which is itself the
  no-keyboard path every pre-existing arm runs on). Two mutants were driven: reverting `chromeTop`
  to the layout-only expression kills exactly the two keyboard arms and leaves the other 21 green;
  dropping the overscroll clamp kills exactly the overscroll arm.
- **The `scrollPastEnd` reserve**: read out of the installed `@codemirror/view` build, quoted above.
  That is a source reading, not a device measurement.
- **UNVERIFIED: real iOS Safari on a device.** Unchanged from #2209, and this note does not claim
  otherwise. Headless Chromium and headless WebKit have no software keyboard, so `visualViewport`
  there reports `innerHeight` and the new branch is never taken — which is precisely why it is safe
  to land, and precisely why landing it does not settle ATTRIBUTION. The e2e samplers in
  `demo-mobile.spec.ts` were moved into the same frame so they remain a ruler for the helper, but
  on a headless engine that move is a no-op by construction.
- **What would settle it**: one run of `demo-mobile.spec.ts`'s tail arm on a real iPhone with the
  keyboard up.
