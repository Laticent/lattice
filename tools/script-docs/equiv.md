---
group: Test & verify
---
Slice/deck equivalence sweep — for every slide of every committed deck, does rendering it ALONE match rendering it inside the deck? The headless half of the preview-fidelity diagnostic; the author-facing half is the Studio's "Preview fidelity" overlay. It RUNS THE SHIPPED REPAIR: each slice is handed the deck position `supplyablePosition` would give it (lib/diagnostics/slice-equivalence-core.mjs, the same copy the Studio's slice route calls), so breaking that path collapses the rate instead of moving it 0.0 points. It prints its supplied-position count, prelude count, neutralizer set and skipped decks every run so the number stays legible. On-demand rather than a CI gate — its subject is a diagnostic prototype and a corpus edit moves it.
