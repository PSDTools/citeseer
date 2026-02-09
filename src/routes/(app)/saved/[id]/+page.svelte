<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import BranchMenu from '$lib/components/viz/BranchMenu.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { ChevronLeft, ChevronRight, Trash2, ShieldCheck } from '@lucide/svelte';
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
				method: 'DELETE',
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
			year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
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
				datum: detail.datum,
			},
		};

		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(
				'citeseer.branchContext',
				JSON.stringify({
					contextId: data.dashboard.contextId,
					question: prompt,
					branchContext,
				}),
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
					class="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/70"
				>
					<ChevronLeft class="h-4 w-4" />
					Back
				</a>

				{#if data.breadcrumb?.length}
					<nav class="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-white/50">
						{#each data.breadcrumb as crumb, idx}
							<a href="/saved/{crumb.id}" class="transition-colors hover:text-white/70">
								{crumb.name}
							</a>
							{#if idx < data.breadcrumb.length - 1}
								<ChevronRight class="h-3.5 w-3.5 text-white/20" />
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
							<span
								class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/60"
							>
								{field} = {String(value)}
							</span>
						{/each}
					{/if}

					{#if data.dashboard.nodeContext?.selectedMark}
						<span
							class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/60"
						>
							Selected: {data.dashboard.nodeContext.selectedMark.field} = {String(
								data.dashboard.nodeContext.selectedMark.value,
							)}
						</span>
					{/if}
				</div>
			</div>
			<button
				type="button"
				onclick={() => (showDeleteConfirm = true)}
				class="flex flex-shrink-0 items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10"
			>
				<Trash2 class="h-4 w-4" />
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
					<div
						class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[#64ff96]/20 bg-[#64ff96]/10"
					>
						<ShieldCheck class="h-4 w-4 text-[#64ff96]" />
					</div>
					<div>
						<h3 class="mb-1 text-sm font-medium text-[#64ff96]">Executive Summary</h3>
						<p class="leading-relaxed text-white/90">{data.dashboard.plan.executiveSummary}</p>
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
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 no-underline transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
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
							<h3 class="mb-2 font-medium text-white">{panel.title}</h3>
							<p class="text-sm text-red-400">Error: {result.error}</p>
						</div>
					{:else}
						<ChartPanel
							{panel}
							{result}
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
<Modal open={showDeleteConfirm} onclose={() => (showDeleteConfirm = false)} maxWidth="max-w-sm">
	<h2 class="mb-2 text-lg font-semibold text-white">Delete Dashboard</h2>
	<p class="mb-6 text-sm text-white/50">
		Are you sure you want to delete "{data.dashboard.name}"? This action cannot be undone.
	</p>

	<div class="flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showDeleteConfirm = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleDelete}
			disabled={isDeleting}
			class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isDeleting}Deleting...{:else}Delete{/if}
		</button>
	</div>
</Modal>
