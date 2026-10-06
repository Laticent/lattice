---
status: in-progress
summary: Live peer-to-peer collaboration in the Studio. One link starts it - the host shares it, the guest opens it, knocks, the host admits, and both edit the same deck with live carets, presence on the slide navigator, follow mode, text chat, and audio/video in a new Collaborate panel on the left rail. Edits and media travel browser to browser. Peers find each other over public Nostr relays through Trystero, so Lattice runs no server, pays nothing and stores nothing. Retargets the two June notes from the removed Drawing Board to the Studio and replaces their open questions with a concrete experience.
companion:
  - ./2026-06-14-yjs-collaboration-exploration.md
  - ./2026-06-15-webrtc-av-collaboration.md
  - ./2026-07-04-comments-layer.md
---

# Live collaboration in the Studio — share a link, and you are in

**Date:** 2026-10-06
**Status:** In progress. S1 (Tavola) and S2 (live sessions in the Studio) are built on PR #2547 and hardened by an adversarial review; §12 records what shipped and how it was verified. S3 onward are not started.
**Decision owner:** Sharmarke
**Surfaces:** `docs/src/components/studio/` — `StudioShell.tsx`, `chrome-parts.tsx`
(`ActivityRail`), `Editor.tsx`, `studio-panels.ts`, `panel-shells.tsx`,
`StudioChromeSkeleton.tsx`; a new sibling library, **Tavola** (`docs/src/lib/tavola/`, §7.1). No server.

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

A scout pass mapped the Studio on 2026-10-06, and an independent fact-checker re-verified every pointer below against `main` after the rebase the same day. The facts that shape the design:

| Fact | Where | Consequence |
|---|---|---|
| The left rail is one nullable enum, `activeAssistant: 'coach'\|'chat'\|'lenses'\|'library'\|null` — one open tool panel at a time | `StudioShell.tsx:590`, `ActivityRail` in `chrome-parts.tsx:272` | Collaborate is a fifth value. It toggles like Chat, and it closes when Coach opens |
| The rail exists only on desktop in Craft; tablet uses the ⋯ menu and a left sheet; mobile uses a bottom bar that is **full at eight cells** with a protected set | `StudioShell.tsx:6363`, `:5647-5650`, `:6283-6296` | The live session cannot depend on the panel being open, and mobile needs an entry point that is not a ninth cell (§5.6) |
| Deck source is plain React state; CodeMirror receives it through a prefix/suffix diff, and those inbound dispatches land on the local undo stack | `StudioShell.tsx:416`, `Editor.tsx:859-889` | During a session the editor must bind to a shared `Y.Text` directly, and undo must become "undo **my** edits" (§6.1) |
| The active slide is `activeSlide`; `goToSlide` and `onEditorCursorSlide` write it | `StudioShell.tsx:441`, `:2616`, `:2655` | Presence ("Amina is on slide 4") and follow mode hook in here |
| Decks live in `localStorage` (`lattice-studio-src-<id>`) | `studio-store.ts:21` | A guest's copy of a shared deck is an ordinary deck entry (§5.5) |
| No identity: the rail's account chip is a hard-coded "SA"; comment authors are "You" | `chrome-parts.tsx:309`, `slide-comments.ts:106` | Collaboration has to introduce a name and a color. The comments note already says identity "lands with collaboration" |
| The Studio reads no hash; OpenRouter OAuth drops every query parameter on its round trip | `architect.ts:1943` | The link uses the hash fragment, and the Studio keeps the join intent in `sessionStorage` across OAuth (§4.1) |
| No `yjs` and no WebRTC code in the repo. Web Workers exist (PDF/PPTX export, Kokoro voice, the AI model), none for sync | `docs/package.json` | Greenfield; everything collab is lazy-loaded so solo users pay nothing |

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
https://laticent.github.io/lattice/studio#live=<room>.<secret>.<host>
```

- **`room`** — 128 random bits, base64url. It names the meeting place on the public
  relays.
- **`secret`** — 256 random bits, base64url. It is Trystero's room `password`: Trystero
  encrypts every connection offer and answer with an AES-GCM key derived from it, so a
  relay carries only ciphertext.
- **`host`** — the fingerprint (128 bits of SHA-256) of the host's ECDSA P-256 public key.
  Every hello is signed over the host's and the recipient's peer ids, and a guest believes a
  host only if the key matches this fingerprint. Added after the red team showed that, without
  it, anyone holding the link could answer a newcomer first or step in while the host was away
  (§12).
- **It lives in the fragment** (after `#`). Browsers never send the fragment to any
  server, so neither GitHub Pages nor any relay ever sees the secret.
- **Survives OAuth.** On load the Studio moves the fragment into `sessionStorage` and
  scrubs it from the address bar (so it does not show in a screenshot or a shared screen).
  If the guest connects OpenRouter mid-lobby, or reloads, the join resumes. The browser's
  own history may still hold the original URL, like any link a person opens.
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
  toggle next to Share on desktop and tablet. The mobile header has no Share (it is a bottom
  bar cell, `StudioShell.tsx:6338`), so there the pill sits beside the menu trigger. Clicking the stack opens the panel; the mic toggle works in place.
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
- **Bubbles, like the Architect chat.** Your lines sit on the right in the primary color, the
  same bubble the Architect chat gives your messages; everyone else's sit on the left on the
  muted surface, with their name in their session color once per run. "Amina is typing…" shows
  above the composer (a throttled post, at most one every 2 s, shown for 4 s). On a phone the
  invite and people block folds away while you type, so the composer stays above the keyboard.
- **One clock, one order: the host's.** Device clocks drift by seconds or minutes, so nothing
  compares two of them. Tavola keeps a **session clock**: each member estimates its offset to the
  host's clock by Cristian's algorithm (ping, the host answers its time, offset = host time + half
  the round trip − our time; the shortest round trip wins; three samples on joining, then one
  every 30 s), and `session.now()` reads host time on every browser. Epoch milliseconds carry no
  time zone; each viewer formats them in its own. The same rule as Cadenza and Suono: one owner of
  time, and everyone rides it.
- **Chat goes through the host.** A member sends `say` to the host, which numbers the line
  (1, 2, 3…), stamps it with session time and sends it to everyone, so every browser shows one
  order. A returning member asks for the lines after its last number (`since`) and gets exactly
  those; a skipped number triggers the same ask; the host tells each (re)admitted member the
  latest number (`tip`). A line sent while the host is away waits as *Sending…* (sealed in the
  tab, so a reload keeps it; re-sent every 15 s and on every return) and goes out when the host is
  back. The host drops a resent line by its member and id, and sends that member its receipt
  again; every `say` carries the sender's highest number, which the host takes as a floor, so a
  host restored from an old save never reuses a number. Removing someone posts a `gone` first, so
  the room reads "was removed" at once. The cost is one extra hop per line.
- **Times** show once per run of lines (*2:05 PM* in the viewer's zone and format), and a guest's
  session timer counts from the host's start, not from its own join.
- **"Left" means left.** A dropped connection (a phone that backgrounds the tab, a blip) shows the
  person dimmed as *Reconnecting…*; coming back within 60 s is not news, and only then does the
  chat say they left. Leave sends a goodbye first, so it says "left" at once.
- **System lines** for joins, leaves, role changes, and applied AI edits ("Amina applied an
  AI edit to slide 3"), so a change that landed under you has a visible cause.
- **Lifetime:** the chat rides Tavola's post channel, not the document, so a line's author is
  the member it arrived from and nothing an editor writes into the deck can forge one (red-team
  round 2). Every browser keeps the lines it saw, the host hands its copy to each newcomer, and a
  reloading host keeps it in its sealed save, so late joiners see the history. It ends with the
  session; it is not saved into the deck. (Turning a message
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
- **Undo becomes "undo my edits".** `yCollab` creates a `Y.UndoManager` on the `Y.Text` by
  default (`y-codemirror.next` `src/index.js`), which tracks local changes only. CodeMirror's
  `history()` is a plain extension (`Editor.tsx:646`), not in a `Compartment`, and
  `Editor.tsx:622-631` records why reconfiguring it through one is a trap: the old stack
  leaked back about 1 run in 10. So entering or leaving a session **rebuilds the
  `EditorState`** with `yCollab` in place of `history()`, the way a deck switch already
  does. Without this, the current inbound dispatch path (`Editor.tsx:859-889`) would put
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
| awareness (not persisted) | name, color, role, active slide, caret, mic/cam/speaking, following |

Chat is not in the document: it travels as Tavola posts (§5.7). Comments stay local for now; syncing them as a `Y.Array` is the comments note's planned
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
layer that sends nothing until the host admits. Tavola (§7.1) is that layer: it carries the
`y-protocols` sync and awareness messages (the same ones `y-webrtc` uses) over Trystero's
data actions, gated by the roster. Document sync and media then share one connection per
pair of peers, as the June A/V note wanted.

### 7.1 Tavola — the collaboration library

The owner chose (2026-10-06) to build the engine as a sibling library, **Tavola**
(`@laticent/tavola`, Italian for the table people gather around), alongside Vetrina,
Cadenza, Trama, Lente, Suono and Anima. The split follows one line: **Tavola knows peers
and bytes; the Studio knows screens.**

| Tavola (`docs/src/lib/tavola/`, no UI, no React) | The Studio |
|---|---|
| Link codec: mint and parse `#live=<room>.<secret>`, rotation | Live panel, lobby card, knock toast, header pill |
| Handshake protocol: hello, knock, admit, deny, roster, remove, end | Editor carets, navigator avatars, follow bar |
| Roster gate: send and accept only for admitted ids; the 4-person cap | Binding the `Y.Text` into CodeMirror (§6.1) |
| Sync and awareness messages (`y-protocols` shapes) over the transport | Where presence is drawn on each width (§5.6) |
| Presence model: name, color, role, slide, mic, speaking, following | Chat rendering, slide chips |

**Everything outside is passed in, the way Trama takes dagre.** The core has no runtime
dependencies:

- **A transport** — a small interface: `join(room, secret)`, `send(bytes, peer)`,
  `onMessage`, `onPeerJoin`, `onPeerLeave`, and media `addTrack`/`onTrack`. The Trystero
  adapter (`@laticent/tavola/trystero`, `adapters/trystero.ts`) is the only file allowed to
  import a third-party package, and it pins the Trystero version (§7 measured 0.26.0).
- **A document** — the app hands Tavola its `Y.Doc` and the `y-protocols` encoders, so Yjs is
  a peer dependency the Studio already owns, not a copy Tavola bundles.
- **A clock and randomness** — injected, so tests are deterministic.

**What that buys.** The security-relevant half (knock, roster, rotation, cap) gets one
boundary and a standalone test suite, run against an **in-memory transport** of a few
lines. That replaces the local WebSocket relay this note first planned for tests: protocol
tests never open a socket, and only the real-browser Playwright tier uses Trystero. The
Tauri desktop wrapper can embed Tavola the same way the Studio does.

**Contract it inherits from its siblings** (`2026-07-08-library-shape-cadenza-vetrina.md`):
a `package.json` with `exports` and types, a README, standalone tests, and a boundary gate
in `tools/check-ownership.js` — a proposed `checkTavolaBoundary` that rejects any import
escaping the folder, with one sanctioned exception for `adapters/trystero.ts` →
`trystero/nostr`. Adding a gate function is a rule in an existing gate, not a new CI job
(CLAUDE.md's second filter, row 2). Tavola also owes a family mark (`tavola-mark.svg`,
`-mark-min`, `-lockup`) per `2026-07-18-sibling-brand-system.md`; that is a later slice and
does not block S1.

**What third parties see.** The public relays see an opaque room topic and the timing and
size of encrypted offers. They never see the deck, the chat, names or media. The STUN
server sees IP addresses. The relays are run by people we do not know, so the lobby copy
says "Lattice has no server that sees them", which is true, and not "nobody relays them",
which is not.

**Measured (2026-10-06, Trystero 0.26.0, the default Nostr relay list).** A throwaway spike
(`.scratch/collab-spike/`, not committed) ran the §4 handshake for real: two separate
headless Chromium processes, a fresh random room and secret per trial, the host already in
the room, the guest then opening the "link". The guest got the host's hello, knocked, was
admitted, received the `Y.Text`, and edits then synced both ways. A third peer that held
the link but never knocked pushed an edit straight at the host.

| | Result |
|---|---|
| Trials that completed (hello → knock → admit → sync → edits both ways) | **5 / 5** |
| Guest opens link → shared deck on screen, median of 5 | **973 ms** (min 756, max 1,037) |
| Guest opens link → peer connection open, median of 5 | **604 ms** |
| Edits from the never-admitted peer that landed on the host | **0 / 5** (all dropped by the roster check) |

What that does and does not show. It shows the public relays matched peers fast and
reliably on this day, the password-encrypted handshake works, the relays were reached
through the sandbox's HTTPS proxy (so matchmaking survives an HTTP proxy), and the roster
gate in §4.4 refuses an unadmitted peer. It does **not** show NAT traversal: both browsers
ran on one machine and connected over local addresses. Two homes, a phone on cellular and
a corporate network are still the owner's real-device check (§8). Note also that 0.26 changed
the action API (`makeAction` now returns `{ send, onMessage }`), so the provider pins the
Trystero version.

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
traffic from CI). Tavola's protocol tests run on the in-memory transport (§7.1). The
real-browser tier runs two to four Chromium contexts on one machine; if the public relays
are unwanted there too, Trystero's self-hosted WebSocket strategy points the same adapter
at a throwaway local relay started by the test itself. Nothing of it ships.

## 8. What we can verify here, and what we cannot

- **Can verify in the sandbox** (and §7's spike already did, for the handshake): Tavola's protocol suite on the in-memory transport,
  then two to four headless Chromium contexts — the whole handshake, knock/admit/deny, roster refusal, live
  sync, carets, follow, chat, remove-with-rotation, reconnect. Real WebRTC data channels
  work between two Chromium contexts on one machine. Chromium's fake-media flags exercise
  the call plumbing and the tile UI.
- **Screenshots at 1440 / 820 / 390** for the panel, lobby, knock, pill and floating tiles
  in both color modes (Quality Bar).
- **Cannot verify here, and will say UNVERIFIED:** call quality, echo, real cameras and
  microphones, NAT traversal across real home and corporate networks, iOS Safari. Those
  need the owner on two real devices on two networks (HARD RULE #23). The spike in §7
  measured join time over the real public relays, but from one machine; how it holds across
  days and networks needs the same real-world check.

## 9. Slices

One branch and PR per independent slice (HARD RULE #17). Each lands working.

| # | Slice | Delivers | Depends on |
|---|---|---|---|
| S0 | **This note** | the design, signed off | — |
| S1 ✔ | **Tavola core** | `docs/src/lib/tavola/`: link codec, handshake and roster protocol, 4-person cap, sync and awareness over an injected transport, the in-memory test transport, the Trystero adapter, `package.json`/README, `checkTavolaBoundary` | — |
| S2 ✔ | **Session core — "Europa"** (chat from S3 and most of S6 came with it) | link, lobby, knock/admit/deny, roster, live co-editing, carets, navigator presence, follow, Live panel (People + Invite), header pill, linked guest copy | S1 |
| S3 | **Chat** | session chat, slide chips, system lines | S2 |
| S4 | **Audio** | join call, mute, speaking ring, device picker | S2 |
| S5 | **Video** | camera, tiles, pop-out strip | S4 |
| S6 | **Management hardening** | remove-with-rotation, stop link, host-away state, end session, auto-admit | S2 (may fold into S2 if small) |
| S7 | **Tavola mark** | the three family SVGs per the sibling brand system | S1 |
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
| Where the engine lives | **A sibling library, Tavola**, with the transport and document passed in (§7.1) |

## 11. What this replaces

This note supersedes both June notes as the plan of record. Their transport, NAT and cost
analysis stays the reference for §7, and they stay in the tree, marked superseded.

## 12. What shipped (2026-10-06, PR #2547)

**Built.** Tavola (`docs/src/lib/tavola/`) and the Studio's Live slot
(`docs/src/components/studio/live/`): Start live session, the invite link (visible in the panel
and copied), the lobby, knock / admit / deny, auto-admit, the roster and the 4-person cap, live
co-editing with carets and per-person undo, presence on the navigator and the preview corner,
follow, bring-everyone, session chat, role changes, remove, end, a guest's linked copy, guest
and host reloads, and the Share sheet's *Collaborate live* row. Calls (S4, S5) are not built, so
every mic control is hidden rather than shown dead.

**Deviations from the design above.**
- The guest's copy is an ordinary deck with the host's title; the "Shared by" tag in the deck
  switcher (§5.5) is not drawn yet.
- Removing someone blocks their peer id and revokes their token, but does not rotate the link
  secret (§5.4); a removed person who reopens the link reaches the lobby as a new knock.
- The link gained a third part, the host key fingerprint (§4.1).
- Tests do not run against a local relay; Tavola takes its transport as an argument, and its
  suite runs on an in-memory network (§7.1).

**The adversarial review** (red team, Munger inversion, independent checker, all on Opus)
found real defects; every one marked fixed below has a test that failed first or a step in the
real-browser check.

| Finding | Severity | Now |
|---|---|---|
| A link holder could pose as the host to a newcomer, or take over a guest while the host was away, and collect its rejoin token | high | fixed: signed hello + fingerprint in the link (`hostkey.ts`) |
| End and Leave closed the connection before `end` was delivered | high | fixed in Tavola in round 1; the Studio still closed at once through its own stage listener until round 2 (below) |
| A promoted viewer's later edits were stranded (Yjs pending forever) | high | fixed: role changes resync; viewers cannot post chat |
| Presence was keyed by a self-claimed field: fake summons, spoofed names, CSS injection into caret styles | high | fixed: awareness rebuilt from the roster (`sanitizeAwareness`); ownership moved from first arrival to a roster binding in round 2 |
| Late-forming or blipping member links left guests out of sync for good | high | fixed: resync on peer join; re-admit by token on a hello while live |
| A token replay evicted the real member and bypassed the cap | medium | fixed: refused while the member is connected; cap and color checked |
| A deck switch while live pushed the other deck into the shared text | medium | fixed: the switch is handled before any push, and asks first |
| A guest's first sync could rebase its previous deck into everyone's text | medium | fixed: the rebase base is seeded with the shared text |
| An overlapping outside rewrite doubled the text | medium | fixed: refused with a notice instead |
| Denied or removed peers could knock again at once | medium | fixed: per-session block list |
| Chat authors were self-declared | medium | fixed in round 1 by reading the Yjs client id; that proved forgeable (round 2), so chat now rides Tavola posts |
| A host reload killed the session; a guest reload did not rejoin | medium | fixed: host resumes from its saved key, tokens and document; guest rejoins by token |
| A network that blocks WebRTC showed "the session isn't live" | medium | fixed: the lobby names the network as a possible cause |
| The startup JavaScript grew past the per-PR allowance | CI | fixed: all session code loads on demand |
| CodeQL: the host's session save held the room secret (and its signing key) in clear text | high | fixed: secrets and rejoin tokens are sealed with a non-extractable AES key kept in IndexedDB, the host's private key is a non-extractable CryptoKey there too, and a `#live=` link is held in memory until sealed; the real-browser check asserts the secret is absent from both browsers' storage |

**The second adversarial round** (same three lenses, on the hardened code) found these; each
has a test that fails when its guard is removed, except where noted.

| Finding | Severity | Now |
|---|---|---|
| After the host's link dropped, a link holder could reconnect under the host's old peer id (ids are self-declared) and be obeyed: forged roster, document, removal, and a `sync` that handed it the deck | critical | fixed: a guest stops trusting the host's id when its link drops, sends it nothing and accepts nothing from it until a fresh signed hello; a member whose link drops leaves every roster at once |
| Chat lines could be forged under another member's name by writing Yjs items under their client id | high | fixed: chat moved to Tavola's post channel; the author is the transport sender |
| Presence: the first peer to mention a client id owned it, so a member could hijack the host's summon and others' carets; a truncated update kept its claim | high | fixed: the host binds each member's client id in the roster from its knock; awareness counts only for the bound id; undecodable bytes are dropped whole |
| Watch demo while live blanked the shared deck for everyone | high | fixed: it asks first, and a yes ends or leaves the session before the editor is touched (`mayLeaveDeck` now tears down itself) |
| End in the Studio still closed the connection at once, and the host got the guest's toast | high | fixed: stage changes during a teardown are ignored |
| A member whose seat was taken during a blip stayed "live" with edits going nowhere | high | fixed: a refused rejoin moves it to `full` / `denied`, with a toast |
| With IndexedDB unavailable the session ran behind a "Couldn't start" toast; a failed key load was cached | medium | fixed: the session starts and says it cannot survive a reload; a failed load is retried |
| StrictMode resumed twice and opened two sessions | medium | fixed: `resume()` is single-flight and re-checks before wiring (the second check alone also holds, so removing the memo does not fail the test) |
| An insert whose surroundings were gone landed mid-sentence | medium | fixed: refused like a delete |
| One malformed caret turned off everyone's remote carets | low | fixed: carets are shape-checked |
| A failed load of the session code was silent and final; a link pasted into an open tab did nothing; a cut-off link was blamed on the network; a version mismatch timed out as "nobody answered"; a duplicated tab became a second host | medium | fixed: retry with a notice and the link kept until loaded; `hashchange`; a `bad-link` and an `outdated` lobby card; a `navigator.locks` host lock |
| Names kept bidi overrides and zero-width characters; the waiting queue had no limit; a removal could be undone by a reload in the next second | low | fixed: stripped; 8 knocks at most; the host reseals at once on a removal and an unload writes the last sealed save synchronously |
| The invite link carried the host page's query string | low | fixed: origin + path only |

**A third check** (an independent checker on the round-2 fixes) found five more, two of them
narrower windows of the same host-id squat; each now has a test that fails without its guard.

| Finding | Severity | Now |
|---|---|---|
| After a host RELOAD (new peer id), the host's OLD id stayed a trusted member, so a squatter on it got the guest's edits and could write to it | high | fixed: a verified hello from a new host id drops the old one from the roster |
| A link that dropped while its hello was being verified left the id trusted for whoever took it next | high | fixed: each link has a generation; a hello is believed only if its link is unchanged after verifying |
| Round 2's "drop a member the moment its link drops" split two guests whose own link blipped, for good | high (regression) | fixed: on that peer's return the guest asks the host for its roster (`roster?`), which re-adds and resyncs it |
| A cut-off link followed by a good one in the same tab stayed on "This link isn't complete" | medium | fixed: a fresh link clears it |
| A forged Yjs item under a member's client id renames that member's document client, and presence keyed on the document id then threw | medium | fixed: presence keys on the awareness id everywhere |
| A host that saw a member's link replaced without a leave (Trystero "peer replaced") never said hello again | medium | fixed: a join for a counted member is treated as a fresh link |
| Out-of-order seals, a link pasted mid-resume, no save on a real unload, a repeated load-failure toast | low | fixed: newest seal wins; resume loops while a link waits; `pagehide` writes the save; one toast |

**Known limits that remain.**
- **A member's id is vouched for by the host, not proven.** When two guests' own link blips, each
  re-admits the other on the host's word that the id is still a member. A link holder who takes
  that id at exactly that moment, while the real member is still connected to the host, would be
  let in by the other guest. Closing it needs a signing key per member (the host's scheme,
  extended); it is a follow-up.
- **Any link holder can show a waiting guest "Reload to join"**: a hello from another protocol
  version cannot be signature-checked. A real host's hello still takes the guest on.
- **An admitted editor is trusted with the text.** Yjs updates carry no signatures, so an editor
  can write items under another member's client id, and by sending them to one peer only leave
  two copies that disagree for the rest of the session. Tavola gates who may edit, not what an
  editor writes; an editor can already delete the whole deck.
- **No TURN.** Networks that block direct browser-to-browser traffic (many offices, some mobile
  carriers) cannot connect. A free third-party TURN in the slot would fix most of these; it is
  the owner's call (it puts a third party in the media path).
- **Link holders learn members' IP addresses**, because every peer in the room gets a WebRTC
  connection to every other before admission (§4.4).
- **Names are self-asserted.** The knock is where the host checks who is asking.
- **A reload resumes only in the same tab** with IndexedDB working; closing the tab ends your
  part. The link works for as long as the session runs, wherever it was pasted.
- **Cross-network joins are untested** here: every real-browser run had both browsers on one
  machine.

**How it was verified.**
- Tavola: 46 tests over the in-memory network with a real Yjs document (the memory network can
  now reconnect a peer under a departed id, and deliver a lone join or leave the way a replaced
  link does, which is how the squat and replace tests run). Weakening the gate,
  the signature check, the replay check, host-id trust, the refused-rejoin stage or the waiting
  limit fails the tests that cover them.
- Studio: the controller over the in-memory network (8 tests: a good link after a cut-off one, End timing, single-flight resume,
  chat authorship and history, no IndexedDB, a cut-off link, a link without query, the
  duplicate-tab lock), the rebase and awareness-sanitizer tests, and the whole docs suite
  (5,983 tests).
- Real surface: `tools/live-session-check.mjs`, two Chromium processes over the public Nostr
  relays and real WebRTC, in light and dark: start, lobby, knock, admit, edits both ways,
  carets, per-person undo, chat, remove, a second guest, a host reload (session resumes in
  about 5.5 s with the guest still in), a guest reload (rejoins without a knock in about 5.6 s),
  and End reaching the guest. Opening the link to editing took about 8 s on the unoptimized dev
  server, most of it the Studio loading. The check now also reports which network path the
  connection took: `host→host (udp)` on every run here, which is what two browsers on one machine
  give and is no evidence about other networks.
- Phone width (390 px, Chromium touch emulation, two browsers over the real relays): Menu → Live
  → Start, the lobby, the knock toast with Admit, the header pill on both sides, and chat from
  the phone reaching the host. This run found two phone defects, both fixed: Live had no entry
  point on a phone (its pane bar is full; it is now a row in the phone drawer), and tapping
  Start right after typing a name did nothing, because the shared phone sheet shrinks 54px when
  a field loses focus and the click landed on the field (`followups.d/2547-p2-phone-sheet-shift-
  misdirects-taps.md` covers the other sheets).
- UNVERIFIED: two real devices on two networks, iOS Safari, and anything about calls.

