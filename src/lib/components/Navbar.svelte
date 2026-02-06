<script lang="ts">
	import logo from '$lib/assets/logo.svg';
</script>

<nav
	class="fixed top-0 right-0 left-0 z-50 border-b border-white/[0.06] bg-[#050810]/80 px-8 py-4 backdrop-blur-xl"
>
	<div class="mx-auto flex max-w-[1400px] items-center justify-between">
		<a href="/" class="flex items-center gap-3 text-xl font-bold tracking-wide">
			<img src={logo} alt="CiteSeer logo" class="h-6 w-6" />
			<span class="bg-gradient-to-r from-[#64ff96] to-[#3dd977] bg-clip-text text-transparent">
				CiteSeer
			</span>
		</a>

		<div class="hidden gap-9 md:flex">
			<a
				href="#features"
				class="text-[0.95rem] font-medium text-white/70 transition-colors hover:text-white"
				>Features</a
			>
			<a
				href="#how-it-works"
				class="text-[0.95rem] font-medium text-white/70 transition-colors hover:text-white"
				>How It Works</a
			>
			<a
				href="/dashboard"
				class="text-[0.95rem] font-medium text-white/70 transition-colors hover:text-white"
				>Dashboard</a
			>
		</div>

		<div class="flex items-center gap-6">
			<a
				href="/login"
				class="text-[0.95rem] font-medium text-white/80 transition-colors hover:text-white"
				>Log In</a
			>
			<a
				href="/signup"
				class="cursor-pointer rounded-md bg-gradient-to-br from-[#64ff96] to-[#3dd977] px-5 py-2.5 text-sm font-semibold text-[#0a1628] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(100,255,150,0.3)]"
			>
				Get Started
			</a>
		</div>
	</div>
</nav>
