- **Fixed: the Studio raster-export marker spec read the wrong pixel, so its images and PowerPoint arms failed on every
  engine while the exports were right.** The reader pill ("Content clipped") is in both pictures. Its rail stands one
  spectrum-bar width above the slide's bottom edge, so on a 2560×1440 picture the pill spans rows 1400–1431, and the
  spec sampled row 1437. `docs/e2e/studio-raster-export-marker.spec.ts` now samples at 98.2% of the height, which is
  inside the pill at every size measured, and each arm also checks that the slide that fits has no pill there, so the
  oracle can fail.
