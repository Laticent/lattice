---
status: shipped
summary: >
  The Playground's editor, preview and slide map now share one Fuoco hub (lib/playground-sync.ts).
  Scrolling the preview marks and shows that slide in the editor and leaves the caret parked; the next key
  brings the preview back to it. A click on a slide puts the caret at the end of its title and frames the
  slide, `---` fences included. Fuoco gains lines, columns and the host's section words (place.ts). The
  regex scanner `caretSlideIndex` and its 140 ms timer are deleted; the preview iframe and the editor
  scroller get the thin, palette-quiet scrollbar the page already had.
---

# The Playground's one focus (2026-10-21)

## 1. The symptom

The owner, on the Playground: the preview scrollbar is unstyled; scrolling the preview does not
highlight the slide in the editor; the caret should keep its line and column, or be remembered, so an
arrow key returns to it; a click on the highlighted slide should land where it was clicked; a click on a
slide in the preview should put the caret at the end of its title with the slide, `---` included, in
full view; and Fuoco should know lines and sections, not only offsets.

## 2. Cause

The Playground answered "which slide is the reader on" twice, and the answers never met.

- **Caret to preview** ran through `onCaret`, a 140 ms timer and `caretSlideIndex`
  (`playground-controller.ts`), a regex scanner that matched the caret line's words against the
  preview's own text. `engineering/gotchas/studio-playground.md` says not to write one; the Studio
  dropped its copy in #2704 and `followups.d/2704-p4-playground-scanner.md` recorded this one.
- **Preview to map** ran through a Fuoco hub that lived inside `PlaygroundMap.tsx`, was fed the
  rendered text, and only existed once the map was opened. The editor never heard it.

So a scroll moved the map and nothing else, and with the map closed it moved nothing. The scrollbar
was a separate defect: the page's thin tinted scrollbar (`native-widgets.css`) sits on `:root`, and the
preview is its own document and the editor its own scroller, so both painted the browser default.

## 3. Decisions

Chosen with the owner on 2026-10-21, each against the alternative it beat.

| Question | Chosen | Beaten by it |
|---|---|---|
| What does a preview scroll do to the caret? | **Park it.** The editor shows and marks the viewed slide; caret and selection stay. | Move the caret and remember the old one: loses the selection on every scroll, adds a stored position to keep consistent, and each programmatic caret move can echo into the preview. |
| How far does the wiring go? | **One shared hub; delete the scanner.** | Subscribe the editor to the map's hub and keep the scanner: two paths that can still disagree. |
| What marks the slide? | **A wash over its lines plus a bar in the gutter**, `---` fences included. | A gutter bar alone: it does not show where the slide's text ends, which is what must be on screen. |

**Why parking needs no stored caret.** CodeMirror already holds the caret and selection. The hub
learns of them again on the next caret report. If that report names a different slide than the one
the preview is on, the hub publishes it and the preview and band follow. An arrow key does exactly
that, and CodeMirror scrolls its own caret into view on the key, so "go back to where I was" costs no
state and no extra scroll code.

## 4. What shipped

`docs/src/lib/playground-sync.ts` holds the rules; `PlaygroundApp.tsx` wires its ports. Origins say
who moved, and the editor never reacts to itself nor the preview to itself:

| Event | Hub call | Editor | Preview |
|---|---|---|---|
| Caret moves or text is typed | `report('editor')` | band follows | follows the slide, gently (a slide already 60% in view stays) |
| Preview scrolls | `reportUnit('preview')` | scrolls to and marks the slide, **caret untouched** | none |
| Click on a slide in the preview | `go('preview-pick')` | caret to the end of the title, slide framed, keyboard focus on a mouse pick | none |
| Click on a map tile | `go('rail')` | as a preview click | scrolls to the slide |

- **The frame the editor shows** is `deckFrame` (`deck-outline.ts`): the part's lines plus the `---`
  that opens and closes it (slide 1 opens on the front matter's closing fence). A page inside a
  heading-split slide has no separator of its own, so its frame is its text. When the frame fits the
  editor it is centered (a pick) or nudged into view (a scroll); when it does not, its start is put at
  the top so the opening `---` and the title are what is on screen.
- **The caret lands** at `deckTitleEnd`: the end of the first content line, past any directive comment.
- **Click in the band** needs no code: the band is line decorations, which are paint and never a hit
  target, so a click lands where it was made.
- **Touch** picks do not take keyboard focus (it raises the software keyboard), and a pick does
  nothing where the editor is not on screen (a phone shows one pane at a time).
- **Scrollbars:** `.cm-scroller` and the frame's `html` carry `scrollbar-width: thin` and a
  `scrollbar-color` wash. The frame's is opt-in (`scrollbar` in `docStyleText`), switched on only by
  `renderDeck`, so a frame built for export is byte-identical to before. `::-webkit-scrollbar` stays
  unused, for the reason `native-widgets.css` gives.

## 5. Fuoco: lines, columns and sections

`docs/src/lib/fuoco/place.ts` (generic, zero imports beyond the outline):

- `lineAt(outline, offset)`, `offsetAt(outline, line, col)`, `lineEnd`, `lineCount`: 1-based lines,
  0-based columns, over a line table built lazily once per outline snapshot.
- `placeAt(outline, offset)`: line, column, unit, part, flat and the host's section words.
- `extentOf` and `rangeOf(outline, unit, part)`: offsets and lines, with `toLine` the last line that
  holds text.
- `Outline.kinds` names the two levels. A deck says `{ unit: 'slide', part: 'page' }`
  (`DECK_KINDS`); `createTextOutliner({ kinds })` takes the host's own ("chapter", "paragraph").
- `hub.place()` answers "where is the focus" in those words.

## 6. Two texts, one rule

The hub holds the editor's live text; the rendered index describes the text last rendered, which trails
typing by a debounce. **A flat slide number means the same in both only when the two texts are equal**, so
the sync uses the index only when `index source === hub text`; otherwise the move waits and the render
that lands asks again. A full srcdoc write waits for `onFrameLoad` before anything scrolls, because until
then the frame still holds the outgoing document.

**Outside Edit the render is the text of record.** Explore can show a component's gallery or a plan step,
which the editor does not hold. There the sync feeds the hub the rendered source, ignores editor edits, and
does not touch the editor at all: its offsets would be the gallery's, not the editor's. Returning to Edit
feeds the editor's text back. An early version revealed into the hidden editor from Explore and took
keyboard focus off the map rail (`playground-map.spec.ts`, Home and End on the rail); the guard is the fix
and `playground-sync.test.ts` pins it.

## 7. Evidence

- `docs/e2e/playground-focus-sync.spec.ts` drives the real Playground: scroll marks and shows the slide
  with the caret unchanged; an arrow key returns the band and the preview; a click on a slide puts the
  caret at the end of `# Slide 6 title` with the band on screen and typing lands there; a click in the
  band lands at the click; both scrollers carry a non-default scrollbar. Run on Chromium, Firefox and
  WebKit (iPad-landscape), five of five on each.
- `playground-sync.test.ts` (12 cases) runs the rules against fake ports; `place.test.ts` and
  `deck-frame.test.ts` cover the Fuoco additions.
- `caretSlideIndex` had 70 lines of tests; the cases it covered (fences, setext headings, heading
  splits) are the deck outliner's, which `deck-outline.test.ts` holds to the engine on every committed deck.

## 8. Not done here

- **Preview element addresses** (click a rendered element to select its source span): still
  `followups.d/2704-p5-preview-element-addresses.md`. A click selects the slide's title, not an element.
- **Touch picks** reach the editor but are not exercised by a touch e2e.
- **Compose** (the Studio's second editor) is untouched; this note is the Playground only.
