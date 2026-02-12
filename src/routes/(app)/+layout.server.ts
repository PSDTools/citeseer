import { getUserOrganizations } from '$lib/server/auth';
import { contexts, dashboards, datasets, db } from '$lib/server/db';
import { redactEmailForDemo } from '$lib/server/demo/redaction';
import { getDataMode } from '$lib/server/demo/runtime';
import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Redirect to login if not authenticated
	if (!locals.user) {
		redirect(302, '/login');
	}

	// Get user's organizations
	const orgs = await getUserOrganizations(locals.user.id);

	// Redirect to onboarding if no organization
	if (orgs.length === 0) {
		redirect(302, '/onboarding');
	}

	// Use first org for now (later: org switcher)
	const currentOrg = orgs[0];
	const dataMode = getDataMode();

	// Load datasets for sidebar
	const orgDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			rowCount: datasets.rowCount,
		})
		.from(datasets)
		.where(eq(datasets.orgId, currentOrg.id));

	// Load contexts with their dashboards for sidebar (single query with join)
	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			dashboardId: dashboards.id,
			dashboardName: dashboards.name,
		})
		.from(contexts)
		.leftJoin(dashboards, and(eq(dashboards.contextId, contexts.id), eq(dashboards.mode, dataMode)))
		.where(and(eq(contexts.orgId, currentOrg.id), eq(contexts.mode, dataMode)))
		.orderBy(desc(contexts.createdAt), desc(dashboards.createdAt));

	// Group dashboards by context
	const contextMap = new Map<
		string,
		{ id: string; name: string; dashboards: { id: string; name: string }[] }
	>();

	for (const row of orgContexts) {
		if (!contextMap.has(row.id)) {
			contextMap.set(row.id, {
				id: row.id,
				name: row.name,
				dashboards: [],
			});
		}

		if (row.dashboardId && row.dashboardName) {
			contextMap.get(row.id)!.dashboards.push({
				id: row.dashboardId,
				name: row.dashboardName,
			});
		}
	}

	const contextsWithDashboards = Array.from(contextMap.values());

	return {
		user: {
			...locals.user,
			email: redactEmailForDemo(locals.user.email),
		},
		org: {
			id: currentOrg.id,
			name: currentOrg.name,
			slug: currentOrg.slug,
			role: currentOrg.role,
		},
		datasets: orgDatasets,
		contexts: contextsWithDashboards,
	};
};
