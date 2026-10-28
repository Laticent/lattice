studio: +64
home: +64
The structural split now asks @laticent/fluido for its decision (Fluid P1, #2923), so the shared slide-render chunk the Studio and the home page load carries the calls into it: measured +13 gzip bytes on each against this branch before P1 (docs/scripts/measure-route-base.sh). The library itself rides in the lazily loaded engine bundle. The declaration leaves room for CI measuring against a moved main rather than chasing single bytes.
