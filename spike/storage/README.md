# Storage spike — THROWAWAY, never merges

Checks the facts `engineering/decisions/2026-11-22-local-first-drive-storage.md` rests on (slice 0).

- `opfs/run.mjs` — OPFS write → reload → read on Chromium, WebKit and Firefox, main thread `createWritable`
  and worker `createSyncAccessHandle` / `createWritable`, ephemeral and persistent contexts.
  `cd docs && node ../spike/storage/opfs/run.mjs`
- `yjs-spike.mjs` — Yjs 13.6.x: per-device update files, content-hashed bases, idempotent adoption,
  state-vector growth, a simulated year, the three-way save. `node spike/storage/yjs-spike.mjs [seed]`
- `docs/src/pages/spike/drive.astro` — the real-Google page the owner runs (`/spike/drive/?client_id=…`).
