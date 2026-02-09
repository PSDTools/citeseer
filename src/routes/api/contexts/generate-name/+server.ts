import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, datasets, settings } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';

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

	// Get API key
	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	if (!orgSettings?.geminiApiKey) {
		error(400, 'Gemini API key not configured');
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

	try {
		const { GoogleGenerativeAI } = await import('@google/generative-ai');
		const genAI = new GoogleGenerativeAI(orgSettings.geminiApiKey);
		const model = genAI.getGenerativeModel({
			model: orgSettings.geminiModel || 'gemini-2.0-flash',
		});

		const prompt = `Generate a short, descriptive name (2-4 words max) for a data analysis context that groups these datasets together:

Datasets: ${datasetNames.join(', ')}

The name should capture the theme or purpose of analyzing these datasets together. Be concise and professional.

Respond with ONLY the name, nothing else.`;

		const result = await model.generateContent(prompt);
		const generatedName = result.response.text().trim();

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
