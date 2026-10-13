studio: +1300
playground: +420
home: +300
The zip-plugin work adds three small things to code every route shares: the `external` option in `admitPlugins` (lib/plugins/host-grammar.mjs), the engine's `externalPlugins` read, and lint-core's `findUnknownPlugins` / `findPluginFenceAttributes`, plus the Studio's eager side of the door (entry.ts `setPlugins`, plugin-library.ts, the Plugins-tab row and the notice's offered state in StudioShell). Measured in CI against main: studio +1159, playground +355, home +233; the declared figures leave room for gzip spread. The door itself (door.ts, door-run.ts, the kernel, the sanitizer, the generated fence-door data) stays in lazy chunks, loaded only once the Library holds a plugin.
