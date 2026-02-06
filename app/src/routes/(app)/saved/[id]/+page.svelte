<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import BranchMenu from '$lib/components/viz/BranchMenu.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { PageData } from './$types';
	import type { BranchContext, ChartSelectDetail } from '$lib/types/toon';

	let { data }: { data: PageData } = $props();

	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let showBranchMenu = $state(false);
	let branchMenuX = $state(0);
	let branchMenuY = $state(0);
	let branchMenuDetail = $state<ChartSelectDetail | null>(null);

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

	function formatRelativeDate(date: Date | string) {
		const now = new Date();
		const then = new Date(date);
		const diffMs = now.getTime() - then.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return then.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
		});
	}

	function openBranchMenu(detail: ChartSelectDetail) {
		if (!data.dashboard.contextId) return;
		if (!detail.field || detail.value == null) return;
		branchMenuDetail = detail;

		const menuW = 360;
		const menuH = 320;
		branchMenuX = Math.min(detail.clientX, window.innerWidth - menuW - 16);
		branchMenuY = Math.min(detail.clientY, window.innerHeight - menuH - 16);
		branchMenuX = Math.max(16, branchMenuX);
		branchMenuY = Math.max(16, branchMenuY);

		showBranchMenu = true;
	}

	function closeBranchMenu() {
		showBranchMenu = false;
		branchMenuDetail = null;
	}

	function submitBranchPrompt(prompt: string) {
		if (!branchMenuDetail || !data.dashboard.contextId) return;

		const detail = branchMenuDetail;
		const panel = data.dashboard.plan?.viz?.[detail.panelIndex ?? -1];
		const parentSql = panel?.sql || data.dashboard.plan?.sql;

		const branchContext: BranchContext = {
			parentDashboardId: data.dashboard.id,
			parentQuestion: data.dashboard.question,
			parentSql,
			filters: { [detail.field!]: detail.value! },
			selectedMark: {
				panelIndex: detail.panelIndex,
				panelTitle: detail.panelTitle,
				field: detail.field!,
				value: detail.value!,
				metricField: detail.metricField,
				metricValue: detail.metricValue,
				datum: detail.datum
			}
		};

		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(
				'citeseer.branchContext',
				JSON.stringify({
					contextId: data.dashboard.contextId,
					question: prompt,
					branchContext
				})
			);
		}

		closeBranchMenu();
		goto(`/contexts/${data.dashboard.contextId}?q=${encodeURIComponent(prompt)}`);
	}
</script>

<svelte:head>
	<title>{data.dashboard.name} - CiteSeer</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<a
					href={data.dashboard.contextId ? `/contexts/${data.dashboard.contextId}` : '/contexts'}
					class="text-sm text-white/40 hover:text-white/70 mb-3 inline-flex items-center gap-1.5 transition-colors"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
					Back
				</a>

				{#if data.breadcrumb?.length}
					<nav class="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-white/50">
						{#each data.breadcrumb as crumb, idx}
							<a href="/saved/{crumb.id}" class="hover:text-white/70 transition-colors">
								{crumb.name}
							</a>
							{#if idx < data.breadcrumb.length - 1}
								<svg class="h-3.5 w-3.5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							{/if}
						{/each}
					</nav>
				{/if}

				<h1 class="text-2xl font-bold text-white">{data.dashboard.name}</h1>
				<p class="mt-1 text-white/50">{data.dashboard.question}</p>

				{#if data.dashboard.description}
					<p class="mt-2 text-sm text-white/50">{data.dashboard.description}</p>
				{/if}

				<div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/40">
					<span>Saved {formatRelativeDate(data.dashboard.createdAt)}</span>

					{#if data.dashboard.nodeContext?.filters}
						<span class="h-3 w-px bg-white/10"></span>
						{#each Object.entries(data.dashboard.nodeContext.filters) as [field, value]}
							<span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/60">
								{field} = {String(value)}
							</span>
						{/each}
					{/if}

					{#if data.dashboard.nodeContext?.selectedMark}
						<span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/60">
							Selected: {data.dashboard.nodeContext.selectedMark.field} = {String(data.dashboard.nodeContext.selectedMark.value)}
						</span>
					{/if}
				</div>
			</div>
			<button
				type="button"
				onclick={() => showDeleteConfirm = true}
				class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors flex-shrink-0"
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
		<!-- Executive Summary -->
		{#if data.dashboard.plan.executiveSummary}
			<div class="mb-6 rounded-xl border border-[#64ff96]/20 bg-[#64ff96]/5 p-5">
				<div class="flex items-start gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#64ff96]/10 border border-[#64ff96]/20 flex-shrink-0">
						<svg class="h-4 w-4 text-[#64ff96]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
					</div>
					<div>
						<h3 class="text-sm font-medium text-[#64ff96] mb-1">Executive Summary</h3>
						<p class="text-white/90 leading-relaxed">{data.dashboard.plan.executiveSummary}</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Suggested Investigations -->
		{#if data.dashboard.plan.suggestedInvestigations && data.dashboard.plan.suggestedInvestigations.length > 0}
			<div class="mb-6 flex flex-wrap gap-2">
				{#each data.dashboard.plan.suggestedInvestigations as investigation, i (i)}
					<a
						href="/contexts/{data.dashboard.contextId}?q={encodeURIComponent(investigation)}"
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-colors no-underline"
					>
						{investigation}
					</a>
				{/each}
			</div>
		{/if}

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
						<ChartPanel
							{panel}
							result={result}
							panelIndex={i}
							interactive={true}
							on:select={(event) => openBranchMenu(event.detail)}
						/>
					{/if}
				{/if}
			{/each}
		</div>
	{:else}
		<div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center">
			<p class="text-white/50">No visualizations available</p>
		</div>
	{/if}
</div>

<!-- Branch Menu -->
{#if showBranchMenu && branchMenuDetail}
	<BranchMenu
		detail={branchMenuDetail}
		x={branchMenuX}
		y={branchMenuY}
		lastQuestion={data.dashboard.question}
		onsubmit={submitBranchPrompt}
		onclose={closeBranchMenu}
	/>
{/if}

<!-- Delete Confirmation Dialog -->
<Modal open={showDeleteConfirm} onclose={() => showDeleteConfirm = false} maxWidth="max-w-sm">
	<h2 class="text-lg font-semibold text-white mb-2">Delete Dashboard</h2>
	<p class="text-white/50 text-sm mb-6">
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
			class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if isDeleting}Deleting...{:else}Delete{/if}
		</button>
	</div>
</Modal>
