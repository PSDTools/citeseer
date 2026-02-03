/**
 * Visualization service - converts panel specs to Vega-Lite specifications.
 */

import type { PanelSpec, QueryResult } from '$lib/types/toon';
import type { VisualizationSpec } from 'vega-embed';

export interface StatCardData {
	value: string | number;
	label: string;
	unit?: string;
}

export interface TableData {
	columns: string[];
	rows: Record<string, unknown>[];
}

const COLORS = {
	primary: '#64ff96',
	secondary: '#3dd977',
	background: '#050810',
	text: '#ffffff',
	textMuted: 'rgba(255, 255, 255, 0.6)',
	gridColor: 'rgba(255, 255, 255, 0.1)'
};

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

export function panelToVegaLite(panel: PanelSpec, result: QueryResult): VisualizationSpec | null {
	if (!result.success || result.data.length === 0) {
		return null;
	}

	// Resolve actual column names
	const xField = findMatchingColumn(panel.x || '', result.columns) || result.columns[0];
	const yField = findMatchingColumn(panel.y || '', result.columns) || result.columns[1];
	
	console.log('panelToVegaLite mapping:', {
		'panel.x': panel.x,
		'panel.y': panel.y,
		'resolved xField': xField,
		'resolved yField': yField,
		'available columns': [...result.columns],
		'first row keys': Object.keys(result.data[0] || {}),
		'first row values': Object.entries(result.data[0] || {}).map(([k, v]) => `${k}=${v} (${typeof v})`),
		'x value': result.data[0]?.[xField],
		'y value': result.data[0]?.[yField]
	});

	const baseSpec = {
		$schema: 'https://vega.github.io/schema/vega-lite/v6.json',
		data: { values: result.data },
		title: {
			text: panel.title,
			color: COLORS.text,
			fontSize: 14,
			fontWeight: 600
		},
		background: 'transparent',
		config: {
			view: { stroke: 'transparent' },
			axis: {
				labelColor: COLORS.textMuted,
				titleColor: COLORS.text,
				gridColor: COLORS.gridColor,
				domainColor: COLORS.gridColor,
				tickColor: COLORS.gridColor
			},
			legend: {
				labelColor: COLORS.textMuted,
				titleColor: COLORS.text
			}
		},
		width: 'container' as const,
		height: 250
	};

	switch (panel.type) {
		case 'bar':
			return {
				...baseSpec,
				mark: {
					type: 'bar',
					color: COLORS.primary,
					cornerRadiusEnd: 4
				},
				encoding: {
					x: {
						field: xField,
						type: 'nominal',
						axis: { labelAngle: -45 }
					},
					y: {
						field: yField,
						type: 'quantitative'
					},
					tooltip: result.columns.map((col) => ({ field: col }))
				}
			} as VisualizationSpec;

		case 'line': {
			// Detect date format for x values
			const firstValue = result.data[0]?.[xField];
			const strValue = String(firstValue || '');
			
			// Check for YYYY-MM format (e.g., "2015-02")
			const isYearMonth = /^\d{4}-\d{2}$/.test(strValue);
			// Check for full ISO date (e.g., "2015-02-01" or "2015-02-01T00:00:00")
			const isFullDate = /^\d{4}-\d{2}-\d{2}/.test(strValue);
			const isValidDate = (isYearMonth || isFullDate) && !isNaN(Date.parse(strValue));
			
			// Build x encoding based on date type
			const xEncoding: Record<string, unknown> = {
				field: xField,
				axis: { labelAngle: -45 }
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
			
			return {
				...baseSpec,
				mark: {
					type: 'line',
					color: COLORS.primary,
					strokeWidth: 2,
					point: { color: COLORS.primary, size: 60 }
				},
				encoding: {
					x: xEncoding,
					y: {
						field: yField,
						type: 'quantitative'
					},
					tooltip: result.columns.map((col) => ({ field: col }))
				}
			} as VisualizationSpec;
		}

		case 'pie':
			return {
				...baseSpec,
				mark: { type: 'arc', innerRadius: 50 },
				encoding: {
					theta: {
						field: yField,
						type: 'quantitative'
					},
					color: {
						field: xField,
						type: 'nominal',
						scale: { scheme: 'greens' }
					},
					tooltip: result.columns.map((col) => ({ field: col }))
				}
			} as VisualizationSpec;

		case 'scatter':
			return {
				...baseSpec,
				mark: {
					type: 'circle',
					color: COLORS.primary,
					opacity: 0.7,
					size: 60
				},
				encoding: {
					x: {
						field: xField,
						type: 'quantitative',
						axis: { labelAngle: -45 }
					},
					y: {
						field: yField,
						type: 'quantitative'
					},
					tooltip: result.columns.map((col) => ({ field: col }))
				}
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
		value: typeof value === 'number' ? value.toLocaleString() : String(value ?? 'N/A'),
		label: panel.title,
		unit: panel.unit
	};
}

export function extractTableData(panel: PanelSpec, result: QueryResult): TableData | null {
	if (!result.success) {
		return null;
	}

	// Map panel.columns to actual result columns
	const columns = panel.columns 
		? panel.columns.map(col => findMatchingColumn(col, result.columns) || col)
		: result.columns;

	return {
		columns,
		rows: result.data
	};
}
