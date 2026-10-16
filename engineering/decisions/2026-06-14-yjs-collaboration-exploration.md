---
status: superseded
superseded-by: 2026-10-06-studio-live-collaboration.md
summary: A zero-hosting-cost Yjs model for Google-Docs-style real-time collaboration on the static-hosted Drawing Board
---

# Real-time collaboration on the Drawing Board — a zero-cost Yjs model

**Date:** 2026-06-14
**Status:** Superseded on 2026-10-06 by [`2026-10-06-studio-live-collaboration.md`](2026-10-06-studio-live-collaboration.md), which retargets this to the Studio. The analysis below is still the transport reference.
**Decision owner:** Sharmarke
**Supersedes nothing.** Adds a multiplayer layer over the existing client-only
Drawing Board.

---

## The question

Can we add Google-Docs-style real-time collaboration to the Drawing Board using
[Yjs](https://yjs.dev) **at zero hosting cost to us**, while the app keeps living
on **GitHub Pages** (static, no backend) for the foreseeable future — and without
breaking the offline-first, bring-your-own-key posture we already love (the
OpenRouter client-side model)?

Short answer: **yes**, and the architecture nearly writes itself, because the app
is already built on exactly the right primitives. There is one real fork — *who
relays the sync traffic* — and it has a clean phased answer that never requires a
frontend rewrite.

---

## What we already have (the raw material)

The Drawing Board is unusually ready for this:

| Primitive | Where | Why it matters for Yjs |
|---|---|---|
| **CodeMirror 6** editor holding the deck markdown | `docs/src/playground/editor.js`, mounted in `docs/src/pages/drawing-board.astro:435` | Yjs has a first-class CM6 binding (`y-codemirror.next` / `yCollab`). The editor *is* the collaboration surface. |
| **Single source of truth = the markdown** | `getSource()` → `render()` (`drawing-board.astro:1323`) | We only need to sync **one `Y.Text`** (the source). The preview/HTML is *derived* — never synced. This is the simplest possible CRDT shape. |
| **IndexedDB persistence already present** | `docs/src/playground/drawing-board-store.js` (`lattice-drawing-board` DB) | `y-indexeddb` slots in as the local persistence provider; offline-first is already the house style. |
| **Zero-backend, BYO-resource culture** | OpenRouter OAuth PKCE → key in `localStorage` (`architect-model.js`), direct CORS, **no proxy** | The precedent is set: heavy/metered work runs on the *user's* resources, not ours. Collaboration should inherit this. |
| **Static deploy, two targets** | Astro SSG, `base:'/lattice'` for GitHub Pages + Cloudflare Pages auto-detect (`docs/astro.config.mjs:26`) | Confirms the constraint: **no server can live on GitHub Pages.** Any sync relay is external. |

What's missing: no `yjs`, no provider, no WebSocket/WebRTC code anywhere. Greenfield
on top of friendly primitives.

---

## The one hard constraint

GitHub Pages is **pure static hosting**. Yjs is a CRDT — it resolves *what the
document becomes* when edits merge — but it does **not move bytes between
browsers**. That job belongs to a Yjs *provider* (the transport). So the entire
question reduces to:

> **Where does the sync traffic flow, if we can't run a server on GitHub Pages?**

Three families of answer, in increasing infra cost and decreasing pain:

| Option | Relay | Your infra | Persistence when all peers leave | Reliability | Verdict |
|---|---|---|---|---|---|
| **A. WebRTC P2P** (`y-webrtc`) | Browsers talk **directly**; a tiny *signaling* server only does matchmaking (no document data) | One stateless signaling endpoint (or a public one) | None server-side — survives only via each peer's `y-indexeddb` | NAT traversal can need a TURN relay; degrades past small rooms | **Phase 1** — most aligned with BYO ethos |
| **B. Serverless WebSocket** (Cloudflare Durable Objects via `y-partyserver`/PartyKit) | A Cloudflare Worker + Durable Object relays + persists | One small Worker (separate deploy from Pages) | **Yes** — DO storage holds the doc | Solid; this is the production-grade path | **Phase 2** — when reliability/persistence matters |
| **C. Managed (Liveblocks / Supabase)** | Vendor relays | Vendor account + an **auth endpoint** (secret can't sit in a static bundle) | Yes | Easiest, least code | Fallback — vendor lock + breaks "fully static" |

The frontend code is **nearly identical** across all three — Yjs providers are
swappable behind one interface. That's the key freedom: **pick A now, graduate to
B later without touching the editor binding.**

---

## Recommended path — phased, never a rewrite

> **Update (2026-06-15) — the recommended *starting* transport is the Cloudflare
> Durable Objects relay, not P2P.** Cloudflare Durable Objects are confirmed
> available on the **free** plan, which removes the only reason to start with
> WebRTC P2P. A Durable Object relay is **totally free for now** *and*
> corporate-firewall-proof (a single WSS connection on port 443 — see
> [Will it work over the internet?](#will-it-work-over-the-internet-in-a-corporate-network)
> below). So if any of your users are on corporate networks, **skip Phase 1 and
> build Phase 2's relay as the first networked step** — same effort, far more
> reliable, and it persists rooms. Phase 1 (pure P2P) remains documented as the
> *zero-account* option for a purely consumer audience.

### Phase 0 — Local-first foundation (zero network, valuable solo)
Add `yjs`, `y-codemirror.next`, `y-indexeddb`. Make the deck source a `Y.Text`,
bind it to CodeMirror, persist the `Y.Doc` to IndexedDB. **No collaboration yet** —
but you get CRDT-grade undo/redo and a clean foundation. Ships value even if
multiplayer never turns on. Reconcile with the existing `revisions` store:
**the `Y.Doc` becomes canonical**; checkpoints become Y snapshots (or stay as
periodic source copies).

### Phase 1 — P2P sharing (`y-webrtc`), zero-cost, BYO ethos
Add `y-webrtc`. A "Share" button mints a room URL (`/lattice/drawing-board?room=<id>`);
opening it joins the room. Edits flow **browser-to-browser** — your infra never
sees the deck, exactly like OpenRouter calls never touch your server. The only
piece you host is a **stateless signaling endpoint**, which is trivial and free
forever (a ~30-line Cloudflare Worker, or a public signaling server to start).
Identity = a random name + color (or the user's OpenRouter identity if connected).

### Phase 2 — Reliable relay + server persistence (only when you outgrow P2P)
Swap the provider to Cloudflare Durable Objects (`y-partyserver`). Rooms now
persist server-side and survive everyone leaving; no NAT/TURN fragility. The
Cloudflare free tier comfortably covers a hobby/early-stage app, and **this is the
same Worker where you'd one day proxy a shared OpenRouter key** if you ever move
off pure BYO. Frontend change: one provider import. That's it.

---

## Will it work over the internet? In a corporate network?

The most important practical question, and the answer splits sharply by transport.

**How WebRTC connects (the ICE ladder).** Two browsers try, in order: (1) direct,
(2) **STUN** — a free, lightweight server that just reveals each peer's public IP
so they can "hole-punch" through home routers (discovery only, no traffic flows
through it, free forever), (3) **TURN** — a relay that carries *all* the bytes
when hole-punching fails (consumes bandwidth → **not reliably free**).

- **Over the open internet (home/consumer): usually works, free.** Two people on
  different home networks almost always connect via STUN hole-punching — direct
  P2P, no relay. Fails on **mobile/cellular (CGNAT)** and some ISPs' **symmetric
  NAT**, which force a TURN fallback.
- **Corporate networks: P2P frequently fails.** Enterprise firewalls often block
  UDP outright (WebRTC's preferred transport), use symmetric NAT behind HTTP
  proxies (STUN can't hole-punch), or block WebRTC by policy (DLP). Surviving that
  needs **TURN over TLS on 443** — which costs money *and* still doesn't beat the
  strictest setups. At that point P2P has lost its "zero infra" advantage anyway.

**The transport that works everywhere: a WebSocket relay on 443.** The Cloudflare
Durable Objects relay (Phase 2 / `y-partyserver`) is a **single WSS connection to
a well-known host on port 443** — indistinguishable from ordinary HTTPS. It sails
through virtually every corporate firewall (blocking it would mean blocking the
web), needs no STUN/TURN/NAT gymnastics, and persists rooms server-side.

### The "totally free for now" stack (recommended)

| Piece | What | Where it runs | Cost |
|---|---|---|---|
| Frontend | the Drawing Board, unchanged | **GitHub Pages** | $0 (already have it) |
| Sync relay | ~50-line `y-partyserver` WebSocket server | **Cloudflare Workers + Durable Objects** (free tier, confirmed) | $0 within free limits |
| Transport | one **WSS connection on port 443** | — | — |
| Persistence | rooms survive everyone leaving | Durable Object storage | $0 within free tier |
| Local cache | offline-first | `y-indexeddb` in the browser | $0 |
| Client deps | `yjs`, `y-codemirror.next`, `y-indexeddb`, `y-partyserver` | bundled into the site | $0 |

**Honest caveat:** "totally free" ≠ "zero infrastructure" — you need a free
Cloudflare account and a one-time `wrangler deploy` of a small worker. It stays $0
until you outgrow the (generous) free tier; past that it's a few dollars, not a
rewrite. If Cloudflare's free-tier terms ever change, **Deno Deploy** has a free
tier that also supports WebSockets and can host a drop-in `y-websocket` server —
identical client code.

**Lazier alternative (consumer-only):** `y-webrtc` + Google's public STUN + no
account = truly zero infra, but the public signaling servers are unreliable (so you
end up self-hosting signaling anyway) and **no TURN means it breaks in corporate
and on mobile/CGNAT**. Only "less setup" on paper.

## What the collaboration experience looks like

- **Share a link, edit together.** One person clicks *Share*, sends the URL.
  Everyone who opens it co-edits the same deck live.
- **Live multi-cursor editing** in the CodeMirror source — colored remote cursors
  and selections, character-by-character, conflict-free (that's the CRDT).
- **Shared live preview.** Because the preview is *derived* from the synced
  source, every collaborator's filmstrip updates in lockstep — we sync the
  markdown, not the rendered HTML.
- **Presence.** Avatars/initials of who's in the room (Yjs *awareness*), shown
  top-right and optionally on the filmstrip.
- **Offline-first, auto-merge.** Keep editing with no connection (it's already
  IndexedDB-backed); changes merge cleanly on reconnect.
- **Graceful solo mode.** With no room and no network, the Drawing Board behaves
  exactly as it does today. Collaboration is purely additive and opt-in.
- **The Architect (AI) stays per-user.** Each collaborator drives the AI with
  *their own* OpenRouter key/credits — no shared cost. The conversation can
  optionally be shared as another Yjs type later.

---

## What we'd have to do (implementation sketch)

1. **Deps** (`docs/package.json`): `yjs`, `y-codemirror.next`, `y-indexeddb`,
   and a provider (`y-webrtc` for Phase 1).
2. **Editor binding** (`docs/src/playground/editor.js`): construct a `Y.Doc`,
   take `ydoc.getText('source')`, add the `yCollab(ytext, awareness)` extension to
   the CM6 config. The `getValue/setValue/onChange` adapter
   (`drawing-board.astro:483`) keeps working — the Y.Text becomes the backing store.
3. **Persistence reconciliation** (`drawing-board-store.js`): layer `y-indexeddb`
   for the live doc; keep the existing `revisions`/checkpoint UX but source
   snapshots from the Y.Doc. Decide migration for existing `lattice-drawing-board`
   decks (bump `DB_VERSION`, import legacy source into a fresh Y.Doc on first open).
4. **Room + identity**: URL `?room=` param; "Share" button; random name+color, or
   reuse OpenRouter identity. Wire `awareness` for presence + cursors.
5. **Presence UI**: avatar stack + remote cursor styling (CSS tokens, per HARD
   RULE #3 — no hex literals; collaborator colors via `var(--token)` where they
   touch chrome).
6. **Relay (recommended)**: a ~50-line `y-partyserver` worker on Cloudflare
   Workers + Durable Objects, deployed *separately* from GitHub Pages via
   `wrangler` — free tier, WSS on 443, persists rooms. (P2P-only alternative: a
   tiny stateless `y-webrtc` signaling worker instead — but see the corporate
   caveat above.)
7. **Opt-in + degrade**: feature-flag it; solo/offline path unchanged.
8. **Capabilities + changelog**: register any new tooling in
   `engineering/capabilities.md` (HARD RULE #15); `CHANGELOG.md` entry (#10).

Scope note: **Drawing Board first.** The Workbench studios (theme/layout) use
plain textareas with separate vanilla state — a later, separate effort.

---

## Potential issues (the honest list)

- **GitHub Pages can't host the relay.** Even the minimal signaling endpoint lives
  *off* Pages (Cloudflare Worker free tier). "Zero cost" holds; "zero infra
  whatsoever" does not — there's always one tiny external piece. Pure public
  signaling avoids even that but is unreliable.
- **WebRTC NAT traversal.** Some networks (corporate/symmetric NAT) need a **TURN**
  relay, which is *not* reliably free. Mitigations: Cloudflare's TURN, a small
  free TURN tier, or just graduate to Phase 2 (Durable Objects) where this
  disappears. This is the single biggest reliability caveat of the P2P phase.
- **No persistence when everyone leaves (Phase 1).** P2P keeps the doc only in
  live peers + each peer's IndexedDB. If all leave, the canonical copy is whatever
  each person last saved locally. Phase 2 (server persistence) fixes this; until
  then, the existing checkpoint store is the safety net.
- **No access control on open rooms.** Anyone with the link can edit. CRDTs have no
  server-side authz by themselves. For private decks you'd need either Phase 2 +
  an auth check, or unguessable room IDs as a stopgap (security-by-obscurity —
  acceptable for hobby, not for sensitive content).
- **Managed providers break "fully static."** Liveblocks/Supabase need a secret
  that **cannot** sit in a static bundle → you'd need an auth endpoint = a backend
  = the thing we're avoiding. This is why managed is the *fallback*, not the
  default, despite being the least code.
- **Two-sources-of-truth risk.** The existing `revisions` store and the new Y.Doc
  must not fight. Resolve by making the Y.Doc canonical and treating checkpoints as
  snapshots; needs a deliberate IndexedDB migration.
- **Bundle size.** `yjs` + provider + binding adds ~roughly 100–200 KB. Lazy-load
  the collaboration path so solo users don't pay for it.
- **Webfont/CDN note carries over.** The sandbox's TLS proxy MITMs CDN webfonts
  (see `engineering/gotchas.md`); irrelevant to sync but relevant when
  screenshot-verifying the presence UI.

---

## Why this fits Lattice specifically

The OpenRouter integration already proved the thesis: **you can ship a "cloud"
feature with zero cost and zero backend by letting each user bring their own
resources and keeping data off your infra.** WebRTC P2P collaboration is the same
move for multiplayer — peers relay their own bytes, you host nothing but a
stateless matchmaker. And because Yjs providers are swappable, the day you *want* a
real backend (persistence, private rooms, a shared AI key), it's a one-import
upgrade to a Cloudflare Worker — not a rewrite. Start free and P2P, graduate only
when the app earns it.

## Open decision for sign-off

The genuine fork is **how far to build now**:

- **Just the writeup** (this doc) — decide later.
- **Phase 0** — local-first Yjs foundation, no multiplayer yet (low risk, solo value).
- **Phase 0 + 1** — full P2P collaboration on the free tier (the headline feature).

Everything past that (Phase 2 server persistence, private rooms) is deferred until
the free P2P path is proven.
