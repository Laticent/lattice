// The /segno playground's grammar box, off the main thread.
//
// The visitor types JavaScript that builds a grammar, and the page runs it 150 ms after each
// keystroke. On the main thread a `for (;;) {}` froze the tab for good. Here it only blocks this
// worker: the page (docs/src/pages/segno.astro) waits a fixed time for an answer, and on silence
// it terminates the worker, says the code did not finish, and starts a fresh one.
//
// The compiled parser stays in here, because a function cannot cross postMessage. The page sends
// `compile` with the code and the text, and `parse` with new text; every reply carries the
// request's `id`, so the page can drop an answer that a newer request has overtaken.
import { alt, any, charRange, chars, compile, GrammarError, generate, lit, many, many1, node, noneOf, opt, ref, seq } from '@/lib/segno';

const DSL = { alt, any, charRange, chars, lit, many, many1, node, noneOf, opt, ref, seq };

type Request = { id: number; kind: 'compile'; code: string; text: string } | { id: number; kind: 'parse'; text: string };

let parser: ReturnType<typeof compile> | null = null;

function parseText(text: string) {
  if (!parser) return null;
  const r = parser.parse(text);
  // The tree and the error are plain data; send only what the page draws.
  return r.ok ? { ok: true, node: r.node } : { ok: false, error: { at: r.error.at, expected: r.error.expected, found: r.error.found } };
}

self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  if (req.kind === 'parse') {
    self.postMessage({ id: req.id, kind: 'parsed', parse: parseText(req.text) });
    return;
  }
  parser = null;
  let spec: unknown;
  try {
    spec = new Function(...Object.keys(DSL), `"use strict";\n${req.code}`)(...Object.values(DSL));
    if (!spec || typeof spec !== 'object' || !(spec as { rules?: unknown }).rules) {
      throw new Error('the grammar code must end with return { start, rules }');
    }
  } catch (e) {
    self.postMessage({ id: req.id, kind: 'broken', message: (e as Error)?.message ?? String(e) });
    return;
  }
  try {
    parser = compile(spec as Parameters<typeof compile>[0]);
  } catch (e) {
    if (e instanceof GrammarError) self.postMessage({ id: req.id, kind: 'refused', problems: e.problems });
    else self.postMessage({ id: req.id, kind: 'broken', message: (e as Error)?.message ?? String(e) });
    return;
  }
  let generated = '';
  try { generated = generate(spec as Parameters<typeof generate>[0]); } catch {}
  self.postMessage({ id: req.id, kind: 'compiled', generated, parse: parseText(req.text) });
};

// The page starts its time limit only once this arrives, so a slow first load of the worker
// script is never mistaken for a grammar that loops.
self.postMessage({ kind: 'ready' });
