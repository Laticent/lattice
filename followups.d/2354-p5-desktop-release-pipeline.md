---
origin: 2354
priority: P5
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: a release pipeline (AppImage, signing, auto-update)

why now   — #2354 added .github/workflows/desktop.yml (the owner's pick: a .deb build on
            desktop/** changes), but nothing RELEASES the app: no AppImage, no signing, no
            auto-update, and the .deb is only a 14-day workflow artifact.
where     — .github/workflows/desktop.yml or a release workflow (a new CI job or step is the
            owner's call), desktop/src-tauri/tauri.conf.json (appimage target, updater),
            RELEASE.md.
done when — a tagged release produces a signed .deb and AppImage; the app can update itself.
evidence  — a release run's artifacts installing and booting on a clean Ubuntu.
verify    — maker-checker (CI/infra).
