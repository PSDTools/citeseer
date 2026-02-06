/**
 * LLM-assisted date normalization service.
 * Analyzes column data to identify date/time patterns and normalizes them to ISO format.
 */

import { GoogleGenAI } from '@google/genai';

export interface DateColumnInfo {
	columnName: string;
	detectedFormat: string;
	isDate: boolean;
	isDateTime: boolean;
}

export interface DateAnalysisResult {
	dateColumns: DateColumnInfo[];
}

const DATE_ANALYSIS_PROMPT = `You are a data analyst. Analyze these column samples to identify which columns contain dates or timestamps.

For each column, determine:
1. If it contains date/time data
2. The format pattern (e.g., "YYYY-MM-DD", "MM/DD/YYYY", "DD-Mon-YYYY", "YYYY-MM", etc.)

Respond with a JSON array only, no markdown:
[{"columnName": "...", "detectedFormat": "...", "isDate": true/false, "isDateTime": true/false}]

Only include columns that ARE dates. If a column is not a date, do not include it.

Column samples:
`;

export class DateNormalizer {
	private client: GoogleGenAI;
	private model: string;

	constructor(apiKey: string, model?: string) {
		this.client = new GoogleGenAI({ apiKey });
		this.model = model || 'gemini-2.0-flash';
	}

	/**
	 * Analyze columns to detect date formats using LLM.
	 */
	async analyzeDateColumns(
		rows: Record<string, unknown>[],
		columns: string[]
	): Promise<DateAnalysisResult> {
		const sampleSize = Math.min(5, rows.length);
		const sampleRows = rows.slice(0, sampleSize);

		// Build sample data for LLM
		const columnSamples: string[] = [];
		for (const col of columns) {
			const samples = sampleRows
				.map((r) => r[col])
				.filter((v) => v != null)
				.map((v) => String(v));
			if (samples.length > 0) {
				columnSamples.push(`${col}: ${samples.join(', ')}`);
			}
		}

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [
					{
						role: 'user',
						parts: [{ text: DATE_ANALYSIS_PROMPT + columnSamples.join('\n') }]
					}
				],
				config: {
					temperature: 0.1,
					maxOutputTokens: 1024
				}
			});

			const text = response.text || '[]';
			// Extract JSON from response
			const jsonMatch = text.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				const dateColumns = JSON.parse(jsonMatch[0]) as DateColumnInfo[];
				console.log('LLM detected date columns:', dateColumns);
				return { dateColumns };
			}
		} catch (e) {
			console.error('Date analysis failed:', e);
		}

		return { dateColumns: [] };
	}

	/**
	 * Normalize date values in rows to ISO format.
	 */
	normalizeRows(
		rows: Record<string, unknown>[],
		dateColumns: DateColumnInfo[]
	): Record<string, unknown>[] {
		if (dateColumns.length === 0) return rows;

		// Build a map of normalized column names (stripped of pipes/spaces) to original names
		const normalizedNameToOriginal = new Map<string, string>();
		if (rows.length > 0) {
			for (const key of Object.keys(rows[0])) {
				const normalized = this.normalizeColumnName(key);
				normalizedNameToOriginal.set(normalized, key);
			}
		}

		// Build a map of date column info keyed by normalized name
		const dateColumnMap = new Map<string, DateColumnInfo>();
		for (const d of dateColumns) {
			const normalized = this.normalizeColumnName(d.columnName);
			dateColumnMap.set(normalized, d);
		}

		return rows.map((row) => {
			const normalized = { ...row };

			for (const [key, value] of Object.entries(row)) {
				const normKey = this.normalizeColumnName(key);
				const dateInfo = dateColumnMap.get(normKey);
				if (dateInfo && value != null) {
					const normalizedDate = this.normalizeDate(String(value), dateInfo.detectedFormat);
					if (normalizedDate) {
						normalized[key] = normalizedDate;
					}
				}
			}

			return normalized;
		});
	}

	/**
	 * Normalize a column name for matching (strip pipes, trim spaces, lowercase).
	 */
	private normalizeColumnName(name: string): string {
		return name
			.replace(/\|/g, '') // Remove pipes
			.trim() // Trim whitespace
			.toLowerCase(); // Case-insensitive
	}

	/**
	 * Attempt to normalize a date string to ISO format.
	 */
	private normalizeDate(value: string, detectedFormat?: string): string | null {
		const trimmed = value.trim();
		if (!trimmed) return null;

		// Already ISO format
		if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
			return trimmed;
		}

		// Handle YYYYMM format (e.g., 202401 -> 2024-01)
		if (detectedFormat === 'YYYYMM' || /^\d{6}$/.test(trimmed)) {
			const year = trimmed.slice(0, 4);
			const month = trimmed.slice(4, 6);
			return `${year}-${month}`;
		}

		// Handle YYYYMMDD format (e.g., 20240115 -> 2024-01-15)
		if (detectedFormat === 'YYYYMMDD' || /^\d{8}$/.test(trimmed)) {
			const year = trimmed.slice(0, 4);
			const month = trimmed.slice(4, 6);
			const day = trimmed.slice(6, 8);
			return `${year}-${month}-${day}`;
		}

		// Try common formats
		const formats = [
			// MM/DD/YYYY
			{
				pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
				transform: (m: RegExpMatchArray) =>
					`${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
			},
			// DD/MM/YYYY (if day > 12)
			{
				pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
				transform: (m: RegExpMatchArray) => {
					const day = parseInt(m[1]);
					if (day > 12) {
						return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
					}
					return null;
				}
			},
			// DD-MM-YYYY
			{
				pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
				transform: (m: RegExpMatchArray) =>
					`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
			},
			// YYYY/MM/DD
			{
				pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
				transform: (m: RegExpMatchArray) =>
					`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
			},
			// Month name formats: "Jan 15, 2024" or "15 Jan 2024"
			{
				pattern: /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/,
				transform: (m: RegExpMatchArray) => {
					const month = this.monthToNumber(m[1]);
					if (month) return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
					return null;
				}
			},
			{
				pattern: /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/,
				transform: (m: RegExpMatchArray) => {
					const month = this.monthToNumber(m[2]);
					if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
					return null;
				}
			},
			// YYYY-MM (year-month only) - keep as is
			{
				pattern: /^(\d{4})-(\d{1,2})$/,
				transform: (m: RegExpMatchArray) => `${m[1]}-${m[2].padStart(2, '0')}`
			},
			// MM/YYYY - convert to YYYY-MM
			{
				pattern: /^(\d{1,2})\/(\d{4})$/,
				transform: (m: RegExpMatchArray) => `${m[2]}-${m[1].padStart(2, '0')}`
			}
		];

		for (const { pattern, transform } of formats) {
			const match = trimmed.match(pattern);
			if (match) {
				const result = transform(match);
				if (result) return result;
			}
		}

		// Fallback: try native Date parsing
		const parsed = new Date(trimmed);
		if (!isNaN(parsed.getTime())) {
			return parsed.toISOString().split('T')[0];
		}

		// Return original if we can't parse
		return trimmed;
	}

	private monthToNumber(month: string): string | null {
		const months: Record<string, string> = {
			jan: '01',
			january: '01',
			feb: '02',
			february: '02',
			mar: '03',
			march: '03',
			apr: '04',
			april: '04',
			may: '05',
			jun: '06',
			june: '06',
			jul: '07',
			july: '07',
			aug: '08',
			august: '08',
			sep: '09',
			sept: '09',
			september: '09',
			oct: '10',
			october: '10',
			nov: '11',
			november: '11',
			dec: '12',
			december: '12'
		};
		return months[month.toLowerCase()] || null;
	}
}
