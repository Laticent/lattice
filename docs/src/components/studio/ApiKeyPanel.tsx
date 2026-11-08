import { Cpu, KeyRound, Loader2, Sparkles } from 'lucide-react';
import * as React from 'react';
import { readVoiceSelection } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
import { openRouterKeyHint, providerKeyHint } from '@/lib/openrouter-key.js';
import { cn } from '@/lib/utils';
import { removeProviderKey, saveProviderKey, switchProvider } from './api-key';
import type { ArchitectStatus, CloudProvider } from './architect';
import { KEY_PROVIDER_INFO } from './key-providers';

// OpenRouter first: it is the default and the only one with a one-click sign-in. Then the
// direct providers, in the provider registry's order.
const ORDER: CloudProvider[] = ['openrouter', 'gemini', 'anthropic', 'openai'];
const hintFor = (p: CloudProvider) => (p === 'openrouter' ? openRouterKeyHint() : providerKeyHint(p));

const btn = 'rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-60';

/** What a provider is in use for right now: chat, voice, both, or nothing. */
function usageLine(chat: boolean, voice: boolean): string | null {
	if (chat && voice) return 'in use for chat and voice';
	if (chat) return 'in use for chat';
	if (voice) return 'in use for voice';
	return null;
}

/**
 * Workspace › AI › Providers & keys: one row per provider (OpenRouter, Gemini, Anthropic, OpenAI,
 * On-device), each saying whether it holds a key and what it is in use for
 * (engineering/decisions/2026-11-07-studio-model-spine.md; key handling:
 * 2026-11-06-studio-byok-key-lifecycle.md §7).
 *
 * Every key is checked with its provider before it is stored, never shown again (only its last
 * four characters), and lives in this browser, sealed, through lib/openrouter-key.js. Saving a key
 * selects that provider's chat model (owner decision 3); "Use for chat" selects a provider whose
 * key is already saved. Removing a key leaves the selection in place, reading "needs a key".
 */
export function ApiKeyPanel({ status, onConnect, connecting = false }: { status: ArchitectStatus; onConnect?: () => void; connecting?: boolean }) {
	// Re-read on every status change (a save, a remove, a rejection fires db-model-changed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the refresh trigger
	const hints = React.useMemo(() => Object.fromEntries(ORDER.map((p) => [p, hintFor(p)])) as Record<CloudProvider, string | null>, [status]);
	const [voiceProvider, setVoiceProvider] = React.useState(() => readVoiceSelection().provider);
	React.useEffect(() => {
		const sync = () => setVoiceProvider(readVoiceSelection().provider);
		window.addEventListener('db-voice-changed', sync);
		return () => window.removeEventListener('db-voice-changed', sync);
	}, []);
	const r = status.readiness;
	const chatProvider = r ? (r.source === 'cloud' ? r.provider : null) : status.openRouterReady ? (status.provider ?? 'openrouter') : null;
	const chatOnDevice = r?.source === 'device';
	// With no key anywhere, the default provider's field is open: the first-run path is one paste.
	const none = ORDER.every((p) => !hints[p]);
	const [editing, setEditing] = React.useState<CloudProvider | null>(none ? 'openrouter' : null);
	React.useEffect(() => {
		if (none) setEditing((e) => e ?? 'openrouter');
	}, [none]);
	const open = editing;

	return (
		<ul className="flex flex-col gap-1.5" aria-label="Providers">
			{ORDER.map((p) => (
				<ProviderRow
					key={p}
					provider={p}
					hint={hints[p]}
					inUse={usageLine(chatProvider === p, voiceProvider === p)}
					chatActive={chatProvider === p}
					rejected={chatProvider === p && !!status.openRouterKeyInvalid}
					editing={open === p}
					onEdit={(on) => setEditing(on ? p : null)}
					onConnect={p === 'openrouter' ? onConnect : undefined}
					connecting={connecting}
				/>
			))}
			<li data-testid="provider-row-device" className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', chatOnDevice || voiceProvider === 'kokoro' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
					<Cpu className="size-4" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">On-device</span>
					<span className="block text-[11px] text-muted-foreground">
						No key needed{usageLine(chatOnDevice, voiceProvider === 'kokoro') ? ` · ${usageLine(chatOnDevice, voiceProvider === 'kokoro')}` : ' · free and private, chosen under Chat model or Voice model'}
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
	chatActive,
	rejected,
	editing,
	onEdit,
	onConnect,
	connecting,
}: {
	provider: CloudProvider;
	hint: string | null;
	inUse: string | null;
	chatActive: boolean;
	rejected: boolean;
	editing: boolean;
	onEdit: (on: boolean) => void;
	onConnect?: () => void;
	connecting: boolean;
}) {
	const info = KEY_PROVIDER_INFO[provider];
	const [value, setValue] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const inputId = React.useId();
	const close = () => {
		onEdit(false);
		setError(null);
		setValue('');
	};
	const save = async () => {
		setBusy(true);
		setError(null);
		const out = await saveProviderKey(provider, value);
		setBusy(false);
		if (out.ok) {
			close();
			notify(`${info.label} key saved — chat now runs on ${info.label}.`);
		} else setError(out.note);
	};
	const remove = async () => {
		close();
		await removeProviderKey(provider);
		notify(`${info.label} key removed from this browser.`);
	};
	const use = async () => {
		await switchProvider(provider);
		notify(`Chat now runs on ${info.label}.`);
	};
	const line = rejected ? `Key ${hint} · rejected by ${info.label}, replace it` : hint ? `Key ${hint}${inUse ? ` · ${inUse}` : ' · saved in this browser'}` : 'No key';

	return (
		<li data-testid={`provider-row-${provider}`} className={cn('rounded-xl border px-3 py-2.5', inUse && !rejected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
			{/* Wraps the buttons onto their own line on a phone rather than squeezing the name. */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
					<KeyRound className="size-4" />
				</span>
				<span className="min-w-[9rem] flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">{info.label}</span>
					<span className={cn('block text-[11px]', rejected ? 'text-[var(--fail)]' : 'text-muted-foreground')}>{line}</span>
				</span>
				<span className="ml-auto flex shrink-0 gap-1.5">
					{hint ? (
						<>
							{!chatActive ? (
								<button type="button" onClick={use} className={btn}>
									Use for chat
								</button>
							) : null}
							<button type="button" onClick={() => onEdit(!editing)} aria-expanded={editing} aria-label={`Replace the ${info.label} key`} className={btn}>
								Replace
							</button>
							<button type="button" onClick={remove} aria-label={`Remove the ${info.label} key`} className={btn}>
								Remove
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
							<button type="button" onClick={() => onEdit(!editing)} aria-expanded={editing} aria-label={`Add ${/^[AEIOU]/.test(info.label) ? 'an' : 'a'} ${info.label} key`} className={btn}>
								{onConnect ? 'Paste a key' : 'Add'}
							</button>
						</>
					)}
					{/* A rejected OpenRouter key can be replaced by signing in again. */}
					{hint && rejected && onConnect ? (
						<button type="button" onClick={onConnect} disabled={connecting} aria-label="Reconnect OpenRouter" className={cn(btn, 'inline-flex items-center gap-1.5')}>
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
