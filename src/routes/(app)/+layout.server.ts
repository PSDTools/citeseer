import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getUserOrganizations } from '$lib/server/auth';
import { db, datasets, dashboards, contexts } from '$lib/server/db';
import { eq, desc, and } from 'drizzle-orm';
import { getDataMode } from '$lib/server/demo/runtime';
import { redactEmailForDemo } from '$lib/server/demo/redaction';

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

	// Load contexts with their dashboards for sidebar
	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
		})
		.from(contexts)
		.where(and(eq(contexts.orgId, currentOrg.id), eq(contexts.mode, dataMode)))
		.orderBy(desc(contexts.createdAt));

	// Get dashboards per context
	const contextsWithDashboards = await Promise.all(
		orgContexts.map(async (ctx) => {
			const ctxDashboards = await db
				.select({
					id: dashboards.id,
					name: dashboards.name,
				})
				.from(dashboards)
				.where(and(eq(dashboards.contextId, ctx.id), eq(dashboards.mode, dataMode)))
				.orderBy(desc(dashboards.createdAt));
			return {
				...ctx,
				dashboards: ctxDashboards,
			};
		}),
	);

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
