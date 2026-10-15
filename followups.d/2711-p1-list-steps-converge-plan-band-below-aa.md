---
origin: 2711
priority: P1
recorded: 2026-10-15
area: progression
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §3.1
---

# list-steps converge sets white body text at 3.01:1 on its last band

why now   — A shipped variant fails WCAG AA (4.5:1) for 21px body text, and no gate sees it because the hand-written gallery deck omits the variant.
where     — lib/components/progression/list-steps/list-steps.styles.css (the converge band inks)
done when — every converge band's text measures at least 4.5:1 in light and dark, on the full palette sweep
evidence  — node tools/check-slide-contrast.js on the rendered list-steps gallery: p5 'list-steps converge' strong/li 3.01:1, fg rgb(255,255,255) on rgb(81,157,197)
verify    — render list-steps.gallery.md light and dark and rerun the probe; look at slide 5
