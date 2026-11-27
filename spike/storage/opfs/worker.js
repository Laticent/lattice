self.onmessage = async (e) => {
  const { phase, token } = e.data; const r = {};
  try {
    const root = await navigator.storage.getDirectory();
    if (phase === 'write') {
      try {
        const fh = await root.getFileHandle('worker-sync.txt', { create: true });
        r.hasSyncAccessHandle = typeof fh.createSyncAccessHandle === 'function';
        const h = await fh.createSyncAccessHandle();
        const bytes = new TextEncoder().encode('worker-sync:' + token);
        h.truncate(0); h.write(bytes, { at: 0 }); h.flush(); h.close();
        r.sync = 'ok';
      } catch (err) { r.sync = 'ERR ' + err.name + ': ' + err.message; }
      try {
        const fh = await root.getFileHandle('worker-writable.txt', { create: true });
        r.workerHasCreateWritable = typeof fh.createWritable === 'function';
        const w = await fh.createWritable(); await w.write('worker-writable:' + token); await w.close();
        r.writable = 'ok';
      } catch (err) { r.writable = 'ERR ' + err.name + ': ' + err.message; }
    } else {
      try {
        const h = await (await root.getFileHandle('worker-sync.txt')).createSyncAccessHandle();
        const buf = new Uint8Array(h.getSize()); h.read(buf, { at: 0 }); h.close();
        r.syncRead = new TextDecoder().decode(buf);
      } catch (err) { r.syncRead = 'ERR ' + err.name + ': ' + err.message; }
    }
  } catch (err) { r.fatal = err.name + ': ' + err.message; }
  self.postMessage(r);
};
