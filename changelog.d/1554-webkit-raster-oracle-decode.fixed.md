- **Fixed: the WebKit `math compare` duplicate-paint guard can run again.** Its raster
  oracle decoded the slide screenshot with `fetch()` on a `data:` URL, which the
  preview/export remote-subresource CSP refuses (`connect-src 'self'` does not list
  `data:`) and which WebKit refuses again at screenshot size regardless of policy. It
  now decodes with `atob` + `Blob`, which reaches no loader. The spec is green on real
  WebKit and goes red again when the engine fix it guards is removed.
