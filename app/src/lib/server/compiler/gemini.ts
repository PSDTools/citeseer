/**
 * Gemini compiler service - compiles natural language questions to analytical plans.
 */

import { GoogleGenAI } from '@google/genai';
import { parseToon, extractToon, ToonParseError } from './toon-parser';
import { getSystemPrompt, getOverviewPrompt } from './prompts';
import type { AnalyticalPlan, DashboardSpec, DatasetProfile } from '$lib/types/toon';

const MAX_RETRIES = 3;

export interface CompilerConfig {
	apiKey: string;
	model?: string;
}

export class GeminiCompiler {
	private client: GoogleGenAI;
	private model: string;

	constructor(config: CompilerConfig) {
		this.client = new GoogleGenAI({ apiKey: config.apiKey });
		this.model = config.model || 'gemini-2.0-flash';
	}

	/**
	 * Generate schema context string for the LLM from dataset profiles.
	 */
	static generateSchemaContext(datasets: DatasetProfile[]): string {
		if (datasets.length === 0) {
			return 'No datasets available.';
		}

		const lines: string[] = [];

		for (const dataset of datasets) {
			lines.push(`### Dataset: ${dataset.name} (${dataset.rowCount} rows)`);
			lines.push(`Dataset ID: ${dataset.id}`);
			lines.push('');
			lines.push('| Column | Type | Role | Sample Values | Notes |');
			lines.push('|--------|------|------|---------------|-------|');

			for (const col of dataset.columns) {
				const role = col.isTimestamp
					? 'timestamp'
					: col.isMetric
						? 'metric'
						: col.isEntityId
							? 'entity_id'
							: col.isCategorical
								? 'categorical'
								: 'text';
				const samples = col.sampleValues?.slice(0, 3).join(', ') || '';
				
				// Add notes for timestamp columns about their format
				let notes = '';
				if (col.isTimestamp && samples) {
					if (/^\d{4}-\d{2}$/.test(String(col.sampleValues?.[0] || ''))) {
						notes = 'YYYY-MM format, USE THIS for monthly time series';
					} else if (/^\d{4}-\d{2}-\d{2}/.test(String(col.sampleValues?.[0] || ''))) {
						notes = 'ISO date format';
					}
				}
				
				lines.push(`| ${col.name} | ${col.dtype} | ${role} | ${samples} | ${notes} |`);
			}

			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Compile a natural language question into an analytical plan.
	 */
	async compileQuestion(
		question: string,
		datasets: DatasetProfile[]
	): Promise<AnalyticalPlan> {
		const schemaContext = GeminiCompiler.generateSchemaContext(datasets);
		const systemPrompt = getSystemPrompt(schemaContext);

		let lastError: Error | null = null;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await this.client.models.generateContent({
					model: this.model,
					contents: [
						{
							role: 'user',
							parts: [{ text: systemPrompt + '\n\nQuestion: ' + question }]
						}
					],
					config: {
						temperature: 0.3,
						maxOutputTokens: 4096
					}
				});

				const text = response.text || '';
				const toonText = extractToon(text);
				const parsed = parseToon(toonText);

				// Validate it's a plan
				if (parsed._type !== 'plan') {
					throw new Error(`Expected @plan but got @${parsed._type || 'unknown'}`);
				}

				return parsed as unknown as AnalyticalPlan;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				console.error(`Attempt ${attempt + 1} failed:`, lastError.message);

				// Don't retry on parse errors - the model needs different prompting
				if (error instanceof ToonParseError) {
					break;
				}
			}
		}

		// Return a refusal plan on failure
		return {
			_type: 'plan',
			q: question,
			feasible: false,
			reason: `Failed to compile question: ${lastError?.message || 'Unknown error'}`,
			tables: [],
			suggestedInvestigations: ['Try rephrasing your question', 'Check if the required data is available']
		};
	}

	/**
	 * Fix a SQL query that resulted in an error.
	 */
	async fixSQL(context: {
		question: string;
		originalSQL: string;
		error: string;
		datasets: DatasetProfile[];
	}): Promise<{ sql: string; explanation: string } | null> {
		const schemaContext = GeminiCompiler.generateSchemaContext(context.datasets);
		
		const prompt = `You are a SQL expert. Fix this PostgreSQL query that resulted in an error.

## Original Question
"${context.question}"

## Broken SQL
\`\`\`sql
${context.originalSQL}
\`\`\`

## Error Message
${context.error}

## Database Schema
All data is in \`dataset_rows\` table:
- \`dataset_id\` (UUID) - the only real column
- \`data\` (JSONB) - contains ALL row values, access via \`data->>'Column Name'\`

**CRITICAL RULES:**
- EVERY column value MUST use \`data->>'column_name'\` syntax
- Column names with spaces need quotes: \`data->>'Column Name'\`
- For numeric: \`(data->>'column')::numeric\`
- Use \`WHERE dataset_id = 'DATASET_ID'\`

**COMMON FIX: Text values with currency/percentage symbols**
If you see "invalid input syntax for type numeric" errors, the text contains $, commas, or % signs.
Clean the text BEFORE casting using REGEXP_REPLACE:
\`\`\`sql
-- Clean currency like "$1,234.56" or percentages like "25%"
REGEXP_REPLACE(data->>'Column Name', '[^0-9.-]', '', 'g')::numeric
\`\`\`

## Available Columns
${schemaContext}

## Your Task
Fix the SQL to correct the error. Respond with ONLY a JSON object:
{
  "sql": "the corrected SQL query",
  "explanation": "brief explanation of what was wrong and how you fixed it"
}`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.2, maxOutputTokens: 2048 }
			});

			const text = response.text || '';
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (parsed.sql && typeof parsed.sql === 'string') {
					return {
						sql: parsed.sql,
						explanation: parsed.explanation || 'SQL corrected'
					};
				}
			}
		} catch (error) {
			console.error('Failed to fix SQL:', error);
		}

		return null;
	}

	/**
	 * Generate an overview dashboard for the available datasets.
	 */
	async generateOverview(datasets: DatasetProfile[]): Promise<DashboardSpec> {
		const schemaContext = GeminiCompiler.generateSchemaContext(datasets);
		const prompt = getOverviewPrompt(schemaContext);

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [
					{
						role: 'user',
						parts: [{ text: prompt }]
					}
				],
				config: {
					temperature: 0.3,
					maxOutputTokens: 4096
				}
			});

			const text = response.text || '';
			const toonText = extractToon(text);
			const parsed = parseToon(toonText);

			if (parsed._type !== 'dashboard') {
				throw new Error(`Expected @dashboard but got @${parsed._type || 'unknown'}`);
			}

			return parsed as unknown as DashboardSpec;
		} catch (error) {
			console.error('Failed to generate overview:', error);
			return {
				_type: 'dashboard',
				title: 'Data Overview',
				panels: []
			};
		}
	}

	/**
	 * Explain a query error and suggest fixes.
	 */
	async explainError(context: {
		question: string;
		sql: string;
		error?: string;
		rowCount?: number;
		datasets: DatasetProfile[];
	}): Promise<{ explanation: string; suggestions: string[] }> {
		const schemaContext = GeminiCompiler.generateSchemaContext(context.datasets);
		
		const prompt = `You are a helpful data analyst assistant. A user asked a question that resulted in an issue.

## User's Question
"${context.question}"

## Generated SQL
\`\`\`sql
${context.sql}
\`\`\`

## Issue
${context.error ? `SQL Error: ${context.error}` : `The query returned ${context.rowCount ?? 0} rows (no data).`}

## Available Data Schema
${schemaContext}

## Your Task
1. Briefly explain WHY this happened (1-2 sentences, be specific about likely causes)
2. Suggest 2-3 alternative questions the user could ask that WOULD work with this data

Respond in this exact JSON format:
{
  "explanation": "Brief explanation of why the query failed or returned no data",
  "suggestions": ["Alternative question 1", "Alternative question 2", "Alternative question 3"]
}

Be helpful and specific. Reference actual column names and values from the schema when possible.`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.3, maxOutputTokens: 1024 }
			});

			const text = response.text || '';
			// Extract JSON from response (may be wrapped in markdown)
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					explanation: parsed.explanation || 'Unable to determine the cause.',
					suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
				};
			}
		} catch (error) {
			console.error('Failed to explain error:', error);
		}

		return {
			explanation: 'The query did not return the expected results.',
			suggestions: ['Try rephrasing your question', 'Ask about available categories or values first']
		};
	}

	/**
	 * Generate executive summaries for dashboard panels based on actual query results.
	 * This analyzes the real data to produce actionable insights.
	 */
	async generateExecutiveSummary(context: {
		question: string;
		panels: Array<{
			title: string;
			type: string;
			data: Record<string, unknown>[];
			columns: string[];
		}>;
	}): Promise<{ dashboardSummary: string; panelSummaries: string[] }> {
		// Format panel data for the prompt
		const panelDataSummaries = context.panels.map((panel, i) => {
			const sampleRows = panel.data.slice(0, 10);
			const dataPreview = sampleRows.length > 0
				? JSON.stringify(sampleRows, null, 2)
				: 'No data';
			return `### Panel ${i + 1}: ${panel.title} (${panel.type})
Columns: ${panel.columns.join(', ')}
Row count: ${panel.data.length}
Data sample:
\`\`\`json
${dataPreview}
\`\`\``;
		}).join('\n\n');

		const prompt = `You are a senior data analyst writing executive summaries for business stakeholders.

## User's Question
"${context.question}"

## Query Results
${panelDataSummaries}

## Your Task
Analyze the actual data and write:
1. An overall executive summary (2-3 sentences) that directly answers the user's question with specific numbers and key insights
2. A brief summary for each panel (1 sentence each) highlighting the most important finding

**Guidelines:**
- Use specific numbers from the data (e.g., "Revenue increased 23% from $1.2M to $1.48M")
- Highlight trends, outliers, or notable patterns
- Be direct and actionable - what should the reader take away?
- If data shows concerning trends, mention them
- Keep language business-focused, not technical

Respond in this exact JSON format:
{
  "dashboardSummary": "Overall executive summary answering the question with key numbers and insights",
  "panelSummaries": ["Summary for panel 1", "Summary for panel 2", ...]
}`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.4, maxOutputTokens: 2048 }
			});

			const text = response.text || '';
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					dashboardSummary: parsed.dashboardSummary || '',
					panelSummaries: Array.isArray(parsed.panelSummaries) ? parsed.panelSummaries : []
				};
			}
		} catch (error) {
			console.error('Failed to generate executive summary:', error);
		}

		return {
			dashboardSummary: '',
			panelSummaries: []
		};
	}
}
