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

**Video.** The same door takes one clip of at most 15 seconds and 15 MB, to a model whose catalog entry lists video input (`ORModel.video`; absent on an older cached catalog means unknown and allowed, and a model's own refusal is turned into the same advice). It is read once, measured (a header with no length is found by seeking past the end), refused in words when over a cap, shown as a poster with its length, and sent inline as a `video_url` part, priced flat at 4,500 tokens by the budget gate. One per message.

**Photos.** The paperclip's "Add a photo…" opens the device's own picker (no `capture` attribute), and a
pasted image is taken too. A photo goes through the Library's intake (`importImage`: EXIF and GPS
removed, capped at 2560 px) to **this deck's shelf**, shows as a thumbnail, and travels to the model as
an image part on the turn it is attached, downscaled to 1568 px, with a note naming it `asset:<name>`
so the model can write `![](asset:<name>)` on a slide. The thread stores the reference, never the bytes.
An earlier turn's photos are named in its text but not re-sent, because each image is billed as input
every time it travels. A model the catalog lists as text-only refuses the photo before anything is sent;
one it does not list answers for itself, and a rejection reads "pick one marked vision".

### Decisions that were mine to make, and the one that was not

- **A photo is a deck-scoped Library asset, not a shared one** (confirmed as the default by the author, 2026-10-13). It stays usable as `asset:<name>` in
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

## 4b. What the independent checker found (and what changed)

A checker pass over the diff found a blocker the author's own tests missed: a list line ending in CR,
CRLF, U+2028 or U+2029 matched the list test but not the item pattern, so the list loop never advanced
and the tab froze (a model that emits CRLF triggers it, and the saved reply re-froze every reopen).
Line endings are now normalized at both entry points and the loop cannot stay on a line. Also fixed:
unbounded quote nesting overflowed the stack (now capped at 8, rendered as text beyond); pending photos
carried across a deck switch (now reset, and an add finishing after a switch is dropped); an earlier
turn's note told the model a photo was "shown below" when it was not re-sent; overlapping photo adds
saved more than the limit (one add at a time); the one-shot fallback's budget left out photos; the
header lost its over-cap color; and three test assertions that could not fail were tightened or
reworded. Not fixed, and not new: the `§N§` placeholder in `inline()` and its quadratic link pattern
(both pre-existing).

## 4c. The second checker pass (video, math, harness)

Found and fixed: `math feature` with no legend ignored every alignment modifier (its stage rule outranks the
modifier's flex promotion, and bare `math` only worked by source order); held video bytes were never
released and a post-reload name could collide with a persisted turn's clip (now bounded to two clips, with
random name suffixes and release on remove and deck switch); a 15.0x-second phone clip was refused with
"15 seconds" (half a second of slack, one-decimal messages); the attach guard was taken after an `await`
(now before the first); poster height is capped. Not changed: a mixed photo-and-video pick drops the lot
when one part is refused (minor), and the one-shot fallback re-sends a refused clip once.

## 4d. Attaching to a message: two paths, two controls (2026-10-13)

The paperclip used to open one popover that mixed three ideas: a search box over saved docs, an "Add a photo or video…" row
that opened the phone's own sheet on top of it, and an "Add a file…" row. A tester on an iPhone called it janky. It is now
two paths and two controls in the composer (`ChatAttach.tsx`):

- **The paperclip: from this device.** One tap and the browser's own picker is open; there is no menu of ours in between.
  The paperclip IS a file input (invisible, over the icon, `multiple`), so on a phone its native sheet offers Photo Library,
  Take Photo or Video and Choose Files, and on a computer the OS file dialog opens. Each file goes where its type says: a photo
  or clip through the media path (saved to the Library, attached to this message), a `.pdf`, `.md` or `.txt` as a
  reference document.
- **The Library button: from your Library.** A popover with tabs for Photos, Videos and Files, with counts. Tapping an item
  attaches it at once and checks it, and a second tap takes it off, so what is attached is always visible and there is no
  "Attach" button to forget.

**Why two controls, and what was wrong with one.** The first version put both paths behind one paperclip menu and opened the
input with `click()` from the "From this device" row. On a real iPhone the native sheet then floated mid-screen, well above
the paperclip. Two screen recordings, one with the input `hidden` and one with it laid over the paperclip, show the sheet at
the **same position**, so its position follows the TAP that opened it, not the input's box. My first diagnosis (the hidden
input had no box to anchor to) was wrong, and the fix built on it changed nothing. A tap that lands on the input itself is the
pattern iOS anchors correctly, and it takes our menu out of the device path altogether. **That is a reading of two recordings
and a known pattern, not something Chromium can show: whether the sheet now opens at the paperclip is checked on a phone.**

What an attachment is: a photo or clip belongs to **this message** (a message carries 4 photos and 1 clip); a file is a
reference document that **grounds every reply** until it is removed, billed each run. A Library photo is already a Library
asset, so nothing is imported. A Library clip is checked against the same 15 MB and 15 s limits as one from the device and
refused in words, in the list, when it is over. Taking a clip **from the device** off the message deletes it (it was saved
only for this message); taking one **from the Library** off leaves it there. The same media gate applies to both paths: a
cloud model that can see, and a catalog entry that does not say otherwise.

Gone: the search box in the chat (the Library's own search is the place to find things), the "Add a file…" row, and the
"Stored in your browser · never uploaded" line, which was true of documents and read as a claim about photos and clips,
which are sent to the model. Fabricate keeps its documents-only paperclip: it takes nothing else, so the old list is
coherent there. `useReferenceDoc` serves both and returns the state the chat needs (`saved`, `toggleSaved`, `addFiles`).

**Layout, and a second report from the phone (2026-10-14).** With the two controls in the one-row composer, a 390 px phone
gave the text field about 215 px: five buttons shared its line, and the Library button sat 2 px from the paperclip. The tester
reported two things: the field lost width, and a tap on the Library button opened the native sheet too. I could not reproduce
the second in Chromium (no WebKit here). Two causes are plausible and both are cheap to remove: iOS moves a tap toward the
nearest clickable thing (so a 28 px target 2 px from an invisible file input can hand its tap to the input), and a file input
can paint its inner button past its own box. So the two attach buttons are now 32 px with 8 px between them, the paperclip's
wrapper clips the input to its box (`overflow-hidden`), and the Library button sits above it (`z-10`). The composer is now
the field on its own full-width line with the controls on a bar beneath it (`CHAT_COMPOSER_STACK` / `_BAR` in
`panel-shells.tsx`, shared with the `ChatShell` skeleton so the skeleton is the same height): the field is 352 px on a 390 px
phone, and 161 px in the docked desktop column, where the old row wrapped its buttons to a second line anyway. The Live
panel keeps its one-row composer. **Unverified: on a real iPhone, that a Library tap no longer opens the native sheet.** The
spec checks the geometry and the hit test in Chromium; it cannot show iOS's tap adjustment.

**Light and dark disagreed (2026-10-14).** In light mode the composer's text field blended into the composer's border; in
dark mode it showed a faint filled box inside it. Cause: the shadcn `Textarea` ships `dark:bg-input/30`, and a consumer's plain
`bg-transparent` does not beat a `dark:` variant (tailwind-merge keeps both), so only dark mode filled. It is not site-wide: the
other transparent fields in the Studio are raw `<input>`s, not the primitive, and the two that use it (the Architect chat and
the Live panel) share the field classes in `panel-shells.tsx`, which now carry `dark:bg-transparent`. The primitives keep
their dark fill for the places that want it. The composer is one bordered box (`px-3 py-2.5`) with a bare field inside, in
both modes; a spec reads the field's computed background in each mode and fails without the fix.

**A model that said it could not see the clip (2026-10-14).** The tester sent an iPhone clip to Google Gemini Pro Latest,
which has `video` in its catalog `input_modalities`, and it answered that it only saw that a video file was attached. No
error came back. The request does carry a `video_url` part, so the clip left the app. The likely cause is the type on the
data URL: an iPhone recording is QuickTime, the Library stores it as `video/quicktime`, and OpenRouter's video guide lists
`video/mp4`, `video/mpeg`, `video/mov` and `video/webm`. A part with an unlisted type is not rejected, it is dropped, which
is what the model described. `videoWireType` (`chat-photo-parts.ts`) now sends QuickTime as `video/mov`; the stored bytes
and type are unchanged, and `chat-clip-wire.test.ts` checks both and fails without the change. **This is a diagnosis from
the docs and the symptom, not a reproduction: whether Gemini now reads an iPhone clip is checked by sending one.** Every
earlier end-to-end spec sent a WebM clip, which is why none could have caught it. If it still fails, the next suspects are
the provider OpenRouter routed to and the clip's codec (iPhones record HEVC).

**The same clip, a second report (2026-10-14).** After the type change the same model still said it could not watch the
clip ("my tools only let me look at still images"), so the type was not the whole cause and may not have been one at all.
The second cause is ours: once a chat clip is a Library video, the Architect's prompt lists it as an asset, and
`view_asset` answered any video with "videos cannot be viewed". A model reading "a video you may not view" beside a clip
in the message reasonably says it cannot watch it, and the cost jump on that turn fits a tool round. The prompt now marks
the clip that rides the message (`ATTACHED TO THE AUTHOR'S MESSAGE: watch it there`), says `view_asset` shows photos only,
and `view_asset` answers for an attached clip "watch it in that message". The clip's name now travels with the clip
(`ChatOptions.videos[].name`) so the prompt can tell the two apart. Unit tests cover the manifest and the tool answer.
**Still unverified: that a model now describes the clip.** If it does not, the remaining suspects are the provider
OpenRouter routed to (AI Studio and Vertex both serve Gemini; OpenRouter's guide only promises base64 video, not which
provider honors it), the clip's size against a provider's inline limit, and its HEVC codec.

**Verified:** `docs/e2e/chat-photos.spec.ts` in real Chromium at 1440, 820 and 390 px: the composer has the two controls and
no menu; the paperclip is a real, tappable input (not `hidden`, not `pointer-events: none`) that accepts images, video and
`.pdf` and opens the browser's chooser in one tap; a `.md` and a photo picked together become a chip and a thumbnail; from the
Library, a photo, a clip and a file each attach by one tap and show a check; taking the clip off keeps it in the Library;
the popover stays clear of the screen edge. **Not verified: the iOS native sheet's position on a real iPhone after this
change.**

## 5. What this does not claim

- **The chat is not verified on a physical phone** (HARD RULE #23); the Library video shelf is, in part (see §6). The chat specs' 390 px cases (status line, table,
  list numbering, model switch, figures, photo) also pass on real WebKit with the iPhone 15 Pro profile
  (`webkit-phone`, WebKit 26): the engine the pool exists for, not the device. The native picker is the
  browser's own and was driven through Playwright's file chooser, which stands in for the choice, not for
  the picker. Video was not run on WebKit (it records WebM, which WebKit does not).
- **A chat clip is a Library video.** (Changed after the first version, which held the bytes in memory for one turn.) `addChatVideo` saves it to the open deck's shelf through `importVideo`, so it has a name, shows in Library → Videos, survives a reload, and Regenerate re-reads it from the shelf (`videoDataUrl`). The thread keeps only the name and length; the poster is read from the shelf, so thumbnails no longer share the browser's `localStorage` quota with deck sources (a thread saved before this change keeps its own poster). The chat's caps stay tighter than the Library's: 15 seconds and 15 MB, checked before anything is saved. A clip the author deletes from the Library is reported when Regenerate cannot find it. A slide cannot play it yet.
- **The status line was verified at the DOM, not by eye over time.** A fulfilled mock cannot stream, so
  the phases are held open with delays; their real cadence on a live model is unmeasured.
- **The streaming bubble hands off to the committed message with one re-point** of a figure's frame.

## 6. Open

- A phone check of the native photo picker, the pool and the status line on a real device.
- **Real-phone evidence for the Library video shelf (2026-10-13, from the PR's docs preview on an iPhone).** The author added a
  camera-roll clip through the Library's picker: 1080×1920, 9.0 s, 16.4 MB, named `img-4526`. The Videos tab read its poster,
  length, size and dimensions correctly, and the clip played in place with the browser's native controls. Two screenshots are in
  the PR conversation. This covers the importer, the probe and playback on a real device with a real phone clip. It does **not**
  cover the chat's attach path, a reload and Regenerate on the phone, a model reading the clip, or which codec or container
  the file was (not shown).
- **The chat's 15 MB cap is smaller than the 15-second cap it was meant to match.** That clip is about 1.8 MB a second, so a phone
  clip reaches 15 MB at roughly 8 seconds. One sample, one phone. The cap exists to keep the base64 request body near 20 MB,
  and it moves only after a real model has accepted a larger body; until then the refusal says so in words and does not
  promise "about 15 seconds" (`chat-photo-parts.ts`).
- Dropping a photo onto the composer (paste and the picker are in; drag is not).
- Math arm, checked 2026-10-13 on 4b0eef0 in the sandbox: `check:family-conformance` ran to the end without a Chrome drop. The `math` row fires at portrait, story and mobile and is not among the 39 differences from `test/oracle/family-conformance.json`, which are all other components. `overflow:check` found four decks that clip more than the baseline, none with a math slide (follow-up filed). Not confirmed: a nightly run after the merge.
