/**
 * Know when a test's network log is complete: a signal, not a duration (HARD RULE #32).
 *
 * The network tests run a hostile subject (a CLI render, a sandboxed page) against a local listener and then assert
 * the listener saw NOTHING. They used to sleep 0.5 to 1.5 s first "for a late request to land", which is the F2 shape
 * in engineering/decisions/2026-11-06-flaky-tests.md: on a loaded runner a request can still be in a socket buffer
 * when the sleep ends, and an absence check passes on it.
 *
 * `trackConnections(server)` gives the listener a `drained()` that resolves once every connection a client ALREADY
 * made has been read to its end. It needs the client to be gone (a child process that exited, a browser that closed),
 * because a live client may hold a keep-alive socket open forever; call it after that. It works in two steps:
 *   1. It opens one connection of its own and waits for the listener to accept it. The kernel hands a listener its
 *      connections in the order they arrived, so once ours is accepted, every earlier one has been accepted too.
 *      This also covers a client that ran while this process was blocked (a `spawnSync`): its connections waited
 *      in the queue.
 *   2. It waits until every other accepted socket has closed. The client is gone, so each one ends; Node parses the
 *      bytes a socket carried, and so emits its `request` (or `upgrade`), before it emits the socket's `close`.
 * Our own connection sends no bytes, so it never reaches the listener's request log.
 *
 * `udpDrained(socket)` is the same for a UDP listener: a datagram of our own, sent to it now, is read after every
 * datagram already in its queue. Its handler must skip `isUdpSentinel(message)`.
 *
 * `openListener()` puts the pieces together: an HTTP + WebSocket listener and named UDP sockets that record what
 * reaches them, `until(test)` to wait for a hit the test EXPECTS (a control arm, or a witness), and `drained()` for
 * all of it. An absence check in a LIVE browser has no exited client to drain, so it runs a WITNESS: the same attempts
 * with no walls, against a second listener, started only AFTER the walled attempts have been made, with the walled
 * browser still open. Once the witness has heard every attempt, the walled run has had at least the time an attempt
 * needs to land; the test then closes its browsers and drains the walled listener. Never start the two side by side:
 * the witness can finish before the walled side has begun, and closing the browsers then kills a late leak before it
 * reaches the listener, a false zero. The witness bounds how long one attempt takes, not how long the walled side
 * waits before it attempts; a subject that holds its request back on purpose needs its own signal.
 */
const http = require('node:http');
const net = require('node:net');
const dgram = require('node:dgram');

const SENTINEL = Buffer.from('lattice-test-udp-sentinel');

/**
 * @param {import('node:net').Server} server  a listening TCP server (an `http.Server` included)
 * @returns {{ drained: (opts?: { timeout?: number }) => Promise<void> }}
 */
function trackConnections(server) {
  const open = new Set();
  const accepted = [];
  const listeners = [];
  const notify = () => {
    for (const fn of listeners.splice(0)) fn();
  };
  server.on('connection', (socket) => {
    open.add(socket);
    accepted.push(socket);
    socket.on('close', () => {
      open.delete(socket);
      notify();
    });
    notify();
  });
  const until = (test) =>
    new Promise((resolve) => {
      const check = () => (test() ? resolve() : listeners.push(check));
      check();
    });

  async function drained({ timeout = 30000 } = {}) {
    const { port, address } = server.address();
    let guard;
    const deadline = new Promise((_, reject) => {
      guard = setTimeout(() => reject(new Error(`the listener did not drain within ${timeout} ms: ${open.size} connection(s) still open (the client must be gone first)`)), timeout);
    });
    // Ours can only be a socket accepted after we connect. `accepted` keeps every socket the listener ever took, and
    // the OS reuses ephemeral ports, so a closed socket from an earlier client can carry the port ours is given; matched
    // from the start, it would end the wait before ours, and so before every connection queued ahead of ours, was taken.
    const from = accepted.length;
    const mine = net.connect(port, address);
    mine.on('error', () => {});
    try {
      await Promise.race([new Promise((resolve) => mine.once('connect', resolve)), deadline]);
      const { localPort, localAddress } = mine;
      let ours;
      const isOurs = (s) => s.remotePort === localPort && s.remoteAddress === localAddress;
      await Promise.race([until(() => (ours = accepted.slice(from).find(isOurs))), deadline]);
      mine.destroy();
      await Promise.race([until(() => open.size === 0 || (open.size === 1 && open.has(ours))), deadline]);
    } finally {
      mine.destroy();
      clearTimeout(guard);
    }
  }
  return { drained };
}

/** True for the datagram `udpDrained` sends: a listener's handler skips it. */
const isUdpSentinel = (message) => Buffer.isBuffer(message) && message.equals(SENTINEL);

/**
 * Resolve once every datagram already queued on `socket` has been read.
 * @param {import('node:dgram').Socket} socket  a bound UDP listener
 */
async function udpDrained(socket, { timeout = 30000 } = {}) {
  const { port, address } = socket.address();
  const sender = dgram.createSocket('udp4');
  let guard;
  try {
    await Promise.race([
      new Promise((resolve) => {
        const onMessage = (msg) => {
          if (!isUdpSentinel(msg)) return;
          socket.off('message', onMessage);
          resolve();
        };
        socket.on('message', onMessage);
        sender.send(SENTINEL, port, address);
      }),
      new Promise((_, reject) => {
        guard = setTimeout(() => reject(new Error(`the UDP listener on ${port} did not read its own sentinel within ${timeout} ms`)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(guard);
    sender.close();
  }
}

/**
 * An HTTP + WebSocket listener on a free loopback port, plus named UDP sockets, that record every request path (and
 * `udp[name]` for each datagram) in `hits`.
 * @param {{ udp?: Record<string, string>, handle?: (req, res, record: (hit: string) => void) => void }} [opts]
 *   `udp` maps a socket name to the hit its datagrams record; `handle` answers a request (default: record its path
 *   and answer `x`).
 */
async function openListener({ udp = {}, handle } = {}) {
  const hits = [];
  const waiters = new Set();
  const record = (hit) => {
    hits.push(hit);
    for (const w of [...waiters]) w();
  };
  const server = http.createServer((req, res) => {
    if (handle) return handle(req, res, record);
    record(req.url);
    res.end('x');
  });
  server.on('upgrade', (req, socket) => {
    record(req.url);
    socket.destroy();
  });
  const { drained: tcpDrained } = trackConnections(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const sockets = {};
  for (const [name, hit] of Object.entries(udp)) {
    const s = dgram.createSocket('udp4');
    s.on('message', (msg) => {
      if (!isUdpSentinel(msg)) record(hit);
    });
    await new Promise((resolve) => s.bind(0, '127.0.0.1', resolve));
    sockets[name] = s;
  }
  const P = server.address().port;
  return {
    P,
    H: `http://127.0.0.1:${P}`,
    hits,
    udpPort: (name) => sockets[name].address().port,
    reset: () => {
      hits.length = 0;
    },
    /** Resolve true once `test(hits)` holds, or false at `timeout`: the assertion that follows says what is missing. */
    until: (test, { timeout = 60000 } = {}) =>
      new Promise((resolve) => {
        let guard;
        const check = () => {
          if (!test(hits)) return;
          waiters.delete(check);
          clearTimeout(guard);
          resolve(true);
        };
        guard = setTimeout(() => {
          waiters.delete(check);
          resolve(false);
        }, timeout);
        waiters.add(check);
        check();
      }),
    /** Every connection and datagram already sent has been read. Call it once the clients are gone. */
    drained: async () => {
      await tcpDrained();
      for (const s of Object.values(sockets)) await udpDrained(s);
    },
    close: async () => {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
      for (const s of Object.values(sockets)) s.close();
    },
  };
}

module.exports = { trackConnections, udpDrained, isUdpSentinel, openListener };
