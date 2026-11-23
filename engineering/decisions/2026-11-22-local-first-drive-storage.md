---
status: in-progress
summary: Local-first storage with Google Drive sync, decided by the owner on 2026-11-22. The Studio's data moves into one local "vault" shaped like a folder (OPFS plus an IndexedDB index in the browser, the real file system in the desktop app), and a sync engine mirrors that folder to a Lattice/ folder in the user's Drive. Development and testing sign in with Google Identity Services' browser token model; a stateless Worker broker is required before sync is offered to the public. Scope is drive.file. A deck is a readable Markdown file plus per-device Yjs update files, so two devices never conflict; Filo stays the one undo history and owns versions. There is no migration machinery: the Studio moves local data into the vault once, behind one automatic backup, and connecting Drive runs a first sync. The Library is extended with the layout of design-competition Track 4, which the owner picked and the adversarial trio hardened.
---

# Local-first storage, synced to Google Drive

**Date:** 2026-11-22 · **Status:** decided 2026-11-22 by the owner (§11) · **Written by:** the storage desk
(`session_01DPMMjJHAhGgZeLFafZ5HW2`)

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
3. **Decks are Markdown plus Yjs.** In Drive a deck is a `.md` file that anyone can open, and the CLI renders it
   as-is. Beside it, each device writes its own small Yjs update files, and every device merges all of them, so two
   devices never conflict (§6.4). Assets never conflict, because a file never changes after it is written. Chats sync
   as Yjs documents (#3147), which merge by design.
4. **Auth: Google Identity Services now, the broker before launch.** Development and testing use Google Identity
   Services' token model, which needs no server and no client secret. The access token lasts about an hour and lives
   in memory only, inside an isolated context (§9.2). Only a storage click renews it: the account chip, Resume, Sync
   now, Add from Drive, Review, or opening the Library. An editor click never renews. Local saves never wait on this.
   A stateless broker on a Cloudflare Worker, behind the same `getAccessToken()` seam, is **required before sync is
   offered to the public** (§4.2).
5. **Scope: `drive.file`.** Lattice sees only the files it created or the user opened with it. Google classes this
   scope as non-sensitive, so it needs brand verification only, not the restricted-scope security audit.
6. **The Library becomes the front door.** It gains Decks, Fonts and Audio sections, a sync badge on every item, an
   account chip with sync status, and a per-slide review for outside edits.

## 2. The audit: what exists (read 2026-11-22, main at `7660f9b`)

`S/` is `docs/src/components/studio/`.

### 2.1 Where each kind of data lives today

| Data | Store | Owner |
|---|---|---|
| Deck list | localStorage `lattice-studio-deck-index` | `S/studio-store.ts:21` |
| Deck text | localStorage `lattice-studio-src-<id>`, one JSON string per deck | `S/studio-store.ts:25` |
| Versions | IndexedDB `lattice-studio-versions/checkpoints`, a full copy of the deck per version, 25 per deck | `S/checkpoint-store.ts:50` |
| Undo history (Filo) | IndexedDB `lattice-filo` | `S/studio-filo-persist.ts:51` |
| Chats | IndexedDB `lattice-studio-chats/chats`, one record per deck | `S/chat-store.ts:55` |
| Photos, videos, themes, components, finishes, motion scenes, reference PDFs, plugins | IndexedDB `lattice-workbench/assets`, **each record holds its Blob** | `S/library/asset-db.js:23`, `S/media-store.ts`, `S/library/asset-store.js` |
| Fonts | No user font files. Only a per-deck embedding choice in localStorage | `S/FontsControl.tsx:35` |
| Narration audio | IndexedDB `lattice-narration`, an LRU cache | `docs/src/playground/narration-store.js:24` |
| Settings and preferences | localStorage, about 30 keys | `S/studio-store.ts:1320-1388` |
| AI keys | localStorage, AES-GCM sealed; the wrapping key is non-extractable in IndexedDB `lattice-secrets` | `docs/src/lib/openrouter-key.js:40` |
| Live session (Tavola) | sessionStorage: one `Y.Text('source')`, base64 of the state | `S/live/live-controller.ts:991`, `:1436` |

**OPFS is not used anywhere.** Cache Storage serves only the service worker and model caches.

### 2.2 No storage interface

The Studio calls the browser directly: about 257 localStorage calls in 78 files, and 32 call sites of `openDB()` across
12 files that open a database. The nearest things to an interface are `S/library/asset-db.js` (one connection that
about 18 modules share), Filo's `Backend` interface with IndexedDB and in-memory implementations
(`docs/src/lib/filo/store.ts:283`), and `PosterStore` (`docs/src/components/map-rail/poster-store.ts:21`). The desktop
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
  `packages/` and `media/` (`lib/core/reopenable.js:49`, read by `lib/packages/lattice-read.mjs:61`). It is the right
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
  (`2026-11-22-two-person-relay.md`, on that PR, not yet on `main`) is about two **people relaying a branch** of agent work (a baton, signed commits).
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

### 4.2 Decision: (a) for development and testing; (c) required before public launch

**Development and testing run on (a).** The Studio asks Google Identity Services for an access token on the user's
Connect click and keeps it in memory. When the token expires, sync pauses. **Only a storage click renews it**: the
account chip, Resume, Sync now, Add from Drive, Review, or opening the Library. An editor click never renews, so a
Google popup never interrupts writing. When the user asks for a different Google account, the Studio asks before it
uploads anything (§6.3, Account). Local saves never wait on a token, so nothing local is lost.

**While sync is paused, the warning grows with time.**

- The calm status dot turns into the loud sync row once edits have waited a set number of hours, and sooner on iOS.
- A `beforeunload` guard warns when the tab closes with changes waiting and no valid token.
- On iOS, a backup nudge appears when `navigator.storage.persisted()` is false and changes are waiting.

**(c) is required before sync is offered to the public.** It renews in the background: after a reload, while a tab
sits open overnight, on a phone. It keeps every property Route B protected: no accounts, no database, no user data on
any server. It ships behind the same `getAccessToken()` seam, so no caller changes.

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

**DNS, for (c) only:** `auth.lattice.style` must point at the Worker. A Worker custom domain needs the zone on
Cloudflare; if `lattice.style`'s DNS lives elsewhere, the fallback is the Worker's `*.workers.dev` name. That name is
cross-site, so the cookie becomes a third-party cookie that Safari blocks, and (c) then gives no gain over (a).

### 4.3 The secret, and what the owner sets up

- **The client secret is not needed for v1.** (a) uses only the client ID. Keep the secret out of the repo, chat and
  every doc. If the broker ever ships, the secret goes into GitHub Secrets and a deploy job pushes it into the Worker's
  secret store, never into the site build. Adding that deploy job is the owner's call (CLAUDE.md, second filter).
- **The Google console, set by the owner for v1:**
  - Add `https://lattice.style` and `http://localhost:4321` as **Authorized JavaScript origins**. The popup flow
    checks these. Cloudflare preview URLs change per PR, and Google does not accept wildcards, so **previews cannot
    sign in**.
  - Confirm the redirect URI reads `https://lattice.style/auth/callback`, with the colon. The owner's note typed
    `https//`. The popup flow does not use the redirect; it stays for the later broker or an iOS redirect fallback.
- **Before public launch:** verify `lattice.style` in Search Console, give the consent screen a home page and a
  privacy policy on `lattice.style` (slice 5 writes the policy page), then **publish the app to "In production"**.
  Publishing "In production" is a gate before slice 9 (the broker) or slice 10 (desktop).

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
    index/<device-id>.json              stable ids ↔ paths, titles, kinds, content hashes; one file per device
    chats/<deck-id>.yjs                 after #3147
    decks/<deck-id>/                    base-<sha256>.yjs, updates/, and the state-vector sidecar (§6.4)
    settings.json                       settings that roam (not per-device ones)
```

- **Stable ids, human names.** A file's name is what a person reads, and a rename moves the file. Identity lives in
  the per-device index files and in Drive's `appProperties` (`latticeId`, `sha256`), so a rename on one device is not a delete plus
  an add on the other.
- **Plugins stay local in v1.** Plugin code runs on the device, and today it never leaves the browser
  (`S/plugin-library.ts`). Syncing code from Drive to another device is a trust decision of its own, so v1 does not
  make it.
- **Filo owns undo and versions.** Filo's undo history and autosave versions stay local. Named versions (Filo marks)
  sync. Drive also keeps its own revision history of every file.
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
- **Where OPFS is refused** (measured in spike #3443). Linux WebKit refuses OPFS in an ephemeral context:
  `getDirectory()` throws `UnknownError`. In a persistent context, all three write paths pass (main-thread
  `createWritable`, worker `createSyncAccessHandle`, worker `createWritable`), as they do in Chromium and Firefox in
  both contexts. Safari Private Browsing probably behaves like the ephemeral context; that is untested. The vault fails
  visibly with `VaultError('unavailable')` (slice 1, #3442). What it falls back to is slice 2's decision (D1 on
  #3442), and e2e tests run in persistent profiles.

### 6.3 Sync

**Change detection.** Polling Drive's `changes.list` from a saved `startPageToken`: on focus, after a local write
(debounced), and every 60 s while the tab is visible. `changes.watch` (push) needs a public webhook to receive
notifications, which a static site does not have, so it is out. Under `drive.file`, the changes feed lists only files
Lattice can see, which is what we want. A local change marks its path dirty in the journal.

**The journal and the offline queue.** Every local write appends `{path, id, op, baseRevision, sha256}` to an
IndexedDB journal. A worker drains the journal when online and a token is available. A failed call retries with
exponential backoff and jitter, honors `Retry-After` on 429 and `403 rateLimitExceeded`, and stops on a full Drive
(`storageQuotaExceeded`), which the Library shows as a sync state, not a toast.

**An honest "Synced".** The Library says "Synced" only when all of these hold: the journal is empty, the download
queue is empty, the token is valid, and the engine has polled since the tab last gained focus.

- **A startup scan** compares each local sha256 with the last-synced sha256. That catches a write that never reached
  the journal.
- **The `Lattice/` root** is chosen deterministically (the oldest folder the app created), and its id is stored.
- **"Lattice/ folder missing or in trash"** is a sync state of its own.
- **A deck edited offline after another device deleted it** comes back, or the Library asks.

**Account.** Renewal passes the expected account (`login_hint` / `hint`). Before any upload or download, the engine
compares the `permissionId` from `about.get` on every new token with the stored one. A mismatch pauses sync and shows
the ask-before-upload prompt.

**Quotas and cost.** Storage is the user's: every file counts against their own Drive plan, and a full Drive is the
`storageQuotaExceeded` state above. API calls are Lattice's: Google counts them against the Cloud project that owns
the client ID, summed over every user. Google's usage-limits page (read 2026-11-22) says the following. The page has
no last-updated date, and it is not self-consistent: its daily per-project row reads "1 TB" in one table and
400,000,000 quota units in the next, so both are listed here as it gives them.

| Limit | Value |
|---|---|
| Per minute, per project | 1,000,000 quota units |
| Per minute, per user | 325,000 quota units |
| Daily billing threshold, per project | 400,000,000 quota units |
| Daily egress, per project, "before charges apply" | 1 TB |
| One file / uploads per user per day | 5 TB / 750 GB (stated for Workspace users) |

A call costs 50 units to write (`files.create`, `files.update`), 100 to list (`changes.list`), 5 to read metadata
and 200 to download content. Use is free today; the page says exceeding quota "is planned to incur charges … later
in 2026", with at least 90 days' notice and no prices yet.

At this design's rates, one active tab spends 150 units a minute: a 100-unit poll and at most one 50-unit update
file. A user with a second tab or device, the extra poll after each debounced write, and the occasional download
spends up to about 400. From those two ends:

- **Per minute:** 1,000,000 / 400 to 1,000,000 / 150 is about **2,500 to 6,700 users active at the same moment.**
- **Per day:** an 8-hour working day costs 72,000 to 192,000 units a user, so 400,000,000 covers about **2,100 to
  5,500 users editing a full working day.** Editing around the clock, 24 hours, it covers about 700 to 1,900.
- **Egress:** 1 TB is about **10,000 downloads of a 100 MB video**, the limit large media could reach first.

These are estimates from the design's rates, not measurements. Slice 0 measures what each call costs on a test
project, and slice 6 counts the units an hour of editing spends.

**Required in slice 6, so usage stays low before Google ever refuses** (the owner's ruling, 2026-11-22):

- **Idle polling slows down.** The engine polls every 60 s only while the tab is visible and was used in the last
  5 minutes. After that it polls every 5 minutes, and a hidden tab does not poll. Focus and a local write still
  trigger an immediate poll.
- **Large media downloads on open.** On a second device, an image or video over 5 MB arrives as its metadata and a
  thumbnail. The engine downloads the bytes when someone opens or plays it, or when a deck being presented uses it.
- **Content-hash deduplication** stays: the same bytes never upload twice (the assets row below).
- **Backoff on 403 and 429** stays: truncated exponential backoff, seeded jitter, capped at 64 s, as in the journal
  paragraph above.
- **A measured budget.** Slice 6's proof counts the quota units an hour of editing spends, on the fake Drive server,
  and reports it in the PR.

The owner's side is two Cloud-console guardrails, tracked as follow-ups. The first keeps the project's billing account
unlinked, so going over quota should throttle sync rather than charge. That is unconfirmed until Google publishes its
billing terms, and the follow-up asks for the check (`followups.d/3432-p1-drive-project-billing-off.md`). The second
alerts on quota use before a limit is near (`followups.d/3432-p2-drive-quota-alerts.md`).

**Conflicts:**

| Kind | Rule |
|---|---|
| Assets (images, fonts, audio, PDFs) | Never conflict. A file never changes after it is written; an edit writes a new file and repoints the id. Same hash means the same file, so the upload is skipped (deduplication for free) |
| Decks | **Yjs.** Each device writes only its own update files, and every device merges all of them, so a sync conflict cannot happen (§6.4). The **three-way merge** applies only to an outside edit of `deck.md`: Lattice diffs it against the last copy it wrote and applies the difference as a Yjs edit. Nothing is ever overwritten, the backup's rule |
| Chats | Yjs: apply the remote update to the local doc, write the result. Merges by design |
| Settings | Last writer wins per key, with a timestamp per key |
| Deletes | A tombstone in the device's index file. Drive moves the file to the trash, so it stays recoverable for 30 days |

**Writing to Drive safely.** Drive's v3 API has no compare-and-swap on file content. Before an upload, the engine reads
the file's `headRevisionId`. If it is not the base, the engine merges first. A race between that check and the upload
loses nothing, because Drive keeps the overwritten revision: the next poll sees a head the engine did not write, reads
the revision before it, and merges.

**Two devices offline.** Each works locally and writes its own Yjs update files. Each uploads its files when it
reconnects and merges the other's. Because no device writes another's files, no upload can overwrite another device's
work.

### 6.4 Deck format in Drive (axis D)

| | Markdown `.md` | Yjs `.yjs` | `.lattice` zip | **Markdown plus Yjs update files (chosen)** |
|---|---|---|---|---|
| Readable in Drive | Yes | No | No (a zip) | Yes |
| The CLI renders it as-is | Yes | No | Yes | Yes |
| Merge | Three-way text merge; overlap makes a conflicted copy | Automatic, never conflicts | Whole-file: always a conflicted copy | Automatic: each device writes only its own files |
| Size per edit | The deck (tens of KB) | Grows with history; needs compaction | The whole zip, assets included | A few hundred bytes, plus a periodic compaction |
| Exports | Unchanged | Needs a conversion step | Unchanged | Unchanged |
| Two sources of truth | No | No | No | **Yes**: an edit made outside Lattice must be diffed back into the Yjs doc |

**The owner chose both.** The layout:

```
Lattice/
  Decks/
    Quarterly review.md                       the latest readable copy; the CLI renders it
  .lattice/decks/<deck-id>/
    base.yjs                                  the compacted doc
    updates/<device-id>-<seq>.yjsu            one device's edits, one small file each
```

- **No sync conflict can happen.** Each device writes only its own update files, and every device merges all of
  them. Drive cannot append to a file, so the engine adds small files instead. An edit costs a few hundred bytes.
- **Filo stays the one undo history and owns named versions (marks).** Yjs is only the format that carries changes
  between devices. An incoming merge enters Filo as ONE step through the existing commit path, so the normal Undo
  reverts it. The Studio runs no Yjs UndoManager (the `UNDO_STACK_RE` gate stays as it is), and there are no Yjs
  snapshot versions.
- **Local saves diff against the tab's base.** A local save reaches the shared doc as a diff against the base text
  that tab last loaded (a three-way diff), never against the doc's current text. A stale tab, a checkpoint restore or
  an AI apply therefore cannot delete newer text.
- **Minimal line diffs.** The engine applies minimal line diffs, never delete-all plus insert, so history stays small.
- **History size, measured** (spike #3443; Node 22, yjs 13.6.33, seed 20261122). The state vector grows about 4.4 B per
  session, linearly (2,000 sessions: 8.8 KB). A heavily edited deck over a simulated year, 250 days of 20 edits and 2
  AI applies touching 10% of lines, gave an 11 KB `deck.md`, a 727 KB compacted `gc:false` base and 1,500 update files
  totaling 854 KB. Delete-all plus insert is 5.9 times bigger than minimal line diffs. Keeping all history costs about
  0.7 MB per heavily edited deck per year.
- **`deck.md` follows the doc.** Any device rewrites `deck.md` from the merged doc.

**Compaction and files:**

- **Bases are immutable**, named by content hash: `base-<sha256>.yjs`.
- **One device compacts**, elected by a lease.
- **An update file is deleted only after** a base that contains it has been read back.
- **Merging is lossless only** (`Y.mergeUpdates`); nothing trims history. An update made against an older base still
  applies raw while every base comes from `mergeUpdates` (measured in spike #3443).
- **A rebuilt base is detected, not assumed.** After every `applyUpdate`, the engine checks `store.pendingStructs` and
  `pendingDs`. An update made against a base with new history (for example, `.lattice/` rebuilt from `deck.md`) sits
  pending without an error and without changing the text. When anything is left pending, the engine falls back to
  the three-way text merge, which recovered every edit in the spike.
- **At most one update file per journal drain**, and no more than one a minute.
- **`seq` is assigned under a Web Lock**, so two tabs never write the same `<device-id>-<seq>`. A backup never includes
  the device id.
- **`index.json` becomes per-device files** (§6.1).
- **If `.lattice/` is deleted in Drive**, the engine re-uploads it, and the delete never spreads to the decks.

**Outside edits.** When `deck.md` has a Drive revision Lattice did not write, the engine adopts it as a Yjs edit:

- **The stamp.** `appProperties` holds the sha256 of the normalized text plus the sha256 of the state vector, not the
  vector itself: Drive limits each property to about 124 bytes. The full vector lives in a sidecar file under
  `.lattice/decks/<id>/`.
- **Normalized text.** Text is normalized (LF line endings, no BOM, per `2026-08-04-line-endings-lf-boundaries.md`)
  before hashing and diffing.
- **Idempotent adoption.** The diff is applied as a synthetic Yjs client whose id is derived from the Drive revision
  id, so two devices adopting the same edit produce the same items and the text appears once. A claim decides only
  which device shows the review.
- **A chained base.** Each adoption's diff base is the previous one, so a second outside edit does not re-apply the
  first. The engine keeps the chained base's Yjs state, not just its text, and walks every revision since the last
  known head, not just the head.
- **Adoption runs on a fork.** The engine forks a doc at the chained base's Yjs state, applies the diff there as the
  synthetic client, and merges the fork's delta into the live doc. Measured in spike #3443 (Node 22, yjs 13.6.33,
  seed 20261122): applying the diff straight to a live doc that had unsynced local edits diverged permanently in 11 of
  200 trials, with no error, because both devices create the same item ids with different origins. The fork passed
  200 of 200: no divergence, no duplicates, no lost local edits.
- **The review's safety version.** The "Drive edit" version saved before a review is pinned (it never falls out of
  the 25-version cap) and written into the vault, so it syncs.

`.lattice` stays the format for **sharing one deck as one file**.

## 7. The Library as the front door (axis F)

**Sections:** All · **Decks** (new; takes over `3356-p1`) · Design (Themes, Components, Finishes, Motion) · Media
(Images, Videos, **Audio**) · **Fonts** (new; files a deck can embed) · Files · Plugins (local only).

**The layout is Track 4.** The owner picked Track 4 of the `design-competition` run after seeing all five tracks built
as real Studio prototypes; the judge's grafts are part of the pick. Real-Studio prototypes of all five tracks were
shown to the owner on 2026-11-22 (owner-only evidence). The adversarial trio then hardened the pick (HARD RULE #25).

- **`SyncChip`** in the top bar and the Library header, plus a sync row that shows only when needed.
- **Icon-only `PillTabs`** in the dock (280–480 px) and on the phone, labeled in the 720 px sheet.
- **Seven sections**, as listed above.
- **One card column** in the dock and below 640 px.
- **Per-item badges** drawn with the `--mark-*` masks (HARD RULE #29, no typed glyphs), shown only when an item is not
  synced, so a calm Library looks calm.
- **A per-slide review** for outside edits: typed rows, Lattice's side as the default, "Apply N choices", and Undo
  through Filo.
- **"Add from Drive…"**, the Picker (§5).
- **Backup and Restore in a Dialog.** They stay the escape hatch.
- **On the phone**, the sync state shows on the Menu button.

This extends the shadcn primitives and the existing `Library.tsx` (HARD RULE #15). It is not a new surface.

## 8. Migration (axis G)

The owner's ruling: "This is a syncing problem. As soon as a user connects, what they have gets synced. We are not GA
yet." So there is no copy-verify-keep machinery.

1. **One move, one backup.** On upgrade, the Studio writes one automatic workspace backup zip (the same zip Download
   backup makes), then moves local data into the vault once. The backup is the only safety net; Restore puts it back.
2. **Connecting Drive runs an ordinary first sync.** If `Lattice/` already exists because another device connected
   first, the sync merges as it would on any other day.

The pre-paint deck list (localStorage) is rebuilt from the vault after the move, so the first paint does not slow down.

## 9. Trust: copy and threat model (axis H)

### 9.1 Copy

The promise changes from "nothing leaves this device" to **"your files live on your devices and, if you connect it,
in your own Google Drive. Lattice has no server that stores them."** Every string in §2.5 is rewritten in the slice
that ships Drive, not after it (HARD RULE #18: shipping sync while the copy says "sends nothing anywhere" would be a
false claim we created). When the broker (§4.2) ships, the copy names it honestly: "a small Lattice service
renews your Google sign-in; it never sees your files." Slice 5 adds a privacy-policy page, which Google's consent screen requires anyway.

### 9.2 Threat model (detail stays with the owner and the security desk)

- **The token never touches storage.** The access token lives in memory for up to an hour and is never written to
  storage.
- **Requirement: an isolated context for the token.** The Drive access token and every Drive call live in an isolated
  context that page script and preview frames cannot reach (a dedicated worker, or a cross-origin sandboxed frame).
  The page talks to it through a narrow message API.
- **Requirement: a site CSP on the Studio.** The Studio page gets a site CSP (`followups.d/3277-p1-csp-frame-pages.md`,
  or a Studio-specific policy) that restricts `connect-src`, `img-src`, `media-src` and `frame-src`. The existing
  sanitizers (HARD RULE #22) stay.
- **Both requirements are prerequisites of slice 5.** Detail is held by the owner and the security desk.
- **Revocation.** Revoking access from the Google account page makes the next Drive call fail. The Library shows
  "Reconnect", and local work continues.
- **Sign-out** calls `google.accounts.oauth2.revoke`, drops the in-memory token and the Drive page token, and leaves
  local files in place. Local data has its own action, "Remove this device's data".
- **Once (c) ships:** the refresh token lives in an httpOnly cookie on the broker's host, which no script can
  read, and the broker's exact-origin check guards `/token`.
- **Backups never carry tokens**, as they already never carry the OpenRouter key.
- Slice 5 (auth) gets the adversarial trio (HARD RULE #25). Any finding goes to the owner, not to a
  public write-up.

## 10. Slices, in an order that stacks

Each slice is its own branch from `main` and its own merge gate. The local-first slices (1–4) need nothing from
Google. Publishing the Google app "In production" is a gate before slice 9 or slice 10.

| # | Slice | Proof |
|---|---|---|
| 0 | **Spike** (throwaway, not merged): a real sign-in, a real test Drive, two devices, one compaction, iOS Safari | Confirms the Google facts in §12: the Picker API key and app id, folder grants under `drive.file`, the size limit of `appProperties`, uploads into a trashed folder, and the quota units each call costs (§6.3) |
| 1 | **The vault.** The interface plus the OPFS/IndexedDB and memory backings; no caller moves yet | Unit tests over all backings; e2e write → reload → read on `chromium`, `webkit-phone` and `gecko` in persistent profiles, including WebKit's worker write path; a visible `VaultError('unavailable')` where OPFS is refused (#3442) |
| 2 | **Assets into the vault.** Photos, videos, PDFs, themes and other kinds; narration audio; closes `3148-p2` | The 2026-11-11 bench extended to 50 photos: boot, photo open, backup export, before and after. iOS eviction on a real device, or UNVERIFIED and handed to the devices desk |
| 3 | **Decks into the vault, in their final form:** text plus the per-device update files, so there is no second migration. The pre-paint cache stays; fixes the silent quota failure | `storage-bench.cjs` rows 1–3: first slide, blocked time and heap within the repeated runs' spread; an e2e proving a full disk shows a notice |
| 4 | **The Library, local, with the Track 4 layout** (§7). Includes icon-only pills and the mask tokens added to the Studio sheet; shipping seven labeled pills first would wrap at 320 px. Takes over `3356-p1` after #3356 merges | e2e on three projects; `tools/screenshot.js` at 1440, 820 and 390 |
| 5 | **Auth.** GIS token client, the `getAccessToken()` seam, Connect and Disconnect in the Library, the privacy page. **Gated on both §9.2 requirements** | The adversarial trio; e2e against a stubbed GIS; a real sign-in on a test Google account, otherwise UNVERIFIED (HARD RULE #23) |
| 6 | **Sync v1, plus the review and every failure state, behind a flag.** Push and pull; changes polling; journal; retries; per-device update files and compaction; outside-edit adoption; the per-slide review; the copy rewrite (§9.1); the quota guardrails (§6.3, Quotas and cost). The hold and its way out ship together | A fake Drive server covering the API calls the engine uses, driven by e2e on three projects, with two browser contexts as two devices, offline and back; a seeded property test of the merge; the quota units an hour of editing spends; real Drive on a test account, otherwise UNVERIFIED |
| 8 | **Chats and roaming settings sync**, after #3147 | Two-context e2e; Yjs merge test |
| 9 | **Broker.** The stateless Worker (§4.2); a gate before sync goes public | The adversarial trio; e2e against a stubbed Google token endpoint; a real renewal on a test account, otherwise UNVERIFIED |
| 10 | **Desktop:** the file-system vault plus loopback PKCE and the keychain. Waits on #2354 landing (5 weeks quiet, no merge base) | The desktop app under Xvfb: a deck edited on disk shows in the app, and the reverse |

Slices 4 and 6 absorb the former 4b and 7, so there is no slice 7.

**Proof rules for every slice** (HARD RULES #23, #32, #34):

- **`webkit-phone` is Linux WebKit, not iOS.** iOS stays UNVERIFIED until the iOS Simulator suite or a real device
  covers it.
- **Polling and debounce tests run on a controlled clock.**
- **The backoff jitter and the merge property test are seeded**, and the seed is printed.
- **Every slice lists its failing arm, repeat-green and load-green.**

## 11. Owner rulings (2026-11-22)

1. **Auth:** Google Identity Services' browser token model for v1. No server, no client secret, Route B stands. The
   Worker broker stays an optional later upgrade (§4.2).
2. **Scope:** `drive.file` plus the Picker (§5).
3. **Deck format:** both. `deck.md` is the readable copy, and per-device Yjs update files carry the edits (§6.4).
4. **Migration:** none. Local data moves into the vault once behind one automatic backup, and connecting Drive runs a
   first sync (§8).
5. **Library:** extend `Library.tsx`, with its layout picked by a `design-competition` run (§7).
6. **Console setup:** the JavaScript origins and the redirect spelling now; domain verification, the privacy page and
   "In production" before public launch (§4.3).
7. **Secrets:** the owner first read "GitHub has secret management" as covering the broker. GitHub Secrets can feed a
   deployed Worker, but they cannot run code on GitHub Pages, so a static site still cannot hold the secret. The owner
   then chose the browser library, which needs no secret.

**Second rulings (2026-11-22):**

8. **Library:** the owner picked Track 4 after seeing all five built as real Studio prototypes. The judge's grafts are
   part of the pick (§7).
9. **Renewal:** only storage clicks renew sign-in (the account chip, Resume, Sync now, Add from Drive, Review, opening
   the Library). An editor click never renews (§4.2).
10. **Account mismatch:** a different Google account asks before uploading (§6.3).
11. **Broker:** the stateless Worker broker (option c) is REQUIRED before sync is offered to the public. Build and test
    run on the browser token model until then (§4.2). This supersedes ruling 1's "optional later upgrade".
12. **Undo and versions:** Filo owns the deck's undo and versions. Yjs is only the format that carries changes between
    devices (§6.4). This supersedes the "Yjs snapshots" versions of the first rulings.
13. **Quota guardrails:** slower idle polling, large media downloaded on open, deduplication and backoff are REQUIRED
    in slice 6 (§6.3, Quotas and cost). The Cloud-console guardrails (billing left unlinked, quota alerts that are not
    email) are the owner's, tracked in `followups.d/3432-p1-drive-project-billing-off.md` and
    `followups.d/3432-p2-drive-quota-alerts.md`.

## 12. What was not checked

- No call reached Google: the session holds no client ID, and the secret must never reach a session. The Google facts
  above come from Google's guides (the token model, the installed-app flow, Drive scopes) and from community reports
  (the web client's secret requirement, the 7-day Testing expiry). The spike (slice 0) checks each against a real
  test account, together with the Picker API key and app id, folder grants under `drive.file`, the size limit of
  `appProperties`, and uploads into a trashed folder.
- **Measured in spike #3443 (Part A, this sandbox):** OPFS write → reload → read in Chromium, Firefox and Linux
  WebKit (WebKit refuses ephemeral contexts, §6.2); per-device update files merging in any order; an older-base update
  on a lossless base; the silent pending update on a rebuilt base (§6.4); idempotent adoption, and the divergence that
  makes it run on a fork; the three-way save from a stale tab; state-vector growth and a year of history. iOS Safari
  and Safari Private Browsing stay UNVERIFIED: Linux WebKit is not iOS.
- **Still pending the owner's run (spike #3443, Part B):** every real-Google fact above.
- Drive API quotas were not measured. §6.3 (Quotas and cost) estimates them from Google's published limits and the
  design's rates; slice 0 measures what each call costs on a test project, and slice 6 counts the units an hour of
  editing spends.
- Where `lattice.style`'s DNS is hosted was not checked (§4.3).
- The adversarial trio ran on the picked Library design on 2026-11-22. Its findings are folded into §4.2, §6.3, §6.4,
  §9.2 and §10.
