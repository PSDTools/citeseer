import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, settings, contextDatasets } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { GeminiCompiler } from '$lib/server/compiler/gemini';
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

	// Get API key
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	if (!orgSettings?.geminiApiKey) {
		error(400, 'Gemini API key not configured.');
	}

	// Get datasets from the context
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
		columns: d.schema as ColumnProfile[]
	}));

	const compiler = new GeminiCompiler({
		apiKey: orgSettings.geminiApiKey,
		model: orgSettings.geminiModel
	});

	const result = await compiler.realignQuestion({ question, reason, datasets: profiles });

	return json(result);
};
