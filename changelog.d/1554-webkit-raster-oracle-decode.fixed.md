- **Fixed: the WebKit `math compare` duplicate-paint guard can run again.** Its raster
  oracle decoded the slide screenshot with `fetch()` on a `data:` URL, which the
  preview/export remote-subresource CSP refuses at any size — `connect-src 'self'` does
  not list `data:`, and the presented document the spec re-hosts carries that meta. It
  now decodes with `atob` + `Blob`, which reaches no loader. The spec is green on real
  WebKit and goes red again when the engine fix it guards is removed.
