<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);

	async function handleDelete() {
		isDeleting = true;
		try {
			const response = await fetch(`/api/dashboards/${data.dashboard.id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
				goto(data.dashboard.contextId ? `/contexts/${data.dashboard.contextId}` : '/contexts');
			}
		} finally {
			isDeleting = false;
		}
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>{data.dashboard.name} - SiteSeer</title>
</svelte:head>

<div class="p-8">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-start justify-between">
			<div>
				<a
					href={data.dashboard.contextId ? `/contexts/${data.dashboard.contextId}` : '/contexts'}
					class="text-sm text-white/50 hover:text-white/70 mb-2 inline-block"
				>
					← Back
				</a>
				<h1 class="text-2xl font-bold text-white">{data.dashboard.name}</h1>
				<p class="mt-1 text-white/60">{data.dashboard.question}</p>
				{#if data.dashboard.description}
					<p class="mt-2 text-sm text-white/50">{data.dashboard.description}</p>
				{/if}
				<p class="mt-2 text-xs text-white/40">
					Saved {formatDate(data.dashboard.createdAt)}
				</p>
			</div>
			<button
				type="button"
				onclick={() => showDeleteConfirm = true}
				class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
				</svg>
				Delete
			</button>
		</div>
	</div>

	<!-- Visualization Panels -->
	{#if data.dashboard.plan?.viz && Object.keys(data.results).length > 0}
		<div class="grid gap-6 md:grid-cols-2">
			{#each data.dashboard.plan.viz as panel, i}
				{@const result = data.results[i]}
				{#if result}
					{#if result.error}
						<div class="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
							<h3 class="font-medium text-white mb-2">{panel.title}</h3>
							<p class="text-sm text-red-400">Error: {result.error}</p>
						</div>
					{:else}
						<ChartPanel {panel} result={result} />
					{/if}
				{/if}
			{/each}
		</div>
	{:else}
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
			<p class="text-white/60">No visualizations available</p>
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirm}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-sm rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl">
			<h2 class="text-lg font-semibold text-white mb-2">Delete Dashboard</h2>
			<p class="text-white/60 text-sm mb-6">
				Are you sure you want to delete "{data.dashboard.name}"? This action cannot be undone.
			</p>

			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={() => showDeleteConfirm = false}
					class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleDelete}
					disabled={isDeleting}
					class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
				>
					{#if isDeleting}
						Deleting...
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
