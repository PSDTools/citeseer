<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import BranchMenu from '$lib/components/viz/BranchMenu.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Trash2,
		ShieldCheck,
		Pencil,
		ArrowUp,
		ArrowDown,
	} from '@lucide/svelte';
	import type { PageData } from './$types';
	import type { BranchContext, ChartSelectDetail } from '$lib/types/toon';

	let { data }: { data: PageData } = $props();

	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let showBranchMenu = $state(false);
	let branchMenuX = $state(0);
	let branchMenuY = $state(0);
	let branchMenuDetail = $state<ChartSelectDetail | null>(null);
	let showDemoPresetEditor = $state(false);
	let demoPresetRegex = $state('');
	let demoPresetFlags = $state('i');
	let demoPresetJson = $state('');
	let demoPresetSaving = $state(false);
	let demoPresetError = $state<string | null>(null);
	let showChartEditor = $state(false);
	let chartEditorIndex = $state<number | null>(null);
	let chartPanelJson = $state('');
	let chartResultJson = $state('');
	let chartEditorSaving = $state(false);
	let chartEditorError = $state<string | null>(null);
	let showSummaryEditor = $state(false);
	let summaryDraft = $state('');
	let summarySaving = $state(false);
	let summaryError = $state<string | null>(null);
	function canEditAiArtifacts() {
		return data.demoAvailable && !data.demoModeEnabled;
	}

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

	function escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function openDemoPresetEditor() {
		demoPresetRegex = `^${escapeRegex(data.dashboard.question)}$`;
		demoPresetFlags = 'i';
		demoPresetJson = JSON.stringify(
			{
				query: {
					plan: data.dashboard.plan,
					results: data.results,
				},
			},
			null,
			2,
		);
		demoPresetError = null;
		showDemoPresetEditor = true;
	}

	async function saveDemoPreset() {
		demoPresetSaving = true;
		demoPresetError = null;
		try {
			const parsed = JSON.parse(demoPresetJson);
			const response = await fetch('/api/demo/presets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: data.dashboard.question,
					regex: demoPresetRegex.trim(),
					flags: demoPresetFlags.trim() || 'i',
					response: parsed,
				}),
			});
			if (!response.ok) {
				const result = await response.json().catch(() => ({}));
				throw new Error(result.message || 'Failed to save preset');
			}
			showDemoPresetEditor = false;
		} catch (e) {
			demoPresetError = e instanceof Error ? e.message : 'Failed to save preset';
		} finally {
			demoPresetSaving = false;
		}
	}

	function openChartEditor(index: number, panel: unknown, panelResult: unknown) {
		chartEditorIndex = index;
		chartPanelJson = JSON.stringify(panel, null, 2);
		chartResultJson = JSON.stringify(panelResult, null, 2);
		chartEditorError = null;
		showChartEditor = true;
	}

	async function saveChartEdits() {
		if (chartEditorIndex === null || !data.dashboard.plan?.viz) return;
		chartEditorSaving = true;
		chartEditorError = null;
		try {
			const updatedPanel = JSON.parse(chartPanelJson);
			const updatedResult = JSON.parse(chartResultJson);

			data.dashboard.plan.viz[chartEditorIndex] = updatedPanel;
			data.results[chartEditorIndex] = updatedResult;
			showChartEditor = false;
		} catch (e) {
			chartEditorError = e instanceof Error ? e.message : 'Failed to apply chart edits';
		} finally {
			chartEditorSaving = false;
		}
	}

	async function saveChartEditsToPreset() {
		chartEditorSaving = true;
		chartEditorError = null;
		try {
			await saveChartEdits();
			const response = await fetch('/api/demo/presets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: data.dashboard.question,
					regex: `^${escapeRegex(data.dashboard.question)}$`,
					flags: 'i',
					response: {
						query: {
							plan: data.dashboard.plan,
							results: data.results,
						},
					},
				}),
			});
			if (!response.ok) {
				const result = await response.json().catch(() => ({}));
				throw new Error(result.message || 'Failed to save chart preset');
			}
			showChartEditor = false;
		} catch (e) {
			chartEditorError = e instanceof Error ? e.message : 'Failed to save chart preset';
		} finally {
			chartEditorSaving = false;
		}
	}

	function openSummaryEditor() {
		summaryDraft = data.dashboard.plan?.executiveSummary || '';
		summaryError = null;
		showSummaryEditor = true;
	}

	async function saveExecutiveSummary() {
		if (!data.dashboard.plan) return;
		summarySaving = true;
		summaryError = null;
		try {
			const nextPlan = structuredClone(data.dashboard.plan);
			nextPlan.executiveSummary = summaryDraft.trim();

			const response = await fetch(`/api/dashboards/${data.dashboard.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ plan: nextPlan }),
			});

			if (!response.ok) {
				const result = await response.json().catch(() => ({}));
				throw new Error(result.message || 'Failed to save executive summary');
			}

			data.dashboard.plan = nextPlan;
			showSummaryEditor = false;
		} catch (e) {
			summaryError = e instanceof Error ? e.message : 'Failed to save executive summary';
		} finally {
			summarySaving = false;
		}
	}

	function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
		const next = [...arr];
		const [moved] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, moved);
		return next;
	}

	async function moveChart(index: number, direction: -1 | 1) {
		if (!data.dashboard.plan?.viz) return;
		const toIndex = index + direction;
		if (toIndex < 0 || toIndex >= data.dashboard.plan.viz.length) return;

		const nextPlan = structuredClone(data.dashboard.plan);
		nextPlan.viz = reorderArray(nextPlan.viz || [], index, toIndex);

		const order = reorderArray(
			Array.from({ length: data.dashboard.plan.viz.length }, (_, i) => i),
			index,
			toIndex,
		);
		const nextResults: Record<number, (typeof data.results)[number]> = {};
		if (data.results[-1]) {
			nextResults[-1] = data.results[-1];
		}
		order.forEach((oldIdx, newIdx) => {
			if (data.results[oldIdx] !== undefined) {
				nextResults[newIdx] = data.results[oldIdx];
			}
		});

		const response = await fetch(`/api/dashboards/${data.dashboard.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				plan: nextPlan,
				panels: nextPlan.viz || [],
				results: nextResults,
			}),
		});

		if (!response.ok) {
			return;
		}

		data.dashboard.plan = nextPlan;
		data.results = nextResults;
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
			{#if canEditAiArtifacts()}
				<button
					type="button"
					onclick={openDemoPresetEditor}
					class="flex flex-shrink-0 items-center gap-2 rounded-lg border border-[#64ff96]/20 bg-[#64ff96]/10 px-3 py-2 text-sm text-[#64ff96] transition-colors hover:bg-[#64ff96]/20"
					title="Edit and save this AI output as a demo preset"
				>
					<Pencil class="h-4 w-4" />
					Save Preset
				</button>
			{/if}
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
					<div class="flex-1">
						<div class="mb-1 flex items-center justify-between gap-2">
							<h3 class="text-sm font-medium text-[#64ff96]">Executive Summary</h3>
							{#if canEditAiArtifacts()}
								<button
									type="button"
									onclick={openSummaryEditor}
									class="inline-flex items-center gap-1 rounded-md border border-[#64ff96]/30 bg-[#64ff96]/10 px-2 py-1 text-[11px] text-[#64ff96] transition-colors hover:bg-[#64ff96]/20"
									title="Edit executive summary"
								>
									<Pencil class="h-3 w-3" />
									Edit
								</button>
							{/if}
						</div>
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
						<div>
							<div class="mb-2 flex justify-end">
								{#if canEditAiArtifacts()}
									<button
										type="button"
										onclick={() => moveChart(i, -1)}
										disabled={i === 0}
										class="mr-1 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
										title="Move chart up"
									>
										<ArrowUp class="h-3 w-3" />
									</button>
									<button
										type="button"
										onclick={() => moveChart(i, 1)}
										disabled={i === data.dashboard.plan.viz.length - 1}
										class="mr-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
										title="Move chart down"
									>
										<ArrowDown class="h-3 w-3" />
									</button>
									<button
										type="button"
										onclick={() => openChartEditor(i, panel, result)}
										class="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
										title="Edit this chart"
									>
										<Pencil class="h-3 w-3" />
										Edit chart
									</button>
								{/if}
							</div>
							<ChartPanel
								{panel}
								{result}
								panelIndex={i}
								interactive={true}
								on:select={(event) => openBranchMenu(event.detail)}
							/>
						</div>
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

<Modal open={showChartEditor} onclose={() => (showChartEditor = false)} maxWidth="max-w-3xl">
	<h2 class="mb-2 text-lg font-semibold text-white">Chart Editor</h2>
	<p class="mb-4 text-sm text-white/50">Edit this panel spec and its result JSON.</p>
	<div class="space-y-3">
		<div>
			<label for="saved-chart-panel-json" class="mb-1 block text-xs text-white/60">Panel JSON</label
			>
			<textarea
				id="saved-chart-panel-json"
				bind:value={chartPanelJson}
				rows="10"
				class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
			></textarea>
		</div>
		<div>
			<label for="saved-chart-result-json" class="mb-1 block text-xs text-white/60"
				>Result JSON</label
			>
			<textarea
				id="saved-chart-result-json"
				bind:value={chartResultJson}
				rows="10"
				class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
			></textarea>
		</div>
		{#if chartEditorError}
			<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
				{chartEditorError}
			</div>
		{/if}
	</div>
	<div class="mt-4 flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showChartEditor = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={saveChartEdits}
			disabled={chartEditorSaving}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all disabled:cursor-not-allowed disabled:opacity-50"
		>
			Apply
		</button>
		{#if data.demoAvailable && !data.demoModeEnabled}
			<button
				type="button"
				onclick={saveChartEditsToPreset}
				disabled={chartEditorSaving}
				class="rounded-lg border border-[#64ff96]/20 bg-[#64ff96]/10 px-4 py-2 text-sm font-semibold text-[#64ff96] transition-colors hover:bg-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Apply + Save Preset
			</button>
		{/if}
	</div>
</Modal>

<Modal open={showSummaryEditor} onclose={() => (showSummaryEditor = false)} maxWidth="max-w-xl">
	<h2 class="mb-2 text-lg font-semibold text-white">Edit Executive Summary</h2>
	<p class="mb-4 text-sm text-white/50">
		Update the summary text shown at the top of this dashboard.
	</p>

	<div>
		<label for="saved-exec-summary-editor" class="mb-1 block text-xs text-white/60">Summary</label>
		<textarea
			id="saved-exec-summary-editor"
			bind:value={summaryDraft}
			rows="8"
			class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
		></textarea>
	</div>

	{#if summaryError}
		<div
			class="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400"
		>
			{summaryError}
		</div>
	{/if}

	<div class="mt-4 flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showSummaryEditor = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={saveExecutiveSummary}
			disabled={summarySaving}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if summarySaving}Saving...{:else}Save Summary{/if}
		</button>
	</div>
</Modal>

<Modal
	open={showDemoPresetEditor}
	onclose={() => (showDemoPresetEditor = false)}
	maxWidth="max-w-3xl"
>
	<h2 class="mb-2 text-lg font-semibold text-white">Demo Preset Editor</h2>
	<p class="mb-4 text-sm text-white/50">
		Edit regex and response JSON, then save to <code>data/demo.json</code>.
	</p>

	<div class="space-y-3">
		<div>
			<label for="saved-demo-preset-question" class="mb-1 block text-xs text-white/60"
				>Question</label
			>
			<input
				id="saved-demo-preset-question"
				type="text"
				value={data.dashboard.question}
				disabled
				class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70"
			/>
		</div>
		<div class="grid gap-3 md:grid-cols-[1fr_100px]">
			<div>
				<label for="saved-demo-preset-regex" class="mb-1 block text-xs text-white/60">Regex</label>
				<input
					id="saved-demo-preset-regex"
					type="text"
					bind:value={demoPresetRegex}
					class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
				/>
			</div>
			<div>
				<label for="saved-demo-preset-flags" class="mb-1 block text-xs text-white/60">Flags</label>
				<input
					id="saved-demo-preset-flags"
					type="text"
					bind:value={demoPresetFlags}
					class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
				/>
			</div>
		</div>
		<div>
			<label for="saved-demo-preset-json" class="mb-1 block text-xs text-white/60"
				>Response JSON</label
			>
			<textarea
				id="saved-demo-preset-json"
				bind:value={demoPresetJson}
				rows="16"
				class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
			></textarea>
		</div>
		{#if demoPresetError}
			<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
				{demoPresetError}
			</div>
		{/if}
	</div>

	<div class="mt-4 flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showDemoPresetEditor = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={saveDemoPreset}
			disabled={demoPresetSaving}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if demoPresetSaving}Saving...{:else}Save to demo.json{/if}
		</button>
	</div>
</Modal>
