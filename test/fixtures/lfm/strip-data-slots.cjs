// Preloaded with `node -r` by test/unit/spec/lfm-conformance-data-slots.test.js: it removes the
// data-slot declarations (`sits`, and with STRIP=rowDepth only `rowDepth`) from the generated Segno
// slot catalog before the engine reads it, so the test can prove the data-slots case fails when
// the rule it pins (LFM 1.1 §3.6 rule 4) is gone from the engine.
const Module = require('node:module');
const load = Module._load;
Module._load = function patched(request, ...rest) {
  const real = load.call(this, request, ...rest);
  if (!/segno-slots\.generated/.test(request)) return real;
  const out = {};
  for (const [component, slots] of Object.entries(real)) {
    out[component] = {};
    for (const [name, spec] of Object.entries(slots)) {
      const { sits, rowDepth, ...restSpec } = spec;
      out[component][name] = process.env.STRIP === 'rowDepth' ? { sits, ...restSpec } : restSpec;
    }
  }
  return out;
};
