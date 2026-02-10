<script lang="ts">
	import { goto } from '$app/navigation';
	import type { AnalyticalPlan, QueryResult } from '$lib/types/toon';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import LogoSpinner from '$lib/components/ui/LogoSpinner.svelte';
	import { Plus, ArrowRight, ChevronRight } from '@lucide/svelte';

	interface Dataset {
		id: string;
		name: string;
		rowCount: number;
	}

	interface Props {
		user?: { id: string; email: string } | null;
		datasets?: Dataset[];
		hasApiKey?: boolean;
	}

	let { user = null, datasets = [], hasApiKey = false }: Props = $props();

	// Logged out state
	let email = $state('');

	// Logged in state
	let question = $state('');
	let selectedDatasetId = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let currentPlan = $state<AnalyticalPlan | null>(null);
	let results = $state<Record<number, QueryResult> | null>(null);

	// File upload state
	let showUpload = $state(false);
	let uploadFile = $state<File | null>(null);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);

	function handleEmailSubmit(e: Event) {
		e.preventDefault();
		console.log('Request access for:', email);
	}

	async function handleQuery() {
		if (!question.trim() || isLoading) return;

		isLoading = true;
		error = null;
		currentPlan = null;
		results = null;

		try {
			const response = await fetch('/api/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question,
					datasetIds: selectedDatasetId ? [selectedDatasetId] : undefined,
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Query failed');
			}

			currentPlan = result.plan;
			results = result.results;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to execute query';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleQuery();
		}
	}

	async function handleUpload() {
		if (!uploadFile || isUploading) return;

		isUploading = true;
		uploadError = null;

		try {
			const formData = new FormData();
			formData.append('file', uploadFile);

			const response = await fetch('/api/datasets', {
				method: 'POST',
				body: formData,
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Upload failed');
			}

			// Select the newly uploaded dataset and close upload
			selectedDatasetId = result.dataset.id;
			showUpload = false;
			uploadFile = null;

			// Refresh page to get updated datasets
			window.location.reload();
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Failed to upload';
		} finally {
			isUploading = false;
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) {
			uploadFile = input.files[0];
		}
	}
</script>

<section class="relative z-10 bg-gradient-to-b from-[#0b1628] to-[#0d1a30] px-5 py-32 max-md:py-20">
	{#if user}
		<!-- Logged in: Show prompt interface -->
		<div class="mx-auto max-w-4xl">
			<div class="mb-8 text-center">
				<h2 class="mb-4 text-[2.25rem] font-semibold text-white/95 max-md:text-[1.75rem]">
					Ask your data anything
				</h2>
				<p class="text-lg text-white/60">
					Select a dataset and start exploring with natural language
				</p>
			</div>

			{#if !hasApiKey}
				<div class="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
					<p class="text-sm text-amber-400">
						Add your Gemini API key in <a href="/settings" class="underline hover:text-amber-300"
							>Settings</a
						> to start asking questions.
					</p>
				</div>
			{/if}

			<!-- Dataset Selection -->
			<div class="mb-6">
				<div class="flex flex-wrap items-center justify-center gap-3">
					{#if datasets.length > 0}
						<select
							bind:value={selectedDatasetId}
							class="min-w-[200px] rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white/90 outline-none focus:border-[rgba(100,255,150,0.5)]"
						>
							<option value={null}>All datasets</option>
							{#each datasets as dataset}
								<option value={dataset.id}
									>{dataset.name} ({dataset.rowCount.toLocaleString()} rows)</option
								>
							{/each}
						</select>
					{/if}
					<button
						type="button"
						onclick={() => (showUpload = !showUpload)}
						class="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
					>
						<Plus class="h-5 w-5" />
						Upload Data
					</button>
				</div>
			</div>

			<!-- Upload Panel -->
			{#if showUpload}
				<div class="mx-auto mb-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-6">
					<h3 class="mb-4 font-medium text-white">Upload a dataset</h3>
					{#if uploadError}
						<div
							class="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400"
						>
							{uploadError}
						</div>
					{/if}
					<input
						type="file"
						accept=".csv,.tsv,.json,.xlsx,.xls,.db,.sqlite"
						onchange={handleFileSelect}
						class="block w-full text-sm text-white/60 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#64ff96]/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#64ff96] hover:file:bg-[#64ff96]/20"
					/>
					{#if uploadFile}
						<div class="mt-4 flex items-center justify-between">
							<span class="text-sm text-white/60">{uploadFile.name}</span>
							<button
								type="button"
								onclick={handleUpload}
								disabled={isUploading}
								class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#0a1628] disabled:opacity-50"
							>
								{isUploading ? 'Uploading...' : 'Upload'}
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Query Input -->
			<div class="relative mx-auto mb-8 max-w-2xl">
				<input
					type="text"
					bind:value={question}
					onkeydown={handleKeydown}
					placeholder={datasets.length > 0
						? 'What would you like to know about your data?'
						: 'Upload a dataset to get started...'}
					disabled={!hasApiKey || datasets.length === 0}
					class="w-full rounded-xl border border-white/20 bg-white/5 px-6 py-4 pr-14 text-base text-white/90 transition-colors outline-none placeholder:text-white/40 focus:border-[rgba(100,255,150,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<button
					type="button"
					onclick={handleQuery}
					disabled={!question.trim() || isLoading || !hasApiKey || datasets.length === 0}
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] p-2.5 text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isLoading}
						<LogoSpinner class="h-5 w-5" />
					{:else}
						<ArrowRight class="h-5 w-5" />
					{/if}
				</button>
			</div>

			<!-- Error Display -->
			{#if error}
				<div
					class="mx-auto mb-6 max-w-2xl rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
				>
					{error}
				</div>
			{/if}

			<!-- Results Display -->
			{#if currentPlan?.feasible && currentPlan.viz && results}
				<div class="mt-8">
					<div class="grid gap-6 md:grid-cols-2">
						{#each currentPlan.viz as panel, i}
							{@const panelResult = results[i] || results[-1]}
							{#if panelResult}
								<ChartPanel {panel} result={panelResult} />
							{/if}
						{/each}
					</div>
					<div class="mt-6 text-center">
						<a
							href="/dashboard"
							class="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
						>
							Continue in Dashboard
							<ChevronRight class="h-4 w-4" />
						</a>
					</div>
				</div>
			{:else if currentPlan && !currentPlan.feasible}
				<div class="mx-auto max-w-2xl rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
					<h3 class="font-medium text-amber-400">Unable to Answer</h3>
					<p class="mt-2 text-white/70">{currentPlan.reason}</p>
				</div>
			{/if}

			<!-- Quick link to dashboard -->
			{#if !currentPlan}
				<div class="text-center">
					<a href="/dashboard" class="text-sm text-[#64ff96] hover:underline">
						Go to full dashboard →
					</a>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Logged out: Show signup form -->
		<div class="text-center">
			<h2 class="mb-4 text-[2.25rem] font-semibold text-white/95 max-md:text-[1.75rem]">
				Ready to see what your data is telling you?
			</h2>
			<p class="mb-10 text-lg text-white/60">
				Move beyond static dashboards. Ask questions, get answers.
			</p>
			<form
				onsubmit={handleEmailSubmit}
				class="mx-auto flex max-w-[500px] justify-center gap-3 max-md:flex-col"
			>
				<input
					type="email"
					bind:value={email}
					placeholder="Enter your work email"
					required
					class="flex-1 rounded-lg border border-white/20 bg-white/5 px-5 py-3.5 text-base text-white/90 transition-colors outline-none placeholder:text-white/40 focus:border-[rgba(100,255,150,0.5)] max-md:w-full"
				/>
				<button
					type="submit"
					class="cursor-pointer rounded-lg bg-gradient-to-br from-[#64ff96] to-[#3dd977] px-8 py-3.5 text-base font-semibold text-[#0a1628] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(100,255,150,0.3)]"
				>
					Request Access
				</button>
			</form>
			<p class="mt-6 text-sm text-white/40">
				Already have an account? <a href="/login" class="text-[#64ff96] hover:underline">Sign in</a>
			</p>
		</div>
	{/if}
</section>
