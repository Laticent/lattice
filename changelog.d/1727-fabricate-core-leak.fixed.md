- Fabricate's generation cores no longer load on the Studio's cold path. `architect.ts`
  and `component-library.ts` are reached eagerly from the shell but imported
  `layout-core` / `theme-core` statically, walking straight past the `React.lazy`
  boundary Fabricate already had. Both now load on demand inside the async user
  actions that need them. Studio eager JS: **774.9KB → 740.7KB gz (−34.2KB)**;
  raw parse weight 2258KB → 2163KB.
