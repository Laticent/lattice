---
kind: library
name: Tavola
order: 8
promise: Share a link, let people in, edit together. No server of your own.
intro: Tavola adds live co-editing to a web app with nothing but a link. Your guest opens it and knocks, you let them in, and you're both editing the same document, browser to browser. You run no collaboration server, and nobody gets your document until you admit them.
group: Sharing and exporting
inLattice: Powers the Studio's Live panel.
mark: /tavola-mark.svg
useWhen: You want a colleague editing with you for ten minutes — without accounts, without uploading the file, and without running a sync service.
facts:
  - { k: Package, v: '@laticent/tavola' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser (and Node, for tests) }
  - { k: Dependencies, v: None (Trystero optional, for browser-to-browser; Yjs, y-protocols and lib0 optional, for the Yjs adapter) }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/tavola/README.md
    note: The handshake, the gate, every option, and what it doesn't do yet.
  - label: The session
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/tavola/session.ts
    note: Knock, admit, roles and the roster, in one file.
  - label: The test suite
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/tavola/session.test.ts
    note: Whole sessions run over the in-memory network — the best worked examples.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-06-studio-live-collaboration.md
    note: The design note, the threat model and the measurements.
---

## The problem

You're polishing a presentation and want a colleague to fix one slide with you for ten minutes. You don't want to make them an account, upload the file somewhere, or pay for a sync service.

Live co-editing normally means a server that every keystroke passes through, plus accounts and sign-in to decide who sees what. Going peer to peer instead has its own traps:

- **A shared sync server** is infrastructure to run, pay for and secure — and your document passes through it.
- **"Anyone with the link" isn't access control.** In a peer-to-peer room, anyone who has the room name can connect. Without a gate, the document flows to whoever shows up.
- **A peer's id is only a claim.** A stranger can rejoin under the id of someone who left. Treat the id as identity and you've let them in.
- **Merging edits is a separate problem.** Shared-editing libraries such as Yjs solve the merging, but not who may join, who may edit, or what happens when the host's laptop goes to sleep.

## The idea

- **The invite is a link.** The room, a secret and a fingerprint of the host's signing key ride after the `#` in the URL — the part browsers never send to a server. A guest trusts only a greeting signed by that key.
- **Guests knock; the host admits.** Opening the link shows only an invite — the deck title, the host's name. The guest knocks with a name, and the host lets them in or turns them away. Reconnecting after a dropped line uses a token, not a second knock.
- **The gate.** Changes go only to admitted members and are applied only from members allowed to edit. A view-only member's typing reaches no one. Someone who has the link but was never admitted gets a connection and nothing over it.
- **You bring the document and the network.** Tavola moves the bytes. Your app hands it the document — a Yjs document fits in three small functions — and a way to connect. A ready adapter connects browsers directly, using public relays only so they can find each other.
- **Made for small rooms.** Up to four people, each with a color, plus a channel for chat, a shared clock, call audio, and a stand-in host who keeps the session going if the host drops.

## How to use it

Install it with Yjs, and Trystero for real browser-to-browser use:

```sh
npm install @laticent/tavola yjs
npm install trystero@0.26.0
```

> Tavola publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/tavola`.

A host and a guest in one process, over Tavola's in-memory network:

```ts
import * as Y from 'yjs';
import { createHostKey, createMemoryNetwork, createSession, mintLink } from '@laticent/tavola';

// Wrap a Yjs document in the three functions Tavola needs.
const stream = (doc) => ({
  encodeAll: () => Y.encodeStateAsUpdate(doc),
  applyRemote: (u) => Y.applyUpdate(doc, u, 'remote'),
  onLocal: (cb) => { const h = (u, o) => o !== 'remote' && cb(u); doc.on('update', h); return () => doc.off('update', h); },
});

const net = createMemoryNetwork();          // in real browsers: trysteroTransport(room, secret)
const key = await createHostKey();
const link = mintLink(key.fingerprint);     // { room, secret, host }

const host = createSession({
  transport: net.join(link.room, link.secret),
  host: { name: 'Ada', key, invite: { title: 'Q3 review', hostName: 'Ada' } },
  doc: stream(new Y.Doc()),
});
const guest = createSession({
  transport: net.join(link.room, link.secret),
  hostFingerprint: link.host,
  doc: stream(new Y.Doc()),
});

await net.settle();
guest.knock('Amina');                       // the guest asks to come in
await net.settle();
host.admit(host.getState().waiting[0].id);  // the host lets them in; both are now live
```

In a real app, share `formatLink(location.href, link)`, read it on the guest's side with `parseFragment(location.hash)`, and connect with `trysteroTransport` from `@laticent/tavola/trystero`.

| Call | What it gives you |
| --- | --- |
| `createSession(opts)` | A host (pass `host`) or a guest (pass `hostFingerprint`) |
| `knock` / `admit` / `deny` / `remove` / `setRole` | The lobby and the guest list |
| `getState()` + `subscribe(cb)` | Who's here, who's waiting, and what stage you're at |
| `mintLink`, `formatLink`, `parseFragment` | Make, share and read the invite link |
| `post(bytes)` / `setMedia(stream)` / `now()` | Chat messages, call audio and a shared clock |
| `createMemoryNetwork()` | Whole sessions in one process, for tests and demos |

## Where else it fits

- **Local-first editors** — notes, Markdown, code, design files — anything already modeled as a Yjs document.
- **Pair sessions inside a product**: a support agent and a customer on one form, a tutor and a student on one exercise, with the host approving each person.
- **Apps that can't run a sync server**, for cost or privacy: with the browser adapter, documents travel browser to browser.
- **Small-group live features** beyond text: chat, a voice call, synchronized timers, "follow the presenter".
- **Testing collaboration logic** with no network at all.

## How Lattice uses it

Tavola powers the **Live** panel in the Studio, Lattice's editor in the browser. The Studio builds live cursors, presence, follow mode, chat, and audio and video calls on top of it. The Lattice engine and its command-line tool don't use it.

## Presence, and where each member is

Awareness is how an app shows who is where. Tavola's Yjs adapter checks every incoming presence message once, for every app: it refuses oversize messages before reading them, files each status under the person who sent it, keeps a forged clock from silencing someone, and keeps only the keys you declared. A declared key holds a place from a fixed list, a number in a range, or an id of a fixed form, never free text, so what someone has typed and not yet committed cannot travel as presence. It ships beside the core as `@laticent/tavola/yjs`, so the core itself still needs no Yjs.

## What it doesn't do

- **Edits aren't signed.** Tavola decides who may edit, not what an editor writes — anyone you let edit can change anything.
- **People holding the link can see each other's network address.** Browsers connect directly before admission, though nothing is sent until you admit someone.
- **Removing someone doesn't change the link.** They're blocked, but the old link still reaches the lobby, where they could knock again.
- **Names are whatever people type, and rooms are small** — four people, host included. Tavola doesn't store the document; that's your app's job.
