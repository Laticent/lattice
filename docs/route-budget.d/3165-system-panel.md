studio: +386
playground: +386
home: +386
getting-started: +386

The System diagnostic panel's eager half: its gate (`SystemOverlay.tsx`) and its preference
(`system-overlay-prefs.ts`, +352 gz), which every page needs so `?system` and the Workspace switch can turn the
panel on. The panel itself, with the device profile and report code, is a lazy chunk and costs no eager bytes, and
the gate shares the Storage overlay's island (`SiteDiagnostics.tsx`), so no page carries a second island tag.
Measured by CI against main `8b889f6`: +386 on every route. Given back before declaring: 662 by having the panel read
`navigator.storage` itself instead of importing `storage-metrics` (which split that module into its own eager
chunk), and 202 by making the panel's buttons text-only (importing lucide's `Copy` split the icon into its own
eager chunk).
