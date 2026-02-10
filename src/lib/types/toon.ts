/**
 * TOON format type definitions.
 */

export type PanelType =
	| 'bar'
	| 'line'
	| 'stat'
	| 'table'
	| 'pie'
	| 'scatter'
	| 'gauge'
	| 'heatmap'
	| 'histogram'
	| 'insight';

export type ForecastStrategy =
	| 'auto'
	| 'linear'
	| 'drift'
	| 'moving_average'
	| 'exp_smoothing'
	| 'seasonal_naive';

export interface ForecastSpec {
	strategy?: ForecastStrategy;
	horizon?: number;
	window?: number;
	alpha?: number;
	seasonLength?: number;
	confidence?: 'high' | 'medium' | 'low';
	intervalPct?: number;
}

export interface PanelSpec {
	_type?: 'panel';
	type: PanelType;
	title: string;
	description?: string;
	sql?: string;
	x?: string;
	y?: string;
	groupBy?: string;
	columns?: string[];
	value?: string;
	unit?: string;
	summary?: string;
	narrative?: string;
	confidence?: 'high' | 'medium' | 'low';
	recommendations?: string[];
	forecast?: ForecastSpec;
	color?: string;
	colorPalette?: string[];
	colorMap?: Record<string, string>;
}

export interface AnalyticalPlan {
	_type: 'plan';
	q: string;
	feasible: boolean;
	reason?: string;
	tables: string[];
	sql?: string;
	viz?: PanelSpec[];
	suggestedInvestigations?: string[];
	validationError?: string;
	executiveSummary?: string;
}

export interface DashboardSpec {
	_type: 'dashboard';
	title: string;
	panels: PanelSpec[];
	refresh?: string;
	timeFrom?: string;
	timeTo?: string;
}

export interface QueryResult {
	success: boolean;
	data: Record<string, unknown>[];
	columns: string[];
	rowCount: number;
	executionMs?: number;
	error?: string;
}

export interface ColumnProfile {
	name: string;
	dtype: string;
	nullable: boolean;
	isTimestamp: boolean;
	isMetric: boolean;
	isEntityId: boolean;
	isCategorical: boolean;
	distinctCount?: number;
	sampleValues?: unknown[];
	minValue?: unknown;
	maxValue?: unknown;
}

export interface DatasetProfile {
	id: string;
	name: string;
	rowCount: number;
	columns: ColumnProfile[];
}

export type FilterValue = string | number | boolean;

export interface SelectedMark {
	panelIndex?: number;
	panelTitle?: string;
	field: string;
	value: FilterValue;
	metricField?: string;
	metricValue?: FilterValue;
	datum?: Record<string, unknown>;
}

export interface BranchContext {
	parentDashboardId?: string;
	parentQuestion?: string;
	parentSql?: string;
	filters?: Record<string, FilterValue>;
	selectedMark?: SelectedMark;
	assumptions?: string[];
}

export interface ChartSelectDetail {
	panelIndex?: number;
	panelTitle?: string;
	field?: string;
	value?: FilterValue;
	metricField?: string;
	metricValue?: FilterValue;
	datum?: Record<string, unknown>;
	xField?: string;
	yField?: string;
	clientX: number;
	clientY: number;
}
