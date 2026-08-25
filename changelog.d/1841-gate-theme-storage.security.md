- **Security: theme CSS that reaches off the device is now refused at the point it
  would be STORED, not just paused out of a preview.** `lib/theme/gate.js` ran live
  in the Theme faculty, but only to pause the CSS and show the author the reason —
  Save never consulted it. So a hand-edited theme carrying a remote `url()` beacon
  could be saved and then applied, reaching the preview `<style>` and every export
  by a route the paused preview never sees. More importantly the `.zip` import and
  the workspace restore reached storage with **no CSS gate at all**, and a shared
  `.zip` is the one path where the author and the victim are different people. All
  three funnel through `saveStudioTheme`, which now refuses with the gate's own
  reason.
- **Only the exfiltration rung refuses.** A theme missing a contract token is wrong
  and still renders, so it saves as before — refusing it would throw away an
  author's work over a fixable mistake. What refuses is `@import url(…)`, a remote
  `url()`, `expression()`, and `javascript:`/`vbscript:` schemes.
