<script lang="ts">
</script>

<!-- Hill -->
<div class="hill" aria-hidden="true"></div>

<!-- Telescope silhouette -->
<svg
	class="telescope"
	viewBox="0 0 100 100"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
>
	<!-- Tripod legs -->
	<path d="M50 62 L30 98" stroke="black" stroke-width="3" stroke-linecap="round" />
	<path d="M50 62 L70 98" stroke="black" stroke-width="3" stroke-linecap="round" />
	<path d="M50 62 L50 98" stroke="black" stroke-width="3" stroke-linecap="round" />

	<!-- Mount -->
	<circle cx="50" cy="60" r="6" fill="black" />

	<!-- Telescope tube (angled up-right) -->
	<g transform="rotate(-35, 50, 58)">
		<!-- Main tube -->
		<rect x="35" y="52" width="45" height="12" rx="2" fill="black" />
		<!-- Dew shield -->
		<path d="M78 51 L85 49 L85 67 L78 65 Z" fill="black" />
		<!-- Eyepiece -->
		<rect x="25" y="54" width="12" height="8" rx="1" fill="black" />
		<!-- Finder scope -->
		<rect x="45" y="47" width="16" height="4" rx="1" fill="black" />
	</g>
</svg>

<style>
	.hill {
		position: absolute;
		z-index: 4;
		pointer-events: none;
		left: -20vw;
		bottom: -38vh;
		width: 80vw;
		height: 50vh;
		border-radius: 50%;
		background: black;
	}

	.telescope {
		position: absolute;
		z-index: 5;
		pointer-events: none;
		width: 90px;
		height: 90px;
		left: 8vw;
		bottom: 11vh;
	}

	@media (max-width: 1024px) {
		.telescope {
			width: 75px;
			height: 75px;
			left: 7vw;
			bottom: 10vh;
		}
	}

	@media (max-width: 768px) {
		.telescope {
			width: 60px;
			height: 60px;
			left: 5vw;
			bottom: 8vh;
		}

		.hill {
			width: 70vw;
			height: 45vh;
			bottom: -35vh;
		}
	}

	@media (max-width: 480px) {
		.telescope {
			width: 50px;
			height: 50px;
			left: 4vw;
			bottom: 6vh;
		}
	}
</style>
