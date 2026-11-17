studio: +225

The warm-up hold (`first-slide.ts` › `holdWarmUps`, `whenNotHeld`, `heldWarmPanels`): while the chat renders a draft
slide, the Studio's warm-up queue starts no new item, so it stops pushing `render_slide` past its 15 s budget on a Full
device. `first-slide.ts` is now its own chunk (+679 B) rather than riding in `progress-rail` (-484 B). Given back first: the
hold sat in `lazy-panel.tsx` as first written, which the Playground also imports at startup, and cost the Playground
+443 B; it moved to a Studio-only wrapper and the Playground is back to +0. Measured locally against this branch's base
(`f2a6dd7`) with the gate's own `measure()` (`measure-route-base.sh`).
