---
origin: 2354
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: the Studio is the whole app (no Edge shows through)

why now   — the owner's first Windows run (2026-10-05) hit WebView2 three times: Ctrl+F in
            Compose opened Edge's find bar, Back walked the main window back to the
            OpenRouter sign-in page, and Print for 2-up/4-up/Notes saved a PDF instead of
            printing. The owner: "user should not know [edge] is there at all".
where     — desktop/src-tauri/src/lib.rs (with_webview: AreBrowserAcceleratorKeysEnabled and
            the default context menu off on Windows; on_navigation refusing every non-app
            address; a sign-in window command); docs/src/lib/platform.js (a signIn seam, an
            openExternal seam); docs/src/components/studio/architect.ts (connectOpenRouter
            through the seam); find-panel.tsx + ComposeView.tsx (the find bar in Compose);
            PrintOptionsPanel.tsx (2-up/4-up/Notes through the print frame).
decided   — engineering/decisions/2026-09-24-lattice-studio-desktop.md, "The owner's
            direction: the Studio is the whole app". Sign-in: a separate app window that
            closes itself on the callback. Compose: the same find bar, whole-deck search and
            replace, jumping to the matching block. Print: lay the rendered slide images out
            as print pages and print them through the hidden print frame, on every host.
done when — in the desktop app on Windows and Linux: Ctrl+F/Ctrl+P/F5 never show Edge UI;
            the mouse back button and gestures never leave the Studio; sign-in completes in
            its own window and the main window never navigates; right-click shows no
            Back/Refresh/Inspect outside text fields; outside links open in the default
            browser; find works in Compose; Print opens the print dialog for every layout,
            on the website too.
evidence  — the owner's Windows run of the updated Test-LatticeStudio.ps1, plus Xvfb
            screenshots on Linux; e2e for find-in-Compose and the N-up print document.
verify    — maker-checker (a new seam, navigation policy and an auth flow).
