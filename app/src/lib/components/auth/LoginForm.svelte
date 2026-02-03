<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		error?: string | null;
	}

	let { error = null }: Props = $props();
	let loading = $state(false);
</script>

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
		<label for="email" class="block text-sm font-medium text-white/90">Email</label>
		<input
			type="email"
			id="email"
			name="email"
			required
			autocomplete="email"
			class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
			placeholder="you@example.com"
		/>
	</div>

	<div>
		<label for="password" class="block text-sm font-medium text-white/90">Password</label>
		<input
			type="password"
			id="password"
			name="password"
			required
			autocomplete="current-password"
			class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
			placeholder="••••••••"
		/>
	</div>

	{#if error}
		<div class="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
			{error}
		</div>
	{/if}

	<button
		type="submit"
		disabled={loading}
		class="w-full rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-3 font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
	>
		{#if loading}
			Signing in...
		{:else}
			Sign In
		{/if}
	</button>
</form>
