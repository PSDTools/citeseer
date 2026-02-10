<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	let demoLoading = $state(false);
	let testLoading = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);
	let showSecretDemoMenu = $state(false);
	let secretBuffer = $state('');
	let selectedProvider = $state<'gemini' | 'openai' | 'claude' | 'custom'>('gemini');
	let llmModel = $state('gemini-2.0-flash');
	let geminiModel = $state('gemini-2.0-flash');

	const providerDefaultModels: Record<string, string> = {
		gemini: 'gemini-2.0-flash',
		openai: 'gpt-4o-mini',
		claude: 'claude-3-5-sonnet-latest',
		custom: 'gpt-4o-mini',
	};

	$effect(() => {
		selectedProvider = (data.settings.llmProvider || 'gemini') as
			| 'gemini'
			| 'openai'
			| 'claude'
			| 'custom';
		geminiModel = data.settings.geminiModel || 'gemini-2.0-flash';
		llmModel = data.settings.llmModel || data.settings.geminiModel || 'gemini-2.0-flash';
	});

	function handleSecretKeydown(event: KeyboardEvent) {
		if (!data.demoAvailable) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const target = event.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

		if (event.key === 'Escape' && showSecretDemoMenu) {
			showSecretDemoMenu = false;
			secretBuffer = '';
			return;
		}

		if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) return;
		secretBuffer = (secretBuffer + event.key.toLowerCase()).slice(-8);
		if (secretBuffer.endsWith('demo')) {
			showSecretDemoMenu = true;
			secretBuffer = '';
		}
	}

	async function testApiKey() {
		testLoading = true;
		testResult = null;

		try {
			const response = await fetch('/api/settings/test-key', {
				method: 'POST',
			});
			const result = await response.json();
			testResult = {
				success: response.ok,
				message: result.message || (response.ok ? 'API key is valid' : 'API key test failed'),
			};
		} catch {
			testResult = { success: false, message: 'Failed to test API key' };
		} finally {
			testLoading = false;
		}
	}

	function handleProviderChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value as
			| 'gemini'
			| 'openai'
			| 'claude'
			| 'custom';
		selectedProvider = value;
		if (selectedProvider === 'gemini') {
			llmModel = geminiModel;
			return;
		}
		llmModel = providerDefaultModels[selectedProvider] || 'gpt-4o-mini';
	}
</script>

<svelte:head>
	<title>Settings - CiteSeer</title>
</svelte:head>

<svelte:window onkeydown={handleSecretKeydown} />

<div class="p-6 lg:p-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Settings</h1>
		<p class="mt-1 text-white/50">Manage your workspace configuration</p>
	</div>

	<div class="max-w-2xl space-y-6">
		<!-- API Key Section -->
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
			<h2 class="text-lg font-semibold text-white">LLM Provider</h2>
			<p class="mt-1 text-sm text-white/50">
				Configure Gemini, OpenAI, Claude, or your custom OpenAI-compatible endpoint.
			</p>

			<form
				method="POST"
				action="?/updateApiKey"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						testResult = null;
						await update();
					};
				}}
				class="mt-6 space-y-4"
			>
				<div>
					<label for="llmProvider" class="mb-1.5 block text-sm font-medium text-white/70"
						>Provider</label
					>
					<select
						id="llmProvider"
						name="llmProvider"
						value={selectedProvider}
						onchange={handleProviderChange}
						class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
					>
						<option value="gemini">Gemini (Default)</option>
						<option value="openai">OpenAI</option>
						<option value="claude">Claude</option>
						<option value="custom">Custom (OpenAI-compatible)</option>
					</select>
				</div>

				<div>
					<label for="llmApiKey" class="mb-1.5 block text-sm font-medium text-white/70">
						API Key
					</label>
					<input
						type="password"
						id="llmApiKey"
						name="llmApiKey"
						value={data.settings.llmApiKey ? '••••••••••••' : ''}
						placeholder={selectedProvider === 'gemini'
							? 'AIza...'
							: selectedProvider === 'claude'
								? 'sk-ant-...'
								: 'sk-...'}
						class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
					/>
					<p class="mt-1.5 text-xs text-white/40">
						Gemini: Google AI Studio. OpenAI: platform.openai.com. Claude: console.anthropic.com.
					</p>
				</div>

				<div>
					{#if selectedProvider === 'gemini'}
						<label for="geminiModel" class="mb-1.5 block text-sm font-medium text-white/70"
							>Model</label
						>
						<select
							id="geminiModel"
							name="geminiModel"
							bind:value={geminiModel}
							onchange={() => (llmModel = geminiModel)}
							class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
						>
							<option value="gemini-2.0-flash">Gemini 2.0 Flash (Recommended)</option>
							<option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
							<option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
						</select>
					{:else}
						<label for="llmModel" class="mb-1.5 block text-sm font-medium text-white/70"
							>Model</label
						>
						<input
							type="text"
							id="llmModel"
							name="llmModelInput"
							bind:value={llmModel}
							placeholder={providerDefaultModels[selectedProvider] || 'model-name'}
							class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
						/>
					{/if}
					<p class="mt-1.5 text-xs text-white/40">
						Gemini defaults are preserved. Change model per provider as needed.
					</p>
				</div>

				<div>
					<label for="llmBaseUrl" class="mb-1.5 block text-sm font-medium text-white/70"
						>Base URL <span class="text-white/40">(optional)</span></label
					>
					<input
						type="url"
						id="llmBaseUrl"
						name="llmBaseUrl"
						value={data.settings.llmBaseUrl || ''}
						placeholder={selectedProvider === 'custom'
							? 'https://your-endpoint/v1'
							: selectedProvider === 'openai'
								? 'https://api.openai.com/v1'
								: selectedProvider === 'claude'
									? 'https://api.anthropic.com'
									: ''}
						class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
					/>
					<p class="mt-1.5 text-xs text-white/40">
						Required for custom OpenAI-compatible endpoints.
					</p>
				</div>

				<input
					type="hidden"
					name="llmModel"
					value={selectedProvider === 'gemini' ? geminiModel : llmModel}
				/>
				<input type="hidden" name="geminiModel" value={geminiModel} />
				<input
					type="hidden"
					name="geminiApiKey"
					value={data.settings.geminiApiKey ? '••••••••••••' : ''}
				/>

				{#if form?.success}
					<div
						class="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400"
					>
						Settings saved successfully
					</div>
				{/if}

				{#if form?.error}
					<div
						class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
					>
						{form.error}
					</div>
				{/if}

				{#if testResult}
					<div
						class="rounded-lg {testResult.success
							? 'border-green-500/20 bg-green-500/10 text-green-400'
							: 'border-red-500/20 bg-red-500/10 text-red-400'} border px-4 py-3 text-sm"
					>
						{testResult.message}
					</div>
				{/if}

				<div class="flex items-center gap-3">
					<button
						type="submit"
						disabled={loading}
						class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2.5 font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if loading}Saving...{:else}Save Changes{/if}
					</button>
					{#if data.settings.llmApiKey || data.settings.geminiApiKey}
						<button
							type="button"
							onclick={testApiKey}
							disabled={testLoading}
							class="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if testLoading}Testing...{:else}Test API Key{/if}
						</button>
					{/if}
				</div>
			</form>
		</div>

		<!-- Organization Info -->
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
			<h2 class="text-lg font-semibold text-white/70">Organization</h2>
			<div class="mt-4 space-y-3">
				<div>
					<span class="text-sm text-white/40">Name</span>
					<p class="text-white">{data.org.name}</p>
				</div>
				<div>
					<span class="text-sm text-white/40">Slug</span>
					<p class="font-mono text-white/70">{data.org.slug}</p>
				</div>
			</div>
		</div>
	</div>
</div>

{#if data.demoAvailable}
	<Modal open={showSecretDemoMenu} onclose={() => (showSecretDemoMenu = false)} maxWidth="max-w-lg">
		<h2 class="text-lg font-semibold text-white">Demo Controls</h2>
		<p class="mt-1 text-sm text-white/50">Hidden menu for live-demo mode switching.</p>

		<form
			method="POST"
			action="?/toggleDemoMode"
			use:enhance={() => {
				demoLoading = true;
				return async ({ update }) => {
					demoLoading = false;
					await update();
				};
			}}
			class="mt-6"
		>
			<input type="hidden" name="enabled" value={data.demoModeEnabled ? 'false' : 'true'} />
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm text-white/70">Current mode</p>
					<p class="mt-1 text-base font-semibold text-white">
						{data.demoModeEnabled ? 'Demo (scripted)' : 'Live (Gemini)'}
					</p>
				</div>
				<button
					type="submit"
					disabled={demoLoading}
					class="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if demoLoading}
						Switching...
					{:else if data.demoModeEnabled}
						Switch to Live
					{:else}
						Switch to Demo
					{/if}
				</button>
			</div>
		</form>
	</Modal>
{/if}
