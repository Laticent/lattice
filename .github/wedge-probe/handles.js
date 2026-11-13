// Preloaded into every node process of an `npm ci` (NODE_OPTIONS=--require). On SIGUSR2 it writes what keeps this
// process alive. A signal listener does not hold the event loop open.
const fs = require('node:fs');
const out = process.env.WEDGE_DUMP_DIR || '/tmp';
process.on('SIGUSR2', () => {
  const lines = [`pid ${process.pid} ppid ${process.ppid} argv ${process.argv.join(' ')}`, `uptime ${process.uptime().toFixed(1)}s`];
  try { lines.push('resources: ' + JSON.stringify(process.getActiveResourcesInfo())); } catch (e) { lines.push('resources err ' + e); }
  for (const h of process._getActiveHandles()) {
    const name = h?.constructor?.name;
    let d = '';
    try {
      if (h.remoteAddress || h.localPort) d = ` ${h.localAddress}:${h.localPort} -> ${h.remoteAddress}:${h.remotePort} destroyed=${h.destroyed} pending=${h.pending}`;
      if (name === 'ChildProcess') d = ` child pid ${h.pid} spawnargs ${JSON.stringify(h.spawnargs).slice(0, 300)}`;
      if (h._idleTimeout !== undefined) d = ` timer ${h._idleTimeout}ms`;
      if (name === 'WriteStream' || name === 'ReadStream') d = ` fd ${h.fd} path ${h.path}`;
    } catch {}
    lines.push(`handle ${name}${d}`);
  }
  for (const r of process._getActiveRequests()) lines.push(`request ${r?.constructor?.name}`);
  fs.writeFileSync(`${out}/handles-${process.pid}.txt`, lines.join('\n') + '\n');
});
