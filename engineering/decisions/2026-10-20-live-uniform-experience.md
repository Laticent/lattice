---
status: proposed
summary: >
  Feedback on Live: it syncs the editor and preview but not Coach, the AI chat, open panels or
  other actions. An audit of what a Live session shares today found a sharper problem first —
  two members can see DIFFERENT slides, because an un-themed deck renders in each viewer's own
  site palette and mode, and the host's saved themes, finishes and components never reach a
  guest. Proposed: sort every piece of Studio state into five tiers (deck truth, activity,
  follow, shared on purpose, never shared), sync the meaning of an action rather than the
  click, and build it in four slices. The owner settled the four open choices on 2026-10-20.
companion:
  - ./2026-10-06-studio-live-collaboration.md
  - ./2026-10-06-live-collaboration-roadmap.md
  - ./2026-10-16-npm-plugin-threat-model.md
  - ./2026-08-17-theme-css-is-a-preview-sink.md
---

# Live — as uniform an experience as we can give, and where it stops

**Date:** 2026-10-20
**Status:** Proposed; the four design choices in §5 are settled. Nothing is built.
**Decision owner:** Sharmarke

## 1. The ask

> Live syncs the editor and preview but not the chat or Coach. It doesn't sync user actions
> like opening panels or clicking buttons. Some things we may not want to sync, for privacy or
> security, but people who collaborate should have as uniform a live experience as possible.

## 2. What a session shares today

Read from `docs/src/components/studio/live/live-controller.ts` and `live-model.ts` on `main` at
`3bf8a7c`.

| Shared | Channel |
|---|---|
| The deck markdown | Yjs `doc.getText('source')` (`live-controller.ts:526`) |
| Caret and selection, active slide, "typing", name, color, mic state | Awareness fields, behind the receiver whitelist; cursor, slide and typing can each be withheld (design note §12.3) |
| People chat, join/leave lines, roster, the session clock | Tavola posts through the host (`post()`, `live-controller.ts:1391`) |
| "Bring everyone here" | A `summon` awareness field |
| Follow | Your active slide tracks one member's `slide`. Nothing else follows |

Everything else lives in one browser: which panel is open (`activeAssistant`), the view
(`view`, `editMode`), Present (`presentOpen`), the Coach card (`coachCard`) and fix progress,
the Architect chat transcript, comments, checkpoints, the site palette (`palette`) and mode
(`mode`), and the Library (`savedThemes`, `localComponents`, `savedFinishes`).

## 3. Finding: two members can see different slides

This is a correctness bug, not a missing feature: Live's promise is one deck. Found by reading;
**UNVERIFIED on a real two-browser session** — slice 1 starts by reproducing it.

1. **An un-themed deck renders in each viewer's own look.** `resolveDeckTheme` falls back to
   `sitePalette` and `siteMode` when the deck names no `theme:` (`StudioShell.tsx:3652-3669`).
   Those come from each browser's `localStorage` and `data-mode`. A host in Indaco dark and a
   guest in Cuoio light see two different decks.
2. **The deck's Library dependencies stay behind.** A deck whose `theme:` names a saved theme
   resolves its CSS from `savedThemes` (`StudioShell.tsx:3662`); saved components and finishes
   resolve the same way. A guest has none of the host's records, so those slides fall back.
   The `.lattice` file already solves this for export: `deckPackages`
   (`StudioShell.tsx:3676`) collects exactly the records the deck uses. Live does not send them.
3. **Coach disagrees.** Its findings are deterministic from the source (`assessDeck`,
   `StudioShell.tsx:3298`), which is why it looks synced, but they also read `localNames` and
   `editorPalettes`. A guest gets "unknown component/theme" findings the host does not.

Fixing 2 fixes 3.

## 4. The model: sync the meaning of an action, not the click

Replaying raw clicks fails three ways: layouts differ (a phone has no left rail), a click can
spend another person's money (the Architect runs on each member's own OpenRouter key), and it
moves people who did not ask to move. So every piece of state gets exactly one tier:

| Tier | Rule | Members |
|---|---|---|
| **1. Deck truth** | Identical for everyone; no opt-out | Source (done); the resolved theme and mode; the saved themes, finishes and components the deck uses |
| **2. Activity** | Everyone can see it; it moves no one; withholdable like the cursor | Panel open ("in Coach"), view, presenting, the Coach card they are reading, "asking the AI" |
| **3. Follow** | You opt in to mirror one person | Today: slide. Proposed: slide, panel, view and Present |
| **4. Shared on purpose** | The owner shares each item | An AI chat turn; "applied an AI edit to slide 3" (designed in §5.7 of the design note, never built); comments; checkpoints |
| **5. Never** | Private by construction | API keys and AI cost, unsent drafts, settings, devices, crash reports, Library records the deck does not use |

The rule for a new piece of state: name its tier in the PR that adds it.

## 5. Decisions (owner, 2026-10-20)

1. **Look of an un-themed deck: the host's.** While live, the host publishes the resolved
   palette and mode, and every member's preview renders with them. Each member's Studio chrome
   keeps their own palette. Nothing is written into the deck.
2. **Library dependencies: CSS arrives, code asks.** Saved themes and finishes travel as the
   same package records `deckPackages` builds, and their CSS goes through `sanitizeStyleText`
   before it reaches any document (HARD RULE #22: a peer's CSS is untrusted content). A component
   with `transform.js` is code from another person, inside the threat model of
   `2026-10-16-npm-plugin-threat-model.md`: the guest sees "Sharmarke's deck uses 2 custom
   components — Trust and render", and the slides fall back until they accept. Trust lasts for
   the session, not forever.
3. **AI chat: activity plus opt-in share.** The room sees "Amina is asking the AI" (tier 2) and
   "Amina applied an AI edit to slide 3" (a system line). A turn reaches the room only when its
   owner presses Share; it arrives as a read-only card in the people chat, never in anyone's
   Architect transcript.
4. **Follow goes wide.** Following someone mirrors their slide, panel (Coach, Lenses, Library —
   not their Chat, which is private), view and Present. Any action of your own stops following,
   as today. On a width where their panel does not exist, you follow the slide and see a label.

## 6. Slices

Each is one PR; 1 is a bug fix and goes first.

| # | Slice | Done when | Verify |
|---|---|---|---|
| 1 | Deck truth: host's look, Library package sync, CSS sanitized, trust prompt for code | Two real browsers with different palettes, modes and Libraries render pixel-equal previews of a deck using a saved theme, finish and component | Tier 1 checker (a new untrusted-CSS sink and a code-trust prompt); two-browser screenshots |
| 2 | Activity + wide Follow | Avatars show panel/view/presenting; Following mirrors panel and view at three widths; withholding works | Two-browser check at 1440/820/390 |
| 3 | AI activity and share | "asking the AI", the applied-edit line, Share-a-turn card | Two-browser check; no key or cost leaves the browser (grep the posts) |
| 4 | Comments sync | Comments ride a `Y.Array`, per the comments note | Tracked by the existing comments follow-up |

Present-with-audience (`followups.d/2547-p3-live-present-with-audience.md`) becomes part of
slice 2: Present is one more thing Follow mirrors.

## 7. What is not verified

- §3 is read from code, not reproduced. Slice 1's first step is the reproduction.
- Sending a deck's Library records costs bandwidth once per join; not measured. A saved theme
  is CSS (kilobytes); a component package can carry assets.
