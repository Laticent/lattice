---
origin: 2325
priority: P4
recorded: 2026-09-24
---

# The Studio never draws a function plot, though its export code says it does

why now   — a ```functionplot fence renders an empty stage in the Studio preview, and so in
            the Read pane and the Studio webpage export too. deck-export.js ("the
            runtime-inflated ones are inflated in this same frame") and share-export.ts state
            the opposite. Found driving the Studio for #2325 at 1440px: `.functionplot` stayed
            an empty placeholder
where     — lib/runtime/index.js inflateFunctionPlots returns early when window.functionPlot
            is missing. Nothing under docs/ loads function-plot's JS (the CLI emulator
            injects node_modules/function-plot/dist/function-plot.js; the Studio capture
            frame loads the runtime and Mermaid only)
done when — either the Studio frame loads the vendored function-plot bundle and the fence
            draws in the preview, the Read pane and the webpage export, or the fence is
            declared CLI-only and the two docs comments and the fence catalog say so
evidence  — tools/screenshot.js of the Studio preview @1440/820/390 showing the plot, and the
            label text read from the Read pane
verify    — tier 1 checker if a bundle is vendored (it adds bytes to the Studio frame); tier 0
            if it is a docs correction
