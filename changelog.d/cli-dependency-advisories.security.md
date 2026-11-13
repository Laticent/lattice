- The CLI now installs puppeteer 25.17 (it was 23.11), which clears ten high-severity advisories in what
  `npm install @laticent/lattice` pulls in: zip symlink path traversal in `extract-zip`, the proxy-agent
  chain, and `zod` under `chromium-bidi`. The Chrome that puppeteer downloads moves from 131 to 157; PDFs
  rendered on the same Chrome are byte-identical, and the newer Chrome blends translucent tinted fills a
  few color levels differently.
- pptxgenjs lists `image-size` 1.x (with infinite-loop advisories) but never loads it, so no export can
  reach the vulnerable parsers. This repository's lockfiles now pin it to 2.1.0, which clears `npm audit`
  here; npm does not apply that override to a project that installs Lattice, so its audit still lists
  `image-size` 1.x under pptxgenjs.
- Behind a company proxy, puppeteer's Chrome download needs `proxy-agent` installed alongside Lattice;
  puppeteer 25 made it optional.
