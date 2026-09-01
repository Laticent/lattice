- Dependabot pull requests against `docs/` keep installing across the astro 7 bump. The new
  dependency tree placed `@emnapi/core` and `@emnapi/wasi-threads` to satisfy an optional peer of
  `@napi-rs/wasm-runtime`, the shape `build:check` refuses because Dependabot's lockfile writer
  deletes exactly those nodes and `npm ci` then rejects the result. `@emnapi/core` is now a direct
  devDependency of `docs/package.json`; one hard edge clears both, since the second is a plain
  dependency of the first. The built site is byte-identical across the declaration.
