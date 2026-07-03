---
status: shipped
summary: The installed PWA is the Studio — start_url /studio/, named "Lattice Studio", site-wide scope kept; install is offered where the app is
last-updated: 2026-07-03
companion:
  - ./2026-07-02-docs-pwa.md
  - ./2026-07-02-workspace-backup.md
---

# 2026-07-03 — The installed app is the Studio (PWA identity)

## Context

The first PWA slice (`2026-07-02-docs-pwa.md`) made the whole site installable
with `start_url: "/"` — so the installed icon launched the **marketing
homepage**. But the thing a person wants on their home screen is the editor
with their decks. "The entire website is the PWA, but in reality the Studio is
the app."

## Decision

Disentangle the three things "the website is the PWA" conflates, and decide
each on its own:

1. **Offline coverage (service worker)** — unchanged, site-wide. Offline docs
   are as valuable as an offline editor; the worker's scope was never the
   problem.
2. **App identity (what installing gets you)** — ONE app, aimed at the Studio:
   `start_url: "/studio/"`, `name: "Lattice Studio"` (`short_name` "Lattice").
   `scope` and `id` stay `/`: docs open **inside** the installed window (no
   out-of-scope browser banners), and the unchanged `id` means existing
   installs migrate in place on the browser's next manifest refresh (iOS
   snapshots label/icon at install — those update only on re-add; the launch
   URL updates regardless).
   The rejected shape — a manifest fenced to `scope: "/studio/"` — is the
   crisper statement but a worse product today: every docs link inside the app
   would sprout an out-of-scope banner, and Drawing Board/Workbench/Playground
   would need manifests of their own. It stays open as the evolution path if
   the surfaces ever want separate identities; nothing here forecloses it.
3. **Install discovery (where we suggest it)** — where the app is, not on the
   docs: an **Install the app** group in Workspace → General. Four honest
   states (`install-app.ts`), never a dead button: already-installed note;
   the real Chromium prompt (captured early in `PwaHead.astro` via
   `beforeinstallprompt` — the capture also suppresses the browser's own
   mini-infobar); the iOS instruction card (Share → Add to Home Screen — iOS
   has no prompt API, ever); a browser-menu pointer everywhere else.

Two editor-fit manifest extras ride along:

- `launch_handler: { client_mode: ["focus-existing", "auto"] }` — tapping the
  icon focuses the running Studio instead of opening a second copy. Two live
  copies would fight over the same localStorage autosave (the 400ms debounce),
  so this is correctness, not polish.
- `shortcuts` — long-press the icon → **New deck** (`/studio/?new=1`, handled
  once on boot then scrubbed from the URL), **Drawing Board**, **Docs**.

## Consequences

- Installing from ANY page (the browser's own install icon included) yields an
  app that launches into the Studio. The docs site itself never pitches
  install; the browser chrome remains available there, which is fine —
  same app either way.
- `/studio/?new=1` is a supported entry point (the shortcut) — network-first
  and never cached with its query (the SW's query-string rule), and the boot
  handler scrubs it so reloads don't mint decks.
- E2E pins the identity (`pwa.spec.ts`: name/start_url/scope + every shortcut
  URL resolves); unit tests pin the install-state ladder and the sheet UI.
