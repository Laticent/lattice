// The browser stand-in for `path`: the woff2 codec's emscripten glue requires it only on its
// Node branch, which never runs in a page.
export const dirname = () => '';
export const normalize = (p) => p;
export default { dirname, normalize };
