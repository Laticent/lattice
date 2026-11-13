/**
 * A decode is a generator that yields between slices of work. The synchronous entry runs it to the end;
 * the asynchronous one hands the thread back to the event loop at every yield and stops when its
 * `AbortSignal` fires, so a long decode on a page or in a worker stays interruptible.
 */

type Scheduler = { yield?: () => Promise<void> };
const g = globalThis as { scheduler?: Scheduler; setImmediate?: (f: () => void) => unknown };
let channel: MessageChannel | null = null;
const waiting: (() => void)[] = [];

/**
 * Give the event loop a turn: a macrotask, so pending input, timers and abort events run first. Not
 * `setTimeout(0)`: browsers clamp nested timeouts to 4 ms, which added a fifth to a 12 MP decode.
 * `scheduler.yield` where it exists, `setImmediate` in Node, a MessageChannel elsewhere.
 */
export function yieldToEventLoop(): Promise<void> {
  if (typeof g.scheduler?.yield === 'function') return g.scheduler.yield();
  if (typeof g.setImmediate === 'function') {
    const immediate = g.setImmediate;
    return new Promise((resolve) => immediate(resolve));
  }
  if (typeof MessageChannel === 'function') {
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => waiting.shift()?.();
    }
    const port = channel.port2;
    return new Promise((resolve) => {
      waiting.push(resolve);
      port.postMessage(0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function runStepsSync<T>(steps: Generator<void, T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Run `make()`'s steps, yielding between them; an aborted `signal` rejects with its reason. */
export async function runSteps<T>(make: () => Generator<void, T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const steps = make();
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await yieldToEventLoop();
    if (signal?.aborted) {
      steps.return(undefined as T);
      signal.throwIfAborted();
    }
  }
}
