---
title: Privacy
description: Who can see what when you use Lattice. Today this page covers Live sessions in the Studio, and who sees your IP address there.
---

This page says who can see what when you use Lattice. It covers **Live sessions** in the Studio
today, because that is where your device talks to other people's devices. The last section lists
where each answer comes from.

## Live sessions: who sees your IP address

A Live session lets up to four people edit one deck together. It has no Lattice server in the
middle: each browser connects straight to the others. Here is what that exposes.

**Everyone in the session sees your IP address.** A direct connection hands each browser the
other's address. That starts **when a guest knocks**, before the host lets them in, so:

- as a **host**, anyone who knocks using your invite link can see your IP address, even if you
  never admit them;
- as a **guest**, the host and everyone already in the session can see yours, even while you wait
  in the lobby.

**Some public servers see it too, but not your deck.** Browsers need help to find each other, and
that help comes from public servers that Lattice does not run:

- **STUN servers, run by Google and Cloudflare.** Each browser asks one what its public address
  is. The server sees your IP address and nothing else.
- **Relays, run by independent operators.** They pass the first "here is how to reach me"
  messages between browsers. Those messages are encrypted with the session's secret, which is part
  of the invite link, so a relay sees your IP address but cannot read them.

Your edits, carets, chat and the deck itself go **browser to browser** once you are connected. No
server sees them: not Lattice's, and not the ones above.

**No backup server carries your session.** Some apps fall back to a server that passes everything
through (TURN) when two browsers cannot reach each other directly. The Studio has none. On a network
that blocks direct connections, the session won't connect; the Studio never sends your deck through
someone else's server instead.

### What you can do

- Share an invite link only with people you would give your IP address to. The link holds the
  session's secret, so anyone who has it can knock.
- If your IP address must stay private, use a VPN, or stay out of Live sessions.

## Where this comes from

- The wording on the Live start card and the lobby, which link here:
  `docs/src/components/studio/live/LivePanel.tsx` and `LiveLobby.tsx`.
- The connection itself: `docs/src/lib/tavola/adapters/trystero.ts` (Trystero over Nostr relays),
  and `docs/src/components/studio/live/live-ice.ts`, which lists no TURN server.
- The design and its review: `engineering/decisions/2026-10-06-studio-live-collaboration.md`, §12.
