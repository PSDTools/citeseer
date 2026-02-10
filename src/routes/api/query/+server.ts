import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, settings, queries, contextDatasets, contexts } from '$lib/server/db';
import type { AnalyticalPlan as SchemaAnalyticalPlan } from '$lib/server/db/schema';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { createQueryCompiler } from '$lib/server/llm/compiler';
import { resolveLlmConfig } from '$lib/server/llm/config';
import { matchDemoResponse, recordLiveDemoPattern } from '$lib/server/demo/config';
import { isDemoActive, isDemoBuild, getDataMode } from '$lib/server/demo/runtime';
import type {
	DatasetProfile,
	ColumnProfile,
	AnalyticalPlan,
	QueryResult,
	BranchContext,
} from '$lib/types/toon';

const SQL_EXECUTION_TIMEOUT_MS = 20_000;
const DEMO_SIMULATED_MIN_MS = 5_200;
const DEMO_SIMULATED_JITTER_MS = 2_600;

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
	const { question, datasetIds, contextId, branchContext } = body as {
		question: string;
		datasetIds?: string[];
		contextId?: string;
		branchContext?: BranchContext;
	};

	if (!question?.trim()) {
		error(400, 'Question is required');
	}

	const demoActive = isDemoActive();
	const shouldCaptureLiveToDemoFile = isDemoBuild && !demoActive;
	const dataMode = getDataMode();

	// Get settings (used for live mode)
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	// Get datasets for profiling
	let targetDatasets;

	if (contextId) {
		const [context] = await db
			.select({ id: contexts.id })
			.from(contexts)
			.where(
				and(eq(contexts.id, contextId), eq(contexts.orgId, org.id), eq(contexts.mode, dataMode)),
			);
		if (!context) {
			error(404, 'Context not found');
		}

		// Get datasets from the context
		const ctxDatasetLinks = await db
			.select({ datasetId: contextDatasets.datasetId })
			.from(contextDatasets)
			.where(eq(contextDatasets.contextId, contextId));

		if (ctxDatasetLinks.length === 0) {
			error(400, 'No datasets in this context. Please add datasets first.');
		}

		const ctxDatasetIds = ctxDatasetLinks.map((l) => l.datasetId);
		targetDatasets = await db.select().from(datasets).where(inArray(datasets.id, ctxDatasetIds));
	} else if (datasetIds?.length) {
		// Use specific dataset IDs
		targetDatasets = await db.select().from(datasets).where(inArray(datasets.id, datasetIds));
	} else {
		// Use all org datasets (fallback for dashboard)
		targetDatasets = await db.select().from(datasets).where(eq(datasets.orgId, org.id));
	}

	if (targetDatasets.length === 0) {
		error(400, 'No datasets found. Please upload a CSV first.');
	}

	// Build dataset profiles
	const profiles: DatasetProfile[] = targetDatasets.map((d) => ({
		id: d.id,
		name: d.name,
		rowCount: d.rowCount,
		columns: d.schema as ColumnProfile[],
	}));

	if (demoActive) {
		// Keep demo UX feeling realistic so the staged loading steps are visible.
		const simulatedDelay =
			DEMO_SIMULATED_MIN_MS + Math.floor(Math.random() * DEMO_SIMULATED_JITTER_MS);
		await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

		let demo;
		try {
			demo = await matchDemoResponse(question);
		} catch (err) {
			console.error('Demo response lookup failed, using emergency fallback:', err);
			demo = buildEmergencyDemoResponse(question);
		}

		const plan = structuredClone(demo.query.plan);
		const results = structuredClone(demo.query.results);
		const resultsArray = Object.values(results);
		const hasError = resultsArray.some((result) => !result.success);

		await db.insert(queries).values({
			orgId: org.id,
			userId: locals.user.id,
			question,
			plan: plan as SchemaAnalyticalPlan,
			sql: plan.sql,
			status: !plan.feasible ? 'refused' : hasError ? 'failed' : 'success',
			error: !plan.feasible
				? plan.reason
				: hasError
					? resultsArray.find((r) => !r.success)?.error
					: undefined,
			executionMs: 1,
		});

		return json({
			plan,
			results,
			errorExplanation: demo.query.errorExplanation ?? null,
		});
	}

	const llmConfig = resolveLlmConfig(orgSettings);
	if (!llmConfig) {
		error(400, 'LLM API settings not configured. Please update Settings.');
	}

	// Compile question
	const compiler = createQueryCompiler(llmConfig);

	const startTime = Date.now();
	const plan = await compiler.compileQuestion(question, profiles, branchContext);
	const compilationMs = Date.now() - startTime;

	// Note: Filter injection is now handled by the compiler via branch context prompts
	// The compiler sees the parentSql and filter values, and generates SQL with proper WHERE clauses

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
			executionMs: compilationMs,
		});

		if (shouldCaptureLiveToDemoFile) {
			await recordLiveDemoPattern(question, {
				query: {
					plan,
					results: {},
				},
			});
		}

		return json({
			plan,
			results: null,
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
	async function executeWithRetry(
		sqlQuery: string,
		datasetId: string,
		context: string,
	): Promise<{ result: QueryResult; finalSql: string; wasFixed: boolean; attempts: number }> {
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
			const isTimeoutError =
				/timed out|statement timeout|canceling statement due to statement timeout/i.test(
					result.error || '',
				);

			// Timeout errors should fail fast instead of entering LLM fix loops.
			if (isTimeoutError) {
				retryLog.push({ context, attempts: attempt + 1, errors, fixed: false });
				return { result, finalSql: currentSql, wasFixed, attempts: attempt + 1 };
			}

			// Query failed - try to fix it if we have retries left
			if (attempt < MAX_SQL_RETRIES - 1) {
				console.log(`SQL error (attempt ${attempt + 1}/${MAX_SQL_RETRIES}): ${result.error}`);
				console.log(`Asking LLM to fix: ${context}`);

				const fix = await compiler.fixSQL({
					question,
					originalSQL: currentSql,
					error: result.error || 'Unknown error',
					datasets: profiles,
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
			const { result, finalSql, wasFixed } = await executeWithRetry(
				plan.sql,
				targetDatasets[0].id,
				'main query',
			);
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
					const { result, finalSql, wasFixed } = await executeWithRetry(
						panelSql,
						targetDatasets[0].id,
						`panel ${i}: ${panel.title}`,
					);
					results.set(i, result);
					if (wasFixed && panel.sql) {
						panel.sql = finalSql; // Update panel with fixed SQL
					}
				}
			}
		}

		const executionMs = Date.now() - startTime;

		// Check if any queries failed or returned no data - get explanation
		let errorExplanation: {
			explanation: string;
			suggestions: string[];
			retryInfo?: string;
		} | null = null;
		const resultsArray = Array.from(results.values());
		const hasError = resultsArray.some((r) => !r.success);
		const hasNoData = resultsArray.every((r) => r.success && r.rowCount === 0);

		if (hasError || hasNoData) {
			const failedResult = resultsArray.find((r) => !r.success || r.rowCount === 0);

			// Build retry info string
			const failedRetries = retryLog.filter((r) => !r.fixed);
			const retryInfo =
				failedRetries.length > 0
					? `Attempted ${failedRetries[0].attempts} time(s) to fix the query automatically, but the issue persists.`
					: undefined;

			const explanation = await compiler.explainError({
				question,
				sql: plan.sql || '',
				error: failedResult?.error,
				rowCount: failedResult?.rowCount,
				datasets: profiles,
			});

			errorExplanation = {
				...explanation,
				retryInfo,
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
			error: hasError ? resultsArray.find((r) => !r.success)?.error : undefined,
			executionMs,
		});

		// Generate executive summaries if we have successful results
		if (!hasError && !hasNoData && plan.viz && plan.viz.length > 0) {
			const panelData = plan.viz.map((panel, i) => {
				const result = results.get(i) || results.get(-1);
				return {
					title: panel.title,
					type: panel.type,
					data: result?.data || [],
					columns: result?.columns || [],
				};
			});

			const summaries = await compiler.generateExecutiveSummary({
				question,
				panels: panelData,
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

		const serializedResults = Object.fromEntries(results);

		if (shouldCaptureLiveToDemoFile) {
			await recordLiveDemoPattern(question, {
				query: {
					plan,
					results: serializedResults,
					errorExplanation,
				},
			});
		}

		return json({
			plan,
			results: serializedResults,
			errorExplanation,
		});
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Query execution failed';

		// Get explanation for the error
		const errorExplanation = await compiler.explainError({
			question,
			sql: plan.sql || '',
			error: errorMessage,
			datasets: profiles,
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
			executionMs: Date.now() - startTime,
		});

		if (shouldCaptureLiveToDemoFile) {
			await recordLiveDemoPattern(question, {
				query: {
					plan: {
						...plan,
						validationError: errorMessage,
					},
					results: {},
					errorExplanation,
				},
			});
		}

		return json({
			plan: {
				...plan,
				validationError: errorMessage,
			},
			results: null,
			errorExplanation,
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
				error: `Query contains forbidden keyword: ${keyword}`,
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

		// Execute using raw SQL with a hard timeout so a stuck query does not freeze the UI.
		const result = await withTimeout(
			db.execute(sql.raw(finalSql)),
			SQL_EXECUTION_TIMEOUT_MS,
			`Query timed out after ${Math.round(SQL_EXECUTION_TIMEOUT_MS / 1000)}s`,
		);

		// The result from postgres-js is the rows array directly
		const rows = Array.isArray(result) ? result : [];
		const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

		return {
			success: true,
			data: rows as Record<string, unknown>[],
			columns,
			rowCount: rows.length,
			executionMs: Date.now() - startTime,
		};
	} catch (e) {
		return {
			success: false,
			data: [],
			columns: [],
			rowCount: 0,
			error: e instanceof Error ? e.message : 'Query failed',
			executionMs: Date.now() - startTime,
		};
	}
}

function buildEmergencyDemoResponse(question: string): {
	query: {
		plan: AnalyticalPlan;
		results: Record<number, QueryResult>;
		errorExplanation: null;
	};
} {
	const plan: AnalyticalPlan = {
		_type: 'plan',
		q: question,
		feasible: true,
		tables: ['demo_data'],
		sql: "SELECT 'demo' as status, 1 as value",
		viz: [
			{
				_type: 'panel',
				type: 'stat',
				title: 'Demo Insight',
				value: 'value',
				description: 'A safe fallback response used to keep the live demo running smoothly.',
			},
		],
		suggestedInvestigations: [
			'Show me top-level trends in this dataset',
			'Break this down by supplier',
		],
		executiveSummary:
			'The requested view is available in this demo environment. Here is a summary fallback so the flow can continue seamlessly.',
	};

	const results: Record<number, QueryResult> = {};
	results[-1] = {
		success: true,
		data: [{ status: 'demo', value: 1 }],
		columns: ['status', 'value'],
		rowCount: 1,
		executionMs: 1,
	};
	results[0] = {
		success: true,
		data: [{ status: 'demo', value: 1 }],
		columns: ['status', 'value'],
		rowCount: 1,
		executionMs: 1,
	};

	return {
		query: {
			plan,
			results,
			errorExplanation: null,
		},
	};
}

async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}
