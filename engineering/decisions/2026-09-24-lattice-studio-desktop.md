---
status: in-progress
summary: The desktop app is the Studio in a Tauri window, not a second app. The owner settled five things on 2026-09-24. We wrap the Studio. It lives in this repo under `desktop/`. Linux ships first. It is called Lattice Studio. Its look is our own, with native code only where the OS must do the job. The first slice is a Linux build that runs the Studio unchanged, a platform seam (`docs/src/lib/platform.js`) that routes every file save through the OS save dialog, and find/replace in the editor.
---

# Lattice Studio desktop: wrap the Studio, own the look, seam only the OS

**Ask (2026-09-24, the owner):**

> it is time for us to create the desktop app we have been holding off? is lattice studio
> mature enough now to become a desktop app?

Then, after the assessment:

> we wrap the studio and create the needed seams and add the missing features (ie find and
> replace). Lattice Studio Desktop (official name unless you have better name) should live
> in the same repo. Linux platform first. The other question we need to address is whether
> the app should have os native look and feel or should we own it and only have seams for
> things that are truly os native capabilities.

## Decisions

| # | Question | Decision | Who |
|---|---|---|---|
| 1 | Build a new app, or wrap the Studio? | **Wrap the Studio.** | owner |
| 2 | Where does the code live? | **This repo, `desktop/`.** | owner |
| 3 | Which platform first? | **Linux.** macOS and Windows follow. | owner |
| 4 | Native look, or our own? | **Our own.** Native code only for jobs a web page cannot do. | owner, on the recommendation below |
| 5 | Name | **Lattice Studio.** App ID `com.laticent.studio`, binary `lattice-studio`. | owner, on the recommendation below |

### 1 · Why wrap instead of build

The May plan (`2026-05-10-tauri-exploration.md`) called for a new Svelte app that reused
the engine. It listed a v1.0 of CodeMirror authoring, live preview, crash recovery,
PDF export, a command palette and a welcome deck. By September the Studio had shipped all
of that and more as a static web app:

- CodeMirror 6 editing, with a live single-slide preview in an iframe.
- In-page export of PDF, PPTX, HTML, image sets and Marp bundles. No Node, no Puppeteer.
- Present mode with speaker notes and a separate audience window.
- Autosave, checkpoints, a crash sentinel, and workspace backup and restore.
- A self-hosted engine, fonts, Mermaid and KaTeX.
- 127 Playwright specs, including a nightly WebKit run, and about 318 unit tests.

Building the May app would redo that work, and it would leave two editors to keep in step.
Wrapping keeps one Studio. The website, the installed PWA and the desktop app are three
ways to install it.

### 4 · Own the look; seam only the OS

Everything inside the window is the Studio's own UI on every host. That covers menus (the
header and the command palette), context menus, dialogs, scrollbars and the find bar.
This is the model of VS Code, Obsidian and Linear.

It is the right call here for three reasons:

- **One UI, not three.** Native widgets would need a GTK version, then an AppKit version,
  then a Win32 version. The Studio already has one tested design at three widths.
- **The palette reaches everything.** The Studio is palette-blind: every color is a token.
  A GTK menubar or a native context menu cannot take a Lattice palette.
- **The tests still apply.** The Studio's e2e suite drives this UI. A native menubar
  would be a surface no spec reaches.

A **seam** is a place where the Studio asks its host to do something only the OS can.
Every seam's JavaScript half lives in `docs/src/lib/platform.js`, and its Rust half lives
in `desktop/src-tauri/src/lib.rs`. A call site never branches on `isDesktop()` by itself;
a second, private seam is the one the next port misses.

| Seam | Web | Desktop | State |
|---|---|---|---|
| **Save a file** | Hidden `<a download>`, clicked inside the user gesture | `save_file`: the native save dialog (GTK's file chooser on Linux), bytes written in Rust. Saves queue, so a multi-file export shows one dialog at a time | **Shipped here** |
| **Open a file** | `<input type="file">` | Same input. WebKitGTK, WKWebView and WebView2 all raise the native picker | No seam needed |
| **Service worker** | Registered in production | Skipped: the app bundles every asset, and `tauri://` cannot register one | **Shipped here** |
| **Window frame** | n/a | Native decorations. A custom title bar is deferred (see below) | Shipped |
| **Decks as files** | `localStorage` | Real `.md`/`.lattice` files: Save, Save As, a dirty mark, and opening from the file manager | Planned |
| **AI key** | `localStorage` | The OS keychain (Secret Service on Linux), behind a main-frame-only check (see below) | Planned |
| **OpenRouter sign-in** | Full-page redirect back to `location.href` | Loopback or deep-link callback; `tauri://` is not a valid return address | Planned |
| **Present audience window** | `window.open` + `getScreenDetails` (Chromium only) | A second native window placed with Tauri's monitor API | Planned |
| **Vector print / PDF** | `iframe.print()` | Native print. `print_to_pdf` exists only in WebView2 | Planned |
| **Light/dark** | `prefers-color-scheme` | Same query; confirm WebKitGTK follows the GTK theme on a real desktop | To verify |

**Every seam is callable from any same-origin frame, so a seam that RETURNS a secret needs
a caller check.** Tauri injects its IPC bridge into the main frame only, but the Studio's
preview iframes are `srcdoc` frames with no `sandbox` attribute. They share the app's
`tauri://localhost` origin, so script inside one can reach `parent.__TAURI_INTERNALS__`.
The sanitizers (HARD RULE #22) are what keep deck content from running script there. That
is acceptable for `save_file`, which only opens a dialog the user must confirm. It is NOT
acceptable for the planned keychain seam: a sanitizer bypass would read the AI key. Before
that seam ships, either sandbox the preview frames or have Rust reject calls that did not
come from the main frame. `csp: null` matches the website, which sets no CSP either; a
real policy is part of the same slice.

**The dialog is GTK's, not the xdg portal.** `tauri-plugin-dialog` builds `rfd` with its
`gtk3` backend, so the save dialog is a `GtkFileChooserDialog`. That is fine for a `.deb`.
A Flatpak build needs the portal backend instead, because a sandboxed app cannot show the
host's file chooser any other way.

**The window frame keeps native decorations.** A frameless window with our own buttons
looks sharper. On Linux, though, we would then own Wayland drag, resize and snapping, plus
the GNOME-vs-KDE button layouts. That is a later polish pass, not a first slice.

### 5 · Why "Lattice Studio" and not "Lattice Studio Desktop"

The installed PWA is already called "Lattice Studio" (`2026-07-03-pwa-studio-identity.md`).
The desktop build is another way to install that same product. Figma, Slack and VS Code
use one name everywhere and put "desktop" only on the download button. The README's
earlier line that called the desktop app "Laticent" named the org rather than the app, and
now reads "Lattice Studio".

## What shipped in the first slice

1. **Find and replace** in the Markdown editor (`docs/src/components/studio/find-panel.tsx`).
   `@codemirror/search` does the searching. The bar is a Studio-built panel, not the stock
   one. It opens with Ctrl/Cmd+F, Ctrl+H (Cmd+Alt+F), an icon button in the editor header,
   and the command palette, which is the only way in on a phone. Adding the button meant
   re-budgeting the header. The measurements are in the PR.
2. **The platform seam** with its first capability, `saveFile`. The five hand-rolled
   download helpers became one.
3. **`desktop/`**: a Tauri 2 app that serves `docs/dist` and opens `/studio/`, plus a `.deb`
   bundle target. `npm --prefix desktop run build:deb` builds it once the docs site is built.

## Verification (HARD RULE #23)

**Surface:** the Tauri 2 app built with `tauri build` (which serves `docs/dist` over the
app's own asset protocol, the same way the package does) on WebKitGTK 2.52 (Ubuntu 24.04),
run under Xvfb with a D-Bus session and `xdg-desktop-portal-gtk`. Driven with `xdotool`
and captured with `import`. The checks below ran on the debug build; the installed `.deb`
was then booted from `/usr/bin/lattice-studio` to confirm the package itself runs.

- The Studio boots from the bundled build and draws the editor, the live preview and the
  filmstrip.
- **Share → Markdown** opens GTK's native save dialog with the suggested name and an MD
  filter. The file lands on disk: 12,393 bytes, with the theme embedded.
- **Share → PDF → Download PDF** rasterizes all seven slides inside WebKitGTK. The dialog
  appears about 2 seconds after the click, and the saved PDF has 7 pages at 1706×960pt.
  All seven pages were rasterized and checked by eye: fonts, palette, cards and the
  timeline all render.
- **Ctrl+H** in the app opens find with the replace row, counts "4 of 27", and the preview
  follows the match. After the checker's key-forwarding fix, typed INSIDE the find field on
  WebKitGTK: Enter then F3 steps to "3 of 27", Ctrl+H opens the replace row, and Escape
  closes the bar and hands focus back to the editor.

**UNVERIFIED:**

- A real desktop session with a window manager (GNOME on Wayland, KDE).
- HiDPI scaling.
- Screen-reader access through AT-SPI.
- The AppImage target (only the `.deb` was built).
- macOS and Windows, which are out of scope for this slice.

## Corrections to the May note

- **"Tauri's WebView is Chromium."** That holds only on Windows (WebView2). macOS uses
  WKWebView and Linux uses WebKitGTK. So the Studio's nightly WebKit e2e run is the closest
  existing proxy for two of the three desktop platforms, and `print_to_pdf` cannot be the
  cross-platform export path. The Studio's own in-page PDF export is, and it works on
  WebKitGTK (above).
- **"No Node in v1."** This still holds, and the Studio met it without trying.

## CI: a .deb build, only when the desktop app changes

The owner picked this on 2026-09-24 from three options (Rust tests only · full .deb · no CI
yet). `.github/workflows/desktop.yml` runs on a pull request or a push to `main` that
touches `desktop/**` or the workflow itself. It installs the WebKitGTK dev packages and
stable Rust, builds the root bundles and the docs site (`build:e2e`), runs
`cargo test --locked`, runs `tauri build --bundles deb`, and keeps the `.deb` as a 14-day
artifact for a manual install test.

- **What it proves:** the Rust compiles, its tests pass, and the package bundles.
- **What it does not prove:** that the app boots. That still takes a display and a person.
- **It is not a required check.** A path-filtered workflow never reports on a PR outside
  its paths, and a required check that never reports blocks every merge.
- **What a PR that touches only `docs/` does not get:** a desktop build. A Studio change
  that breaks the desktop app shows up on the next `desktop/**` PR or a manual
  `workflow_dispatch` run.

The costs the owner weighed, measured in this sandbox (4 cores, 15 GB):

| Step | Time | Output |
|---|---|---|
| `cargo build` (debug, cold) | 2m 01s | 192 MB binary |
| `tauri build` release (cold) | 3m 41s | 27 MB binary |
| `tauri build --bundles deb` (warm) | 40s | 20.4 MB `.deb`, 27 MB installed |

## Next slices, in order of what they unblock

1. **Decks as files.** This is the reason to install a desktop app at all, and every later
   seam (file association, recent files, open-with) stands on it.
2. **Keychain and OAuth**, so the AI features work signed-in on desktop.
3. **The Present audience window** as a native second window.
4. **Native print**, for vector PDF.
5. **A release pipeline**: signing, AppImage, auto-update.

Each slice has a file in `followups.d/` whose origin is this PR.
