playground: +12
home: +12
The engine, which is in both bundles, gains a `codeFences` render option, a last registry slot for the plugin fence door (`lib/transformers/code-fences.js`, about ten lines), and a check in the highlighter that leaves the door's fence names plain. CI measured +5 B on the playground and +7 B on home against main; +12 covers both with room for gzip spread (the Studio read -4 B on the same build, so this is mostly spread).
Given back first: nothing. The door itself (`code-door-fence.mjs`, the worker, the sanitizer step) is not in any eager bundle; the Studio loads it only once a Library holds a plugin, and nothing does yet.
