studio: +256
playground: +256
home: +256
components: +256
The state chart's measured lines (#3131): Trama's `textLines`, in the preview runtime every engine route loads, now reads a word in pieces that end at a hyphen, so a name the browser broke after its hyphen (`Counter-` over `signature`) is painted on the lines it was measured on instead of one line wider than its tile. Measured on the built docs as about 0.1KB over the engine routes' soft target of 633.0KB (63.2KB under the ceiling); the declaration rounds that up to 256 bytes a route. The same PR took 218KB off every engine route.
