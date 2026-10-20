---
status: proposed
summary: >
  Feedback on Live: it syncs the editor and preview but not Coach, the AI chat, open panels,
  Present or anyone's actions. An audit of what a session shares found a sharper problem first:
  two members can see DIFFERENT slides, because an un-themed deck renders in each viewer's own
  site palette and mode, and the host's saved themes, finishes and components never reach a
  guest. Proposed: five tiers of Studio state (deck truth, activity, follow, shared on purpose,
  never), sync the meaning of an action rather than the click, and a safety model where the
  RECEIVER decides and every message type has a named sender. Present together is host-started
  with idle members joining at once; narration rides the call mix, with compressed clips from
  the presenter for members off the call; Show me plays on every screen at once on a local
  practice deck; pointers are plain overlays that cannot click. Hardened by the adversarial trio
  the same day; the owner settled every choice on 2026-10-20.
companion:
  - ./2026-10-06-studio-live-collaboration.md
  - ./2026-10-06-live-collaboration-roadmap.md
  - ./2026-10-16-npm-plugin-threat-model.md
  - ./2026-08-17-theme-css-is-a-preview-sink.md
---

# Live — as uniform an experience as we can give, and where it stops

**Date:** 2026-10-20
**Status:** Proposed; every design choice is settled (§5). Nothing is built. Reviewed by the
adversarial trio (red team, inversion, checker) on 2026-10-20; §9 records what each found.
**Decision owner:** Sharmarke

## 1. The ask

> Live syncs the editor and preview but not the chat or Coach. It doesn't sync user actions
> like opening panels or clicking buttons. Some things we may not want to sync, for privacy or
> security, but people who collaborate should have as uniform a live experience as possible.

And, the same day:

> There needs to be support for Present mode, narration, guide and caption. We want people to
> share the Present experience. We also want Show me to be shared so someone can teach Lattice
> with little effort. Finally we want to share mouse movement and actions so people can see what
> is happening, via Vetrina, since we don't want people taking over one's real mouse. All of
> this needs to be safe, so you don't have a situation where someone uploads something from your
> computer to the Library.

## 2. What a session shares today

Read from `docs/src/components/studio/live/` and `docs/src/lib/tavola/` on `main` at `3bf8a7c`.

| Shared | Channel |
|---|---|
| The deck markdown | Yjs `doc.getText('source')` (`live-controller.ts:526`) |
| Caret and selection, active slide, "typing", name, color | Awareness fields (`AwState`, `live-controller.ts:190`), rebuilt from a whitelist on receipt; cursor, slide and typing can each be withheld (design note §12.3) |
| Mic state, chat, join and leave lines | Tavola posts (`post()`, `live-controller.ts:1391`); chat `say` goes through the host, which numbers it |
| Roster, the session clock | Tavola control messages from the host |
| "Bring everyone here" | A `summon` awareness field, honored only from the host (`live-controller.ts:321`) |
| Follow | Your active slide tracks one member's `slide`. Nothing else follows |

A session holds at most four people (`tavola/session.ts:205`). Everything else lives in one
browser: the open panel (`activeAssistant`), the view (`view`, `editMode`), Present
(`presentOpen`), the Coach card (`coachCard`), the Architect transcript, comments, checkpoints,
the site palette (`palette`) and mode (`mode`), and the Library (`savedThemes`,
`localComponents`, `savedFinishes`).

## 3. Finding: two members can see different slides

This is a correctness bug, not a missing feature: Live's promise is one deck.

**Reproduced (item 1) on 2026-10-20** with two real headless Chromium processes, the real Tavola
and Trystero transport and real WebRTC, driven by a throwaway script built from `tools/live-session-check.mjs`'s session
steps (its source is in PR #2810's comments). The host ran Indaco dark, the guest Cuoio light, and the host
replaced its deck with a two-slide deck with no `theme:` line before starting the session. After
the guest was admitted the editor text was identical on both sides, and the preview frames read:

| Member | Site palette, mode | Slide frame's theme | Slide background | Text color |
|---|---|---|---|---|
| Host | indaco, dark | `indaco-dark` | `rgb(0, 29, 51)` | `rgb(203, 217, 232)` |
| Guest | cuoio, light | `cuoio` | `rgb(250, 247, 242)` | `rgb(107, 93, 79)` |

Items 2 and 3 are confirmed by reading only: reproducing them needs a saved theme in the host's
Library, which slice 1b's test sets up.

1. **An un-themed deck renders in each viewer's own look.** `resolveDeckTheme` falls back to
   `sitePalette` and `siteMode` when the deck names no `theme:` (`StudioShell.tsx:3652-3669`).
   Those come from each browser's `localStorage` (`:921-923`) and `data-mode` (`:3633`). A host
   in Indaco dark and a guest in Cuoio light see two different decks.
2. **The deck's Library dependencies stay behind.** A deck whose `theme:` names a saved theme
   resolves its CSS from `savedThemes` (`StudioShell.tsx:3662`); saved components and finishes
   resolve the same way. A guest has none of the host's records, so those slides fall back.
   The `.lattice` file already solves this for export: `deckPackages` (`StudioShell.tsx:3674`)
   collects the records the deck uses. Live does not send them.
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
| **1. Deck truth** | Identical for everyone; no opt-out | Source (done); the session's look (§5.1); the saved themes and finishes the deck uses |
| **2. Activity** | Everyone can see it; it moves no one; withholdable like the cursor | Panel open ("in Coach"), view, presenting, the Coach card they read, "asking the AI", pointer (§7.6) |
| **3. Follow** | You opt in to mirror one person | Slide (today), panel, view |
| **4. Room events** | Started by the host (or a member the host allows); every idle member joins; anyone can leave | Present together (§7.2), Show me (§7.5) |
| **5. Shared on purpose** | The owner shares each item | An AI chat turn; comments (slice 6); checkpoints (not planned) |
| **6. Never** | Private by construction | API keys and AI cost, unsent drafts, settings (including CC, Voice and Guide switches), devices, crash reports, Library records the deck does not use |

The rule for a new piece of state: name its tier in the PR that adds it.

## 5. Decisions (owner, 2026-10-20)

Two rounds of questions, then a third after the adversarial trio. Where a later round changed
an earlier answer, only the final one is listed, with what changed.

1. **The session's look is frozen when sharing starts.** The host's resolved palette and mode
   at that moment become the look of an un-themed deck for every member, and they survive a host
   drop and a takeover (design note §12.1). A built-in palette travels by name. A saved theme
   used as the host's site palette is a Library record the deck does not use, so the host is
   asked first: "Share your theme Acme Brand so everyone sees the same deck?" If they decline,
   members use the default palette. The frozen mode also applies to a deck that names a theme but
   pins no mode. Each member's Studio chrome keeps their own palette, and exports are unchanged:
   a member's PDF or PPTX renders as it would outside the session. Nothing is written into the
   deck. Since slice 1b the host is asked (§7.1): the saved theme is listed in the Live panel with
   a Share button until the host shares it. *(Round 1 said "the host's look"; the trio showed it leaked a record
   and flipped on a takeover.)*
2. **Library dependencies: CSS arrives, code waits.** Saved themes and finishes the deck uses
   travel as the same records `deckPackages` builds. Each goes through the existing import gate
   (`refuseImportedTheme`, `import-gate.ts:97`) on receipt, then `sanitizeStyleText` (HARD RULE
   #22). `sanitizeStyleText` alone is not enough: by its own docblock it lets a stylesheet fetch
   (`lib/core/sanitize-style-text.mjs:33-37`). A component with `transform.js` is code from
   another person (`2026-10-16-npm-plugin-threat-model.md`): it falls back with a label in the
   first build, and a session-only trust set keyed by the package's SHA-256 comes later. It
   does not reuse the door approvals, which persist in `localStorage` by name
   (`code-packages/door.ts:62`).
3. **AI chat: activity plus opt-in share.** The room sees "Amina is asking the AI" (tier 2) and
   "Amina applied an AI edit to slide 3" (a system line, designed in design note §5.7 and never
   built). A turn reaches the room only when its owner presses Share, as a read-only card in the
   people chat.
4. **Follow goes wide.** Following someone mirrors their slide, panel (Coach, Lenses, Library,
   never their Chat) and view. Any action of your own stops following. On a width where their
   panel does not exist, you follow the slide and see a label.
5. **Present together is host-started; idle members join.** Only the host, or a member the host
   allows, can press "Present to everyone", and it is rate-limited. A member who has not typed in
   the last few seconds joins at once; a member who is typing gets a "Join" toast, by the same
   `myEditAt` rule Bring everyone already uses (design note §12.3). Opening Present for yourself
   stays a solo action. *(Round 2 said "everyone joins at once" from any member; the trio showed
   it was a griefing channel and that a typist's keystrokes would fire Present's shortcuts.)*
6. **Narration rides the call; clips go direct.** Members on the call hear the presenter's
   narration mixed into the presenter's call audio, so no speaker plays it twice and nobody's
   mic is turned down. Members off the call get compressed clips straight from the presenter on
   their own rate-limited channel. No swarm. *(Round 2 said clips from any holder with a hash
   check; the trio showed the gain at four members is small and the surface large, §9.)*
7. **Show me plays on every screen at once.** The teacher presses a tour, and every member's
   Studio plays the same tour at the same moment, with no extra taps (§7.5). *(Round 2 said "a
   temporary copy" of the shared deck; the trio showed the only tour starts by creating a new
   deck, which ends the session.)*
8. **Pointers are always shown, with a switch.** "Show my pointer" in Your settings, on by
   default.

## 6. The safety model — the receiver decides, and every message has a named sender

Roles are cooperative in a peer-to-peer mesh (design note §5.4): a modified client can send
anything, and Tavola delivers a post from any admitted member, viewers included
(`tavola/session.ts:1012`). So every rule below is enforced by the **receiving** browser and
holds against a hostile peer, including the host.

1. **Remote input is display only.** No peer message becomes a DOM event or calls a Studio
   setter, except through rule 3.
2. **Every message type names who may send it**, checked on receipt against the roster, the way
   summon already counts only from the host:

   | Message | Sender |
   |---|---|
   | Look, Library records | The host |
   | Present to everyone, Show me start, transport | The host, or a member the host allows |
   | Narration clip | The current presenter |
   | Activity, pointer, AI activity | The member it describes |

3. **One closed allowlist of navigation intents**, validated against fixed enums on receipt: slide
   index, panel id, view (applied only while you follow that person); Present open or closed, a
   tour id from the shipped list, a transport position (applied as a room event, §5.5 and §5.7).
   Anything else is dropped.
4. **Never on the list:** file pickers, Library writes or deletes, import, export, downloads,
   clipboard, AI calls, keys, settings, mic and camera, opening a link or window, installing a
   plugin.
5. **Nothing reaches your storage without your click.** Library records and narration clips that
   arrive in a session are held in memory, under count and size caps (each records message replaces
   the last), and dropped when it ends. "Save to my Library" is a local action. (The deck text itself is the
   exception, as today: a guest's linked copy is saved, design note §5.5.)
6. **Nothing leaves your Library because of what a peer typed.** The host sends only the records
   the deck used when sharing started (the baseline). A record a peer's edit newly names asks the
   host first: "Amina's edit uses your saved theme 'Acme Brand' — share it?" The baseline is kept
   in the host's sealed save and handed to the heir, so a reload or a takeover cannot recompute it
   from a deck an attacker shaped; an heir starts from an empty baseline for its own records. The
   guard covers every name the host's browser resolves from local storage, not only the three in
   `deckPackages`: `asset:` photos (`StudioShell.tsx:2376`), zip plugins resolved by fence name
   (`:1266`), and code packages resolved by class name.
7. **No peer can spend your money.** Only the presenter synthesizes narration, on their own key.
   The narrated text is frozen when Present starts; an edit during the run re-quotes the cost and
   the presenter approves it. A per-run character budget caps the rest.
8. **Received bytes are bounded before they are parsed.** Tavola sets Trystero's
   `maxReceiveBytes` to 8 MB, two of its own `MAX_MESSAGE` (4 MB, `session.ts:181`), which drops
   anything larger anyway; Trystero's default is 256 MiB. The budget is per room for concurrent
   transfers, so two full messages can arrive at once. A clip's duration is checked against what its
   text length predicts, from the header, before `decodeAudioData`, because a 4 MB clip at 8 kbps
   decodes to about 800 MB of samples.
9. **Labels are local strings.** "Amina opened Library" is built from an enum and the roster
   name, never from text a peer sent. Names are deduplicated with look-alike characters folded,
   and room events are labeled by role ("Host: presenting").

## 7. How each piece works

### 7.1 Deck truth (slice 1)

As §5.1, §5.2 and §6 rule 6. Slice 1 ships in two parts: 1a the frozen look, 1b the CSS records
through the import gate.

**1a as built (2026-10-20).** `LiveController` freezes the look in `wire()` when it starts a session
(`freezeLook`: a built-in palette by name, anything else as null), keeps it in the host save (an
empty look as an explicit null, so a reload never re-freezes the palette of the moment), and
sends it in the `tip` post the host sends each admitted member 400 ms after admission, in the
`lines` reply to a member's `since`, and in the `sids` post to the heir. A member takes it only in
the `fromHost` branch of `onPost`, and only if `cleanLook` finds a built-in name and a mode. An
heir keeps the look it holds, so a takeover changes nothing, and a newcomer admitted by the heir
gets the same look. The lobby names the frozen look, never the host's palette of the moment.
`LiveCollab.look` carries it to `StudioShell.tsx`, whose `preview` uses it in place of the
browser's palette and mode on every in-app deck surface (the focused preview, the map, Present,
the pickers, Read); `ownPreview`, without the look, feeds the Share sheet and the `.lattice`
packages, so export bytes do not change. The host is told a saved theme is not shared only when
the deck names no theme of its own.

Measured on real headless Chromium browsers, the real transport and WebRTC (2026-10-20, scripts in
PR #2810's comments). Steady state, two members: both slide frames read `indaco-dark`, background
`rgb(0, 29, 51)`, while the guest's own site stayed Cuoio light. Takeover, four browsers with four
site looks (indaco/dark host, cuoio/light, onyx/light, and a newcomer in cuoio/light): every frame
read `indaco-dark` before the host's tab closed, after the heir took over (about 42 s later), and
on the newcomer the heir admitted. The independent checker (tier 1) found five defects, all fixed
with tests: exports followed the session look (a saved-theme host's PDF lost its theme); an heir
holding no look re-froze its own palette on a reload; the host notice fired when the deck named a
theme; the lobby named the host's palette of the moment; and the docs said "no `theme:`" where
the frozen mode applies to any deck that pins no mode. Known and left: the preview renders once
in the member's own look before the session's applies (one extra frame, `sessionLook` state copied
in an effect).

**1b as built (2026-10-20).** The host's Studio passes the controller its own records the deck uses
(`LiveDeps.records`: saved theme CSS, saved finish recipes, custom component names, from the same
`deckPackages` a `.lattice` file carries) and its saved site palette (`siteTheme`). The controller
shares a record only when its key (`t:`, `f:`, `c:` and a name) is in the host's shared set: the
deck's records when sharing started, plus each one the host shares from the Live panel. The panel
lists every record the deck uses that the session does not have ("Not shared yet", with a Share
button each, "Share name" for a component), and the list stays until it is shared, so a missed
prompt never leaves a silent difference. A toast points at it once per record and says whether this
browser or someone else made the edit. A saved site palette is listed as the session look; sharing
it captures the theme (`lookTheme`), so the host changing its site palette later never takes it from
the others, and the sealed host save keeps it, the shared set and the look. An heir relays the
records it received and shares none of its own without a yes. A member takes a `records` post only
from the host: themes pass `THEME_NAME`, the shipped names, a 128 K-character cap (768 K for all of
them, so a message stays under 4 MB) and `refuseImportedTheme`, with each verdict cached so a theme
sent again is not checked again; finishes pass `FINISH_NAME` and the shipped finish names and are
rebuilt with `coerceRecipe` and `generateFinishCss`; component names join the member's lint and
Coach vocabulary, so nobody's editor offers to "fix" the host's class. A newer message stops an older
check at the next theme. Everything is held in memory. `StudioShell.tsx` renders with the records
(`renderThemes`, `renderFinishes`, the finish class, the lint vocabulary) while the Share sheet and the
`.lattice` packages read only this browser's Library (`ownPreview`, `ownFinishClass`,
`ownFinishExtraCss`, `exportExtraCss`), so export bytes do not change.

Measured on real headless Chromium browsers, the real transport and WebRTC (scripts in PR #2810's
comments). A host with a saved theme `acme-brand` (Onyx renamed) and a saved finish `linen` shared a
deck naming both with a guest whose Library was empty and whose site was Cuoio light: both slide
frames read theme `acme-brand`, background `rgb(255, 255, 255)`, class `finish finish-linen`, and the
guest's Library was still empty afterward. A host whose site palette was `acme-brand`, on an
un-themed deck: both frames read `cuoio-dark` (the default, in the host's dark mode) before Share and
`acme-brand` after, and the panel's list emptied. The list rendered at 1440, 820 and 390 px. The
adversarial trio (2026-10-20) found, and the commit fixes with tests: a test the first cut broke;
component names sent without consent, so an editor could probe the host's Library; the shared site
theme dropping out when the host changed its site palette; a reload losing the look before the
Library loaded; shipped finish names accepted; a refused theme re-checked on every message; prompts
lost when one toast replaced another; and records re-sent on every keystroke. Held: no peer content
reaches a document except through the existing style sinks, which run `sanitizeStyleText`; records
are taken only from the host; members' exports and Library are unchanged.

**Slice 2 as built (2026-10-20).** Activity rides presence as a `doing` field (the open panel, the view,
and whether the person is presenting), which the receiving browser rebuilds through `cleanDoing` from fixed
lists, so a panel or view outside them never arrives. The AI Chat panel is never reported: while it is open,
the last other panel stands in, so opening Chat neither shows nor closes anything for a follower. "Show what
I'm doing" withholds the field at the one place presence leaves the browser (`setLocalStateField`); a
follower of someone who hides it keeps following their slide only, as with a hidden slide.

Follow mirrors the followed person's panel and view through `LiveHost.followDoing`, only where the shell says
it can (`canFollowDoing`: the desktop rail; a phone or tablet follows the slide and is never offered a Go it
cannot use). It never mirrors Fabricate, which is a workspace of one's own. It never moves someone who typed
in the editor in the last 2.5 s or has focus in another text field: they get one "X opened Coach · Go" per
burst of typing, and Go takes them wherever the person is when it is pressed, and only if they still follow
the same person. A panel or view change the follower makes stops following, as a slide change does.

Pointers ride a `ptr` post in slide coordinates. At most about ten a second leave a browser (the last
position wins); a held pointer is said again every 2 s; one arriving faster than 30 ms after the last move,
or a click faster than 150 ms after the last click, is dropped; a value outside 0..1 or a slide past 10,000 is
dropped; a pointer still for 6 s, or whose member left, disappears. A pointer names its slide, so a person
who hides their slide sends none. Touch sends nothing (a finger on the slide is a swipe). `LivePointers.tsx`,
loaded with the session, draws them in a `pointer-events: none` fixed portal clipped to the preview: it never
dispatches an event or scrolls; it draws nothing on a hidden or inert frame (a phone on its Source pane); it
measures the frame on each pointer, on resize and scroll, and every 500 ms for a zoom's transform; it honors
reduced motion, and a long name is cut to 12 rem.

Measured on real headless Chromium browsers: a guest read "Slide 1 · in Coach" on the host's row; following
the host opened the guest's Library when the host opened theirs, and kept following; the host's pointer at
slide (0.500, 0.400) drew on the guest's slide at (0.500, 0.400) with its click ring, and showed at 820 and
390 px on the Preview pane; a 390 px guest on the Source pane drew none. The adversarial trio found and the
commit fixes, with tests: a pointer naming a hidden slide; Follow pulling a follower out of Fabricate (losing
the work), moving them while typing, and closing their panel when the leader opened Chat; held pointers
vanishing, touch sent as clicks, a pointer left on a slide its sender left; a measuring loop every frame; a
flood of clicks past the gate; dead Go toasts on phones; a pointer drawn over a phone's editor; and two tests
that could not fail (each now fails when its guard is removed).

### 7.2 Present together

**What travels is a transport, not pixels.** Captions and Guide derive from the deck plus a
position in time (`present-guide.ts`, `PresentCaption.tsx`, the Cadenza track). The presenter
publishes slide, build step, play or pause and track position, stamped on the session clock
(`session.now()`, design note §5.7). Each member renders captions and Guide locally. A late
joiner or a returning phone gets a snapshot of the current transport on join, the way chat uses
`tip` and `since`. CC, Voice and Guide stay each viewer's own switches.

**Present opened by a room event takes no keys until you click into it.** Today Present's window
`keydown` handler has no editable-target guard (`PresentOverlay.tsx:1883`), so a member typing
when Present lands would fire `f` (fullscreen) and `s` (a Stage window). A member's Present moves
focus out of the editor and ignores the keyboard map until that member clicks it.

**iPhones need one tap to play sound** (`read-aloud.ts:950`, the stage unlocks only inside a
tap). A Present opened by a room event shows captions at once and a "Tap to listen" button.

**Prerequisite:** `followups.d/2704-p2-present-follows-the-hub.md`. Present seeds from an
authored-chunk index and drifts on heading-split decks, so a transport keyed by slide index would
put members on the wrong slide until 2704 lands.

**Slice 3, step 1 as built (2026-10-20): Present together, without narration yet.** The transport is
Present's own position (the rendered slide in its lens, the page of a split slide, the lens), not the
editor's chunk index, so it does not wait on `2704-p2-present-follows-the-hub.md`: every member renders the
same deck, so the same Present index is the same slide. The host's "Present to everyone" (the Live panel's
session menu) opens its Present, which reports each move (`presentTransport`); the controller posts a
`present` room event to everyone and a snapshot to anyone admitted meanwhile. A member takes it only from the
host, through `cleanTransport` (slide and page 0..10,000, a lens id of word characters), and ignores a
restart within 2 s. An idle member's Studio opens Present following it; a member typing in the editor or
another field gets "Sharmarke is presenting to everyone · Join". A Present the room opened blurs the editor
and ignores every key but Escape until the member clicks into it. Any move of the member's own detaches them,
with a "Rejoin" chip; the host's Stop, the host leaving Present, or a change of host closes the room's
Present. Measured on two real headless Chromium browsers: the guest's Present opened at the host's 1 / 7,
followed to 3 / 7, ignored an arrow key before a click, went to 4 / 7 on its own with "Rejoin" shown,
rejoined at 3 / 7, and closed when the host stopped. Narration (§7.3) is the next step; until then a member
follows with Present's silent caption cadence under their own control.

### 7.3 Narration — the presenter's voice, made once

- **Made once, on the presenter's key.** Lattice is bring-your-own-key, so a member without a key
  cannot synthesize at all; the presenter must. The money is small (Kokoro lists at about $0.62
  per million characters, `playground/tts-cost.js:16`, so a 20-minute talk of about 18,000
  characters costs about a cent), but it is still the presenter's, so §6 rule 7 applies.
  Rehearsed sentences come from the presenter's clip store (`narration-store.js`) at no cost, and
  `measureNarration` (`narration-bake.ts:573`) quotes the rest before the run.
- **Prepared before it plays.** `read-aloud.ts` synthesizes each sentence as it plays, so a member
  would trail the presenter by synthesis plus transfer time. Narrated Present together prepares the
  presenter's clips first; until they are ready, members get captions only.
- **Members on the call hear it through the call.** The presenter's Suono stage already routes
  the call send through a Web Audio graph (`gainStream`, design note §12.3); the narration is
  mixed into that send. One speaker path per listener means no echo and no mic ducking, and
  speech at call quality (Opus at about 32 kbit/s, roadmap §3.1) is clear. Whether the mix
  sounds right on a real call is UNVERIFIED and is slice 3's first measurement.
- **Members off the call get clips direct.** The clip store keeps what the engine returned, not a
  compressed copy (`narration-bake.ts:771-794`): Kokoro and Gemini return raw 24 kHz WAV, about
  7.7 times the size of the 64 kbps the bake writes (`lib/core/narration-encode.mjs:56`). So the
  presenter compresses each clip before sending (about 107 ms a sentence, `narration-bake.ts:794`)
  and sends it on its own Trystero action with backpressure on `bufferedAmount`. Today every post
  shares one ordered channel (`adapters/trystero.ts:174`), and a clip burst would stall edits and
  pointers behind it. Clips are addressed by content hash, served only from the current run's
  set, never by text key from the presenter's store (`voice-model.js:273-275` keys are plaintext,
  so serving by key would let a member probe the presenter's other decks).
- **Sync is at sentence boundaries.** Each member's captions and Guide follow that member's own
  audio. Bluetooth output adds a delay the page cannot measure (`read-aloud.ts`), so the target is
  the presenter-to-member lag, re-synced at each sentence, not a cross-member skew nobody hears.
- **Size, measured by arithmetic:** at 64 kbps a 20-minute talk is about 9.6 MB per member off the
  call. With at most three other members that is at most about 29 MB of upload for the presenter,
  only for members off the call.

### 7.4 Why the swarm was cut

Round 2 asked for clips shared by any holder, like BitTorrent. The trio showed: a session holds at
most four people, so the saving is at most two copies of the narration (about 19 MB in 20 minutes,
about 0.13 Mbit/s); the hash check exists only to make relaying safe; holders serving from their
store become an oracle for other decks' sentences; and every new binary request protocol is another
surface for oversized or slow messages. The call mix removes most clip traffic anyway. If sessions
grow past four (roadmap §2, an SFU), revisit it there.

### 7.5 Show me on every screen at once

The teacher presses a tour. Their browser sends one room event: the tour id, from the shipped list
(`tours/index.ts`), and a start time on the session clock. Every member's browser runs that tour
itself, at that moment.

- **On a local practice deck.** A session-mode tour binding replaces the steps that would leave
  the session or touch shared state: `createFirstDeck` (`tours/tour-kit.ts:93`) opens a local,
  unsaved practice deck instead of a real one, so the session's deck binding
  (`live-controller.ts:1176`) never sees a deck switch; typing goes to the practice deck, never
  `Y.Text('source')`; the palette and mode the tour sets (the `applyPalette` and `toggleMode` bindings, restored at
  `use-studio-demo.ts:178-179`) are left alone,
  because the look is frozen (§5.1); the deck menu, Share and the Architect are not opened.
- **Why this is safe** although a peer starts it: the tour is code that ships with Lattice, the
  message carries only an id from a fixed list, and the practice deck is thrown away at the end.
  The real deck, the session and each member's Library are untouched.
- **Every screen in step.** Each member's Vetrina run follows its own layout, so a phone gets the
  phone storyboard. The run starts at the same session-clock time; a member who clicks takes over
  their own run only (Vetrina's take-over rule), and the others continue. iPhones show captions and
  "Tap to listen".

### 7.6 Pointers and actions

Pointers are not Vetrina cues: `stage.point()` is an eased glide for choreographed tours, and cues
call `reveal()`, which scrolls the page (`vetrina/stage.ts:1478`). A remote pointer is one plain,
absolutely positioned element per member, with `pointer-events: none`, drawn in Vetrina's cursor
style. It shows over a slide in slide coordinates; elsewhere it shows as a label on that member's
avatar ("in Library"). Updates ride a Tavola post at about 10 a second, with interpolation, and
never scroll. A click travels as an action name from an enum and shows as Vetrina's click ripple
plus a local label. Nothing a peer sends becomes a selector.

## 8. Slices

Each is one PR; 1 is a bug fix and goes first. Slices with a security surface get the adversarial
trio (HARD RULE #25, `engineering/orchestration.md` tier 2).

| # | Slice | Done when | Verify |
|---|---|---|---|
| 1a | The frozen look (§5.1) | The §3 reproduction, re-run, shows the same theme on both sides; two real browsers with different palettes and modes render pixel-equal previews of an un-themed deck, through a host drop and a takeover | Tier 1 checker; two-browser screenshots |
| 1b | Library records (§5.2, §6 rules 5, 6, 8) | A deck using a saved theme and finish renders pixel-equal; a guest who types a new private name gets nothing until the host agrees; code components fall back with a label | Adversarial trio; two-browser screenshots |
| 2 | Activity, wide Follow, pointers, sender rules and allowlist (§6, §7.6) | Rows show panel, view and presenting; Following mirrors them on desktop and follows the slide elsewhere; pointers draw at 1440/820/390; a forged post from the wrong sender or outside the allowlist does nothing | Adversarial trio; a test that replays forged posts; two-browser screenshots at three widths |
| 3 | Present together and narration (§7.2–7.3) | Host starts it; idle members join, a typist gets a toast; keys stay inert until clicked; the call mix and direct clips work; no member calls TTS | Adversarial trio; two-browser recording at phone and desktop width; the call mix measured on a real call. Needs 2704 first |
| 4 | Show me on every screen (§7.5) | A tour started by one member plays on every screen at once, and the shared deck is byte-identical afterward | Tier 1 checker; two-browser recording |
| 5 | AI activity and share (§5.3) | "asking the AI", the applied-edit line, a Share-a-turn card | Tier 1 checker; a grep shows no key or cost leaves the browser |
| 6 | Comments sync | Comments ride a `Y.Array`, per the comments note | `followups.d/2810-p4-live-comments-sync.md` |

## 9. What the adversarial trio found (2026-10-20)

**Checker.** No gate rejects the note (`build:check`, `check-ownership`, lint, the follow-up and
US-English tests). It refuted four claims, all corrected above: clips are not stored compressed;
mic state is a post, not awareness; a session caps at four, not six; `deckPackages` is at `:3674`.
It found the tiers contradicted §6 on Present (now tier 4) and that security slices needed the
trio, not a single checker.

**Inversion.** "Uniform" had been read as "every screen does the same thing at once", which
undid the 10-06 rule that nobody is moved while typing. It showed narration fails silently on
iPhones without a tap, local playback beside open mics creates the echo it then tries to fix, the
swarm buys little at four members, the tour code cannot run on a shared copy, and Present's slide
index drifts on heading-split decks (2704). Each led to a change in §5 or §7.

**Red team.** §6 said what a message may do, not who may send it; the sender table is the fix.
It found: an editor could make the presenter pay for narration by churning text (§6 rule 7); a
4 MB clip can decode to about 800 MB, and `maxReceiveBytes` is unset (rule 8); Present opened by a
peer turns a typist's keys into fullscreen and window opens (§7.2); `sanitizeStyleText` lets a
peer's theme fetch (§5.2); the rule 6 baseline did not survive a reload or a takeover, and missed
photos, plugins and code packages; serving clips by text key would leak other decks; labels and
names could be spoofed (rule 9); Vetrina cues scroll the page (§7.6). Held: posts from strangers
and removed members are dropped, viewers' document updates are dropped, a peer cannot post under
another's id, and a deck `style:` with a remote `@import` is stripped (run).

## 10. What is not verified

- §3 item 1 is reproduced on two real Chromium browsers (§3). Items 2 and 3 are read from code
  only; slice 1b's test reproduces them with a saved theme.
- The call mix (§7.3), the iPhone tap (§7.2), and a Present opened by a room event on a phone have
  not run on a real device.
- The red team's findings on keys (§7.2), theme fetches (§5.2) and scrolling (§7.6) are reasoned
  from code, not run in a browser.
- Sending a deck's Library records costs bandwidth once per join; not measured.
- An heir holds the records it relays in memory only, so an heir that reloads has none to relay and
  its newcomers see fallbacks; members already in keep theirs.
- Read · Article renders the session's records like every in-app surface, so printing it from the
  browser carries the host's theme, unlike an export. Left as is: it is a reading view, not an
  export, and the exports are what §5.1 keeps to each member's own Library.
- Custom components still fall back (their code is not shared); a member is told once, by name.
