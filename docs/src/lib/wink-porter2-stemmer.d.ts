// `wink-porter2-stemmer` ships no types (it is plain CommonJS, `main:
// src/wink-porter2-stemmer.js`), so declare the one function it exports rather
// than letting `intent-search.ts` import it as an implicit `any`.
//
// The upstream contract is narrow and stable: one word in, its Porter2 stem out.
// It expects a single lowercase token — it neither splits nor lowercases — which
// is why intent-search.ts tokenizes and lowercases before calling it.
declare module 'wink-porter2-stemmer' {
	export default function stem(word: string): string;
}
