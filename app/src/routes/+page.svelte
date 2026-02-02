<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import StarCanvas from '$lib/components/StarCanvas.svelte';
	import Features from '$lib/components/Features.svelte';
	import HowItWorks from '$lib/components/HowItWorks.svelte';
	import CTA from '$lib/components/CTA.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>CiteSeer - Question-Driven Analytics</title>
</svelte:head>

<div class="w-full relative">
	<Navbar />
	<StarCanvas />
	<Features />
	<HowItWorks />
	<CTA />
	<Footer />
</div>
