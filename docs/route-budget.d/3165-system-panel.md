studio: +415
playground: +396
home: +396
getting-started: +396

The System diagnostic panel's eager half: its gate (`SystemOverlay.tsx`) and its preference
(`system-overlay-prefs.ts`, +352 gz), which every page needs so `?system` and the Workspace switch can turn the
panel on. The panel itself, with the device profile and report code, is a lazy chunk and costs no eager bytes, and
the gate shares the Storage overlay's island (`SiteDiagnostics.tsx`), so no page carries a second island tag.
Measured by CI against main `ca340c7`: +396 on every route, and +415 on the Studio, whose extra 19 bytes are the island naming the lazy chunk that decides the device tier after the first slide (slice 1b; the chunk itself is not eager). Given back before declaring: 662 by having the panel read
`navigator.storage` itself instead of importing `storage-metrics` (which split that module into its own eager
chunk), and 202 by making the panel's buttons text-only (importing lucide's `Copy` split the icon into its own
eager chunk).
