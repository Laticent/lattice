---
status: in-progress
summary: >
  A second audit of Compose point and click, driven on the real Studio with a 14-slide deck holding every notation. Most of
  it is done: pills, sparks, avatars, icons, checks, plugin kinds, math, HTML blocks, images, notes, code, tables and the
  register gutter all open a panel, and only 16 of 2,991 shipped slides still lock (all Motion scenes). Three gaps remained
  that were small and untracked; this change closes them. Links get a panel (the selection bar, a click, Insert → Link), a
  checklist chip opens the six answers instead of a lossy two-way toggle, and Insert adds Check and installed-plugin kinds.
  Chart data, flowchart spans and diagram bodies stay typed, each already planned elsewhere.
---

# Compose: links, the six answers, and the last Insert doors (2026-10-29)

Status: built and driven on the real Studio (§5). Parent: `2026-10-21-compose-point-and-click.md`, whose §7 list this
continues.

## 1. The audit

The owner asked whether anything an author can put on a slide still needs typing in Compose. A probe deck held one of
each notation; the probe listed every control Compose drew on each slide and clicked what had none. Desktop Chromium,
light mode, the built site.

| Surface | Before this change | After |
|---|---|---|
| Pill, spark, avatar, icon, `@check`, plugin kind | panel | unchanged |
| Inline math, `$$` block, HTML block | panel | unchanged |
| Image, background | panel and Library picker | unchanged |
| `say` / `describe` / `note` | panel | unchanged |
| Code fence language and `@code{…}` options | chip and panel | unchanged |
| Table | bar controls | unchanged |
| Heading, eyebrow, subtitle, insight | the register gutter | unchanged |
| **Link** | nothing: a click did nothing, and the selection bar held only Bold, Italic and Code | panel (§2) |
| **Checklist chip** `- [!] x` | a click flipped `[ ]` and `[x]`, and turned any other answer into `[x]` | the six answers (§3) |
| **Insert: Check, plugin kinds** | editable once typed, not insertable | Insert items (§4) |
| Chart row record `` `{4.2}` `` | code | unchanged (§6) |
| Flowchart span `` `Start:pill:c2` `` | code | unchanged (§6) |
| Mermaid and plot bodies | text under a language chip | unchanged (§6) |

**Locks.** `hasLossyConstruct` over `examples/` and `test/integration/baseline-decks/`: 16 of 2,991 slides lock, all `scene`
slides holding block HTML inside a list. The 2026-10-21 count was 96.

## 2. Links

The write half is `docs/src/lib/compose/link-commands.ts` and the panel is `LinkPanel.tsx` (lazy, like the object editor).

- **Three doors, one panel.** The selection bar's Link button and Insert → Link open the panel with the address field
  focused. A click on a link opens it showing the address and leaves the caret where the click put it, so the words stay
  editable in the line. ComposeView maps the panel's range through every change, and closes it when the caret leaves the link
  while focus is outside the panel.
- **No ⌘K.** ⌘K opens the Studio's command palette everywhere, Compose included. A link shortcut would take that away while
  typing, so there is none.
- **The address is normalized, never trusted.** `normalizeHref` allows `http`, `https`, `mailto`, `tel`, relative paths and
  `#anchors`, and refuses any other scheme (markdown-it draws `javascript:` and `data:` links as text) and a control
  character. It adds the scheme an author leaves off: `mailto:` to a bare email, `https://` to a bare host (`example.com/x`),
  and `http://` or `https://` to a host with a port (`localhost:3000`). Only a host counts as one (`localhost`, a dotted name
  or a bracketed IPv6 address), so `javascript:1/…` is a scheme and is refused. The address is then written as markdown-it's
  own `normalizeLink` would write it, with parentheses also encoded because the serializer writes the destination bare, so the
  next parse reads back the same bytes (`é` → `%C3%A9`, `50%off` → `50%25off`), and markdown-it's `validateLink` has the last
  word. A refusal is shown under the field and nothing is written. Done on an unchanged address only closes the panel: an
  address the deck already holds is never re-judged.
- **Insert → Link with nothing selected** writes the word `link`, selected in the text, and opens the panel on it with focus in
  the address field. The word is not a link until an address is given, so Escape leaves a plain word to type over or delete.
  With a selection, the selection becomes the link.
- **Open** is offered only for a web or mail address, in a new tab with `noopener`. A relative path would resolve against
  the Studio.
- A locked slide's links open nothing; a fence holds no marks.

## 3. The six answers on a checklist chip

The chip's click handler (`stateMarkerPlugin`) used to write `[ ]` for `[x]` and `[x]` for anything else. On a checklist
that uses all six answers, one click on `[!]` (no) turned it into a yes with no warning. The click now opens `MarkerPicker`,
the six from the check registry in its order, using the same list as the table's Cell state picker (`table-controls.tsx`
`MARKERS`), so the two surfaces cannot disagree. A pick goes through `setListMarker`, which re-reads the marker at write time
and refuses if it has moved; a refusal is said in the status pill. It replaces only the three marker bytes, in one undo step.
Any document change closes the picker, and a chip on a locked slide opens nothing.

**The cost:** done ↔ open is now two clicks instead of one. Taken because the one-click form destroyed four of the six
answers, and every other object in Compose opens a panel on a click.

## 4. Insert: Check and plugin kinds

- **Check** writes `@check{pass}` at the caret, and a short selected word becomes its label. The check's own panel then
  opens, as the pill's does. Shown only when the kernels carry the checks plugin.
- **A selection the item cannot use stays.** Check (over a long selection) and a plugin's kind (which takes no label) go in
  after the selection, set off by a space, as the avatar already did; the avatar now gets the same space.
- **Each installed plugin's kind** with a slot gets an item, "From the <plugin> plugin". `pluginStarter` builds the first
  record from the slot's positional values: a text gets the kind's title, a choice its first word, a number 1. It offers the
  record only if the kind reads it back. A kind whose positional values have no obvious first value stays in the list,
  disabled, and says to type it in Markdown.
- **Link** (§2).

At 390 px the menu is now taller than the screen. It already scrolls (`max-h` from Radix's available height), so the last
items are a scroll away; the menu was measured at that width in light and dark.

## 5. Verification

- Unit: `link-commands.test.ts` (15), `marker-commands.test.ts` (3), `InsertControls.test.tsx` (20, three new). The whole
  `src/lib/compose` and `src/components/studio` suite passes.
- Real Studio, Playwright: `e2e/compose-links.spec.ts` (new: the selection bar, a click, a refusal, Insert → Link,
  Insert → Check) and `e2e/compose-checklist.spec.ts` (the toggle test rewritten for the picker, byte-for-byte against the
  saved deck). Desktop, mobile (390 px), WebKit tablet and Gecko all pass. The Insert, state-marker, check, plugin-kind,
  pill, image, math/HTML, stress and Filo Compose specs pass on desktop. One pill keyboard test failed once under load and
  passed three times alone.
- Looked at: the picker, the panel, a refusal and the Insert menu at 1440, 820 and 390 px, light and dark.
- **Not verified:** a real iPad or phone. The selection bar does not show on a touch screen (the OS menu owns
  formatting), so on touch a link is added through Insert → Link; that path ran only under Playwright's emulation.

## 5b. Independent review, and what it changed

A checker read the first commit and confirmed eight findings. Fixed in the second commit: `javascript:1/…` and `data:1,x`
slipped past the port test; an address with `'` (`Ender's_Game`) was refused, so Done failed on an unchanged link; Check
and a plugin kind deleted a selection they could not use; `localhost:3000`, `user@example.com` and `example.com.` were
written as broken links; `é`, `%` and `[` re-encoded on the next parse; and the marker picker opened on a locked slide with
every pick refused silently. Each has a unit test.

## 6. Still typed, and where each is planned

| Gap | Reach | Where it is planned |
|---|---|---|
| Chart row data `` `{4.2}` `` | about 880 chart slides | `2026-10-14-chart-authoring-uniform-model.md` §10 phase 3 (the editor) |
| Flowchart shape and line spans | every flowchart slide | `followups.d/2385-p3-compose-inline-code-popup.md` |
| Mermaid diagram bodies | diagram slides | `followups.d/2649-p1-compose-inline-notation-editors.md` phase 5 |
| Scene slides lock | 16 slides | block HTML inside a list; `2026-10-21-compose-point-and-click.md` §7 |

## 7. Decisions taken on the reversible side

1. A chip click opens the picker rather than toggling (§3). Undo: restore the toggle in `stateMarkerPlugin` (it is still the
   fallback when no picker host is passed).
2. No link shortcut (§2).
3. Insert → Link writes a placeholder word rather than asking for the text in the panel. One field instead of two; the word
   is selected in the text, so after the address the author double-clicks it, or types over it, to change it.
