<script lang="ts">
	import { page } from '$app/stores';

	interface Dataset {
		id: string;
		name: string;
		rowCount: number;
	}

	interface Dashboard {
		id: string;
		name: string;
	}

	interface Context {
		id: string;
		name: string;
		dashboards: Dashboard[];
	}

	interface Props {
		user: { id: string; email: string };
		org: { id: string; name: string; slug: string };
		datasets: Dataset[];
		contexts: Context[];
	}

	let { user, org, datasets, contexts }: Props = $props();

	let contextsExpanded = $state(true);
	let datasetsExpanded = $state(false);
	let expandedContexts = $state<Set<string>>(new Set());

	const settingsIcon = 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z';

	function isActive(href: string) {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	function isContextActive(id: string) {
		return $page.url.pathname.startsWith(`/contexts/${id}`);
	}

	function isDatasetActive(id: string) {
		return $page.url.pathname === `/datasets/${id}`;
	}

	function isDashboardActive(id: string) {
		return $page.url.pathname === `/saved/${id}`;
	}

	function toggleContext(id: string) {
		const newSet = new Set(expandedContexts);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedContexts = newSet;
	}

	// Auto-expand context if we're on it (only run once on mount or pathname change)
	$effect(() => {
		const pathname = $page.url.pathname;
		const match = pathname.match(/\/contexts\/([^/]+)/);
		if (match && !expandedContexts.has(match[1])) {
			expandedContexts = new Set([...expandedContexts, match[1]]);
		}
	});
</script>

<aside class="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/10 bg-[#050810]">
	<div class="flex h-full flex-col">
		<!-- Logo -->
		<div class="flex h-16 items-center border-b border-white/10 px-6">
			<a href="/" class="text-xl font-bold">
				<span class="bg-gradient-to-r from-[#64ff96] to-[#3dd977] bg-clip-text text-transparent">
					SiteSeer
				</span>
			</a>
		</div>

		<!-- Organization -->
		<div class="border-b border-white/10 px-4 py-3">
			<div class="rounded-lg bg-white/5 px-3 py-2">
				<p class="text-xs text-white/50">Workspace</p>
				<p class="text-sm font-medium text-white truncate">{org.name}</p>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 px-3 py-4 overflow-y-auto">
			<!-- Contexts Section -->
			<div>
				<button
					type="button"
					onclick={() => contextsExpanded = !contextsExpanded}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {isActive('/contexts')
						? 'bg-[#64ff96]/10 text-[#64ff96]'
						: 'text-white/70 hover:bg-white/5 hover:text-white'}"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>
					<span class="flex-1 text-left">Contexts</span>
					<svg
						class="h-4 w-4 transition-transform {contextsExpanded ? 'rotate-180' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>

				{#if contextsExpanded}
					<div class="mt-1 ml-2 space-y-0.5">
						{#if contexts.length === 0}
							<p class="px-3 py-2 text-xs text-white/40">No contexts yet</p>
						{:else}
							{#each contexts as context}
								<div>
									<div class="flex items-center">
										{#if context.dashboards.length > 0}
											<button
												type="button"
												onclick={() => toggleContext(context.id)}
												class="p-1 text-white/30 hover:text-white/60"
											>
												<svg
													class="h-3 w-3 transition-transform {expandedContexts.has(context.id) ? 'rotate-90' : ''}"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
												</svg>
											</button>
										{:else}
											<div class="w-5"></div>
										{/if}
										<a
											href="/contexts/{context.id}"
											class="flex-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors {isContextActive(context.id)
												? 'bg-[#64ff96]/10 text-[#64ff96]'
												: 'text-white/60 hover:bg-white/5 hover:text-white/80'}"
										>
											<span class="truncate">{context.name}</span>
										</a>
									</div>
									{#if expandedContexts.has(context.id) && context.dashboards.length > 0}
										<div class="ml-6 mt-0.5 space-y-0.5">
											{#each context.dashboards as dashboard}
												<a
													href="/saved/{dashboard.id}"
													class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors {isDashboardActive(dashboard.id)
														? 'bg-[#64ff96]/10 text-[#64ff96]'
														: 'text-white/40 hover:bg-white/5 hover:text-white/60'}"
												>
													<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
													</svg>
													<span class="truncate">{dashboard.name}</span>
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						{/if}
						<a
							href="/contexts"
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
							<span>New context</span>
						</a>
					</div>
				{/if}
			</div>

			<!-- Datasets Section -->
			<div class="mt-2">
				<button
					type="button"
					onclick={() => datasetsExpanded = !datasetsExpanded}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {isActive('/datasets')
						? 'bg-[#64ff96]/10 text-[#64ff96]'
						: 'text-white/70 hover:bg-white/5 hover:text-white'}"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
					</svg>
					<span class="flex-1 text-left">Datasets</span>
					<span class="text-xs text-white/30">{datasets.length}</span>
					<svg
						class="h-4 w-4 transition-transform {datasetsExpanded ? 'rotate-180' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>

				{#if datasetsExpanded}
					<div class="mt-1 ml-4 space-y-0.5">
						{#if datasets.length === 0}
							<p class="px-3 py-2 text-xs text-white/40">No datasets yet</p>
						{:else}
							{#each datasets as dataset}
								<a
									href="/datasets/{dataset.id}"
									class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {isDatasetActive(dataset.id)
										? 'bg-[#64ff96]/10 text-[#64ff96]'
										: 'text-white/50 hover:bg-white/5 hover:text-white/80'}"
								>
									<span class="flex-1 truncate">{dataset.name}</span>
									<span class="text-xs text-white/30">{dataset.rowCount.toLocaleString()}</span>
								</a>
							{/each}
						{/if}
						<a
							href="/datasets"
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
							<span>Upload new</span>
						</a>
					</div>
				{/if}
			</div>

			<!-- Settings -->
			<a
				href="/settings"
				class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mt-2 {isActive('/settings')
					? 'bg-[#64ff96]/10 text-[#64ff96]'
					: 'text-white/70 hover:bg-white/5 hover:text-white'}"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={settingsIcon} />
				</svg>
				Settings
			</a>
		</nav>

		<!-- User -->
		<div class="border-t border-white/10 p-4">
			<div class="flex items-center gap-3">
				<div class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#64ff96] to-[#3dd977] text-sm font-semibold text-[#050810]">
					{user.email[0].toUpperCase()}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-white truncate">{user.email}</p>
				</div>
				<a
					href="/logout"
					class="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
					title="Sign out"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
					</svg>
				</a>
			</div>
		</div>
	</div>
</aside>
