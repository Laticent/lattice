---
origin: 2354
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: decks as real files (open, Save, Save As, dirty mark, file association)

why now   — this is the reason to install a desktop app at all, and every later desktop seam
            (recent files, open-with, double-click a .md) stands on it. Today the desktop app
            keeps decks in the webview's localStorage, exactly like the website.
where     — docs/src/components/studio/studio-store.ts (loadSource/saveSource/loadDeckList are
            free functions over localStorage: put a storage interface behind them);
            docs/src/lib/platform.js (the JS half); desktop/src-tauri/src/lib.rs (the Rust
            half); tauri.conf.json bundle.fileAssociations for .md and .lattice.
done when — in the desktop app a deck can be opened from disk, autosave writes back to that
            file, Save As picks a new path, the title shows a dirty mark, and double-clicking
            a .md in the file manager opens it. The web Studio behaves exactly as before.
evidence  — screenshots from the running desktop app (Xvfb is fine) plus the file on disk
            before and after an edit; the web e2e persistence specs still green.
verify    — maker-checker (engine-adjacent store refactor with a migration path).
