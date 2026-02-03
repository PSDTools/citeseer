/**
 * TOON format type definitions.
 */

export type PanelType = 'bar' | 'line' | 'stat' | 'table' | 'pie' | 'scatter' | 'gauge' | 'heatmap' | 'histogram';

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

export interface RefusalResponse {
	_type: 'refusal';
	reason: string;
	suggestions?: string[];
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
