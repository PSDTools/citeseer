import type { PageServerLoad } from './$types';
import { db, datasets, settings } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getUserOrganizations } from '$lib/server/auth';
import { isDemoActive } from '$lib/server/demo/runtime';
import { redactEmailForDemo } from '$lib/server/demo/redaction';
import { hasLlmConfig } from '$lib/server/llm/config';

export const load: PageServerLoad = async ({ locals }) => {
	// If not logged in, return null
	if (!locals.user) {
		return {
			user: null,
			datasets: [],
			hasApiKey: false,
		};
	}

	// Get user's organization
	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		return {
			user: locals.user,
			datasets: [],
			hasApiKey: false,
		};
	}

	const org = orgs[0];

	// Get datasets
	const userDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			rowCount: datasets.rowCount,
		})
		.from(datasets)
		.where(eq(datasets.orgId, org.id));

	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	return {
		user: {
			...locals.user,
			email: redactEmailForDemo(locals.user.email),
		},
		datasets: userDatasets,
		hasApiKey: isDemoActive() || hasLlmConfig(orgSettings),
	};
};
