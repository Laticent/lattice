---
origin: 3095
priority: P1
recorded: 2026-11-08
area: engine
severity: low
swimlane: engineering/decisions/2026-11-08-anchor-chrome.md
deferred: off-path — the sovereign frames' page-number pseudo; #3095 kept the box berth equal and did not move the digits
---

# A content slide's page number sits about 5px higher than a title's or divider's

why now   — #3095 put the page number on the footer's baseline inside the footer band. Its BOX keeps the berth every frame shares (pagination-one-mark.test.js), but its digits sit about 5px higher on a content slide (text bottom inset 28px at hd) than on a title, divider or closing with `with-pagination` (23px), because the in-band footer's box is 1.6em while a sovereign frame's page number is a bare line. The same 5px was there before #3095.
where     — lib/forms/cell/stage/stage.css `.cell-footer` and `> .lat-pagination`; the sovereign frames' page-number pseudo (base.modifiers.css, the `section::after` rules).
done when — the page number's digits share one baseline on every frame kind, asserted on ink, not boxes, in pagination-one-mark.test.js.
evidence  — the checker's probe for #3095: text bottom inset 28.0 vs 23.0 on the pagination-one-mark deck.
verify    — tier 1 checker; render the pagination-one-mark deck and measure digit ink.
