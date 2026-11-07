import { ChevronDown, Cloud, Cpu, KeyRound, Plug, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { modelDisplayName, voiceDisplayName } from '@/lib/model-name';
import { readVoiceSelection } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
import { openRouterKeyHint, providerKeyHint } from '@/lib/openrouter-key.js';
import { providerLabel } from '@/lib/provider-registry.js';
import { cn } from '@/lib/utils';
import { ApiKeyPanel } from './ApiKeyPanel';
import { switchProvider } from './api-key';
import type { ArchitectStatus, ChatReadiness, CloudProvider } from './architect';
import { ModelPicker } from './ModelPicker';
import { OnDeviceTier } from './OnDeviceTier';
import { type VoiceAvailability, voiceAvailability } from './read-aloud';
import { TtsSettings } from './TtsSettings';

// Workspace › AI, the model spine's three sections (engineering/decisions/2026-11-07-studio-model-spine.md):
//   Chat model       — the ONE chat selection, as a summary card; Change opens the chooser in place
//   Voice model      — the ONE voice selection, same shape, independent of chat
//   Providers & keys — one place for every key; a key saved here selects its provider's model
// Every card paints from the STORED selection on the first frame (useArchitectStatus seeds from
// storage synchronously; the voice card reads the voice record synchronously). Readiness changes
// in place as a fixed-width badge, so nothing below moves when the model module arrives.

/** The id the Providers & keys section carries, for the "Add a key" links to scroll to. */
export const PROVIDERS_SECTION_ID = 'ws-providers-keys';

/** Scroll the Providers & keys section into view (the needs-key cards' action). */
export function scrollToProviders() {
	document.getElementById(PROVIDERS_SECTION_ID)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

type State = ChatReadiness['state'] | 'ready';
/** The readiness badge — the same words everywhere a selection is shown. */
export function readinessLabel(state: State | undefined, progress?: number | null): string {
	switch (state) {
		case 'ready':
			return 'Active';
		case 'warming':
			return progress != null ? `Loading ${Math.round(progress * 100)}%` : 'Loading…';
		case 'needs-key':
			return 'Needs a key';
		case 'unavailable':
			return 'Not loaded';
		case 'off':
			return 'AI off';
		default:
			return 'Checking…';
	}
}

function SourceGlyph({ source, keyed }: { source: 'cloud' | 'device'; keyed: boolean }) {
	const Icon = source === 'device' ? Cpu : keyed ? KeyRound : Cloud;
	return (
		<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
			<Icon className="size-4" />
		</span>
	);
}

/**
 * One selection, as a card: glyph · name · meta · badge · Change. Fixed height, so a longer name
 * truncates instead of pushing the sections below.
 */
function SelectionCard({
	testId,
	source,
	keyed,
	name,
	meta,
	state,
	progress,
	alert,
	open,
}: {
	testId: string;
	source: 'cloud' | 'device';
	keyed: boolean;
	name: string;
	meta: string;
	state: State | undefined;
	progress?: number | null;
	/** A problem that stops the selection (a rejected key): replaces the meta line and the badge. */
	alert?: string | null;
	open: boolean;
}) {
	const blocked = !!alert || state === 'needs-key' || state === 'unavailable';
	return (
		<div data-testid={testId} className={cn('flex h-[68px] items-center gap-3 rounded-xl border px-3', blocked ? 'border-border' : 'border-[var(--accent)] bg-[var(--accent-soft)]')}>
			<SourceGlyph source={source} keyed={keyed} />
			<span className="min-w-0 flex-1">
				<span data-testid={`${testId}-name`} className="block truncate text-[13px] font-semibold text-[var(--text-heading)]">
					{name}
				</span>
				{alert ? (
					<span role="alert" className="block truncate text-[11px] text-[var(--fail)]">
						{alert}
					</span>
				) : (
					<span className="block truncate text-[11px] text-muted-foreground">{meta}</span>
				)}
			</span>
			{/* Fixed width: readiness changes IN PLACE. A missing key is actionable right here. */}
			{alert || state === 'needs-key' ? (
				<button
					type="button"
					data-testid={`${testId}-state`}
					data-state={state}
					onClick={scrollToProviders}
					className="w-[92px] shrink-0 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--fail)] underline-offset-2 hover:underline"
				>
					{alert ? 'Key rejected' : 'Add a key'}
				</button>
			) : (
				<span
					data-testid={`${testId}-state`}
					data-state={state ?? 'pending'}
					className={cn('w-[92px] shrink-0 text-right font-mono text-[10px] font-bold uppercase tracking-wider', blocked ? 'text-[var(--fail)]' : 'text-[var(--accent)]')}
				>
					{readinessLabel(state, progress)}
				</span>
			)}
			<CollapsibleTrigger asChild>
				<button type="button" aria-expanded={open} className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">
					Change
					<ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
				</button>
			</CollapsibleTrigger>
		</div>
	);
}

const KEYED: CloudProvider[] = ['openrouter', 'gemini', 'anthropic', 'openai'];
const hasKey = (p: CloudProvider) => !!(p === 'openrouter' ? openRouterKeyHint() : providerKeyHint(p));

/** The Chat model section: the global chat selection (owner decision 1). */
export function ChatModelSection({ status, cloudExtras }: { status: ArchitectStatus; cloudExtras?: React.ReactNode }) {
	const r = status.readiness;
	const source = r?.source ?? 'cloud';
	const [open, setOpen] = React.useState(false);
	// The chooser opens on the ACTIVE source; the Source switch only filters what is listed.
	const [view, setView] = React.useState<'cloud' | 'device'>(source);
	React.useEffect(() => {
		if (!open) setView(source);
	}, [open, source]);
	// Re-read on every status change (a key saved or removed announces db-model-changed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the refresh trigger
	const withKeys = React.useMemo(() => KEYED.filter(hasKey), [status]);
	const provider = r?.provider ?? 'openrouter';
	const name = modelDisplayName({ id: r?.model || status.modelId, name: source === 'cloud' ? status.modelName : null, provider });
	const meta =
		r?.state === 'needs-key'
			? 'Add a key or choose on-device'
			: source === 'device'
				? 'On this device · free and private'
				: provider === 'openrouter'
					? 'OpenRouter · your account'
					: `${providerLabel(provider)} · your own key`;
	const pickProvider = async (p: string) => {
		await switchProvider(p as CloudProvider);
		notify(`Chat now runs on ${providerLabel(p)}.`);
	};
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SelectionCard
				testId="chat-model-card"
				source={source}
				keyed={source === 'cloud' && provider !== 'openrouter'}
				name={name}
				meta={meta}
				state={r?.state}
				progress={r?.progress}
				alert={source === 'cloud' && status.openRouterKeyInvalid ? `${providerLabel(provider)} rejected the key (revoked or expired) — ${provider === 'openrouter' ? 'sign in again' : 'replace it'} below.` : null}
				open={open}
			/>
			<CollapsibleContent className="mt-3">
				<ToggleGroup
					type="single"
					value={view}
					onValueChange={(v) => v && setView(v as 'cloud' | 'device')}
					aria-label="Chat model source"
					className="mb-3 overflow-hidden rounded-md border border-border"
				>
					<ToggleGroupItem value="cloud" className="flex-1 gap-1.5 px-3 py-1 text-[12px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
						<Cloud className="size-3.5" /> Cloud
					</ToggleGroupItem>
					<ToggleGroupItem value="device" className="flex-1 gap-1.5 px-3 py-1 text-[12px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
						<Cpu className="size-3.5" /> On-device
					</ToggleGroupItem>
				</ToggleGroup>
				{view === 'cloud' ? (
					<div>
						{withKeys.length ? (
							<RadioGroup aria-label="Chat provider" value={source === 'cloud' ? provider : ''} onValueChange={pickProvider} className="mb-3 flex-wrap gap-1.5">
								{withKeys.map((p) => (
									<RadioGroupItem
										key={p}
										value={p}
										className="rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)] data-[state=checked]:text-[var(--text-heading)]"
									>
										{providerLabel(p)}
									</RadioGroupItem>
								))}
							</RadioGroup>
						) : null}
						{source === 'cloud' && status.openRouterReady ? <ModelPicker status={status} /> : null}
						{source === 'cloud' && status.openRouterReady ? cloudExtras : null}
						<button type="button" onClick={scrollToProviders} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
							<Plug className="size-3" /> Add a provider key…
						</button>
					</div>
				) : (
					<OnDeviceTier status={status} />
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

/** The voice selection as the card shows it, read synchronously from the stored record. */
function storedVoiceCard(): { source: 'cloud' | 'device'; provider: string; model: string; voice: string } {
	const s = readVoiceSelection();
	return { source: s.source, provider: s.provider, model: s.model, voice: s.voice };
}

/** The Voice model section: the global voice selection, independent of chat. `more` = narration prefs. */
export function VoiceModelSection({ more }: { more?: React.ReactNode }) {
	const [sel, setSel] = React.useState(storedVoiceCard);
	const [avail, setAvail] = React.useState<VoiceAvailability | null>(null);
	const [open, setOpen] = React.useState(false);
	const seq = React.useRef(0);
	React.useEffect(() => {
		let live = true;
		const sync = () => {
			setSel(storedVoiceCard());
			const mine = ++seq.current;
			voiceAvailability().then((a) => {
				if (live && mine === seq.current) setAvail(a);
			});
		};
		sync();
		window.addEventListener('db-voice-changed', sync);
		window.addEventListener('db-model-changed', sync);
		return () => {
			live = false;
			window.removeEventListener('db-voice-changed', sync);
			window.removeEventListener('db-model-changed', sync);
		};
	}, []);
	const r = avail?.readiness;
	const model = r?.model || sel.model;
	const voice = r?.voice || sel.voice;
	const name = sel.provider === 'kokoro' ? `Kokoro · ${voiceDisplayName(voice)}` : `${modelDisplayName({ id: model, provider: sel.provider })} · ${voiceDisplayName(voice)}`;
	const meta = r?.state === 'needs-key' ? 'Add a key or choose on-device' : sel.source === 'device' ? 'On this device · free and private' : `${providerLabel(sel.provider)} · ${sel.provider === 'openrouter' ? 'your account' : 'your own key'}`;
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SelectionCard testId="voice-model-card" source={sel.source} keyed={sel.provider === 'gemini'} name={name} meta={meta} state={r?.state} open={open} />
			<CollapsibleContent className="mt-3">
				<TtsSettings />
			</CollapsibleContent>
			{more ? (
				<Collapsible className="mt-3">
					<CollapsibleTrigger className="flex items-center gap-1 text-[12px] font-semibold text-[var(--accent)]">
						<ChevronDown className="size-3.5" /> More narration settings
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-2">{more}</CollapsibleContent>
				</Collapsible>
			) : null}
		</Collapsible>
	);
}

/** Providers & keys: every key in one place, plus OpenRouter's one-click sign-in. */
export function ProvidersSection({ status, onConnect, connecting }: { status: ArchitectStatus; onConnect: () => void; connecting: boolean }) {
	return (
		<div id={PROVIDERS_SECTION_ID} className="scroll-mt-4">
			{!hasKey('openrouter') || (status.openRouterKeyInvalid && (status.provider ?? 'openrouter') === 'openrouter') ? (
				<button
					type="button"
					onClick={onConnect}
					disabled={connecting}
					className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-[12.5px] font-semibold text-[var(--accent)] disabled:opacity-60"
				>
					<Sparkles className="size-3.5" />
					{connecting ? 'Opening OpenRouter…' : hasKey('openrouter') ? 'Reconnect OpenRouter' : 'Sign in with OpenRouter (one click)'}
				</button>
			) : null}
			<ApiKeyPanel status={status} />
		</div>
	);
}
