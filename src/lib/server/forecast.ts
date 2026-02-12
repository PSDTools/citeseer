import type { ForecastStrategy } from '$lib/types/toon';

export interface ForecastSelectionContext {
	question: string;
	panelTitle: string;
	cadence: string;
	defaultHorizon: number;
	stats: {
		points: number;
		mean: number;
		stdDev: number;
		cv: number;
		slope: number;
		r2: number;
		lastValue: number;
		min: number;
		max: number;
		seasonLength?: number;
		seasonStrength?: number;
	};
	sampleTail: Array<{ x: string | number; y: number }>;
}

export interface ForecastStrategyDecision {
	strategy: ForecastStrategy;
	horizon: number;
	window?: number;
	alpha?: number;
	seasonLength?: number;
	confidence?: 'high' | 'medium' | 'low';
	intervalPct?: number;
}

type XFormat = 'yearmonth' | 'date' | 'number' | 'string';
const LOWER_FIELD = 'forecast_lower';
const UPPER_FIELD = 'forecast_upper';

interface ParsedX {
	format: XFormat;
	sortKey: number;
	date?: Date;
	number?: number;
}

interface SeriesPoint {
	x: string | number;
	y: number;
	sortKey: number;
	date?: Date;
	number?: number;
}

interface CadenceInfo {
	unit: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'number' | 'unknown';
	step: number;
}

function findMatchingColumn(expected: string, columns: string[]): string | undefined {
	if (columns.includes(expected)) return expected;
	const normalize = (s: string) => s.toLowerCase().replace(/[_\s]+/g, '');
	const normalizedExpected = normalize(expected);
	for (const col of columns) {
		if (normalize(col) === normalizedExpected) return col;
	}
	return undefined;
}

function parseXValue(value: unknown, index: number): ParsedX {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return { format: 'number', sortKey: value, number: value };
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}$/.test(trimmed)) {
			const [yearStr, monthStr] = trimmed.split('-');
			const year = Number(yearStr);
			const month = Number(monthStr) - 1;
			const date = new Date(Date.UTC(year, month, 1));
			return { format: 'yearmonth', sortKey: date.getTime(), date };
		}

		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed);
			if (Number.isFinite(num)) {
				return { format: 'number', sortKey: num, number: num };
			}
		}

		const date = new Date(trimmed);
		if (!Number.isNaN(date.getTime())) {
			return { format: 'date', sortKey: date.getTime(), date };
		}
	}

	return { format: 'string', sortKey: index };
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
}

function inferCadence(points: SeriesPoint[], format: XFormat): CadenceInfo {
	if (format === 'number') {
		const diffs = [];
		for (let i = 1; i < points.length; i++) {
			if (typeof points[i]!.number === 'number' && typeof points[i - 1]!.number === 'number') {
				diffs.push(points[i]!.number! - points[i - 1]!.number!);
			}
		}
		const step = Math.max(1, Math.round(Math.abs(median(diffs)) || 1));
		return { unit: 'number', step };
	}

	if (format === 'yearmonth') {
		const diffs = [];
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1].date;
			const current = points[i].date;
			if (prev && current) {
				const prevIndex = prev.getUTCFullYear() * 12 + prev.getUTCMonth();
				const currIndex = current.getUTCFullYear() * 12 + current.getUTCMonth();
				diffs.push(currIndex - prevIndex);
			}
		}
		const step = Math.max(1, Math.round(Math.abs(median(diffs)) || 1));
		return { unit: 'month', step };
	}

	if (format === 'date') {
		const diffs = [];
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1].date;
			const current = points[i].date;
			if (prev && current) {
				const diffDays = (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
				if (Number.isFinite(diffDays)) diffs.push(diffDays);
			}
		}
		const stepDays = Math.max(1, Math.round(Math.abs(median(diffs)) || 1));
		if (stepDays >= 300) return { unit: 'year', step: Math.round(stepDays / 365) || 1 };
		if (stepDays >= 80) return { unit: 'quarter', step: Math.round(stepDays / 90) || 1 };
		if (stepDays >= 27) return { unit: 'month', step: Math.round(stepDays / 30) || 1 };
		if (stepDays >= 6) return { unit: 'week', step: Math.round(stepDays / 7) || 1 };
		return { unit: 'day', step: stepDays };
	}

	return { unit: 'unknown', step: 1 };
}

function formatYearMonth(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${year}-${month}`;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function addPeriods(base: Date, cadence: CadenceInfo, periods: number): Date {
	const date = new Date(base.getTime());
	switch (cadence.unit) {
		case 'year':
			date.setUTCFullYear(date.getUTCFullYear() + cadence.step * periods);
			return date;
		case 'quarter':
			date.setUTCMonth(date.getUTCMonth() + cadence.step * periods * 3);
			return date;
		case 'month':
			date.setUTCMonth(date.getUTCMonth() + cadence.step * periods);
			return date;
		case 'week':
			date.setUTCDate(date.getUTCDate() + cadence.step * periods * 7);
			return date;
		case 'day':
			date.setUTCDate(date.getUTCDate() + cadence.step * periods);
			return date;
		default:
			return date;
	}
}

function computeTrendStats(points: SeriesPoint[]) {
	const n = points.length;
	let sumT = 0;
	let sumY = 0;
	for (let i = 0; i < n; i++) {
		sumT += i + 1;
		sumY += points[i].y;
	}
	const meanT = sumT / n;
	const meanY = sumY / n;
	let cov = 0;
	let varT = 0;
	let varY = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < n; i++) {
		const t = i + 1;
		const y = points[i].y;
		cov += (t - meanT) * (y - meanY);
		varT += (t - meanT) ** 2;
		varY += (y - meanY) ** 2;
		if (y < min) min = y;
		if (y > max) max = y;
	}
	const slope = varT === 0 ? 0 : cov / varT;
	const intercept = meanY - slope * meanT;
	const r2 = varY === 0 ? 0 : (cov * cov) / (varT * varY);
	const stdDev = Math.sqrt(varY / Math.max(1, n - 1));
	const cv = Math.abs(meanY) > 0 ? stdDev / Math.abs(meanY) : stdDev;
	return { slope, intercept, r2, mean: meanY, stdDev, cv, min, max };
}

function correlation(a: number[], b: number[]): number {
	if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
	const n = a.length;
	const meanA = a.reduce((sum, v) => sum + v, 0) / n;
	const meanB = b.reduce((sum, v) => sum + v, 0) / n;
	let num = 0;
	let denA = 0;
	let denB = 0;
	for (let i = 0; i < n; i++) {
		const da = a[i] - meanA;
		const db = b[i] - meanB;
		num += da * db;
		denA += da * da;
		denB += db * db;
	}
	if (denA === 0 || denB === 0) return 0;
	return num / Math.sqrt(denA * denB);
}

function detectSeasonality(
	points: SeriesPoint[],
	cadence: CadenceInfo,
): { seasonLength?: number; strength?: number } {
	const n = points.length;
	let seasonLength: number | undefined;
	if (cadence.unit === 'month' && n >= 24) seasonLength = 12 * cadence.step;
	if (cadence.unit === 'week' && n >= 26)
		seasonLength = n >= 104 ? 52 * cadence.step : 13 * cadence.step;
	if (cadence.unit === 'day' && n >= 21) seasonLength = 7 * cadence.step;
	if (!seasonLength || seasonLength >= n) return {};

	const lag = seasonLength;
	const a: number[] = [];
	const b: number[] = [];
	for (let i = lag; i < n; i++) {
		a.push(points[i].y);
		b.push(points[i - lag].y);
	}
	const strength = correlation(a, b);
	return { seasonLength, strength };
}

function linearForecast(points: SeriesPoint[], horizon: number): number[] {
	const { slope, intercept } = computeTrendStats(points);
	const n = points.length;
	const forecasts: number[] = [];
	for (let i = 1; i <= horizon; i++) {
		const t = n + i;
		forecasts.push(intercept + slope * t);
	}
	return forecasts;
}

function driftForecast(points: SeriesPoint[], horizon: number): number[] {
	const n = points.length;
	const first = points[0].y;
	const last = points[n - 1].y;
	const drift = n > 1 ? (last - first) / (n - 1) : 0;
	const forecasts: number[] = [];
	for (let i = 1; i <= horizon; i++) {
		forecasts.push(last + drift * i);
	}
	return forecasts;
}

function movingAverageForecast(points: SeriesPoint[], horizon: number, window: number): number[] {
	const values = points.map((p) => p.y);
	const forecasts: number[] = [];
	const k = Math.max(2, Math.min(window, values.length));
	for (let i = 0; i < horizon; i++) {
		const slice = values.slice(-k);
		const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
		forecasts.push(avg);
		values.push(avg);
	}
	return forecasts;
}

function expSmoothingForecast(points: SeriesPoint[], horizon: number, alpha: number): number[] {
	let level = points[0].y;
	for (let i = 1; i < points.length; i++) {
		level = alpha * points[i].y + (1 - alpha) * level;
	}
	return Array.from({ length: horizon }, () => level);
}

function computeResidualStd(
	points: SeriesPoint[],
	strategy: ForecastStrategy,
	options: { window?: number; alpha?: number; seasonLength?: number },
): number {
	const residuals: number[] = [];
	const n = points.length;
	const window = Math.max(2, Math.min(options.window ?? Math.min(6, n), n));

	if (strategy === 'linear') {
		const { slope, intercept } = computeTrendStats(points);
		for (let i = 0; i < n; i++) {
			const fitted = intercept + slope * (i + 1);
			residuals.push(points[i].y - fitted);
		}
	} else if (strategy === 'drift') {
		const first = points[0].y;
		const last = points[n - 1].y;
		const drift = n > 1 ? (last - first) / (n - 1) : 0;
		for (let i = 0; i < n; i++) {
			const fitted = first + drift * i;
			residuals.push(points[i].y - fitted);
		}
	} else if (strategy === 'moving_average') {
		for (let i = window; i < n; i++) {
			const slice = points.slice(i - window, i).map((p) => p.y);
			const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
			residuals.push(points[i].y - avg);
		}
	} else if (strategy === 'exp_smoothing') {
		const alpha = options.alpha ?? 0.3;
		let level = points[0].y;
		for (let i = 1; i < n; i++) {
			const fitted = level;
			residuals.push(points[i].y - fitted);
			level = alpha * points[i].y + (1 - alpha) * level;
		}
	} else if (strategy === 'seasonal_naive') {
		const seasonLength = options.seasonLength ?? 0;
		if (seasonLength > 0 && n > seasonLength) {
			for (let i = seasonLength; i < n; i++) {
				residuals.push(points[i].y - points[i - seasonLength].y);
			}
		}
	}

	if (residuals.length < 2) {
		const { stdDev } = computeTrendStats(points);
		return stdDev || 0;
	}

	const mean = residuals.reduce((sum, v) => sum + v, 0) / residuals.length;
	const variance =
		residuals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, residuals.length - 1);
	return Math.sqrt(variance);
}

function seasonalNaiveForecast(
	points: SeriesPoint[],
	horizon: number,
	seasonLength: number,
): number[] {
	const n = points.length;
	const forecasts: number[] = [];
	for (let i = 0; i < horizon; i++) {
		const idx = n - seasonLength + (i % seasonLength);
		forecasts.push(points[idx]?.y ?? points[n - 1].y);
	}
	return forecasts;
}
