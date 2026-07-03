// The Drawing Board — semantic retrieval (pure, dependency-free, unit-tested).
//
// The cosine-similarity ranking the Architect uses to match free-text intent to
// an archetype/component when on-device embeddings are available. Kept pure and
// fs/DOM-free on purpose: the Node unit suite proves the ranking math with
// synthetic vectors, so the retrieval surface is verified without a real
// embedder (which needs the HuggingFace CDN + a browser — see
// engineering/decisions/2026-06-08-drawing-board-phase-2-build.md).
//
// The model layer (architect-model.js) supplies the vectors; this module never
// touches the network or the DOM. When embeddings are unavailable the caller
// falls back to lexical (fuse.js) ranking — identical UI either way.

export function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a) {
  return Math.sqrt(dot(a, a));
}

// Cosine similarity in [-1, 1]; 0 when either vector is degenerate (zero-length).
export function cosine(a, b) {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

// Rank item vectors against a query vector. Returns [{ index, score }] sorted by
// descending similarity. Stable for equal scores (preserves input order), so a
// grouped, author-curated list keeps its intent when nothing is more similar.
export function cosineRank(queryVec, itemVecs, { limit } = {}) {
  if (!queryVec || !itemVecs?.length) return [];
  const scored = itemVecs.map((vec, index) => ({ index, score: cosine(queryVec, vec) }));
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return typeof limit === 'number' ? scored.slice(0, limit) : scored;
}

// Mean-pool a list of token vectors into one sentence vector (the pooling the
// bge-small sentence embedder applies). Exposed so the model layer and the tests
// share one implementation. Returns a plain Array.
export function meanPool(tokenVecs) {
  if (!tokenVecs?.length) return [];
  const dim = tokenVecs[0].length;
  const out = new Array(dim).fill(0);
  for (const v of tokenVecs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= tokenVecs.length;
  return out;
}
