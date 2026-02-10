import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, settings, contextDatasets, contexts } from '$lib/server/db';
import { eq, inArray, and } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { createQueryCompiler } from '$lib/server/llm/compiler';
import { resolveLlmConfig } from '$lib/server/llm/config';
import { matchDemoResponse, recordLiveDemoPattern } from '$lib/server/demo/config';
import { isDemoActive, isDemoBuild, getDataMode } from '$lib/server/demo/runtime';
import type { DatasetProfile, ColumnProfile } from '$lib/types/toon';

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
	const { question, reason, contextId } = body as {
		question: string;
		reason: string;
		contextId: string;
	};

	if (!question?.trim() || !reason?.trim() || !contextId?.trim()) {
		error(400, 'question, reason, and contextId are required');
	}

	const demoActive = isDemoActive();
	const shouldCaptureLiveToDemoFile = isDemoBuild && !demoActive;
	const dataMode = getDataMode();

	// Get API key
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	if (!demoActive && !resolveLlmConfig(orgSettings)) {
		error(400, 'LLM API settings not configured.');
	}

	// Get datasets from the context
	const [context] = await db
		.select({ id: contexts.id })
		.from(contexts)
		.where(
			and(eq(contexts.id, contextId), eq(contexts.orgId, org.id), eq(contexts.mode, dataMode)),
		);

	if (!context) {
		error(404, 'Context not found');
	}

	const ctxDatasetLinks = await db
		.select({ datasetId: contextDatasets.datasetId })
		.from(contextDatasets)
		.where(eq(contextDatasets.contextId, contextId));

	if (ctxDatasetLinks.length === 0) {
		error(400, 'No datasets in this context.');
	}

	const ctxDatasetIds = ctxDatasetLinks.map((l) => l.datasetId);
	const targetDatasets = await db
		.select()
		.from(datasets)
		.where(inArray(datasets.id, ctxDatasetIds));

	// Build dataset profiles
	const profiles: DatasetProfile[] = targetDatasets.map((d) => ({
		id: d.id,
		name: d.name,
		rowCount: d.rowCount,
		columns: d.schema as ColumnProfile[],
	}));

	if (demoActive) {
		const demo = await matchDemoResponse(question);
		return json(demo.realign);
	}

	const llmConfig = resolveLlmConfig(orgSettings);
	if (!llmConfig) {
		error(400, 'LLM API settings not configured.');
	}

	const compiler = createQueryCompiler(llmConfig);

	const result = await compiler.realignQuestion({ question, reason, datasets: profiles });

	if (shouldCaptureLiveToDemoFile) {
		await recordLiveDemoPattern(question, {
			realign: result,
		});
	}

	return json(result);
};
