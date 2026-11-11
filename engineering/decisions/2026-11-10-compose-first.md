---
status: shipped
summary: >
  The Studio becomes Compose-first. Compose is the default way to write a deck, the Markdown editor is
  renamed Source everywhere and kept for power users, Compose comes before Source in every menu, and the
  pair keeps its words until the editor pane is too narrow to hold them. The audit found that Fix all and
  the issue count only worked in Source, and that the welcome tour and first lesson taught Markdown first.
---

# Compose-first Studio (2026-11-10)

The owner's ruling: the Studio has been built for technical people, and feedback says to put Compose
first. Compose becomes the default way to write a deck. The Markdown editor stays for power users, but it is
not the default, and it is called **Source**. Every menu lists Compose before Source, and the two only drop
to icons when the editor pane is too narrow to hold their words. The old Source tours and demos stay, but
the welcome path leads with Compose.

This note is the audit, the jank assessment and the plan, in that order.

## 1. Audit: where the two modes surface

`StudioShell.tsx` holds the mode as `editMode`, which always started at `'markdown'` and was never stored.

| Surface | Before | Problem |
|---|---|---|
| Editor pane header (tablet, desktop) | `EDIT` eyebrow, then a `Markdown · Compose` toggle at the far right | Source first; "Markdown" where the phone says "Source"; `EDIT` repeats what the toggle says and costs the width the words need |
| Phone action bar | `Source · Compose · Preview` | Source first |
| Desktop collapsed editor rail | vertical `EDIT` | names neither mode |
| Pre-paint skeleton (`StudioChromeSkeleton.tsx`) | lights `Markdown`, draws the CodeMirror skeleton | hard-codes the old default, so it would flash the wrong mode at hand-off |
| Refusal messages in the Compose object panels (`Use Edit as text.`, `Edit this slide in Markdown.`) | say "Edit" or "Markdown" | name a mode the UI no longer calls that |
| Welcome tour (`tours/welcome.ts`, `lines.ts`) | teaches dashes and `#` first, then "Prefer not to see the markup? Compose…" | Markdown is the lead, Compose the aside |
| First lesson, "Write a slide" (`lessons/basics.ts`) | "A deck is plain text… type three dashes" | assumes Source; in Compose, three dashes do not start a slide |
| `design/skills/studio.md` | toggle "Markdown" / "Compose", "Markdown editor" | old names, old order |
| Playground (`/playground/`) | `Explore · Edit` | a separate surface with no Compose; left alone (§5) |

### 1.1 Parity gaps: what only worked in Source

Making Compose the default puts every Source-only path on the default route, so each one was checked:

| Feature | In Compose before this change | Decision |
|---|---|---|
| **Fix all** (header button, Coach, ⌘K) | called `editorRef.current?.fixAll()`; the ref is null in Compose, so **the button did nothing** | fixed here: the fix runs on the deck text, so it works in either mode |
| **Issue count behind Fix all** | came from CodeMirror's lint pass only; in Compose it fell back to the unknown-component count, the mismatch the 2026-09-05 note in `StudioShell.tsx` records as a bug | fixed here: Compose lints the deck text too |
| Refine selection (AI) | read the CodeMirror selection only; hidden in Compose | fixed here: Compose offers it only for a selection of plain text inside one block, all in one style (no inline image, pill, math or line break, no bold word inside plain text), because the rewrite replaces it as one run of text and would otherwise drop those silently |
| Icon grid insert | copies the span to the clipboard with a note | already handled honestly. Unchanged |
| Format code blocks (⌘K) | CodeMirror only | power-user command. Unchanged |

## 2. Jank assessment (measured on the dev server, Chromium, before the change)

| Width | Editor pane | What a person sees |
|---|---|---|
| Desktop 1440 | 662 px | `EDIT … Reshape · Fix all · History · [Markdown · Compose] · Collapse`. Words fit. |
| Tablet 820 | 377 px | the toggle is two 12 px icons with no words, while `EDIT` still takes ~40 px on the left |
| Phone 390 | one pane | bar cells `Source · Compose`; Source first |

The labels hid below a fixed `@[34rem]` (544 px) container width, chosen for a row that also carried the
`EDIT` word. At 377 px the row has room for the two words once `EDIT` goes and the other buttons are icons
(measured in §4).

**Cold path.** `ComposeView` was lazy and off the startup path because it was not the default (the
2026-08-17 dynamic-loading audit, §9.4). Clicking Compose mounted it in about 0.9 to 1.1 s on the dev server.
On a phone, CodeMirror waited for the first slide (`holdEditor`), but `ComposeView` had no such hold, so a
Compose default would have put ProseMirror in front of the first slide on the slowest devices.

**Compose's slide bar** wraps to two rows below a 520 px pane on purpose (its comment records the
measurement: 320 px of controls against 266 px between the end caps at 390 px). It is reserved on every
slide so the page never moves. That is a deliberate shape, not jank, and it stays.

## 3. The plan

1. **Default and memory.** `editMode` is `'compose' | 'source'`, stored in the Studio settings as `editMode`
   and read at boot; a browser with nothing stored starts in Compose. Choosing Source is remembered, so a
   power user picks it once.
2. **The pre-paint shell follows the stored mode.** `studio.astro`'s seed sets `data-ssr-src` on `<html>` when Source is stored,
   and the shell lights that segment and draws that editor's skeleton, so nothing swaps at hand-off.
3. **The toggle is the pane's title.** `Compose · Source` replaces the `EDIT` eyebrow at the left of the
   header. The words stay until the pane is too narrow for them; the other header buttons drop their words first.
4. **Compose first everywhere**: the header toggle, the phone bar, the shell, the collapsed rail (which now
   names the mode), the ⌘K command list.
5. **"Source" everywhere the Markdown editor is named**: visible labels, tooltips and refusal messages.
   The accessible name `Markdown source` stays (it contains the visible word, so speech input still
   matches, and 35 e2e specs address it). "Edit as text", a button inside the object panels, is not
   the Source mode and keeps its name.
6. **Parity**: Fix all, the issue count and Refine work in Compose (§1.1).
7. **Cold path**: on a phone, `ComposeView` waits for the first slide the way CodeMirror did; the
   chunk of whichever mode is stored is warmed after the first slide.
8. **Tours and lessons lead with Compose.** The welcome tour's write beat points at Compose, and its old
   Compose beat now introduces Source. "Write a slide" teaches the Compose way to add a slide when Compose is
   on and keeps the Markdown lesson for Source. Reworded lines are re-recorded.

## 4. Result

**When the words drop.** A container-width breakpoint cannot say "keep the words while they fit",
because what else sits in the row moves the width they need. Measured on the dev server by sweeping
the editor pane's width in 20 px steps (Chromium):

| Row state | Words fit down to |
|---|---|
| Desktop, clean deck | 320 px |
| Tablet (adds Slide settings), clean deck | 360 px |
| Desktop, deck with issues | 420 px (400 px with the pill's word dropped) |
| Tablet, deck with issues | 420 px (400 px with the pill's word dropped) |

So the header MEASURES its own row (`use-row-fit.ts`): step 1 drops the issue pill's word, step 2 the
mode words, and the row takes the lowest step that fits. It runs before paint, so a row is never drawn
overflowing. The pre-paint shell cannot measure; it uses the tablet's clean-deck width, 360 px, which is what
the app shows at hand-off before the deck is linted (a desktop pane narrowed to 320-360 px gains its words a
moment after paint).

**Page bytes.** The Studio's static HTML has a ceiling (`docs/route-budget.json`, `htmlRaw`), and drawing both
editor skeletons first put it 1.8 KB over. The shell's copies now drop the tooltip wiring and the unseen status
lines, the skeleton rows carry their shared classes on the parent, and the notes that explain the seed live in
the page's frontmatter rather than in the inline script it ships. Measured against `main` built the same way,
the page grows by 299 bytes.

To give the tablet's real 377 px pane room, the toggle's padding and the row's gap tightened by 2 px
each; that moved the tablet's clean-deck need from about 376 px to 360 px. On a tablet whose deck has
lint issues the pair goes to icons, because the row holds five other controls and the pill; the words
come back when the issues are fixed or the pane is widened.

**The slide toolbar held still.** The owner's screen recording (iPhone, after the first push) showed
Compose's floating slide toolbar change width as the caret moved: its Format group lists only the styles
that apply to the block under the caret, and the pill around it is centered, so it jumped on every move.
`ComposeView`'s `SlideView` now reserves the Format group's width from the styles the slide can offer in any
of its blocks (measured from the real chips; a first cut reserved all six and left an empty hole on a wide pane), holds the pill at the widest it has been while its slide is active (for the table
and code controls), and on a narrow pane lays the pill out as a two-row grid as wide as its wider row (a fixed full width first left
wide empty margins on most slides, owner on an iPhone). Measured in Chromium at 390, 820
and 1440 px and in WebKit at iPhone 15 Pro: the same box with the caret in a heading, an eyebrow and a
list item (1, 3 and 0 chips).

**How Compose is told apart (owner's direction, 2026-11-11).** Four treatments were mocked on the live Studio and
the owner first picked D: Compose in the accent, with Present's solid accent fill when selected. On a real iPhone the
solid fill read as an action beside Present and Share, so the owner refined it: a FILL means selected and is the same
for both modes (the posture dial's neutral chip, `--text-heading` mixed 12% into `--bg`, which shows in every palette,
where the old `--accent-soft` fill equals `--bg` in eight dark palettes), and the GOLD means Compose (its icon and
word, selected or not). A solid accent stays reserved for Present. The owner then asked, on an iPhone, for the gold to
stay when Compose is selected there too, at AA. Measured in every palette and mode on the live Studio:

| Compose's word on… | plain `--accent`, worst case | `--lx-compose`, worst case |
|---|---|---|
| the bar (not selected) | 5.22:1 | 6.52:1 |
| the selected chip (12% heading ink in `--bg`) | 4.08:1, carbone light (fails in seven palettes) | 5.23:1, laguna light |
| the phone bar's ink cell | 1:1 in a monochrome palette, 2:1 in cuoio dark | not used |

So Compose's gold is `--lx-compose` (`docs/src/styles/tailwind.css`): the accent with a fifth of the heading ink,
darker in light mode and lighter in dark, so it still reads as the gold. No fixed mix lifts the accent on the INK cell
in a monochrome palette, where the accent is the ink. So a selected Compose on the phone bar takes the header toggle's
light chip instead of the ink cell, with its underline in the gold. `compose-first.spec.ts` checks all three in every
palette. An unlit Source reads in `--text-body`, the AA channel.

**Narration.** Five new lines were recorded with `tools/record-lesson-voice.mjs` (two in `tour`, three
in `write-slide`). The Source-mode lines and their clips are unchanged, so a visitor who chose Source
hears the tour they always did.

## 5. Left alone

- **The Playground's `Explore · Edit` switch.** It is a catalog explorer with only a Markdown editor and no
  Compose, so there is nothing to put first. Renaming its `Edit` to `Source` is a question for the owner,
  on the PR's decision card.
- **Accessible names** stay as they are (§3.5).
