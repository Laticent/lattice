- **Brand asset filenames now name the ground, not a color scheme.**
  `lattice-lockup.svg` / `lattice-lockup-dark.svg` are now
  `lattice-lockup-on-light.svg` / `lattice-lockup-on-dark.svg`, and Laticent's four
  lockups follow the same shape. A **bare name is reserved for a file that
  adapts** via `@media (prefers-color-scheme: dark)`.
  **Breaking:** the six old lockup paths no longer exist. `*-mark.svg`,
  `*-mark-min.svg`, `favicon.svg` and Laticent's tiles are untouched, so the docs
  site, the PWA icon tool and every in-page logo keep working; only a direct link
  to a lockup needs updating.
  `-dark` was naming a *scheme* on a file that responds to no scheme, and implying
  its bare twin was the adaptive one. It was not: `lattice-lockup.svg` was fixed
  light-only and measured **1.14:1** on the brand's own near-black. Four of the six
  family marks already conformed — their lockups adapt, so they keep a bare name —
  and only lattice and laticent carried the old pair. Rename only: both generators
  were re-run and every SVG is byte-identical to the file that was moved.
  `design/logo/README.md` "Naming";
  `engineering/decisions/2026-09-07-ground-named-brand-assets.md`.
