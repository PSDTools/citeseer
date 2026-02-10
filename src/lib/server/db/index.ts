import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

// Lazy-loaded database connection
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
	if (_db) return _db;

	// During build, we can't connect to the database
	if (building) {
		throw new Error('Database not available during build');
	}

	const connectionString = env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL environment variable is required. Run "pnpm setup" first.');
	}

	// Create postgres client
	const client = postgres(connectionString, {
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

// Export schema for convenience
export * from './schema';
