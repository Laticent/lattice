// The /segno playground's grammar box, off the main thread.
//
// Nothing the visitor types is executed: readGrammarSource (./segno-playground-grammar.ts) READS
// the box as data. The worker is here for a different reason — Segno's compiler and code
// generator are not linear in every grammar. A pasted `alt(...)` of 3,000 literals is 26 KB and
// took about 10 s to compile and 14 s to generate; on the main thread that froze the tab. In here
// it only blocks this worker: the page (docs/src/pages/segno.astro) keeps one request in flight,
// waits a fixed time for its answer, then terminates the worker, says the grammar took too long,
// and starts a fresh one. The reader's size cap answers the common blowups (a name reused until it
// doubles, a long literal reused everywhere) at once; this time limit answers every other one,
// including shapes nobody has found yet.
//
// The compiled parser stays in here, because a function cannot cross postMessage. The page sends
// `compile` with the code and the text, and `parse` with new text; every reply carries the
// request's `id`, so the page can drop an answer about a grammar a newer compile replaced.
import { alt, any, charRange, chars, compile, GrammarError, generate, lit, many, many1, node, noneOf, opt, ref, seq } from '@/lib/segno';
import { clipProblems, clipText, GrammarSourceError, readGrammarSource, treeTooBig } from './segno-playground-grammar';

const DSL = { alt, any, charRange, chars, lit, many, many1, node, noneOf, opt, ref, seq };

type Request = { id: number; kind: 'compile'; code: string; text: string } | { id: number; kind: 'parse'; text: string };

let parser: ReturnType<typeof compile> | null = null;

function parseText(text: string) {
  if (!parser) return null;
  const r = parser.parse(text);
  // The tree and the error are plain data; send only what the page draws.
  if (r.ok) return treeTooBig(r.node) ? { ok: true, tooBig: true } : { ok: true, node: r.node };
  return { ok: false, error: { at: r.error.at, expected: clipText(String(r.error.expected), 2000), found: r.error.found } };
}

// Every request gets a reply. A throw nobody caught would leave the page waiting out its time
// limit and then blaming a slow build for what was a crash (a numeric `start` is one: compile
// accepts it, parse throws), so the whole handler answers `broken` instead.
self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  try {
    answer(req);
  } catch (e) {
    // A failed compile leaves no parser; a failed parse keeps the grammar, so other text can be tried.
    if (req.kind === 'compile') parser = null;
    self.postMessage({ id: req.id, kind: 'broken', message: clipText((e as Error)?.message ?? String(e)) });
  }
};

function answer(req: Request) {
  if (req.kind === 'parse') {
    self.postMessage({ id: req.id, kind: 'parsed', parse: parseText(req.text) });
    return;
  }
  parser = null;
  let spec: unknown;
  try {
    spec = readGrammarSource(req.code, DSL);
  } catch (e) {
    const kind = e instanceof GrammarSourceError ? 'unreadable' : 'broken';
    self.postMessage({ id: req.id, kind, message: clipText((e as Error)?.message ?? String(e)) });
    return;
  }
  try {
    parser = compile(spec as Parameters<typeof compile>[0]);
  } catch (e) {
    if (e instanceof GrammarError) self.postMessage({ id: req.id, kind: 'refused', problems: clipProblems(e.problems) });
    else self.postMessage({ id: req.id, kind: 'broken', message: clipText((e as Error)?.message ?? String(e)) });
    return;
  }
  let generated = '';
  try { generated = clipText(generate(spec as Parameters<typeof generate>[0])); } catch {}
  self.postMessage({ id: req.id, kind: 'compiled', generated, parse: parseText(req.text) });
}

// The page starts its time limit only once this arrives, so a slow first load of the worker
// script is never mistaken for a grammar that is slow to build.
self.postMessage({ kind: 'ready' });
