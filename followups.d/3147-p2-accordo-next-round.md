---
origin: 3147
priority: P2
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-11-12-chat-threads-crdt.md §10.4
deferred: off-path — the owner chose Yjs for chats and asked to keep Accordo in reserve, not to finish it now
---

# Accordo, our zero-dependency list CRDT: kept in reserve, its next round when a use appears

why now   — not now. The owner asked to keep it, not throw it away (2026-11-12). Pick it up when Lattice needs an ordered, mergeable list without Yjs (a second use, a dependency-free package, or Yjs's storage or placement becoming a problem)
where     — experiments/accordo/accordo.ts (the library), property.ts and mutants.mjs (the gate), bench.ts and browser-bench.mjs (the benches)
done when — the next round lands a compact, run-length binary encoding of tombstones and ids; an aged thread stores within about 2x of Yjs's 105 KB; an independent audit of round 5 and of that round finds nothing open (four audits so far; the first three found merge defects, the third a divergence; the fourth found none in the merge but gaps in the gate); `RecordList.decode(w, replica)` either refuses an older save or the API drops replica reuse; then extract it to a package with its own tests
evidence  — today (round 5): passes the 4,500-session gate and the three fixed concurrent-delete scenarios, 0 misplaced replies on the stated seeds (Yjs 9; Accordo misplaces up to 2 in 3,000 on other seeds); 1.5–3.4x faster to open a fresh thread in browsers, half Yjs's heap; 8.6x larger than Yjs on an aged thread (JSON tombstone rows, about 83 B each, in about 3,400 runs)
verify    — re-run property.ts on three seeds, mutants.mjs, bench.ts and browser-bench.mjs against Yjs; the round-5 changes have not been independently audited
