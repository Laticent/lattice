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

## Build for Windows (cross-compiled from Linux)

Tauri's cross-build path: an NSIS installer built on Linux, linked against Microsoft's
SDK that `cargo-xwin` downloads on first use. You need `clang`, `llvm` (for `llvm-rc`), `lld` and
`nsis` from the distro, plus:

```sh
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
npm --prefix desktop run build:windows
# → desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*_x64-setup.exe
```

Tauri calls cross-compilation experimental. The installer is unsigned, so Windows
SmartScreen warns on first run. It installs for the current user and downloads the
WebView2 runtime if the machine lacks it (Windows 11 ships it). Building on a Windows host
also gives an `.msi` and signing.

## CI

`.github/workflows/desktop.yml` builds the `.deb` and the Windows installer whenever
`desktop/**` changes, and keeps both as downloadable artifacts on the run. It proves the
packages build, not that they boot.

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
