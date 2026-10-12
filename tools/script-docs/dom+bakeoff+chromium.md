---
group: Test & verify
---
Third arm of the DOM bake-off — measures the Chromium the CLI export ALREADY launches as a DOM provider, since lattice.js builds jsdom windows while a puppeteer page is open in the same process. Prints the CDP round-trip floor beside the per-input cost, because that floor is what makes this option lose on a slide and win on a deck. Structurally limited to paths that already run inside the page: withDom is synchronous and CDP is not. Needs CHROME_PATH. On-demand.
