<script lang="ts">
	import Sidebar from '$lib/components/app/Sidebar.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import logo from '$lib/assets/logo.svg';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	let sidebarOpen = $state(false);
</script>

<div class="min-h-screen bg-[#050810]">
	<!-- Mobile header -->
	<div
		class="sticky top-0 z-30 flex h-14 items-center border-b border-white/10 bg-[#050810]/95 px-4 backdrop-blur lg:hidden"
	>
		<button
			type="button"
			onclick={() => (sidebarOpen = true)}
			class="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white"
			aria-label="Open menu"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
				/>
			</svg>
		</button>
		<a href="/" class="ml-3 flex items-center gap-2 text-lg font-bold">
			<img src={logo} alt="CiteSeer logo" class="h-5 w-5" />
			<span class="bg-gradient-to-r from-[#64ff96] to-[#3dd977] bg-clip-text text-transparent">
				CiteSeer
			</span>
		</a>
	</div>

	<!-- Mobile backdrop -->
	{#if sidebarOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<div
			class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
			onclick={() => (sidebarOpen = false)}
		></div>
	{/if}

	<Sidebar
		user={data.user}
		org={data.org}
		datasets={data.datasets}
		contexts={data.contexts}
		mobileOpen={sidebarOpen}
		onclose={() => (sidebarOpen = false)}
	/>

	<main class="min-h-screen lg:ml-64">
		{@render children()}
	</main>
</div>
