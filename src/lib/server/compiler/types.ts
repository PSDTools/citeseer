import type { AnalyticalPlan, BranchContext, DashboardSpec, DatasetProfile } from '$lib/types/toon';
import type { ForecastSelectionContext, ForecastStrategyDecision } from '$lib/server/forecast';

export interface QueryCompiler {
	compileQuestion(
		question: string,
		datasets: DatasetProfile[],
		branchContext?: BranchContext,
	): Promise<AnalyticalPlan>;
	fixSQL(context: {
		question: string;
		originalSQL: string;
		error: string;
		datasets: DatasetProfile[];
	}): Promise<{ sql: string; explanation: string } | null>;
	explainError(context: {
		question: string;
		sql: string;
		error?: string;
		rowCount?: number;
		datasets: DatasetProfile[];
	}): Promise<{ explanation: string; suggestions: string[] }>;
	realignQuestion(context: {
		question: string;
		reason: string;
		datasets: DatasetProfile[];
	}): Promise<{ suggestions: string[] }>;
	generateOverview(datasets: DatasetProfile[]): Promise<DashboardSpec>;
	generateExecutiveSummary(context: {
		question: string;
		panels: Array<{
			title: string;
			type: string;
			data: Record<string, unknown>[];
			columns: string[];
			narrative?: string;
			recommendations?: string[];
		}>;
	}): Promise<{
		dashboardSummary: string;
		panelSummaries: string[];
		insightNarratives?: Record<string, string>;
	}>;
	selectForecastStrategy?(
		context: ForecastSelectionContext,
	): Promise<ForecastStrategyDecision | null>;
}
