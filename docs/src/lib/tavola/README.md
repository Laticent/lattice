# Tavola

**Share a link; the other person clicks it, knocks, you let them in, and you are editing the same
document together — browser to browser, with no server of yours in the middle.**

Tavola (Italian for the table people gather around) is the collaboration engine behind the Lattice
Studio's Live panel. It knows **peers and bytes**; the app knows **screens**. It owns:

- **the link** — `#live=<room>.<secret>.<host>` in the URL *fragment*, which browsers never send
  to a server (`link.ts`); `host` fingerprints the host's signing key (`hostkey.ts`), and only a
  hello signed with that key is believed;
- **the handshake** — hello → knock → admit / deny, the lobby the guest sees first, and rejoin by
  token after a dropped connection (`session.ts`);
- **the gate** — a document or awareness message is sent only to admitted members and applied only
  from them, and a document edit only from a member who may edit. A peer that has the link but was
  never admitted gets a connection and nothing over it;
- **the cap** — four people, host included, and the four session colors;
- **posts** — `session.post(bytes, to?)` and `onPost(bytes, from)`, a channel for app messages
  (the Studio's chat) under the same gate, where `from` is the transport sender, so an app never
  has to believe an author field;
- **the session clock** — `session.now()` is the host's time on every member, estimated by
  Cristian's algorithm over a ping/pong (tightest round trip wins, re-measured every 30 s), so an
  app never compares two device clocks;
- **connection paths** — `session.paths()` reports, for each member, the candidate pair its
  connection settled on (`host` / `srflx` / `prflx` / `relay`), when the transport can say
  (`Transport.paths`, optional; the Trystero adapter reads WebRTC stats). `linkKind()` turns a
  pair into *same network*, *direct* or *relay*;
- **succession, as a regency** — when the host's link stays down for `HANDOFF_GRACE_MS` (20 s),
  the HEIR hosts until the host is back: the first member, in admission order, who may edit. The
  host never hands its key on; it certifies the heir's own key with a range of terms and a ceiling
  (`Cert`, `verifyChain` in `hostkey.ts`), and a hello carries that chain back to the link's key.
  Members rejoin the regent by token, new people can knock, and a guest follows the highest term.
  The session's FIRST host never steps down: when it comes back (reload or frozen tab) it
  certifies itself above the regent's whole range, the regent steps down and hands back the
  tokens it issued (`handback`), and everyone follows the first host again. The heir gets the
  rejoin tokens only by id (`tokenId`, SHA-256), so it can check a knock but never knock with
  one. `state.heir` names the heir everywhere; `state.minTerm` is the floor a guest persists;
  a host carries `succession()` across its own reload;
- **media** — `session.setMedia(stream)` sends a stream's tracks (a call's microphone) to every
  admitted member and to each one admitted later, never to a stranger; `SessionOptions.media` gets
  a member's stream (`add`) and its end (`drop`), and a stream from a peer that is not admitted yet
  is held until it is. It rides the same connections as the document (`Transport.addTrack` /
  `onTrack`, optional; the Trystero adapter implements them);
- **client binding** — each member knocks with its awareness `client` id and the host binds it in
  the roster (refusing one another member already holds), so an app can drop presence a member
  sends for anyone else.

**A peer id is not an identity.** Transport ids are self-declared, so once a link drops, anyone with
the link can reconnect under the old id. A guest stops trusting the host's id the moment its link
drops and sends it nothing until a fresh signed hello; a member whose link drops leaves every
roster at once, and comes back only when the host vouches for it (`roster?`). The host's word is a
vouch, not a proof: per-member signing keys would make it one, and are not built yet.

It does **not** own the document. The app passes its own replicated streams in (`Stream`), so Yjs
stays the app's dependency, and the transport is passed in too (`Transport`) — the way Trama takes
dagre. The core imports nothing outside this folder.

> Design, threat model and measurements:
> [`engineering/decisions/2026-10-06-studio-live-collaboration.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-06-studio-live-collaboration.md).

## Install

```sh
npm i @laticent/tavola
```

`trystero` (exactly 0.26.0) is an optional peer, needed only for `@laticent/tavola/trystero`.

## 60-second start

```ts
import * as Y from 'yjs';
import { createHostKey, createSession, formatLink, mintLink, parseFragment } from '@laticent/tavola';
import { trysteroTransport } from '@laticent/tavola/trystero';

const doc = new Y.Doc();
const stream = {
  encodeAll: () => Y.encodeStateAsUpdate(doc),
  applyRemote: (u) => Y.applyUpdate(doc, u, 'remote'),
  onLocal: (cb) => { const h = (u, o) => o !== 'remote' && cb(u); doc.on('update', h); return () => doc.off('update', h); },
};

// Host: make a signing key, mint a link for it, and open the room.
const key = await createHostKey();
const link = mintLink(key.fingerprint);
share(formatLink(location.href, link));
const host = createSession({
  transport: trysteroTransport(link.room, link.secret),
  host: { name: 'Sharmarke', key, invite: { title: 'Q3 Board Review', hostName: 'Sharmarke' } },
  doc: stream,
});
host.subscribe(() => render(host.getState()));   // waiting knocks, members…
// host.admit(id) · host.deny(id) · host.remove(id) · host.setRole(id, 'view') · host.end()

// Guest: the link is in the fragment.
const parts = parseFragment(location.hash);
const guest = createSession({ transport: trysteroTransport(parts.room, parts.secret), hostFingerprint: parts.host, doc: stream });
// stage: connecting → lobby (guest.getState().invite) → guest.knock('Amina') → waiting → live
```

## Testing without a network

`createMemoryNetwork()` gives transports that reach each other in memory, with queued delivery so
ordering hazards still show; `await net.settle()` drains it, and `session.idle()` waits out a
session's own async work (signing and verifying hellos). The test suite (`session.test.ts`) runs
whole sessions over it with a real Yjs document, including the attacks the 2026-10-06 red team
found.

## What it does not do (yet)

- **Authenticate edits inside the document.** An admitted editor is trusted with the text: Yjs
  updates carry no signatures, so an editor can write items under another member's client id
  (and, by sending a forged item to one peer only, leave two copies that disagree for the rest of the session, since both then report the same state). Tavola gates
  WHO may edit, not what an editor writes.
- **Rotate the link** when someone is removed — removal blocks their peer id and revokes their
  token, but the old link still reaches the lobby, where the host sees a fresh knock.
- **Hide members from link holders.** Every peer in the room gets a WebRTC connection to every
  other before admission, so a link holder learns members' IP addresses. Nothing is sent over it.
- **Prove guests' names.** A guest's name is whatever they typed; the knock is where the host checks.
- **Limit what an heir can do while it is heir.** Its cert is valid from the moment it is
  issued, so it can take the host role whenever it likes until the first host is back (which then
  takes it back, and never names that heir again). A member who may edit can already rewrite the
  whole deck, so the host extends this only to editors, and the Studio names the heir in the
  host's panel. A view-only member is never heir, and a session with no other editor waits for its
  host as before.

## License

AGPL-3.0-only. The full text ships as `LICENSE` in the package.
