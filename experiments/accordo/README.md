# Accordo: a zero-dependency list CRDT, kept in reserve

Accordo is an ordered list of records that several replicas (tabs, devices) edit at once and merge in any order. It
was written to compete with Yjs for merging Studio chat threads across tabs. The owner chose Yjs on 2026-11-12 and
asked to keep Accordo rather than throw it away. The decision, the design and the full results are
`engineering/decisions/2026-11-12-chat-threads-crdt.md` §7 and §10.

**Where it stands (round 3).** It passes the 4,500-session correctness gate with no reply split from its question
(Yjs: 9). It opens a fresh thread about 2x faster than Yjs and uses half the heap. It stores an aged thread 8.6x
larger, because it writes each deleted entry as a JSON row; a run-length binary encoding should close most of that
gap (an estimate, not built). Two independent audits found defects in rounds 1 and 2, all fixed; round 3 is not
audited. What round 4 needs is `followups.d/3147-p2-accordo-round-4.md`.

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
