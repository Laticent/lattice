- **One security policy table.** The tags and attributes the slide sanitizer strips, the attributes that fetch an
  address, and the style tests now live in one file, `lib/core/content-policy.js`, which the renderer and the
  linter both read. Nothing a deck renders or exports changes.
