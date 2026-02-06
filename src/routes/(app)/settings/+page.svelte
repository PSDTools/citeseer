<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	let testLoading = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);

	async function testApiKey() {
		testLoading = true;
		testResult = null;

		try {
			const response = await fetch('/api/settings/test-key', {
				method: 'POST'
			});
			const result = await response.json();
			testResult = {
				success: response.ok,
				message: result.message || (response.ok ? 'API key is valid' : 'API key test failed')
			};
		} catch {
			testResult = { success: false, message: 'Failed to test API key' };
		} finally {
			testLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Settings - CiteSeer</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Settings</h1>
		<p class="mt-1 text-white/50">Manage your workspace configuration</p>
	</div>

	<div class="max-w-2xl space-y-6">
		<!-- API Key Section -->
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
			<h2 class="text-lg font-semibold text-white">Gemini API</h2>
			<p class="mt-1 text-sm text-white/50">
				Configure your Gemini API key for AI-powered analytics.
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
					<label for="geminiApiKey" class="mb-1.5 block text-sm font-medium text-white/70">
						API Key
					</label>
					<input
						type="password"
						id="geminiApiKey"
						name="geminiApiKey"
						value={data.settings.geminiApiKey ? '••••••••••••' : ''}
						placeholder="AIza..."
						class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
					/>
					<p class="mt-1.5 text-xs text-white/40">
						Get your API key from
						<a
							href="https://aistudio.google.com/app/apikey"
							target="_blank"
							rel="noopener noreferrer"
							class="text-[#64ff96] hover:underline"
						>
							Google AI Studio
						</a>
					</p>
				</div>

				<div>
					<label for="geminiModel" class="mb-1.5 block text-sm font-medium text-white/70"
						>Model</label
					>
					<select
						id="geminiModel"
						name="geminiModel"
						class="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
					>
						<option
							value="gemini-2.0-flash"
							selected={data.settings.geminiModel === 'gemini-2.0-flash'}
						>
							Gemini 2.0 Flash (Recommended)
						</option>
						<option
							value="gemini-1.5-pro"
							selected={data.settings.geminiModel === 'gemini-1.5-pro'}
						>
							Gemini 1.5 Pro
						</option>
						<option
							value="gemini-1.5-flash"
							selected={data.settings.geminiModel === 'gemini-1.5-flash'}
						>
							Gemini 1.5 Flash
						</option>
					</select>
					<p class="mt-1.5 text-xs text-white/40">
						Flash is fastest and cheapest. Pro gives higher quality answers for complex queries.
					</p>
				</div>

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
					{#if data.settings.geminiApiKey}
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
