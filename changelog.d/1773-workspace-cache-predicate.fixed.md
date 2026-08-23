- The AI provider layer is out of the Studio's eager bundle. The Workspace settings
  sheet statically imported `architect-model.js` — OpenRouter OAuth, the on-device
  model ladder, the streaming client, the catalog cache — for one synchronous
  predicate that decides whether the Prompt-caching switch can honestly be offered.
  That predicate (and its `withCachedSystem` sibling) now lives in a dependency-free
  `ai/or-cache.js`, so the provider layer is reached only through the dynamic
  `import()` it already had everywhere else, and ships as its own on-demand chunk
  instead of being inlined into the Studio's eager bundle. Worth **−5.6KB gz /
  −16.0KB raw** on the Studio's eager JS (640,868 → 635,121 bytes gz). The module is
  still fetched on a normal load — just after hydration rather than parsed before it,
  so this defers the cost rather than dropping it. Nothing changes in what the sheet
  draws: the model id the predicate reads was already resolved asynchronously, so
  first paint never had the answer to begin with.
