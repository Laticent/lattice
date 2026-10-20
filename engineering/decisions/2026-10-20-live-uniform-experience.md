---
status: proposed
summary: >
  Feedback on Live: it syncs the editor and preview but not Coach, the AI chat, open panels or
  other actions. An audit of what a Live session shares today found a sharper problem first —
  two members can see DIFFERENT slides, because an un-themed deck renders in each viewer's own
  site palette and mode, and the host's saved themes, finishes and components never reach a
  guest. Proposed: sort every piece of Studio state into five tiers (deck truth, activity,
  follow, shared on purpose, never shared), sync the meaning of an action rather than the
  click, and build it in six slices. A second round adds Present together (everyone joins), the
  presenter's narration synthesized once and shared clip by clip from any holder with a hash
  check, Show me on a scratch deck, Vetrina pointers that can never click, and a receiver-side
  safety model: remote input is display only, and nothing reaches or leaves your Library because
  of a peer. The owner settled every open choice on 2026-10-20.
companion:
  - ./2026-10-06-studio-live-collaboration.md
  - ./2026-10-06-live-collaboration-roadmap.md
  - ./2026-10-16-npm-plugin-threat-model.md
  - ./2026-08-17-theme-css-is-a-preview-sink.md
---

# Live — as uniform an experience as we can give, and where it stops

**Date:** 2026-10-20
**Status:** Proposed; the design choices in §5 and §6 are settled. Nothing is built.
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

## 6. Present, narration, Show me and pointers (owner, 2026-10-20, second round)

The owner widened the ask the same day: share the Present experience with its narration, Guide
and captions; share Show me so someone can teach Lattice with little effort; and show each
person's mouse and actions. Showing must go through Vetrina, so nobody takes over anyone's real
mouse. All of it has to be safe: no peer can make your browser upload a file, or write to or
read from your Library.

### 6.1 The safety model — the receiver decides

Roles are cooperative in a peer-to-peer mesh (design note §5.4): a modified client can send
anything. So every rule below is enforced by the **receiving** browser, the way the awareness
whitelist already is, and holds against a hostile peer.

1. **Remote input is display only.** No peer message ever becomes a DOM event, and no peer
   message calls a Studio setter, except through rule 2.
2. **One closed allowlist of navigation intents**, validated on receipt against fixed enums:
   slide index, panel id, view, Present open or closed, transport position. Present applies to
   everyone (§6.2); the rest applies only while you follow that person. Anything else is dropped.
3. **Never on the list:** file pickers, Library writes or deletes, import, export, downloads,
   clipboard, AI calls, keys, settings, mic and camera, opening a link, installing a plugin.
4. **A peer cannot start a tour on your machine.** Tours run only from Lattice's own code, started
   by a click in your own browser (§6.4).
5. **Nothing reaches your storage without your click.** A deck's Library records and narration
   clips that arrive in a session are held in memory for the session. "Save to my Library" is a
   local action.
6. **Nothing leaves your Library because of what a peer typed.** Slice 1 sends the host's records
   the deck uses, so an editor who types `theme: <a private theme name>` into the deck would make the
   host's browser send it. The host sends only the records the deck used when sharing started; a
   record a peer's edit newly names asks the host first: "Amina's edit uses your saved theme
   'Acme Brand' — share it?" The same rule covers any other local resource a peer could name.

### 6.2 Present together

**Everyone joins at once (owner).** When a member opens Present, Present opens on every screen,
following the presenter. Nothing is lost by it: the deck lives in the shared `Y.Text`, so a
member mid-edit keeps their text and caret. Each viewer has **Leave presentation**, and a
"Rejoin" chip while it runs.

**What travels is a transport, not pixels.** Narration, captions and Guide all derive from the
deck plus a position in time (`present-guide.ts`, `PresentCaption.tsx`, the Cadenza track). The
presenter publishes slide, build step, play or pause and the track position, stamped on the
session clock (`session.now()`, design note §5.7). Each member renders captions and Guide locally
from the same deck and the same clips, so they line up exactly with what that member hears. CC,
Voice and Guide stay per-viewer switches (they are accessibility settings, tier 2 in spirit).

### 6.3 Narration — the presenter's voice, sent once, shared by everyone

**The owner's call: the presenter's narration is the voice everyone hears, and the audio travels
with the timing track.** The design that follows from how narration already works:

- **Synthesized once, on the presenter's key.** OpenRouter TTS costs money and Lattice is
  bring-your-own-key, so only the presenter's browser ever synthesizes. Members never call TTS.
  Clips the presenter already rehearsed come from their clip store (`narration-store.js`) at no
  cost, and the export bake (`narration-bake.ts`) already prices what is missing; the same
  `measureNarration` quote runs before a narrated session starts.
- **Sent as data, not through the call.** Each clip is already a compressed file under a
  content-complete key (64 kbps by default, `lib/core/narration-encode.mjs:56`). The presenter
  publishes a manifest per slide: each clip's key, its byte length and a SHA-256 of its bytes.
  Members fetch clips ahead of playback, the way Present's warm-ahead already prefetches the next
  slide, and schedule each clip on the session clock.
- **Why not through the call:** a mic path carries call quality (about 32 kbit/s Opus tuned for
  speech, roadmap §3.1), needs everyone on the call, and feeds back when a speaker's output reaches
  a listener's microphone.
- **Shared load, like a swarm.** Every member who holds a clip can serve it. A member asks the
  holders in turn instead of always the presenter, and checks the SHA-256 before playing, so a
  peer cannot substitute audio (BitTorrent's piece hash, at our scale). The honest size of the
  win: at 64 kbps a 20-minute talk is about 9.6 MB of narration, and in a four-person mesh the
  presenter alone would upload about 29 MB. With sharing, the presenter uploads each clip roughly
  once (about 9.6 MB) and the others relay the rest. It matters most for a presenter on a phone or
  cellular, and for prefetch bursts. Rarest-first piece selection and trackers are not needed in a
  fully connected mesh of six.
- **Synchronization.** Every member starts each clip at the same session-clock time. The skew
  between members is the clock estimate's error (Cristian's algorithm, half the best round trip),
  expected in the tens of milliseconds. Captions and Guide on each screen follow that screen's own
  audio, so they are never out of step locally.
- **Feedback.** Narration that plays on a member's speakers can reach their microphone on the call
  and be heard twice. The mitigation is to lower each member's outgoing mic level while narration
  plays (Suono's `gainStream`, already used for Mic level, design note §12.3), and to let browser
  echo cancellation handle the rest. Whether Chromium and Safari cancel page-played audio from the
  mic is UNVERIFIED and is the first thing to measure on a real two-browser call.

### 6.4 Show me, shared

**A temporary copy (owner).** A tour or lesson in a session runs on a scratch deck: a second shared
text in the same session document (`Y.Text('scratch')`), seeded from the deck. Every member
switches to it when the teacher starts and back when the run ends. The real deck is never touched.

The tour runs only in the teacher's browser, with the teacher's setters (`use-studio-demo.ts`).
Members see its effects three ways: the scratch deck's edits through sync, panel and view changes
through the Present-style "everyone follows" rule for the length of the run, and the teacher's
Vetrina cursor and caption redrawn locally as theater (§6.5). Narration of the tour's captions
follows §6.3. A member's own click ends their view of the run for them only (Vetrina's take-over
rule, applied per viewer); the teacher's run continues.

### 6.5 Pointers and actions

**Always shown, with a switch (owner).** Each member's pointer is a Vetrina overlay on the others'
screens, in the bare pointer layer mode (`caption: 'none'`, Vetrina README), so it is
`pointer-events: none` and cannot click. A position travels as an address, not pixels, because
layouts differ by width: over a slide, slide coordinates; elsewhere, the nearest element with a
stable `data-demo` or guide handle plus an offset inside it. A click travels as an action name
and its target ("opened Library") and shows as Vetrina's click gesture plus a label. It never
dispatches. "Show my pointer" joins the switches in Your settings; it ships on by default.
Pointer updates ride a Tavola post at most about 20 a second, not awareness, which re-sends the
whole state on every change.

## 7. Slices

Each is one PR; 1 is a bug fix and goes first.

| # | Slice | Done when | Verify |
|---|---|---|---|
| 1 | Deck truth: host's look, Library package sync, CSS sanitized, trust prompt for code, the §6.1 rule 6 guard | Two real browsers with different palettes, modes and Libraries render pixel-equal previews of a deck using a saved theme, finish and component; a guest who types a new private name gets nothing until the host agrees | Tier 1 checker (a new untrusted-CSS sink and a code-trust prompt); two-browser screenshots |
| 2 | Activity, wide Follow, pointers and actions (§6.5), the receiver allowlist (§6.1) | Avatars show panel, view and presenting; Following mirrors them; pointers land on the same element at 1440/820/390; a forged post outside the allowlist does nothing | Two-browser check at three widths; a test that replays forged posts |
| 3 | Present together with shared narration (§6.2, §6.3) | Everyone's Present follows the presenter; clips synthesized once and fetched from any holder with a hash check; members start each clip within a measured skew; the feedback mitigation measured | Two-browser check; skew and echo measured on a real call; a grep shows no member calls TTS |
| 4 | Show me on a scratch deck (§6.4) | A tour run by one member plays on every screen, the real deck is byte-identical afterward | Two-browser check |
| 5 | AI activity and share | "asking the AI", the applied-edit line, Share-a-turn card | Two-browser check; no key or cost leaves the browser (grep the posts) |
| 6 | Comments sync | Comments ride a `Y.Array`, per the comments note | Tracked by the existing comments follow-up |

Present-with-audience (`2547-p3-live-present-with-audience.md`, retired here) becomes slice 3, tracked by `followups.d/2810-p2-live-present-together-with-shared-narration.md`.

## 8. What is not verified

- §3 is read from code, not reproduced. Slice 1's first step is the reproduction.
- Echo cancellation of page-played narration (§6.3) and the clip-start skew between members are
  not measured.
- Sending a deck's Library records costs bandwidth once per join; not measured. A saved theme
  is CSS (kilobytes); a component package can carry assets.
