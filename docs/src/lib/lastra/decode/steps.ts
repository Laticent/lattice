/**
 * A decode is a generator that yields between slices of work. The synchronous entry runs it to the end;
 * the asynchronous one hands the thread back to the event loop at every yield and stops when its
 * `AbortSignal` fires, so a long decode on a page or in a worker stays interruptible.
 *
 * Typed here without the DOM or Node: lastra compiles against ES2022 alone (docs/tsconfig.lastra.json),
 * and finds the scheduling primitives on `globalThis` at run time.
 */

/** The part of an `AbortSignal` a decode reads. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

interface PortLike {
  onmessage: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

interface SchedulingGlobals {
  scheduler?: { yield?: () => Promise<void> };
  setImmediate?: (callback: () => void) => unknown;
  MessageChannel?: new () => { port1: PortLike; port2: PortLike };
  setTimeout?: (callback: () => void, ms: number) => unknown;
}

const decodeScheduling = globalThis as unknown as SchedulingGlobals;

/**
 * Give the event loop a turn: a macrotask, so pending input, timers and abort events run first. Not
 * `setTimeout(0)` first: browsers clamp nested timeouts to 4 ms, which added a fifth to a 12 MP decode.
 * `scheduler.yield` where it exists, `setImmediate` in Node, a MessageChannel opened and closed per turn
 * elsewhere (an open port would keep some runtimes from exiting), `setTimeout` last.
 */
export function yieldToEventLoop(): Promise<void> {
  const g = decodeScheduling;
  if (typeof g.scheduler?.yield === 'function') return g.scheduler.yield();
  if (typeof g.setImmediate === 'function') {
    const immediate = g.setImmediate;
    return new Promise((resolve) => immediate(resolve));
  }
  if (typeof g.MessageChannel === 'function') {
    const { port1, port2 } = new g.MessageChannel();
    return new Promise((resolve) => {
      port1.onmessage = () => {
        port1.close();
        port2.close();
        resolve();
      };
      port2.postMessage(0);
    });
  }
  const timeout = g.setTimeout;
  return new Promise((resolve) => (timeout ? timeout(resolve, 0) : resolve()));
}

export function runStepsSync<T>(steps: Generator<void, T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

function abortReason(signal: AbortSignalLike): unknown {
  return signal.reason ?? new Error('lastra: the decode was aborted');
}

/** Run `make()`'s steps, yielding between them; an aborted `signal` rejects with its reason. */
export async function runSteps<T>(make: () => Generator<void, T>, signal?: AbortSignalLike): Promise<T> {
  if (signal?.aborted) throw abortReason(signal);
  const steps = make();
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await yieldToEventLoop();
    if (signal?.aborted) {
      steps.return(undefined as T);
      throw abortReason(signal);
    }
  }
}
