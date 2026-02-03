<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Settings - SiteSeer</title>
</svelte:head>

<div class="p-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Settings</h1>
		<p class="mt-1 text-white/60">Manage your workspace settings</p>
	</div>

	<div class="max-w-2xl space-y-8">
		<!-- API Key Section -->
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
			<h2 class="text-lg font-medium text-white">Gemini API</h2>
			<p class="mt-1 text-sm text-white/60">
				Configure your Gemini API key for AI-powered analytics.
			</p>

			<form
				method="POST"
				action="?/updateApiKey"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="mt-6 space-y-4"
			>
				<div>
					<label for="geminiApiKey" class="block text-sm font-medium text-white/90">
						API Key
					</label>
					<input
						type="password"
						id="geminiApiKey"
						name="geminiApiKey"
						value={data.settings.geminiApiKey ? '••••••••••••' : ''}
						placeholder="AIza..."
						class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
					/>
					<p class="mt-1 text-xs text-white/50">
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
					<label for="geminiModel" class="block text-sm font-medium text-white/90">Model</label>
					<select
						id="geminiModel"
						name="geminiModel"
						class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
					>
						<option value="gemini-2.0-flash" selected={data.settings.geminiModel === 'gemini-2.0-flash'}>
							Gemini 2.0 Flash (Recommended)
						</option>
						<option value="gemini-1.5-pro" selected={data.settings.geminiModel === 'gemini-1.5-pro'}>
							Gemini 1.5 Pro
						</option>
						<option value="gemini-1.5-flash" selected={data.settings.geminiModel === 'gemini-1.5-flash'}>
							Gemini 1.5 Flash
						</option>
					</select>
				</div>

				{#if form?.success}
					<div class="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
						Settings saved successfully
					</div>
				{/if}

				{#if form?.error}
					<div class="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
						{form.error}
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading}
					class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2.5 font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if loading}
						Saving...
					{:else}
						Save Changes
					{/if}
				</button>
			</form>
		</div>

		<!-- Organization Info -->
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-6">
			<h2 class="text-lg font-medium text-white">Organization</h2>
			<div class="mt-4 space-y-3">
				<div>
					<label class="text-sm text-white/50">Name</label>
					<p class="text-white">{data.org.name}</p>
				</div>
				<div>
					<label class="text-sm text-white/50">Slug</label>
					<p class="font-mono text-white/70">{data.org.slug}</p>
				</div>
			</div>
		</div>
	</div>
</div>
