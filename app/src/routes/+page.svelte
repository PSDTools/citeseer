<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import StarCanvas from '$lib/components/StarCanvas.svelte';
	import Features from '$lib/components/Features.svelte';
	import HowItWorks from '$lib/components/HowItWorks.svelte';
	import CTA from '$lib/components/CTA.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>CiteSeer - Question-Driven Analytics</title>
</svelte:head>

<div class="relative w-full">
	<Navbar />
	<StarCanvas />
	<Features />
	<HowItWorks />
	<CTA user={data.user} datasets={data.datasets} hasApiKey={data.hasApiKey} />
	<Footer />
</div>
