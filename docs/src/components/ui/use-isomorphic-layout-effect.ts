import * as React from 'react';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * Some of these components mount through a `client:load` island, so the module DOES run
 * under Astro's server render, where React logs a warning for every `useLayoutEffect` and
 * runs none of them. Anything that must read layout BEFORE the browser paints — a restored
 * split ratio, a measured overflow — needs the layout variant on the client and is a no-op
 * on the server either way, so this is the standard swap rather than a behavior choice.
 */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
