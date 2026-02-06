<script lang="ts">
	import { onMount } from 'svelte';
	import Telescope from './Telescope.svelte';

	interface Star {
		id: number;
		x: number;
		y: number;
		baseRadius: number;
		twinklePhase: number;
		twinkleSpeed: number;
		color: string;
		dataIndex: number;
		labelText: string;
		riskSymbol: string;
		riskColor: string;
		currentOpacity: number;
		targetOpacity: number;
		expandProgress: number;
		isRevealed: boolean;
		proximityFactor: number;
	}

	interface BackgroundStar {
		x: number;
		y: number;
		r: number;
		alpha: number;
	}

	interface ShootingStar {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		age: number;
		len: number;
	}

	interface DataCategory {
		name: string;
		label: string;
		unit: string;
	}

	let canvas: HTMLCanvasElement;
	let heroSection: HTMLElement;
	let ctx: CanvasRenderingContext2D | null = null;

	let stars = $state<Star[]>([]);
	let backgroundStars = $state<BackgroundStar[]>([]);
	let shootingStars = $state<ShootingStar[]>([]);
	let mouse = $state({ x: 0, y: 0 });
	let shootingStarTimer = $state(0);

	const focusRadius = 120;
	const backgroundStarCount = 120;

	const dataCategories: DataCategory[] = [
		{ name: 'fuel_consumption_rate', label: 'Fuel Consumption', unit: 'L/100km' },
		{ name: 'traffic_congestion_level', label: 'Traffic Congestion', unit: '% capacity' },
		{ name: 'warehouse_inventory_level', label: 'Warehouse Inventory', unit: 'units' },
		{ name: 'eta_variation_hours', label: 'ETA Variation', unit: 'hours' },
		{ name: 'shipping_costs', label: 'Shipping Cost', unit: '$' },
		{ name: 'lead_time_days', label: 'Lead Time', unit: 'days' },
		{ name: 'port_congestion_level', label: 'Port Congestion', unit: 'index' },
		{ name: 'delay_probability', label: 'Delay Probability', unit: '%' },
		{ name: 'supplier_reliability_score', label: 'Supplier Reliability', unit: 'score' },
		{ name: 'risk_classification', label: 'Risk Level', unit: '' }
	];

	function generateSupplyChainData() {
		const data: Record<string, any>[] = [];
		const risks = ['High Risk', 'Moderate Risk', 'Low Risk'];

		for (let i = 0; i < 80; i++) {
			data.push({
				timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
				fuel_consumption_rate: (Math.random() * 15 + 3).toFixed(2),
				traffic_congestion_level: (Math.random() * 10).toFixed(2),
				warehouse_inventory_level: Math.floor(Math.random() * 1000 + 50),
				eta_variation_hours: (Math.random() * 8 - 2).toFixed(2),
				shipping_costs: (Math.random() * 800 + 100).toFixed(2),
				lead_time_days: Math.floor(Math.random() * 15 + 1),
				port_congestion_level: (Math.random() * 10).toFixed(2),
				delay_probability: (Math.random() * 100).toFixed(2),
				supplier_reliability_score: (Math.random() * 1).toFixed(3),
				risk_classification: risks[Math.floor(Math.random() * risks.length)],
				iot_temperature: (Math.random() * 40 - 10).toFixed(2),
				cargo_condition_status: Math.random() > 0.5 ? 'Good' : 'Critical',
				route_risk_level: (Math.random() * 10).toFixed(2)
			});
		}

		return data;
	}

	const csvData = generateSupplyChainData();

	function getHeroHeight() {
		return heroSection?.offsetHeight ?? window.innerHeight;
	}

	function getStarColor() {
		const colors = [
			'rgba(255, 255, 255, 0.8)',
			'rgba(255, 255, 255, 0.6)',
			'rgba(220, 220, 255, 0.7)',
			'rgba(255, 230, 200, 0.6)'
		];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	function createBackgroundStars() {
		const heroHeight = getHeroHeight();
		const newStars: BackgroundStar[] = [];
		for (let i = 0; i < backgroundStarCount; i++) {
			newStars.push({
				x: Math.random() * canvas.width,
				y: Math.random() * heroHeight * 0.85,
				r: Math.random() * 1.2 + 0.2,
				alpha: Math.random() * 0.5 + 0.15
			});
		}
		backgroundStars = newStars;
	}

	function createStars() {
		const starCount = 20;
		const minDistance = 140;
		const maxAttempts = 5;
		const heroHeight = getHeroHeight();
		const newStars: Star[] = [];

		// Compute exclusion zone around the hero content
		const heroContent = heroSection?.querySelector('.hero-content');
		let exclusion: { left: number; top: number; right: number; bottom: number } | null = null;
		if (heroContent) {
			const rect = heroContent.getBoundingClientRect();
			const pad = 60;
			exclusion = {
				left: Math.max(0, rect.left - pad),
				top: Math.max(0, rect.top - pad),
				right: Math.min(canvas.width, rect.right + pad),
				bottom: Math.min(heroHeight, rect.bottom + pad)
			};
		}

		for (let i = 0; i < starCount; i++) {
			let x = 0,
				y = 0,
				validPosition = false;
			let attempts = 0;

			while (!validPosition && attempts < maxAttempts) {
				x = Math.random() * canvas.width;
				y = Math.random() * (heroHeight * 0.75);

				validPosition = newStars.every((star) => {
					const dx = star.x - x;
					const dy = star.y - y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					return dist > minDistance;
				});

				if (validPosition && exclusion) {
					if (
						x >= exclusion.left &&
						x <= exclusion.right &&
						y >= exclusion.top &&
						y <= exclusion.bottom
					) {
						validPosition = false;
					}
				}

				attempts++;
			}

			if (attempts >= maxAttempts) {
				validPosition = true;
			}

			if (validPosition) {
				const dataRow = csvData[i % csvData.length];
				const categoryObj = dataCategories[Math.floor(Math.random() * dataCategories.length)];
				let formattedValue = dataRow[categoryObj.name];
				if (!isNaN(parseFloat(formattedValue))) {
					formattedValue = parseFloat(formattedValue).toFixed(1);
				}
				const unit = categoryObj.unit ? ` ${categoryObj.unit}` : '';
				const labelText = `${categoryObj.label}: ${formattedValue}${unit}`;

				let riskSymbol = '◯';
				let riskColor = 'rgba(255, 255, 255, 0.9)';

				if (dataRow.risk_classification.includes('High')) {
					riskSymbol = '▲';
					riskColor = 'rgba(255, 100, 100, 1)';
				} else if (dataRow.risk_classification.includes('Moderate')) {
					riskSymbol = '◆';
					riskColor = 'rgba(255, 200, 80, 1)';
				} else if (dataRow.risk_classification.includes('Low')) {
					riskSymbol = '●';
					riskColor = 'rgba(100, 255, 150, 1)';
				}

				newStars.push({
					id: i,
					x,
					y,
					baseRadius: Math.random() * 0.8 + 0.3,
					twinklePhase: Math.random() * Math.PI * 2,
					twinkleSpeed: Math.random() * 0.015 + 0.005,
					color: getStarColor(),
					dataIndex: i,
					labelText,
					riskSymbol,
					riskColor,
					currentOpacity: 0,
					targetOpacity: 0,
					expandProgress: 0,
					isRevealed: false,
					proximityFactor: 0
				});
			}
		}

		stars = newStars;
	}

	function resizeCanvas() {
		const heroHeight = getHeroHeight();
		canvas.width = window.innerWidth;
		canvas.height = heroHeight;
		createBackgroundStars();
	}

	function onMouseMove(e: MouseEvent) {
		const rect = heroSection.getBoundingClientRect();
		mouse = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top
		};
	}

	function spawnShootingStar() {
		const heroHeight = getHeroHeight();
		const margin = 40;
		const fromLeft = Math.random() > 0.5;
		const y = Math.random() * heroHeight * 0.4 + margin;
		const x = fromLeft ? -20 : canvas.width + 20;
		const vx = fromLeft ? 2 + Math.random() * 6 : -2 - Math.random() * 6;
		const vy = (1 + Math.random() * 2) * (Math.random() > 0.5 ? 1 : 0.6);
		const life = 60 + Math.floor(Math.random() * 80);

		shootingStars = [
			...shootingStars,
			{ x, y, vx, vy, life, age: 0, len: 80 + Math.random() * 140 }
		];
	}

	function updateShootingStars() {
		const heroHeight = getHeroHeight();
		shootingStars = shootingStars
			.map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, age: s.age + 1 }))
			.filter(
				(s) => s.age <= s.life && s.x > -200 && s.x < canvas.width + 200 && s.y < heroHeight + 200
			);

		shootingStarTimer += 1;
		if (shootingStarTimer > 80 + Math.random() * 240) {
			shootingStarTimer = 0;
			if (Math.random() < 0.6) spawnShootingStar();
		}
	}

	function drawNightSky() {
		if (!ctx) return;
		const gradient = ctx.createRadialGradient(
			canvas.width * 0.3,
			canvas.height * 0.4,
			200,
			canvas.width * 0.3,
			canvas.height * 0.4,
			1000
		);
		gradient.addColorStop(0, '#0b1324');
		gradient.addColorStop(1, '#050810');

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function drawBackgroundStars() {
		if (!ctx) return;
		backgroundStars.forEach((s) => {
			const t = (Math.sin(Date.now() * 0.0005 + s.x + s.y) + 1) * 0.5;
			ctx!.globalAlpha = s.alpha * (0.6 + 0.4 * t);
			ctx!.beginPath();
			ctx!.fillStyle = 'white';
			ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			ctx!.fill();
		});
		ctx.globalAlpha = 1;
	}

	function drawShootingStars() {
		if (!ctx) return;
		shootingStars.forEach((s) => {
			const t = 1 - s.age / s.life;
			const alpha = 0.9 * t;
			const len = s.len;
			const ex = s.x - s.vx * len * 0.5;
			const ey = s.y - s.vy * len * 0.5;
			const grad = ctx!.createLinearGradient(ex, ey, s.x, s.y);
			grad.addColorStop(0, 'rgba(255,255,255,0)');
			grad.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.25})`);
			grad.addColorStop(1, `rgba(255,255,255,${alpha})`);
			ctx!.strokeStyle = grad;
			ctx!.lineWidth = 2.2 + 2 * t;
			ctx!.beginPath();
			ctx!.moveTo(ex, ey);
			ctx!.lineTo(s.x, s.y);
			ctx!.stroke();
			ctx!.beginPath();
			ctx!.fillStyle = `rgba(255,255,255,${alpha})`;
			ctx!.arc(s.x, s.y, 1.8 + 2 * t, 0, Math.PI * 2);
			ctx!.fill();
		});
	}

	function updateStars() {
		stars = stars.map((star) => {
			const dx = star.x - mouse.x;
			const dy = star.y - mouse.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			let proximityFactor = star.proximityFactor;
			if (distance < focusRadius) {
				proximityFactor = Math.pow(1 - distance / focusRadius, 0.5);
			} else {
				proximityFactor = Math.max(0, proximityFactor - 0.05);
			}

			const maxRevealDistance = 150;
			const target = Math.max(0, 1 - distance / maxRevealDistance);
			const minVisible = 0.03;
			const targetOpacity = target < minVisible ? 0 : target;

			const lerp = 0.22;
			const currentOpacity = star.currentOpacity + (targetOpacity - star.currentOpacity) * lerp;

			return {
				...star,
				proximityFactor,
				targetOpacity,
				currentOpacity,
				twinklePhase: star.twinklePhase + star.twinkleSpeed,
				isRevealed: targetOpacity > 0
			};
		});
	}

	function drawStars() {
		if (!ctx) return;
		stars.forEach((star) => {
			const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.4;
			const scale = 1 + star.proximityFactor * 1.2;
			const radius = star.baseRadius * scale * 1.25;

			ctx!.beginPath();
			ctx!.arc(star.x, star.y, radius, 0, Math.PI * 2);
			ctx!.fillStyle = star.color;
			ctx!.globalAlpha = (0.6 + twinkle * 0.4) * (0.8 + star.proximityFactor * 0.45);
			ctx!.fill();

			const glowRadius = radius * 3.5;
			const grad = ctx!.createRadialGradient(
				star.x,
				star.y,
				radius * 0.2,
				star.x,
				star.y,
				glowRadius
			);
			grad.addColorStop(0, star.color);
			grad.addColorStop(0.25, star.color);
			grad.addColorStop(1, 'rgba(0,0,0,0)');
			ctx!.beginPath();
			ctx!.fillStyle = grad;
			ctx!.globalAlpha = 0.12 + star.proximityFactor * 0.18;
			ctx!.fillRect(star.x - glowRadius, star.y - glowRadius, glowRadius * 2, glowRadius * 2);

			if (star.proximityFactor > 0.15) {
				ctx!.beginPath();
				ctx!.arc(star.x, star.y, radius * 2.2, 0, Math.PI * 2);
				ctx!.strokeStyle = star.color;
				ctx!.lineWidth = 0.6;
				ctx!.globalAlpha = star.proximityFactor * 0.22;
				ctx!.stroke();
			}
		});

		ctx.globalAlpha = 1;
	}

	function drawFocusIndicator() {
		if (!ctx) return;
		const heroHeight = getHeroHeight();
		if (mouse.x < 0 || mouse.x > canvas.width || mouse.y < 0 || mouse.y > heroHeight) {
			return;
		}
		ctx.beginPath();
		ctx.arc(mouse.x, mouse.y, focusRadius, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	function animate() {
		drawNightSky();
		drawBackgroundStars();
		updateShootingStars();
		drawShootingStars();
		updateStars();
		drawStars();
		drawFocusIndicator();
		requestAnimationFrame(animate);
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		resizeCanvas();
		createStars();

		window.addEventListener('resize', resizeCanvas);
		document.addEventListener('mousemove', onMouseMove);

		animate();

		return () => {
			window.removeEventListener('resize', resizeCanvas);
			document.removeEventListener('mousemove', onMouseMove);
		};
	});
</script>

<section
	bind:this={heroSection}
	class="hero-section relative flex h-screen w-full items-center justify-center overflow-hidden"
>
	<canvas bind:this={canvas} class="absolute top-0 left-0 z-0 h-full w-full cursor-crosshair"
	></canvas>
	<Telescope />

	<div class="hero-content pointer-events-none relative z-[3] px-5 text-center">
		<h1
			class="mb-6 text-[5.5rem] leading-none font-bold tracking-[3px] text-white/95 max-lg:text-[4rem] max-lg:tracking-[2px] max-md:text-[3rem] max-md:tracking-[1.5px]"
		>
			CiteSeer
		</h1>
		<p
			class="mb-10 text-[1.35rem] leading-relaxed font-normal text-white/70 max-lg:text-[1.15rem] max-md:text-base"
		>
			Question-driven analytics for supply-chain teams.<br />Ask anything. See everything.
		</p>
		<div class="pointer-events-auto flex justify-center gap-4 max-md:flex-col max-md:items-center">
			<button
				class="cursor-pointer rounded-lg bg-gradient-to-br from-[#64ff96] to-[#3dd977] px-8 py-3.5 text-base font-semibold text-[#0a1628] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(100,255,150,0.3)] max-md:w-full max-md:max-w-[280px]"
			>
				Get Started
			</button>
			<button
				class="cursor-pointer rounded-lg border border-white/30 bg-white/5 px-8 py-3.5 text-base font-semibold text-white/90 backdrop-blur-lg transition-all hover:border-white/50 hover:bg-white/10 max-md:w-full max-md:max-w-[280px]"
			>
				Watch Demo
			</button>
		</div>
	</div>

	<!-- Datapoint labels -->
	<div class="pointer-events-none absolute top-0 left-0 z-[2] h-full w-full">
		{#each stars as star}
			<div
				class="absolute rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-[0.85rem] font-semibold tracking-wide whitespace-nowrap text-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-lg"
				style="left: {star.x + 45}px; top: {star.y +
					35}px; opacity: {star.currentOpacity}; transform: translate(-50%, -50%);"
			>
				{star.labelText}
			</div>
			<div
				class="absolute text-[1.4rem] font-bold"
				style="left: {star.x}px; top: {star.y}px; opacity: {star.currentOpacity}; transform: translate(-50%, -50%); color: {star.riskColor}; text-shadow: 0 0 8px rgba(0,0,0,0.5);"
			>
				{star.riskSymbol}
			</div>
		{/each}
	</div>
</section>
