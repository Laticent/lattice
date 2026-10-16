---
status: proposed
summary: The phone Studio hides search two taps deep and has no button for Theme, Fix all, Reshape or notes, so four lessons say "not on this screen". Plan — the ☰ button opens search (its rows become the palette's empty state), each pane gets an action row, every control reaches 44px.
---

# The Studio on a phone — search one tap away, and every lesson's control on screen (2026-10-06)

**Builds on:** `2026-10-05-studio-lessons.md` (lessons, the caption ruling, the phone floor).
**Owner rulings so far (2026-10-06):** per-pane action rows; no new header button ("we don't
have enough space"); design note first, then one PR after #2553 merges.

## The ask

"The mobile experience is lacking because we are missing some buttons. Mobile lessons should be
solidified. A lot of features are buried under search/command, which is behind the hamburger
menu."

## What a phone shows today (measured 2026-10-06, built Studio, 390×844)

The **header** is full: Lattice home (36px), workspace launcher (24px), deck name (182px), light/dark
(32px), workspace settings (32px), ☰ menu (32px). Every one is 32px tall, under the 44px touch target.

The **pane bar** is full: eight 48px buttons across the 390px width (Source, Compose, Preview, Coach,
Chat, Settings, Present, Share).

The **☰ menu** holds Search / commands, Library, Reader views, Version history, Themes, Show me and
Send feedback. **Search is two taps away**: ☰, then Search / commands. Search is how every command
and every lesson is found (`2026-10-05-studio-lessons.md`), so on a phone the Studio's whole help
system sits behind a menu row.

The **slide strip** (Preview pane) has Add, Duplicate, Move earlier, Move later and Delete at 28px,
and slide chips at 32px tall.

**What has no button at all on a phone**, checked control by control against what the lessons point at:

| Control | Desktop | Phone today | Lesson on a phone |
|---|---|---|---|
| Theme | header palette button | ☰ → Themes | "Change the theme" says "themes are in the menu" and switches for you |
| Fix all | edit bar | none | "Fix every issue" says "open your text" and stops |
| Reshape | edit bar | none | "Change a slide's layout" says "on a wider screen" and stops |
| Slide settings / notes | edit bar | pane bar "Settings" (a different label) | "Speaker notes" misses it and does the step for you |
| Add slide | edit bar + strip | strip only, Preview pane only | works from Preview; from Source it falls back |
| Write | the editor | Source tab | "Write a slide" from Preview says "Choose Write at the top", a control a phone does not have |

So four of the seventeen lessons cannot let the learner do the step on a phone, and one gives a
wrong instruction.

## The axes

1. **Reach**: how many taps to search, the one door to every command and lesson.
2. **Presence**: whether each action a lesson teaches has a control on the screen it applies to.
3. **Room**: what each move costs in a 390px-wide screen that is already full.
4. **Parity**: whether a lesson points at the same named control at every width.

## Decision (proposed)

### 1. The ☰ button opens search (Reach; costs no pixels)

Tapping ☰ opens the command palette full-screen with the field focused. With an empty query, the
palette shows what the menu shows today (Library, Reader views, Version history, Themes, Show me,
Send feedback) as its first group, then **Learn**: the lessons for the pane on screen. Typing
filters all of it, as on desktop.

Search goes from two taps to one, with no new header button. The menu's rows are not lost; they
become palette rows, so a search for "history" also finds Version history. The button keeps its
place and its "Menu" label; its icon becomes a search glyph with the ☰ lines folded in, which needs
an icon decision at build time.

Rejected: a header search button (no room; owner ruling); a floating button (covers the slide and
fights the lesson caption at the bottom); a search field at the top of the old menu (still two taps).

### 2. Each pane gets an action row (Presence + Parity; owner ruling)

Each pane gets one 44px-tall row holding the actions that apply there, named exactly as on desktop so
a lesson's selector matches at every width:

- **Source:** Add slide · Fix all · Reshape · Slide settings.
- **Preview:** Theme · Reshape · Add slide, beside the slide strip.

The Preview row replaces the strip's 28px Add/Duplicate/Move/Delete cluster. Duplicate, Move and
Delete move to a long-press on a slide chip and into the palette, where they already are as commands.
That is the room the row needs, so Preview gains no height.

The pane bar's "Settings" is renamed to match desktop: **Slide settings**, with a shorter visible
label if 48px needs it.

### 3. A 44px floor for every phone control (Room, honestly spent)

Header buttons go from 32px to 44px hit areas, by padding. The workspace launcher (24px) merges into
the Lattice mark's tap target. Slide chips grow to 44px tall. This uses the same trick as Vetrina's
Exit (an invisible hit area around a drawn shape), so nothing visible grows.

### 4. Lessons solidified on a phone (Parity)

- Every lesson gets a phone path that lets the learner do the step, with no "on a wider screen" stop.
  Fix all, Reshape and Theme point at their action-row buttons.
- "Write a slide" says "Tap Source" on a phone.
- A lesson that needs another pane first switches to it as a "your turn" beat ("Tap Source"), with
  the usual do-it-for-you fallback.
- The e2e suite gains a 390px run of **all seventeen lessons**. Each run waits out every turn and
  asserts the lesson's real effect, and asserts that no line in it says "wider screen" or "menu".

## Slices — one PR, one commit each, after #2553 merges

0. **Pre-warm on intent** (owner aligned 2026-10-06): fetch the walkthrough engine and the lesson kit when
   Learn rows appear, a track and its `voice.json` on row highlight, everything at once on a `?lesson=` link;
   nothing under Save-Data. `followups.d/2553-p2-lesson-intent-prewarm.md`.
1. **Reach**: ☰ opens the palette; menu rows as its empty state.
2. **Action rows**: Source and Preview rows; Slide settings rename; strip cluster moves.
3. **44px floor**: header, chips, strip.
4. **Lessons**: phone paths, the copy fix, re-recorded clips, the seventeen-lesson phone e2e.

**Evidence**: `tools/screenshot.js` at 390, 820 and 1440 for every changed surface (desktop and tablet
must not change), a tap-target census (every visible control's hit area, before and after), and the
seventeen-lesson phone run. **Verify**: tier 1 checker, because the palette, the pane bar and the
strip are shared chrome every Studio session uses.

## Open questions

- **The ☰ → search move.** It is the one part the owner has not ruled on; it came out of the "no
  space" answer. If the owner prefers to keep a menu, the fallback is to put a search field at the
  top of that menu. That still takes two taps, but nothing moves.
- **The icon** for a menu that is now a search.
- **iOS:** none of this can be checked on WebKit from the cloud sandbox; the build PR inherits the
  open iPhone follow-up.
