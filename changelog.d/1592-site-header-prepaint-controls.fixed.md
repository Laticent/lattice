- **The shared site header's theme select filled itself in after hydration, and the mode
  toggle named the wrong stop while it waited — on every page of the site.** The select
  rendered EMPTY and became "Burgundy" a second or more later; the toggle rendered the
  Monitor ("System") icon at a visitor who had pinned dark, which is worse — a control naming
  the wrong stop rather than none. Measured at 1440x900 with the CPU throttled 6x: both wrong
  from t≈145ms, corrected at t≈1.9s on the component reference, t≈3.8s on the landing, t≈5.1s
  on the Playground. Both answers were already in `localStorage` before paint; only the
  controls waited. Both are now PAINTED FROM `<html>` ATTRIBUTES: the control renders every
  palette's label and all three mode icons, and CSS shows the one in force — React choosing
  would be a server/client mismatch React 19 does not patch, and radix's own `SelectValue`
  renders nothing at all until a layout effect has built the closed content's fragment, which
  is why the trigger server-rendered empty. A pre-paint seed in `SiteHeader.astro`, placed
  ABOVE the header markup, publishes `data-palette` and `data-mode-pref` and appends the
  per-palette rules to `<head>`; `PaletteControls` reads the same attributes in its first
  render. `paletteLabel` moved to a React-free `lib/palette-label.ts` so the Astro seed shares
  the derivation instead of restating it. (#1592)
