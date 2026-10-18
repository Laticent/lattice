---
origin: 2748
priority: P1
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2748
---

# A symlink in the deck folder, and a typed `file:///abs/path`, still reach outside the deck

why now   — PR #2748 confines a relative picture path to the deck folder on a `file:` base, but only by its text.
            A symlink inside the folder that points out of it still loads, and `![bg](file:///etc/hostname)` (a typed
            `file:` address) still loads in the CLI. §4.11 owes both ("real path; no `..` or symlink escape" and "a `file`
            row is refused unless the deck was authored on this machine"). A stranger's deck zip with a symlink is the case.
where     — `lib/core/media-sources.js` `resolveRelative` (text only, no file system); `lib/export/html-player.js`
            `inlineFileUrls` (reads any `file://` it finds, `fileToDataUri`); the `file` row's `locality` in the same table.
done when — a relative path whose real path leaves the deck folder draws the stand-in in the CLI and in the player; a typed
            `file:` address is refused unless the deck was authored on this machine (needs an authored-here signal, which
            a decision names first); a test makes a symlink to a temp file outside the folder and shows it refused; the
            player no longer reads it.
verify    — render a deck whose folder holds a symlink to `/etc/hostname`, then open the player and grep it for the bytes.
