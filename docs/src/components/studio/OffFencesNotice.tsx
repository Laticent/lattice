import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { offFences, offFencesSentence } from '@/lib/off-fences';
import { deckPluginList, writeDeckPlugins } from '../../../../lib/plugins/deck-plugins.mjs';

/**
 * FENCES WHOSE PLUGIN IS OFF ship as source; say so before the export, not after (#2758). One notice,
 * reused by every Share panel whose export draws diagrams (Webpage, PDF, PowerPoint, LibreOffice, the
 * image set, the Marp bundle, print), so the wording and the action cannot drift between them.
 *
 * Shown only when the deck holds such a fence. The ACTION lists the plugins in the deck's `plugins:`
 * front matter, which is how the Plugins tab already turns one on: a deck's list adds to the host's
 * defaults (lib/plugins/host-grammar.mjs `admitPlugins`), so the next render and the next export draw
 * the fences, and the choice travels with the deck. Without `onWrite` (a host that cannot edit the
 * deck) the notice still says what will happen and offers no button.
 *
 * Re-read when the host changes its plugin defaults with the panel open, as the preview does. Every
 * name and title comes from the registry; this file names no plugin.
 */
export function OffFencesNotice({ source, onWrite }: { source: string; onWrite?: (label: string, updater: (s: string) => string) => void }) {
	const [defaultsTick, setDefaultsTick] = React.useState(0);
	React.useEffect(() => {
		const bump = () => setDefaultsTick((n) => n + 1);
		window.addEventListener('lattice:plugin-defaults', bump);
		return () => window.removeEventListener('lattice:plugin-defaults', bump);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: defaultsTick is the re-read signal, not an input.
	const off = React.useMemo(() => offFences(source), [source, defaultsTick]);
	if (!off) return null;
	const names = [...new Set(off.plugins.map((p) => p.name))];
	const titles = [...new Set(off.plugins.map((p) => p.title))];
	const turnOn = () =>
		onWrite?.(`Plugins → list ${names.join(', ')}`, (s) => {
			const now = deckPluginList(s);
			return writeDeckPlugins(s, [...now, ...names.filter((n) => !now.includes(n))]);
		});
	return (
		<div className="rounded-xl border border-border bg-background p-3.5" data-off-fences-notice="">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<span className="flex min-w-0 flex-1 items-start gap-2">
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
					<span className="min-w-0">
						<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Some fences will ship as source</span>
						<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{offFencesSentence(off)}.</span>
					</span>
				</span>
				{onWrite ? (
					<Button size="xs" variant="outline" className="shrink-0" aria-label={`Turn on ${titles.join(' and ')} for this deck`} onClick={turnOn}>
						Turn on
					</Button>
				) : null}
			</div>
		</div>
	);
}
