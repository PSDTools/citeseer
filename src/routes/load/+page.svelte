<script lang="ts">
	import LogoSpinner from '$lib/components/ui/LogoSpinner.svelte';
</script>

<svelte:head>
	<title>Loading</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050810]">
	<div
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(100,255,150,0.08),transparent_58%),linear-gradient(180deg,#060b14_0%,#04070f_100%)]"
	></div>
	<div
		class="relative z-10 flex h-72 w-72 items-center justify-center rounded-full border border-white/10 bg-white/[0.015] shadow-[0_0_80px_rgba(100,255,150,0.08)]"
	>
		<LogoSpinner class="h-44 w-44" label="Loading" />
	</div>
</div>
