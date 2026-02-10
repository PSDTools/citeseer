import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, settings } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { matchDemoResponse, recordLiveDemoPattern } from '$lib/server/demo/config';
import { isDemoActive, isDemoBuild } from '$lib/server/demo/runtime';
import { resolveLlmConfig } from '$lib/server/llm/config';
import { generateTextWithLlm } from '$lib/server/llm/text';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}
	const org = orgs[0];

	const body = await request.json();
	const { datasetIds } = body as { datasetIds: string[] };
	const demoActive = isDemoActive();
	const shouldCaptureLiveToDemoFile = isDemoBuild && !demoActive;

	// Get API key
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	const llmConfig = resolveLlmConfig(orgSettings);
	if (!demoActive && !llmConfig) {
		error(400, 'LLM API settings not configured');
	}

	// Get dataset names
	let datasetNames: string[] = [];
	if (datasetIds?.length > 0) {
		const selectedDatasets = await db
			.select({ name: datasets.name })
			.from(datasets)
			.where(inArray(datasets.id, datasetIds));
		datasetNames = selectedDatasets.map((d) => d.name);
	}

	if (datasetNames.length === 0) {
		// Fallback if no datasets selected
		return json({ name: 'New Context' });
	}

	if (demoActive) {
		const demo = await matchDemoResponse(datasetNames.join(', '));
		return json(demo.contextName);
	}

	if (!llmConfig) {
		error(400, 'LLM API settings not configured');
	}

	try {
		const prompt = `Generate a short, descriptive name (2-4 words max) for a data analysis context that groups these datasets together:

Datasets: ${datasetNames.join(', ')}

The name should capture the theme or purpose of analyzing these datasets together. Be concise and professional.

Respond with ONLY the name, nothing else.`;

		const generatedName = (await generateTextWithLlm(llmConfig, { prompt, temperature: 0.2 }))
			.trim()
			.replace(/^["']|["']$/g, '');

		if (shouldCaptureLiveToDemoFile) {
			await recordLiveDemoPattern(datasetNames.join(', '), {
				contextName: { name: generatedName },
			});
		}

		return json({ name: generatedName });
	} catch (e) {
		console.error('Failed to generate name:', e);
		// Fallback to simple concatenation
		if (datasetNames.length === 1) {
			return json({ name: datasetNames[0] });
		}
		return json({ name: `${datasetNames[0]} Analysis` });
	}
};
