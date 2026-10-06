# Tavola

**Share a link; the other person clicks it, knocks, you let them in, and you are editing the same
document together — browser to browser, with no server of yours in the middle.**

Tavola (Italian for the table people gather around) is the collaboration engine behind the Lattice
Studio's Live panel. It knows **peers and bytes**; the app knows **screens**. It owns:

- **the link** — `#live=<room>.<secret>` in the URL *fragment*, which browsers never send to a
  server (`link.ts`);
- **the handshake** — hello → knock → admit / deny, the lobby the guest sees first, and rejoin by
  token after a dropped connection (`session.ts`);
- **the gate** — a document or awareness message is sent only to admitted members and applied only
  from them, and a document edit only from a member who may edit. A peer that has the link but was
  never admitted gets a connection and nothing over it;
- **the cap** — four people, host included, and the four session colors.

It does **not** own the document. The app passes its own replicated streams in (`Stream`), so Yjs
stays the app's dependency, and the transport is passed in too (`Transport`) — the way Trama takes
dagre. The core imports nothing outside this folder.

> Design, threat model and measurements:
> [`engineering/decisions/2026-10-06-studio-live-collaboration.md`](../../../../engineering/decisions/2026-10-06-studio-live-collaboration.md).

## 60-second start

```ts
import * as Y from 'yjs';
import { createSession, formatLink, mintLink, parseFragment } from '@laticent/tavola';
import { trysteroTransport } from '@laticent/tavola/trystero';

const doc = new Y.Doc();
const stream = {
  encodeAll: () => Y.encodeStateAsUpdate(doc),
  applyRemote: (u) => Y.applyUpdate(doc, u, 'remote'),
  onLocal: (cb) => { const h = (u, o) => o !== 'remote' && cb(u); doc.on('update', h); return () => doc.off('update', h); },
};

// Host: mint a link and open the room.
const link = mintLink();
share(formatLink(location.href, link));
const host = createSession({
  transport: trysteroTransport(link.room, link.secret),
  host: { name: 'Sharmarke', invite: { title: 'Q3 Board Review', hostName: 'Sharmarke' } },
  doc: stream,
});
host.subscribe(() => render(host.getState()));   // waiting knocks, members…
// host.admit(id) · host.deny(id) · host.remove(id) · host.setRole(id, 'view') · host.end()

// Guest: the link is in the fragment.
const parts = parseFragment(location.hash);
const guest = createSession({ transport: trysteroTransport(parts.room, parts.secret), doc: stream });
// stage: connecting → lobby (guest.getState().invite) → guest.knock('Amina') → waiting → live
```

## Testing without a network

`createMemoryNetwork()` gives transports that reach each other in memory, with queued delivery so
ordering hazards still show; `await net.settle()` drains it. The test suite (`session.test.ts`)
runs whole sessions over it with a real Yjs document.

## What it does not do (yet)

- **Rotate the link** when someone is removed — removal stops every honest peer trusting them, but
  the old link still reaches the lobby, where the host sees a fresh knock.
- **Prove who the host is.** Anyone holding the link could answer a newcomer's lobby first and pose
  as the host. The knock still has to be answered, and the lobby shows the host's name, but nothing
  cryptographic binds that name. Host keys are a later slice.
- **Carry media.** Audio and video ride the same connection in a later slice.
