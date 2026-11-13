/**
 * Preloaded into the CLI (`node -r`) by chart-text-venue-regressions.test.js: pins the venue's chart-text factor to 1,
 * so the render is the drawing the engine made before chart text followed the venue. Test-only; nothing in lib/ reads it.
 */
const Module = require('module');

const load = Module._load;
Module._load = function patched(request, ...rest) {
  const mod = load.call(this, request, ...rest);
  if (/chart-text-venue(\.js)?$/.test(request) && typeof mod.chartTextScale === 'function') {
    return { ...mod, chartTextScale: () => 1 };
  }
  return mod;
};
