---
status: proposed
summary: Live peer-to-peer collaboration in the Studio. One link starts it - the host shares it, the guest opens it, knocks, the host admits, and both edit the same deck with live carets, presence on the slide navigator, follow mode, text chat, and audio/video in a new Collaborate panel on the left rail. Edits and media travel browser to browser. Peers find each other over public Nostr relays through Trystero, so Lattice runs no server, pays nothing and stores nothing. Retargets the two June notes from the removed Drawing Board to the Studio and replaces their open questions with a concrete experience.
companion:
  - ./2026-06-14-yjs-collaboration-exploration.md
  - ./2026-06-15-webrtc-av-collaboration.md
  - ./2026-07-04-comments-layer.md
---

# Live collaboration in the Studio — share a link, and you are in

**Date:** 2026-10-06
**Status:** Proposed. Design only; no code yet.
**Decision owner:** Sharmarke
**Surfaces:** `docs/src/components/studio/` — `StudioShell.tsx`, `chrome-parts.tsx`
(`ActivityRail`), `Editor.tsx`, `studio-panels.ts`, `panel-shells.tsx`,
`StudioChromeSkeleton.tsx`; a new `collab/` folder. No server.

## 1. The ask

> Someone shares a collaboration link and that triggers collaboration. A new panel and
> icon button on the left toolbar, where Coach and Chat are, is the collaboration portal:
> chat, video, audio. The focus stays on the editor and preview, because those drive a
> productive session. Prioritize knowing who is participating, the initial handshake,
> and managing the session. Bottom line: I share a link, the other person clicks it, and
> we are collaborating.

## 2. Where the June notes stand, and what changed

Two notes from June already worked out the transport:
[`2026-06-14-yjs-collaboration-exploration.md`](./2026-06-14-yjs-collaboration-exploration.md)
(document sync with [Yjs](https://yjs.dev), a CRDT — a data type that merges concurrent
edits without conflicts) and
[`2026-06-15-webrtc-av-collaboration.md`](./2026-06-15-webrtc-av-collaboration.md)
(audio and video on the same WebRTC connection). Their analysis of NAT traversal,
corporate firewalls, mesh limits and costs still holds, and this note does not repeat it.

Three things changed since, and they are why this note exists:

1. **The Drawing Board is gone.** Both notes target `drawing-board.astro`; the Studio
   replaced it (`2026-07-03-studio-succession.md`). Every code pointer in them is dead.
2. **Neither note designs the experience.** They say "a Share button mints a room URL"
   and stop. Nothing covers who is in the room, how they got in, or what the host can do
   about it — the three things this ask puts first.
3. **The June Yjs note's update recommended a server relay** (Cloudflare Durable Objects)
   over peer-to-peer, for corporate firewalls. This ask is explicitly peer to peer, and
   the owner ruled out any server or account of ours (§10). §7 uses public relays for
   matchmaking and accepts the corporate-network cost that comes with that.

## 3. What the Studio gives us today

A scout pass mapped the Studio on 2026-10-06. The facts that shape the design:

| Fact | Where | Consequence |
|---|---|---|
| The left rail is one nullable enum, `activeAssistant: 'coach'\|'chat'\|'lenses'\|'library'\|null` — one open tool panel at a time | `StudioShell.tsx:588`, `ActivityRail` in `chrome-parts.tsx:272` | Collaborate is a fifth value. It toggles like Chat, and it closes when Coach opens |
| The rail exists only on desktop in Craft; tablet uses the ⋯ menu and a left sheet; mobile uses a bottom bar that is **full at eight cells** with a protected set | `StudioShell.tsx:6312`, `:5603`, `:6240-6288` | The live session cannot depend on the panel being open, and mobile needs an entry point that is not a ninth cell (§5.6) |
| Deck source is plain React state; CodeMirror receives it through a prefix/suffix diff, and those inbound dispatches land on the local undo stack | `StudioShell.tsx:414`, `Editor.tsx:854-884` | During a session the editor must bind to a shared `Y.Text` directly, and undo must become "undo **my** edits" (§6.1) |
| The active slide is `activeSlide`; `goToSlide` and `onEditorCursorSlide` write it | `StudioShell.tsx:439`, `:2603`, `:2642` | Presence ("Amina is on slide 4") and follow mode hook in here |
| Decks live in `localStorage` (`lattice-studio-src-<id>`) | `studio-store.ts:21` | A guest's copy of a shared deck is an ordinary deck entry (§5.5) |
| No identity: the rail's account chip is a hard-coded "SA"; comment authors are "You" | `chrome-parts.tsx:309`, `slide-comments.ts:106` | Collaboration has to introduce a name and a color. The comments note already says identity "lands with collaboration" |
| The Studio reads no hash; OpenRouter OAuth drops every query parameter on its round trip | `architect.ts:1944` | The link uses the hash fragment, and the Studio keeps the join intent in `sessionStorage` across OAuth (§4.1) |
| No `yjs`, no WebRTC code, no Worker in the repo | `docs/package.json` | Greenfield; everything collab is lazy-loaded so solo users pay nothing |

## 4. The handshake — from link to editing together

The whole flow, end to end. The host is the person who shares; a guest is anyone who
opens the link.

```
 HOST                                        GUEST
 ────                                        ─────
 1. Opens Collaborate, clicks
    "Start live session"
    → link copied to clipboard
                    ── sends link (Slack, email, …) ──▶
                                             2. Opens link. Studio boots into
                                                the LOBBY card: deck title, host
                                                name, "Your name", camera/mic
                                                preview (off by default)
                                             3. Clicks "Ask to join"
 4. Knock appears: toast + rail badge
    + a row at the top of the panel
    "Amina wants to join  [Deny] [Admit]"
 5. Clicks Admit (or auto-admit is on)
                    ── deck state + roster ──▶
                                             6. Lands in the Studio on the HOST's
                                                current slide, with the deck,
                                                carets and presence live.
 Both: "Amina joined" in the chat feed.
```

Three clicks for the guest's whole path (open, type a name the first time only, ask to
join), one for the host. From the second session on, the guest's name is remembered, so
the guest path is open → "Ask to join".

### 4.1 The link

```
https://laticent.github.io/lattice/studio#live=<room>.<secret>
```

- **`room`** — 128 random bits, base64url. It names the meeting place on the public
  relays.
- **`secret`** — 256 random bits, base64url. It is Trystero's room `password`: Trystero
  encrypts every connection offer and answer with an AES-GCM key derived from it, so a
  relay carries only ciphertext.
- **It lives in the fragment** (after `#`). Browsers never send the fragment to any
  server, so neither GitHub Pages nor any relay ever sees the secret.
- **Survives OAuth.** On load the Studio moves the fragment into `sessionStorage` and
  scrubs it from the address bar (so it does not leak into a screenshot or a history
  sync). If the guest connects OpenRouter mid-lobby, the join resumes on return.
- **Link role.** The host picks "Can edit" (default) or "Can view" when copying. The role
  rides in the encrypted hello, not in the URL.

### 4.2 The lobby (guest side)

A centered card over the dimmed Studio chrome — the guest sees where they are going
before they arrive.

```
┌──────────────────────────────────────────────┐
│  ◍ Sharmarke invited you to                  │
│    Q3 Board Review                           │
│    12 slides · Indaco                        │
│                                              │
│  Your name  [ Amina                       ]  │
│             ● your color                     │
│                                              │
│  ┌──────────────┐   [🎤 Mic off ]            │
│  │  camera off  │   [📷 Camera off]          │
│  └──────────────┘                            │
│                                              │
│               [ Ask to join ]                │
│  Your edits and calls go directly between    │
│  browsers. Lattice has no server that sees them. │
└──────────────────────────────────────────────┘
```

(The glyphs in these sketches stand for lucide icons; nothing ships a typed glyph —
HARD RULE #29.)

- **Deck title and host name** come from the host over the peer connection, as the first
  message after it opens. The host sends nothing else until it admits the guest (§4.4).
- **States the card must draw:** connecting; waiting for the host ("Sharmarke has been
  asked to let you in"); denied ("The host didn't admit you"); host not here ("This
  session isn't live right now — ask Sharmarke to open it"); link revoked; session full;
  could not connect (with the one-line network explanation and a retry).
- **Mic and camera start off.** Joining the deck never turns on a device. The preview
  only asks for permission when the guest clicks a device button.

### 4.3 The knock (host side)

- A toast in the Studio's normal toast slot: **"Amina wants to join"** with **Admit** and
  **Deny**. It does not steal focus from the editor, so the host can finish a sentence.
- The rail icon gets a badge, and the Collaborate panel shows the request as its top row.
- **Auto-admit** is a toggle in the panel ("Let people with the link in automatically"),
  off by default. With it on, the knock becomes a "Amina joined" notice and the flow is
  literally click-and-collaborate.
- **Why knock by default:** the ask puts "know who is participating" first. A link travels
  (forwarded emails, a pasted Slack channel); the knock is the one moment the host can
  check the name against who they invited. It costs the host one click.
- **Names are self-asserted.** The knock shows the name the guest typed. There are no
  accounts, so nothing proves Amina is Amina; the lobby copy and this note say so plainly.

### 4.4 What admission does

1. Trystero has already opened a WebRTC connection between the host and the guest when
   the guest entered the lobby (the relays carried only the encrypted offer and answer).
   Until admission, the host sends only the title and host name over it, and the guest's
   knock comes back the same way.
2. On admission, over that connection the host sends the Yjs document state and the **roster**: each
   admitted peer's id, name, color and role.
3. Every peer in the room reaches every other (Trystero builds a mesh), but **a peer sends
   document, awareness, chat or media only to ids on the host's roster**. A peer that holds
   the link but was not admitted gets a connection and nothing over it.
4. The guest's Studio opens the shared deck, jumps to the host's slide, and the panel
   opens on the People section so the guest sees who is here.

## 5. The Collaborate panel and the session in the Studio

### 5.1 The rail button

- **Icon:** lucide `UsersRound`, registered in `icons.ts` the way `ChatIcon` is.
- **Caption:** "Live". It sits in the Tools group after Chat: Coach · Chat · **Live** ·
  Library · Views. Accessible name "Toggle Live" (the e2e/tour naming contract).
- **States:** idle (plain); live (a small filled dot in `var(--accent)`); knock pending or
  unread chat (a count badge). The badge is the only way a closed panel asks for
  attention.

### 5.2 Panel layout

The panel is the **portal**, not the workspace. It is narrow on purpose (default 232px,
the existing assistant width; max 420px) so the editor and preview keep the room.

```
┌ LIVE ● 00:14:32 ─────────── ⋯ ┐   ← header: live dot, elapsed time,
│                               │     menu: copy link, stop link, end session
│ ┌ Invite ───────────────────┐ │
│ │ [ Copy link ▾ Can edit ]  │ │   ← link role picker in the split button
│ │ Auto-admit         ( ○ )  │ │
│ └───────────────────────────┘ │
│                               │
│ Waiting (1)                   │
│ ◍ Bruno       [Deny] [Admit]  │   ← knocks, always on top
│                               │
│ In this session (3)           │
│ ◍ Sharmarke (you) · host      │
│   Slide 4 · editing      🎤   │
│ ◍ Amina · can edit            │
│   Slide 4 · speaking ))) 🎤   │   ← speaking ring on the avatar
│ ◍ Chen · can view       [⋯]   │   ← host row menu: follow, role, remove
│   Slide 9                🔇   │
│                               │
│ ┌ Call ─────────────────────┐ │
│ │ [🎤] [📷] [Join call ]     │ │   ← audio-first; video is opt-in
│ │ ┌─────┐┌─────┐            │ │   ← video tiles only when someone
│ │ │Amina││Chen │  ⇱ pop out │ │     has a camera on
│ │ └─────┘└─────┘            │ │
│ └───────────────────────────┘ │
│                               │
│ Chat ──────────────────────── │
│ Amina: can we cut slide 6?    │
│ Chen: +1, it repeats  [→ 6]   │   ← slide chip jumps the preview
│ · Amina applied an AI edit    │
│   to slide 3                  │   ← system lines, muted
│ [ Message…            ] [➤]   │
└───────────────────────────────┘
```

Section order follows the ask's priorities: **who** (waiting, then present), then
**talk** (call), then **text** (chat). Chat takes the remaining height and scrolls; the
other sections are fixed.

### 5.3 Who is here — presence lives on the editor and preview

The panel lists people; the **work surfaces show them**. This is where "the focus is the
editor and preview" lands:

- **Editor carets.** Each peer's caret and selection in their color, with a name flag that
  shows while they type and fades after two seconds of idle (the `y-codemirror.next`
  awareness rendering, restyled with tokens).
- **Slide navigator.** Each thumbnail shows the avatars of the people on that slide, at
  most three plus "+N". At a glance: "Amina and Chen are both on 4."
- **Preview corner.** When someone else is on the slide you are looking at, a small avatar
  stack sits in the preview's top-right corner, so you know a change could land under you.
- **Follow.** Click a person's avatar (in the panel, navigator or preview corner) →
  **Follow Amina**: your active slide tracks hers. A slim bar above the preview says
  "Following Amina · Stop". Any navigation of your own stops following, so follow never
  fights you.
- **Bring everyone here** (host, in the ⋯ menu): asks every guest's view to jump to the
  host's slide. A guest who is typing gets a toast with "Go" instead of a jump, so nobody
  loses their caret mid-word.
- **Present together** (later slice): when the host opens Present, guests get "Sharmarke
  is presenting · Watch", which opens Present following the host. Good for rehearsal.

### 5.4 Managing the session (host)

| Action | Where | What happens |
|---|---|---|
| Admit / Deny | knock toast, panel row | §4.3 |
| Change a role (edit ↔ view) | person row ⋯ | Roster update; a viewer's editor goes read-only |
| Remove | person row ⋯ | The peer is disconnected **and the secret rotates**: the host sends the new secret to the remaining peers over their encrypted connections, so the removed peer's link is dead |
| Stop sharing the link | header ⋯ | Rotates the secret; people already in stay; the old link reaches "link revoked" |
| End session | header ⋯ | Everyone disconnects; guests keep their copy (§5.5) |
| Auto-admit | panel toggle | §4.3 |

**Roles are cooperative, not a security boundary.** In a peer-to-peer mesh nobody sits in
the middle to refuse a write. Honest clients enforce "can view"; a hostile guest with a
modified client could still send edits. The mitigation that is real is admission itself
(only roster ids get connections) plus Remove-with-rotation. The panel copy does not
promise more than that.

**If the host drops** (closes the tab, loses network): guests stay connected to each other
and keep editing; the panel says "Sharmarke is away — new people can't join until the host
returns." When the host comes back with the same link, their browser re-syncs and resumes
hosting. Handing the host role to someone else is a later slice.

### 5.5 Whose deck is it?

- **The host's deck is the deck.** It stays in the host's `localStorage` as today.
- **A guest gets a linked copy**: a normal deck entry titled "Q3 Board Review" with a
  "Shared by Sharmarke" tag in the deck switcher. It updates live during the session.
  After the session ends the guest keeps it as an ordinary deck (they can delete it). This
  matches the local-first posture: nothing is lost if the session ends unexpectedly.
- **Rejoining** with the same link re-attaches the copy instead of creating a second one.

### 5.6 When the panel is closed, and on smaller screens

The session must not depend on the panel being open — closing it is how you get the room
back for the editor.

- **Presence pill in the header.** While live, the header shows an avatar stack and a mic
  toggle next to Share. Clicking the stack opens the panel; the mic toggle works in place.
  This is the always-visible surface on every width.
- **Floating video.** If anyone has a camera on and the panel is closed, the tiles collapse
  into a small draggable strip over the preview's corner ("pop out" in §5.2 does the same
  with the panel open). It never covers the editor.
- **Tablet:** "Live" joins Coach and Chat in the ⋯ menu, and opens as the same left
  `PanelSheet` they use.
- **Mobile:** no ninth bar cell. The Share sheet gets a first row, **"Collaborate live"**,
  and the header presence pill opens the panel as a bottom sheet. The lobby card is
  full-screen.

### 5.7 Chat

- **Human chat, separate from the AI chat.** The AI Chat panel stays per-person; each
  collaborator drives the Architect on their own OpenRouter key. The Live panel's chat
  reuses the composer and shell classes (`CHAT_COMPOSER_*`, `ChatShell` in
  `panel-shells.tsx`) but not the AI message model.
- **Slide chips.** "slide 6" or "#6" in a message renders as a chip that jumps your preview
  to that slide.
- **System lines** for joins, leaves, role changes, and applied AI edits ("Amina applied an
  AI edit to slide 3"), so a change that landed under you has a visible cause.
- **Lifetime:** the chat is a `Y.Array` in the session document, so late joiners see the
  history. It ends with the session; it is not saved into the deck. (Turning a message
  into a slide comment is a later slice, when comments sync.)

### 5.8 Calls

- **Audio first.** "Join call" joins with the microphone; the camera is a separate toggle.
  The June A/V note's reasoning holds: voice scales further in a mesh and is what a deck
  session needs most.
- **Being in the session ≠ being on the call.** Someone can edit silently. The People rows
  show mic state, and the speaking ring is driven by local audio level, shared through
  awareness.
- **Device picker** in the call section's ⋯ (input, output, camera), plus a clear denied
  state with how to re-enable permission.
- **On-air is unmissable:** while your mic or camera is on, the header pill shows it in
  your color, and the browser tab title is prefixed.

## 6. How it fits the editor and the source of truth

### 6.1 Binding

- **Solo path unchanged.** Outside a session, nothing in this note loads. The collab
  bundle is a lazy import triggered by "Start live session" or a `#live=` link.
- **During a session the `Y.Text` is the source of truth.** The editor binds to it with
  `yCollab` (from `y-codemirror.next`). The React `source` state becomes a mirror,
  updated from the `Y.Text` observer, so the preview, Coach, lint and every other reader
  of `source` keep working unchanged.
- **Undo becomes "undo my edits".** `yCollab` brings a `Y.UndoManager` scoped to the local
  user; CodeMirror's `history()` is swapped out through its existing `Compartment` while
  live. Without this, the current inbound dispatch path (`Editor.tsx:854-884`) would put
  everyone's edits on your undo stack.
- **Writers other than typing** — `ComposeView`, AI apply (`onApply`), `fixAll`,
  checkpoint restore — go through one `applySourceEdit(next)` helper that computes a
  minimal diff and applies it to the `Y.Text` in one transaction. A checkpoint restore
  during a session asks first ("This replaces the deck for everyone").
- **Persistence:** the host keeps writing `lattice-studio-src-<id>` on the existing
  debounce; the guest writes their linked copy the same way. No IndexedDB migration is
  needed for the first slice (the June note's Phase 0 is not a prerequisite).

### 6.2 What is in the shared document

| Yjs type | Content |
|---|---|
| `Y.Text('source')` | the deck markdown |
| `Y.Array('chat')` | chat messages and system lines |
| awareness (not persisted) | name, color, role, active slide, caret, mic/cam/speaking, following |

Comments stay local for now; syncing them as a `Y.Array` is the comments note's planned
path and a later slice.

## 7. Transport and infrastructure

Everything except signaling is peer to peer:

| Piece | Choice | Who runs it |
|---|---|---|
| Document, awareness, chat | Yjs sync messages (`y-protocols`) over an `RTCDataChannel` | browsers |
| Audio / video | media tracks on the **same** `RTCPeerConnection` | browsers |
| Encryption | DTLS / SRTP between peers (always on in WebRTC); AES-GCM on signaling with the link secret | browsers |
| Signaling (matchmaking) | [Trystero](https://github.com/dmotz/trystero) (MIT) over its default Nostr strategy — public relays, no account; BitTorrent trackers as the second strategy | third parties, free |
| STUN | a public STUN server | third party, free |
| TURN | a config slot, off by default | nobody, unless a free public TURN is configured later |

**Why GitHub Pages cannot be the middleman.** Pages serves static files. It cannot hold a
connection open or pass a message from one browser to another, and two browsers need
exactly that once, to exchange connection offers, before they can talk directly. Some
server has to carry that first exchange. With no server of ours, the remaining choice is a
public one, and Trystero is the library built for it: it publishes the encrypted offers on
public relays that already exist (Nostr relays by default, hundreds of them) and hands back
ordinary WebRTC connections, with media track support.

**Why our own thin provider on Trystero instead of `y-webrtc`.** `y-webrtc` syncs the
document to any peer that holds the room password the moment it connects. There is no step
where a host decides. The knock in §4.3 and the roster rule in §4.4 need an application
layer that sends nothing until the host admits. A ~300-line provider of our own carries the
`y-protocols` sync and awareness messages (the same ones `y-webrtc` uses) over Trystero's
data actions, gated by the roster. Document sync and media then share one connection per
pair of peers, as the June A/V note wanted.

**What third parties see.** The public relays see an opaque room topic and the timing and
size of encrypted offers. They never see the deck, the chat, names or media. The STUN
server sees IP addresses. The relays are run by people we do not know, so the lobby copy
says "Lattice has no server that sees them", which is true, and not "nobody relays them",
which is not.

**Reliability, honestly.** Public relays come and go. Trystero connects to several at once,
so one dying does not stop a join, but a join can take a few seconds and no one we pay
stands behind the uptime. If the Nostr strategy proves flaky in practice, the fallback is
another Trystero strategy (BitTorrent trackers, MQTT), not a server.

**Limits, stated up front.** A mesh means every peer connects to every other peer.
Cap: **4 people per session, hard** (owner's call). The fifth knock gets "This session
is full". Corporate networks that block UDP, and some mobile carriers, will fail to connect
without TURN, and with no server of ours there is no TURN by default. The lobby's "could
not connect" state names that cause. A free public TURN service can go in the TURN slot
later; it would be a third party that relays media while it is in use.

**Local development and tests** must not depend on public relays (flaky, and outbound
traffic from CI). Trystero's self-hosted WebSocket relay strategy points the same code at
a small local relay (`tools/collab-signal-dev.mjs`) that only tests and `npm run dev`
use. It never ships.

## 8. What we can verify here, and what we cannot

- **Can verify in the sandbox:** two to four headless Chromium contexts against the
  local relay — the whole handshake, knock/admit/deny, roster refusal, live
  sync, carets, follow, chat, remove-with-rotation, reconnect. Real WebRTC data channels
  work between two Chromium contexts on one machine. Chromium's fake-media flags exercise
  the call plumbing and the tile UI.
- **Screenshots at 1440 / 820 / 390** for the panel, lobby, knock, pill and floating tiles
  in both color modes (Quality Bar).
- **Cannot verify here, and will say UNVERIFIED:** call quality, echo, real cameras and
  microphones, NAT traversal across real home and corporate networks, iOS Safari. Those
  need the owner on two real devices on two networks (HARD RULE #23). Join time and
  reliability over the real public relays need the same real-world check.

## 9. Slices

One branch and PR per independent slice (HARD RULE #17). Each lands working.

| # | Slice | Delivers | Depends on |
|---|---|---|---|
| S0 | **This note** | the design, signed off | — |
| S1 | **Transport** | the Trystero-backed provider, roster gating, the local test relay, protocol tests | — |
| S2 | **Session core — "Europa"** | link, lobby, knock/admit/deny, roster, live co-editing, carets, navigator presence, follow, Live panel (People + Invite), header pill, linked guest copy | S1 |
| S3 | **Chat** | session chat, slide chips, system lines | S2 |
| S4 | **Audio** | join call, mute, speaking ring, device picker | S2 |
| S5 | **Video** | camera, tiles, pop-out strip | S4 |
| S6 | **Management hardening** | remove-with-rotation, stop link, host-away state, end session, auto-admit | S2 (may fold into S2 if small) |
| later | Present together, host handoff, synced comments, TURN | | |

S2 is the "I share a link, they click, we are collaborating" moment and gets the
adversarial trio before merge (HARD RULE #25: novel, security-relevant, new third
parties in the path). S2 also owes a short demo of the experience — a recorded two-browser walkthrough
— in place of a slide deck, because it renders no slide surface (HARD RULE #9's evidence
clause).

## 10. Decisions — settled 2026-10-06

| Question | Owner's answer |
|---|---|
| Admission default | **Knock; the host admits.** Auto-admit is a per-session toggle |
| Infrastructure | **No server, no account, no cost, nothing stored by us.** GitHub Pages was the hoped-for middleman; it cannot relay (§7), so matchmaking uses public relays through Trystero |
| Session size | **4 people, hard cap** |
| Guest copy | **Keep a linked copy** after the session |

## 11. What this replaces

This note supersedes both June notes as the plan of record. Their transport, NAT and cost
analysis stays the reference for §7, and they stay in the tree, marked superseded.
