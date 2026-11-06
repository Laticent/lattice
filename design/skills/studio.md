---
name: studio
description: "Use when working in Lattice Studio or answering how to: its panels, keyboard verbs, where decks are stored, and what the Studio chat can and cannot do."
kind: operate
studio: true
---

# Skill — Use Lattice Studio

> Know where everything is in the Studio, which key does what, where your
> decks actually live, and what to ask the chat for — so an author never hunts
> for a control or loses a deck.

**Read this when** someone asks "where is…", "how do I…", "can the chat…" or
"where did my deck go?" about the Studio, or when you are the Studio chat and
need to point the author at a control you can't press for them. **You'll
produce** a direct answer naming the control, its key, and what happens next.

---

## The 10/10 bar

- **Name the control the way the screen does.** "Coach — check this deck" in
  the command palette, "Deck" on the activity rail — not "the settings area".
- **Give the fastest route.** ⌘K / Ctrl+K reaches almost every verb by typing
  a word; say that before describing a menu path.
- **Be honest about storage.** Decks live in this browser. Say so, and point
  at "Backup & restore" before it matters.
- **Know the chat's limits.** It edits the open deck, and in the default
  Review mode the author approves every diff. It cannot import, export,
  present or change Studio settings; say which control does.
- **Mac and Windows/Linux keys both.** ⌘ on a Mac is Ctrl elsewhere.

---

## Mental model

The Studio is one screen with three densities, chosen on the **posture dial**
in the top bar (it is not shown on a phone-width screen):

| Stop | Hint on the dial | What shows |
|---|---|---|
| **Read** | "Read — just the slides" | The deck, full bleed |
| **Write** | "Write — editor + preview" | Editor beside the live preview |
| **Craft** | "Craft — every panel" | Adds the activity rail and docked panels |

The dial is saved and only moves when you move it. ⌘. (Ctrl+.) quiets the
screen to Write for this session without changing the saved stop; Esc clears
it. Opening a Craft-only panel from Read or Write raises the screen to Craft
for as long as that panel is open.

Everything edits one **source**: the deck's Markdown. The Markdown editor and
Compose (the rich editor) are two views of it, and the preview renders it
with the same engine as the CLI.

---

## Where it lives

**The main surfaces**

| Surface | Where | What it is for |
|---|---|---|
| **Editor** | toggle "Markdown" / "Compose" above it | Write the deck as Markdown, or edit it as rich text. Both change the same source. |
| **Preview** | beside the editor | The rendered slide. Overflow shows as a ring. |
| **Slide strip** | the row of slide thumbnails | Every slide as a thumbnail; move, duplicate, delete. |
| **Command palette** | ⌘K / Ctrl+K | Search and run any Studio verb. |

**The activity rail** (Craft) opens one panel at a time:

| Rail | Hint | Use it to |
|---|---|---|
| Coach | "Coach — deterministic deck assessment & fixes" | See the deck's grade and every lint and review finding, with fixes. |
| Chat | "Chat — AI conversation about your deck" | Talk about the deck; ask for edits. |
| Live | "Live — edit together: invite, people, session chat" | Edit with other people. |
| Library | "Library — saved themes, components & finishes" | Reuse saved parts and photos. |
| Views | "Reader views — a subset of the deck for one kind of reader" | Lenses: one deck, shown differently per audience (see `lens.md`). |
| Slide | "Slide settings — this slide only" | This slide's look and speaker notes. |
| Deck | "Deck settings — the whole deck" | Theme, preset, color mode, size, venue, mode, finish (see `restyle-deck.md`). |
| Setup | "Workspace settings" | Studio-wide settings, including "Backup & restore". |

**Command palette verbs** (labels as the palette shows them; some appear only
when they would do something):

- Deck: "New deck", "Import deck…"
- Show and share: "Present", "Share…", "Export as PDF…"
- Slides: "New slide…", "New slide before this one…", "Duplicate slide",
  "Move slide left", "Move slide right", "Delete slide", "Insert an icon…"
- Check and fix: "Coach — check this deck", "Fix all issues", "Format code blocks"
- Look: "Switch light / dark mode", "Slide settings — look, notes"
- Elsewhere: "Reshape for a reader", "Library — saved themes & components",
  "Fabricate — Theme & Component Studio", "Workspace settings",
  "Read as an article", "Focus mode — just editor & preview",
  "Keyboard shortcuts", "Watch demo — the Studio drives itself", "Send feedback"

**Share** ("Share…") exports formats including PDF, PowerPoint, a webpage,
print, an image set, a `.lattice` project and a Marp bundle. PDF and PowerPoint have a
"Re-openable in Lattice" switch that carries the deck inside the file, so
"Import deck…" can open it again.

---

## Recipe

**Keyboard verbs.** "Keyboard shortcuts" (or `?`) lists them in the Studio.

| Keys (Mac / Windows, Linux) | Does |
|---|---|
| ⌘K / Ctrl+K | Search and run a command |
| ⌘Z / Ctrl+Z | Undo, from anywhere |
| ⇧⌘Z / Ctrl+Shift+Z | Redo |
| ⌘. / Ctrl+. | Quiet the screen to Write; Esc clears it |
| `?` | The shortcuts list |

In the **slide strip** (Tab to a slide, then):

| Keys (Mac / Windows, Linux) | Does |
|---|---|
| ← → / Left Right | Previous or next slide |
| Home, End | First or last slide |
| ⌘↩ / Ctrl+Enter | New slide after |
| ⇧⌘↩ / Ctrl+Shift+Enter | New slide before |
| ⌘D / Ctrl+D | Duplicate |
| ⇧⌘← ⇧⌘→ / Ctrl+Shift+Left, Right | Move left or right |
| ⌫ or Delete / Delete or Backspace | Delete |
| Shift+F10 | Open the slide menu |

In **Present**: → Space PageDown next; ← PageUp previous; Home End first and
last; `f` full screen; `g` slide overview; `n` notes on a narrow screen; `s`
opens the presenter's second window; Esc leaves.

**Common jobs**

1. **Start a deck**: ⌘K → "New deck", then write or paste Markdown. Paste a
   whole deck into the Markdown editor to bring it in.
2. **Open a file**: "Import deck…" or drop the file on the Studio. It opens
   `.md`, `.lattice`, and a webpage, PDF or PowerPoint that Lattice exported
   re-openable. See `import.md`.
3. **Check the deck**: open Coach. "Fix all issues" applies every machine fix;
   a finding's own fix shows a diff with Apply and Discard. See
   `fix-findings.md`.
4. **Ask the chat**: open Chat and say what you want. The chat has three
   modes on its composer bar: **Talk** (reads and answers, changes nothing),
   **Review** (the default: edits arrive as one diff card per turn and wait
   for Apply) and **Auto** (for this visit only: a clean edit applies at once,
   undo from History; an edit that deletes slides or rewrites most of the deck
   still waits for Apply). From Review, one press of the mode button reaches
   Talk and two reach Auto.
5. **Change the look**: the Deck panel, or ask the chat. See `restyle-deck.md`.
6. **Present**: ⌘K → "Present".
7. **Hand it on**: "Share…", pick a format; turn on "Re-openable in Lattice" if
   the recipient should edit it.
8. **Back up**: Setup → "Backup & restore".

---

## The contract / skeleton

**Where decks are stored.** In this browser, under keys starting
`lattice-studio-` (`docs/src/components/studio/studio-store.ts`):

| Key | Holds |
|---|---|
| `lattice-studio-deck-index` | Which decks exist, their titles and order |
| `lattice-studio-src-<deckId>` | Each deck's edited source |
| `lattice-studio-active` | The deck and slide you last viewed |
| `lattice-studio-settings` | Studio settings |

Undo history and checkpoints live in the browser's IndexedDB, and so do
Library items. Nothing is on a server. Clearing site data, a private window,
or a browser that evicts storage loses them. "Backup & restore" downloads
`lattice-workspace.zip`: the Studio's store, a readable `decks/<slug>.md` for
every deck, the Library, and reference docs. It leaves out the OpenRouter key.

**What the chat can do** (`AGENT_TOOLS` in
`docs/src/components/studio/architect-agent.ts`; which tools each mode allows is
`TOOL_TIERS` in `chat-actions.ts` — Talk gets only the reads):

| Tool | Does |
|---|---|
| `read_slides` | Reads the exact Markdown of slides in the open deck |
| `edit_slides` | Stages `replace`, `insert` or `delete` on whole slides |
| `set_front_matter` | Stages setting or removing one front-matter key |
| `check_deck` | Runs the linter, the review and Mermaid's parser on the draft |
| `read_component` | Reads one component's contract and skeleton |
| `read_front_matter` | Reads how one front-matter key works |
| `read_guide` | Reads a skill or guide (this file is one) |
| `create_deck` | Drafts a whole new deck; the author sees its title and outline and confirms before it exists (`docs/src/components/studio/chat-actions.ts`) |

When the Library holds photos or videos, it also gets `list_assets`,
`view_asset` and `caption_asset`. It can draw a diagram, math, a plot or one
sample slide in its reply without touching the deck.

**What the chat cannot do**: open or import a file, export, share, present,
change Studio or workspace settings, move the posture dial, or create a deck
without the author's confirm. In Talk mode it
changes nothing; in Review mode its edits wait for the author's Apply; only in
Auto do they apply at once, after a History checkpoint is saved. Auto applies
nothing during a live session, after a stopped turn, or when the deck changed
while the chat worked. When it creates a deck and you press "Create and open",
the new deck's chat starts with one line pointing back; the earlier
conversation stays with the deck it was about.

A starter deck to paste into "New deck" (lint-clean):

```markdown
---
marp: true
size: 4k
theme: laguna
paginate: true
header: "Trailhead · Launch plan"
---

<!-- _class: title silent -->

# Trailhead Launch

`Product · Spring 2027`

We open the beta to three cities in April, and the board decides the fourth.

---

<!-- _class: big-number -->

`Beta waitlist`

- 4,800
  - sign-ups in six weeks, up from 1,100 at the last review.

<!-- The waitlist doubled after the podcast spot; say that out loud, it is not on the slide. -->

---

<!-- _class: closing silent -->

## Pick the fourth city by March.

`Lee Park · Product lead`

We recommend Denver, where a third of the waitlist lives.
```

---

## What good looks like

- "How do I move slide 4 earlier?" → "Tab to slide 4 in the strip and press
  ⇧⌘← (Ctrl+Shift+Left), or go to slide 4 and use ⌘K → 'Move slide left'."
- "Can you export this to PowerPoint?" (to the chat) → "I can't export, but
  Share… → PowerPoint does. Turn on 'Re-openable in Lattice' if they should edit it."
- "Where are my decks saved?" → "In this browser only. Setup → 'Backup &
  restore' downloads all of them as one zip."
- "Make slide 3 tighter" (to the chat) → one diff card that touches slide 3
  only, with a one-line summary of what changed.

---

## What bad looks like

- "Go to the settings and find the theme option." Fix: "Deck on the activity
  rail, then Theme" or "⌘K → type 'deck'".
- The chat saying "I've exported your deck." It can't. Fix: name "Share…".
- "Your decks are saved to your account." They aren't. Fix: browser storage,
  plus the backup zip.
- The chat editing slides the author didn't ask about because the Coach had
  findings on them. Fix: mention them; edit only on request.
- Sending a Mac-only shortcut to someone on Windows. Fix: give both.

---

## Ship checklist

- [ ] The answer names the control as the screen labels it.
- [ ] A keyboard route is given where one exists, Mac and Windows/Linux.
- [ ] Anything that needs a control the chat can't press says which control.
- [ ] Storage questions mention "Backup & restore".
- [ ] Deck edits made through the chat touch only the slides asked about and
      leave the deck lint-clean.

---

## Common mistakes

1. **Hunting menus instead of ⌘K.** The palette has nearly every verb, and its
   search matches words like "pdf", "lint" or "dark".
2. **Looking for a panel in Write.** The activity rail shows in Craft; move the
   dial, or open the panel from ⌘K, which raises Craft while it is open.
3. **Assuming a commanded verb is always listed.** Some only appear when they
   would act: "Fix all issues" needs a fixable finding, "Format code blocks"
   needs a code fence, "Delete slide" needs more than one slide.
4. **Treating browser storage as safe.** It is best-effort; back up.
5. **Confusing the light/dark toggle with the deck's color mode.** The toggle
   changes the Studio's display; the Deck panel's Color mode writes the deck.
6. **Asking the chat to do something only a control can.** Import, export,
   present and settings are the author's clicks.

---

## Canonical sources

- `docs/src/components/studio/studio-commands.ts` — every command-palette verb.
- `docs/src/components/studio/StudioShell.tsx` — the shell, the palette rows,
  the posture dial and the editor toggle.
- `docs/src/components/studio/chrome-parts.tsx` — the activity rail and the dial.
- `docs/src/components/studio/strip-actions/model.ts` and `shortcuts.tsx` — the
  strip's keys and the shortcuts list.
- `lib/core/present-transport.mjs` — the shared Present navigation keys.
- `docs/src/components/studio/studio-store.ts` — what is stored where.
- `docs/src/components/studio/workspace-backup.ts` — the backup zip.
- `docs/src/components/studio/architect-agent.ts` and `chat-actions.ts` — the
  chat's tools, rules and modes.
- `engineering/decisions/2026-07-17-studio-persona-dial.md` — the posture dial.
- `engineering/decisions/2026-07-02-workspace-backup.md` — why backups exist.
- `engineering/decisions/2026-10-05-reopenable-exports.md` — re-openable PDF and PPTX.
