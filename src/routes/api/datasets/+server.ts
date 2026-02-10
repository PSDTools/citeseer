import { DateNormalizer } from '$lib/server/compiler/date-normalizer';
import { db } from '$lib/server/db';
import type { ColumnSchema } from '$lib/server/db/schema';
import { datasetRows, datasets, settings } from '$lib/server/db/schema';
import { getUserOrganizations } from '$lib/server/orgs';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import Papa from 'papaparse';
import type { RequestHandler } from './$types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const BATCH_SIZE = 1000; // Insert rows in batches

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// Get user's org
	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		error(400, 'No file provided');
	}

	if (!file.name.endsWith('.csv')) {
		error(400, 'Only CSV files are supported');
	}

	if (file.size > MAX_FILE_SIZE) {
		error(400, 'File too large (max 50MB)');
	}

	try {
		// Read file content
		const text = await file.text();

		// Parse CSV
		const result = Papa.parse(text, {
			header: true,
			skipEmptyLines: true,
			dynamicTyping: true,
		});

		if (result.errors.length > 0) {
			error(400, `CSV parsing error: ${result.errors[0].message}`);
		}

		const rows = result.data as Record<string, unknown>[];
		if (rows.length === 0) {
			error(400, 'CSV file is empty');
		}

		// Get API key for LLM-assisted date detection
		const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

		// Normalize date columns if API key is available
		let normalizedRows = rows;
		if (orgSettings?.geminiApiKey) {
			try {
				const dateNormalizer = new DateNormalizer(
					orgSettings.geminiApiKey,
					orgSettings.geminiModel,
				);
				const columns = Object.keys(rows[0]);
				const analysis = await dateNormalizer.analyzeDateColumns(rows, columns);

				if (analysis.dateColumns.length > 0) {
					console.log(
						`Normalizing ${analysis.dateColumns.length} date columns:`,
						analysis.dateColumns.map((d) => d.columnName),
					);
					normalizedRows = dateNormalizer.normalizeRows(rows, analysis.dateColumns);
				}
			} catch (e) {
				console.error('Date normalization failed, using raw data:', e);
			}
		}

		// Infer schema from data
		const schema = inferSchema(normalizedRows);

		// Generate dataset name from filename
		const name = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');

		// Insert dataset
		const [dataset] = await db
			.insert(datasets)
			.values({
				orgId: org.id,
				name,
				fileName: file.name,
				rowCount: normalizedRows.length,
				schema,
				uploadedBy: locals.user.id,
			})
			.returning();

		// Insert rows in batches
		for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
			const batch = normalizedRows.slice(i, i + BATCH_SIZE);
			await db.insert(datasetRows).values(
				batch.map((row, idx) => ({
					datasetId: dataset.id,
					data: row,
					rowIndex: i + idx,
				})),
			);
		}

		return json({
			id: dataset.id,
			name: dataset.name,
			rowCount: normalizedRows.length,
			columns: schema.length,
		});
	} catch (e) {
		console.error('Error uploading dataset:', e);
		if (e instanceof Error && 'status' in e) throw e;
		error(500, 'Failed to upload dataset');
	}
};

function inferSchema(rows: Record<string, unknown>[]): ColumnSchema[] {
	if (rows.length === 0) return [];

	const columns = Object.keys(rows[0]);
	const sampleSize = Math.min(100, rows.length);
	const sampleRows = rows.slice(0, sampleSize);

	return columns.map((name) => {
		const values = sampleRows.map((r) => r[name]).filter((v) => v != null);
		const distinctValues = new Set(values);
		const sampleValues = Array.from(distinctValues).slice(0, 5);

		// Determine type
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
			} else if (typeof firstValue === 'string') {
				// Check if it looks like a date
				if (isDateString(firstValue)) {
					dtype = 'timestamp';
					isTimestamp = true;
				}
			}
		}

		// Heuristics for column roles
		const nameLower = name.toLowerCase();
		const isEntityId = nameLower.endsWith('_id') || nameLower.endsWith('id') || nameLower === 'id';
		const isMetric = isNumeric && !isEntityId && distinctValues.size > 10;
		const isCategorical = !isNumeric && !isTimestamp && distinctValues.size <= 50;

		return {
			name,
			dtype,
			nullable: values.length < sampleSize,
			isTimestamp,
			isMetric,
			isEntityId,
			isCategorical,
			distinctCount: distinctValues.size,
			sampleValues,
			...(isNumeric && {
				minValue: Math.min(...(values as number[])),
				maxValue: Math.max(...(values as number[])),
			}),
		};
	});
}

function isDateString(value: string): boolean {
	// Check common date formats
	const datePatterns = [
		/^\d{4}-\d{2}-\d{2}/, // ISO date (normalized format)
		/^\d{2}\/\d{2}\/\d{4}/, // US date
		/^\d{2}-\d{2}-\d{4}/, // EU date
		/^\d{4}\/\d{2}\/\d{2}/, // Alt ISO
		/^\d{4}-\d{2}$/, // Year-month
	];

	if (datePatterns.some((p) => p.test(value))) {
		// For ISO format, always return true
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
			return true;
		}
		const date = new Date(value);
		return !isNaN(date.getTime());
	}

	return false;
}

/**
 * PUT endpoint - Clean all datasets (remove pipes from column names in JSONB data)
 */

export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];

	const body = await request.json().catch(() => ({}));

	if (body.action === 'clean-all-columns') {
		// Get all datasets for the org
		const orgDatasets = await db.select().from(datasets).where(eq(datasets.orgId, org.id));

		let totalCleaned = 0;
		const results: { datasetId: string; datasetName: string; cleaned: number }[] = [];

		for (const dataset of orgDatasets) {
			// Get rows for this dataset
			const rows = await db.select().from(datasetRows).where(eq(datasetRows.datasetId, dataset.id));

			if (rows.length === 0) continue;

			// Get original column names from first row
			const firstRowData = rows[0].data as Record<string, unknown>;
			const originalColumns = Object.keys(firstRowData);

			// Build column mapping
			const cleanColumnName = (name: string): string => {
				return name.replace(/^\||\|$/g, '').trim();
			};

			const columnMapping = new Map<string, string>();
			for (const col of originalColumns) {
				const cleaned = cleanColumnName(col);
				if (col !== cleaned) {
					columnMapping.set(col, cleaned);
				}
			}

			if (columnMapping.size === 0) continue;

			console.log(`Cleaning ${dataset.name}:`, Array.from(columnMapping.entries()));

			// Update all rows - rename JSONB keys
			const BATCH_SIZE = 100;
			for (let i = 0; i < rows.length; i += BATCH_SIZE) {
				const batch = rows.slice(i, i + BATCH_SIZE);
				await Promise.all(
					batch.map((row) => {
						const oldData = row.data as Record<string, unknown>;
						const newData: Record<string, unknown> = {};
						for (const [key, value] of Object.entries(oldData)) {
							const newKey = columnMapping.get(key) || key;
							newData[newKey] = value;
						}
						return db.update(datasetRows).set({ data: newData }).where(eq(datasetRows.id, row.id));
					}),
				);
			}

			// Update schema
			const updatedSchema = (dataset.schema as ColumnSchema[]).map((col) => ({
				...col,
				name: cleanColumnName(col.name),
			}));

			await db.update(datasets).set({ schema: updatedSchema }).where(eq(datasets.id, dataset.id));

			totalCleaned += columnMapping.size;
			results.push({
				datasetId: dataset.id,
				datasetName: dataset.name,
				cleaned: columnMapping.size,
			});
		}

		return json({
			success: true,
			message: `Cleaned column names in ${results.length} dataset(s)`,
			totalCleaned,
			results,
		});
	}

	error(400, 'Invalid action');
};
