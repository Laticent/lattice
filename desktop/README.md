# Lattice Studio — desktop

The Studio from the docs site, in a native window. This folder holds only the Tauri
shell. The Studio itself is `docs/`, built once and served from `docs/dist`, so the
website, the installed PWA and this app run the same code.

Why it is shaped this way, and what comes next:
`engineering/decisions/2026-09-24-lattice-studio-desktop.md`.

## Build and run (Linux)

You need Rust (stable) and the WebKitGTK development packages:

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev
```

Then, from the repo root:

```sh
npm --prefix docs run build          # the Studio → docs/dist (build:e2e is faster for iteration)
npm --prefix desktop install
npm --prefix desktop run build:deb   # → desktop/src-tauri/target/release/bundle/deb/*.deb
npm --prefix desktop run build:run   # or just the binary, no package
```

For live reload, start the docs dev server (`npm --prefix docs run dev`), then run
`npm --prefix desktop run dev`. The window then loads `http://localhost:4321/studio/`.

## CI

`.github/workflows/desktop.yml` builds the `.deb` whenever `desktop/**` changes, and keeps
it as a downloadable artifact on the run. It proves the package builds, not that it boots.

## Where things live

| Path | What |
|---|---|
| `src-tauri/src/lib.rs` | The Rust half of every seam, one command each (today: `save_file`) |
| `docs/src/lib/platform.js` | The JavaScript half. Studio code calls this, never Tauri directly |
| `src-tauri/tauri.conf.json` | Window, bundle and identity (`com.laticent.studio`) |
| `src-tauri/icons/` | Generated from `docs/public/icons/icon-512.png` (`npm run icons`) |

## The one rule

Everything inside the window is the Studio's own UI. Add Rust only for a job a web page
cannot do, and add its JavaScript half to `docs/src/lib/platform.js` in the same change.
