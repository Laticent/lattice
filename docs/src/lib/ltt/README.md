# LTT — the Lattice Timing Track

**One JSON shape for when each word of a narration is spoken, in a deck or a tour.**

`@laticent/ltt` is the format and nothing else: the types, a JSON Schema generated from them, a
validator, and the two encodings (canonical for tools, packed for the HTML export). It has no
engine (that is [Cadenza](../cadenza/)), no audio ([Suono](../suono/)) and no DOM, and it imports
nothing outside this folder, not even a `node:` built-in. A boundary gate enforces that.

- **Spec:** [`engineering/ltt.md`](../../../../engineering/ltt.md), including its owner, the
  transport rules and what video export guarantees.
- **Why:** [`engineering/decisions/2026-09-24-lattice-timing-track.md`](../../../../engineering/decisions/2026-09-24-lattice-timing-track.md).

```ts
import { buildTrack } from '@laticent/cadenza';
import { type Ltt, pack, unpack, validateLtt } from '@laticent/ltt';

const ltt: Ltt = {
  format: 'ltt', version: '1.0',
  source: { kind: 'deck', id: 'board.md' },
  inputs: { engine: 'sha256:…', pace: 'moderate' },
  seekable: true,
  segments: [{ id: 'd1', kind: 'slide', at: { slide: 1 }, hash: 'sha256:…', basis: 'estimate',
               holdMs: 0, track: buildTrack('Revenue grew 18% to $4.2M.') }],
};

validateLtt(ltt);            // [] when valid; plain sentences otherwise. Never throws.
const small = pack(ltt);     // tuples, for embedding; lossless
unpack(small);               // back to canonical
```

`Word`, `Cue` and `CaptionTrack` are defined here, and Cadenza re-exports them, so code that
imports them from Cadenza keeps working.

**Editing the types:** `types.ts` is the schema's source. Run `npm run ltt-schema:build` and
commit `ltt.schema.json`; `npm run build:check` fails when you forget.
