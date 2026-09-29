/**
 * One speed cell, in its own process (speed.mjs spawns it). Prints one JSON line.
 *
 *   node speed-cell.mjs cold <candidate>
 *   node speed-cell.mjs throughput <candidate> <target>
 *   node speed-cell.mjs scaling <candidate> <target>
 */

const [mode, name, target] = process.argv.slice(2);
const say = (o) => { console.log(JSON.stringify(o)); process.exit(0); };

// COLD imports nothing before its clock starts. Every other module here pulls in
// reference.mjs, which loads the shipped kernels — so a static import at the top made the
// incumbent's cold load read ~0 ms while each challenger paid for the same kernels again
// through shared.mjs. Now both sides load the kernels inside the timed region.
if (mode === 'cold') {
  const t = performance.now();
  const m = await import(name === 'incumbent' ? './reference.mjs' : `./impl/${name}.mjs`);
  say({ ms: performance.now() - t, buildMs: m.buildMs ?? 0 });
}

// SHIPPED cold: import the precompiled form (precompile.mjs wrote it, outside the clock).
if (mode === 'coldShipped') {
  const path = process.argv[4];
  const t = performance.now();
  await import(new URL(path, `file://${process.cwd()}/`).href);
  say({ ms: performance.now() - t });
}

const { loadCandidates } = await import('./candidates.mjs');
const { inputsFor, scaling } = await import('./corpus.mjs');
const { positive, reference } = await import('./reference.mjs');

const [c] = await loadCandidates([name]);
const fn = c?.impl[target];
if (!fn) say({ missing: true });

const safe = (s) => { try { return fn(s); } catch { return undefined; } };

if (mode === 'throughput') {
  const { real } = inputsFor(target);
  const pos = real.filter((s) => positive(reference[target](s)));
  // Rounds stop at a time budget, so a slow candidate still reports a number rather than
  // blowing the cell's deadline (Nearley on gantt is ~0.6 ms an input, 4.6k inputs a round).
  const time = (inputs, rounds) => {
    const t0 = performance.now();
    for (const s of inputs) safe(s); // warm: the render path runs warm after the first slide
    const per = [];
    for (let r = 0; r < rounds && (r < 1 || performance.now() - t0 < 5000); r++) {
      const t = process.hrtime.bigint();
      for (const s of inputs) safe(s);
      per.push(Number(process.hrtime.bigint() - t) / inputs.length);
    }
    per.sort((a, b) => a - b);
    return per[Math.floor(per.length / 2)];
  };
  say({ allNs: time(real, 7), posNs: pos.length ? time(pos, 15) : null, n: real.length, nPos: pos.length });
}

if (mode === 'scaling') {
  const SIZES = [2000, 8000, 32000];
  const shapes = [];
  const only = process.argv[5];
  for (const [shape] of scaling(target, 1000)) {
    if (only && shape !== only) continue;
    const ms = [];
    let stop = false;
    let threw = null;
    for (const n of SIZES) {
      if (stop) { ms.push(null); continue; }
      const input = scaling(target, n).find(([s]) => s === shape)[1];
      let best = Infinity;
      for (let r = 0; r < 3; r++) {
        const t = performance.now();
        // A throw (stack overflow on deep recursion) is fast and WRONG; record it, never time it.
        try { fn(input); } catch (e) { threw = threw || String(e.message || e).slice(0, 60); }
        best = Math.min(best, performance.now() - t);
        if (best > 500) break;
      }
      ms.push(best);
      // 4x the input at a quadratic rate is 16x the time: past half a second the next rung
      // would blow the deadline, so the ladder stops and the table says DNF.
      if (best > 500) stop = true;
    }
    const ratio = ms[2] != null && ms[1] ? ms[2] / ms[1] : null;
    shapes.push({ shape, ms, ratio, threw });
  }
  // The shape that costs most at the largest size it finished.
  const cost = (s) => (s.ms[2] ?? (s.ms[1] != null ? 1e9 : 1e12));
  const worst = shapes.slice().sort((a, b) => cost(b) - cost(a))[0];
  say({ shapes, worst });
}
