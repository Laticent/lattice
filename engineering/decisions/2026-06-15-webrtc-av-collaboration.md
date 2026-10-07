---
status: superseded
superseded-by: 2026-10-06-studio-live-collaboration.md
summary: Design exploration for adding talk-while-you-edit audio/video to the Drawing Board over the same WebRTC pipe as Yjs document sync
---

# Audio/video on the Drawing Board — the other half of the WebRTC pipe

**Date:** 2026-06-15
**Status:** Superseded on 2026-10-06 by [`2026-10-06-studio-live-collaboration.md`](2026-10-06-studio-live-collaboration.md), which retargets this to the Studio. The analysis below is still the transport reference.
**Decision owner:** Sharmarke
**Companion to** [`2026-06-14-yjs-collaboration-exploration.md`](2026-06-14-yjs-collaboration-exploration.md)
— it picks the transport for *document* sync; this one asks what it takes to
add *talk-while-you-edit* on the same connection. Read that doc first; this
one assumes its conclusions.

---

## The question

We've modelled real-time deck collaboration over Yjs. The natural next thought:
once collaborators are *in the same room*, can they **talk and see each other**
— a Google-Docs-style call layered onto the Drawing Board — at the same
"zero-cost, no-backend, bring-your-own-resource" posture the Yjs doc fought for?

Short answer: **yes for small rooms, and it reuses the Yjs plumbing almost
entirely — but media is a different animal from text, and the honest "free P2P"
story strains exactly where the Yjs doc said it would, only harder.**

---

## The key insight: it's not "like Yjs P2P" — it's the *same connection*

Yjs's P2P provider (`y-webrtc`) and live audio/video are **two output ports of
one technology: WebRTC.**

| Half | WebRTC primitive | Payload |
|---|---|---|
| **Document sync** (`y-webrtc`) | `RTCDataChannel` | CRDT update bytes |
| **Audio/video** | media tracks (`getUserMedia()` → `addTrack()`) | mic + camera streams |

Both ride **one `RTCPeerConnection`** per peer pair, negotiated by **one
signaling handshake** (SDP offer/answer + ICE candidates), subject to the **same
STUN/TURN/NAT ladder** the Yjs doc already walked. So this is not a parallel
"thing like Yjs for media" — there is no CRDT-for-media because media isn't
merge-able state, it's streams. It's the *other thing the pipe Yjs opens already
carries.* If we build the Yjs P2P phase, we're most of the way to a call.

---

## What we'd reuse from the Yjs plan (the cheap part)

The Yjs exploration already specifies the pieces a call needs:

| Piece | From the Yjs doc | Reused for A/V as-is |
|---|---|---|
| **Signaling endpoint** | the stateless ~30-line Worker that does room matchmaking | Identical — signaling carries SDP/ICE regardless of whether the payload is data, audio, or video. One signaling server serves both. |
| **Room model** | `?room=<id>` URL + "Share" button | The call lives in the same room; joining the deck = joining the call surface. |
| **Presence (awareness)** | avatar stack, who's here | Extends to "mic on / cam on / speaking" state — awareness is the natural carrier for call UI. |
| **Identity** | random name+color or OpenRouter identity | Same labels on the video tiles. |
| **Opt-in + graceful solo** | feature-flagged, additive | A/V is doubly opt-in (room *and* an explicit "Join call" with a `getUserMedia` permission prompt). |

So the *connection management and UI scaffolding* is shared. What's **not**
shared — and what drives every hard decision below — is that media is a
sustained, high-bitrate, latency-sensitive stream, where Yjs deltas are tiny and
intermittent.

---

## The hard reality: media ≠ text

The Yjs doc's two big caveats (TURN isn't reliably free; P2P degrades past small
rooms) both bite **harder** for A/V:

1. **TURN stops being optional.** For text, a dropped packet just retries and
   you could hand-wave TURN. For a call, when hole-punching fails *all* the
   media bytes must relay through a **TURN** server, which carries real,
   sustained bandwidth → **not reliably free**. The Yjs doc flagged TURN as "the
   single biggest reliability caveat of the P2P phase"; for media it's
   load-bearing, not a caveat. Corporate networks (UDP blocked, symmetric NAT
   behind HTTP proxies, WebRTC blocked by DLP policy) force this fallback often.

2. **A full mesh doesn't scale past a handful.** In P2P **mesh**, every peer
   sends its own stream to every other peer: N participants → **N×(N−1) streams**
   and each person's *uplink* carries N−1 copies of their camera. That's fine at
   2–3, painful at 4, and unworkable past ~5 — uplink is the bottleneck on home
   connections.

   Beyond that you need an **SFU** (Selective Forwarding Unit): a media server
   each peer sends *one* upstream to, which fans it out to everyone. An SFU is a
   real backend with real, continuous cost — the A/V analog of the Yjs doc's
   "graduate to a Durable Object relay" moment, except **meaningfully heavier**
   than a WebSocket relay (a DO relays tiny text; an SFU forwards live video).

### Mesh vs SFU — the genuine fork

| | **P2P mesh** | **SFU** (media server) |
|---|---|---|
| Participants | ~2–4 comfortably | dozens+ |
| Your infra | signaling only (shared w/ Yjs) + TURN for hard networks | a media server (self-host `mediasoup`/`ion-sfu`, or managed LiveKit/Daily) |
| Cost | ~free until TURN is needed | continuous server/egress cost or per-minute vendor billing |
| Corporate networks | fragile (same as Yjs P2P) | better — SFU on 443/TLS behaves like the Yjs WSS relay |
| Fits BYO ethos? | yes — peers relay their own bytes | no — it's the backend we keep avoiding |
| Recording / large rooms | no | yes |

This is the same shape as the Yjs A/B/C transport table: cheap-and-fragile vs
solid-and-backed, with a clean swap point between them.

---

## The library landscape ("is there a Yjs-for-media?")

There isn't a dominant CRDT-style library because media doesn't need merge
semantics. The real options, cheapest-infra first:

| Option | What it is | Closest Yjs-doc analog |
|---|---|---|
| **Raw WebRTC** + our signaling | hand-manage `RTCPeerConnection` + tracks | raw `y-webrtc` internals — most control, most code |
| **`simple-peer` / PeerJS** | thin P2P wrappers; PeerJS even bundles a public signaling server | the `y-webrtc` provider itself — the "just works" P2P rung |
| **LiveKit / mediasoup / Daily** | SFU-based, scale + recording | the managed-provider (Liveblocks/Supabase) fallback — backend + lock-in |

For Lattice's "a few people co-editing a deck" use case, **`simple-peer`-style
mesh over the shared Yjs signaling** is the natural starting rung.

---

## Will it work over the internet? In a corporate network?

Same split as the Yjs doc, sharper for media:

- **Home/consumer, 2–4 people: usually works, ~free.** STUN hole-punching
  connects most home networks directly; no relay. Breaks on **mobile/CGNAT** and
  **symmetric NAT**, which force TURN.
- **Corporate networks: mesh P2P frequently fails**, and unlike text there's no
  graceful "retry later" — a blocked call is just a non-functional call. The
  transport that survives is the same one the Yjs doc landed on for documents: a
  **server on 443/TLS** — here an **SFU**, which to the firewall looks like
  ordinary HTTPS media (the way every other web meeting tool gets through).

The pattern rhymes exactly: **P2P is the zero-infra consumer rung; a 443 server
is the works-everywhere rung.** For A/V that server is heavier (SFU, not a WS
relay), which is the one real step-up in cost over the Yjs story.

---

## Recommended path — phased, mirrors the Yjs phasing

### Phase A — "Talk over the deck" (mesh, 2–4, near-zero infra)
Add a `simple-peer`-style mesh call on the **shared Yjs signaling + room**.
"Join call" prompts for mic/cam (`getUserMedia`), advertises via awareness,
renders a small floating tile strip. Reuses everything the Yjs P2P phase builds;
adds TURN only if early users hit NAT failures (Cloudflare TURN / a small free
tier as the escape hatch). **This is the headline feature for a few collaborators
and fits the BYO ethos cleanly** — peers relay their own bytes, we host only the
matchmaker.

### Phase B — SFU (only when rooms outgrow mesh, or corporate is a must)
Swap mesh for an SFU when you need >~4 people, reliable corporate connectivity,
or recording. Managed (LiveKit/Daily) is least code + a per-minute bill; self-
hosted (`mediasoup`) is a server you run. Either way it's the backend the Yjs doc
deferred — arriving here for the same reason (reliability/scale earns it), at a
higher cost class than the Durable Object relay.

**Audio-first option worth noting:** voice-only mesh scales noticeably further
and is far cheaper than video (a fraction of the bitrate, no decode/layout cost).
"Talk while we edit, cameras optional" may be the whole product for a deck tool —
and keeps Phase A viable for more people before Phase B is needed.

---

## What we'd have to do (implementation sketch)

Assumes the Yjs P2P room + signaling already exist (Phase A depends on them):

1. **Deps** (`docs/package.json`): `simple-peer` (or raw `RTCPeerConnection`).
   No new signaling — reuse the Yjs Worker.
2. **Media capture**: a "Join call" control → `getUserMedia({audio, video})`,
   with an explicit permission prompt and a clean denied/again path.
3. **Peer wiring**: on room join, for each remote peer open (or extend) the
   `RTCPeerConnection` and `addTrack()` the local stream; render incoming
   `track` events into video/audio elements.
4. **Call UI**: a floating tile strip (self-view + remotes), mute/cam toggles,
   speaking indicator. **CSS tokens only — HARD RULE #3, no hex literals;**
   tile chrome and the speaking ring go through `var(--token)`. Must hold up
   responsive at desktop/tablet/mobile (CLAUDE.md website rules) — on mobile,
   icon-only controls and a compact tile layout.
5. **Awareness extension**: carry `mic`/`cam`/`speaking` state so presence and
   the tile strip stay in sync with who's actually in the call (a room member
   need not be on the call).
6. **TURN escape hatch**: config slot for a TURN server (off by default; document
   how to point it at Cloudflare TURN if NAT failures show up).
7. **Opt-in + degrade**: feature-flagged; lazy-load the call bundle so document-
   only collaborators don't pay for it; solo/offline unchanged.
8. **Capabilities + changelog**: register new tooling in
   `engineering/capabilities.md` (HARD RULE #15); `CHANGELOG.md` entry (#10).

Scope note: **Drawing Board first**, same as the Yjs doc; depends on the Yjs P2P
room existing, so it lands *after* (or alongside) Yjs Phase 1, never before.

---

## Potential issues (the honest list)

- **TURN is load-bearing, not optional** (see above) — the real cost risk. Plan
  for it from the start as a config slot, even if disabled by default.
- **Mesh ceiling ~4** — past that, video needs an SFU = a backend = the thing the
  Yjs doc spent its length avoiding, now heavier. Don't promise large rooms on
  the free rung.
- **Bundle + runtime weight** — media capture/encode and multiple video decodes
  cost CPU/battery; lazy-load and let users join audio-only.
- **Permissions UX** — `getUserMedia` prompts, denied state, device pickers, and
  "you're on mute" are real surface area; easy to ship something janky.
- **Privacy framing** — a camera is a higher-stakes ask than a text cursor. Make
  joining the call explicitly separate from joining the room, with obvious
  on-air indication. Mesh keeps media off our infra (good); an SFU sees it
  (disclose at Phase B).
- **No access control on open rooms** — inherits the Yjs doc's caveat; anyone
  with the link can join the call too. Unguessable room IDs as the hobby stopgap;
  real authz only with a backend.
- **Echo/audio quality** — WebRTC handles echo cancellation, but multi-tab and
  speaker setups still bite; budget test time.
- **Sandbox can't verify A/V here** — there are no real cameras/mics and no
  multi-browser mesh in the cloud sandbox. We can build and screenshot the call
  *UI* (CLAUDE.md website rules: desktop/tablet/mobile), but end-to-end media
  must be verified on real devices/networks. Say so; don't claim call quality we
  couldn't test.

---

## Why this fits Lattice specifically

The thesis is the Yjs doc's, extended: **peers relay their own bytes; we host
only a stateless matchmaker.** A/V is the same BYO move for the same connection —
which is exactly why it's cheap to *start* (Phase A piggybacks on Yjs signaling)
and why the upgrade is a known, bounded step (Phase B = an SFU, the media analog
of the Durable Object relay). Start audio-first mesh, keep cameras optional,
graduate to an SFU only when room size or corporate reliability earns the
backend. Same philosophy, one transport, two payloads.

## Open decision for sign-off

The genuine fork is **how far to commit now**, and it's gated on the Yjs decision:

- **Just the writeup** (this doc) — capture the model; revisit after Yjs lands.
- **Phase A** — `simple-peer` mesh call (audio-first, cameras optional) on the
  Yjs P2P room, once that room exists. The headline "talk while we edit" feature
  for a few collaborators, at near-zero infra.
- **Phase B (deferred)** — SFU for large/corporate rooms + recording. A real
  backend; defer until mesh is proven to be outgrown.

Recommendation: **adopt this as the writeup now; tie Phase A to Yjs Phase 1**
(it has no value without the shared room) and lead with **audio-first** to push
the mesh ceiling as far as it'll go before any SFU spend.
