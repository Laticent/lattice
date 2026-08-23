- Fabricate's generation cores no longer load on the Studio's cold path. Three modules
  reached eagerly from the shell — `architect.ts`, `component-library.ts` and
  `theme-library.ts` — imported `layout-core` / `theme-core` statically, walking past
  the `React.lazy` boundary Fabricate already had. All three now load on demand inside
  the async user actions that need them. `theme-core.generated.js` is an esbuild
  CommonJS registry, so importing one export pulled all seven `lib/theme/*` modules.
  Worth **−45KB gz** on the Studio's eager JS.
