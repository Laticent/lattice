import { Cpu, KeyRound, Loader2, Sparkles } from 'lucide-react';
import * as React from 'react';
import { lastKeyRefusal, outOfCreditAt } from '@/lib/model-retired.js';
import { readImageSelection, readVoiceSelection } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
import { openRouterKeyHint, providerKeyHint, readOpenRouterVia } from '@/lib/openrouter-key.js';
import { cn } from '@/lib/utils';
import { removeProviderKey, saveProviderKey } from './api-key';
import type { ArchitectStatus, CloudProvider } from './architect';
import { KEY_PROVIDER_INFO } from './key-providers';

// OpenRouter first: it is the default and the only one with a one-click sign-in. Then the
// direct providers, in the provider registry's order.
const ORDER: CloudProvider[] = ['openrouter', 'gemini', 'anthropic', 'openai'];
const hintFor = (p: CloudProvider) => (p === 'openrouter' ? openRouterKeyHint() : providerKeyHint(p));

const btn = 'rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-60';

/** What each route can serve (2026-11-08-studio-ai-routes-ux.md §1): every chat model reads images. */
const SERVES: Record<CloudProvider, string> = {
	openrouter: 'Chat · Image reader · Voice',
	gemini: 'Chat · Image reader · Voice',
	anthropic: 'Chat · Image reader',
	openai: 'Chat · Image reader',
};

/** What a route is in use for right now, from the three selections. */
function usageLine(uses: string[]): string | null {
	if (!uses.length) return null;
	return `in use for ${uses.length === 1 ? uses[0] : `${uses.slice(0, -1).join(', ')} and ${uses.at(-1)}`}`;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Workspace › AI › Connections: where the Studio can reach models
 * (engineering/decisions/2026-11-08-studio-ai-routes-ux.md §1; key handling:
 * 2026-11-06-studio-byok-key-lifecycle.md §7). OpenRouter first, one connection with two ways in
 * (sign in, or paste a key); then the author's own provider keys; then this device. Each row says
 * what the route can serve, whether it is connected, and what it is in use for.
 *
 * Connecting never chooses a model: it fills only a selection that is not set yet (rule 1), and a
 * model is chosen under Models in use. Every key is checked with its provider before it is
 * stored, never shown again (only its last four characters), and lives in this browser, sealed,
 * through lib/openrouter-key.js. Removing a key leaves the selections in place, reading "needs
 * its connection".
 */
export function ApiKeyPanel({ status, onConnect, connecting = false }: { status: ArchitectStatus; onConnect?: () => void; connecting?: boolean }) {
	// Re-read on every status change (a save, a remove, a rejection fires db-model-changed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the refresh trigger
	const hints = React.useMemo(() => Object.fromEntries(ORDER.map((p) => [p, hintFor(p)])) as Record<CloudProvider, string | null>, [status]);
	const [voiceProvider, setVoiceProvider] = React.useState(() => readVoiceSelection().provider);
	const [image, setImage] = React.useState(readImageSelection);
	React.useEffect(() => {
		const sync = () => setVoiceProvider(readVoiceSelection().provider);
		const syncImage = () => setImage(readImageSelection());
		window.addEventListener('db-voice-changed', sync);
		window.addEventListener('db-model-changed', syncImage);
		return () => {
			window.removeEventListener('db-voice-changed', sync);
			window.removeEventListener('db-model-changed', syncImage);
		};
	}, []);
	const r = status.readiness;
	const chatProvider = r ? (r.source === 'cloud' ? r.provider : null) : status.openRouterReady ? (status.provider ?? 'openrouter') : null;
	const chatOnDevice = r?.source === 'device';
	const imageProvider = image.mode === 'own' ? image.provider : chatProvider;
	const usesOf = (p: string) => [chatProvider === p && 'chat', imageProvider === p && (image.mode === 'own' ? 'the image reader' : 'the image reader (same as chat)'), voiceProvider === p && 'voice'].filter(Boolean) as string[];
	const deviceUse = usageLine([chatOnDevice && 'chat', voiceProvider === 'kokoro' && 'voice'].filter(Boolean) as string[]);
	// With no key anywhere, the default provider's field is open: the first-run path is one paste.
	const none = ORDER.every((p) => !hints[p]);
	// `undefined` = nobody chose: derived on every render, so a sealed key that opens after mount
	// (every hint reads null until then) closes the field by itself. A row's Add / Replace / Keep
	// sets it explicitly; a save or a remove hands it back to the derivation.
	const [editing, setEditing] = React.useState<CloudProvider | null | undefined>(undefined);
	const open = editing === undefined ? (none ? 'openrouter' : null) : editing;

	return (
		<ul className="flex flex-col gap-1.5" aria-label="Providers">
			{ORDER.map((p) => (
				<ProviderRow
					key={p}
					provider={p}
					hint={hints[p]}
					inUse={usageLine(usesOf(p))}
					rejected={chatProvider === p && !!status.openRouterKeyInvalid}
					creditAt={outOfCreditAt(p)}
					editing={open === p}
					onEdit={(on) => setEditing(on ? p : null)}
					onDone={() => setEditing(undefined)}
					onConnect={p === 'openrouter' ? onConnect : undefined}
					connecting={connecting}
				/>
			))}
			<li data-testid="provider-row-device" className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', chatOnDevice || voiceProvider === 'kokoro' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
					<Cpu className="size-4" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">This device</span>
					<span className="block text-[11px] text-muted-foreground">
					Chat · Voice — free and private, no key{deviceUse ? ` · ${deviceUse}` : '. A download makes a model available; choose it under Models in use.'}
					</span>
				</span>
			</li>
		</ul>
	);
}

function ProviderRow({
	provider,
	hint,
	inUse,
	rejected,
	creditAt,
	editing,
	onEdit,
	onDone,
	onConnect,
	connecting,
}: {
	provider: CloudProvider;
	hint: string | null;
	inUse: string | null;
	rejected: boolean;
	/** When this route last answered "out of credit", on this page. */
	creditAt: number | null;
	editing: boolean;
	onEdit: (on: boolean) => void;
	onDone: () => void;
	onConnect?: () => void;
	connecting: boolean;
}) {
	const info = KEY_PROVIDER_INFO[provider];
	const [value, setValue] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const inputId = React.useId();
	// A row whose field closes forgets what was typed into it and its error, however it closed
	// (Keep, a save, or another row's Add taking the field).
	React.useEffect(() => {
		if (!editing) {
			setValue('');
			setError(null);
		}
	}, [editing]);
	const close = () => onEdit(false);
	const save = async () => {
		setBusy(true);
		setError(null);
		const out = await saveProviderKey(provider, value);
		setBusy(false);
		if (out.ok) {
			onDone();
			// A key that filled a model that was not set is announced by the shell's fill notice instead.
			if (!out.filled?.length) notify(`${info.label} key saved.`);
		} else setError(out.note);
	};
	const remove = async () => {
		onDone();
		await removeProviderKey(provider);
		notify(via === 'oauth' ? 'OpenRouter disconnected from this browser.' : `${info.label} key removed from this browser.`);
	};
	// OpenRouter is one connection with two ways in; the row says which way it came in.
	const via = provider === 'openrouter' && hint ? readOpenRouterVia() : null;
	const how = via === 'oauth' ? 'Signed in' : `Key ${hint}`;
	const state = rejected ? `${how} · rejected by ${info.label}, ${via === 'oauth' ? 'sign in again' : 'replace it'}` : creditAt != null && hint ? `${how} · out of credit at ${clock(creditAt)}` : hint ? `${how}${inUse ? ` · ${inUse}` : ' · not in use'}` : provider === 'openrouter' ? 'Not connected' : 'No key';
	// What the provider said when it refused the key, so a report names the cause (owner, 2026-11-08).
	const refusal = rejected ? lastKeyRefusal(provider) : null;
	const said = refusal ? ` (${info.label} said ${refusal.status}${refusal.message ? `: ${refusal.message}` : ''}${refusal.ageMs != null ? `, ${Math.round(refusal.ageMs / 1000)} s after the key was made` : ''}${refusal.asks > 1 ? `, asked ${refusal.asks}×` : ''})` : '';
	const line = `${SERVES[provider]} — ${state}${said}`;
	const warn = rejected || (creditAt != null && !!hint);

	return (
		<li data-testid={`provider-row-${provider}`} className={cn('rounded-xl border px-3 py-2.5', inUse && !rejected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
			{/* Wraps the buttons onto their own line on a phone rather than squeezing the name. */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
					<KeyRound className="size-4" />
				</span>
				<span className="min-w-[9rem] flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">{info.label}</span>
					<span data-testid={`provider-row-${provider}-line`} className={cn('block text-[11px]', warn ? 'text-[var(--fail)]' : 'text-muted-foreground')}>{line}</span>
				</span>
				<span className="ml-auto flex shrink-0 gap-1.5">
					{hint ? (
						<>
							{creditAt != null ? (
								<a href={info.billingUrl} target="_blank" rel="noopener noreferrer" aria-label={`Add billing for ${info.label}`} className={cn(btn, 'inline-flex items-center')}>
									Add billing
								</a>
							) : null}
							{via !== 'oauth' ? (
								<button type="button" onClick={() => onEdit(!editing)} aria-expanded={editing} aria-label={`Replace the ${info.label} key`} className={btn}>
									Replace
								</button>
							) : null}
							<button type="button" onClick={remove} aria-label={via === 'oauth' ? 'Disconnect OpenRouter' : `Remove the ${info.label} key`} className={btn}>
								{via === 'oauth' ? 'Disconnect' : 'Remove'}
							</button>
						</>
					) : (
						<>
							{onConnect ? (
								<button type="button" onClick={onConnect} disabled={connecting} aria-label="Sign in with OpenRouter" className={cn(btn, 'inline-flex items-center gap-1.5')}>
									<Sparkles className="size-3.5" />
									{connecting ? 'Opening…' : 'Sign in'}
								</button>
							) : null}
							<button type="button" onClick={() => onEdit(!editing)} aria-expanded={editing} aria-label={onConnect ? `Paste a key for ${info.label}` : `Add ${/^[AEIOU]/.test(info.label) ? 'an' : 'a'} ${info.label} key`} className={btn}>
								{onConnect ? 'Paste a key' : 'Add'}
							</button>
						</>
					)}
					{/* A rejected OpenRouter key can be replaced by signing in again. */}
					{hint && rejected && onConnect ? (
						<button type="button" onClick={onConnect} disabled={connecting} aria-label="Sign in again to OpenRouter" className={cn(btn, 'inline-flex items-center gap-1.5')}>
							<Sparkles className="size-3.5" />
							{connecting ? 'Opening…' : 'Sign in again'}
						</button>
					) : null}
				</span>
			</div>

			{editing ? (
				<div className="mt-2.5">
					<label htmlFor={inputId} className="text-[12px] font-semibold text-[var(--text-heading)]">
						{info.label} API key
					</label>
					<div className="mt-1.5 flex gap-2">
						<input
							id={inputId}
							type="password"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && value.trim() && !busy) save();
								if (e.key === 'Escape' && hint) close();
							}}
							placeholder={info.placeholder}
							// Chrome ignores `off` on a password field and offers to save the key as a synced
							// password once the field disappears after a request; `new-password` and the
							// managers' own opt-outs keep it out of the vault.
							autoComplete="new-password"
							data-1p-ignore=""
							data-lpignore="true"
							data-bwignore=""
							data-form-type="other"
							spellCheck={false}
							aria-invalid={!!error}
							aria-describedby={`${inputId}-help`}
							className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12.5px] text-[var(--text-heading)] outline-none focus-visible:border-[var(--accent)]"
						/>
						<button type="button" onClick={save} disabled={busy || !value.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">
							{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
							{busy ? 'Checking…' : 'Check & save'}
						</button>
					</div>
					{error ? (
						<p role="alert" className="mt-1.5 text-[11px] text-[var(--fail)]">
							{error}
						</p>
					) : null}
					<p id={`${inputId}-help`} className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
						Create a key at{' '}
						<a href={info.keysUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent)]">
							{info.keysHost}
						</a>
						. It is checked with {info.label}, then kept in this browser only. Using AI sends your deck text to {info.label} on this key.
						{provider !== 'openrouter' ? ` ${info.label} cannot report a balance to the browser, so spend shows an estimate from token counts.` : ''}
					</p>
					{hint ? (
						<button type="button" onClick={close} className="mt-1 text-[11px] font-semibold text-[var(--accent)]">
							Keep the current key
						</button>
					) : null}
				</div>
			) : null}
		</li>
	);
}
