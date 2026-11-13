studio: +424
playground: +215
home: +210
getting-started: +210

The System diagnostic panel's eager half: its gate (`SystemOverlay.tsx`) and its preference
(`system-overlay-prefs.ts`, +352 gz), which every page needs so `?system` and the Workspace switch can turn the
panel on. The panel itself, with the device profile and report code, is a lazy chunk and costs no eager bytes. The
gate shares the Storage overlay's island (`SiteDiagnostics.tsx`), so no page carries a second island tag. The first
cut was 1,086 bytes on the Studio and 872 elsewhere; 662 came back by having the panel read `navigator.storage`
itself instead of importing `storage-metrics`, which had split that module into its own eager chunk. The Studio's
extra 214 is the Workspace switch for the panel.
