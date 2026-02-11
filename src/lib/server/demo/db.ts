import type { ColumnSchema } from '$lib/server/db/schema';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { getDemoConfig } from './config';

const DEMO_DB_PATH = join(process.cwd(), 'data', 'demo.db');

interface DemoDatasetMetadata {
	name: string;
	fileName: string;
	rowCount: number;
	schema: ColumnSchema[];
}

interface SqliteTableInfoRow {
	name: string;
	type: string;
	notnull: number;
}

let sqliteClient: Database.Database | null = null;
let sqliteDb: ReturnType<typeof drizzle> | null = null;

export async function getDemoRows(limit?: number): Promise<Record<string, unknown>[]> {
	const config = await getDemoConfig();
	const db = await getDemoSqlite();

	const tableName = quoteIdentifier(config.dataset.table);
	const limitClause = typeof limit === 'number' ? ` LIMIT ${Math.max(0, limit)}` : '';
	const query = `SELECT * FROM ${tableName}${limitClause};`;

	return db.all<Record<string, unknown>>(query);
}

export async function getDemoDatasetMetadata(): Promise<DemoDatasetMetadata> {
	const config = await getDemoConfig();
	const db = await getDemoSqlite();

	const tableName = quoteIdentifier(config.dataset.table);
	const countResult = db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName};`);

	const sampleRows = await getDemoRows(100);
	const tableInfoRows = db.all<SqliteTableInfoRow>(`PRAGMA table_info(${tableName});`);
	const schema = inferSchema(sampleRows, tableInfoRows);

	return {
		name: config.dataset.name,
		fileName: config.dataset.fileName,
		rowCount: Number(countResult?.count ?? 0),
		schema,
	};
}

async function getDemoSqlite() {
	await ensureDemoDbExists();

	if (!sqliteClient) {
		sqliteClient = new Database(DEMO_DB_PATH, { readonly: true, fileMustExist: true });
		sqliteDb = drizzle(sqliteClient);
	}

	if (!sqliteDb) {
		throw new Error('Failed to initialize demo sqlite database');
	}

	return sqliteDb;
}

function inferSchema(
	rows: Record<string, unknown>[],
	tableInfo: SqliteTableInfoRow[],
): ColumnSchema[] {
	const columns = tableInfo.map((column) => column.name);

	if (columns.length === 0 && rows.length > 0) {
		columns.push(...Object.keys(rows[0]));
	}

	return columns.map((name) => {
		const values = rows
			.map((row) => row[name])
			.filter((value) => value !== null && value !== undefined);
		const distinctValues = new Set(values);
		const sampleValues = Array.from(distinctValues).slice(0, 5);

		let dtype = 'string';
		let isNumeric = false;
		let isTimestamp = false;

		if (values.length > 0) {
			const firstValue = values[0];
			if (typeof firstValue === 'number') {
				dtype = Number.isInteger(firstValue) ? 'integer' : 'float';
				isNumeric = true;
			} else if (typeof firstValue === 'boolean') {
				dtype = 'boolean';
			} else if (typeof firstValue === 'string' && isDateString(firstValue)) {
				dtype = 'timestamp';
				isTimestamp = true;
			}
		}

		const nameLower = name.toLowerCase();
		const isEntityId = nameLower.endsWith('_id') || nameLower.endsWith('id') || nameLower === 'id';
		const isMetric = isNumeric && !isEntityId && distinctValues.size > 10;
		const isCategorical = !isNumeric && !isTimestamp && distinctValues.size <= 50;

		const schemaColumn: ColumnSchema = {
			name,
			dtype,
			nullable: values.length < rows.length,
			isTimestamp,
			isMetric,
			isEntityId,
			isCategorical,
			distinctCount: distinctValues.size,
			sampleValues,
		};

		if (isNumeric) {
			const numericValues = values.filter((value): value is number => typeof value === 'number');
			if (numericValues.length > 0) {
				schemaColumn.minValue = Math.min(...numericValues);
				schemaColumn.maxValue = Math.max(...numericValues);
			}
		}

		return schemaColumn;
	});
}

function isDateString(value: string): boolean {
	const datePatterns = [
		/^\d{4}-\d{2}-\d{2}/,
		/^\d{2}\/\d{2}\/\d{4}/,
		/^\d{2}-\d{2}-\d{4}/,
		/^\d{4}\/\d{2}\/\d{2}/,
		/^\d{4}-\d{2}$/,
	];

	if (!datePatterns.some((pattern) => pattern.test(value))) {
		return false;
	}

	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		return true;
	}

	const date = new Date(value);
	return !Number.isNaN(date.getTime());
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureDemoDbExists(): Promise<void> {
	try {
		await access(DEMO_DB_PATH, fsConstants.R_OK);
	} catch {
		throw new Error(`Demo DB not found at ${DEMO_DB_PATH}`);
	}
}
