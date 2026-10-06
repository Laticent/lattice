---
status: proposed
summary: Where Live collaboration goes after PR #2547. Voice and video over the existing peer connections, a server path for hosted and self-hosted Lattice (own signaling, then a document sync server, then an SFU for media, then accounts), corporate firewalls today vs. with a server (TURN over 443), whether screen share earns a place, and the decisions that are the owner's. Proposal only; nothing here is built.
companion:
  - ./2026-10-06-studio-live-collaboration.md
---

# Live collaboration — the road after the first release

**Date:** 2026-10-06
**Status:** Proposed. A map of the next steps, written from the owner's questions at the end of PR #2547. Nothing here is built; each step names the follow-up that tracks it.
**Decision owner:** Sharmarke

What shipped, and why it is built the way it is, lives in the design note
(`2026-10-06-studio-live-collaboration.md`, §12 and §13). This note is about what comes next.

## 1. Voice and video (S4, S5)

**No new library is needed at four people.** WebRTC was built for media: capture the microphone
and camera with `getUserMedia` and add the tracks to the peer connections the session already has.
Trystero supports adding tracks; the browser supplies echo cancellation and noise suppression.

What it takes:
- a device picker, mute, and a speaking indicator (Web Audio's `AnalyserNode`);
- media only to admitted members, through the same roster gate as the document;
- renegotiating a connection when someone turns their camera on or off.

**The limit is the mesh.** Every person uploads one stream to each of the others. At four people
that is three uploads each, which is fine for audio and for video at a modest resolution (about
360p). Past five or six people with video, uploads run out. That is where an SFU comes in (§2).

Tracked by `followups.d/2547-p2-build-s4-audio.md`. Video is S5 and has no follow-up yet: it
follows audio.

## 2. The server path, for hosted and self-hosted Lattice

Tavola was built for this. The transport is one small interface (`Transport` in
`docs/src/lib/tavola/types.ts`), and Trystero is a single adapter file. The authority design,
where the host admits people, numbers chat and owns the clock, maps directly onto a server
playing the host. Four steps, each useful on its own:

| Step | What it adds | What it replaces |
|---|---|---|
| 1. Our own signaling server (a WebSocket endpoint) | One domain IT can allowlist; no dependence on public Nostr relays | The public relays. Still peer to peer |
| 2. A document sync server (y-websocket or Hocuspocus, both Yjs-native) | Sessions that outlive the host's tab, dozens of people per deck, history on the server | The browser as host, for documents |
| 3. An SFU for media (LiveKit or mediasoup) | Each person uploads once; calls past six people | The media mesh |
| 4. Accounts and sign-in | Real identity, SSO, audit | Typed names and rejoin tokens |

What does not carry over: the browser as host and the mesh for many people. Neither is wasted:
peer to peer stays the free, no-account mode, and the server mode is added next to it.

Tracked by `followups.d/2547-p3-own-signaling-relay.md` (step 1). Steps 2–4 belong to the hosted
or SaaS product decision and are not filed until that decision is made.

## 3. Corporate firewalls

**Today** there are three places a connection can fail:
1. No TURN relay. Strict firewalls, symmetric NATs (routers that make a direct connection
   impossible) and some mobile carriers block peer-to-peer UDP. Those people see "Nobody
   answered". This is the biggest real-world failure we have.
2. Some proxies block WebSocket connections to the Nostr relays, or block unfamiliar domains.
3. Some security policies forbid peer-to-peer WebRTC outright.

**With a server:**
- TURN over TLS on port 443 gets through almost every firewall, because it looks like ordinary
  HTTPS. We either run it (coturn) or pay for one.
- Signaling and sync run on our own domain, so IT allowlists one name.
- Self-hosted inside a company's network removes most of the problem.

That is also what enterprise buyers ask for: SSO, audit logs, and where the data lives.

Tracked by `followups.d/2547-p2-decide-a-turn-default.md`.

## 4. Screen share — low priority

Technically easy: `getDisplayMedia` becomes another video track. But Lattice already shares
something better than pixels: the live deck itself, with follow mode and "bring everyone to my
slide", which is sharper and editable. Screen share earns its place only for showing *another*
app, such as the spreadsheet behind a chart. iOS Safari cannot share its screen at all. Revisit
after audio. Tracked by `followups.d/2547-p4-screen-share.md`.

## 5. Decisions that are the owner's

1. **TURN:** run our own, pay for a hosted one, or stay without one. Deck data is tiny; video
   would be the real cost.
2. **Hosted or SaaS:** whether and when, which decides steps 2–4 in §2.
3. **Privacy wording:** what the product tells people about who sees their IP address (§6 of the
   gaps list, `followups.d/2547-p2-live-privacy-note.md`).
4. **Video before or after host handoff and persistence.** Reliability of the session arguably
   matters more than video for a deck tool.

## 6. Gaps and ideas, with where each is tracked

| Item | Follow-up |
|---|---|
| Real cross-network test | `2547-p1-verify-live-on-two-real-networks.md` |
| TURN default | `2547-p2-decide-a-turn-default.md` |
| Host handoff when the host leaves | `2547-p2-live-host-handoff.md` |
| Sessions that outlive the host's tab | `2547-p2-live-sessions-outlive-host.md` |
| Who sees IP addresses (members, relays, STUN) | `2547-p2-live-privacy-note.md` |
| Per-member signing keys | `2547-p2-per-member-signing-keys.md` |
| Rotate the link on remove | `2547-p3-rotate-link-on-remove.md` |
| Insider editor trust and edit rate limits | `2547-p3-live-editor-trust-and-rate-limits.md` |
| Field telemetry for connection failures | `2547-p3-live-connection-telemetry.md` |
| A test relay so CI runs real two-browser tests | `2547-p3-own-signaling-relay.md` |
| "Who changed this?" in version history | `2547-p3-live-edit-attribution.md` |
| Slide locking | `2547-p3-live-slide-lock.md` |
| Presenting live with the audience following | `2547-p3-live-present-with-audience.md` |
| Screen share | `2547-p4-screen-share.md` |
| Clock and chat limits (NTP steps, 500-line cap) | `2547-p3-live-clock-and-chat-limits.md` |
| Same-name members | `2547-p3-live-presence-keyed-by-name.md` |
