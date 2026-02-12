import {
	pgTable,
	uuid,
	text,
	timestamp,
	varchar,
	jsonb,
	bigint,
	integer,
	boolean,
	pgEnum,
	index,
	unique,
	type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type {
	PanelSpec,
	AnalyticalPlan,
	ForecastSpec,
	ForecastStrategy,
	QueryResult,
	FilterValue,
	SelectedMark,
	ColumnProfile,
} from '$lib/types/toon';

// Re-export analytical types so existing importers from schema still work
export type {
	PanelSpec,
	AnalyticalPlan,
	ForecastSpec,
	ForecastStrategy,
	QueryResult,
	FilterValue,
	SelectedMark,
} from '$lib/types/toon';

// ColumnSchema is structurally identical to ColumnProfile; alias for DB usage
export type ColumnSchema = ColumnProfile;

// Enums
export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member']);
export const queryStatusEnum = pgEnum('query_status', ['pending', 'success', 'failed', 'refused']);
export const dataModeEnum = pgEnum('data_mode', ['demo', 'live']);

// Users table (better-auth compatible)
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull().default(''),
	email: varchar('email', { length: 255 }).notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	passwordHash: text('password_hash'), // legacy, kept for migration
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sessions table (better-auth compatible)
export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Account table (better-auth)
export const accounts = pgTable('accounts', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
	scope: text('scope'),
	idToken: text('id_token'),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Verification table (better-auth)
export const verifications = pgTable('verifications', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Organizations table
export const organizations = pgTable('organizations', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	slug: varchar('slug', { length: 100 }).notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
	uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
});

// Dataset rows table - stores actual CSV data
export const datasetRows = pgTable(
	'dataset_rows',
	{
		id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
		datasetId: uuid('dataset_id')
			.notNull()
			.references(() => datasets.id, { onDelete: 'cascade' }),
		data: jsonb('data').$type<Record<string, unknown>>().notNull(),
		rowIndex: integer('row_index').notNull(),
	},
	(table) => [index('idx_dataset_rows_dataset_id').on(table.datasetId)],
);

// Queries table - stores query history
export const queries = pgTable(
	'queries',
	{
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
		executionMs: integer('execution_ms'),
	},
	(table) => [index('idx_queries_org_id').on(table.orgId)],
);

// Dashboards table - saved query results / lines of reasoning (per-context)
export const dashboards = pgTable(
	'dashboards',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		orgId: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		contextId: uuid('context_id').references(() => contexts.id, { onDelete: 'cascade' }),
		parentDashboardId: uuid('parent_dashboard_id').references((): AnyPgColumn => dashboards.id, {
			onDelete: 'set null',
		}),
		rootDashboardId: uuid('root_dashboard_id').references((): AnyPgColumn => dashboards.id, {
			onDelete: 'set null',
		}),
		name: varchar('name', { length: 255 }).notNull(),
		mode: dataModeEnum('mode').notNull().default('live'),
		question: text('question').notNull(),
		description: text('description'),
		plan: jsonb('plan').$type<AnalyticalPlan>(),
		panels: jsonb('panels').$type<PanelSpec[]>().notNull(),
		results: jsonb('results').$type<Record<number, QueryResult>>(),
		nodeContext: jsonb('node_context').$type<DashboardNodeContext>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(table) => [
		index('idx_dashboards_org_id').on(table.orgId),
		index('idx_dashboards_context_id').on(table.contextId),
	],
);

// Contexts table - groups of datasets for AI analysis
export const contexts = pgTable(
	'contexts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		orgId: uuid('org_id')
			.notNull()
			.references(() => organizations.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 255 }).notNull(),
		mode: dataModeEnum('mode').notNull().default('live'),
		description: text('description'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(table) => [index('idx_contexts_org_id').on(table.orgId)],
);

// Junction table for contexts <-> datasets (many-to-many)
export const contextDatasets = pgTable(
	'context_datasets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		contextId: uuid('context_id')
			.notNull()
			.references(() => contexts.id, { onDelete: 'cascade' }),
		datasetId: uuid('dataset_id')
			.notNull()
			.references(() => datasets.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [unique('uq_context_datasets').on(table.contextId, table.datasetId)],
);

// Settings table - per-org settings including API keys
export const settings = pgTable('settings', {
	id: uuid('id').primaryKey().defaultRandom(),
	orgId: uuid('org_id')
		.notNull()
		.references(() => organizations.id, { onDelete: 'cascade' })
		.unique(),
	geminiApiKey: text('gemini_api_key'), // Should be encrypted in production
	geminiModel: varchar('gemini_model', { length: 100 }).notNull().default('gemini-2.0-flash'),
	llmProvider: varchar('llm_provider', { length: 32 }).notNull().default('gemini'),
	llmApiKey: text('llm_api_key'),
	llmModel: varchar('llm_model', { length: 100 }),
	llmBaseUrl: text('llm_base_url'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	orgMembers: many(orgMembers),
	uploadedDatasets: many(datasets),
	queries: many(queries),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
	members: many(orgMembers),
	datasets: many(datasets),
	contexts: many(contexts),
	queries: many(queries),
	dashboards: many(dashboards),
	settings: one(settings),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
	user: one(users, {
		fields: [orgMembers.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [orgMembers.orgId],
		references: [organizations.id],
	}),
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [datasets.orgId],
		references: [organizations.id],
	}),
	uploader: one(users, {
		fields: [datasets.uploadedBy],
		references: [users.id],
	}),
	rows: many(datasetRows),
	contextDatasets: many(contextDatasets),
}));

export const datasetRowsRelations = relations(datasetRows, ({ one }) => ({
	dataset: one(datasets, {
		fields: [datasetRows.datasetId],
		references: [datasets.id],
	}),
}));

export const queriesRelations = relations(queries, ({ one }) => ({
	organization: one(organizations, {
		fields: [queries.orgId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [queries.userId],
		references: [users.id],
	}),
}));

export const dashboardsRelations = relations(dashboards, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [dashboards.orgId],
		references: [organizations.id],
	}),
	context: one(contexts, {
		fields: [dashboards.contextId],
		references: [contexts.id],
	}),
	creator: one(users, {
		fields: [dashboards.createdBy],
		references: [users.id],
	}),
	parent: one(dashboards, {
		fields: [dashboards.parentDashboardId],
		references: [dashboards.id],
		relationName: 'dashboard_parent',
	}),
	children: many(dashboards, { relationName: 'dashboard_parent' }),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
	organization: one(organizations, {
		fields: [settings.orgId],
		references: [organizations.id],
	}),
}));

export const contextsRelations = relations(contexts, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [contexts.orgId],
		references: [organizations.id],
	}),
	creator: one(users, {
		fields: [contexts.createdBy],
		references: [users.id],
	}),
	contextDatasets: many(contextDatasets),
	dashboards: many(dashboards),
}));

export const contextDatasetsRelations = relations(contextDatasets, ({ one }) => ({
	context: one(contexts, {
		fields: [contextDatasets.contextId],
		references: [contexts.id],
	}),
	dataset: one(datasets, {
		fields: [contextDatasets.datasetId],
		references: [datasets.id],
	}),
}));

// DashboardNodeContext: DB-specific shape for dashboard tree context.
// Structurally similar to BranchContext but serves a DB-storage purpose.
export interface DashboardNodeContext {
	parentDashboardId?: string;
	parentQuestion?: string;
	parentSql?: string;
	filters?: Record<string, FilterValue>;
	selectedMark?: SelectedMark;
	assumptions?: string[];
}
