---
origin: 2547
priority: P1
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547#issuecomment-6009470165
---

# Prove the no-server transport before S1 builds on it

why now   — the live collaboration note's whole transport rests on Trystero's README:
            public Nostr relays for matchmaking, password-encrypted offers, media
            tracks. Nobody has run it. A failed spike changes §7 before any code lands.
where     — a throwaway spike in `.scratch/collab-spike/`; the note is
            `engineering/decisions/2026-10-06-studio-live-collaboration.md` §4, §7, §8.
done when — two browser contexts join one room over the public Nostr strategy, the
            host admits the guest over a data action, a `Y.Text` edit syncs both ways,
            and §7 records the measured join time (median of 5) and any failure; plus
            a fact-checker pass on §3's file:line pointers, with fixes folded in.
evidence  — the spike's console log with timings, and the fact-checker's verdict table.
verify    — tier 1 checker, because it is the evidence for the note's core claim.
