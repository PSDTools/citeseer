<script lang="ts">
	import SignupForm from '$lib/components/auth/SignupForm.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign Up - SiteSeer</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-[#050810] px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<a href="/" class="inline-block">
				<h1 class="text-3xl font-bold">
					<span
						class="bg-gradient-to-r from-[#64ff96] to-[#3dd977] bg-clip-text text-transparent"
					>
						SiteSeer
					</span>
				</h1>
			</a>
			<p class="mt-2 text-white/60">Create your account</p>
		</div>

		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm">
			<SignupForm error={form?.error} />

			<div class="mt-6 text-center text-sm text-white/60">
				Already have an account?
				<a href="/login" class="text-[#64ff96] hover:underline">Sign in</a>
			</div>
		</div>
	</div>
</div>
