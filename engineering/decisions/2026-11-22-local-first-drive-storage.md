---
status: proposed
summary: Design for local-first storage with Google Drive sync, the storage desk's pass 1. The Studio's data moves into one local "vault" shaped like a folder (OPFS plus an IndexedDB index in the browser, the real file system in the desktop app), and a sync engine mirrors that folder to a Lattice/ folder in the user's Drive. Decks stay Markdown so Drive shows readable files; photos and other assets are immutable files; chats sync as Yjs documents once #3147 lands. Auth amends the 2026-06-25 Route B in one place: Google requires the client secret at its token endpoint for a web client, and a browser-only token cannot renew without a click, so a stateless token broker (no database) holds the secret and the refresh token. Scope is drive.file. The slices stack local-first work ahead of anything that needs Google, so the owner's infrastructure answers block nothing early.
---

# Local-first storage, synced to Google Drive

**Date:** 2026-11-22 · **Status:** proposed; waiting on the owner's answers (§11) · **Written by:** the storage desk
(`session_01DPMMjJHAhGgZeLFafZ5HW2`) · **Amends:** `2026-06-25-social-auth-byo-storage.md` (§0, §5, §6), if the owner
picks the broker

## The owner's words (2026-11-22)

> "I finally got google drive client id and secret. This means we need to support long term persistence in durable
> storage beyond the browser and we can act or previous proposal and decision. what this means of course is we need to
> design how storage of library assets and decks will work. My thinking is we are local first with syncing to google
> drive using a folder called Lattice under a users drive. My hope is our library becomes the front door for storage for
> all assets. we still need to be local first and of course for the desktop app local isn't the browser but the file
> system. We need authentication us and we need to perhaps redesign the library. we also have things like ydoc storage
> format and being more efficient when it comes to storage of files and not store everything in index db (i think this
> was discussed before). I want the experience to be seamless. I set up the callback url to be
> https//lattice.style/auth/callback and the official url to be https//lattice.style. Let's audit and then think about
> how this will all work."

## 1. The answer

1. **Local first, through one interface.** Every kind of user data goes through one storage interface, the **vault**.
   It is shaped like a folder: paths, file bytes, and a small record of metadata per path. The browser backs it with
   OPFS (the Origin Private File System, a private folder each site gets) for bytes and IndexedDB for the index. The
   desktop app backs it with a real `Lattice/` folder on disk. Studio code calls the vault and never asks which host it
   is on (HARD RULE #1's spirit, and the platform-seam rule from #2354).
2. **Sync is a folder mirror.** Because the vault is a folder on every host, sync is one engine: mirror the local tree
   to `Lattice/` in the user's Drive, and back. Nothing in the editor waits on the network. Sync pauses when offline
   and catches up later.
3. **Decks stay Markdown.** In Drive a deck is a `.md` file that anyone can open, and the CLI renders it as-is. A
   conflict is settled by a three-way text merge against the last synced copy. Only overlapping edits make a
   "conflicted copy". Assets never conflict, because a file never changes after it is written. Chats sync as Yjs
   documents (#3147), which merge by design.
4. **Auth: a stateless token broker.** Google's token endpoint wants the client secret for a "Web application"
   client, PKCE or not. A browser-only token (Google Identity Services) expires after about an hour, and Google says a
   new one needs a user gesture. Neither gives "seamless" background sync. A broker of about 100 lines (a Cloudflare
   Worker) holds the secret, keeps the refresh token encrypted in an httpOnly cookie, and hands the page short-lived
   access tokens. It keeps no database and holds no user data. This amends Route B, which is why it is the first
   question in §11.
5. **Scope: `drive.file`.** Lattice sees only the files it created or the user opened with it. Google classes this
   scope as non-sensitive, so it needs brand verification only, not the restricted-scope security audit.
6. **The Library becomes the front door.** It gains Decks, Fonts and Audio sections, a sync badge on every item, an
   account chip with sync status, and a conflict sheet.

## 2. The audit: what exists (read 2026-11-22, main at `7660f9b`)

`S/` is `docs/src/components/studio/`.

### 2.1 Where each kind of data lives today

| Data | Store | Owner |
|---|---|---|
| Deck list | localStorage `lattice-studio-deck-index` | `S/studio-store.ts:21` |
| Deck text | localStorage `lattice-studio-src-<id>`, one JSON string per deck | `S/studio-store.ts:25` |
| Versions | IndexedDB `lattice-studio-versions/checkpoints`, a full copy of the deck per version, 25 per deck | `S/checkpoint-store.ts:50` |
| Undo history (Filo) | IndexedDB `lattice-filo` | `docs/src/lib/filo/store.ts:278` |
| Chats | IndexedDB `lattice-studio-chats/chats`, one record per deck | `S/chat-store.ts:55` |
| Photos, videos, themes, components, finishes, motion scenes, reference PDFs, plugins | IndexedDB `lattice-workbench/assets`, **each record holds its Blob** | `S/library/asset-db.js:23`, `S/media-store.ts`, `S/library/asset-store.js` |
| Fonts | No user font files. Only a per-deck embedding choice in localStorage | `S/FontsControl.tsx:35` |
| Narration audio | IndexedDB `lattice-narration`, an LRU cache | `docs/src/playground/narration-store.js:24` |
| Settings and preferences | localStorage, about 30 keys | `S/studio-store.ts:1320-1388` |
| AI keys | localStorage, AES-GCM sealed; the wrapping key is non-extractable in IndexedDB `lattice-secrets` | `docs/src/lib/openrouter-key.js:28` |
| Live session (Tavola) | sessionStorage: one `Y.Text('source')`, base64 of the state | `S/live/live-controller.ts:991`, `:1436` |

**OPFS is not used anywhere.** Cache Storage serves only the service worker and model caches.

### 2.2 No storage interface

The Studio calls the browser directly: about 257 localStorage calls in 78 files, and 32 call sites of `openDB()` across
12 files that open a database. The nearest things to an interface are `S/library/asset-db.js` (one connection that
about 18 modules share), Filo's `Backend` interface with IndexedDB and in-memory implementations
(`docs/src/lib/filo/store.ts:283`), and `PosterStore` (`docs/src/components/map-rail/poster-store.ts:20`). The desktop
follow-up `2354-p1-desktop-decks-as-files` already names the fix: "put a storage interface behind" `studio-store.ts`'s
free functions.

### 2.3 Prior decisions, and whether each still holds

- **`2026-06-25-social-auth-byo-storage.md` (Route B).** It still holds on: no accounts, no database, the user's own
  cloud, `drive.file`, Google first. It is **wrong on two facts**, and both matter here:
  1. It says the docs site is "static on free GitHub Pages" and that Google runs "Authorization Code + PKCE with no
     client secret". Google's token endpoint wants `client_secret` for a Web application client even with PKCE.
     Community testing shows this; Google has no published statement that lifts it.
  2. It says the user "re-consents (usually silently) on return". Google's token-model guide says a new token "must be
     obtained by calling `requestAccessToken()` from a user-driven event", and that automatic refresh was removed.
  It also wires Drive into the retired drawing-board store. Route B's goal survives. Its mechanism does not, for
  background sync.
- **`2026-07-02-workspace-backup.md`.** The zip (`lattice-workspace/1`: `workspace.json`, `decks/*.md`, `library.zip`,
  `refdocs.json`, `media/`) stays the user's offline escape hatch. It is also the safety net for the migration
  (§8). Its rule that **restore merges and never overwrites** becomes the sync engine's rule too.
- **`2026-11-11-studio-storage-pointer-records.md`.** Measured at 4x CPU throttle in Chromium: 40 decks plus 25
  versions each cost about 1 s to the first slide and 80 MB of heap until the fixes (3,442 → 2,564 ms; 177 → 97 MB).
  60 photos cost nothing at boot, because a Blob read from IndexedDB is a handle. It records a live defect: a deck save
  that hits the localStorage quota fails silently. It deferred moving deck text out of localStorage "until evidence".
  Sync brings that evidence: every synced deck needs sync metadata, and localStorage's ~5.2 M characters (half on
  WebKit once any character is outside Latin-1) is the wrong home.
- **`2026-10-12-library-media-assets.md`.** "Bytes stay bytes": Blobs, never base64; STORE photos and videos in zips,
  DEFLATE text. This design keeps that rule. A file in OPFS or Drive is the original bytes.
- **`2026-11-13-image-library.md`, `2026-10-08-library-audit.md`.** The Library's catalog model and the image decoders.
  This design changes where bytes live, not how they are decoded.
- **`2026-11-12-chat-threads-crdt.md` and `followups.d/3147-p1-yjs-chat-store.md`.** The owner chose Yjs for chats:
  one Y.Doc per deck, loaded lazily. That makes chats the one store whose sync merge is free: two Yjs states merge by
  applying one to the other.
- **`2026-06-14-yjs-collaboration-exploration.md`, `2026-10-21-follow-over-tavola.md`.** Tavola is the live layer
  (peers over WebRTC, found through Nostr relays). It is session state, not storage. Sync does not use it, and it does
  not need sync.
- **`2026-06-16-lattice-export-format.md` and #3183.** `.lattice` is a zip of `deck.md`, `manifest.json` and optional
  `packages/` and `media/` (`lib/core/reopenable.js:43`, read by `lib/packages/lattice-read.mjs:61`). It is the right
  format to **share** a deck as one file. It is the wrong format to **sync**, because one edited character rewrites the
  whole zip and Drive cannot show what is inside it.
- **`2026-05-10-tauri-exploration.md` and PR #2354.** #2354 (open, 5 weeks quiet, no merge base with `main`) built a
  Tauri app with a platform seam (`docs/src/lib/platform.js`, `host.js`, `sign-in.js`) and the rule "add a capability
  here, never at a call site". Its follow-ups `2354-p1-desktop-decks-as-files` and `2354-p2-desktop-keychain-and-oauth`
  are the desktop half of this design. The vault is the storage capability that seam is missing.
- **`followups.d/3148-p2-studio-media-storage-opfs.md`.** It asks whether blobs should move from IndexedDB to OPFS.
  This design answers yes, for a reason the follow-up did not have: OPFS gives the same folder shape as the desktop
  disk and the Drive folder, so one sync engine serves all three.
- **`followups.d/3356-p1-library-decks-section.md`.** A Decks section in the Library, after #3356 merges. Slice 4
  takes it over.
- **#3427 is not about data.** The brief listed "the two-person relay (#3427)" under conflicts. #3427
  (`2026-11-22-two-person-relay.md`) is about two **people relaying a branch** of agent work (a baton, signed commits).
  It does not touch deck storage. The data case that does matter is the same person on two devices, offline, and §6.3
  covers it.

### 2.4 Deployment and the site's security headers

- **Production `lattice.style` is GitHub Pages** (`docs/public/CNAME`, `.github/workflows/docs.yml`). Cloudflare Pages
  serves only the PR previews (`.github/workflows/docs-preview.yml`). So a Cloudflare **Pages Function** would run on
  previews, not on production. A broker needs its own host: a Cloudflare Worker on a subdomain such as
  `auth.lattice.style`.
- There is no `functions/` directory and no `wrangler.toml`.
- **There is no site-wide CSP** (Content Security Policy). Only the preview frames
  (`docs/src/playground/preview-csp.js`, which closes `connect-src`), the plugin sandbox and the exported player carry
  one. GitHub Pages cannot send response headers, so a site CSP would have to be a `<meta>` tag.

### 2.5 Copy that stops being true once sync exists

`docs/src/` paths. These strings promise that nothing leaves the device:

- `components/landing/sections.tsx:381-382` ("sends nothing anywhere"), `:545` ("Your decks live in this browser: no
  account").
- `pages/features.astro:137` ("nothing sent anywhere"), `:128`.
- `content/docs/introduction.md:45`, `content/docs/overview.mdx:34`.
- `pages/comparison.astro:217`, `:721`.
- `components/studio/PluginsSettings.tsx:156`.

About 54 user-facing strings say "in this browser" or "on this device". §9 sets the rule for rewriting them.

## 3. The axes

| Axis | The question |
|---|---|
| A. Auth | How does a static site get Drive tokens that renew without a click? |
| B. Scope | How much of the user's Drive can Lattice see? |
| C. Local store | Where do bytes live on each host, behind what interface? |
| D. Deck format in Drive | What does a deck look like as a Drive file? |
| E. Sync model | How does Lattice notice changes, settle conflicts, queue offline work and recover? |
| F. Library | How does one surface show every asset with its sync state, at three widths? |
| G. Migration | How does today's data move without loss? |
| H. Trust | What do the copy and the threat model owe? |

## 4. Auth (axis A)

### 4.1 The three candidates

| | (a) Google Identity Services, token model | (b) Authorization Code + PKCE from the browser | (c) Stateless token broker |
|---|---|---|---|
| Secret needed | No | **Yes**: Google wants `client_secret` for a Web application client even with PKCE, so the browser would have to ship it | Yes, held by the broker only |
| Refresh | None. The access token lasts about 1 h; Google says a new one needs `requestAccessToken()` "from a user-driven event" | Would give a refresh token, but only by putting the secret in the bundle | Refresh token kept by the broker; the page asks for a fresh access token at any time, no click |
| Uses the owner's `/auth/callback` | No (popup; uses the JavaScript origin) | Yes | Yes: the callback page hands the code to the broker |
| Seamless? | Mostly on desktop browsers: a popup flashes on the first click after expiry. On iOS standalone (home-screen) apps, popups are unreliable | n/a | Yes: sync renews in the background, including after a reload |
| Infrastructure | None | None | One Worker (free tier: 100,000 requests a day), two secrets, a DNS name |
| Breaks HARD RULE #24's logic? | No | **Yes**: a secret in `docs/**` | No: the secret lives in the Worker's secret store |
| Amends Route B? | No | n/a | Yes: "no server" becomes "no server that holds user data" |

**(b) is out for the web.** For the **desktop app** it is the standard answer: a Google "Desktop app" client, a
loopback redirect, PKCE, and the refresh token in the OS keychain (`2354-p2`). Google documents that a desktop client
"cannot keep secrets confidential", so the desktop client's secret ships in the app by design. That needs a second
OAuth client, of the Desktop type, which the owner creates when the desktop slice starts.

### 4.2 Recommendation: (c), the broker, with (a) as the fallback

The owner asked for "seamless", and local-first sync runs in the background: after a reload, while a tab sits open
overnight, on a phone. (a) cannot renew without a click. (c) can, and it keeps every property Route B protected: no
accounts, no database, no user data on any server, and Lattice pays nothing.

**What the broker does** (`auth.lattice.style`, a Cloudflare Worker, about 100 lines):

1. `/auth/callback` on `lattice.style` is a static page. Google redirects there with `?code=…&state=…`. The page checks
   `state` against the one it stored, then POSTs the code and its PKCE verifier to `auth.lattice.style/exchange`. PKCE
   still matters here: it binds the code to the tab that started the flow.
2. The broker exchanges the code with the secret and gets an access token and a refresh token. It encrypts the refresh
   token (AES-GCM, with a key held as a Worker secret) into a cookie: `HttpOnly; Secure; SameSite=Strict;
   Domain=auth.lattice.style; Path=/`. It returns only the access token and its expiry.
3. `POST /token` decrypts the cookie, refreshes with Google and returns a new access token. It checks that `Origin` is
   exactly `https://lattice.style`, CORS allows only that origin with credentials, and it rate-limits per IP.
4. `POST /signout` revokes the refresh token at Google (`oauth2.googleapis.com/revoke`) and clears the cookie.

`auth.lattice.style` and `lattice.style` are the same site, so `SameSite=Strict` cookies still travel. Safari's
third-party cookie blocking does not apply. The page keeps the access token **in memory only**, never in storage.

**If the owner declines the broker**, (a) ships instead behind the same `getAccessToken()` seam. Sync then pauses
after an hour, and the Library shows "Resume sync". The next click renews the token, and nothing local is lost.

### 4.3 The secret, and what the owner sets up

- **The client secret lives only in the Worker's secret store** (`GOOGLE_CLIENT_SECRET`), set by the owner in the
  Cloudflare dashboard or with `wrangler secret put`. It does not go in the repo, GitHub secrets, chat or any doc. The
  owner also sets `BROKER_COOKIE_KEY`, 32 random bytes.
- **Deploying the Worker** is either the owner running `wrangler deploy` by hand, or a new CI job. A CI job is the
  owner's call (CLAUDE.md, second filter).
- **The Google console, set by the owner:**
  - Confirm the redirect URI reads `https://lattice.style/auth/callback`, with the colon. The owner's note typed
    `https//`.
  - Add `http://localhost:4321/auth/callback` for development. Cloudflare preview URLs change per PR, and Google does
    not accept wildcards, so **previews cannot sign in**.
  - Verify `lattice.style` in Search Console. Give the consent screen a home page and a privacy policy on
    `lattice.style` (slice 5 writes the policy page), then **publish the app to "In production"**. A refresh token
    issued while the app is in "Testing" expires after 7 days.
- **DNS:** `auth.lattice.style` must point at the Worker. A Worker custom domain needs the zone on Cloudflare; if
  `lattice.style`'s DNS lives elsewhere, the fallback is the Worker's `*.workers.dev` name. That name is cross-site, so
  the cookie becomes a third-party cookie that Safari blocks, and the design then falls back to (a).

## 5. Scope (axis B)

| Scope | Sees | Google review | Fit |
|---|---|---|---|
| **`drive.file`** (recommended) | Files Lattice created, plus files the user opens with Lattice (the Google Picker) | Non-sensitive: brand verification only | Right. An app-created `Lattice/` folder and everything Lattice writes into it are visible |
| `drive.appdata` | A hidden per-app folder the user cannot browse | Non-sensitive | Wrong. The owner wants a visible `Lattice/` folder |
| `drive` | The whole Drive | **Restricted**: a yearly third-party security assessment | Too much access and too much cost for what it buys |

**The one gap with `drive.file`:** a file the user drops into `Lattice/` through drive.google.com is not visible to
Lattice, because Lattice did not create it and the user did not open it with Lattice. The remedy is a Library action,
"Add from Drive…", which opens the Google Picker. Picking a file or folder grants access, and the next sync adopts it.
The Library says so in one line. A user who uses Drive for desktop to put files on disk works with the desktop app's
local folder, so the desktop app does not have this gap.

## 6. The model (axes C, D, E)

### 6.1 One folder layout, on every host

```
Lattice/
  Decks/
    Quarterly review.md                 a deck: plain Markdown, front matter as authored
    Quarterly review.assets/            files this deck alone uses (scope = the deck)
  Library/
    Images/  Videos/  Audio/  Fonts/  Documents/
    Themes/  Components/  Finishes/  Motion/
  .lattice/                             Lattice's own records; safe to ignore
    index.json                          stable ids ↔ paths, titles, kinds, content hashes
    chats/<deck-id>.yjs                 after #3147
    versions/<deck-id>/<ts>.md          named versions only
    settings.json                       settings that roam (not per-device ones)
```

- **Stable ids, human names.** A file's name is what a person reads, and a rename moves the file. Identity lives in
  `index.json` and in Drive's `appProperties` (`latticeId`, `sha256`), so a rename on one device is not a delete plus
  an add on the other.
- **Plugins stay local in v1.** Plugin code runs on the device, and today it never leaves the browser
  (`S/plugin-library.ts`). Syncing code from Drive to another device is a trust decision of its own, so v1 does not
  make it.
- **Undo history (Filo) and autosave versions stay local.** Drive keeps its own revision history of every file. Named
  versions sync.
- **Desktop:** the same tree lives at `~/Documents/Lattice/` (a user can choose another folder). If the user already
  runs Google Drive for desktop, they can point it at that folder, and the app's own sync can stay off.

### 6.2 The vault: one interface, three backings

```ts
interface Vault {
  list(dir: string): Promise<Entry[]>;            // Entry = { path, kind, bytes, sha256, mtime, id }
  read(path: string): Promise<Blob>;              // a file-backed handle where the host allows
  write(path: string, data: Blob | string, meta?: Meta): Promise<Entry>;
  move(from: string, to: string): Promise<Entry>;
  remove(path: string): Promise<void>;            // a tombstone, so sync can carry the delete
  watch(fn: (changes: Change[]) => void): () => void;
}
```

| Host | Bytes | Index and sync state |
|---|---|---|
| Browser | OPFS files. Writes go through a worker that uses `createSyncAccessHandle`, which is the path WebKit supports | IndexedDB `lattice-vault`: one small record per path, plus the sync journal |
| Desktop | The real `Lattice/` folder, through Tauri commands, added to `platform.js` as a capability | A JSON index in the app's data folder |
| Tests | Memory | Memory |

- **Settings that must be read before the first paint stay in localStorage** (the deck-index cache, theme, mode). The
  pre-paint shell has no time to open a database. localStorage becomes a cache of the vault, never its source.
- **Blobs leave IndexedDB.** That closes `3148-p2`, whose open question was whether to move them. The reason to move
  is the folder shape, not the boot cost, because the boot cost measured zero.
- **Quota and eviction.** OPFS shares the origin's quota and its eviction rules with IndexedDB. The Studio already
  calls `navigator.storage.persist()`. With sync on, eviction becomes a re-download. Without sync, the backup nudge
  stays.

### 6.3 Sync

**Change detection.** Polling Drive's `changes.list` from a saved `startPageToken`: on focus, after a local write
(debounced), and every 60 s while the tab is visible. `changes.watch` (push) needs a public webhook to receive
notifications, which a static site does not have, so it is out. Under `drive.file`, the changes feed lists only files
Lattice can see, which is what we want. A local change marks its path dirty in the journal.

**The journal and the offline queue.** Every local write appends `{path, id, op, baseRevision, sha256}` to an
IndexedDB journal. A worker drains the journal when online and a token is available. A failed call retries with
exponential backoff and jitter, honors `Retry-After` on 429 and `403 rateLimitExceeded`, and stops on a full Drive
(`storageQuotaExceeded`), which the Library shows as a sync state, not a toast.

**Conflicts:**

| Kind | Rule |
|---|---|
| Assets (images, fonts, audio, PDFs) | Never conflict. A file never changes after it is written; an edit writes a new file and repoints the id. Same hash means the same file, so the upload is skipped (deduplication for free) |
| Decks | **Three-way merge** against the base, the copy both sides last synced, which the journal keeps. Edits in different regions merge cleanly. Overlapping edits keep this device's version as the deck, and save the other as `Title (conflict, <device>, <date>).md` beside it. The Library flags both. Nothing is ever overwritten, the backup's rule |
| Chats | Yjs: apply the remote update to the local doc, write the result. Merges by design |
| Settings | Last writer wins per key, with a timestamp per key |
| Deletes | A tombstone in `index.json`. Drive moves the file to the trash, so it stays recoverable for 30 days |

**Writing to Drive safely.** Drive's v3 API has no compare-and-swap on file content. Before an upload, the engine reads
the file's `headRevisionId`. If it is not the base, the engine merges first. A race between that check and the upload
loses nothing, because Drive keeps the overwritten revision: the next poll sees a head the engine did not write, reads
the revision before it, and merges.

**Two devices offline.** Each works locally. Each journals its writes against the same base. The first to reconnect
uploads. The second sees a newer head, merges three ways, and uploads the merge. The worst case is one conflicted copy
per deck that was edited in the same place on both devices.

### 6.4 Deck format in Drive (axis D)

| | Markdown `.md` (recommended) | Yjs `.yjs` | `.lattice` zip | Markdown plus a Yjs sidecar |
|---|---|---|---|---|
| Readable in Drive | Yes | No | No (a zip) | Yes |
| The CLI renders it as-is | Yes | No | Yes | Yes |
| Merge | Three-way text merge; overlap makes a conflicted copy | Automatic, never conflicts | Whole-file: always a conflicted copy | Automatic |
| Size per edit | The deck (tens of KB) | Grows with history; needs compaction | The whole zip, assets included | Both |
| Exports | Unchanged | Needs a conversion step | Unchanged | Unchanged |
| Two sources of truth | No | No | No | **Yes**: an edit made outside Lattice must be diffed back into the Yjs doc |

Markdown wins on what the owner named: readable, efficient, and kept by every export path. A sidecar is the upgrade
path if live co-editing of decks is ever wanted, and it can be added later without moving any file. `.lattice` stays
the format for **sharing one deck as one file**.

## 7. The Library as the front door (axis F)

**Sections:** All · **Decks** (new; takes over `3356-p1`) · Design (Themes, Components, Finishes, Motion) · Media
(Images, Videos, **Audio**) · **Fonts** (new; files a deck can embed) · Files · Plugins (local only).

**Sync state everywhere, quietly:**

- **The header** carries an account chip. Before connecting: "On this device" plus Connect. Once connected: the
  avatar, then "Synced", "Syncing 3", "Offline, 2 waiting" or "Needs attention".
- **Each item** carries a small badge drawn with the `--mark-*` masks (HARD RULE #29, no typed glyphs): on this device
  only, synced, uploading, waiting, conflict. A badge appears only when the state is not "synced", so a calm Library
  looks calm.
- **Conflict sheet:** both versions side by side as rendered slides, with the merged text where a merge was possible,
  and three choices: keep mine, keep theirs, keep both.
- **"Add from Drive…"**, the Picker (§5).
- **Backup and restore move here** from the Workspace sheet, beside Import. They stay the escape hatch.

**Widths.** At 1440 px: a section rail on the left, a grid, and a details pane on the right. At 820 px: the rail
becomes a row of pills, and details open in a sheet. At 390 px: pills scroll sideways, the grid has two columns,
details open in a bottom sheet, and the account chip shrinks to its avatar and a status dot. This extends the shadcn
primitives and the existing `Library.tsx` (HARD RULE #15). It is not a new surface.

**On `design-competition`.** The space here is narrow: the sections, the badge and the sheet follow from the model,
and the Library already exists. Seventeen agents would compete over layout details. Recommendation: do not run it.
Use the normal visual review at three widths, and run the polish desk on the result.

## 8. Migration (axis G)

1. **Copy, verify, then switch.** On the first boot of the vault build, the Studio copies every deck, version pointer
   and asset from today's stores into the vault. It checks each copy by its hash, then flips one flag. **The old stores
   are left untouched**, and they stay readable as a fallback.
2. **A safety backup first.** Before the copy, the Studio writes a workspace backup zip into OPFS: the same zip
   Download backup makes. If anything goes wrong, Restore puts it back.
3. **Cleanup is a separate, later slice**, after a stated soak period. It deletes the old stores only once the vault
   has served real use.
4. **Connecting Drive the first time** uploads the vault. If `Lattice/` already exists (another device connected
   first), the first sync merges with the backup's rules: a new deck is added, an identical one is skipped, a diverged
   one is kept beside as "(from <device>)".

The pre-paint deck list (localStorage) is rebuilt from the vault after the switch, so the first paint does not slow
down.

## 9. Trust: copy and threat model (axis H)

### 9.1 Copy

The promise changes from "nothing leaves this device" to **"your files live on your devices and, if you connect it,
in your own Google Drive. Lattice has no server that stores them."** Every string in §2.5 is rewritten in the slice
that ships Drive, not after it (HARD RULE #18: shipping sync while the copy says "sends nothing anywhere" would be a
false claim we created). The token broker is named honestly: "a small Lattice service renews your Google sign-in; it
never sees your files." Slice 5 adds a privacy-policy page, which Google's consent screen requires anyway.

### 9.2 Threat model (detail stays with the owner and the security desk)

- **The token never touches storage.** The access token lives in memory; the refresh token lives in an httpOnly cookie
  on the broker's host, which no script can read.
- **Script injection (XSS) still matters.** A script running on `lattice.style` could ask the broker for an access
  token while the cookie exists, and use it for up to an hour on Lattice's own files. The defenses are the existing
  sanitizers (HARD RULE #22); the preview frame's CSP, which already closes `connect-src`; the broker's exact-origin
  check; and a site CSP added as a `<meta>` tag with `connect-src` limited to the Google APIs and the broker. The
  preview frame is same-origin (#3421), so the frame's CSP is the line that matters, and slice 5's trio tests it.
- **Revocation.** Revoking access from the Google account page makes the next `/token` call fail with `invalid_grant`.
  The Library shows "Reconnect", and local work continues.
- **Sign-out** calls `/signout` (Google revokes the token, the cookie is cleared), drops the in-memory token and the
  Drive page token, and leaves local files in place. Local data has its own action, "Remove this device's data".
- **Backups never carry tokens**, as they already never carry the OpenRouter key.
- Slice 5 (auth and the broker) gets the adversarial trio (HARD RULE #25). Any finding goes to the owner, not to a
  public write-up.

## 10. Slices, in an order that stacks

Each slice is its own branch from `main` and its own merge gate. The local-first slices (1–4) need nothing from
Google, so the owner's infrastructure answers block nothing until slice 5.

| # | Slice | Proof |
|---|---|---|
| 1 | **The vault.** The interface plus the OPFS/IndexedDB and memory backings; no caller moves yet | Unit tests over all backings; e2e write → reload → read on `chromium`, `webkit-phone` and `gecko`, including WebKit's worker write path; the HARD RULE #34 arms |
| 2 | **Assets into the vault.** Photos, videos, PDFs, themes and other kinds; narration audio; copy-verify-switch; closes `3148-p2` | The 2026-11-11 bench extended to 50 photos: boot, photo open, backup export, before and after. iOS eviction on a real device, or UNVERIFIED and handed to the devices desk |
| 3 | **Decks into the vault.** Deck text and index leave localStorage; the pre-paint cache stays; fixes the silent quota failure | `storage-bench.cjs` rows 1–3: first slide, blocked time and heap within the repeated runs' spread; an e2e proving a full disk shows a notice |
| 4 | **The Library, local.** Decks, Fonts and Audio sections; backup moves in; the sync-state slot reads "On this device"; takes over `3356-p1` after #3356 merges | e2e on three projects; `tools/screenshot.js` at 1440, 820 and 390 |
| 5 | **Auth.** The broker Worker, the `/auth/callback` page, the `getAccessToken()` seam, Connect and Disconnect, the privacy page and the copy rewrite (§9.1) | The adversarial trio; e2e against a stubbed Google; a real sign-in on a test Google account, otherwise UNVERIFIED (HARD RULE #23); proof that a preview-frame script cannot reach `/token` |
| 6 | **Sync v1.** Push and pull for Decks and Library; changes polling; journal; retries; three-way merge; conflicted copies | A fake Drive server covering the API calls the engine uses, driven by e2e on three projects, with two browser contexts as two devices, offline and back; a property test of the merge; real Drive on a test account, otherwise UNVERIFIED |
| 7 | **Conflict sheet and per-item badges** | e2e of every state; screenshots at three widths |
| 8 | **Chats, named versions and roaming settings sync**, after #3147 | Two-context e2e; Yjs merge test |
| 9 | **Desktop:** the file-system vault plus loopback PKCE and the keychain. Waits on #2354 landing (5 weeks quiet, no merge base) | The desktop app under Xvfb: a deck edited on disk shows in the app, and the reverse |
| 10 | **Cleanup** of the old stores, after the soak | A boot with the old stores gone |

## 11. Open questions for the owner

1. **Auth route:** the broker (recommended), browser-only GIS, or broker later.
2. **Scope:** `drive.file` plus the Picker (recommended). This is folded into question 1 of the round, because both are
   console settings.
3. **Deck format in Drive:** Markdown with three-way merge (recommended), Yjs, or Markdown plus a Yjs sidecar.
4. **Migration:** copy-verify-switch with a safety backup and the old stores kept (recommended), or a backup-and-restore
   migration.
5. **Library direction:** extend `Library.tsx` (recommended), with or without `design-competition`.
6. **Outside the round, owner-only setup** (§4.3): the redirect URI's colon, the dev origin, domain verification, the
   privacy page, "In production", the Worker secrets, DNS for `auth.lattice.style`, and how the Worker deploys.

## 12. What was not checked

- No call reached Google: the session holds no client ID, and the secret must never reach a session. The Google facts
  above come from Google's guides (the token model, the installed-app flow, Drive scopes) and from community reports
  (the web client's secret requirement, the 7-day Testing expiry). Slice 5 checks each against a real test account.
- Whether WebKit (iOS Safari) supports `FileSystemWritableFileStream` today was not tested; the design writes through
  `createSyncAccessHandle` in a worker, which WebKit has supported since 16.4. Slice 1 proves it on `webkit-phone`.
- Drive API quotas were not measured. Polling at 60 s per visible tab is far below Google's published per-user
  defaults, which slice 6 confirms.
- Where `lattice.style`'s DNS is hosted was not checked (§4.3).
