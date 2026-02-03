import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, settings, queries, contextDatasets } from '$lib/server/db';
import type { AnalyticalPlan as SchemaAnalyticalPlan } from '$lib/server/db/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { GeminiCompiler } from '$lib/server/compiler/gemini';
import type { DatasetProfile, ColumnProfile, AnalyticalPlan, QueryResult } from '$lib/types/toon';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(400, 'No organization found');
	}
	const org = orgs[0];

	const body = await request.json();
	const { question, datasetIds, contextId } = body as { question: string; datasetIds?: string[]; contextId?: string };

	if (!question?.trim()) {
		error(400, 'Question is required');
	}

	// Get API key
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	if (!orgSettings?.geminiApiKey) {
		error(400, 'Gemini API key not configured. Please add it in Settings.');
	}

	// Get datasets for profiling
	let targetDatasets;

	if (contextId) {
		// Get datasets from the context
		const ctxDatasetLinks = await db
			.select({ datasetId: contextDatasets.datasetId })
			.from(contextDatasets)
			.where(eq(contextDatasets.contextId, contextId));

		if (ctxDatasetLinks.length === 0) {
			error(400, 'No datasets in this context. Please add datasets first.');
		}

		const ctxDatasetIds = ctxDatasetLinks.map((l) => l.datasetId);
		targetDatasets = await db
			.select()
			.from(datasets)
			.where(inArray(datasets.id, ctxDatasetIds));
	} else if (datasetIds?.length) {
		// Use specific dataset IDs
		targetDatasets = await db
			.select()
			.from(datasets)
			.where(inArray(datasets.id, datasetIds));
	} else {
		// Use all org datasets (fallback for dashboard)
		targetDatasets = await db
			.select()
			.from(datasets)
			.where(eq(datasets.orgId, org.id));
	}

	if (targetDatasets.length === 0) {
		error(400, 'No datasets found. Please upload a CSV first.');
	}

	// Build dataset profiles
	const profiles: DatasetProfile[] = targetDatasets.map((d) => ({
		id: d.id,
		name: d.name,
		rowCount: d.rowCount,
		columns: d.schema as ColumnProfile[]
	}));

	// Compile question
	const compiler = new GeminiCompiler({
		apiKey: orgSettings.geminiApiKey,
		model: orgSettings.geminiModel
	});

	const startTime = Date.now();
	const plan = await compiler.compileQuestion(question, profiles);
	const compilationMs = Date.now() - startTime;

	// If not feasible, return the plan without executing
	if (!plan.feasible) {
		// Store query record
		await db.insert(queries).values({
			orgId: org.id,
			userId: locals.user.id,
			question,
			plan: plan as SchemaAnalyticalPlan,
			status: 'refused',
			error: plan.reason,
			executionMs: compilationMs
		});

		return json({
			plan,
			results: null
		});
	}

	// Execute queries for each panel with auto-retry on SQL errors
	const results: Map<number, QueryResult> = new Map();
	const MAX_SQL_RETRIES = 3;

	// Track retry attempts for reporting
	const retryLog: { context: string; attempts: number; errors: string[]; fixed: boolean }[] = [];

	/**
	 * Execute a SQL query with automatic retry on failure.
	 * If the query fails, we ask the LLM to fix it and retry.
	 */
	async function executeWithRetry(sqlQuery: string, datasetId: string, context: string): Promise<{ result: QueryResult; finalSql: string; wasFixed: boolean; attempts: number }> {
		let currentSql = sqlQuery;
		let wasFixed = false;
		const errors: string[] = [];

		for (let attempt = 0; attempt < MAX_SQL_RETRIES; attempt++) {
			const result = await executeQuery(currentSql, datasetId);
			
			if (result.success) {
				if (attempt > 0) {
					retryLog.push({ context, attempts: attempt + 1, errors, fixed: true });
				}
				return { result, finalSql: currentSql, wasFixed, attempts: attempt + 1 };
			}

			errors.push(result.error || 'Unknown error');

			// Query failed - try to fix it if we have retries left
			if (attempt < MAX_SQL_RETRIES - 1) {
				console.log(`SQL error (attempt ${attempt + 1}/${MAX_SQL_RETRIES}): ${result.error}`);
				console.log(`Asking LLM to fix: ${context}`);
				
				const fix = await compiler.fixSQL({
					question,
					originalSQL: currentSql,
					error: result.error || 'Unknown error',
					datasets: profiles
				});

				if (fix) {
					console.log(`LLM fix applied: ${fix.explanation}`);
					currentSql = fix.sql;
					wasFixed = true;
					continue;
				} else {
					console.log('LLM could not generate a fix');
				}
			}

			// All retries exhausted or couldn't fix
			retryLog.push({ context, attempts: attempt + 1, errors, fixed: false });
			return { result, finalSql: currentSql, wasFixed, attempts: attempt + 1 };
		}

		// Shouldn't reach here, but just in case
		const result = await executeQuery(currentSql, datasetId);
		return { result, finalSql: currentSql, wasFixed, attempts: MAX_SQL_RETRIES };
	}

	try {
		// Execute main SQL if present
		if (plan.sql) {
			const { result, finalSql, wasFixed } = await executeWithRetry(plan.sql, targetDatasets[0].id, 'main query');
			results.set(-1, result);
			if (wasFixed) {
				plan.sql = finalSql; // Update the plan with fixed SQL
			}
		}

		// Execute panel SQLs
		if (plan.viz) {
			for (let i = 0; i < plan.viz.length; i++) {
				const panel = plan.viz[i];
				const panelSql = panel.sql || plan.sql;
				if (panelSql) {
					const { result, finalSql, wasFixed } = await executeWithRetry(panelSql, targetDatasets[0].id, `panel ${i}: ${panel.title}`);
					results.set(i, result);
					if (wasFixed && panel.sql) {
						panel.sql = finalSql; // Update panel with fixed SQL
					}
				}
			}
		}

		const executionMs = Date.now() - startTime;

		// Check if any queries failed or returned no data - get explanation
		let errorExplanation: { explanation: string; suggestions: string[]; retryInfo?: string } | null = null;
		const resultsArray = Array.from(results.values());
		const hasError = resultsArray.some(r => !r.success);
		const hasNoData = resultsArray.every(r => r.success && r.rowCount === 0);

		if (hasError || hasNoData) {
			const failedResult = resultsArray.find(r => !r.success || r.rowCount === 0);
			
			// Build retry info string
			const failedRetries = retryLog.filter(r => !r.fixed);
			const retryInfo = failedRetries.length > 0
				? `Attempted ${failedRetries[0].attempts} time(s) to fix the query automatically, but the issue persists.`
				: undefined;

			const explanation = await compiler.explainError({
				question,
				sql: plan.sql || '',
				error: failedResult?.error,
				rowCount: failedResult?.rowCount,
				datasets: profiles
			});

			errorExplanation = {
				...explanation,
				retryInfo
			};
		}

		// Store successful query
		await db.insert(queries).values({
			orgId: org.id,
			userId: locals.user.id,
			question,
			plan: plan as SchemaAnalyticalPlan,
			sql: plan.sql,
			status: hasError ? 'failed' : 'success',
			error: hasError ? resultsArray.find(r => !r.success)?.error : undefined,
			executionMs
		});

		// Generate executive summaries if we have successful results
		if (!hasError && !hasNoData && plan.viz && plan.viz.length > 0) {
			const panelData = plan.viz.map((panel, i) => {
				const result = results.get(i) || results.get(-1);
				return {
					title: panel.title,
					type: panel.type,
					data: result?.data || [],
					columns: result?.columns || []
				};
			});

			const summaries = await compiler.generateExecutiveSummary({
				question,
				panels: panelData
			});

			// Add summaries to plan
			plan.executiveSummary = summaries.dashboardSummary;
			if (summaries.panelSummaries.length > 0) {
				plan.viz.forEach((panel, i) => {
					if (summaries.panelSummaries[i]) {
						panel.summary = summaries.panelSummaries[i];
					}
				});
			}
		}

		return json({
			plan,
			results: Object.fromEntries(results),
			errorExplanation
		});
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Query execution failed';

		// Get explanation for the error
		const errorExplanation = await compiler.explainError({
			question,
			sql: plan.sql || '',
			error: errorMessage,
			datasets: profiles
		});

		// Store failed query
		await db.insert(queries).values({
			orgId: org.id,
			userId: locals.user.id,
			question,
			plan: plan as SchemaAnalyticalPlan,
			sql: plan.sql,
			status: 'failed',
			error: errorMessage,
			executionMs: Date.now() - startTime
		});

		return json({
			plan: {
				...plan,
				validationError: errorMessage
			},
			results: null,
			errorExplanation
		});
	}
};

async function executeQuery(sqlQuery: string, datasetId: string): Promise<QueryResult> {
	const startTime = Date.now();

	// Validate read-only
	const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'];
	const upperSql = sqlQuery.toUpperCase();
	for (const keyword of forbidden) {
		if (new RegExp(`\\b${keyword}\\b`).test(upperSql)) {
			return {
				success: false,
				data: [],
				columns: [],
				rowCount: 0,
				error: `Query contains forbidden keyword: ${keyword}`
			};
		}
	}

	try {
		// Replace DATASET_ID placeholder - handle both quoted and unquoted versions
		let finalSql = sqlQuery;
		// First replace quoted version (to avoid double quoting)
		finalSql = finalSql.replace(/'DATASET_ID'/g, `'${datasetId}'`);
		// Then replace unquoted version
		finalSql = finalSql.replace(/DATASET_ID/g, `'${datasetId}'`);

		// Execute using raw SQL - postgres-js returns rows directly
		const result = await db.execute(sql.raw(finalSql));

		// The result from postgres-js is the rows array directly
		const rows = Array.isArray(result) ? result : [];
		const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

		return {
			success: true,
			data: rows as Record<string, unknown>[],
			columns,
			rowCount: rows.length,
			executionMs: Date.now() - startTime
		};
	} catch (e) {
		return {
			success: false,
			data: [],
			columns: [],
			rowCount: 0,
			error: e instanceof Error ? e.message : 'Query failed',
			executionMs: Date.now() - startTime
		};
	}
}
