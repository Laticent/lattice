studio: +1500
The Studio gains an Image tab in deck settings and in slide settings for the `image-card:` register (placement, backing, ink, size and density selects, their shared labels in `image-card-rows.tsx`, and the kernel mirror in `slide-provenance.ts`), plus completion that keeps offering words after the first on one-line axis registers.
Given back first: `tag:`, `backdrop:` and `image-card:` now share one parser (`lib/core/register-factory.js`), which took 0.5KB off the engine.
