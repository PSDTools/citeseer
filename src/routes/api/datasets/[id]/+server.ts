import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, datasetRows, settings } from '$lib/server/db';
import type { ColumnSchema } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { DateNormalizer } from '$lib/server/compiler/date-normalizer';
import { isDemoActive } from '$lib/server/demo/runtime';
import { resolveLlmConfig } from '$lib/server/llm/config';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];

	const [dataset] = await db
		.select()
		.from(datasets)
		.where(and(eq(datasets.id, params.id), eq(datasets.orgId, org.id)));

	if (!dataset) {
		error(404, 'Dataset not found');
	}

	return json(dataset);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];

	// Check dataset exists and belongs to org
	const [dataset] = await db
		.select({ id: datasets.id })
		.from(datasets)
		.where(and(eq(datasets.id, params.id), eq(datasets.orgId, org.id)));

	if (!dataset) {
		error(404, 'Dataset not found');
	}

	// Delete rows first (cascade should handle this, but explicit is safer)
	await db.delete(datasetRows).where(eq(datasetRows.datasetId, params.id));

	// Delete dataset
	await db.delete(datasets).where(eq(datasets.id, params.id));

	return json({ success: true });
};

// POST - Re-process dataset with LLM date normalization
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];
	const demoActive = isDemoActive();

	// Check for confirmation in request body
	const body = await request.json().catch(() => ({}));
	if (body.action !== 'normalize-dates' && body.action !== 'clean-columns') {
		error(400, 'Invalid action');
	}

	// Check dataset exists and belongs to org
	const [dataset] = await db
		.select()
		.from(datasets)
		.where(and(eq(datasets.id, params.id), eq(datasets.orgId, org.id)));

	if (!dataset) {
		error(404, 'Dataset not found');
	}

	// Get API key (needed for normalize-dates, optional for clean-columns)
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	// Fetch all rows for this dataset
	const rows = await db
		.select()
		.from(datasetRows)
		.where(eq(datasetRows.datasetId, params.id))
		.orderBy(datasetRows.rowIndex);

	if (rows.length === 0) {
		return json({ success: true, message: 'No rows to process', normalized: 0 });
	}

	// Extract data from rows
	let rowData = rows.map((r) => r.data as Record<string, unknown>);
	const originalColumns = Object.keys(rowData[0]);

	// Clean column names (remove pipes, trim spaces)
	const cleanColumnName = (name: string): string => {
		return name.replace(/^\||\|$/g, '').trim();
	};

	// Check if column names need cleaning (have pipes or extra spaces)
	const needsCleaning = originalColumns.some(
		(c) => c.includes('|') || c.startsWith(' ') || c.endsWith(' '),
	);

	if (needsCleaning || body.action === 'clean-columns') {
		console.log('Cleaning column names...');
		const columnMapping = new Map<string, string>();
		for (const col of originalColumns) {
			const cleaned = cleanColumnName(col);
			if (col !== cleaned) {
				columnMapping.set(col, cleaned);
				console.log(`  "${col}" -> "${cleaned}"`);
			}
		}

		if (columnMapping.size > 0) {
			// Rename columns in all rows
			rowData = rowData.map((row) => {
				const newRow: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(row)) {
					const newKey = columnMapping.get(key) || key;
					newRow[newKey] = value;
				}
				return newRow;
			});

			// Update rows in database
			const BATCH_SIZE = 100;
			for (let i = 0; i < rows.length; i += BATCH_SIZE) {
				const batch = rows.slice(i, i + BATCH_SIZE);
				await Promise.all(
					batch.map((row, idx) =>
						db
							.update(datasetRows)
							.set({ data: rowData[i + idx] })
							.where(eq(datasetRows.id, row.id)),
					),
				);
			}

			// Update schema column names
			const updatedSchema = (dataset.schema as ColumnSchema[]).map((col) => ({
				...col,
				name: cleanColumnName(col.name),
				sampleValues: col.sampleValues,
			}));

			await db.update(datasets).set({ schema: updatedSchema }).where(eq(datasets.id, params.id));

			console.log(`Cleaned ${columnMapping.size} column names`);

			if (body.action === 'clean-columns') {
				return json({
					success: true,
					message: `Cleaned ${columnMapping.size} column name(s)`,
					cleaned: columnMapping.size,
					columns: Array.from(columnMapping.entries()).map(([old, newName]) => ({
						old,
						new: newName,
					})),
				});
			}
		}
	}

	// If just cleaning columns, we're done
	if (body.action === 'clean-columns') {
		return json({ success: true, message: 'No column names needed cleaning', cleaned: 0 });
	}

	if (demoActive) {
		return json({
			success: true,
			message: 'Demo mode: date normalization skipped (using canned demo dataset).',
			normalized: 0,
			dateColumns: [],
		});
	}

	// Continue with date normalization
	const llmConfig = resolveLlmConfig(orgSettings);
	if (!llmConfig) {
		error(400, 'LLM API settings not configured. Please update Settings.');
	}

	const columns = Object.keys(rowData[0]);

	// Analyze date columns with LLM
	const dateNormalizer = new DateNormalizer(llmConfig);
	const analysis = await dateNormalizer.analyzeDateColumns(rowData, columns);

	if (analysis.dateColumns.length === 0) {
		return json({
			success: true,
			message: 'No date columns detected',
			normalized: 0,
			dateColumns: [],
		});
	}

	// Normalize the data
	const normalizedData = dateNormalizer.normalizeRows(rowData, analysis.dateColumns);

	// Update rows in database
	const BATCH_SIZE = 100;
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		await Promise.all(
			batch.map((row, idx) =>
				db
					.update(datasetRows)
					.set({ data: normalizedData[i + idx] })
					.where(eq(datasetRows.id, row.id)),
			),
		);
	}

	// Build a map for quick lookup of date column info (using normalized names)
	const normalizeColName = (name: string) => name.replace(/\|/g, '').trim().toLowerCase();
	const dateColumnMap = new Map(
		analysis.dateColumns.map((d) => [normalizeColName(d.columnName), d]),
	);

	// Update schema to reflect date columns AND update sample values with normalized data
	const updatedSchema = (dataset.schema as ColumnSchema[]).map((col) => {
		const dateInfo = dateColumnMap.get(normalizeColName(col.name));
		if (dateInfo) {
			// Get new sample values from normalized data
			const newSamples = normalizedData
				.slice(0, 5)
				.map((row) => row[col.name])
				.filter((v, i, arr) => v != null && arr.indexOf(v) === i) // unique non-null values
				.slice(0, 5);

			return {
				...col,
				dtype: 'timestamp',
				isTimestamp: true,
				sampleValues: newSamples,
			};
		}
		return col;
	});

	await db.update(datasets).set({ schema: updatedSchema }).where(eq(datasets.id, params.id));

	return json({
		success: true,
		message: `Normalized ${analysis.dateColumns.length} date column(s)`,
		normalized: rows.length,
		dateColumns: analysis.dateColumns.map((d) => ({
			name: d.columnName,
			format: d.detectedFormat,
		})),
	});
};
