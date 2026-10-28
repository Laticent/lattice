---
origin: 2933
priority: P6
recorded: 2026-10-28
area: engine
severity: low
swimlane: test/conformance/office/office-conformance.js
source: https://github.com/Laticent/lattice/pull/2933
---

# Render the editable PPTX in a real Microsoft or Apple renderer in CI

```text
  P6 · [no ticket] no CI job draws a .pptx the way PowerPoint does
       why now   — the editable export is held to the ISO 29500 schema and Microsoft's Open XML SDK validator (office-conformance.test.js), which prove PowerPoint opens the file without a repair, not how a slide LOOKS. Every render so far is LibreOffice Impress. The owner chose to stay on the conformance test for now (2026-10-28, #2933). Options weighed: A Microsoft Graph conversion to PDF (`/drive/items/{id}/content?format=pdf`, PowerPoint for the web's engine; needs a Microsoft 365 app registration and one secret; nightly or dispatch, never per PR) — recommended; B macOS Quick Look on the existing macOS runner (Apple's OfficeImport renderer behind iPhone/iPad previews; `qlmanage -p -o` writing the preview headless is unverified); C a Windows runner with desktop Office (needs a license; unlicensed Office runs in a limited mode) — not recommended. The iOS simulators cannot host Keynote or PowerPoint (no App Store).
       where     — a new nightly workflow beside .github/workflows/integration-nightly.yml; compare against the deck's own PDF with tools/pixel-check.js.
       done when — the owner picks an option, and a nightly job renders examples/focus.md and examples/focus-highlight-axes.md from `--editable` in that renderer and fails on a slide that drifts from the PDF.
       evidence  — the job's per-slide renders beside the PDF, and one deliberately broken file it catches.
       verify    — owner decision first (it adds a CI job, and A adds an outside account and a secret); then tier 1 checker.
```
