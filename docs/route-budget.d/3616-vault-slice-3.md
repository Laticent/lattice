studio: +1771
home: +4
playground: +4
getting-started: +8
Vault slice 3 moves deck text into the storage vault. What stays eager is the synchronous deck shelf in
studio-store.ts. Every deck read and save goes through it, and it holds the guard that refuses a save of a
vault deck this tab has not read yet (the storage desk's must-fix). A small piece of the shell stays eager too:
the deck switch waits for that guard. Given back first: the vault side (hydration, the per-deck write queue,
the move's hand-overs, deck-shelf-io.ts), the shell's merge and hydrate effects (deck-shelf-shell.ts), the
engine, the Yjs code and the move all load on first use. That took this PR from +2.5 KB to +1.8 KB (1,771 B, measured on 2706b1d6 against main 2ead5e1d). The owner
chose one 3 KB raise of the Studio eagerJsGz ceiling, in #3610, to cover this PR and slice 4 (storage desk,
2026-11-28).
Home, playground and getting-started grow by Site Diagnostics' storage breakdown, which now counts the
boot-deck cache (lattice-studio-boot-src) as deck source (+8 B; slide-boundaries moves -4 B on two routes).
A lossless rewrite of that match saves at most 2 B, so it stays readable.
