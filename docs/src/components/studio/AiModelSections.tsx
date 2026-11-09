import { ChevronDown, Cloud, Cpu, KeyRound, Plug } from 'lucide-react';
import * as React from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { modelDisplayName, voiceDisplayName } from '@/lib/model-name';
import { isRetired } from '@/lib/model-retired.js';
import { readImageSelection, readVoiceSelection, selectImage } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
import { openRouterKeyActivating, openRouterKeyHint, providerKeyHint, providerKeyState } from '@/lib/openrouter-key.js';
import { providerLabel } from '@/lib/provider-registry.js';
import { cn } from '@/lib/utils';
import { ApiKeyPanel } from './ApiKeyPanel';
import { switchProvider } from './api-key';
import { type ArchitectStatus, type ChatReadiness, type CloudProvider, listRouteModels } from './architect';
import { IMAGE_LOOKS, type ImageLook, lookTokens } from './image-look';
import { ModelList, ModelPicker, useModelCatalog } from './ModelPicker';
import { OnDeviceTier } from './OnDeviceTier';
import { WorkspaceUsedBy } from './panel-shells';
import { type VoiceAvailability, voiceAvailability } from './read-aloud';
import { loadSettings, saveSettings } from './studio-store';
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
			return 'Ready';
		case 'warming':
			return progress != null ? `Loading ${Math.round(progress * 100)}%` : 'Loading…';
		case 'needs-key':
			return 'Needs a key';
		case 'unset':
			return 'Not set';
		case 'retired':
			return 'Model retired';
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
	alertBadge,
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
	/** The badge for an alert that a key cannot fix (a retired model): shown as-is, not as "Key rejected". */
	alertBadge?: string;
	open: boolean;
}) {
	const blocked = !!alert || state === 'needs-key' || state === 'unavailable' || state === 'retired';
	// One grid, two arrangements, chosen by the CARD's width (a container query, so a narrow
	// Workspace sheet on a wide screen behaves like a phone):
	//   wide   glyph | name     | badge | Change        narrow   glyph | name ········· | ⌄
	//          glyph | meta     | badge | Change                 glyph | badge · meta   | ⌄
	// On a phone the badge moves under the name instead of squeezing it, and Change becomes an
	// icon. The badge keeps a fixed width in both, and the card a fixed height, so readiness
	// changes in place and nothing moves (CLS 0).
	const badgeClass = 'w-[88px] shrink-0 self-center text-left font-mono text-[10px] font-bold uppercase tracking-wider [grid-area:b] @[26rem]:w-[92px]';
	return (
		<div className="@container">
			<div
				data-testid={testId}
				className={cn(
					'grid h-[68px] grid-cols-[30px_auto_minmax(0,1fr)_auto] content-center items-center gap-x-3 gap-y-0.5 rounded-xl border px-3',
					"[grid-template-areas:'g_n_n_c''g_b_m_c'] @[26rem]:grid-cols-[30px_minmax(0,1fr)_auto_auto] @[26rem]:[grid-template-areas:'g_n_b_c''g_m_b_c']",
					blocked ? 'border-border' : 'border-[var(--accent)] bg-[var(--accent-soft)]',
				)}
			>
				<span className="[grid-area:g]">
					<SourceGlyph source={source} keyed={keyed} />
				</span>
				<span data-testid={`${testId}-name`} className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-heading)] [grid-area:n]">
					{name}
				</span>
				{alert ? (
					<span role="alert" className="min-w-0 truncate text-[11px] text-[var(--fail)] [grid-area:m]">
						{alert}
					</span>
				) : (
					<span className="min-w-0 truncate text-[11px] text-muted-foreground [grid-area:m]">{meta}</span>
				)}
				{/* Readiness changes IN PLACE. A missing key is actionable right here. */}
				{alert && alertBadge ? (
					<span data-testid={`${testId}-state`} data-state="model-gone" className={cn(badgeClass, 'text-[var(--fail)]')}>
						{alertBadge}
					</span>
				) : alert || state === 'needs-key' ? (
					<button type="button" data-testid={`${testId}-state`} data-state={state} onClick={scrollToProviders} className={cn(badgeClass, 'text-[var(--fail)] underline-offset-2 hover:underline')}>
						{alert ? 'Key rejected' : 'Add a key'}
					</button>
				) : (
					<span data-testid={`${testId}-state`} data-state={state ?? 'pending'} className={cn(badgeClass, blocked ? 'text-[var(--fail)]' : 'text-[var(--accent)]')}>
						{readinessLabel(state, progress)}
					</span>
				)}
				<CollapsibleTrigger asChild>
					<button
						type="button"
						aria-expanded={open}
						className="flex shrink-0 items-center gap-1 self-center rounded-md border border-border bg-background px-1.5 py-1 text-[12px] font-semibold text-[var(--accent)] [grid-area:c] @[26rem]:px-2.5"
					>
						<span className="sr-only @[26rem]:not-sr-only">Change</span>
						<ChevronDown aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
					</button>
				</CollapsibleTrigger>
			</div>
		</div>
	);
}

/** The meta line for a card on `p`, or the activation note while OpenRouter is still activating a
 *  key a sign-in just minted (it can refuse it for a minute or two; owner report, 2026-11-09). */
function routeMeta(p: string, meta: string): string {
	return p === 'openrouter' && openRouterKeyActivating() ? 'OpenRouter is activating the key, a minute or two after signing in' : meta;
}

/** The sentence for a selection whose route's key the provider refused, or null. Every card on that
 *  route says it, not only the chat card (owner report, 2026-11-08). */
function rejectedAlert(p: string): string | null {
	if (!['openrouter', 'gemini', 'anthropic', 'openai'].includes(p) || providerKeyState(p) !== 'rejected') return null;
	return `${providerLabel(p)} rejected the key (revoked or expired) — ${p === 'openrouter' ? 'sign in again' : 'replace it'} below.`;
}

const KEYED: CloudProvider[] = ['openrouter', 'gemini', 'anthropic', 'openai'];
const hasKey = (p: CloudProvider) => !!(p === 'openrouter' ? openRouterKeyHint() : providerKeyHint(p));

/** The Chat model section: the global chat selection (owner decision 1). */
export function ChatModelSection({ status, usedBy }: { status: ArchitectStatus; usedBy?: string }) {
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
		r?.state === 'unset'
			? 'Connect a provider or choose on-device'
			: r?.state === 'retired'
			? 'Retired with no newer version: choose another model'
			: r?.state === 'needs-key'
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
				meta={source === 'cloud' ? routeMeta(provider, meta) : meta}
				state={r?.state}
				progress={r?.progress}
				alert={source === 'cloud' && status.openRouterKeyInvalid ? `${providerLabel(provider)} rejected the key (revoked or expired) — ${provider === 'openrouter' ? 'sign in again' : 'replace it'} below.` : null}
				open={open}
			/>
			{usedBy ? <WorkspaceUsedBy>{usedBy}</WorkspaceUsedBy> : null}
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
export function VoiceModelSection({ more, usedBy }: { more?: React.ReactNode; usedBy?: string }) {
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
	const name = !sel.provider ? 'No voice model yet' : sel.provider === 'kokoro' ? `Kokoro · ${voiceDisplayName(voice)}` : `${modelDisplayName({ id: model, provider: sel.provider })} · ${voiceDisplayName(voice)}`;
	const meta = !sel.provider ? 'Connect OpenRouter or a Gemini key, or choose the free on-device voice' : r?.state === 'needs-key' ? 'Add a key or choose on-device' : sel.source === 'device' ? 'On this device · free and private' : `${providerLabel(sel.provider)} · ${sel.provider === 'openrouter' ? 'your account' : 'your own key'}`;
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SelectionCard
				testId="voice-model-card"
				source={sel.source}
				keyed={sel.provider === 'gemini'}
				name={name}
				meta={routeMeta(sel.provider, meta)}
				state={r?.state}
				alert={rejectedAlert(sel.provider) ?? (r?.reason === 'model-gone' ? `${providerLabel(sel.provider)} no longer offers this model. Choose another.` : null)}
				alertBadge={rejectedAlert(sel.provider) ? undefined : 'Model retired'}
				open={open}
			/>
			{usedBy ? <WorkspaceUsedBy>{usedBy}</WorkspaceUsedBy> : null}
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

/** Providers & keys: one row per provider, each with its key status; OpenRouter's row carries the one-click sign-in. */
export function ProvidersSection({ status, onConnect, connecting }: { status: ArchitectStatus; onConnect: () => void; connecting: boolean }) {
	return (
		<div id={PROVIDERS_SECTION_ID} className="scroll-mt-4">
			<ApiKeyPanel status={status} onConnect={onConnect} connecting={connecting} />
		</div>
	);
}

// ── Image reader (2026-11-08-studio-ai-routes-ux.md §2) ──────────────────────────────────────
// Reads the author's pictures: Library photo descriptions. "Same as chat" (the default) follows
// the chat model and says so; "a model of its own" sits on any connected route, listing only
// models that read images. No on-device model reads pictures, so This device is never offered.

const LOOKS = Object.keys(IMAGE_LOOKS) as ImageLook[];

function useImageSelection() {
	const [img, setImg] = React.useState(readImageSelection);
	React.useEffect(() => {
		const sync = () => setImg(readImageSelection());
		window.addEventListener('db-model-changed', sync);
		return () => window.removeEventListener('db-model-changed', sync);
	}, []);
	return img;
}

/** The Image reader card: same as chat, or its own route and model. */
export function ImageReaderSection({ status, usedBy }: { status: ArchitectStatus; usedBy?: string }) {
	const img = useImageSelection();
	const [open, setOpen] = React.useState(false);
	const [look, setLook] = React.useState<ImageLook>(() => loadSettings().imageLook);
	// Re-read on every status change (a key saved or removed announces db-model-changed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the refresh trigger
	const withKeys = React.useMemo(() => KEYED.filter(hasKey), [status]);
	const [route, setRoute] = React.useState<CloudProvider>(() => (img.mode === 'own' ? (img.provider as CloudProvider) : (withKeys[0] ?? 'openrouter')));
	// A route list that gains its first key while the sheet is open moves the shown route onto it.
	React.useEffect(() => {
		if (img.mode !== 'own' && !withKeys.includes(route) && withKeys[0]) setRoute(withKeys[0]);
	}, [withKeys, route, img.mode]);
	React.useEffect(() => {
		if (!open && img.mode === 'own') setRoute(img.provider as CloudProvider);
	}, [open, img]);
	const catalog = useModelCatalog(status, {
		provider: route,
		load: () => listRouteModels(route),
		enabled: open && withKeys.includes(route),
		visionOnly: true,
		label: 'Image reader',
		currentId: img.mode === 'own' && img.provider === route ? img.model : null,
		select: (m) => {
			selectImage({ mode: 'own', provider: route, model: m.id });
		},
	});

	const chat = status.readiness;
	const chatName = modelDisplayName({ id: chat?.model || status.modelId, name: chat?.source === 'cloud' ? status.modelName : null, provider: chat?.provider ?? 'openrouter' });
	const own = img.mode === 'own';
	const ownState: ChatReadiness['state'] | undefined = !own ? undefined : !hasKey(img.provider as CloudProvider) ? 'needs-key' : isRetired(img.provider, img.model) ? 'retired' : 'ready';
	const chatOnDevice = chat?.source === 'device';
	// The catalog's own name when it is loaded ("GPT-5"), else the id made readable.
	const ownName = catalog.current && catalog.current.id === img.model ? catalog.current.name : null;
	const name = own ? modelDisplayName({ id: img.model, name: ownName, provider: img.provider }) : chat?.state === 'unset' ? 'Same as chat · not set' : `Same as chat · ${chatName}`;
	const route0 = own ? img.provider : (chat?.provider ?? '');
	const meta = own
		? `${providerLabel(img.provider)} · its own model`
		: chatOnDevice
			? ''
			: route0
				? `${providerLabel(route0)} · follows chat`
				: 'Set a chat model, or choose a model of its own';
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SelectionCard
				testId="image-reader-card"
				source="cloud"
				keyed={!!route0 && route0 !== 'openrouter'}
				name={name}
				meta={route0 ? routeMeta(route0, meta) : meta}
				state={own ? ownState : chatOnDevice ? undefined : chat?.state}
				alert={(route0 ? rejectedAlert(route0) : null) ?? (!own && chatOnDevice ? "The chat model runs on this device and can't read images. Choose an image reader." : null)}
				alertBadge={route0 && rejectedAlert(route0) ? undefined : "Can't read images"}
				open={open}
			/>
			{usedBy ? <WorkspaceUsedBy>{usedBy}</WorkspaceUsedBy> : null}
			<CollapsibleContent className="mt-3" data-image-reader="">
				<RadioGroup
					aria-label="Which model reads images"
					value={img.mode}
					onValueChange={(v) => {
						if (v === 'same') {
							selectImage({ mode: 'same' });
							notify('The image reader now follows the chat model.');
						} else {
							// The route shown, if it is connected; else the first connected one. A key added
							// after the sheet opened is a route too (live check, 2026-11-08).
							const to = withKeys.includes(route) ? route : withKeys[0];
							if (!to) return;
							setRoute(to);
							selectImage({ mode: 'own', provider: to });
						}
					}}
					className="mb-3 flex-wrap gap-1.5"
				>
					<RadioGroupItem value="same" className="rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)] data-[state=checked]:text-[var(--text-heading)]">
						Same as chat model
					</RadioGroupItem>
					<RadioGroupItem value="own" disabled={!withKeys.length} className="rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)] data-[state=checked]:text-[var(--text-heading)]">
						A model of its own
					</RadioGroupItem>
				</RadioGroup>
				{own ? (
					<div>
						{withKeys.length > 1 ? (
							<RadioGroup aria-label="Where the image reader runs" value={route} onValueChange={(v) => setRoute(v as CloudProvider)} className="mb-3 flex-wrap gap-1.5">
								{withKeys.map((p) => (
									<RadioGroupItem key={p} value={p} className="rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)] data-[state=checked]:text-[var(--text-heading)]">
										{providerLabel(p)}
									</RadioGroupItem>
								))}
							</RadioGroup>
						) : null}
						<ModelList catalog={catalog} />
						<p className="mt-1.5 text-[11px] text-muted-foreground">Only models that read images are listed. A model the catalog does not know yet is tried, never refused on a guess. This device is not listed: no on-device model reads images.</p>
					</div>
				) : null}
				<div className="mb-1 mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">How closely it looks</div>
				<fieldset aria-label="How closely the image reader looks" className="m-0 flex min-w-0 gap-1 rounded-lg border border-border p-0.5">
					{LOOKS.map((k) => (
						<button
							type="button"
							key={k}
							aria-pressed={look === k}
							onClick={() => {
								saveSettings({ imageLook: k });
								setLook(k);
							}}
							className={cn('min-h-[36px] flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold', look === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-[var(--text-heading)]')}
						>
							{IMAGE_LOOKS[k].label}
						</button>
					))}
				</fieldset>
				<p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
					{IMAGE_LOOKS[look].means} About {lookTokens(look).toLocaleString()} input tokens per photo. A photo is sent only when you press Suggest on it in the Library.
				</p>
			</CollapsibleContent>
		</Collapsible>
	);
}
