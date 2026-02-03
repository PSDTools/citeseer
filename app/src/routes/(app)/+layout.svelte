<script lang="ts">
	import Sidebar from '$lib/components/app/Sidebar.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<div class="min-h-screen bg-[#050810]">
	<Sidebar user={data.user} org={data.org} datasets={data.datasets} contexts={data.contexts} />

	<main class="ml-64 min-h-screen">
		{@render children()}
	</main>
</div>
