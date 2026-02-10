import {
	bigint,
	integer,
	jsonb,
	PgColumn,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { organization, user } from './auth.schema.ts';

export const task = pgTable('task', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1),
});

export const queryStatusEnum = pgEnum('query_status', ['pending', 'success', 'failed', 'refused']);

// Datasets table
export const datasets = pgTable('datasets', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: text('org_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 255 }).notNull(),
	fileName: varchar('file_name', { length: 255 }).notNull(),
	rowCount: integer('row_count').notNull().default(0),
	schema: jsonb('schema').$type<ColumnSchema[]>().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	uploadedBy: uuid('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
});

// Dataset rows table - stores actual CSV data
export const datasetRows = pgTable('dataset_rows', {
	id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
	datasetId: uuid('dataset_id')
		.notNull()
		.references(() => datasets.id, { onDelete: 'cascade' }),
	data: jsonb('data').$type<Record<string, unknown>>().notNull(),
	rowIndex: integer('row_index').notNull(),
});

// Queries table - stores query history
export const queries = pgTable('queries', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: text('org_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
	question: text('question').notNull(),
	plan: jsonb('plan').$type<AnalyticalPlan>(),
	sql: text('sql'),
	status: queryStatusEnum('status').notNull().default('pending'),
	error: text('error'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	executionMs: integer('execution_ms'),
});

// Dashboards table - saved query results / lines of reasoning (per-context)
export const dashboards = pgTable('dashboards', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: text('org_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	contextId: uuid('context_id').references(() => contexts.id, { onDelete: 'cascade' }),
	parentDashboardId: uuid('parent_dashboard_id').references(
		(): PgColumn<{
			name: 'id';
			tableName: 'dashboards';
			dataType: 'string';
			columnType: 'PgUUID';
			data: string;
			driverParam: string;
			notNull: true;
			hasDefault: true;
			isPrimaryKey: true;
			isAutoincrement: false;
			hasRuntimeDefault: false;
			enumValues: undefined;
		}> => dashboards.id,
		{
			onDelete: 'set null',
		},
	),
	rootDashboardId: uuid('root_dashboard_id').references(
		(): PgColumn<{
			name: 'id';
			tableName: 'dashboards';
			dataType: 'string';
			columnType: 'PgUUID';
			data: string;
			driverParam: string;
			notNull: true;
			hasDefault: true;
			isPrimaryKey: true;
			isAutoincrement: false;
			hasRuntimeDefault: false;
			enumValues: undefined;
		}> => dashboards.id,
		{
			onDelete: 'set null',
		},
	),
	name: varchar('name', { length: 255 }).notNull(),
	question: text('question').notNull(),
	description: text('description'),
	plan: jsonb('plan').$type<AnalyticalPlan>(),
	panels: jsonb('panels').$type<PanelSpec[]>().notNull(),
	results: jsonb('results').$type<Record<number, QueryResult>>(),
	nodeContext: jsonb('node_context').$type<DashboardNodeContext>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
});

// Contexts table - groups of datasets for AI analysis
export const contexts = pgTable('contexts', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: text('org_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 255 }).notNull(),
	description: text('description'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
});

// Junction table for contexts <-> datasets (many-to-many)
export const contextDatasets = pgTable('context_datasets', {
	id: uuid('id').primaryKey().defaultRandom(),
	contextId: uuid('context_id')
		.notNull()
		.references(() => contexts.id, { onDelete: 'cascade' }),
	datasetId: uuid('dataset_id')
		.notNull()
		.references(() => datasets.id, { onDelete: 'cascade' }),
	addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

// Settings table - per-org settings including API keys
export const settings = pgTable('settings', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: text('org_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' })
		.unique(),
	geminiApiKey: text('gemini_api_key'), // Should be encrypted in production
	geminiModel: varchar('gemini_model', { length: 100 }).notNull().default('gemini-2.0-flash'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type definitions for JSONB columns
export interface ColumnSchema {
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
	type: 'bar' | 'line' | 'stat' | 'table' | 'pie' | 'gauge' | 'heatmap' | 'histogram' | 'insight';
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

export type FilterValue = string | number | boolean;

export interface QueryResult {
	success: boolean;
	data: Record<string, unknown>[];
	columns: string[];
	rowCount: number;
	executionMs?: number;
	error?: string;
}

export interface SelectedMark {
	panelIndex?: number;
	panelTitle?: string;
	field: string;
	value: FilterValue;
	metricField?: string;
	metricValue?: FilterValue;
	datum?: Record<string, unknown>;
}

export interface DashboardNodeContext {
	parentDashboardId?: string;
	parentQuestion?: string;
	parentSql?: string;
	filters?: Record<string, FilterValue>;
	selectedMark?: SelectedMark;
	assumptions?: string[];
}

export * from './auth.schema.ts';
