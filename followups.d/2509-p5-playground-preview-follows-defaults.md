---
origin: 2509
priority: P5
recorded: 2026-10-06
---

# The Playground page's preview does not re-render when the host changes its plugin defaults

why now   — found while proving the Playground page's lint follows admission (#2509 P3,
            `docs/e2e/plugin-admission.spec.ts`): after `LatticePlayground.setPluginDefaults(null)`
            with no edit, the editor re-lints (it listens for `lattice:plugin-defaults`), but the
            page's preview keeps the render made under the old defaults — "Rendered 3 slides" for a
            deck the default set renders as 2 — until the next keystroke. The Studio's rail
            already re-reads on the event. Pre-existing: the preview never listened for it.
where     — the Playground page's preview pane (`docs/src/components/playground/PlaygroundApp.tsx`
            and its render loop).
done when — a defaults change with no edit re-renders the Playground preview, pinned by a case in
            `docs/e2e/plugin-admission.spec.ts`.
evidence  — that e2e case on the built site.
verify    — tier 1 checker.
