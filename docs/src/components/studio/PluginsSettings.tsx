import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useSettingsHit, useSettingsQuery } from '@/components/ui/settings-view';
import { isPluginApproved, studioPlugins } from '@/lib/code-packages/door';
import { cn } from '@/lib/utils';
import { deckPluginList, writeDeckPlugins } from '../../../../lib/plugins/deck-plugins.mjs';
import { PLUGIN_GRAMMAR } from '../../../../lib/plugins/grammar.generated.mjs';
import { admitPlugins } from '../../../../lib/plugins/host-grammar.mjs';

/**
 * THE PLUGINS TAB — the deck settings' view of what loads a plugin, and the one place an author
 * writes the deck's `plugins:` import list (engineering/decisions/2026-09-27-plugin-system.md §9
 * decision 6, owner 2026-10-05).
 *
 * Every plugin has one row: its name, the syntax it reads, and WHY it is on for this deck — the
 * routes `admitPlugins` reports (the default set, the deck's own list, a slide class that requires
 * it, a plugin that requires it). The checkbox is the LIST: it adds or removes the plugin's name
 * in the deck's front matter, so the choice travels with the deck and every export reproduces it.
 * Listing never turns a plugin on or off by itself here — every shipped plugin is on by default —
 * so the control is a checkbox with its own visible words ("In this deck's list"), never a switch
 * beside the plugin's name: a switch reads as the plugin's on/off state, and an unchecked switch
 * next to "On" said two things at once (HARD RULE #25 inversion lens, E0). A name in the list that no plugin has gets a row of its own with a Remove action, the
 * same finding `lint:deck` reports as `unknown-plugin`.
 *
 * An EMBEDDED plugin (the pills plugin, 2026-10-17-pills-plugin.md § 4.5) has no row: it is always on and nothing here
 * can list or unlist it, and a row that offered the list checkbox would promise a control that does nothing. One quiet
 * line under the rows names them instead.
 *
 * Every name, title and syntax hint comes from the registry; this file names no plugin.
 */

type Reason = { kind: 'embedded' | 'default' | 'always' | 'listed' | 'component' | 'required'; component?: string; by?: string };
type GrammarEntry = (typeof PLUGIN_GRAMMAR)[number];
const SWITCHABLE = PLUGIN_GRAMMAR.filter((g) => !g.alwaysOn && !g.embedded);

/** The syntax a plugin reads, as an author types it: its fences, then its syntax triggers. */
export function pluginSyntaxHint(g: GrammarEntry): string[] {
	const fences = Object.keys(g.fences || {}).map((f) => `\`\`\`${f}`);
	const triggers = Object.values(g.syntax || {}).flatMap((r: { kind: string; triggers: readonly string[] }) =>
		r.triggers.map((t) => (r.kind === 'block' ? `${t}${t}…${t}${t}` : `${t}…${t}`)),
	);
	return [...new Set([...triggers, ...fences])];
}

/** One reason, in words. */
export function reasonLabel(r: Reason, titleOf: (name: string) => string): string {
	if (r.kind === 'embedded') return 'Always on';
	if (r.kind === 'default') return 'On by default';
	if (r.kind === 'always') return 'Always on';
	if (r.kind === 'listed') return 'Listed in this deck';
	if (r.kind === 'component') return `Needed by ${r.component} slides`;
	return `Needed by ${titleOf(r.by ?? '')}`;
}

/** A plugin that came from a zip (plugin-library.ts): the Library holds it in this browser only. */
export type InstalledPlugin = { id: string; name: string; fence: string; title: string; description: string; /** Its inline kinds (`@kind{…}`, 2026-10-14-plugin-inline-door.md). */ kinds?: { name: string }[] };

export function PluginsSettings({ source, onWrite, installed = [], stamp = '', onRemove }: { source: string; onWrite: (label: string, updater: (s: string) => string) => void; installed?: InstalledPlugin[]; stamp?: string; onRemove?: (id: string) => void }) {
	// A name in the list that an installed zip plugin owns is not unknown (`external`).
	const admission = React.useMemo(() => admitPlugins(source, { explain: true, external: installed.map((p) => p.name) }), [source, installed]);
	const unknown = admission.unknown;
	const listed = React.useMemo(() => deckPluginList(source), [source]);
	const active = React.useMemo(() => new Set((admission.active as GrammarEntry[]).map((g) => g.name)), [admission]);
	const titleOf = React.useCallback((name: string) => PLUGIN_GRAMMAR.find((g) => g.name === name)?.title ?? name, []);
	const setListed = (name: string, on: boolean) =>
		onWrite(`Plugins → ${on ? 'list' : 'unlist'} ${name}`, (s) => {
			const now = deckPluginList(s);
			return writeDeckPlugins(s, on ? [...now, name] : now.filter((n: string) => n !== name));
		});
	const rows = React.useMemo(() => PLUGIN_GRAMMAR.filter((g) => !g.embedded), []);
	const embedded = React.useMemo(() => PLUGIN_GRAMMAR.filter((g) => g.embedded), []);
	return (
		<div className="space-y-0" data-plugins-settings="">
			{/* An always-on or embedded plugin has no switch and no list entry, so it has no row (embedded ones get one line below). */}
			{SWITCHABLE.map((g, i) => (
				<PluginRow
					key={g.name}
					grammar={g}
					on={active.has(g.name)}
					listed={listed.includes(g.name)}
					reasons={(admission as { reasons?: Record<string, Reason[]> }).reasons?.[g.name] ?? []}
					titleOf={titleOf}
					onListed={(on) => setListed(g.name, on)}
					last={i === SWITCHABLE.length - 1 && !unknown.length && !installed.length}
				/>
			))}
			{installed.map((p, i) => (
				<InstalledRow key={p.id} plugin={p} listed={listed.includes(p.name)} stamp={stamp} last={i === installed.length - 1 && !unknown.length} onListed={(on) => setListed(p.name, on)} onRemove={() => onRemove?.(p.id)} />
			))}
			{unknown.map(({ name }: { name: string }, i: number) => (
				<UnknownRow key={name} name={name} last={i === unknown.length - 1} onRemove={() => setListed(name, false)} />
			))}
			{embedded.length > 0 && (
				<p data-plugins-embedded="" className="border-t border-border pt-2.5 text-[11px] leading-snug text-muted-foreground">
					Always on: {embedded.map((g) => g.title).join(', ')}. Part of how Lattice draws every slide, so there is nothing to list.
				</p>
			)}
		</div>
	);
}

function PluginRow({ grammar: g, on, listed, reasons, titleOf, onListed, last }: { grammar: GrammarEntry; on: boolean; listed: boolean; reasons: Reason[]; titleOf: (n: string) => string; onListed: (on: boolean) => void; last: boolean }) {
	const hint = pluginSyntaxHint(g);
	const hit = useSettingsHit(g.title, g.name, hint.join(' '));
	const id = React.useId();
	if (!hit) return null;
	return (
		<div {...hit} data-plugin-row={g.name} className={cn('flex min-w-0 py-2.5', !last && 'border-b border-border')}>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="text-[12.5px] font-semibold text-foreground">{g.title}</span>
					<span className={cn('text-[11px] font-semibold', on ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{on ? 'On' : 'Off'}</span>
				</div>
				<div className="mt-0.5 flex min-w-0 flex-wrap gap-1">
					{hint.map((h) => (
						<code key={h} className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-muted-foreground">{h}</code>
					))}
				</div>
				<p className="mt-1 text-[11px] leading-snug text-muted-foreground">{reasons.length ? reasons.map((r) => reasonLabel(r, titleOf)).join(' · ') : 'Not loaded for this deck'}</p>
				<div className="mt-1.5 flex items-center gap-1.5">
					<Checkbox id={id} checked={listed} onCheckedChange={(v) => onListed(v === true)} aria-label={`List ${g.title} in this deck's plugins`} />
					<label htmlFor={id} className="cursor-pointer text-[11.5px] text-foreground">
						In this deck's <code className="font-mono text-[10.5px]">plugins:</code> list
					</label>
				</div>
			</div>
		</div>
	);
}

/** One zip plugin: what it is, whether this browser has approved its code, the deck's list, and Remove. */
function InstalledRow({ plugin: p, listed, stamp, last, onListed, onRemove }: { plugin: InstalledPlugin; listed: boolean; stamp: string; last: boolean; onListed: (on: boolean) => void; onRemove: () => void }) {
	// What it draws, each as the author writes it: its fence (if it has one) and its `@kind{…}` spans.
	const draws = [...(p.fence ? [`\`\`\`${p.fence}`] : []), ...(p.kinds ?? []).map((k) => `@${k.name}{…}`)];
	const hit = useSettingsHit(p.title, p.name, ...draws);
	const id = React.useId();
	// biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` is the signal that an approval changed.
	const approved = React.useMemo(() => {
		const known = studioPlugins().get(p.name);
		return !!known && isPluginApproved(known);
	}, [p.name, stamp]);
	if (!hit) return null;
	return (
		<div {...hit} data-plugin-installed={p.name} className={cn('flex min-w-0 py-2.5', !last && 'border-b border-border')}>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="text-[12.5px] font-semibold text-foreground">{p.title}</span>
					<span className="text-[11px] font-semibold text-muted-foreground">From a zip</span>
					<span className={cn('text-[11px] font-semibold', approved ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{approved ? 'Approved in this browser' : 'Not approved'}</span>
				</div>
				<div className="mt-0.5 flex min-w-0 flex-wrap gap-1">
					{draws.map((d) => (
						<code key={d} className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-muted-foreground">
							{d}
						</code>
					))}
				</div>
				<p className="mt-1 text-[11px] leading-snug text-muted-foreground">{p.description || `Draws its ${p.fence && p.kinds?.length ? 'fence and spans' : p.fence ? 'fence' : 'spans'} in a sandbox once you approve its code. It lives in this browser only: never in a deck, a project or a backup.`}</p>
				<div className="mt-1.5 flex items-center gap-3">
					<span className="flex items-center gap-1.5">
						<Checkbox id={id} checked={listed} onCheckedChange={(v) => onListed(v === true)} aria-label={`List ${p.title} in this deck's plugins`} />
						<label htmlFor={id} className="cursor-pointer text-[11.5px] text-foreground">
							In this deck's <code className="font-mono text-[10.5px]">plugins:</code> list
						</label>
					</span>
					<button type="button" onClick={onRemove} className="ml-auto shrink-0 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold hover:bg-muted">
						Remove
					</button>
				</div>
			</div>
		</div>
	);
}

function UnknownRow({ name, last, onRemove }: { name: string; last: boolean; onRemove: () => void }) {
	const query = useSettingsQuery();
	const hit = useSettingsHit(name, 'unknown plugin');
	if (query && !hit) return null;
	return (
		<div {...(hit ?? {})} data-plugin-unknown={name} className={cn('flex min-w-0 items-center gap-3 py-2.5', !last && 'border-b border-border')}>
			<p className="min-w-0 flex-1 text-[11px] leading-snug" style={{ color: 'var(--warn, #9a6a00)' }}>
				No plugin is named <code className="font-mono">{name}</code>; this deck lists it, and nothing loads.
			</p>
			<button type="button" onClick={onRemove} className="shrink-0 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold hover:bg-muted">
				Remove
			</button>
		</div>
	);
}
