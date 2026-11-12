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
A thin accent ring around a selected Compose cell on the phone bar was mocked and offered; the owner skipped it
(2026-11-11: little value unless shown otherwise), so a selected Compose there is the light chip and the gold underline.

**Staying on your slide (owner, iPhone, 2026-11-11).** With Compose as the default, the Studio lost the author's
place: Compose on slide 5, then Preview (fine), then Source (fine), then back to Compose and Preview showed slide 1;
and a reload came back on slide 1 a second after showing the right one. Three causes, each where Compose meets the
Fuoco hub (`2026-10-15-fuoco-focus-sync.md`, whose phase 3 left Compose's reporting as it was):

| Cause | Fix |
|---|---|
| A Compose view built after a round trip through Source (or the phone bringing the Compose pane back) started at the top of the deck, and its first transaction reported slide 1 as the author's move | `ComposeView` takes `focusAtMount`, read once when the view is built: it starts on the hub's slide with its slide memory seeded, the Markdown editor's rule ("a new view follows the focus; it does not announce its own caret") |
| A resync (any outside change to the text: a rail op, an AI edit, a Source round trip) rebuilt the state with the caret at the top, with the same report | `resyncFrom` puts the caret on the slide the hub holds (the hub follows slides by identity, so a slide inserted above does not shift it onto the wrong one), on its line, except on a folded slide (never a caret in hidden text) |
| The shell's Compose caret-TEXT report carried `composeChunkRef`, which started at 0 and only followed navigations made after its subscription; the boot navigation (the slide you left on) runs before it | the ref starts from `hub.get()` when it subscribes and when Compose mounts |

The caret's LINE crosses too, where it can be matched (`lib/deck-outline/caret-line.ts`): the hub carries the caret
line as the reporting editor saw it, the Markdown line or the Compose block's text. The editor that mounts compares both
with their markers stripped and lands on the one matching line of the slide, else the slide's first line, as before. It
matches one source line to one block, so a paragraph wrapped over several source lines, a line with a link or an escape,
and a repeated line fall back to the slide's first line.
`docs/e2e/studio-pane-sync.spec.ts` drives the owner's sequence and a reload on five projects (desktop, mobile,
webkit-phone, webkit-tablet, gecko); all five of its runs on desktop, mobile and webkit-phone failed on the code before
the fix (slide 1 for 3; `` `Why Lattice` `` for the paragraph). `ComposeView.sync.test.tsx` pins the mount and the resync
at unit level, including a slide inserted above the caret's (it fails with the old index).

An independent checker found the index bug above, and that a Compose built while its pane is `display: none` (a desktop
split collapsed to the preview) was on the right slide but scrolled to the top: it now frames the slide the first time
the pane gets a height. Two edges stay, neither a regression from `main` and both arguably right: a resync while the
caret's slide is FOLDED moves the preview to the first open slide, where the caret goes (it cannot go to hidden text);
and opening Source can turn the preview's page on a split slide when the carried line is on another page of it.

**The caret shows, and survives a reload (owner, iPhone, 2026-11-11; the owner picked smart focus and slide + line).**
The slide fix above put each editor's caret on the right line, but a phone draws a caret only in a focused editor, and
focusing one raises the keyboard; and a reload saved only the slide. Fuoco holds the focus in memory on the main thread
and persists nothing itself, so the Studio does both:

| When | What happens |
|---|---|
| A switch with a real keyboard (a fine pointer that hovers: a desktop, a tablet with a trackpad) | the editor that comes up takes focus, caret where the author was |
| A phone switching straight between Compose and Source | the same: the author was writing, so the keyboard comes up |
| A phone arriving from the preview | no keyboard; a drawn caret marks the place, and a tap puts the real caret |
| A reload | the slide AND the caret's line come back (`lattice-studio-active` gains `line`, written on leaving); with a real keyboard the editor takes focus on it, on a phone the drawn caret shows it |
| Any of these in a Live session (joined, or a `#live=` link) | no editor takes the keyboard on its own: the drawn caret shows the place and the author clicks in |

Why the Live exception, and what replaced the hold-back in a session: Compose holds back an outside change while it has
focus, and the author's next keystroke supersedes it. A Compose that took focus on a mode switch, with no click, dropped
a co-editor's edit (`filo-live.spec.ts`, caught by the full local e2e run); the adversarial trio then showed any earlier
rail pick or arrow step re-armed that focus, and that a guest who simply clicked into Compose lost the host's edit too.
So in a session Compose applies an outside change AT ONCE (`resyncFrom` keeps the caret's slide, line and column), and
holds it only while an IME composition is open, until it ends. A new `filo-live` case has the guest typing in Compose
while the host edits, and checks both edits survive. Outside a session the hold-back stays as it was. The one edge left, a change that arrives during an IME composition, is
`followups.d/3128-p2-compose-live-parked-change.md`. A restore's
focus also waits for nothing else to have the keyboard: the editor chunk lands about a second after load, and the
author may already be typing in search, chat or the command palette.

The caret keeps its COLUMN too, not only its line (owner, iPhone, 2026-11-11): `caret-line.ts` maps a column between a
Markdown line and the text Compose shows for it, skipping block markers and emphasis, both ways. Plain text, bold,
italic, code and inline math map exactly; a line with a link (`[text](url)` in Source, `text` in Compose) does not match
at all, so the caret falls back to the slide's first line. A Source caret that comes back to Source (a reload) is put
back at its exact raw column, not through the plain form, so a caret after `**bold**` stays outside the closing `**`. A
line from Source that the Markdown holds more than once, or that Compose does not show (a speaker note), is not matched
in Compose: the caret falls back to the slide's start rather than onto a visible block with the same words. The shell reads the column from the editor being left (each editor's `caretColumn()` handle), hands it to the one arriving, and saves it with the line (`lattice-studio-active` gains `col`). Arriving, Compose
frames the caret, not only the slide, when the caret sits lower than one screen shows.

Source FRAMES THE SLIDE as Compose does (owner, iPad, 2026-11-12: Compose showed the whole slide, Source put the caret's
line at the top of the pane with the slide's heading scrolled off). The slide's first editable line goes at the top when
the slide down to the caret fits the pane, else the caret goes in the middle (`frameSlide`, Editor.tsx). The heights are
estimates until the lines are drawn (a phone's wrapped caret line was estimated at 1076 px and measured at 2262 px), so
over the next few layouts a caret left outside the pane is scrolled into it (measured at the caret itself, not its
line: a wrapped paragraph can be taller than the pane), and a pane that is hidden when the reveal runs is framed the
first time it gets a height. All of it stops the moment the author scrolls, taps or types, or after three seconds, so a
later keyboard resize never pulls the view back to an old caret. On a tablet the on-screen keyboard covers the lower half of the
pane without shrinking it, so "fits" and "on screen" are measured against the part the keyboard leaves
(`visualViewport`), and the caret is checked again when the keyboard rises, a moment after focus. `studio-pane-sync.spec.ts`
checks the heading and the caret line are both on screen after a switch; the keyboard half cannot be driven from
Playwright (no real on-screen keyboard) and is checked on the owner's iPad.

The drawn caret sits OUTSIDE the editable text: an overlay in Compose (`position: fixed` from the caret's coordinates) and
a CodeMirror layer in Source. A first cut put a widget inside the text and took it out on focus, and changing the
editable DOM under a click made Firefox drop where the first click landed (caught by the gecko run). Fuoco's `go` gained
an optional `line`, so the boot restore carries the saved line like any navigation. The Markdown editor puts back an exact
source offset when the hub still holds its own caret (a Compose that took the keyboard and has not moved reports nothing).
`studio-pane-sync.spec.ts` checks the focus, the live and the drawn caret at each step, on five projects.

**What it costs (measured 2026-11-11, same machine, this branch against its base on `main`, back to back).**

| | Base | This branch |
|---|---|---|
| First visit, phone profile (4x CPU, 6 Mbit/s), slide visible, median of 7 (`startup-bench.mjs`) | 6.55 s | 6.20 s (runs vary 4.4 to 7.1 s) |
| First visit, desktop, slide visible, median of 5 | 1.63 s | 1.53 s |
| First visit, desktop, requests before the slide | 219 | 355 (Compose's chunks, not the Editor's; the slide is no later) |
| Startup JavaScript, gzip (CI route budget) | | +2,384 B at `c14b12f`, about +2,130 B after moving Compose lint, Fix all and the column read into lazy modules (declared +2,200) |
| Caret walk, keystroke latency median / p90, 123 slides (`studio-sync-bench.mjs`) | 24 / 32 ms | 24 / 32 ms |
| Slide change to preview, Compose / Markdown | 78 / 50 ms | 74 / 40 ms |
| Typing in Compose, keystroke latency median / p90 | 64 / 80 to 88 ms | 64 / 88 ms |
| Typing in Compose, long tasks during the burst (CPU profile, 3 runs) | 4, 8, 5 | 4, 4, 6 |

The Compose lint pass (Fix all and its count, §1.1) first ran 400 ms after the last key and cost about 80 ms of main
thread (the lint core and the markdown parser it runs) plus a Studio re-render for an unchanged count: 6, 9 and 11 long
tasks per typing burst. It now waits for a 1 s pause and an idle callback, skips text it has linted, and sets the count
only when it changes. It is still one long task of about 100 ms after the author stops typing; moving it into a Web
Worker would take it off the main thread entirely (the lint core is pure, HARD RULE #7) and is offered separately.

**Narration.** Five new lines were recorded with `tools/record-lesson-voice.mjs` (two in `tour`, three
in `write-slide`). The Source-mode lines and their clips are unchanged, so a visitor who chose Source
hears the tour they always did.

## 5. Left alone

- **The Playground's `Explore · Edit` switch.** It is a catalog explorer with only a Markdown editor and no
  Compose, so there is nothing to put first. Renaming its `Edit` to `Source` is a question for the owner,
  on the PR's decision card.
- **Accessible names** stay as they are (§3.5).

## 6. Compose writes back what the author wrote (owner, 2026-11-11)

The adversarial trio measured what an edit in Compose did to the Markdown. Compose already kept a slide nobody touched
byte for byte (`emitDeck`'s baseline), but the slide the author edited went through the serializer whole. One serializer
writes one spelling: `_em_` came back `*em*`, `*` bullets `-`, `1)` `1.`, a lone `~` `\~`, a padded table and its
`:--:` row canonical. On 40 example decks, a one-character edit rewrote other lines of the same slide in 11; the deck's
trailing newline was dropped on every first save, and its separators were rewritten to `\n\n---\n\n`. With Compose the
default, that is the editor a power user lands in, so the owner chose to fix all of it in this PR. Three layers:

| Layer | What is kept | Where |
|---|---|---|
| Deck | the bytes before the first slide and after the last (`head`, `tail` on the doc), and the separator before each slide (`sep` on the slide). A new or pasted slide takes the canonical separator | `deck-doc.ts` `deckFrame`, `joinSlides`; `scoped-resync.ts` keeps them through an undo |
| Block | in an edited slide, every block whose Markdown reads the same as one of the slide's original blocks keeps that block's bytes, and the space between two original neighbors stays as written. Blocks are matched by their canonical form (a longest common subsequence), so a block that moved or a neighbor that was deleted still matches | `deck-doc.ts` `faithfulSlide`, `alignBlocks`, `topLevelSpans` (`deck-markdown.ts`) |
| Line and marker | in the edited block, every line the edit did not touch keeps its spelling (the other list items, the other table rows, the alignment row); the parser keeps the list marker (`bullet`, `delim`, node attrs) so the edited line writes it as the author did; on the edited line, emphasis the original wrote with `_` gets `_` back, a lone `~` is not escaped, and a two-space hard break stays two spaces. The emphasis spelling is NOT a mark attr: an attr is part of a mark's identity, so a run toggled next to an existing one stayed a separate mark and the two were written `*foo**bar*` (the checker's catch) | `deck-markdown.ts` list attrs; `deck-doc.ts` `keepLines`, `respell`, `spliceProse` |

**It does not change what the slide says.** The faithful text must read back, through Compose's own parser, to exactly what
the canonical serializer would have written, else the canonical text is used; and the slide spliced back around its
directive lines (a `_class` under an eyebrow stays there) must split back into the same directives and prose. That
read-back sees what Compose's parser sees (`html:false`), not what the engine draws (`html:true`), so the two spellings it
cannot tell apart are kept out of reach: a slide holding a backslash- or entity-escaped tag, comment or processing
instruction (`\<b>`, `\<!--`, `\<?`, `&lt;b`, `&lt;!--`) is locked, and the respelling of an edited line never touches a
code span, an HTML tag (a `>` inside a quoted attribute included) or a link's address. The fallback text written when the
slide cannot be spliced back goes through the same read-back. Two original blocks that read alike but are written differently are never kept as written. A block Compose changes on reading (a chart's row list made tight) is never
kept as written. `docToDeck` stays the plain canonical form (tests and the resync equality check use it); only the
editor's write-back (`emitDeck`) is faithful.

**Measured.** `src/lib/compose/deck-fidelity.test.ts` runs every shipped example deck (360): opened and left alone, each
comes back byte for byte; a one-character edit on each editable slide changes exactly one line of the deck, counted both
ways (a removed or an added line), and the result reads the same as the edited document. `scoped-resync.test.ts` now
builds its edits the way the editor writes them and fails on any fallback: 4,306 cases, none falling back, the patch path
0.30 ms median on a one-slide change of the 134 KB deck. The block alignment matches the common head and tail one to one
and aligns only the middle (capped), so an edit inside a 3,000-item list stays linear. Before: 718
of the 720 checks failed (every deck lost its trailing newline; 97 decks rewrote more than the edited line). After: all
pass, plus eight spelling cases. A keystroke on the largest slide of the 134 KB deck costs 0.32 ms median (0.64 ms p95)
against 0.10 ms canonical.

**The default path is tested by default.** Every Playwright project's fixture stores Source, because its helpers type
Markdown. A `compose-default` project (nightly only; per-PR CI runs `--project=desktop`) runs the core Studio specs
(smoke, Filo undo and Live, lessons, the pane sync, Compose-first) with no stored mode, so they boot in Compose; the
helpers open Source only where they type Markdown (`toSourceIfCompose`). 48 tests, about 6 minutes added to the existing
Studio E2E nightly step (it runs every project), no new job or step.

With Compose faithful, a returning visitor lands in Compose like a new one (owner, 2026-11-11): Source is one click
away and remembered, and an edit in Compose no longer rewrites how they wrote their deck.
