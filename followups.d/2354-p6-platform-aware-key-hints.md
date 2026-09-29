---
origin: 2354
priority: P6
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# The Studio shows Mac key hints (⌘K) on Linux and Windows

why now   — pre-existing, found while running the Linux desktop app: the command pill reads
            ⌘K on every OS, and the new find tooltip had to say "Ctrl+F or ⌘F" because there
            is no platform-aware key label helper. A desktop app on Linux makes it visible.
where     — the ⌘K pill in StudioShell.tsx / CommandPalette.tsx / StudioChromeSkeleton.tsx;
            the find tooltip in StudioShell.tsx. Add one helper (Mod → ⌘ or Ctrl) and use it.
done when — Linux and Windows show Ctrl K / Ctrl F; macOS shows ⌘K / ⌘F; the pre-paint
            shell agrees with the app (studio-shell-parity).
evidence  — screenshots on a Linux and a macOS user agent at 1440px.
verify    — self-review with the gates; run studio-shell-parity.
