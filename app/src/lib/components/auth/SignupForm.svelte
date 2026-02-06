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
			class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
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
			minlength="8"
			autocomplete="new-password"
			class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
			placeholder="••••••••"
		/>
		<p class="mt-1 text-xs text-white/50">Must be at least 8 characters</p>
	</div>

	<div>
		<label for="confirmPassword" class="block text-sm font-medium text-white/90">
			Confirm Password
		</label>
		<input
			type="password"
			id="confirmPassword"
			name="confirmPassword"
			required
			minlength="8"
			autocomplete="new-password"
			class="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
			placeholder="••••••••"
		/>
	</div>

	{#if error}
		<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
			{error}
		</div>
	{/if}

	<button
		type="submit"
		disabled={loading}
		class="w-full rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-3 font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
	>
		{#if loading}
			Creating account...
		{:else}
			Create Account
		{/if}
	</button>
</form>
