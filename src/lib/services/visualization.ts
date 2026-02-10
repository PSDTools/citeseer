/**
 * Visualization service - converts panel specs to Vega-Lite specifications.
 */

import type { PanelSpec, QueryResult } from '$lib/types/toon';
import type { VisualizationSpec } from 'vega-embed';

interface StatCardData {
	value: string | number;
	label: string;
	unit?: string;
}

interface TableData {
	columns: string[];
	rows: Record<string, unknown>[];
}

const COLORS = {
	primary: '#64ff96',
	secondary: '#3dd977',
	background: '#050810',
	text: '#ffffff',
	textMuted: 'rgba(255, 255, 255, 0.6)',
	gridColor: 'rgba(255, 255, 255, 0.1)',
};

// High-contrast categorical palette for clearer distinction between charts/series.
const CHART_PALETTE = [
	'#00d1ff',
	'#ff8a00',
	'#7c5cff',
	'#22c55e',
	'#ff4d6d',
	'#facc15',
	'#14b8a6',
	'#f97316',
	'#a855f7',
	'#06b6d4',
];

const SEMANTIC_COLORS = {
	positive: '#22c55e',
	negative: '#ef4444',
	warning: '#f59e0b',
	neutral: '#94a3b8',
	info: '#38bdf8',
} as const;

function hashString(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash << 5) - hash + value.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function paletteStartIndex(seed: string): number {
	return hashString(seed) % CHART_PALETTE.length;
}

function getPanelColor(seed: string): string {
	return CHART_PALETTE[paletteStartIndex(seed)];
}

function getCompanionColor(seed: string): string {
	return CHART_PALETTE[(paletteStartIndex(seed) + 1) % CHART_PALETTE.length];
}

function getRotatedPalette(seed: string): string[] {
	const start = paletteStartIndex(seed);
	return [...CHART_PALETTE.slice(start), ...CHART_PALETTE.slice(0, start)];
}

function uniqueStrings(values: unknown[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		if (value == null) continue;
		const label = String(value).trim();
		if (!label || seen.has(label)) continue;
		seen.add(label);
		out.push(label);
	}
	return out;
}

function semanticToken(label: string): keyof typeof SEMANTIC_COLORS | null {
	const normalized = label.toLowerCase().trim();
	if (
		/^(pass|passed|success|succeeded|good|positive|pos|profit|profitable|gain|gained|increase|increased|up|win|won|true|yes)$/.test(
			normalized,
		)
	) {
		return 'positive';
	}
	if (
		/^(fail|failed|error|bad|negative|neg|loss|lost|decrease|decreased|down|drop|dropped|false|no)$/.test(
			normalized,
		)
	) {
		return 'negative';
	}
	if (/^(warning|warn|at risk|caution|delayed|late)$/.test(normalized)) {
		return 'warning';
	}
	if (/^(pending|in progress|processing|queued|awaiting|review)$/.test(normalized)) {
		return 'warning';
	}
	if (/^(neutral|unknown|other|n\/a|na)$/.test(normalized)) {
		return 'neutral';
	}
	if (/^(info|informational)$/.test(normalized)) {
		return 'info';
	}
	return null;
}

function buildCategoricalScale(
	values: string[],
	seed: string,
	colorMap?: Record<string, string>,
): { domain: string[]; range: string[] } | null {
	const domain = uniqueStrings(values);
	if (domain.length < 2) {
		return null;
	}

	const basePalette = getRotatedPalette(seed);
	const range: string[] = [];
	const used = new Set<string>();
	let paletteIndex = 0;

	for (const label of domain) {
		const mapped = colorMap?.[label];
		if (mapped) {
			range.push(mapped);
			used.add(mapped);
			continue;
		}

		const token = semanticToken(label);
		if (token) {
			const color = SEMANTIC_COLORS[token];
			range.push(color);
			used.add(color);
			continue;
		}

		while (used.has(basePalette[paletteIndex % basePalette.length])) {
			paletteIndex++;
		}
		const color = basePalette[paletteIndex % basePalette.length];
		range.push(color);
		used.add(color);
		paletteIndex++;
	}

	return { domain, range };
}

/**
 * Find the actual column name in the result that matches the expected field name.
 * Handles case-insensitivity, underscores vs spaces, etc.
 */
function findMatchingColumn(expected: string, columns: string[]): string | undefined {
	// Direct match first
	if (columns.includes(expected)) {
		return expected;
	}

	// Normalize for comparison: lowercase, remove spaces/underscores
	const normalize = (s: string) => s.toLowerCase().replace(/[_\s]+/g, '');
	const normalizedExpected = normalize(expected);

	for (const col of columns) {
		if (normalize(col) === normalizedExpected) {
			return col;
		}
	}

	return undefined;
}

function findSeriesField(
	columns: string[],
	data: Record<string, unknown>[],
	allowGeneric: boolean,
): string | undefined {
	const candidates = allowGeneric
		? ['__series', 'forecast_series', 'series', 'scenario', 'type']
		: ['__series', 'forecast_series'];
	for (const candidate of candidates) {
		if (!columns.includes(candidate)) continue;
		const unique = new Set(data.map((row) => row[candidate]));
		if (unique.size > 1) {
			return candidate;
		}
	}
	return undefined;
}

export function resolvePanelFields(
	panel: PanelSpec,
	result: QueryResult,
): { xField?: string; yField?: string; columns: string[] } {
	if (!result.success || result.data.length === 0) {
		return { columns: result.columns || [] };
	}

	const columns = result.columns || [];
	const xField = findMatchingColumn(panel.x || '', columns) || columns[0];
	const yField = findMatchingColumn(panel.y || '', columns) || columns[1];

	return { xField, yField, columns };
}

export function resolveStatField(panel: PanelSpec, result: QueryResult): string | undefined {
	if (!result.success || result.data.length === 0) return undefined;
	const columns = result.columns || [];
	const valueField = panel.value ? findMatchingColumn(panel.value, columns) : columns[0];
	return valueField || columns[0];
}

const INTERNAL_COLUMNS = new Set([
	'__series',
	'forecast_series',
	'forecast_lower',
	'forecast_upper',
]);

function tooltipColumns(columns: string[], seriesField?: string): { field: string }[] {
	return columns
		.filter((col) => !INTERNAL_COLUMNS.has(col) && col !== seriesField)
		.map((col) => ({ field: col }));
}

export function panelToVegaLite(panel: PanelSpec, result: QueryResult): VisualizationSpec | null {
	if (!result.success || result.data.length === 0) {
		return null;
	}

	// Resolve actual column names
	const { xField, yField, columns } = resolvePanelFields(panel, result);
	if (!xField || !yField) {
		return null;
	}

	const panelColor = getPanelColor(panel.title);
	const companionColor = getCompanionColor(panel.title);
	const seriesPalette = getRotatedPalette(panel.title);
	const customPalette = panel.colorPalette?.filter(Boolean);
	const primaryColor = panel.color || panelColor;
	const secondaryColor =
		customPalette && customPalette.length > 1
			? customPalette[1]
			: customPalette && customPalette.length === 1
				? customPalette[0]
				: companionColor;
	const effectivePalette =
		customPalette && customPalette.length > 0 ? customPalette : seriesPalette;
	const xValues = uniqueStrings(result.data.map((row) => row[xField]));

	const baseSpec = {
		$schema: 'https://vega.github.io/schema/vega-lite/v6.json',
		data: { values: result.data },
		title: {
			text: panel.title,
			color: COLORS.text,
			fontSize: 14,
			fontWeight: 600,
		},
		background: 'transparent',
		config: {
			view: { stroke: 'transparent' },
			axis: {
				labelColor: COLORS.textMuted,
				titleColor: COLORS.text,
				gridColor: COLORS.gridColor,
				domainColor: COLORS.gridColor,
				tickColor: COLORS.gridColor,
			},
			legend: {
				labelColor: COLORS.textMuted,
				titleColor: COLORS.text,
			},
		},
		width: 'container' as const,
		height: 250,
	};

	switch (panel.type) {
		case 'bar': {
			const seriesField = findSeriesField(columns, result.data, Boolean(panel.forecast));
			const hasSeries = Boolean(seriesField);
			const seriesValues = hasSeries
				? Array.from(new Set(result.data.map((row) => String(row[seriesField as string]))))
				: [];
			const hasForecastSeries =
				hasSeries && seriesValues.includes('Actual') && seriesValues.includes('Forecast');
			const xScale = buildCategoricalScale(xValues, panel.title);
			const seriesScale = hasForecastSeries
				? {
						domain: ['Actual', 'Forecast'],
						range: [primaryColor, secondaryColor],
					}
				: (buildCategoricalScale(seriesValues, panel.title, panel.colorMap) ?? {
						range: effectivePalette,
					});

			return {
				...baseSpec,
				mark: {
					type: 'bar',
					color: primaryColor,
					cornerRadiusEnd: 4,
				},
				encoding: {
					x: {
						field: xField,
						type: 'nominal',
						axis: { labelAngle: -45 },
					},
					y: {
						field: yField,
						type: 'quantitative',
					},
					...(hasSeries
						? {
								color: {
									field: seriesField as string,
									type: 'nominal',
									scale: seriesScale,
								},
								xOffset: { field: seriesField as string },
							}
						: {
								...(buildCategoricalScale(xValues, panel.title, panel.colorMap)
									? {
											color: {
												field: xField,
												type: 'nominal',
												scale: buildCategoricalScale(xValues, panel.title, panel.colorMap)!,
												legend: null,
											},
										}
									: {}),
							}),
					tooltip: hasForecastSeries
						? tooltipColumns(result.columns, seriesField)
						: result.columns.map((col) => ({ field: col })),
				},
			} as VisualizationSpec;
		}

		case 'line': {
			// Detect date format for x values
			const firstValue = result.data[0]?.[xField];
			const strValue = String(firstValue || '');
			const seriesField = findSeriesField(columns, result.data, Boolean(panel.forecast));
			const hasSeries = Boolean(seriesField);
			const seriesValues = hasSeries
				? Array.from(new Set(result.data.map((row) => String(row[seriesField as string]))))
				: [];
			const hasForecastSeries =
				hasSeries && seriesValues.includes('Actual') && seriesValues.includes('Forecast');
			const lowerField = columns.includes('forecast_lower') ? 'forecast_lower' : undefined;
			const upperField = columns.includes('forecast_upper') ? 'forecast_upper' : undefined;
			const hasIntervals = Boolean(lowerField && upperField && hasForecastSeries);

			// Check for YYYY-MM format (e.g., "2015-02")
			const isYearMonth = /^\d{4}-\d{2}$/.test(strValue);
			// Check for full ISO date (e.g., "2015-02-01" or "2015-02-01T00:00:00")
			const isFullDate = /^\d{4}-\d{2}-\d{2}/.test(strValue);
			const isValidDate = (isYearMonth || isFullDate) && !isNaN(Date.parse(strValue));

			// Build x encoding based on date type
			const xEncoding: Record<string, unknown> = {
				field: xField,
				axis: { labelAngle: -45 },
			};

			if (isYearMonth && isValidDate) {
				// For YYYY-MM format, use temporal with yearmonth timeUnit
				xEncoding.type = 'temporal';
				xEncoding.timeUnit = 'yearmonth';
				xEncoding.axis = { labelAngle: -45, format: '%b %Y' };
			} else if (isFullDate && isValidDate) {
				xEncoding.type = 'temporal';
			} else {
				xEncoding.type = 'ordinal';
				xEncoding.sort = null; // preserve data order
			}

			const lineMark: Record<string, unknown> = {
				type: 'line',
				strokeWidth: 2,
				point: { size: 60 },
			};

			if (!hasSeries) {
				lineMark.color = primaryColor;
				(lineMark.point as Record<string, unknown>).color = primaryColor;
			}

			const seriesEncoding = hasSeries
				? {
						field: seriesField as string,
						type: 'nominal',
						...(hasForecastSeries
							? {
									scale: {
										domain: ['Actual', 'Forecast'],
										range: [primaryColor, secondaryColor],
									},
								}
							: {
									scale: buildCategoricalScale(seriesValues, panel.title, panel.colorMap) || {
										range: effectivePalette,
									},
								}),
					}
				: undefined;

			const dashEncoding = hasForecastSeries
				? {
						field: seriesField as string,
						type: 'nominal',
						scale: {
							domain: ['Actual', 'Forecast'],
							range: [
								[1, 0],
								[6, 4],
							],
						},
					}
				: undefined;

			const baseLineEncoding = {
				x: xEncoding,
				y: {
					field: yField,
					type: 'quantitative',
				},
				tooltip: hasForecastSeries
					? tooltipColumns(result.columns, seriesField)
					: result.columns.map((col) => ({ field: col })),
			};

			if (!hasForecastSeries) {
				const lineLayer = {
					mark: lineMark,
					encoding: {
						...baseLineEncoding,
						...(seriesEncoding ? { color: seriesEncoding } : {}),
						...(dashEncoding ? { strokeDash: dashEncoding } : {}),
					},
				};

				return {
					...baseSpec,
					...lineLayer,
				} as unknown as VisualizationSpec;
			}

			const actualLine = {
				mark: {
					type: 'line',
					color: primaryColor,
					strokeWidth: 2.5,
					point: { size: 60, color: primaryColor },
				},
				transform: [
					{
						filter: `datum["${seriesField}"] == 'Actual'`,
					},
				],
				encoding: baseLineEncoding,
			};

			const forecastLine = {
				mark: {
					type: 'line',
					color: secondaryColor,
					strokeWidth: 2,
					strokeDash: [6, 4],
					point: { size: 50, filled: false, stroke: secondaryColor },
				},
				transform: [
					{
						filter: `datum["${seriesField}"] == 'Forecast'`,
					},
				],
				encoding: baseLineEncoding,
			};

			const layers = [];
			if (hasIntervals) {
				layers.push({
					mark: {
						type: 'area',
						color: secondaryColor,
						opacity: 0.18,
					},
					transform: [
						{
							filter: `datum["${seriesField}"] == 'Forecast'`,
						},
					],
					encoding: {
						x: xEncoding,
						y: {
							field: lowerField as string,
							type: 'quantitative',
						},
						y2: {
							field: upperField as string,
						},
					},
				});
			}
			layers.push(actualLine, forecastLine);

			return {
				...baseSpec,
				layer: layers,
			} as VisualizationSpec;
		}

		case 'pie':
			return {
				...baseSpec,
				mark: { type: 'arc', innerRadius: 50 },
				encoding: {
					theta: {
						field: yField,
						type: 'quantitative',
					},
					color: {
						field: xField,
						type: 'nominal',
						scale: buildCategoricalScale(xValues, panel.title, panel.colorMap) || {
							range: effectivePalette,
						},
					},
					tooltip: result.columns.map((col) => ({ field: col })),
				},
			} as VisualizationSpec;

		case 'scatter':
			return {
				...baseSpec,
				mark: {
					type: 'circle',
					color: primaryColor,
					opacity: 0.7,
					size: 60,
				},
				encoding: {
					x: {
						field: xField,
						type: 'quantitative',
						axis: { labelAngle: -45 },
					},
					y: {
						field: yField,
						type: 'quantitative',
					},
					tooltip: result.columns.map((col) => ({ field: col })),
				},
			} as VisualizationSpec;

		default:
			return null;
	}
}

export function extractStatData(panel: PanelSpec, result: QueryResult): StatCardData | null {
	if (!result.success || result.data.length === 0) {
		return null;
	}

	const row = result.data[0];
	const valueField = findMatchingColumn(panel.value || '', result.columns) || result.columns[0];
	const value = row[valueField];

	return {
		value: typeof value === 'number' || typeof value === 'string' ? value : String(value ?? 'N/A'),
		label: panel.title,
		unit: panel.unit,
	};
}

export function extractTableData(panel: PanelSpec, result: QueryResult): TableData | null {
	if (!result.success) {
		return null;
	}

	// Map panel.columns to actual result columns
	const columns = panel.columns
		? panel.columns.map((col) => findMatchingColumn(col, result.columns) || col)
		: result.columns;

	return {
		columns,
		rows: result.data,
	};
}
