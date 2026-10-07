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

Audio (S4) shipped 2026-10-07 (design note §12.2). Video is S5 and has no follow-up yet: it
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

### 3.1 TURN: the three options, measured (2026-10-07)

**What a relay carries.** Measured on the largest deck in the tree
(`examples/system-design-foundations.md`, 134 k characters): a newcomer's full sync is 186 KB,
and 2,000 keystrokes cost 57 KB per recipient. An hour of editing through a relay is under 2 MB
per person. **Documents are free to relay at any price.** Audio is what costs. S4 measured
8.7–9.9 kbit/s on the real connection with Chromium's fake microphone, a beep over silence; ordinary
speech in Opus runs at about 25–40 kbit/s, call it 32 kbit/s or 14 MB per stream per hour. In a mesh of four, one relayed person carries three streams up and three down, about
85 MB an hour.

**How many sessions need it.** Public measurements put direct WebRTC success at 75–90 % of
real sessions (Chrome's usage metrics say about 75–80 % on the open internet, and offices
lower it). So one join in five to ten fails today with *Nobody answered*. The two-network
check (design note §8.1) is how we learn our own number.

| Option | Cost | Reach it adds | What it costs us besides money |
|---|---|---|---|
| **A. No TURN** (today) | $0 | none: 10–25 % of joins fail on strict networks | Nothing. The failure shows as *Nobody answered* |
| **B. Hosted TURN, Cloudflare Realtime** | 1,000 GB a month free, then $0.05/GB. At 85 MB per relayed person-hour of audio, the free tier is about 11,000 relayed person-hours a month | Almost all of it: TURN over TLS on port 443 passes nearly every firewall | Cloudflare sees who talks to whom (never the content: WebRTC stays end-to-end encrypted). Its credentials must be short-lived, minted by a server holding an API token, so it needs one small Worker. That is the first server code Lattice would run |
| **B′. Hosted TURN, Metered Open Relay** | 20 GB a month free; paid plans from $99 a month for 150 GB | The same, on ports 80 and 443 | Its key ships in the public bundle, so anyone can spend the 20 GB. At 85 MB per relayed hour, that is about 240 hours a month, shared with whoever copies the key |
| **C. Our own coturn** | One small VPS, about €4–6 a month, with about 20 TB of traffic included | The same as B, once it runs TLS on 443 | We run a server: patches, TLS certificates, abuse limits, and an uptime we answer for. It also needs short-lived credentials (coturn's shared-secret REST scheme), so it needs a small server too |

**Recommendation: B, Cloudflare, behind a tiny credential Worker, and only once the two-network
check shows real failures.** It costs nothing at our scale, reaches the networks that fail
today, and the Worker is also the natural home for step 1 in §2 (our own signaling), so the
server we would add earns its keep twice. B′ is the no-server stopgap, but its quota is public.
C costs more effort than money and makes us an operator.

**What shipped meanwhile:** the slot. `docs/src/components/studio/live/live-ice.ts` holds
`LIVE_TURN`, empty, and the Trystero adapter adds whatever it lists after the public STUN servers
(`turnConfig`). Choosing B′ is a one-line change there. Choosing B or C is that line plus the
credential endpoint. Nothing is turned on until the owner picks.

## 4. Screen share — low priority

Technically easy: `getDisplayMedia` becomes another video track. But Lattice already shares
something better than pixels: the live deck itself, with follow mode and "bring everyone to my
slide", which is sharper and editable. Screen share earns its place only for showing *another*
app, such as the spreadsheet behind a chart. iOS Safari cannot share its screen at all. Revisit
after audio. Tracked by `followups.d/2547-p4-screen-share.md`.

## 5. Decisions that are the owner's

1. **TURN:** run our own, pay for a hosted one, or stay without one. §3.1 has the measured
   options and recommends Cloudflare behind a credential Worker, once real failures show.
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
| Host handoff when the host leaves | built 2026-10-07 (design note §12.1) |
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
