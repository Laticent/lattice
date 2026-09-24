---
origin: 2321
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2321
---

# Portrait split-cover pages report "content clipped" for an ellipsized footer

why now   — the overflow report flags 4 pages on the inventory gallery at `size: portrait` (7, 12, 17, 22), identical on `main`; a standing false-looking alarm trains people to ignore the real ones.
where     — the split envelope's cover pages (accent cover: eyebrow, heading, "One part per row →"); the long `_footer:` text is ellipsized, and the clipped-content pass counts it.
done when — the portrait inventory gallery renders with no CONTENT CLIPPED line, either because the cover footer fits/truncates by design and is exempt, or the footer text is shortened where it is authored.
evidence  — `sed 's/^theme: indaco/theme: indaco\nsize: portrait/' lib/components/inventory/inventory/inventory.gallery.md > /tmp/g.md && node lattice-emulator.js /tmp/g.md /tmp/g.pdf`
verify    — rerun the same command; check other buckets' galleries at portrait for the same cover-footer pattern.
