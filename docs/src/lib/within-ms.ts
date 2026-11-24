// A bounded wait for a preview's own optional steps (the splitter chunk, the measured-split chunk).
// The preview renders without the step rather than wait for good: a lazy load that never settles
// (a stalled fetch, a service worker that never answers) must not hold the first render (#2988).
// Resolves to the promise's value, or `undefined` once `ms` pass; a rejection still rejects.

/** How long a preview waits for an optional chunk before it renders without it. */
export const LAZY_LOAD_MS = 8000;

export function withinMs<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<undefined>((resolve) => {
		timer = setTimeout(() => resolve(undefined), ms);
	});
	return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
