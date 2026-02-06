import {
	pgTable,
	uuid,
	text,
	timestamp,
	varchar,
	jsonb,
	bigint,
	integer,
	pgEnum
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member']);
export const queryStatusEnum = pgEnum('query_status', ['pending', 'success', 'failed', 'refused']);

// Users table
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Sessions table (for auth)
export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Organizations table
export const organizations = pgTable('organizations', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	slug: varchar('slug', { length: 100 }).notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Organization members table
export const orgMembers = pgTable('org_members', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	role: orgRoleEnum('role').notNull().default('member'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Datasets table
export const datasets = pgTable('datasets', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 255 }).notNull(),
	fileName: varchar('file_name', { length: 255 }).notNull(),
	rowCount: integer('row_count').notNull().default(0),
	schema: jsonb('schema').$type<ColumnSchema[]>().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' })
});

// Dataset rows table - stores actual CSV data
export const datasetRows = pgTable('dataset_rows', {
	id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
	datasetId: uuid('dataset_id')
		.notNull()
		.references(() => datasets.id, { onDelete: 'cascade' }),
	data: jsonb('data').$type<Record<string, unknown>>().notNull(),
	rowIndex: integer('row_index').notNull()
});

// Queries table - stores query history
export const queries = pgTable('queries', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
	question: text('question').notNull(),
	plan: jsonb('plan').$type<AnalyticalPlan>(),
	sql: text('sql'),
	status: queryStatusEnum('status').notNull().default('pending'),
	error: text('error'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	executionMs: integer('execution_ms')
});

// Dashboards table - saved query results / lines of reasoning (per-context)
export const dashboards = pgTable('dashboards', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	contextId: uuid('context_id').references(() => contexts.id, { onDelete: 'cascade' }),
	parentDashboardId: uuid('parent_dashboard_id').references(() => dashboards.id, {
		onDelete: 'set null'
	}),
	rootDashboardId: uuid('root_dashboard_id').references(() => dashboards.id, {
		onDelete: 'set null'
	}),
	name: varchar('name', { length: 255 }).notNull(),
	question: text('question').notNull(),
	description: text('description'),
	plan: jsonb('plan').$type<AnalyticalPlan>(),
	panels: jsonb('panels').$type<PanelSpec[]>().notNull(),
	results: jsonb('results').$type<Record<number, QueryResult>>(),
	nodeContext: jsonb('node_context').$type<DashboardNodeContext>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' })
});

// Contexts table - groups of datasets for AI analysis
export const contexts = pgTable('contexts', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' }),
	name: varchar('name', { length: 255 }).notNull(),
	description: text('description'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' })
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
	addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
});

// Settings table - per-org settings including API keys
export const settings = pgTable('settings', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' })
		.unique(),
	geminiApiKey: text('gemini_api_key'), // Should be encrypted in production
	geminiModel: varchar('gemini_model', { length: 100 }).notNull().default('gemini-2.0-flash'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	orgMembers: many(orgMembers),
	uploadedDatasets: many(datasets),
	queries: many(queries)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	})
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
	members: many(orgMembers),
	datasets: many(datasets),
	contexts: many(contexts),
	queries: many(queries),
	dashboards: many(dashboards),
	settings: one(settings)
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
	user: one(users, {
		fields: [orgMembers.userId],
		references: [users.id]
	}),
	organization: one(organizations, {
		fields: [orgMembers.orgId],
		references: [organizations.id]
	})
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [datasets.orgId],
		references: [organizations.id]
	}),
	uploader: one(users, {
		fields: [datasets.uploadedBy],
		references: [users.id]
	}),
	rows: many(datasetRows),
	contextDatasets: many(contextDatasets)
}));

export const datasetRowsRelations = relations(datasetRows, ({ one }) => ({
	dataset: one(datasets, {
		fields: [datasetRows.datasetId],
		references: [datasets.id]
	})
}));

export const queriesRelations = relations(queries, ({ one }) => ({
	organization: one(organizations, {
		fields: [queries.orgId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [queries.userId],
		references: [users.id]
	})
}));

export const dashboardsRelations = relations(dashboards, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [dashboards.orgId],
		references: [organizations.id]
	}),
	context: one(contexts, {
		fields: [dashboards.contextId],
		references: [contexts.id]
	}),
	creator: one(users, {
		fields: [dashboards.createdBy],
		references: [users.id]
	}),
	parent: one(dashboards, {
		fields: [dashboards.parentDashboardId],
		references: [dashboards.id],
		relationName: 'dashboard_parent'
	}),
	children: many(dashboards, { relationName: 'dashboard_parent' })
}));

export const settingsRelations = relations(settings, ({ one }) => ({
	organization: one(organizations, {
		fields: [settings.orgId],
		references: [organizations.id]
	})
}));

export const contextsRelations = relations(contexts, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [contexts.orgId],
		references: [organizations.id]
	}),
	creator: one(users, {
		fields: [contexts.createdBy],
		references: [users.id]
	}),
	contextDatasets: many(contextDatasets),
	dashboards: many(dashboards)
}));

export const contextDatasetsRelations = relations(contextDatasets, ({ one }) => ({
	context: one(contexts, {
		fields: [contextDatasets.contextId],
		references: [contexts.id]
	}),
	dataset: one(datasets, {
		fields: [contextDatasets.datasetId],
		references: [datasets.id]
	})
}));

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

export type ForecastStrategy = 'auto' | 'linear' | 'drift' | 'moving_average' | 'exp_smoothing' | 'seasonal_naive';

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
