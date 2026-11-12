# Accordo: a zero-dependency list CRDT, kept in reserve

Accordo is an ordered list of records that several replicas (tabs, devices) edit at once and merge in any order. It
was written to compete with Yjs for merging Studio chat threads across tabs. The owner chose Yjs on 2026-11-12 and
asked to keep Accordo rather than throw it away. The decision, the design and the full results are
`engineering/decisions/2026-11-12-chat-threads-crdt.md` §7 and §10.

**Where it stands (round 4).** It passes the 4,500-session correctness gate and two fixed concurrent-delete scenarios,
and split no reply from its question on the stated seeds (Yjs: 9; Accordo does split 1–2 in 3,000 on other seeds).
It opens a fresh thread 1.5–3.4x faster than Yjs in browsers and uses half the heap. It stores an aged thread 8.6x larger,
because it writes each deleted entry as a JSON row; a run-length binary encoding should close most of that gap (an
estimate, not built). Three independent audits found defects in rounds 1 to 3, the third a divergence when two tabs
delete one reply; all are fixed. Round 4 is not audited. Reopening a replica under its own id is safe only from its
latest state (see `RecordList.decode`). What the next round needs is `followups.d/3147-p2-accordo-next-round.md`.

| File | What it is | Run it (from this folder unless noted) |
|---|---|---|
| `accordo.ts` | the library: RGA tree order, gap-free per-replica sequences, Lamport last-writer-wins fields, remove-wins deletes | (imported by the rest) |
| `contender.ts`, `accordo-adapter.ts`, `yjs-adapter.ts` | one interface, and both libraries behind it | |
| `property.ts` | the correctness gate (fast-check) | `SEED=42 node --experimental-strip-types --no-warnings property.ts 1500` |
| `mutants.mjs` | proves the gate can fail: removes one safeguard at a time | `node mutants.mjs 500` |
| `bench.ts` | Node benchmarks | `node --experimental-strip-types --expose-gc --no-warnings bench.ts` |
| `browser-bench.mjs` | the same benchmarks in Chromium, Firefox and WebKit | from `docs/`: `node ../experiments/accordo/browser-bench.mjs 3` |
| `ids.ts`, `gzip.ts` | seeded replica ids; gzip sizes in Node | |
| `results/` | the measurements behind the design note's §10.3 | |

fast-check, Yjs, esbuild and Playwright resolve from `docs/node_modules`.
