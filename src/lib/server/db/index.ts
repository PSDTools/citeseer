import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

// Lazy-loaded database connection
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> {
	if (_client) return _client;

	if (building) {
		throw new Error('Database not available during build');
	}

	const connectionString = env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL environment variable is required. Run "pnpm setup" first.');
	}

	_client = postgres(connectionString, {
		max: 10,
		idle_timeout: 20,
		connect_timeout: 10,
		connection: {
			// Enforce server-side cancellation for slow/stuck statements.
			statement_timeout: 20_000,
			// Avoid waiting too long on locks.
			lock_timeout: 5_000,
		},
	});

	return _client;
}

function getDb(): PostgresJsDatabase<typeof schema> {
	if (_db) return _db;

	const client = getClient();

	// Create drizzle instance with schema for relations
	_db = drizzle(client, { schema });
	return _db;
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
	get(_target, prop) {
		return getDb()[prop as keyof PostgresJsDatabase<typeof schema>];
	},
});

/**
 * Execute a SQL query inside a READ ONLY transaction with a server-side
 * statement timeout.  Any mutation attempt (INSERT, UPDATE, DELETE, DROP, …)
 * is rejected by PostgreSQL itself, providing database-level protection
 * against harmful LLM-generated SQL.
 */
export async function executeReadOnlySQL(
	sqlQuery: string,
	timeoutMs: number = 20_000,
): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
	const client = getClient();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = await (client as any).begin('READ ONLY', async (txSql: any) => {
		await txSql`SET LOCAL statement_timeout = ${String(timeoutMs)}`;
		return await txSql.unsafe(sqlQuery);
	});

	const rows: Record<string, unknown>[] = Array.isArray(result)
		? (result as Record<string, unknown>[])
		: [];
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

	return { rows, columns };
}

/** Convenience type: works for both the root `db` and a transaction handle. */
export type DbClient = PostgresJsDatabase<typeof schema>;

// Export schema for convenience
export * from './schema';
