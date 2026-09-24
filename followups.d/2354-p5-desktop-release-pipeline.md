---
origin: 2354
priority: P5
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: a release pipeline (AppImage, signing, auto-update) and the CI question

why now   — #2354 builds a .deb by hand. Nothing builds or tests desktop/ in CI, and adding
            a job is the owner's call (CLAUDE.md second filter, row 2). Measured costs are in
            engineering/decisions/2026-09-24-lattice-studio-desktop.md.
where     — .github/workflows (new, owner-approved), desktop/src-tauri/tauri.conf.json
            (appimage target, updater), RELEASE.md.
done when — the owner has picked a CI shape; a tagged release produces a signed .deb and
            AppImage; the app can update itself.
evidence  — a release run's artifacts installing and booting on a clean Ubuntu.
verify    — maker-checker (CI/infra).
