// The Node engine as `window.LatticePlayground`, for a jsdom test whose subject calls the
// Studio's engine — the import gate renders a component's sample slide before it reads what
// would load (library/gallery-gate.ts). The same `lib/engine` the Studio's bundle is built
// from, so the markup a test reads is the markup the Studio would read.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function installNodeEngine(): void {
	const { createEngine } = require('../../../lib/engine/index.js');
	const engine = createEngine();
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = {
		render: (source: string, theme: string) => engine.render(source, theme),
		referenceTargets: (markdown: string) => engine.referenceTargets(markdown),
		hasTheme: () => true,
		addThemes: () => {},
	};
}
