- **One security policy table.** The tags and attributes the slide sanitizer strips, the attributes that fetch an
  address, and the style tests now live in one file, `lib/core/content-policy.js`, which the renderer reads and the
  linter's coming HTML and CSS rules will read. Nothing a deck renders or exports changes.
- **`lint:deck` warns on a web image.** A new `web-image` warning names each Markdown image (a slide's placed photo
  included) or header and footer image that loads from another site, which the preview shows as a placeholder and the CLI export
  leaves out unless it is run with `--allow-remote`. It is a warning, so `lint:deck --strict` fails on it.
- **A pasted drawing can no longer call another site through an escaped `url(`.** Motion's paste intake strips every
  attribute that fetches from somewhere else, and it now reads them with the web-image scanner's own CSS reader. Its
  old patterns let through `u\72l(…)`, `url( "http:\/\/…" )` and other spellings the browser decodes: 284 such values
  fetched in Chromium, 208 in WebKit and 170 in Firefox, and none get through now.
