---
status: shipped
summary: One screen recording of the Studio chat on a phone produced six reports. A reply in progress showed a dead caret on every turn after the first, because the dots showed only while the reply was empty. Tables printed raw pipes and numbered lists read "1. 1. 1." because the renderer closed a list on every blank line. The model could only be changed in Workspace, and the header showed two unlabeled numbers. Plugin fences and slides printed as source. Photos could not be attached. Each is fixed and verified in a real browser at 390, 820 and 1440 px, and the figure strategy was chosen by a measured bake-off.
companion:
  - ./2026-10-12-chat-figures-bakeoff.md
  - ./2026-10-12-library-media-assets.md
  - ./2026-10-05-studio-chat-agent.md
---

# Studio chat polish (2026-10-13)

**Surfaces:** `docs/src/components/studio/ArchitectChat.tsx`, `ChatLiveStatus.tsx`, `ChatCost.tsx`,
`ModelPicker.tsx`, `ChatFigure.tsx`, `ChatPhotos.tsx`, `chat-markdown.ts`, `chat-figures.ts`,
`chat-photos.ts`, `chat-photo-parts.ts`, `chat-agent.ts`, `ai/architect-model.js`.

## 1. What the author reported

From a screen recording and five screenshots of the chat on a phone:

> there is still some jank in the chat in the studio. we don't always have feedback something is
> happening. the first time you get the moving three dots, but subsequent chats seem to simply have a
> caret that does nothing. [...] there is no support for markdown table rendering and sometimes
> ordered lists render as having the same number (1). we can't upload device native files like
> photos, videos, etc. we don't support rendering of lattice slides. we don't support rendering of
> plugins we support (ie mermaid, math, function plot, etc). [...] our plugins should work outside
> the deck [...] we don't support the ability to change the selected model (we need to clean up cost
> disclosure and model selection being a drop down next to cost information).

## 2. Root causes

| Report | Cause | Where |
|---|---|---|
| Dead caret after the first turn | The bouncing dots rendered only while the reply was empty (`live === ''`). A later turn opens with prose ("I'll read the slides…"), which hid the dots for good, and the tool round that followed showed a 2 px pulsing bar. The only other signal, a tool's label, was set when the tool *ran*, never cleared, and missing for the long stretch where a whole slide streams inside a tool call. | `ArchitectChat.tsx`, `chat-agent.ts` |
| `1. 1. 1.` | `renderProse` flushed its list on every blank line, so a loose numbered list became one single-item `<ol>` per item. | `chat-markdown.ts` |
| No tables | The renderer had no table rule. | `chat-markdown.ts` |
| Model change | `ModelPicker` lived only in Workspace → AI. The header carried "≈ $0.018–0.024" and "$6.08 session" with no labels. | `ChatCost.tsx`, `ModelPicker.tsx` |
| Fences print as source | `ChatCodeBlock` is the only fence renderer. No function takes a language and a source and returns a drawn figure: every plugin draws through the engine and the runtime in an iframe. | see the bake-off |
| No photos | The paperclip took text, Markdown and PDF only, and the message type has no image part. | `reference-doc-ui.tsx`, `reference-doc.ts` |

## 3. What shipped

**Status line.** One line under the Architect's text, present from send to commit, always naming the
phase: "Thinking…" (each round opens with it, so the gap between a finished tool and the next token is
no longer silent), "Writing…", "Reading slides…", "Drafting the edit…". The transport reports a tool
call the moment its *name* streams in (`onToolStart`), long before its arguments finish. A turn silent
past 15 s says "still working". The bouncing dots and the pulsing bar are gone.

**Markdown.** One list per run of items (with the real start number, nesting by indent, and indented
paragraphs kept in their item); tables with alignment, inline formatting and horizontal scroll inside a
wrapper (the transcript never scrolls sideways); blockquotes; rules; styled chat headings.

**Header.** One chip naming the model, with a dropdown, and one session figure. The dropdown holds the
price of a question and of an edit, the session against its cap, and the same model picker as Workspace
(`ModelPicker` split into `useModelCatalog` and `ModelList`, one picker). The catalog loads when the
dropdown first opens.

**Figures.** A reply's `mermaid`, `math`, `functionplot` and `lattice` fences are drawn in the bubble
by a pool of frames the chat owns, in the open deck's theme, with a Source toggle. The strategy and its
numbers are in `2026-10-12-chat-figures-bakeoff.md`. `PreviewPool` gained a `baseSlots` floor (default
unchanged).

**Photos.** The paperclip's "Add a photo…" opens the device's own picker (no `capture` attribute), and a
pasted image is taken too. A photo goes through the Library's intake (`importImage`: EXIF and GPS
removed, capped at 2560 px) to **this deck's shelf**, shows as a thumbnail, and travels to the model as
an image part on the turn it is attached, downscaled to 1568 px, with a note naming it `asset:<name>`
so the model can write `![](asset:<name>)` on a slide. The thread stores the reference, never the bytes.
An earlier turn's photos are named in its text but not re-sent, because each image is billed as input
every time it travels. A model the catalog lists as text-only refuses the photo before anything is sent;
one it does not list answers for itself, and a rejection reads "pick one marked vision".

### Decisions that were mine to make, and the one that was not

- **A photo is a deck-scoped Library asset, not a shared one.** It stays usable as `asset:<name>` in
  this deck, it does not clutter the shared Library, and "This deck → All decks" in the Library moves it.
  Reversible by one scope flag.
- **The pool's floor is 4, not 10.** The cap still grows to cover what is on screen.
- **The rendering strategy was not chosen on judgment.** The author asked for a measured comparison and
  got one.

## 4. How it was verified

Real Chromium against the production build, with a scripted OpenRouter (HARD RULE #24: no key, no spend),
at 390, 820 and 1440 px: `docs/e2e/chat-polish.spec.ts` (status line, table, list numbering, model
switch), `chat-figures.spec.ts` (fourteen fences, three drawn, frames bounded by what is visible),
`chat-photos.spec.ts` (a real PNG through the file chooser, a decoded thumbnail, the request body the
model receives, and the text-only refusal). Unit tests cover the renderer, the sample builder, the photo
helpers and the status labels. The suite's own screenshots were read, and they caught two defects the
assertions did not: a locator that matched the missing-photo placeholder instead of the picture, and the
browser's default `<figure>` margin insetting every figure.

## 5. What this does not claim

- **Not verified on iOS Safari or a physical phone** (HARD RULE #23). Everything above is Chromium at a
  phone *width*, not a phone. The native picker (Photo Library, Take Photo) is the browser's own and was
  driven through Playwright's file chooser, which stands in for the choice, not for the picker. The pool's
  WebKit behavior is the reason it exists and is not measured here.
- **Video is not attached.** The Library's video slice is not built, and most models cannot read video.
- **The status line was verified at the DOM, not by eye over time.** A fulfilled mock cannot stream, so
  the phases are held open with delays; their real cadence on a live model is unmeasured.
- **A bare `math` fence is not centered** (its layout reserves a legend column); see the bake-off note.
- **The streaming bubble hands off to the committed message with one re-point** of a figure's frame.

## 6. Open

- A phone check of the native photo picker, the pool and the status line on a real device.
- Video, when the Library's video slice lands.
- Dropping a photo onto the composer (paste and the picker are in; drag is not).
