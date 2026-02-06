<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Get Started - CiteSeer</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-[#050810] px-4">
	<div class="w-full max-w-lg">
		<div class="text-center mb-8">
			<h1 class="text-3xl font-bold">
				<span class="bg-gradient-to-r from-[#64ff96] to-[#3dd977] bg-clip-text text-transparent">
					Welcome to CiteSeer
				</span>
			</h1>
			<p class="mt-2 text-white/60">Let's set up your workspace</p>
		</div>

		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm">
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-6"
			>
				<div>
					<label for="orgName" class="block text-sm font-medium text-white/90">
						Organization Name
					</label>
					<input
						type="text"
						id="orgName"
						name="orgName"
						required
						class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
						placeholder="My Company"
					/>
					<p class="mt-1 text-xs text-white/50">This can be your company name or personal workspace</p>
				</div>

				<div>
					<label for="geminiApiKey" class="block text-sm font-medium text-white/90">
						Gemini API Key
						<span class="text-white/50">(optional)</span>
					</label>
					<input
						type="password"
						id="geminiApiKey"
						name="geminiApiKey"
						class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
						placeholder="AIza..."
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

				{#if form?.error}
					<div class="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
						{form.error}
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-3 font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if loading}
						Creating workspace...
					{:else}
						Create Workspace
					{/if}
				</button>
			</form>
		</div>
	</div>
</div>
