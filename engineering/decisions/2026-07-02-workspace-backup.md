---
status: shipped
summary: Studio workspace backup & restore — one zip the user holds, with a three-tier ownership-framed warning posture, because browser storage is best-effort everywhere
last-updated: 2026-07-02
companion:
  - ./2026-07-02-docs-pwa.md
  - ../gotchas.md
---

# 2026-07-02 — Workspace backup & restore (Workspace → General)

## Context

All Studio user content lives in browser storage: decks/checkpoints/chats/
settings in `lattice-studio-*` localStorage, the saved theme/component/finish
Library in the `lattice-workbench` IndexedDB. Browser storage is best-effort
**everywhere** — WebKit's 7-day tab eviction (surfaced by the PWA work,
`2026-07-02-docs-pwa.md`) is merely the loudest case; the common one is a user
clearing browsing data. There was no way to get the whole workspace out or
back in: export was per-deck artifacts + per-asset zips only.

## Decision

### One backup file the user holds

`lattice-workspace.zip` (Workspace → General → Backup & restore), packed by
`docs/src/components/studio/workspace-backup.ts`:

| Entry | What |
|---|---|
| `manifest.json` | `lattice-workspace/1`, export time, counts |
| `workspace.json` | the Studio store snapshot (index, edited sources, checkpoints, chats, settings, instructions) |
| `decks/<slug>.md` | a readable copy of every deck — useful with no Lattice at all |
| `library.zip` | themes/components/finishes as a NESTED `lattice-asset/1` bundle — restore reuses `unpackBundle` verbatim |
| `refdocs.json` | the Library's reference docs (`kind:'refdoc'` records; PDFs as data URLs) — restore upserts by name via `saveRefDoc` |

Store knowledge stays in `studio-store.ts` (`exportStudioState` /
`importStudioState`); the backup module only packs, parses, and orchestrates.

**Excluded on purpose:** the OpenRouter key + PKCE verifier (a backup gets
emailed and synced; secrets don't ride in it — reconnecting is one click) and
theme showcase PDFs (re-renderable weight). A unit test asserts the key can
never appear in the zip.

### Restore merges; it never overwrites

- Unknown deck id → added (source, checkpoints, chat ride along).
- Same id, same source → skipped; the backup's history fills any empty slots.
- Same id, **diverged** source → imported beside as "<title> (restored)" with
  a fresh id. Nothing on the device is ever replaced.
- Library assets upsert by name (the same semantics as Library → Import).
- Settings + instructions are restored from the backup (they're the user's own
  values in both worlds).
- After a restore the Studio reloads — decks, settings, and Library span three
  stores, and a reload is the one honest way to re-derive every view.

### The warning posture: ownership framing, three tiers

The copy never threatens ("you may lose your data"); it states ownership —
the flip side of the site's own "offline & private" promise:

> Your decks live in this browser — private to this device. A backup keeps
> them yours even if the browser clears its data.

1. **Passive, always there** — the settings row: the two buttons, "Last
   backup: <date|never> · ~N MB in this browser".
2. **Earned nudge, rare** — one plain toast on boot, only when 3+ decks carry
   edits AND no backup exists (or it's >30 days old), at most once per 14
   days (`shouldNudgeBackup`). Never a modal, never red.
3. **Situational sentence** — appended only in a Safari **tab** (the
   storage-eviction case; the installed app is exempt —
   `2026-07-02-docs-pwa.md` § iOS caveats): "Safari clears unused site data
   after a week — a backup makes that a non-event."

The Studio also calls `navigator.storage.persist()` best-effort on boot (the
Drawing Board already did), which upgrades eviction from "possible" to
"needs storage pressure" on Chromium.

## Consequences

- A cleared browser is no longer a lost workspace — restore on any machine.
- The Drawing Board's IndexedDB stores (its own decks/revisions/chats) are
  **not yet** in the backup — it has its own settings surface; unifying the
  three stores under one export is the known follow-up the asset-store
  comment already flags.
- The "Cloud workspace — coming soon" stub stays; a backup file is the
  no-server durability story until (if ever) cloud sync ships.
