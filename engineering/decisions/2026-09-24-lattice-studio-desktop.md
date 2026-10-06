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
Every seam's JavaScript half lives in `docs/src/lib/platform.js` (or a sibling in
`docs/src/lib/` when it must load lazily, as `sign-in.js` does), and its Rust half lives
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
| **OpenRouter sign-in** | Full-page redirect back to `location.href` | `sign_in`: a separate app window shows OpenRouter's page; Rust stops it at the callback address, hands the URL back and closes it. JavaScript half: `docs/src/lib/sign-in.js`, loaded on the click | **Shipped here** |
| **Leave the app** | Links navigate the tab | The main window never leaves the Studio: `on_navigation` allows only the app's own pages and sends http(s) and `mailto:` links to the default browser; new windows are refused the same way | **Shipped here** |
| **Browser chrome** | The browser's own | WebView2's browser shortcuts are off, and both engines' right-click menus keep only the editing items (cut, copy, paste, select all, spelling) | **Shipped here** |
| **Present audience window** | `window.open` + `getScreenDetails` (Chromium only) | A second native window placed with Tauri's monitor API | Planned |
| **Print** | `iframe.print()` for every layout | Same: 1-up, 2-up, 4-up and Notes all print an HTML document through the hidden print frame | **Shipped here** |
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
- The AppImage. It now builds (a plain `npm --prefix desktop run build` makes it next to
  the `.deb`), but nobody has launched it.
- macOS, which is out of scope for this slice, and Windows (see below).

## Windows: a cross-built installer (2026-09-29)

The owner asked for a Windows package "if we can". We can, from this Linux sandbox:
`npm --prefix desktop run build:windows` runs `tauri build --runner cargo-xwin --target
x86_64-pc-windows-msvc --bundles nsis`. `cargo-xwin` downloads Microsoft's CRT and SDK
and links with `lld-link`, and `makensis` wraps the result as an installer.

- **Output:** a 20.7 MB NSIS installer, `Lattice Studio_0.1.0_x64-setup.exe`. The app
  inside is a PE32+ GUI binary. Its imports are system DLLs that ship with Windows 10 and
  later, with no VC++ redistributable, and the WebView2 loader is linked in statically.
- **Config:** `bundle.targets` gains `nsis`, which a Linux build ignores. `bundle.icon`
  gains `icons/icon.ico` for the exe's own icon. The NSIS install mode is `currentUser`,
  so the installer needs no admin prompt.
- **File names:** `save_file` replaces every character Windows refuses in a name
  (`<>:"|?*`, control characters, a trailing dot or space) on every platform. A reference
  doc's original upload name, saved from the Library, is the one name that reached the
  dialog uncleaned.
- **Not signed.** Tauri signs only on a Windows host by default, so SmartScreen warns on
  first run. Signing is part of the release-pipeline slice (followup P5).
- **Run on Windows by the owner, 2026-10-05** (see the next section). Before that, nothing
  had run it on Windows: the sandbox reaches no Windows machine, and Wine does not run
  WebView2 reliably enough to count as evidence.
- **In CI since 2026-09-29.** The owner picked a cross-build step in the existing Linux
  job over a native `windows-latest` job (which bills at 2x) and over no Windows CI. See
  the CI section.

## The Windows test run (2026-10-05)

The owner installed the build of `9aed22c8` on Windows 11 Home (build 26200, WebView2 154,
175% display scaling, dark mode) and walked the scripted checklist
(`Test-LatticeStudio.ps1`, run beside the installer). **21 of 29 checks passed:**

- The installer's hash matched the build. It installed for the user with no admin prompt,
  and the app launched, resized and stayed sharp at 175%.
- Find and replace in the Markdown editor: Ctrl+F, Enter/F3/Shift+F3, Ctrl+H with a
  replace and its undo, Escape, the palette row and the header button.
- Every save went through the Win32 save dialog: Markdown, a cancelled save (nothing
  written), PowerPoint, PDF, the Print deck PDF, and the workspace backup in both halves
  (cancel records nothing, save records the date).
- Edits survived a restart; light and dark; Present; Import deck; uninstall.

**What it found:**

1. **Ctrl+F in Compose opened Edge's own find bar.** The Studio's find bar lives in the
   Markdown editor only, so the key fell through to WebView2.
2. **Back reached the OpenRouter sign-in page.** Sign-in navigates the main window away,
   so the mouse back button and touch gestures walk back to OpenRouter.
3. **Print behaved like Download PDF.** For 2-up, 4-up and Notes, Print builds the PDF and
   opens it in a new window; the app opens no new windows, so the fallback saves it.
4. **An imported Markdown file brought its own style.** Share > Markdown embeds the theme's
   CSS (2026-06-11), so on import that block overrides the front matter. This predates the
   desktop app.

The five automatic file checks failed only because the script looked in one folder and
the dialog saved elsewhere; the saves themselves passed by eye. The script now searches
the usual folders (`-CheckOnly` re-runs just those checks).

### The owner's direction: the Studio is the whole app

> find should do what it does on markdown editor in compose. i dont want edge or native
> find showing up and messing with our find /replace feature. user should not know [edge]
> is there at all. [...] lets think about how we make the studio the focal point, leverage
> edge for those things that need external website like authz/authn only.

Decided with the owner the same day. A first plan deferred it to the next PR; the owner
asked for high confidence before merge instead, so all of it shipped in this one:

| Leak | Decision |
|---|---|
| Browser shortcuts (Ctrl+F, Ctrl+P, F5/Ctrl+R) | Off in WebView2 (`AreBrowserAcceleratorKeysEnabled`, reached through Tauri's `with_webview`); Ctrl+F and Ctrl+P go to the Studio's own find and print |
| Back to OpenRouter | The main window never leaves the Studio: `on_navigation` refuses every address outside the app |
| OpenRouter sign-in | **A sign-in window** (owner's pick over the system browser): a separate app window shows OpenRouter's page, hands the code to the Studio when OpenRouter returns, and closes |
| Edge's right-click menu | Off outside text fields, which keep cut/copy/paste |
| Links to outside sites | Open in the default browser |
| Find in Compose | **A find bar in Compose** (owner's pick over switching to Markdown): the same bar, searching and replacing the whole deck and jumping to the matching block |
| Print for 2-up, 4-up and Notes | **The 1-up path** (owner's pick over a desktop-only native PDF print): lay the rendered slide images out as print pages and print them through the hidden print frame, so Print opens the print dialog on every host and layout |

Markdown import (finding 4) is a separate PR, because changing it changes exported bytes
and needs the owner's export sign-off.

### What shipped, and how it was checked

- **Navigation.** `run()` builds the main window in Rust (`"create": false` in
  `tauri.conf.json`) so it can attach `on_navigation` and `on_new_window`. Only `tauri://`,
  `http(s)://tauri.localhost`, `about:`, `blob:`, `data:` and, in a debug build, the dev
  server load in the main window. Anything else on http(s) or `mailto:` goes to the default
  browser through `tauri-plugin-opener`, pinned to `~2.5` because 2.6 needs Tauri 2.12.
- **Sign-in window.** `sign_in(url, callback)` opens a window labeled `sign-in`. Its
  navigation handler stops the window at the callback (same origin and path, loopback only),
  sends that URL down a one-shot channel and closes the window; closing it by hand returns
  nothing and leaves the Connect button ready. One sign-in runs at a time: a second Connect click brings
  the open window to the front. A provider's own popup (`window.open`) loads in the same
  window instead of a bare engine window. The callback is
  `http://localhost:3000/lattice-studio/oauth`, an address nothing serves: the window never
  loads it.
- **The engine stays hidden.** On Windows, `with_webview` turns off
  `AreBrowserAcceleratorKeysEnabled` and filters `ContextMenuRequested`; on Linux,
  WebKitGTK's `context-menu` signal does the same filtering. The Studio itself answers Ctrl+F
  (its find bar, in the Markdown editor or Compose) and Ctrl+P (the Print deck panel).
- **Find in Compose.** `compose-find.ts` is a ProseMirror plugin with the Markdown editor's
  behavior: match case, whole word, regular expressions with `$1`, "n of m", replace one,
  replace all in one undo step. Slides Compose has locked are searched but never edited, and
  the bar says how many matches it skipped. Both editors render one bar, `find-bar.tsx`.
- **Print.** `export/print-sheets.js` lays out the PDF's slide images on the same geometry
  (`nUpCells`, `handoutRegions`) as an HTML page per sheet, and the panel prints it through
  the hidden frame that 1-up already used.

Checked on the installed Linux `.deb` (Xvfb, WebKitGTK): right-click shows no menu on the
preview and only editing items in the editor; Ctrl+F from the preview opens the Studio's
bar; Ctrl+P opens the Print deck panel; 2-up Print opens the GTK print dialog and Print to
File wrote a 4-page PDF for an 8-slide deck; the mouse back button does nothing; Connect
opens OpenRouter's page in a second window and closing it leaves the Studio as it was. A
throwaway build whose sign-in URL redirected straight to the callback showed the full loop:
the window opened, closed itself 0.6 s later and handed the code back, and the main window
never moved. The e2e suite covers find in Compose (3 specs), N-up/Notes printing (2 specs,
both failing on the old code) and Ctrl+P (1 spec). An independent checker reviewed the
round; its fixes are in: one sign-in at a time, regex replacements that keep their
lookaround context, unreachable images reported on Print, Cmd-not-Ctrl on a Mac. **The Windows halves (WebView2's shortcuts and menu, and the
sign-in window on WebView2) are unverified until the owner's next Windows run.**

One Linux caveat, older than this PR: WebKitGTK prints on the print dialog's paper and
ignores `@page size`, so a 16:9 slide prints on A4 or Letter with margins. Chromium and
WebView2 honor `@page size`. It is logged on the native-print follow-up.

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
- **Windows (added 2026-09-29):** the same job then cross-builds the NSIS installer
  (`npm run build:windows`, cargo-xwin from PyPI) and keeps it as a second 14-day
  artifact. It downloads Microsoft's SDK each run rather than caching 1.1 GB.
- **What it does not prove:** that either app boots. That still takes a display and a person.
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

1. **The Studio is the whole app** (decided 2026-10-05, above): no browser shortcuts, menus
   or navigation, sign-in in its own window, find in Compose, Print that always prints. It
   comes first because it is what the owner's first Windows run hit.
2. **Decks as files.** This is the reason to install a desktop app at all, and every later
   seam (file association, recent files, open-with) stands on it.
3. **Keychain**, so the OpenRouter key leaves localStorage (the sign-in window above
   covers the OAuth half).
4. **The Present audience window** as a native second window.
5. **Native print**, for vector PDF.
6. **A release pipeline**: signing, AppImage, auto-update.

Each slice has a file in `followups.d/` whose origin is this PR.
